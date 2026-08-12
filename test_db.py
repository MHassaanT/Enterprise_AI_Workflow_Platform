import asyncio
from agent.db_workflows import get_db_pool

async def main():
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        workflows = await conn.fetch("SELECT workflow_id, definition, status FROM workflows")
        for wf in workflows:
            print(f"ID: {wf['workflow_id']}, Status: {wf['status']}")
            print(f"Def: {wf['definition'][:500]}...")

if __name__ == "__main__":
    asyncio.run(main())
