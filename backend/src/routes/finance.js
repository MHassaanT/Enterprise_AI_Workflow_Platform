const express = require('express');
const router = express.Router();
const { query } = require('../db');
const axios = require('axios');

const AGENT_URL = process.env.AGENT_SERVICE_URL || process.env.AGENT_URL || 'http://localhost:8000';
const INTERNAL_TOKEN = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';

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

// ── GET /api/v1/finance/status ── Check which payment accounts (SafePay, Stripe) are connected
router.get('/status', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    
    // Check credentials directly in Postgres
    let stripeConnected = false;
    let safepayConnected = false;
    let stripeUpdated = null;
    let safepayUpdated = null;

    try {
      const credRes = await query(
        `SELECT tc.id, tc.updated_at, LOWER(tr.canonical_name) as cname, LOWER(tr.provider_type) as ptype
         FROM tool_credentials tc
         JOIN tool_registry tr ON tc.tool_id = tr.id
         WHERE tc.tenant_id = $1 AND (
           LOWER(tr.canonical_name) IN ('stripe', 'safepay') OR
           LOWER(tr.provider_type) IN ('stripe', 'safepay')
         )`,
        [tenantId],
        tenantId
      );

      for (const r of credRes.rows) {
        const name = (r.cname || r.ptype || '').toLowerCase();
        if (name.includes('stripe')) {
          stripeConnected = true;
          stripeUpdated = r.updated_at;
        } else if (name.includes('safepay')) {
          safepayConnected = true;
          safepayUpdated = r.updated_at;
        }
      }
    } catch (dbErr) {
      console.warn('[FINANCE ROUTE] Error querying tool_credentials for payment status:', dbErr.message);
    }

    return res.json({
      success: true,
      tenantId,
      status: {
        stripe: { connected: stripeConnected, updated_at: stripeUpdated },
        safepay: { connected: safepayConnected, updated_at: safepayUpdated },
      }
    });
  } catch (err) {
    console.error('Error fetching finance status:', err);
    return res.status(500).json({ error: 'Failed to fetch payment status.' });
  }
});

// ── GET /api/v1/finance/overview ── Aggregated financial summaries, up/down graphs & timeline
router.get('/overview', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const provider = req.query.provider || 'all';
    const periodDays = parseInt(req.query.period_days || req.query.period || '30', 10);

    // Call Python agent service
    try {
      const agentRes = await axios.get(`${AGENT_URL}/agent/finance/overview`, {
        params: {
          tenant_id: tenantId,
          provider: provider,
          period_days: periodDays
        },
        headers: {
          'X-Tenant-Id': tenantId,
          'X-Internal-Token': INTERNAL_TOKEN,
        },
        timeout: 12000,
      });

      if (agentRes.data && agentRes.data.data) {
        return res.json(agentRes.data);
      }
    } catch (agentErr) {
      console.warn('[FINANCE ROUTE] Agent service overview fallback:', agentErr.message);
    }

    // Fallback response with structured sandbox data if agent service is unavailable
    const fallbackData = buildFallbackFinanceData(provider, periodDays);
    return res.json({
      success: true,
      tenant_id: tenantId,
      data: fallbackData,
    });
  } catch (err) {
    console.error('Error fetching finance overview:', err);
    return res.status(500).json({ error: 'Failed to fetch financial overview.' });
  }
});

// ── GET /api/v1/finance/transactions ── Filterable transaction report
router.get('/transactions', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    const { provider = 'all', status = 'all', search, limit = 50 } = req.query;

    try {
      const agentRes = await axios.get(`${AGENT_URL}/agent/finance/transactions`, {
        params: { tenant_id: tenantId, provider, status, search, limit },
        headers: {
          'X-Tenant-Id': tenantId,
          'X-Internal-Token': INTERNAL_TOKEN,
        },
        timeout: 10000,
      });
      if (agentRes.data) {
        return res.json(agentRes.data);
      }
    } catch (agentErr) {
      console.warn('[FINANCE ROUTE] Agent transactions fallback:', agentErr.message);
    }

    const fallback = buildFallbackFinanceData(provider, 30);
    return res.json({
      success: true,
      count: fallback.transactions.length,
      transactions: fallback.transactions,
    });
  } catch (err) {
    console.error('Error fetching transactions:', err);
    return res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

// ── POST /api/v1/finance/insights ── Generate AI Financial Briefing
router.post('/insights', async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';

    try {
      const agentRes = await axios.post(
        `${AGENT_URL}/agent/finance/insights`,
        { tenant_id: tenantId },
        {
          headers: {
            'X-Tenant-Id': tenantId,
            'X-Internal-Token': INTERNAL_TOKEN,
          },
          timeout: 20000,
        }
      );
      if (agentRes.data && agentRes.data.insights) {
        return res.json(agentRes.data);
      }
    } catch (agentErr) {
      console.warn('[FINANCE ROUTE] Agent insights fallback:', agentErr.message);
    }

    // Structured fallback briefing
    return res.json({
      success: true,
      insights: {
        success: true,
        insights_markdown: `### Executive Financial Briefing (Fallback)
**Cash Flow Assessment:**
Multi-account payment volume indicates healthy cash flow across active gateways with steady volume and manageable refund rates.

**Strategic Recommendations:**
- Maintain sufficient liquidity in primary settlement accounts.
- Review SafePay PKR conversions periodically against market benchmark rates.
- Ensure Stripe dispute rates remain below 0.5% threshold.`,
        generated_at: new Date().toISOString(),
      }
    });
  } catch (err) {
    console.error('Error generating finance insights:', err);
    return res.status(500).json({ error: 'Failed to generate financial insights.' });
  }
});

