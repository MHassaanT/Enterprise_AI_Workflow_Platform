const { default: makeWASocket, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const { createClient } = require('redis');
const { usePostgresAuthState } = require('./postgres-auth-state');
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

    // If session already connected, return current status
    const existing = this.sessions.get(tenantId);
    if (!forceNew && existing && existing.status === 'connected') {
      return {
        status: 'connected',
        phoneNumber: existing.phoneNumber,
      };
    }

    // Clean up any existing socket before reconnecting
    if (existing?.sock) {
      try {
        existing.sock.ev.removeAllListeners();
        existing.sock.end(undefined);
      } catch (e) {
        // Ignore cleanup error
      }
    }

    if (forceNew) {
      try {
        await this.dbQuery(
          `DELETE FROM whatsapp_auth_keys WHERE tenant_id = $1`,
          [tenantId],
          tenantId
        );
        await this.dbQuery(
          `UPDATE whatsapp_sessions SET creds_data = NULL, status = 'disconnected' WHERE tenant_id = $1`,
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

    // Initialize Baileys WASocket
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: silentLogger,
      browser: ['Enterprise AI Platform', 'Chrome', '124.0.0.0'],
      syncFullHistory: false,
      generateHighQualityLinkPreview: false,
      connectTimeoutMs: 60000,
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

        console.warn(`⚠️ [WhatsApp Manager] Tenant ${tenantId} disconnected. StatusCode: ${statusCode}, isLoggedOut: ${isLoggedOut}`);

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
        } else {
          // Temporary drop — attempt auto-reconnect with exponential backoff (max 5 retries)
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

    // Fall back to database if not in memory
    const dbRes = await this.dbQuery(
      `SELECT status, phone_number, connected_at, last_qr_at FROM whatsapp_sessions WHERE tenant_id = $1`,
      [tenantId],
      tenantId
    );

    const dbRow = dbRes.rows[0] || {};
    const effectiveStatus = inMem ? inMem.status : dbRow.status || 'disconnected';
    const effectivePhone = inMem?.phoneNumber || dbRow.phone_number || null;
    const effectiveQr = inMem?.qr || null;

    return {
      status: effectiveStatus,
      phoneNumber: effectivePhone,
      qr: effectiveQr,
      connectedAt: dbRow.connected_at || null,
    };
  }

  /**
   * Sends an outbound text message on behalf of tenant
   */
  async sendMessage(tenantId, to, message) {
    if (!to || !message) {
      throw new Error("'to' and 'message' parameters are required to send a WhatsApp message.");
    }

    const session = this.sessions.get(tenantId);
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
    const session = this.sessions.get(tenantId);
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
