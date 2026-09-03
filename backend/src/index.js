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
const hrTeamRoutes = require('./routes/hr_team');
const hrAttendanceRoutes = require('./routes/hr_attendance');
const salesRoutes = require('./routes/sales');
const procurementRoutes = require('./routes/procurement');
const financeRoutes = require('./routes/finance');
const codingRoutes = require('./routes/coding');
const analyticsRoutes = require('./routes/analytics');
const safepayRoutes = require('./routes/safepay');
const subscriptionRoutes = require('./routes/subscription');
const entitiesRoutes = require('./routes/entities');

const { authenticate } = require('./middleware/auth');
const { requirePlanAccess } = require('./middleware/subscriptionGuard');

const app = express();

// ── MIDDLEWARE ──
// Configure helmet to allow cross-origin resource embedding for widget.js
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors());

// Parse JSON body for all routes EXCEPT SafePay webhook (which requires raw body bytes)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/safepay/webhook') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// ── STATIC PUBLIC ASSETS (widget.js, demo.html) ──
app.use(express.static(path.join(__dirname, '../public')));

// ── ROUTES ──
app.use('/api/safepay', safepayRoutes);
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
app.use('/api/v1/approvals', approvalRoutes);
app.use('/api/workflows', workflowRoutes);
app.use('/api/users', userRoutes);
app.use('/api/widget', widgetRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/hr', hrTeamRoutes);
app.use('/api/hr', hrAttendanceRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/entities', entitiesRoutes);

// ── PLAN-GATED AGENT ROUTES ──
// These routes additionally check that the tenant's subscription includes the agent.
app.use('/api/v1/sales', authenticate, requirePlanAccess('/sales'), salesRoutes);
app.use('/api/v1/procurement', authenticate, requirePlanAccess('/procurement'), procurementRoutes);
app.use('/api/v1/finance', authenticate, requirePlanAccess('/finance'), financeRoutes);
app.use('/api/v1/coding', authenticate, requirePlanAccess('/coding'), codingRoutes);
app.use('/api/v1/analytics', authenticate, requirePlanAccess('/analytics'), analyticsRoutes);
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
