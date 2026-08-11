const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { executeWorkflow } = require('../services/workflowEngine');

// GET /api/workflows - Get all workflows for tenant
router.get('/', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const result = await query(
      `SELECT workflow_id as id, name, description, status, updated_at 
       FROM workflows 
       WHERE tenant_id = $1 
       ORDER BY updated_at DESC`,
      [tenantId]
    );
    res.json({ workflows: result.rows });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: 'Failed to fetch workflows' });
  }
});

// POST /api/workflows - Create a new workflow
router.post('/', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { name, description, dag_json } = req.body;
    const result = await query(
      `INSERT INTO workflows (tenant_id, name, description, definition, status, created_by) 
       VALUES ($1, $2, $3, $4, 'draft', $5) 
       RETURNING workflow_id as id, name, description, status, updated_at`,
      [tenantId, name, description || '', dag_json || { nodes: [], edges: [] }, req.user.id]
    );
    res.status(201).json({ workflow: result.rows[0] });
  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

// GET /api/workflows/:id - Get a specific workflow
router.get('/:id', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const result = await query(
      `SELECT workflow_id as id, name, description, definition, status, updated_at 
       FROM workflows 
       WHERE workflow_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.json({ workflow: result.rows[0] });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ error: 'Failed to fetch workflow' });
  }
});

// PATCH /api/workflows/:id - Update a workflow (save draft)
router.patch('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    const { name, description, dag_json } = req.body;
    
    const updates = [];
    const values = [];
    let count = 1;

    if (name !== undefined) {
      updates.push(`name = $${count++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${count++}`);
      values.push(description);
    }
    if (dag_json !== undefined) {
      updates.push(`definition = $${count++}`);
      values.push(dag_json);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    
    values.push(id, tenantId);
    
    const result = await query(
      `UPDATE workflows 
       SET ${updates.join(', ')} 
       WHERE workflow_id = $${count} AND tenant_id = $${count+1} 
       RETURNING workflow_id as id, name, description, definition, status, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.json({ workflow: result.rows[0] });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

// POST /api/workflows/:id/publish - Publish a workflow
router.post('/:id/publish', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    const result = await query(
      `UPDATE workflows 
       SET status = 'active', updated_at = NOW() 
       WHERE workflow_id = $1 AND tenant_id = $2 
       RETURNING workflow_id as id, name, status, updated_at`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }
    
    res.json({ message: 'Workflow published successfully', workflow: result.rows[0] });
  } catch (error) {
    console.error('Error publishing workflow:', error);
    res.status(500).json({ error: 'Failed to publish workflow' });
  }
});

// POST /api/workflows/:id/run - Trigger a workflow run
router.post('/:id/run', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    // Check if workflow exists
    const wfCheck = await query(
      `SELECT workflow_id as id, definition FROM workflows WHERE workflow_id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );
    if (wfCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const result = await query(
      `INSERT INTO workflow_runs (workflow_id, tenant_id, triggered_by, status, execution_state) 
       VALUES ($1, $2, 'manual', 'running', '{}') 
       RETURNING run_id as id, status, created_at`,
      [id, tenantId]
    );

    // Call execution engine asynchronously (fire and forget)
    executeWorkflow(id, result.rows[0].id, tenantId).catch(err => {
      console.error('Execution Engine background error:', err);
    });
    
    res.status(202).json({ message: 'Workflow run initiated', run: result.rows[0] });
  } catch (error) {
    console.error('Error triggering workflow run:', error);
    res.status(500).json({ error: 'Failed to trigger workflow run' });
  }
});

// GET /api/workflows/:id/runs - Fetch run history
router.get('/:id/runs', authenticate, authorize('admin', 'employee'), async (req, res) => {
  try {
    const { tenantId } = req.user;
    const { id } = req.params;
    
    const result = await query(
      `SELECT run_id as id, status, created_at as date, completed_at, triggered_by
       FROM workflow_runs 
       WHERE workflow_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC
       LIMIT 50`,
      [id, tenantId]
    );
    
    res.json({ runs: result.rows });
  } catch (error) {
    console.error('Error fetching workflow runs:', error);
    res.status(500).json({ error: 'Failed to fetch workflow runs' });
  }
});

module.exports = router;
