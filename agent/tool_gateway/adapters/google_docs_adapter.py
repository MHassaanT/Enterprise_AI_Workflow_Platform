"""
Google Docs Adapter — translates tool requests to Google Docs REST API (v1).
Injects decrypted OAuth2 access token as Bearer token into HTTP headers.
"""
from typing import Dict, Any
import httpx


async def execute_google_docs_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    """
    Executes Google Docs API calls (read document, append text, create document) using tenant OAuth access token.
    """
    token = credentials.get("access_token") or credentials.get("bearer_token")
    if not token:
        return "Error: Google Docs access token is missing from tenant credentials. Please connect Google Docs via OAuth2."

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    action = arguments.get("action") or tool_name
    action_lower = action.lower()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Create New Document
            if "create" in action_lower or "new" in action_lower or "create_document" in action_lower:
                title = arguments.get("title") or "Untitled Document"
                url = "https://docs.googleapis.com/v1/documents"
                payload = {"title": title}

                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    doc = res.json()
                    doc_id = doc.get("documentId")
                    doc_title = doc.get("title")
                    return f"Successfully created Google Doc '{doc_title}' (Document ID: {doc_id})."

                if res.status_code == 429:
                    return "Error: Google Docs API rate limit exceeded (HTTP 429). Please try again later."
                return f"Google Docs API Error ({res.status_code}): {res.text}"

            # 2. Append Text to Document
            elif "append" in action_lower or "insert" in action_lower or "write" in action_lower or "append_text" in action_lower:
                doc_id = arguments.get("document_id") or arguments.get("documentId") or arguments.get("id")
                text = arguments.get("text") or arguments.get("content") or ""

                if not doc_id:
                    return "Error: 'document_id' is required to append text to a Google Doc."
                if not text:
                    return "Error: 'text' content is required to append text to a Google Doc."

                url = f"https://docs.googleapis.com/v1/documents/{doc_id}:batchUpdate"
                payload = {
                    "requests": [
                        {
                            "insertText": {
                                "text": text,
                                "endOfSegmentLocation": {}
                            }
                        }
                    ]
                }

                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    return f"Successfully appended text to Google Doc (ID: {doc_id})."

                if res.status_code == 429:
                    return "Error: Google Docs API rate limit exceeded (HTTP 429). Please try again later."
                return f"Google Docs API Error ({res.status_code}): {res.text}"

            # 3. Read Document Text
            elif "read" in action_lower or "get" in action_lower or "fetch" in action_lower or "read_document" in action_lower:
                doc_id = arguments.get("document_id") or arguments.get("documentId") or arguments.get("id")
                if not doc_id:
                    return "Error: 'document_id' is required to read a Google Doc."

                url = f"https://docs.googleapis.com/v1/documents/{doc_id}"
                res = await client.get(url, headers=headers)
                if res.is_success:
                    doc = res.json()
                    title = doc.get("title", "Untitled")
                    body = doc.get("body", {})
                    content_elements = body.get("content", [])

                    text_parts = []
                    for elem in content_elements:
                        paragraph = elem.get("paragraph")
                        if paragraph:
                            for p_elem in paragraph.get("elements", []):
                                text_run = p_elem.get("textRun")
                                if text_run and "content" in text_run:
                                    text_parts.append(text_run["content"])

                    full_text = "".join(text_parts).strip()
                    return f"Title: {title}\nDocument ID: {doc_id}\nContent:\n{full_text}"

                if res.status_code == 429:
                    return "Error: Google Docs API rate limit exceeded (HTTP 429). Please try again later."
                return f"Google Docs API Error ({res.status_code}): {res.text}"

            else:
                return f"Error: Unsupported Google Docs action '{action}'."

    except Exception as e:
        return f"Google Docs execution exception: {str(e)}"
