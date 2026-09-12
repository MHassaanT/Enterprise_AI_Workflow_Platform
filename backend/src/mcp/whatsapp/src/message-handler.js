const https = require('https');
const http = require('http');
const { extractInboundMediaInfo } = require('./media-handler');
const { decryptData } = require('./postgres-auth-state');

/**
 * Invokes the Python Agent service (/agent/run) with shared secret
 */
const callAgentService = (payload) => {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const agentUrl = new URL(`${process.env.AGENT_SERVICE_URL || 'http://localhost:8000'}/agent/run`);
    const transport = agentUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: agentUrl.hostname,
      port: agentUrl.port || (agentUrl.protocol === 'https:' ? 443 : 80),
      path: agentUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'X-Internal-Token': process.env.INTERNAL_SERVICE_TOKEN || '',
      },
      timeout: 30000,
    };

    const req = transport.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          if (res.statusCode >= 400) {
            reject(new Error(`Agent service HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(JSON.parse(data));
          }
        } catch (e) {
          reject(new Error('Invalid agent service response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Agent service call timed out'));
    });

    req.write(body);
    req.end();
  });
};

/**
 * Extracts plain text from diverse WhatsApp message formats
 */
const extractMessageText = (msg) => {
  if (!msg) return '';

  if (msg.conversation) return msg.conversation;
  if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
  if (msg.imageMessage?.caption) return msg.imageMessage.caption;
  if (msg.documentMessage?.caption) return msg.documentMessage.caption;
  if (msg.videoMessage?.caption) return msg.videoMessage.caption;

  const mediaInfo = extractInboundMediaInfo(msg);
  if (mediaInfo.isMedia) {
    return mediaInfo.caption || `[User sent a ${mediaInfo.mediaType} attachment]`;
  }

  return '';
};

/**
 * Handles incoming WhatsApp messages from Baileys messages.upsert event
 *
 * @param {object} params
 * @param {string} params.tenantId - Tenant UUID
 * @param {object} params.sock - Tenant Baileys WASocket instance
 * @param {object} params.event - Baileys messages.upsert event payload
 * @param {Function} params.dbQuery - Tenant-scoped DB query function: (sql, params, tenantId) => Promise
 */
const handleInboundMessages = async ({ tenantId, sock, event, dbQuery }) => {
  if (!event?.messages || event.type !== 'notify') return;

  for (const m of event.messages) {
    try {
      // 1. Skip messages sent by our own account or status broadcasts
      if (m.key.fromMe) continue;
      const remoteJid = m.key.remoteJid;
      if (!remoteJid || remoteJid.includes('@broadcast') || remoteJid.includes('@newsletter')) {
        continue;
      }

      // 2. Extract phone number and message content
      const rawId = remoteJid.split('@')[0];
      let resolvedPhone = rawId;

      if (remoteJid.endsWith('@lid')) {
        try {
          const lidRes = await dbQuery(
            `SELECT key_data FROM whatsapp_auth_keys 
             WHERE tenant_id = $1 AND key_category = 'lid-mapping' AND key_id = $2`,
            [tenantId, `${rawId}_reverse`],
            tenantId
          );
          if (lidRes.rows.length > 0 && lidRes.rows[0].key_data) {
            const dec = decryptData(lidRes.rows[0].key_data);
            if (dec && typeof dec === 'string') {
              resolvedPhone = dec;
              console.log(`[WhatsApp LID Resolver] Resolved LID ${rawId}@lid -> +${resolvedPhone}`);
            }
          }
        } catch (lidErr) {
          console.warn('[WhatsApp LID Resolver Notice]', lidErr.message);
        }
      }

      const phoneNumber = resolvedPhone;
      const messageText = extractMessageText(m.message);

      if (!messageText || messageText.trim() === '') {
        continue;
      }

      console.log(`[WhatsApp Inbound] Tenant ${tenantId} received message from ${phoneNumber} (JID: ${remoteJid}): "${messageText}"`);

      // 3. Find or create an active conversation with channel='whatsapp'
      let conversation = null;
      const existingConvRes = await dbQuery(
        `SELECT id, agent_instance_id FROM conversations 
         WHERE tenant_id = $1 AND (customer_identifier = $2 OR customer_identifier = $3) AND channel = 'whatsapp' AND status = 'active'
         ORDER BY updated_at DESC LIMIT 1`,
        [tenantId, phoneNumber, rawId],
        tenantId
      );

      if (existingConvRes.rows.length > 0) {
        conversation = existingConvRes.rows[0];
      } else {
        // Resolve default agent instance for tenant
        let agentRes = await dbQuery(
          `SELECT id FROM agent_instances WHERE tenant_id = $1 LIMIT 1`,
          [tenantId],
          tenantId
        );

        let agentId = agentRes.rows[0]?.id;
        if (!agentId) {
          const newAgent = await dbQuery(
            `INSERT INTO agent_instances (tenant_id, name, config)
             VALUES ($1, 'Customer Support Agent', '{}')
             RETURNING id`,
            [tenantId],
            tenantId
          );
          agentId = newAgent.rows[0]?.id;
        }

        const newConv = await dbQuery(
          `INSERT INTO conversations 
            (tenant_id, agent_instance_id, customer_identifier, channel, status)
           VALUES ($1, $2, $3, 'whatsapp', 'active')
           RETURNING id, agent_instance_id`,
          [tenantId, agentId, phoneNumber],
          tenantId
        );
        conversation = newConv.rows[0];
      }

      const conversationId = conversation.id;
      const agentInstanceId = conversation.agent_instance_id;

      // 4. Save inbound user message
      await dbQuery(
        `INSERT INTO messages (conversation_id, tenant_id, role, content)
         VALUES ($1, $2, 'user', $3)`,
        [conversationId, tenantId, messageText],
        tenantId
      );

      // 5. Log inbound message in audit table
      await dbQuery(
        `INSERT INTO whatsapp_message_log 
          (tenant_id, conversation_id, message_id, direction, sender_jid, recipient_jid, content_preview, status, wa_timestamp)
         VALUES ($1, $2, $3, 'inbound', $4, $5, $6, 'delivered', to_timestamp($7))`,
        [
          tenantId,
          conversationId,
          m.key.id || 'msg_' + Date.now(),
          remoteJid,
          sock.user?.id || 'bot',
          messageText.slice(0, 500),
          m.messageTimestamp ? Number(m.messageTimestamp) : Date.now() / 1000,
        ],
        tenantId
      );

      // 5b. Cross-reference with Sales SDR Prospects (inbound WhatsApp reply tracking)
      try {
        const cleanResolved = resolvedPhone.replace(/[^0-9]/g, '');
        const cleanRaw = rawId.replace(/[^0-9]/g, '');
        const prospectUpdate = await dbQuery(
          `UPDATE sales_prospects 
           SET has_reply = TRUE,
               last_reply_at = NOW(),
               reply_content = $1,
               reply_status = 'REPLY_RECEIVED',
               deal_stage = CASE 
                 WHEN deal_stage IN ('OUTREACH_SENT', 'DISCOVERED') THEN 'REPLIED' 
                 ELSE deal_stage 
               END,
               last_channel_used = 'whatsapp',
               updated_at = NOW()
           WHERE tenant_id = $2 AND (
             replace(replace(replace(contact_phone, '+', ''), '-', ''), ' ', '') LIKE '%' || $3
             OR replace(replace(replace(contact_phone, '+', ''), '-', ''), ' ', '') LIKE '%' || $4
             OR contact_phone = $5
             OR contact_phone = '+' || $3
             OR contact_phone = '+' || $4
           )
           RETURNING id, company_name, contact_name`,
          [messageText, tenantId, cleanResolved, cleanRaw, remoteJid],
          tenantId
        );
        if (prospectUpdate.rows && prospectUpdate.rows.length > 0) {
          console.log(`[WhatsApp Sales Hook] Updated prospect ${prospectUpdate.rows[0].contact_name} at ${prospectUpdate.rows[0].company_name} with inbound WhatsApp reply.`);
        }
      } catch (salesHookErr) {
        console.warn('[WhatsApp Sales Hook Notice]', salesHookErr.message);
      }

      // 5c. Cross-reference with Procurement Vendors (inbound WhatsApp reply & interview tracking)
      try {
        const cleanResolved = resolvedPhone.replace(/[^0-9]/g, '');
        const cleanRaw = rawId.replace(/[^0-9]/g, '');
        const vendorUpdate = await dbQuery(
          `UPDATE procurement_vendors
           SET contact_status = CASE 
                 WHEN contact_status = 'RFQ_SENT' THEN 'REPLIED'
                 WHEN contact_status = 'INTERVIEW_SCHEDULED' THEN 'INTERVIEW_CONFIRMED'
                 ELSE contact_status 
               END,
               interview_availability = CASE 
                 WHEN contact_status = 'INTERVIEW_SCHEDULED' THEN $1
                 ELSE interview_availability 
               END
           WHERE tenant_id = $2 AND (
             replace(replace(replace(vendor_phone, '+', ''), '-', ''), ' ', '') LIKE '%' || $3
             OR replace(replace(replace(vendor_phone, '+', ''), '-', ''), ' ', '') LIKE '%' || $4
             OR vendor_phone = $5
             OR vendor_phone = '+' || $3
             OR vendor_phone = '+' || $4
           )
           RETURNING id, vendor_name`,
          [messageText, tenantId, cleanResolved, cleanRaw, remoteJid],
          tenantId
        );
        if (vendorUpdate.rows && vendorUpdate.rows.length > 0) {
          console.log(`[WhatsApp Procurement Hook] Updated procurement vendor ${vendorUpdate.rows[0].vendor_name} with inbound WhatsApp message.`);
        }
      } catch (procHookErr) {
        console.warn('[WhatsApp Procurement Hook Notice]', procHookErr.message);
      }

      // 6. Fetch recent conversation history (up to 10 turns)
      const historyRes = await dbQuery(
        `SELECT role, content FROM messages 
         WHERE conversation_id = $1 AND tenant_id = $2
         ORDER BY created_at ASC LIMIT 10`,
        [conversationId, tenantId],
        tenantId
      );
      const history = (historyRes.rows || []).map((r) => ({ role: r.role, content: r.content }));

      // 7. Invoke Agent Orchestration Service (with direct RAG fallback)
      let answer = 'Thank you for your message. An agent will respond shortly.';
      let citations = [];

      try {
        const agentResult = await callAgentService({
          question: messageText,
          tenant_id: tenantId,
          agent_instance_id: agentInstanceId,
          conversation_id: conversationId,
          user_id: `whatsapp-${phoneNumber}`,
          history,
        });

        answer = agentResult?.answer || 'I am processing your request. Please hold on.';
        citations = agentResult?.citations || [];
      } catch (agentErr) {
        console.warn(`[WhatsApp Agent Warning] Agent service unavailable for tenant ${tenantId}:`, agentErr.message);

        // Fallback to direct RAG
        try {
          const { answerWithRAG } = require('../../../services/rag');
          const ragResult = await answerWithRAG(messageText, tenantId);
          answer = ragResult?.answer || 'Thank you for reaching out. We have logged your request.';
          citations = ragResult?.citations || [];
        } catch (ragErr) {
          console.warn('[WhatsApp RAG Warning] Direct RAG also failed:', ragErr.message);
          answer = 'Thank you for contacting us. We have received your message and will be with you shortly.';
        }
      }

      // 8. Persist assistant message in messages table
      await dbQuery(
        `INSERT INTO messages (conversation_id, tenant_id, role, content, citations_json)
         VALUES ($1, $2, 'assistant', $3, $4)`,
        [conversationId, tenantId, answer, JSON.stringify(citations || [])],
        tenantId
      );

      // 9. Send response back to customer via Baileys WhatsApp WebSocket
      const sentMsg = await sock.sendMessage(remoteJid, { text: answer });

      // 10. Log outbound response in audit log
      await dbQuery(
        `INSERT INTO whatsapp_message_log 
          (tenant_id, conversation_id, message_id, direction, sender_jid, recipient_jid, content_preview, status, wa_timestamp)
         VALUES ($1, $2, $3, 'outbound', $4, $5, $6, 'sent', NOW())`,
        [
          tenantId,
          conversationId,
          sentMsg?.key?.id || 'out_' + Date.now(),
          sock.user?.id || 'bot',
          remoteJid,
          answer.slice(0, 500),
        ],
        tenantId
      );

      // 11. Touch conversation updated_at
      await dbQuery(
        `UPDATE conversations SET updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [conversationId, tenantId],
        tenantId
      );
    } catch (msgErr) {
      console.error(`[WhatsApp Message Handler Error] Failed processing message for tenant ${tenantId}:`, msgErr);
    }
  }
};

module.exports = {
  handleInboundMessages,
  extractMessageText,
  callAgentService,
};
