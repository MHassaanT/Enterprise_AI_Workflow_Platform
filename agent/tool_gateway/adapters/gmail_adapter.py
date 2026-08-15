"""
Gmail Adapter — translates tool requests to Gmail REST API.
Injects decrypted OAuth2 access token as Bearer token into HTTP headers.
"""
from typing import Dict, Any
import httpx
import base64
from email.message import EmailMessage


async def execute_gmail_tool(tool_name: str, arguments: Dict[str, Any], credentials: Dict[str, Any]) -> str:
    """
    Executes Gmail API calls using tenant OAuth access token.
    """
    token = credentials.get("access_token") or credentials.get("bearer_token")
    if not token:
        return "Error: Gmail access token is missing from tenant credentials. Please connect Gmail via OAuth2."

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    action = arguments.get("action") or tool_name
    action_lower = action.lower()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # 1. Fetch Inbox (List Messages)
            if "inbox" in action_lower or "list" in action_lower or "query" in action_lower or "search" in action_lower:
                q = arguments.get("q", "")
                max_results = arguments.get("limit", 10)
                url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
                params = {"q": q, "maxResults": max_results}
                
                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    data = res.json()
                    messages = data.get("messages", [])
                    if not messages:
                        return f"No messages found for query: '{q}'."
                    return f"Found {len(messages)} messages: {messages}"
                
                # Check for rate limit
                if res.status_code == 429:
                    return "Error: Gmail API rate limit exceeded (HTTP 429). Please try again later."
                    
                return f"Gmail API Error ({res.status_code}): {res.text}"

            # 2. Read Specific Thread / Message
            elif "read" in action_lower or "thread" in action_lower or "message" in action_lower or "get" in action_lower:
                msg_id = arguments.get("id") or arguments.get("message_id") or arguments.get("thread_id")
                if not msg_id:
                    return "Error: 'id' or 'message_id' is required to read a message or thread."
                
                url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}"
                params = {"format": "full"}
                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    msg = res.json()
                    snippet = msg.get("snippet", "")
                    headers_list = msg.get("payload", {}).get("headers", [])
                    subject = next((h["value"] for h in headers_list if h["name"] == "Subject"), "No Subject")
                    sender = next((h["value"] for h in headers_list if h["name"] == "From"), "Unknown Sender")
                    
                    return f"Subject: {subject}\nFrom: {sender}\nSnippet: {snippet}"
                
                if res.status_code == 429:
                    return "Error: Gmail API rate limit exceeded (HTTP 429). Please try again later."
                    
                return f"Gmail API Error ({res.status_code}): {res.text}"

            # 3. Send Email
            elif "send" in action_lower or "email" in action_lower:
                to = arguments.get("to")
                subject = arguments.get("subject", "No Subject")
                body = arguments.get("body", "")
                html = arguments.get("html", "")
                
                if not to:
                    return "Error: 'to' recipient address is required to send an email."
                
                msg = EmailMessage()
                msg['To'] = to
                msg['Subject'] = subject
                msg.set_content(body)
                if html:
                    msg.add_alternative(html, subtype='html')
                
                raw_message = base64.urlsafe_b64encode(msg.as_bytes()).decode('utf-8')
                
                url = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
                payload = {"raw": raw_message}
                
                res = await client.post(url, headers=headers, json=payload)
                if res.is_success:
                    sent_data = res.json()
                    return f"Successfully sent email to '{to}'. Message ID: {sent_data.get('id')}"
                
                if res.status_code == 429:
                    return "Error: Gmail API rate limit exceeded (HTTP 429). Please try again later."
                    
                return f"Gmail API Error ({res.status_code}): {res.text}"
            
            # 4. Read Full Email Body (decoded base64 parts)
            elif "read_full" in action_lower or "full_body" in action_lower:
                msg_id = arguments.get("id") or arguments.get("message_id")
                if not msg_id:
                    return "Error: 'id' or 'message_id' is required to read full email body."
                
                url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}"
                params = {"format": "full"}
                res = await client.get(url, headers=headers, params=params)
                if res.is_success:
                    msg = res.json()
                    headers_list = msg.get("payload", {}).get("headers", [])
                    subject = next((h["value"] for h in headers_list if h["name"] == "Subject"), "No Subject")
                    sender = next((h["value"] for h in headers_list if h["name"] == "From"), "Unknown Sender")
                    date = next((h["value"] for h in headers_list if h["name"] == "Date"), "")
                    
                    # Recursively extract body text from parts
                    def extract_body(payload):
                        body_text = ""
                        if payload.get("body", {}).get("data"):
                            body_text += base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")
                        for part in payload.get("parts", []):
                            mime = part.get("mimeType", "")
                            if mime in ["text/plain", "text/html"]:
                                if part.get("body", {}).get("data"):
                                    body_text += base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="replace")
                            elif "multipart" in mime:
                                body_text += extract_body(part)
                        return body_text
                    
                    body = extract_body(msg.get("payload", {}))
                    return f"Subject: {subject}\nFrom: {sender}\nDate: {date}\n\n{body}"
                
                return f"Gmail API Error ({res.status_code}): {res.text}"
            
            # 5. Get Attachments
            elif "attachment" in action_lower or "download" in action_lower:
                msg_id = arguments.get("id") or arguments.get("message_id")
                if not msg_id:
                    return "Error: 'id' or 'message_id' is required to get attachments."
                
                # First get the message to find attachment metadata
                url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}"
                params = {"format": "full"}
                res = await client.get(url, headers=headers, params=params)
                if not res.is_success:
                    return f"Gmail API Error ({res.status_code}): {res.text}"
                
                msg = res.json()
                attachments = []
                
                def find_attachments(payload, attachments_list):
                    for part in payload.get("parts", []):
                        filename = part.get("filename", "")
                        if filename and part.get("body", {}).get("attachmentId"):
                            attachments_list.append({
                                "filename": filename,
                                "mimeType": part.get("mimeType", ""),
                                "attachmentId": part["body"]["attachmentId"],
                                "size": part["body"].get("size", 0),
                            })
                        if part.get("parts"):
                            find_attachments(part, attachments_list)
                
                find_attachments(msg.get("payload", {}), attachments)
                
                if not attachments:
                    return "No attachments found in this email."
                
                # Download each attachment
                results = []
                for att in attachments:
                    att_url = f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg_id}/attachments/{att['attachmentId']}"
                    att_res = await client.get(att_url, headers=headers)
                    if att_res.is_success:
                        att_data = att_res.json()
                        results.append({
                            "filename": att["filename"],
                            "mimeType": att["mimeType"],
                            "size": att["size"],
                            "data": att_data.get("data", ""),  # base64url encoded
                        })
                
                import json
                return json.dumps({"attachments": results})
            
            else:
                return f"Error: Unsupported Gmail action '{action}'."

    except Exception as e:
        return f"Gmail execution exception: {str(e)}"
