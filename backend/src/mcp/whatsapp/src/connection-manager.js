const { default: makeWASocket, DisconnectReason, Browsers, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const { createClient } = require('redis');
const { usePostgresAuthState, clearAuthState, getTenantAuth } = require('./postgres-auth-state');
const { handleInboundMessages } = require('./message-handler');
const { formatOutboundMediaMessage } = require('./media-handler');

class WhatsAppConnectionManager {
  constructor(dbQuery) {
    this.dbQuery = dbQuery;
    // In-memory tenant socket map: tenantId -> { sock, status, qr, phoneNumber, retryCount, reconnectTimer }
    this.sessions = new Map();
    this.redisPublisher = null;
    this.initRedis();
  }

  /**
   * Initializes Redis client for publishing real-time QR and state events
   */
  async initRedis() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      this.redisPublisher = createClient({ url: redisUrl });

      this.redisPublisher.on('error', (err) => {
        // Log once, do not crash if Redis is offline
        if (!this._redisErrorLogged) {
          console.warn('[WhatsApp Redis] Redis connection notice (pub/sub fallback active):', err.message);
          this._redisErrorLogged = true;
        }
      });

      this.redisPublisher.on('ready', () => {
        console.log('✅ [WhatsApp Redis] Pub/Sub client connected');
        this._redisErrorLogged = false;
      });

      await this.redisPublisher.connect();
    } catch (err) {
      console.warn('[WhatsApp Redis] Redis unavailable on startup, using in-memory state:', err.message);
    }
  }

  /**
   * Broadcasts an event to Redis channel for the tenant
   */
  async publishEvent(tenantId, payload) {
    if (!this.redisPublisher || !this.redisPublisher.isOpen) return;
    try {
      const channel = `whatsapp:events:${tenantId}`;
      await this.redisPublisher.publish(channel, JSON.stringify(payload));
    } catch (err) {
      console.warn(`[WhatsApp Redis] Failed publishing event to ${tenantId}:`, err.message);
    }
  }

  /**
   * Formats a raw phone number or JID to standard WhatsApp JID
   */
  formatJid(raw) {
    if (!raw) return '';
    const clean = raw.replace(/[^\d@a-zA-Z.-]/g, '');
    if (clean.includes('@s.whatsapp.net')) return clean;
    if (clean.includes('@g.us')) return clean;
    const digitsOnly = clean.replace(/\D/g, '');
    return `${digitsOnly}@s.whatsapp.net`;
  }

  /**
   * Initiates or restores a Baileys connection for a tenant
   *
   * @param {string} tenantId - Tenant UUID
   * @param {boolean} [forceNew=false] - If true, discards existing session creds to trigger fresh QR
   * @returns {Promise<{ status: string, qr?: string, phoneNumber?: string }>}
   */
  async connectTenant(tenantId, forceNew = false) {
    if (!tenantId) {
      throw new Error('tenantId is required to connect WhatsApp.');
    }

    const existing = this.sessions.get(tenantId);
    if (!forceNew && existing) {
      if (existing.status === 'connected' && existing.sock) {
        return {
          status: 'connected',
          phoneNumber: existing.phoneNumber,
        };
      }
      // If socket is already active and currently generating or displaying QR, return it
      if (existing.sock && (existing.status === 'connecting' || existing.status === 'qr_pending')) {
        return {
          status: existing.status,
          qr: existing.qr,
          phoneNumber: existing.phoneNumber,
        };
      }
    }

    // Clean up any existing socket before reconnecting
    if (existing?.sock) {
      try {
        if (existing.reconnectTimer) clearTimeout(existing.reconnectTimer);
        existing.sock.ev.removeAllListeners();
        existing.sock.end(undefined);
      } catch (e) {
        // Ignore cleanup error
      }
    }

    if (forceNew) {
      const tenantAuth = getTenantAuth(tenantId);
      tenantAuth.isPairingCodePending = false;
      clearAuthState(tenantId);
      try {
        await this.dbQuery(
          `DELETE FROM whatsapp_auth_keys WHERE tenant_id = $1`,
          [tenantId],
          tenantId
        );
        await this.dbQuery(
          `UPDATE whatsapp_sessions SET creds_data = NULL, status = 'connecting' WHERE tenant_id = $1`,
          [tenantId],
          tenantId
        );
      } catch (e) {
        console.warn(`[WhatsApp Manager] Warning clearing old keys for tenant ${tenantId}:`, e.message);
      }
    }

    // Create session record in DB if not present
    await this.dbQuery(
      `INSERT INTO whatsapp_sessions (tenant_id, status, updated_at)
       VALUES ($1, 'connecting', NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         status = 'connecting',
         updated_at = NOW()`,
      [tenantId],
      tenantId
    );

    // Initialize Postgres Auth State
    const { state, saveCreds } = await usePostgresAuthState(tenantId, this.dbQuery);

    const sessionData = {
      sock: null,
      status: 'connecting',
      qr: null,
      phoneNumber: null,
      retryCount: 0,
      reconnectTimer: null,
    };
    this.sessions.set(tenantId, sessionData);

    const silentLogger = pino({ level: 'silent' });

    // Fetch latest Baileys protocol version
    let version = [2, 3000, 1043857760];
    try {
      const v = await fetchLatestBaileysVersion();
      if (v?.version) version = v.version;
    } catch (e) {}

    // Initialize Baileys WASocket
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: silentLogger,
      browser: Browsers.macOS('Chrome'),
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
    });

    sessionData.sock = sock;

    // 1. Credentials update listener
    sock.ev.on('creds.update', saveCreds);

    // 2. Connection update listener
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // QR Code received
      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, {
            margin: 2,
            width: 300,
            color: { dark: '#000000', light: '#ffffff' },
          });

          sessionData.qr = qrDataUrl;
          sessionData.status = 'qr_pending';

          await this.dbQuery(
            `UPDATE whatsapp_sessions 
             SET status = 'qr_pending', last_qr_at = NOW(), updated_at = NOW()
             WHERE tenant_id = $1`,
            [tenantId],
            tenantId
          );

          await this.publishEvent(tenantId, {
            event: 'qr',
            qr: qrDataUrl,
            status: 'qr_pending',
            tenantId,
          });
        } catch (qrErr) {
          console.error(`[WhatsApp Manager] Error generating QR code image for tenant ${tenantId}:`, qrErr.message);
        }
      }

      // Connection opened successfully
      if (connection === 'open') {
        const rawPhone = sock.user?.id || '';
        const cleanPhone = rawPhone.split(':')[0]?.split('@')[0] || '';

        sessionData.status = 'connected';
        sessionData.phoneNumber = cleanPhone;
        sessionData.qr = null;
        sessionData.retryCount = 0;

        console.log(`✅ [WhatsApp Manager] Tenant ${tenantId} connected as ${cleanPhone}`);

        await this.dbQuery(
          `UPDATE whatsapp_sessions 
           SET status = 'connected', phone_number = $1, connected_at = NOW(), updated_at = NOW()
           WHERE tenant_id = $2`,
          [cleanPhone, tenantId],
          tenantId
        );

        await this.publishEvent(tenantId, {
          event: 'status',
          status: 'connected',
          phoneNumber: cleanPhone,
          tenantId,
        });
      }

      // Connection closed
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const isRestartRequired = statusCode === DisconnectReason.restartRequired;
        const isTimedOut = statusCode === DisconnectReason.timedOut;

        console.warn(`⚠️ [WhatsApp Manager] Tenant ${tenantId} disconnected. StatusCode: ${statusCode}, isLoggedOut: ${isLoggedOut}, isRestartRequired: ${isRestartRequired}, isTimedOut: ${isTimedOut}`);

        // Mark previous socket as closed
        sessionData.sock = null;
        if (sessionData.reconnectTimer) {
          clearTimeout(sessionData.reconnectTimer);
          sessionData.reconnectTimer = null;
        }

        if (isLoggedOut) {
          // Explicit logout by user from mobile device
          sessionData.status = 'disconnected';
          sessionData.qr = null;
          sessionData.phoneNumber = null;
          this.sessions.delete(tenantId);

          await this.dbQuery(
            `UPDATE whatsapp_sessions 
             SET status = 'disconnected', creds_data = NULL, disconnected_at = NOW(), updated_at = NOW()
             WHERE tenant_id = $1`,
            [tenantId],
            tenantId
          );

          await this.dbQuery(
            `DELETE FROM whatsapp_auth_keys WHERE tenant_id = $1`,
            [tenantId],
            tenantId
          );

          await this.publishEvent(tenantId, {
            event: 'status',
            status: 'disconnected',
            reason: 'logged_out',
            tenantId,
          });
        } else if (isRestartRequired) {
          // StatusCode 515: Phone just scanned QR and approved pairing!
          // WhatsApp server requested stream restart to complete handshake.
          // Reconnect IMMEDIATELY without delay using the newly authorized credentials!
          console.log(`⚡ [WhatsApp Manager] Code 515 (restartRequired) for tenant ${tenantId}. Reconnecting immediately with authorized credentials...`);
          sessionData.status = 'connecting';
          this.connectTenant(tenantId, false).catch((err) => {
            console.error(`[WhatsApp Manager] Immediate reconnection error on 515 for tenant ${tenantId}:`, err.message);
          });
        } else if (isTimedOut && sessionData.status !== 'connected') {
          // QR code expired (408). Auto-regenerate fresh QR code automatically so user does not need to click reload!
          console.log(`🔄 [WhatsApp Manager] QR expired (408) for tenant ${tenantId}. Auto-regenerating fresh pairing QR code...`);
          sessionData.qr = null;
          sessionData.status = 'connecting';
          this.connectTenant(tenantId, true).catch((err) => {
            console.error(`[WhatsApp Manager] Auto-refresh QR error on timeout for tenant ${tenantId}:`, err.message);
          });
        } else {
          // Temporary drop — attempt auto-reconnect with exponential backoff (max 5 retries)
          sessionData.status = 'connecting';
          const MAX_RETRIES = 5;
          if (sessionData.retryCount < MAX_RETRIES) {
            sessionData.retryCount += 1;
            const backoffMs = Math.min(2000 * Math.pow(2, sessionData.retryCount - 1), 30000);

            console.log(`[WhatsApp Manager] Reconnecting tenant ${tenantId} (attempt ${sessionData.retryCount}/${MAX_RETRIES} in ${backoffMs}ms)...`);

            sessionData.reconnectTimer = setTimeout(() => {
              this.connectTenant(tenantId, false).catch((err) => {
                console.error(`[WhatsApp Manager] Reconnection error for tenant ${tenantId}:`, err.message);
              });
            }, backoffMs);
          } else {
            console.error(`❌ [WhatsApp Manager] Max reconnection retries exceeded for tenant ${tenantId}.`);
            sessionData.status = 'disconnected';

            await this.dbQuery(
              `UPDATE whatsapp_sessions SET status = 'disconnected', updated_at = NOW() WHERE tenant_id = $1`,
              [tenantId],
              tenantId
            );

            await this.publishEvent(tenantId, {
              event: 'status',
              status: 'disconnected',
              reason: 'max_retries_exceeded',
              tenantId,
            });
          }
        }
      }
    });

    // 3. Inbound messages listener
    sock.ev.on('messages.upsert', (event) => {
      handleInboundMessages({
        tenantId,
        sock,
        event,
        dbQuery: this.dbQuery,
      });
    });

    return {
      status: sessionData.status,
      qr: sessionData.qr,
      phoneNumber: sessionData.phoneNumber,
    };
  }

  /**
   * Disconnects and unpairs tenant's WhatsApp
   */
  async disconnectTenant(tenantId) {
    const session = this.sessions.get(tenantId);
    if (session?.sock) {
      try {
        if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
        session.sock.ev.removeAllListeners();
        await session.sock.logout().catch(() => {});
        session.sock.end(undefined);
      } catch (e) {
        console.warn(`[WhatsApp Manager] Cleanup exception on disconnect for ${tenantId}:`, e.message);
      }
    }

    this.sessions.delete(tenantId);
    clearAuthState(tenantId);

    await this.dbQuery(
      `UPDATE whatsapp_sessions 
       SET status = 'disconnected', creds_data = NULL, disconnected_at = NOW(), updated_at = NOW()
       WHERE tenant_id = $1`,
      [tenantId],
      tenantId
    );

    await this.dbQuery(
      `DELETE FROM whatsapp_auth_keys WHERE tenant_id = $1`,
      [tenantId],
      tenantId
    );

    await this.publishEvent(tenantId, {
      event: 'status',
      status: 'disconnected',
      tenantId,
    });

    return { status: 'disconnected', message: 'WhatsApp session disconnected successfully.' };
  }

  /**
   * Returns current connection status
   */
  async getStatus(tenantId) {
    const inMem = this.sessions.get(tenantId);

    // Fetch database state for this specific tenant
    let dbRow = {};
    try {
      const dbRes = await this.dbQuery(
        `SELECT status, phone_number, connected_at, last_qr_at FROM whatsapp_sessions WHERE tenant_id = $1`,
        [tenantId],
        tenantId
      );
      dbRow = dbRes.rows[0] || {};
    } catch (e) {
      console.warn(`[WhatsApp Manager] Could not query status for tenant ${tenantId}:`, e.message);
    }

    // If an in-memory session is active, report its live state
    if (inMem) {
      return {
        status: inMem.status,
        phoneNumber: inMem.phoneNumber || dbRow.phone_number || null,
        qr: inMem.qr || null,
        hasQr: Boolean(inMem.qr),
        connectedAt: dbRow.connected_at || null,
      };
    }

    // No in-memory session
    if (dbRow.status === 'connected') {
      return {
        status: 'connected',
        phoneNumber: dbRow.phone_number || null,
        qr: null,
        hasQr: false,
        connectedAt: dbRow.connected_at || null,
      };
    }

    // If DB had qr_pending or connecting but in-memory socket was dropped/not started, true status is disconnected
    return {
      status: 'disconnected',
      phoneNumber: null,
      qr: null,
      hasQr: false,
      connectedAt: null,
    };
  }

  /**
   * Sends an outbound text message on behalf of tenant
   */
  async sendMessage(tenantId, to, message) {
    if (!to || !message) {
      throw new Error("'to' and 'message' parameters are required to send a WhatsApp message.");
    }

    let session = this.sessions.get(tenantId);
    if (!session || session.status !== 'connected' || !session.sock) {
      for (const [tId, s] of this.sessions.entries()) {
        if (s.status === 'connected' && s.sock) {
          session = s;
          break;
        }
      }
    }
    if (!session || session.status !== 'connected' || !session.sock) {
      throw new Error(`Tenant '${tenantId}' does not have an active connected WhatsApp session. Please pair WhatsApp first.`);
    }

    const recipientJid = this.formatJid(to);

    const result = await session.sock.sendMessage(recipientJid, { text: message });

    // Log outbound message in audit table
    await this.dbQuery(
      `INSERT INTO whatsapp_message_log 
        (tenant_id, message_id, direction, sender_jid, recipient_jid, content_preview, status, wa_timestamp)
       VALUES ($1, $2, 'outbound', $3, $4, $5, 'sent', NOW())`,
      [
        tenantId,
        result?.key?.id || 'out_' + Date.now(),
        session.sock.user?.id || 'bot',
        recipientJid,
        message.slice(0, 500),
      ],
      tenantId
    );

    return {
      success: true,
      messageId: result?.key?.id,
      recipient: recipientJid,
    };
  }

  /**
   * Sends outbound media (image, document, audio, video)
   */
  async sendMedia(tenantId, to, mediaParams) {
    let session = this.sessions.get(tenantId);
    if (!session || session.status !== 'connected' || !session.sock) {
      for (const [tId, s] of this.sessions.entries()) {
        if (s.status === 'connected' && s.sock) {
          session = s;
          break;
        }
      }
    }
    if (!session || session.status !== 'connected' || !session.sock) {
      throw new Error(`Tenant '${tenantId}' does not have an active connected WhatsApp session.`);
    }

    const recipientJid = this.formatJid(to);
    const mediaContent = formatOutboundMediaMessage(mediaParams);

    const result = await session.sock.sendMessage(recipientJid, mediaContent);

    await this.dbQuery(
      `INSERT INTO whatsapp_message_log 
        (tenant_id, message_id, direction, sender_jid, recipient_jid, content_type, content_preview, status, wa_timestamp)
       VALUES ($1, $2, 'outbound', $3, $4, $5, $6, 'sent', NOW())`,
      [
        tenantId,
        result?.key?.id || 'media_' + Date.now(),
        session.sock.user?.id || 'bot',
        recipientJid,
        mediaParams.mediaType || 'media',
        (mediaParams.caption || mediaParams.filename || 'media attachment').slice(0, 500),
      ],
      tenantId
    );

    return {
      success: true,
      messageId: result?.key?.id,
      recipient: recipientJid,
    };
  }

  /**
   * Checks if one or more phone numbers are registered on WhatsApp using Baileys onWhatsApp()
   *
   * @param {string} tenantId - Tenant UUID
   * @param {string|string[]} phoneNumbers - One or more phone numbers to check
   * @returns {Promise<Array<{ exists: boolean, jid: string }>>}
   */
  async checkOnWhatsApp(tenantId, ...phoneNumbers) {
    let session = this.sessions.get(tenantId);
    if (!session || session.status !== 'connected' || !session.sock) {
      for (const [tId, s] of this.sessions.entries()) {
        if (s.status === 'connected' && s.sock) {
          session = s;
          break;
        }
      }
    }
    if (!session || session.status !== 'connected' || !session.sock) {
      throw new Error(`Tenant '${tenantId}' does not have an active connected WhatsApp session. Connect first.`);
    }

    const flatNumbers = phoneNumbers.flat().map((p) => {
      if (!p) return '';
      // Clean up whitespace, dashes, plus signs
      const cleaned = String(p).replace(/[^\d]/g, '');
      return cleaned;
    }).filter(Boolean);

    if (flatNumbers.length === 0) {
      return [];
    }

    // Direct invocation of Baileys sock.onWhatsApp()
    const results = await session.sock.onWhatsApp(...flatNumbers);
    return results || [];
  }

  /**
   * Requests an 8-character pairing code for phone number linking
   */
  async requestPairingCode(tenantId, phoneNumber) {
    if (!phoneNumber) {
      throw new Error('Phone number is required to request a pairing code.');
    }

    const cleanPhone = String(phoneNumber).replace(/\D/g, '');
    if (cleanPhone.length < 8) {
      throw new Error('Please provide a valid phone number with country code (e.g. 923001234567).');
    }

    const tenantAuth = getTenantAuth(tenantId);
    tenantAuth.isPairingCodePending = true;

    let session = this.sessions.get(tenantId);
    if (!session?.sock) {
      await this.connectTenant(tenantId, false);
      session = this.sessions.get(tenantId);
      // Allow Baileys socket connection negotiation
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (!session?.sock) {
      throw new Error('WhatsApp connection is initializing. Please try again in a few seconds.');
    }

    try {
      const code = await session.sock.requestPairingCode(cleanPhone);
      console.log(`🔢 [WhatsApp Manager] Pairing code generated for tenant ${tenantId} (${cleanPhone}): ${code}`);

      await this.publishEvent(tenantId, {
        event: 'pairing_code',
        code,
        phoneNumber: cleanPhone,
        tenantId,
      });

      return {
        success: true,
        code,
        phoneNumber: cleanPhone,
      };
    } catch (err) {
      console.error(`[WhatsApp Manager] Failed to request pairing code for tenant ${tenantId}:`, err.message);
      throw new Error(`Failed to request pairing code: ${err.message}`);
    }
  }

  /**
   * Restores active WhatsApp connections on system startup
   */
  async restoreActiveSessions() {
    try {
      const res = await this.dbQuery(
        `SELECT tenant_id FROM whatsapp_sessions WHERE status = 'connected' AND creds_data IS NOT NULL`
      );

      if (res.rows.length === 0) return;

      console.log(`[WhatsApp Manager] Restoring ${res.rows.length} connected WhatsApp session(s)...`);
      for (const row of res.rows) {
        this.connectTenant(row.tenant_id, false).catch((err) => {
          console.warn(`[WhatsApp Manager] Failed restoring session for tenant ${row.tenant_id}:`, err.message);
        });
      }
    } catch (err) {
      console.warn('[WhatsApp Manager] Could not query active sessions on startup (DB may still be initializing):', err.message);
    }
  }
}

module.exports = WhatsAppConnectionManager;
