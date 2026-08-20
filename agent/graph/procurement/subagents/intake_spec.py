import json
from typing import Dict, Any, List
try:
    from services.llm_gateway import get_llm
except ModuleNotFoundError:
    from agent.services.llm_gateway import get_llm

class IntakeSpecSubAgent:
    """
    Sub-Agent 1: Intake & Specification Sub-Agent
    Analyzes raw procurement requirement text and attached RFP documents.
    Extracts structured technical specifications, budget limits, delivery timelines, and evaluation criteria.
    """

    def process(self, title: str, description: str, budget_limit: float, department: str, documents_text: List[str] = None) -> Dict[str, Any]:
        combined_docs = "\n---\n".join(documents_text) if documents_text else "No attached specification documents."

        prompt = f"""You are an expert Procurement Intake & Specification AI Sub-Agent.
Analyze the following corporate procurement request and attached RFP specification documents:

PROJECT TITLE: {title}
DEPARTMENT: {department}
BUDGET LIMIT: ${budget_limit:,.2f}
USER DESCRIPTION:
{description}

ATTACHED SPECIFICATION DOCUMENTS:
{combined_docs}

Extract and structure the procurement requirements into a clean JSON object with the following fields:
1. "summary": A 2-3 sentence executive summary of what is needed.
2. "technical_requirements": List of key technical specifications or service deliverables.
3. "key_deliverables": Array of tangible deliverables expected from vendors.
4. "budget_cap": Target maximum budget amount ($).
5. "target_timeline": Estimated completion timeframe (e.g., "30 days", "Q4 2026").
6. "evaluation_criteria": Key factors to score vendor offers (e.g. price, SLA, warranty, lead time).
7. "preferred_certifications": ISO or industry compliance certifications required.

Return ONLY valid JSON matching this schema:
{{
  "summary": "...",
  "technical_requirements": ["..."],
  "key_deliverables": ["..."],
  "budget_cap": 50000.0,
  "target_timeline": "...",
  "evaluation_criteria": ["..."],
  "preferred_certifications": ["..."]
}}
"""
        llm = get_llm()
        response = llm.invoke(prompt)

        try:
            content = response.content
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                content = content.split("```")[1].split("```")[0].strip()
            specs = json.loads(content.strip())
        except Exception:
            specs = {
                "summary": description[:200] if description else title,
                "technical_requirements": [description] if description else ["Standard procurement"],
                "key_deliverables": ["Services/Goods as specified"],
                "budget_cap": budget_limit,
                "target_timeline": "30 days",
                "evaluation_criteria": ["Price", "Delivery Time", "Quality"],
                "preferred_certifications": ["Standard Industry Certification"]
            }

        return {
            "status": "success",
            "subagent": "intake_spec",
            "extracted_specs": specs
        }
