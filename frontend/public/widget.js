(function () {
  'use me strict';

  if (window.EnterpriseChatWidget) return;

  var scriptTag = document.currentScript;
  var defaultTenantId = scriptTag ? scriptTag.getAttribute('data-tenant-id') : null;
  var defaultApiHost = scriptTag ? scriptTag.getAttribute('data-api-host') : null;

  var config = {
    tenantId: defaultTenantId || '',
    apiHost: defaultApiHost || (scriptTag ? new URL(scriptTag.src).origin : ''),
    title: 'Customer Support',
    subtitle: 'AI Agent Powered'
  };

  var state = {
    isOpen: false,
    conversationId: null,
    messages: [],
    loading: false
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
        padding: 16px 20px;
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
        <button class="ai-widget-close-btn" id="ai-widget-close">&times;</button>
      </div>
      <div class="ai-widget-body" id="ai-widget-messages">
        <div class="ai-widget-msg ai-widget-msg-assistant">
          👋 Hello! How can I assist you today?
        </div>
      </div>
      <form class="ai-widget-footer" id="ai-widget-form">
        <input type="text" class="ai-widget-input" id="ai-widget-input-text" placeholder="Type a message..." autocomplete="off" />
        <button type="submit" class="ai-widget-send-btn" id="ai-widget-send-btn">➔</button>
      </form>
    `;

    document.body.appendChild(launcher);
    document.body.appendChild(drawer);

    document.getElementById('ai-widget-close').onclick = toggleDrawer;
    document.getElementById('ai-widget-form').onsubmit = handleSend;
  }

  function toggleDrawer() {
    state.isOpen = !state.isOpen;
    var drawer = document.getElementById('ai-widget-drawer-root');
    if (state.isOpen) {
      drawer.classList.add('open');
      initSession();
    } else {
      drawer.classList.remove('open');
    }
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
      var citationsHtml = '';

      if (!isUser && msg.citations_json) {
        try {
          var citations = typeof msg.citations_json === 'string' ? JSON.parse(msg.citations_json) : msg.citations_json;
          if (Array.isArray(citations) && citations.length > 0) {
            citationsHtml = '<div class="ai-widget-citations"><b>Sources:</b>' +
              citations.map(function (c) {
                return '<div class="ai-widget-citation-item">📄 ' + (c.filename || c.source || 'Knowledge Doc') + '</div>';
              }).join('') + '</div>';
          }
        } catch (e) {}
      }

      html += '<div class="ai-widget-msg ' + cls + '">' + escapeHtml(msg.content) + citationsHtml + '</div>';
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
