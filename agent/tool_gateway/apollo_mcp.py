"""
Apollo API Integration & MCP Tool Module (Backward Compatibility Wrapper).

Delegates account discovery requests to the Serper search discovery module.
Contact search is handled by Serper search + pattern inference.
"""
import logging
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field
from tool_gateway.search_discovery import search_company_accounts

logger = logging.getLogger(__name__)


class ApolloAccountSearchInput(BaseModel):
    tenant_id: str = Field(description="Tenant ID")
    target_industries: List[str] = Field(default_factory=list, description="Target industry names")
    company_size_min: int = Field(default=10, description="Minimum employee headcount")
    company_size_max: int = Field(default=1000, description="Maximum employee headcount")
    limit: int = Field(default=5, description="Maximum candidate accounts to return")


class ApolloContactSearchInput(BaseModel):
    tenant_id: str = Field(description="Tenant ID")
    domain: str = Field(description="Target company website domain (e.g. acme.com)")
    target_titles: List[str] = Field(default_factory=list, description="Target job role titles")


async def get_tenant_apollo_key(tenant_id: str) -> Optional[str]:
    """Deprecated key resolver stub."""
    return "DEPRECATED_SERPER_DISCOVERY"


async def search_apollo_accounts_impl(
    tenant_id: str,
    target_industries: List[str],
    company_size_min: int = 10,
    company_size_max: int = 1000,
    limit: int = 5,
    exclude_domains: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Backward-compatible wrapper for search_company_accounts."""
    return await search_company_accounts(
        tenant_id=tenant_id,
        target_industries=target_industries,
        company_size_min=company_size_min,
        company_size_max=company_size_max,
        limit=limit,
        exclude_domains=exclude_domains,
    )


async def search_apollo_contacts_impl(
    tenant_id: str,
    domain: str,
    target_titles: List[str],
) -> Dict[str, Any]:
    """
    Contact search wrapper — now delegates to Serper search + pattern inference.
    Note: This is only used by the MCP tool surface (external clients).
    The main pipeline uses contact_discovery_node directly.
    """
    try:
        from tool_gateway.search_discovery import search_contact_person
        return await search_contact_person(
            tenant_id=tenant_id,
            company_name=domain.split(".")[0].title(),
            domain=domain,
            target_titles=target_titles,
        )
    except Exception as e:
        logger.error(f"Apollo contact search wrapper exception: {e}")
        return {"status": "error", "contact": None, "reason": str(e)}
