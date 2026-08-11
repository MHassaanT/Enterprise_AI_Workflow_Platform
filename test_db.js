const { query } = require('./backend/src/db');
async function test() {
  const res = await query(`
    SELECT tr.canonical_name, tr.display_name, tc.id as credential_id
    FROM tool_registry tr
    LEFT JOIN tool_credentials tc ON tr.id = tc.tool_id
  `);
  console.log(res.rows);
  process.exit(0);
}
test();
