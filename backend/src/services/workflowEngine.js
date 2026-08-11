const { query } = require('../db');

// Sleep utility for delay simulation
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function executeWorkflow(workflowId, runId, tenantId) {
  console.log(`Starting execution for workflow ${workflowId}, run ${runId}`);
  
  try {
    const wfRes = await query(`SELECT definition FROM workflows WHERE workflow_id = $1`, [workflowId]);
    if (wfRes.rows.length === 0) throw new Error('Workflow not found');
    
    const { nodes, edges } = wfRes.rows[0].definition;
    
    // In-memory execution state
    let executionState = {
      completedNodes: [],
      failedNodes: [],
      nodeOutputs: {}
    };

    // Calculate in-degrees
    let inDegree = {};
    nodes.forEach(n => inDegree[n.id] = 0);
    edges.forEach(e => {
      if (inDegree[e.target] !== undefined) {
        inDegree[e.target]++;
      }
    });

    let queue = nodes.filter(n => inDegree[n.id] === 0);
    
    while (queue.length > 0) {
      const currentNode = queue.shift();
      const startTime = Date.now();
      
      console.log(`Executing node ${currentNode.id} of type ${currentNode.type}`);
      let status = 'completed';
      let error = null;
      let outputData = { executedAt: new Date().toISOString() };

      try {
        // Simulate execution based on type
        if (currentNode.type === 'DELAY') {
          const delayMs = currentNode.data?.delayMs || 1000;
          await sleep(delayMs);
          outputData.slept = delayMs;
        } else if (currentNode.type === 'CONDITION') {
          await sleep(200);
          outputData.result = true; // Hardcoded simulation
        } else if (currentNode.type === 'ACTION') {
          await sleep(800);
          outputData.result = 'Action simulated successfully';
        } else {
          await sleep(300); // default processing time
        }
      } catch (err) {
        status = 'failed';
        error = err.message;
      }
      
      const duration = Date.now() - startTime;
      
      // Save step record
      await query(
        `INSERT INTO workflow_run_steps (run_id, node_id, node_type, input_data, output_data, status, duration_ms, error_message)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          runId,
          currentNode.id,
          currentNode.type,
          JSON.stringify(currentNode.data || {}),
          JSON.stringify(outputData),
          status,
          duration,
          error
        ]
      );

      if (status === 'failed') {
        executionState.failedNodes.push(currentNode.id);
        break; // Stop execution on failure
      }

      executionState.completedNodes.push(currentNode.id);
      executionState.nodeOutputs[currentNode.id] = outputData;

      // Decrement in-degree for targets
      edges.filter(e => e.source === currentNode.id).forEach(e => {
        inDegree[e.target]--;
        if (inDegree[e.target] === 0) {
          queue.push(nodes.find(n => n.id === e.target));
        }
      });
      
      // Update running state periodically
      await query(
        `UPDATE workflow_runs SET execution_state = $1 WHERE run_id = $2`,
        [JSON.stringify(executionState), runId]
      );
    }
    
    const finalStatus = executionState.failedNodes.length > 0 ? 'failed' : 'success';
    
    await query(
      `UPDATE workflow_runs SET status = $1, completed_at = NOW(), result_data = $2 WHERE run_id = $3`,
      [finalStatus, JSON.stringify(executionState), runId]
    );

    console.log(`Execution ${runId} finished with status ${finalStatus}`);
    
  } catch (error) {
    console.error(`Execution engine failed for run ${runId}:`, error);
    await query(
      `UPDATE workflow_runs SET status = 'failed', completed_at = NOW(), result_data = $1 WHERE run_id = $2`,
      [JSON.stringify({ error: error.message }), runId]
    );
  }
}

module.exports = { executeWorkflow };
