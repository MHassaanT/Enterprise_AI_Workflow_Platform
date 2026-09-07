(function () {
  'use strict';

  if (window.EnterpriseChatWidget) return;

  var scriptTag = document.currentScript;
  var defaultTenantId = scriptTag ? scriptTag.getAttribute('data-tenant-id') : null;
  var defaultApiHost = scriptTag ? scriptTag.getAttribute('data-api-host') : null;

  var config = {
    tenantId: defaultTenantId || '',
    apiHost: defaultApiHost || (scriptTag ? new URL(scriptTag.src).origin : 'http://localhost:4000'),
    title: 'Customer Support',
    subtitle: 'AI Agent Powered'
  };

  var state = {
    isOpen: false,
    activeTab: 'chat', // 'chat' | 'issues'
    conversationId: null,
    messages: [],
    loading: false,
    issues: [],
    issuesLoading: false
  };

  function injectStyles() {
    if (document.getElementById('ai-widget-styles')) return;

    var style = document.createElement('style');
    style.id = 'ai-widget-styles';
    style.textContent = `
      .ai-widget-launcher {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 60px;
        height: 60px;
        border-radius: 50%;
        background: linear-gradient(135deg, #2563eb, #1d4ed8);
        color: #ffffff;
        box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 26px;
        z-index: 999999;
        transition: transform 0.25s ease, box-shadow 0.25s ease;
      }
      .ai-widget-launcher:hover {
        transform: scale(1.08);
        box-shadow: 0 12px 28px rgba(37, 99, 235, 0.45);
      }
      .ai-widget-badge {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 12px;
        height: 12px;
        background: #22c55e;
        border: 2px solid #ffffff;
        border-radius: 50%;
      }
      .ai-widget-drawer {
        position: fixed;
        bottom: 96px;
        right: 24px;
        width: 380px;
        max-width: calc(100vw - 32px);
        height: 580px;
        max-height: calc(100vh - 120px);
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.15);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        border: 1px solid #e2e8f0;
        opacity: 0;
        transform: translateY(20px) scale(0.95);
        pointer-events: none;
        transition: opacity 0.25s ease, transform 0.25s ease;
      }
      .ai-widget-drawer.open {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: all;
      }
      .ai-widget-header {
        background: #0f172a;
        color: #ffffff;
        padding: 16px 20px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ai-widget-header-title {
        font-weight: 700;
        font-size: 16px;
        margin: 0;
      }
      .ai-widget-header-subtitle {
        font-size: 12px;
        color: #94a3b8;
        margin: 2px 0 0 0;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ai-widget-close-btn {
        background: transparent;
        border: none;
        color: #94a3b8;
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
        line-height: 1;
      }
      .ai-widget-close-btn:hover {
        color: #ffffff;
      }
      .ai-widget-tabs {
        display: flex;
        background: #0f172a;
        border-bottom: 1px solid #334155;
        padding: 0 12px;
      }
      .ai-widget-tab-btn {
        flex: 1;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: #94a3b8;
        padding: 8px 12px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: all 0.2s;
      }
      .ai-widget-tab-btn.active {
        color: #ffffff;
        border-bottom-color: #3b82f6;
      }
      .ai-widget-tab-badge {
        background: #3b82f6;
        color: #ffffff;
        border-radius: 10px;
        padding: 1px 6px;
        font-size: 10px;
        font-weight: 700;
      }
      .ai-widget-body {
        flex: 1;
        padding: 16px;
        overflow-y: auto;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .ai-widget-msg {
        max-width: 82%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.45;
        word-wrap: break-word;
      }
      .ai-widget-msg-user {
        align-self: flex-end;
        background: #2563eb;
        color: #ffffff;
        border-bottom-right-radius: 2px;
      }
      .ai-widget-msg-assistant {
        align-self: flex-start;
        background: #ffffff;
        color: #1e293b;
        border: 1px solid #e2e8f0;
        border-bottom-left-radius: 2px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      }
      .ai-widget-citations {
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px dashed #e2e8f0;
        font-size: 11px;
        color: #64748b;
      }
      .ai-widget-citation-item {
        background: #f1f5f9;
        padding: 4px 6px;
        border-radius: 4px;
        margin-top: 4px;
        word-break: break-all;
      }
      .ai-widget-typing {
        align-self: flex-start;
        font-size: 12px;
        color: #64748b;
        font-style: italic;
        background: #ffffff;
        padding: 8px 12px;
        border-radius: 12px;
        border: 1px solid #e2e8f0;
      }
      .ai-widget-footer {
        padding: 12px 16px;
        background: #ffffff;
        border-top: 1px solid #e2e8f0;
        display: flex;
        gap: 8px;
      }
      .ai-widget-input {
        flex: 1;
        border: 1px solid #cbd5e1;
        border-radius: 20px;
        padding: 10px 16px;
        font-size: 14px;
        outline: none;
        background-color: #ffffff !important;
        color: #0f172a !important;
      }
      .ai-widget-input::placeholder {
        color: #94a3b8 !important;
      }
      .ai-widget-input:focus {
        border-color: #2563eb;
      }
      .ai-widget-send-btn {
        background: #2563eb;
        color: #ffffff;
        border: none;
        border-radius: 50%;
        width: 38px;
        height: 38px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-size: 16px;
      }
      .ai-widget-send-btn:disabled {
        background: #94a3b8;
        cursor: not-allowed;
      }
      .ai-widget-issues-panel {
        flex: 1;
        padding: 14px;
        overflow-y: auto;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .ai-widget-issue-card {
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        padding: 12px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.03);
      }
      .ai-widget-issue-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 8px;
      }
      .ai-widget-issue-title {
        font-weight: 600;
        font-size: 13px;
        color: #0f172a;
        margin: 0;
      }
      .ai-widget-issue-tag {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
        white-space: nowrap;
      }
      .ai-widget-tag-investigating { background: #dbeafe; color: #1e40af; }
      .ai-widget-tag-open { background: #fee2e2; color: #991b1b; }
      .ai-widget-tag-resolved { background: #dcfce7; color: #166534; }
      .ai-widget-issue-desc {
        font-size: 12px;
        color: #475569;
        margin: 6px 0 0 0;
        line-height: 1.4;
      }
      .ai-widget-issue-notes {
        margin-top: 8px;
        padding: 6px 8px;
        background: #f1f5f9;
        border-radius: 6px;
        font-size: 11px;
        color: #334155;
      }
      .ai-widget-issue-meta {
        margin-top: 6px;
        font-size: 10px;
        color: #94a3b8;
      }
    `;
    document.head.appendChild(style);
  }

  function createUI() {
    injectStyles();

    // Launcher
    var launcher = document.createElement('button');
    launcher.className = 'ai-widget-launcher';
    launcher.innerHTML = '💬<div class="ai-widget-badge"></div>';
    launcher.onclick = toggleDrawer;

    // Drawer
    var drawer = document.createElement('div');
    drawer.id = 'ai-widget-drawer-root';
    drawer.className = 'ai-widget-drawer';
    drawer.innerHTML = `
      <div class="ai-widget-header">
        <div>
          <h4 class="ai-widget-header-title">${config.title}</h4>
          <div class="ai-widget-header-subtitle">
            <span style="display:inline-block;width:6px;height:6px;background:#22c55e;border-radius:50%;"></span>
            ${config.subtitle}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button class="ai-widget-close-btn" id="ai-widget-reset" title="Start New Chat">↺</button>
          <button class="ai-widget-close-btn" id="ai-widget-close">&times;</button>
        </div>
      </div>
      <div class="ai-widget-tabs">
        <button class="ai-widget-tab-btn active" id="ai-widget-tab-chat">💬 Chat</button>
        <button class="ai-widget-tab-btn" id="ai-widget-tab-issues">
          ⚠️ Status & Issues <span class="ai-widget-tab-badge" id="ai-widget-issues-count" style="display:none;">0</span>
        </button>
      </div>
      <div class="ai-widget-body" id="ai-widget-messages">
        <div class="ai-widget-msg ai-widget-msg-assistant">
          👋 Hello! How can I assist you today?
        </div>
      </div>
      <div class="ai-widget-issues-panel" id="ai-widget-issues" style="display:none;">
        <div style="text-align:center;color:#64748b;font-size:13px;padding:24px 0;">Loading known issues...</div>
      </div>
      <form class="ai-widget-footer" id="ai-widget-form">
        <input type="text" class="ai-widget-input" id="ai-widget-input-text" placeholder="Type a message..." autocomplete="off" />
        <button type="submit" class="ai-widget-send-btn" id="ai-widget-send-btn">➔</button>
      </form>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(drawer);

    document.getElementById('ai-widget-close').onclick = toggleDrawer;
    document.getElementById('ai-widget-reset').onclick = function() {
      if (config.tenantId) sessionStorage.removeItem('ai_widget_convo_' + config.tenantId);
      state.conversationId = null;
      state.messages = [];
      renderMessages();
    };
    document.getElementById('ai-widget-form').onsubmit = handleSend;

    // Tab buttons
    document.getElementById('ai-widget-tab-chat').onclick = function() {
      switchTab('chat');
    };
    document.getElementById('ai-widget-tab-issues').onclick = function() {
      switchTab('issues');
    };
  }

  function switchTab(tab) {
    state.activeTab = tab;
    var chatTabBtn = document.getElementById('ai-widget-tab-chat');
    var issuesTabBtn = document.getElementById('ai-widget-tab-issues');
    var msgContainer = document.getElementById('ai-widget-messages');
    var issuesContainer = document.getElementById('ai-widget-issues');
    var formEl = document.getElementById('ai-widget-form');

    if (tab === 'chat') {
      chatTabBtn.classList.add('active');
      issuesTabBtn.classList.remove('active');
      msgContainer.style.display = 'flex';
      issuesContainer.style.display = 'none';
      formEl.style.display = 'flex';
    } else {
      chatTabBtn.classList.remove('active');
      issuesTabBtn.classList.add('active');
      msgContainer.style.display = 'none';
      issuesContainer.style.display = 'flex';
      formEl.style.display = 'none';
      fetchWidgetIssues();
    }
  }

  function toggleDrawer() {
    state.isOpen = !state.isOpen;
    var drawer = document.getElementById('ai-widget-drawer-root');
    if (state.isOpen) {
      drawer.classList.add('open');
      initSession();
      fetchWidgetIssuesCount();
    } else {
      drawer.classList.remove('open');
    }
  }

  async function fetchWidgetIssuesCount() {
    if (!config.tenantId) return;
    try {
      var res = await fetch(config.apiHost + '/api/widget/issues?tenantId=' + encodeURIComponent(config.tenantId));
      var data = await res.json();
      var count = (data && data.issues) ? data.issues.length : 0;
      var badgeEl = document.getElementById('ai-widget-issues-count');
      if (badgeEl) {
        if (count > 0) {
          badgeEl.textContent = count;
          badgeEl.style.display = 'inline-block';
        } else {
          badgeEl.style.display = 'none';
        }
      }
    } catch (e) {}
  }

  async function fetchWidgetIssues() {
    if (!config.tenantId) return;
    state.issuesLoading = true;
    renderWidgetIssues();

    try {
      var res = await fetch(config.apiHost + '/api/widget/issues?tenantId=' + encodeURIComponent(config.tenantId));
      var data = await res.json();
      state.issues = (data && data.issues) ? data.issues : [];
    } catch (e) {
      console.error('Failed to fetch widget issues', e);
      state.issues = [];
    } finally {
      state.issuesLoading = false;
      renderWidgetIssues();
    }
  }

  function renderWidgetIssues() {
    var container = document.getElementById('ai-widget-issues');
    if (!container) return;

    if (state.issuesLoading) {
      container.innerHTML = '<div style="text-align:center;color:#64748b;font-size:13px;padding:24px 0;">⚡ Loading known issues & updates...</div>';
      return;
    }

    if (state.issues.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:32px 16px;color:#64748b;">
          <div style="font-size:32px;margin-bottom:8px;">✅</div>
          <div style="font-weight:600;color:#0f172a;font-size:14px;">All Systems Operational</div>
          <p style="font-size:12px;margin:4px 0 0 0;">No active issues or outages reported at this time.</p>
        </div>
      `;
      return;
    }

    var html = '<div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;margin-bottom:4px;">Known Issues & Status Updates</div>';

    state.issues.forEach(function (issue) {
      var statusCls = issue.status === 'resolved' ? 'ai-widget-tag-resolved' : (issue.status === 'investigating' ? 'ai-widget-tag-investigating' : 'ai-widget-tag-open');
      var statusLabel = issue.status === 'resolved' ? 'Resolved' : (issue.status === 'investigating' ? 'Investigating' : 'Under Review');

      html += `
        <div class="ai-widget-issue-card">
          <div class="ai-widget-issue-header">
            <h5 class="ai-widget-issue-title">${escapeHtml(issue.title)}</h5>
            <span class="ai-widget-issue-tag ${statusCls}">${statusLabel}</span>
          </div>
          <p class="ai-widget-issue-desc">${escapeHtml(issue.description)}</p>
          ${issue.resolution_notes ? `<div class="ai-widget-issue-notes"><strong>Update:</strong> ${escapeHtml(issue.resolution_notes)}</div>` : ''}
          <div class="ai-widget-issue-meta">Reported: ${new Date(issue.created_at).toLocaleDateString()}</div>
        </div>
      `;
    });

    container.innerHTML = html;
  }

  async function initSession() {
    if (!config.tenantId) {
      console.error('EnterpriseChatWidget: tenantId not configured.');
      return;
    }

    var storageKey = 'ai_widget_convo_' + config.tenantId;
    var existingId = sessionStorage.getItem(storageKey);

    if (existingId) {
      state.conversationId = existingId;
      await fetchMessages();
    }
  }

  async function createConversation() {
    try {
      var res = await fetch(config.apiHost + '/api/widget/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: config.tenantId,
          customerIdentifier: 'Web Visitor (' + window.location.hostname + ')'
        })
      });
      var data = await res.json();
      if (data.conversation && data.conversation.id) {
        state.conversationId = data.conversation.id;
        sessionStorage.setItem('ai_widget_convo_' + config.tenantId, data.conversation.id);
      }
    } catch (e) {
      console.error('Failed to create widget conversation session', e);
    }
  }

  async function fetchMessages() {
    if (!state.conversationId) return;
    try {
      var res = await fetch(config.apiHost + '/api/widget/conversations/' + state.conversationId + '?tenantId=' + config.tenantId);
      var data = await res.json();
      if (data.messages && data.messages.length > 0) {
        state.messages = data.messages;
        renderMessages();
      }
    } catch (e) {
      console.error('Failed to fetch widget messages', e);
    }
  }

  function renderMessages() {
    var container = document.getElementById('ai-widget-messages');
    if (!container) return;

    var html = '<div class="ai-widget-msg ai-widget-msg-assistant">👋 Hello! How can I assist you today?</div>';

    state.messages.forEach(function (msg) {
      var isUser = msg.role === 'user';
      var cls = isUser ? 'ai-widget-msg-user' : 'ai-widget-msg-assistant';

      html += '<div class="ai-widget-msg ' + cls + '">' + escapeHtml(msg.content) + '</div>';
    });

    if (state.loading) {
      html += '<div class="ai-widget-typing">⚡ Agent is searching knowledge base & processing...</div>';
    }

    container.innerHTML = html;
    container.scrollTop = container.scrollHeight;
  }

  async function handleSend(e) {
    if (e) e.preventDefault();
    var inputEl = document.getElementById('ai-widget-input-text');
    var text = inputEl.value.trim();
    if (!text || state.loading) return;

    inputEl.value = '';

    if (!state.conversationId) {
      await createConversation();
    }

    if (!state.conversationId) {
      alert('Could not establish chat session. Please check tenant configuration.');
      return;
    }

    state.messages.push({ role: 'user', content: text });
    state.loading = true;
    renderMessages();

    try {
      var res = await fetch(config.apiHost + '/api/widget/conversations/' + state.conversationId + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: config.tenantId,
          content: text
        })
      });
      var data = await res.json();
      if (data.agentMessage) {
        state.messages.push(data.agentMessage);
      } else if (data.answer) {
        state.messages.push({ role: 'assistant', content: data.answer, citations_json: data.citations });
      }
    } catch (err) {
      state.messages.push({ role: 'assistant', content: '⚠️ Connection error. Please try again later.' });
    } finally {
      state.loading = false;
      renderMessages();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  window.EnterpriseChatWidget = {
    init: function (userConfig) {
      if (userConfig) {
        if (userConfig.tenantId) config.tenantId = userConfig.tenantId;
        if (userConfig.apiHost) config.apiHost = userConfig.apiHost;
        if (userConfig.title) config.title = userConfig.title;
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createUI);
      } else {
        createUI();
      }
    }
  };

  // Auto init if tenantId present in script tag
  if (config.tenantId) {
    window.EnterpriseChatWidget.init();
  }
})();
