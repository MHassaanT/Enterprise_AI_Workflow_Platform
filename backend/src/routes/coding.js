const express = require('express');
const axios = require('axios');
const router = express.Router();

const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || 'http://localhost:8000';
const INTERNAL_SERVICE_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

// Helper to construct headers
const getForwardHeaders = (req) => {
  const headers = {
    'x-internal-token': INTERNAL_SERVICE_TOKEN,
    'Content-Type': 'application/json'
  };
  const authHeader = req.headers['authorization'] || (process.env.GITHUB_TOKEN ? `Bearer ${process.env.GITHUB_TOKEN}` : null);
  if (authHeader) {
    headers['authorization'] = authHeader;
  }
  return headers;
};

// GET /api/v1/coding/repos
router.get('/repos', async (req, res) => {
  try {
    const response = await axios.get(`${AGENT_SERVICE_URL}/agent/coding/repos`, {
      headers: getForwardHeaders(req)
    });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent repos proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to fetch repositories'
    });
  }
});

// GET /api/v1/coding/tree
router.get('/tree', async (req, res) => {
  try {
    const { repo, branch } = req.query;
    const response = await axios.get(`${AGENT_SERVICE_URL}/agent/coding/tree`, {
      params: { repo, branch },
      headers: getForwardHeaders(req)
    });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent tree proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to fetch file tree'
    });
  }
});

// GET /api/v1/coding/file
router.get('/file', async (req, res) => {
  try {
    const { repo, path, branch } = req.query;
    const response = await axios.get(`${AGENT_SERVICE_URL}/agent/coding/file`, {
      params: { repo, path, branch },
      headers: getForwardHeaders(req)
    });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent file proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to fetch file content'
    });
  }
});

// POST /api/v1/coding/create-branch
router.post('/create-branch', async (req, res) => {
  try {
    const response = await axios.post(`${AGENT_SERVICE_URL}/agent/coding/create-branch`, req.body, {
      headers: getForwardHeaders(req)
    });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent branch proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to create branch'
    });
  }
});

// POST /api/v1/coding/create-pr
router.post('/create-pr', async (req, res) => {
  try {
    const response = await axios.post(`${AGENT_SERVICE_URL}/agent/coding/create-pr`, req.body, {
      headers: getForwardHeaders(req)
    });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent PR proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Failed to create PR'
    });
  }
});

// POST /api/v1/coding/chat
router.post('/chat', async (req, res) => {
  try {
    const response = await axios.post(`${AGENT_SERVICE_URL}/agent/coding/chat`, req.body, {
      headers: getForwardHeaders(req)
    });
    return res.json(response.data);
  } catch (err) {
    console.error('Coding Agent chat proxy error:', err.response?.data || err.message);
    return res.status(err.response?.status || 500).json({
      error: err.response?.data?.detail || err.message || 'Coding Agent chat execution failed'
    });
  }
});

module.exports = router;
