const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { getWhatsAppManager } = require('../mcp/whatsapp');

/**
 * Middleware supporting token authentication via query parameter ?token=...
 * for browser EventSource (SSE) connections which do not support custom request headers.
 */
const authenticateSSE = (req, res, next) => {
  const token = (req.headers['authorization'] && req.headers['authorization'].split(' ')[1]) || req.query.token;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. Token required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email,
    };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// ── 1. POST /api/whatsapp/connect ── Start or resume WhatsApp pairing
router.post('/connect', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { forceNew } = req.body || {};

    const manager = getWhatsAppManager();
    const result = await manager.connectTenant(tenantId, Boolean(forceNew));

    res.json({
      message: 'WhatsApp connection initiated.',
      ...result,
    });
  } catch (err) {
    console.error('Error connecting WhatsApp:', err);
    res.status(500).json({ error: err.message || 'Failed to initiate WhatsApp connection.' });
  }
});

// ── 2. DELETE /api/whatsapp/disconnect ── Disconnect & clear WhatsApp session
router.delete('/disconnect', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const manager = getWhatsAppManager();
    const result = await manager.disconnectTenant(tenantId);

    res.json(result);
  } catch (err) {
    console.error('Error disconnecting WhatsApp:', err);
    res.status(500).json({ error: err.message || 'Failed to disconnect WhatsApp.' });
  }
});

// ── 3. GET /api/whatsapp/status ── Check current WhatsApp pairing status
router.get('/status', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const manager = getWhatsAppManager();
    const status = await manager.getStatus(tenantId);
    res.json({ success: true, ...status });
  } catch (err) {
    console.error('Error fetching WhatsApp status:', err);
    res.status(500).json({ error: 'Failed to fetch WhatsApp status.' });
  }
});

// ── 4. GET /api/whatsapp/qr-stream ── Real-time Server-Sent Events (SSE) stream for QR code
router.get('/qr-stream', authenticateSSE, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;

  // Set SSE response headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  // Immediately send initial state
  try {
    const manager = getWhatsAppManager();
    const initialStatus = await manager.getStatus(tenantId);
    sendEvent('status', initialStatus);

    if (initialStatus.qr) {
      sendEvent('qr', { qr: initialStatus.qr, tenantId });
    }
  } catch (initErr) {
    console.warn('[WhatsApp SSE] Could not fetch initial state:', initErr.message);
  }

  // Subscribe to Redis channel for live updates
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let subscriber = null;

  try {
    subscriber = createClient({ url: redisUrl });
    subscriber.on('error', (err) => {
      // Suppress noisy logs if Redis is unavailable
    });

    await subscriber.connect();

    const channel = `whatsapp:events:${tenantId}`;
    await subscriber.subscribe(channel, (message) => {
      try {
        const parsed = JSON.parse(message);
        sendEvent(parsed.event || 'update', parsed);
      } catch (e) {
        sendEvent('raw', { message });
      }
    });
  } catch (redisErr) {
    // If Redis is not available, fall back to interval polling of in-memory status
    const pollInterval = setInterval(async () => {
      try {
        const manager = getWhatsAppManager();
        const current = await manager.getStatus(tenantId);
        sendEvent('status', current);
        if (current.qr) {
          sendEvent('qr', { qr: current.qr, tenantId });
        }
        if (current.status === 'connected') {
          clearInterval(pollInterval);
        }
      } catch (pollErr) {
        // Ignore poll error
      }
    }, 2000);

    req.on('close', () => clearInterval(pollInterval));
  }

  // Clean up Redis subscriber on client disconnect
  req.on('close', async () => {
    if (subscriber && subscriber.isOpen) {
      try {
        await subscriber.unsubscribe(`whatsapp:events:${tenantId}`);
        await subscriber.quit();
      } catch (e) {
        // Ignore cleanup error
      }
    }
    res.end();
  });
});

// ── 5. GET /api/whatsapp/conversations ── List all WhatsApp conversations for tenant
router.get('/conversations', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const { tenantId } = req.user;

    const result = await query(
      `SELECT c.id, c.tenant_id, c.customer_identifier, c.status, c.created_at, c.updated_at,
              COUNT(m.id) as message_count,
              MAX(m.created_at) as last_message_at
       FROM conversations c
       LEFT JOIN messages m ON c.id = m.conversation_id
       WHERE c.tenant_id = $1 AND c.channel = 'whatsapp'
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [tenantId],
      tenantId
    );

    res.json({ conversations: result.rows });
  } catch (err) {
    console.error('Error fetching WhatsApp conversations:', err);
    res.status(500).json({ error: 'Failed to fetch WhatsApp conversations.' });
  }
});

// ── 6. POST /api/whatsapp/check-number ── Check if phone numbers exist on WhatsApp via Baileys onWhatsApp()
router.post('/check-number', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { phoneNumbers, phone } = req.body || {};

    const targets = phoneNumbers || (phone ? [phone] : []);
    if (!targets || targets.length === 0) {
      return res.status(400).json({ error: 'phone or phoneNumbers array is required.' });
    }

    const manager = getWhatsAppManager();
    const results = await manager.checkOnWhatsApp(tenantId, targets);

    res.json({ results });
  } catch (err) {
    console.error('Error checking numbers on WhatsApp:', err);
    res.status(500).json({ error: err.message || 'Failed to check numbers on WhatsApp.' });
  }
});

module.exports = router;
