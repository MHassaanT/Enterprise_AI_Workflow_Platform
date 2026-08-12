import asyncio
import asyncpg
import json

DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/enterprise_ai"

async def main():
    try:
        conn = await asyncpg.connect(DATABASE_URL)
        rows = await conn.fetch("SELECT workflow_id, status, definition FROM workflows")
        for row in rows:
            print(f"Workflow ID: {row['workflow_id']}, Status: {row['status']}")
            def_dict = json.loads(row['definition'])
            nodes = def_dict.get('nodes', [])
            if isinstance(nodes, dict):
                nodes = list(nodes.values())
            trigger_nodes = [n for n in nodes if n.get('type') == 'TRIGGER']
            for t in trigger_nodes:
                data = t.get('data', {})
                print(f"  Trigger: type={t.get('type')}, triggerMode={data.get('triggerMode')}, appIntegration={data.get('appIntegration')}")
        await conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == '__main__':
    asyncio.run(main())
