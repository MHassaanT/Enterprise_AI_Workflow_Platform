from typing import TypedDict, List, Dict, Any, Optional

class AnalyticsAgentState(TypedDict):
    tenant_id: str
    user_query: str
    intent: str  # 'quickview' | 'text_to_sql' | 'anomaly_check' | 'executive_digest'
    generated_sql: Optional[str]
    execution_results: Optional[List[Dict[str, Any]]]
    visualization_type: Optional[str]  # 'bar' | 'line' | 'pie' | 'kpi_grid' | 'table'
    visualization_config: Optional[Dict[str, Any]]
    insights_summary: Optional[str]
    quickview_data: Optional[Dict[str, Any]]
    anomaly_alerts: Optional[List[Dict[str, Any]]]
    status: str  # 'idle' | 'analyzing' | 'completed' | 'error'
    error_message: Optional[str]
