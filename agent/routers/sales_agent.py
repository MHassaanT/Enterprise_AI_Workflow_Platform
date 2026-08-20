"""
Sales Agent Router — FastAPI.

Exposes endpoints for running the autonomous 6-stage AI SDR pipeline,
building ICPs from the Knowledge Base, and setting Apollo API Keys.
"""
import json
import uuid
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel, Field
from config import settings
from graph.sales.graph import sales_head_graph
from services.db_client import execute_db_query

logger = logging.getLogger(__name__)
router = APIRouter()


def _normalize_uuid(val: Optional[str]) -> str:
    if not val:
        return "00000000-0000-0000-0000-000000000000"
    try:
        return str(uuid.UUID(str(val)))
    except (ValueError, TypeError, AttributeError):
        return "00000000-0000-0000-0000-000000000000"


class SalesPipelineRunRequest(BaseModel):
    tenant_id: str
    target_domain: Optional[str] = None
    prospect_limit: Optional[int] = 10
    auto_send_email: Optional[bool] = False
    icp_config: Optional[Dict[str, Any]] = None
    user_id: str = "sales_sdr"


class ApolloKeyRequest(BaseModel):
    tenant_id: str
    apollo_api_key: str


class ICPConfigRequest(BaseModel):
    tenant_id: str
    target_industries: List[str] = Field(default_factory=list)
    target_titles: List[str] = Field(default_factory=list)
    company_size_min: int = 10
    company_size_max: int = 1000
    battlecard_notes: str = ""
    playbook_strategy: str = ""


class SingleEmailSendRequest(BaseModel):
    tenant_id: str
    contact_email: str
    subject: str
    body: str
    prospect_id: Optional[str] = None


