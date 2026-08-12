const { Client } = require('pg');

async function main() {
  const client = new Client({ connectionString: 'postgresql://postgres:postgres@localhost:5432/enterprise_ai' });
  await client.connect();
  const res = await client.query("SELECT workflow_id, status, definition FROM workflows");
  for (const row of res.rows) {
    console.log(`Workflow ID: ${row.workflow_id}, Status: ${row.status}`);
    const def = row.definition;
    const nodes = Array.isArray(def.nodes) ? def.nodes : Object.values(def.nodes || {});
    const triggerNodes = nodes.filter(n => n.type === 'TRIGGER');
    for (const t of triggerNodes) {
      console.log(`  Trigger: type=${t.type}, triggerMode=${t.data?.triggerMode}, appIntegration=${t.data?.appIntegration}`);
    }
  }
  await client.end();
}
main().catch(console.error);
