require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const authRoutes = require('./routes/auth');
const conversationRoutes = require('./routes/conversations');
const documentRoutes = require('./routes/documents');
const agentRoutes = require('./routes/agents');
const internalRoutes = require('./routes/internal');
const userRoutes = require('./routes/users');
const widgetRoutes = require('./routes/widget');
const mcpRoutes = require('./routes/mcp');
const mcpGatewayRoutes = require('./routes/mcp_gateway');
const integrationRoutes = require('./routes/integrations');
const approvalRoutes = require('./routes/approvals');
const workflowRoutes = require('./routes/workflows');
const hrRoutes = require('./routes/hr');

const app = express();

// ── MIDDLEWARE ──
// Configure helmet to allow cross-origin resource embedding for widget.js
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors());
app.use(express.json());

// ── STATIC PUBLIC ASSETS (widget.js, demo.html) ──
app.use(express.static(path.join(__dirname, '../public')));

// ── ROUTES ──
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/v1/agents', agentRoutes); // Supporting assignment spec POST /api/v1/agents/{id}/config
app.use('/api/mcp', mcpRoutes);
app.use('/api/v1/mcp', mcpRoutes);
app.use('/api/mcp-gateway', mcpGatewayRoutes);
app.use('/api/integrations', integrationRoutes);
app.use('/api/approvals', approvalRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/users', userRoutes);
app.use('/api/widget', widgetRoutes);
app.use('/api/hr', hrRoutes);
app.use('/internal', internalRoutes); // agent service only — token-guarded


// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status: 'API Gateway running', timestamp: new Date() });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.stack || err);
  res.status(500).json({ error: err.message || 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ API Gateway running on port ${PORT}`);
});