@router.post("/send-email")
async def send_single_email(
    request: SingleEmailSendRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    tenant_id = _normalize_uuid(request.tenant_id)

    credentials = {}
    try:
        from tool_gateway.credentials_manager import fetch_tool_credentials
        credentials = await fetch_tool_credentials(request.tenant_id, tool_id="gmail")
        if not credentials or not credentials.get("access_token"):
            credentials = await fetch_tool_credentials(tenant_id, tool_id="gmail")
    except Exception as e:
        logger.warning(f"Fetch credentials error: {e}")

    try:
        from tool_gateway.adapters.gmail_adapter import execute_gmail_tool
        gmail_res = await execute_gmail_tool(
            tool_name="send_email",
            arguments={"to": request.contact_email, "subject": request.subject, "body": request.body},
            credentials=credentials
        )

        if ("Successfully sent" in gmail_res or "Message ID" in gmail_res) and "Error" not in gmail_res:
            msg_id = "MSG-GMAIL-" + str(hash(request.contact_email))[-8:]
            if "Message ID: " in gmail_res:
                msg_id = f"MSG-GMAIL-{gmail_res.split('Message ID: ')[-1].strip()}"

            # Update sales_prospects record in DB
            await execute_db_query("""
            UPDATE sales_prospects
            SET deal_stage = 'OUTREACH_SENT',
                outreach_subject = $1,
                outreach_body = $2,
                gmail_message_id = $3,
                updated_at = NOW()
            WHERE contact_email = $4 OR id::text = $5;
            """, [request.subject, request.body, msg_id, request.contact_email, str(request.prospect_id or '')])

            return {
                "success": True,
                "message": f"Successfully sent email to {request.contact_email} via Gmail API!",
                "gmail_message_id": msg_id,
                "deal_stage": "OUTREACH_SENT"
            }
        else:
            return {
                "success": False,
                "error": f"Gmail dispatch note: {gmail_res}"
            }
    except Exception as e:
        return {"success": False, "error": f"Failed to send email: {str(e)}"}


@router.post("/run")
async def run_sales_agent(
    request: SalesPipelineRunRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    run_id = f"sdr-run-{Date_now_id()}"

    initial_state = {
        "tenant_id": request.tenant_id,
        "run_id": run_id,
        "user_id": request.user_id,
        "prospect_limit": request.prospect_limit or 10,
        "target_domain": request.target_domain,
        "auto_send_email": request.auto_send_email or False,
        "icp_config": request.icp_config or {},
        "raw_accounts": [],
        "scraped_context": {},
        "account_fit_passed": True,
        "discovered_contact": None,
        "deliverability_result": None,
        "icp_score": 0.0,
        "generated_outreach": None,
        "outreach_sent": False,
        "gmail_message_id": None,
        "deal_stage": "DISCOVERED",
        "quote_details": None,
        "logs": [],
        "answer": "",
    }

    config = {"configurable": {"thread_id": run_id}}

    try:
        final_state = await sales_head_graph.ainvoke(initial_state, config=config)
        outreach_batch = final_state.get("outreach_batch", [])
        processed_count = final_state.get("processed_count", len(outreach_batch))
        return {
            "success": True,
            "run_id": run_id,
            "answer": final_state.get("answer", "Sales SDR execution complete."),
            "icp_score": final_state.get("icp_score"),
            "discovered_contact": final_state.get("discovered_contact"),
            "outreach_batch": outreach_batch,
            "prospects": outreach_batch,
            "processed_count": processed_count,
            "deliverability_result": final_state.get("deliverability_result"),
            "generated_outreach": final_state.get("generated_outreach"),
            "deal_stage": final_state.get("deal_stage"),
            "gmail_message_id": final_state.get("gmail_message_id"),
            "logs": final_state.get("logs", []),
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Sales agent execution failed: {str(e)}")


@router.post("/icp/build")
async def build_icp_from_knowledge_base(
    payload: Dict[str, Any],
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    tenant_id = payload.get("tenant_id", "default_tenant")
    
    # 1. Query Knowledge Base via RAG Client
    kb_context = ""
    try:
        from services.rag_client import query_rag
        rag_res = await query_rag(
            "What products/services do we sell? What is our value proposition, target customer roles, pricing, and ideal customer profile?",
            tenant_id
        )
        chunks = rag_res.get("chunks", [])
        if chunks:
            kb_context = "\n".join([c.get("text", "") for c in chunks[:5]])
    except Exception as e:
        logger.warning(f"RAG query for ICP build failed/skipped: {e}")

    # 2. Synthesize ICP with OpenRouter LLM
    from services.llm_gateway import get_llm
    from langchain_core.messages import SystemMessage, HumanMessage

    prompt = f"""You are an expert B2B Sales Strategy Director. Analyze the following Knowledge Base context about our enterprise product offerings and synthesize a highly accurate Ideal Customer Profile (ICP).

KNOWLEDGE BASE CONTEXT:
{kb_context if kb_context else "Enterprise AI Workflow Platform with multi-agent orchestration for Finance, Procurement, HR, and Sales automation."}

INSTRUCTIONS:
Return ONLY a valid JSON object with these exact keys:
- "target_industries": list of 3 to 5 target industries (e.g. ["Software & SaaS", "Fintech", "HealthTech", "E-Commerce"])
- "target_titles": list of 3 to 5 key decision-maker titles (e.g. ["VP of Sales", "CTO", "Head of Growth", "Director of Operations"])
- "company_size_min": integer minimum headcount (e.g. 10)
- "company_size_max": integer maximum headcount (e.g. 1000)
- "battlecard_notes": summary string of key differentiators, competitive advantage, and ROI hook
- "playbook_strategy": strategy string for outreach angle

Respond ONLY with valid JSON.
"""

    llm = get_llm()
    try:
        res = await llm.ainvoke([
            SystemMessage(content="You generate structured B2B ICP JSON configurations."),
            HumanMessage(content=prompt)
        ])
        content = res.content.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        parsed_icp = json.loads(content.strip())
    except Exception as e:
        logger.warning(f"Fallback to default ICP due to: {e}")
        parsed_icp = {
            "target_industries": ["Software", "SaaS", "Fintech"],
            "target_titles": ["VP of Sales", "CTO", "Head of Growth"],
            "company_size_min": 10,
            "company_size_max": 1000,
            "battlecard_notes": "Key Differentiator: Autonomous multi-agent workflow engine with zero vendor lock-in.",
            "playbook_strategy": "Focus on operational cost savings and 10x workflow speedup.",
        }

    # Save to Database
    query = """
    INSERT INTO sales_icp_configs (
      tenant_id, target_industries, target_titles, company_size_min, company_size_max,
      battlecard_notes, playbook_strategy, updated_at
    ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      target_industries = EXCLUDED.target_industries,
      target_titles = EXCLUDED.target_titles,
      company_size_min = EXCLUDED.company_size_min,
      company_size_max = EXCLUDED.company_size_max,
      battlecard_notes = EXCLUDED.battlecard_notes,
      playbook_strategy = EXCLUDED.playbook_strategy,
      updated_at = NOW();
    """
    await execute_db_query(query, [
        tenant_id,
        json.dumps(parsed_icp.get("target_industries", [])),
        json.dumps(parsed_icp.get("target_titles", [])),
        parsed_icp.get("company_size_min", 10),
        parsed_icp.get("company_size_max", 1000),
        parsed_icp.get("battlecard_notes", ""),
        parsed_icp.get("playbook_strategy", ""),
    ])

    return {"success": True, "icp": parsed_icp}


async def _ensure_tenant_exists(tenant_id: str):
    try:
        await execute_db_query("""
        CREATE TABLE IF NOT EXISTS tenants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(255) NOT NULL,
          is_active BOOLEAN DEFAULT true,
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        """)
        await execute_db_query("""
        INSERT INTO tenants (id, name)
        VALUES ('00000000-0000-0000-0000-000000000000'::uuid, 'Default Platform Tenant')
        ON CONFLICT (id) DO NOTHING;
        """)
        if tenant_id and tenant_id != '00000000-0000-0000-0000-000000000000':
            await execute_db_query("""
            INSERT INTO tenants (id, name)
            VALUES ($1::uuid, 'Enterprise Tenant')
            ON CONFLICT (id) DO NOTHING;
            """, [tenant_id])
    except Exception as e:
        logger.warning(f"Tenant auto-seed notice: {e}")


class HunterKeyRequest(BaseModel):
    tenant_id: str
    hunter_api_key: Optional[str] = None
    apollo_api_key: Optional[str] = None


class ApolloKeyRequest(BaseModel):
    tenant_id: str
    apollo_api_key: Optional[str] = None
    hunter_api_key: Optional[str] = None


@router.post("/hunter-key")
@router.post("/apollo-key")
async def save_hunter_key(
    request: HunterKeyRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    tenant_id = _normalize_uuid(request.tenant_id)
    await _ensure_tenant_exists(tenant_id)

    raw_key = request.hunter_api_key or request.apollo_api_key or ""
    api_key = raw_key.strip().strip('"').strip("'")
    if api_key.lower().startswith("bearer "):
        api_key = api_key[7:].strip()

    # Real-time Hunter.io API key verification check
    is_valid_key = True
    error_msg = None
    if api_key and not api_key.startswith("v2_test_"):
        try:
            import httpx
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.get(
                    "https://api.hunter.io/v2/account",
                    params={"api_key": api_key}
                )
                if res.status_code in (401, 403):
                    is_valid_key = False
                    hunter_err = "Invalid API key"
                    try:
                        data = res.json()
                        if data.get("errors"):
                            hunter_err = data["errors"][0].get("details", hunter_err)
                    except Exception:
                        pass
                    error_msg = f"Hunter.io API rejected key: '{hunter_err}'. Please ensure you copied the API key from Hunter.io Dashboard -> Account -> API."
        except Exception as e:
            logger.warning(f"Could not verify Hunter.io API key via live HTTP check: {e}")

    await execute_db_query("""
    CREATE TABLE IF NOT EXISTS tenant_hunter_settings (
      tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
      hunter_api_key TEXT NOT NULL,
      is_valid BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    query = """
    INSERT INTO tenant_hunter_settings (tenant_id, hunter_api_key, is_valid, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET hunter_api_key = EXCLUDED.hunter_api_key, is_valid = EXCLUDED.is_valid, updated_at = NOW();
    """
    await execute_db_query(query, [tenant_id, api_key, is_valid_key])

    # Legacy table sync for backwards compatibility
    try:
        await execute_db_query("""
        CREATE TABLE IF NOT EXISTS tenant_apollo_settings (
          tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
          apollo_api_key TEXT NOT NULL,
          is_valid BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        """)
        await execute_db_query("""
        INSERT INTO tenant_apollo_settings (tenant_id, apollo_api_key, is_valid, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (tenant_id)
        DO UPDATE SET apollo_api_key = EXCLUDED.apollo_api_key, is_valid = EXCLUDED.is_valid, updated_at = NOW();
        """, [tenant_id, api_key, is_valid_key])
    except Exception:
        pass

    if not is_valid_key:
        return {"success": False, "is_valid": False, "error": error_msg, "message": error_msg}

    return {"success": True, "is_valid": True, "message": "Hunter.io API Key validated and saved successfully."}


@router.get("/hunter-key/{tenant_id}")
@router.get("/apollo-key/{tenant_id}")
async def get_hunter_key_status(
    tenant_id: str,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    normalized_tenant_id = _normalize_uuid(tenant_id)
    await _ensure_tenant_exists(normalized_tenant_id)

    # 1. Check MCP tool credentials
    try:
        from tool_gateway.hunter_mcp import get_tenant_hunter_credentials
        creds = await get_tenant_hunter_credentials(normalized_tenant_id)
        if creds and (creds.get("api_key") or creds.get("secret_key")):
            return {"configured": True, "is_valid": True, "source": "mcp_hub"}
    except Exception:
        pass

    query = "SELECT is_valid, updated_at FROM tenant_hunter_settings WHERE tenant_id = $1 OR tenant_id = '00000000-0000-0000-0000-000000000000' ORDER BY updated_at DESC;"
    try:
        res = await execute_db_query(query, [normalized_tenant_id])
        if res and res.get("rows") and len(res["rows"]) > 0:
            return {"configured": True, "is_valid": res["rows"][0].get("is_valid", True)}
    except Exception:
        pass

    return {"configured": False, "is_valid": False}


@router.post("/icp")
async def save_icp_config(
    request: ICPConfigRequest,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    tenant_id = _normalize_uuid(request.tenant_id)
    await _ensure_tenant_exists(tenant_id)
    await execute_db_query("""
    CREATE TABLE IF NOT EXISTS sales_icp_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
      target_industries JSONB DEFAULT '["Software", "SaaS"]'::jsonb,
      target_titles JSONB DEFAULT '["VP of Sales", "CTO"]'::jsonb,
      company_size_min INT DEFAULT 10,
      company_size_max INT DEFAULT 1000,
      battlecard_notes TEXT DEFAULT '',
      playbook_strategy TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    query = """
    INSERT INTO sales_icp_configs (
      tenant_id, target_industries, target_titles, company_size_min, company_size_max,
      battlecard_notes, playbook_strategy, updated_at
    ) VALUES ($1, $2::jsonb, $3::jsonb, $4, $5, $6, $7, NOW())
    ON CONFLICT (tenant_id)
    DO UPDATE SET
      target_industries = EXCLUDED.target_industries,
      target_titles = EXCLUDED.target_titles,
      company_size_min = EXCLUDED.company_size_min,
      company_size_max = EXCLUDED.company_size_max,
      battlecard_notes = EXCLUDED.battlecard_notes,
      playbook_strategy = EXCLUDED.playbook_strategy,
      updated_at = NOW();
    """
    await execute_db_query(query, [
        tenant_id,
        json.dumps(request.target_industries),
        json.dumps(request.target_titles),
        request.company_size_min,
        request.company_size_max,
        request.battlecard_notes,
        request.playbook_strategy,
    ])
    return {"success": True, "message": "ICP configuration updated."}


@router.get("/icp/{tenant_id}")
async def get_icp_config(
    tenant_id: str,
    x_internal_token: str = Header(alias="X-Internal-Token"),
):
    if x_internal_token != settings.INTERNAL_SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized.")

    normalized_tenant_id = _normalize_uuid(tenant_id)
    await _ensure_tenant_exists(normalized_tenant_id)
    await execute_db_query("""
    CREATE TABLE IF NOT EXISTS sales_icp_configs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL UNIQUE,
      target_industries JSONB DEFAULT '["Software", "SaaS"]'::jsonb,
      target_titles JSONB DEFAULT '["VP of Sales", "CTO"]'::jsonb,
      company_size_min INT DEFAULT 10,
      company_size_max INT DEFAULT 1000,
      battlecard_notes TEXT DEFAULT '',
      playbook_strategy TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    """)

    query = "SELECT * FROM sales_icp_configs WHERE tenant_id = $1 OR tenant_id = '00000000-0000-0000-0000-000000000000' ORDER BY updated_at DESC;"
    res = await execute_db_query(query, [normalized_tenant_id])
    if res and res.get("rows") and len(res["rows"]) > 0:
        return {"success": True, "icp": res["rows"][0]}
    return {
        "success": True,
        "icp": {
            "target_industries": ["Software", "SaaS", "Fintech"],
            "target_titles": ["VP of Sales", "CTO", "Head of Growth"],
            "company_size_min": 10,
            "company_size_max": 1000,
            "battlecard_notes": "Key Differentiator: Zero vendor lock-in with 99.9% uptime SLA.",
            "playbook_strategy": "Focus on operational efficiency & rapid ROI.",
        }
    }


def Date_now_id():
    import time
    return int(time.time() * 1000)
