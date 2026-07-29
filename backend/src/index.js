require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const authRoutes = require('./routes/auth');
const conversationRoutes = require('./routes/conversations');
const documentRoutes = require('./routes/documents');
const agentRoutes = require('./routes/agents');
const internalRoutes = require('./routes/internal');

const app = express();

// ── MIDDLEWARE ──
app.use(helmet());
app.use(cors());
app.use(express.json());

// ── ROUTES ──
app.use('/api/auth', authRoutes);
app.use('/api/conversations', conversationRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/agents', agentRoutes);
app.use('/internal', internalRoutes); // agent service only — token-guarded

// ── HEALTH CHECK ──
app.get('/health', (req, res) => {
  res.json({ status: 'API Gateway running', timestamp: new Date() });
});

// ── ERROR HANDLER ──
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(500).json({ error: 'Internal server error.' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ API Gateway running on port ${PORT}`);
});
