import '@/app/designTokens.css';

export async function fetchConversations() {
  const res = await fetch('/api/conversations', { method: 'GET' });
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function fetchMessages(conversationId) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, { method: 'GET' });
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export async function sendMessage(conversationId, text) {
  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: text })
  });
  if (!res.ok) throw new Error('Failed to send message');
  return res.json();
}

export async function patchApproval(approvalId, decision) {
  const res = await fetch(`/api/conversations/approvals/${approvalId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ decision })
  });
  if (!res.ok) throw new Error('Failed to update approval');
  return res.json();
}