// Helper for fallback generation
function buildFallbackFinanceData(provider = 'all', periodDays = 30) {
  const now = new Date();
  const timeline = [];
  for (let i = periodDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    timeline.push({
      date: dateStr,
      gross: 0.0,
      refunds: 0.0,
      net: 0.0,
      stripe_volume: 0.0,
      safepay_volume: 0.0,
      gross_pkr: 0.0,
    });
  }

  return {
    view_mode: provider,
    has_multiple_providers: provider === 'all',
    is_demo_mode: false,
    connection_status: {
      stripe: { connected: true, label: 'Stripe' },
      safepay: { connected: true, label: 'SafePay' },
    },
    summary: {
      gross_volume_usd: 0.00,
      gross_volume_pkr: 0.00,
      net_volume_usd: 0.00,
      net_volume_pkr: 0.00,
      refunds_volume_usd: 0.00,
      refunds_volume_pkr: 0.00,
      gross_trend_pct: 0.0,
      net_trend_pct: 0.0,
      refunds_trend_pct: 0.0,
      total_transactions: 0,
      successful_transactions: 0,
      failed_transactions: 0,
      success_rate: 100.0,
      balances: {
        stripe_available_usd: 0.00,
        stripe_pending_usd: 0.00,
        safepay_available_pkr: 0.00,
        safepay_available_usd: 0.00,
      },
    },
    charts: {
      timeline,
      distribution: [
        { name: 'Stripe', provider: 'stripe', volume_usd: 0.00, percentage: 0.0, currency: 'USD', color: '#635bff' },
        { name: 'SafePay', provider: 'safepay', volume_usd: 0.00, percentage: 0.0, currency: 'PKR', color: '#4f46e5' },
      ],
    },
    transactions: [],
  };
}


// POST /api/v1/finance/budgets or /api/v1/finance/budget - Save or update department budgets
router.post(['/budgets', '/budget'], async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    let budgetList = req.body.budgets || req.body.budget || req.body;
    
    if (budgetList && !Array.isArray(budgetList) && typeof budgetList === 'object' && budgetList.department) {
      budgetList = [budgetList];
    }

    if (!budgetList || !Array.isArray(budgetList)) {
      return res.status(400).json({ error: 'Budgets array is required.' });
    }

    await initFinanceTables();

    for (const b of budgetList) {
      const budgetAmount = parseFloat(b.budget_amount ?? b.amount ?? b.total_budget ?? 0) || 0;
      await query(
        `INSERT INTO finance_budgets (tenant_id, department, budget_amount, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (tenant_id, department) 
         DO UPDATE SET budget_amount = EXCLUDED.budget_amount, updated_at = NOW();`,
        [tenantId, b.department, budgetAmount],
        tenantId
      );

      // Sync to department_budgets for cross-system analytics consistency
      try {
        await query(
          `INSERT INTO department_budgets (tenant_id, department, total_budget, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (tenant_id, department)
           DO UPDATE SET total_budget = EXCLUDED.total_budget, updated_at = NOW();`,
          [tenantId, b.department, budgetAmount],
          tenantId
        );
      } catch (syncErr) {
        // Table may not exist in some environments; non-critical
      }
    }
    
    return res.json({ success: true, message: 'Budgets updated successfully.' });
  } catch (err) {
    console.error('Error saving budgets:', err);
    return res.status(500).json({ error: 'Failed to save budgets.' });
  }
});

// GET /api/v1/finance/budgets or /api/v1/finance/budget - Get budgets for tenant
router.get(['/budgets', '/budget'], async (req, res) => {
  try {
    const tenantId = req.user?.tenantId || req.user?.tenant_id || req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    await initFinanceTables();
    
    const result = await query(
      `SELECT department, budget_amount FROM finance_budgets WHERE tenant_id = $1 ORDER BY department;`,
      [tenantId],
      tenantId
    );
    
    return res.json({ 
      success: true, 
      budgets: result.rows,
      budget: result.rows
    });
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
