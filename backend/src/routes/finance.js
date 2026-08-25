const express = require('express');
const router = express.Router();
const { query } = require('../db');

// Helper to ensure tables exist
const initFinanceTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS finance_budgets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      department VARCHAR(100) NOT NULL,
      budget_amount NUMERIC(15, 2) DEFAULT 0.00,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(tenant_id, department)
    );
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS general_ledger (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL,
      agent_name VARCHAR(100) NOT NULL,
      transaction_type VARCHAR(100) NOT NULL,
      amount NUMERIC(15, 2) DEFAULT 0.00,
      reference_id VARCHAR(100),
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
};

// POST /api/v1/finance/budgets - Save or update department budgets
router.post('/budgets', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const { budgets } = req.body;
    
    if (!budgets || !Array.isArray(budgets)) {
      return res.status(400).json({ error: 'Budgets array is required.' });
    }

    await initFinanceTables();

    for (const b of budgets) {
      await query(
        `INSERT INTO finance_budgets (tenant_id, department, budget_amount, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (tenant_id, department) 
         DO UPDATE SET budget_amount = EXCLUDED.budget_amount, updated_at = NOW();`,
        [tenantId, b.department, b.budget_amount],
        tenantId
      );
    }
    
    return res.json({ success: true });
  } catch (err) {
    console.error('Error saving budgets:', err);
    return res.status(500).json({ error: 'Failed to save budgets.' });
  }
});

// GET /api/v1/finance/budgets - Get budgets for tenant
router.get('/budgets', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    await initFinanceTables();
    
    const result = await query(
      `SELECT department, budget_amount FROM finance_budgets WHERE tenant_id = $1 ORDER BY department;`,
      [tenantId],
      tenantId
    );
    
    return res.json({ success: true, budgets: result.rows });
  } catch (err) {
    console.error('Error fetching budgets:', err);
    return res.status(500).json({ error: 'Failed to fetch budgets.' });
  }
});

// GET /api/v1/finance/dashboard - Fetch aggregate metrics
router.get('/dashboard', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    await initFinanceTables();
    
    // Total Budget
    const bRes = await query(
      `SELECT SUM(budget_amount) as total_budget FROM finance_budgets WHERE tenant_id = $1;`,
      [tenantId],
      tenantId
    );
    const totalBudget = parseFloat(bRes.rows[0]?.total_budget || 0);

    // Earned This Month (Sales)
    const eRes = await query(
      `SELECT SUM(amount) as earned FROM general_ledger 
       WHERE tenant_id = $1 AND transaction_type = 'COMPLETED_SALE'
       AND created_at >= date_trunc('month', CURRENT_DATE);`,
      [tenantId],
      tenantId
    );
    const earned = parseFloat(eRes.rows[0]?.earned || 0);

    // Spent Budget (Procurement)
    const sRes = await query(
      `SELECT SUM(amount) as spent FROM general_ledger 
       WHERE tenant_id = $1 AND transaction_type = 'EXPENSE_RESERVE';`,
      [tenantId],
      tenantId
    );
    const spent = parseFloat(sRes.rows[0]?.spent || 0);

    // Recent Sales Reports
    const salesRes = await query(
      `SELECT * FROM general_ledger 
       WHERE tenant_id = $1 AND agent_name = 'SalesAgent'
       ORDER BY created_at DESC LIMIT 5;`,
      [tenantId],
      tenantId
    );
    
    // Recent Procurement Reports (general ledger expenses + PO info)
    const procRes = await query(
      `SELECT * FROM general_ledger 
       WHERE tenant_id = $1 AND transaction_type = 'EXPENSE_RESERVE'
       ORDER BY created_at DESC LIMIT 5;`,
      [tenantId],
      tenantId
    );

    return res.json({
      success: true,
      metrics: {
        totalBudget,
        earned,
        spent
      },
      reports: {
        sales: salesRes.rows,
        procurement: procRes.rows
      }
    });
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard data.' });
  }
});

module.exports = router;
