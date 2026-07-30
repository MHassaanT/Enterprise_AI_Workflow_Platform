'use client';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import AuthGuard from '../components/AuthGuard';
import { getUser } from '@/lib/api';

export default function WidgetSetupPage() {
  const [tenantId, setTenantId] = useState('');
  const [copied, setCopied] = useState(false);
  const [copiedJs, setCopiedJs] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (user && user.tenantId) {
      setTenantId(user.tenantId);
    }
  }, []);

  const htmlSnippet = `<script src="http://localhost:4000/widget.js" data-tenant-id="${tenantId || 'YOUR_TENANT_ID'}"></script>`;

  const jsSnippet = `<script src="http://localhost:4000/widget.js"></script>
<script>
  window.EnterpriseChatWidget.init({
    tenantId: "${tenantId || 'YOUR_TENANT_ID'}",
    title: "Customer Support",
    subtitle: "AI Agent Powered"
  });
</script>`;

  const copyToClipboard = (text, type) => {
    navigator.clipboard.writeText(text);
    if (type === 'html') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      setCopiedJs(true);
      setTimeout(() => setCopiedJs(false), 2000);
    }
  };

  return (
    <AuthGuard>
      <div className="page-wrapper">
        <Header />

        <main className="main-content">
          <div className="page-header">
            <div>
              <h1 className="page-title">Embeddable Chat Widget Integration</h1>
              <p className="page-subtitle">
                Deploy your Customer Support AI Agent directly onto any external website with a single line of script.
              </p>
            </div>
            <div className="tenant-id-badge">
              <span>Tenant ID:</span> <code>{tenantId || 'Loading...'}</code>
            </div>
          </div>

          <div className="content-grid">
            {/* HTML Method */}
            <div className="card">
              <div className="card-header">
                <span className="card-icon">⚡</span>
                <div>
                  <h3>Standard HTML Embedding (Recommended)</h3>
                  <p className="card-subtitle">Paste before the closing <code>&lt;/body&gt;</code> tag of your external site.</p>
                </div>
              </div>

              <div className="code-container">
                <pre>{htmlSnippet}</pre>
                <button
                  onClick={() => copyToClipboard(htmlSnippet, 'html')}
                  className="copy-btn"
                >
                  {copied ? '✅ Copied!' : '📋 Copy Snippet'}
                </button>
              </div>
            </div>

            {/* JS Init Method */}
            <div className="card">
              <div className="card-header">
                <span className="card-icon">⚙️</span>
                <div>
                  <h3>Programmatic JS Initialization</h3>
                  <p className="card-subtitle">Customize titles and initial parameters programmatically.</p>
                </div>
              </div>

              <div className="code-container">
                <pre>{jsSnippet}</pre>
                <button
                  onClick={() => copyToClipboard(jsSnippet, 'js')}
                  className="copy-btn"
                >
                  {copiedJs ? '✅ Copied!' : '📋 Copy JS Snippet'}
                </button>
              </div>
            </div>
          </div>

          {/* Integration Guide */}
          <div className="guide-card">
            <h2>🚀 Quick Integration Checklist</h2>
            <div className="steps-list">
              <div className="step-item">
                <div className="step-num">1</div>
                <div className="step-body">
                  <h4>Copy your Tenant Embed Code</h4>
                  <p>Use the HTML script snippet above which contains your unique tenant key (<code>{tenantId}</code>).</p>
                </div>
              </div>

              <div className="step-item">
                <div className="step-num">2</div>
                <div className="step-body">
                  <h4>Paste into External Webpage</h4>
                  <p>Insert the snippet into your website source code. The widget automatically initializes a floating bottom-right launcher button.</p>
                </div>
              </div>

              <div className="step-item">
                <div className="step-num">3</div>
                <div className="step-body">
                  <h4>Test Live Customer Interactions</h4>
                  <p>
                    Visitors can chat directly with your AI Agent. Try opening the local demo page:
                    <a href="http://localhost:4000/demo.html" target="_blank" rel="noreferrer" className="demo-link">
                      Open Local Demo Page ↗
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>

        <style jsx>{`
          .page-wrapper {
            min-height: 100vh;
            background: #f8fafc;
          }
          .main-content {
            max-width: 1200px;
            margin: 2rem auto;
            padding: 0 1.5rem;
          }
          .page-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 2rem;
          }
          .page-title {
            font-size: 1.75rem;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
          }
          .page-subtitle {
            color: #64748b;
            margin: 0.25rem 0 0 0;
            font-size: 0.95rem;
          }
          .tenant-id-badge {
            background: #ffffff;
            border: 1px solid #cbd5e1;
            padding: 0.5rem 1rem;
            border-radius: 10px;
            font-size: 0.85rem;
            color: #334155;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            box-shadow: 0 2px 6px rgba(0,0,0,0.03);
          }
          .tenant-id-badge code {
            color: #2563eb;
            font-weight: 700;
          }
          .content-grid {
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            margin-bottom: 2rem;
          }
          .card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 1.75rem;
            box-shadow: 0 4px 12px rgba(0,0,0,0.03);
          }
          .card-header {
            display: flex;
            align-items: center;
            gap: 0.85rem;
            margin-bottom: 1.25rem;
          }
          .card-icon {
            font-size: 1.5rem;
            background: #eff6ff;
            padding: 0.4rem 0.6rem;
            border-radius: 8px;
          }
          .card-header h3 {
            margin: 0;
            font-size: 1.1rem;
            font-weight: 700;
            color: #0f172a;
          }
          .card-subtitle {
            margin: 0.2rem 0 0 0;
            font-size: 0.85rem;
            color: #64748b;
          }
          .code-container {
            position: relative;
            background: #0f172a;
            border-radius: 10px;
            padding: 1.25rem;
            overflow-x: auto;
          }
          .code-container pre {
            margin: 0;
            color: #38bdf8;
            font-family: monospace;
            font-size: 0.9rem;
            white-space: pre-wrap;
            word-break: break-all;
          }
          .copy-btn {
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: rgba(255, 255, 255, 0.1);
            color: #ffffff;
            border: 1px solid rgba(255, 255, 255, 0.2);
            padding: 0.4rem 0.85rem;
            border-radius: 6px;
            font-size: 0.8rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
          }
          .copy-btn:hover {
            background: rgba(255, 255, 255, 0.25);
          }
          .guide-card {
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            padding: 2rem;
          }
          .guide-card h2 {
            margin: 0 0 1.5rem 0;
            font-size: 1.25rem;
            color: #0f172a;
          }
          .steps-list {
            display: flex;
            flex-direction: column;
            gap: 1.25rem;
          }
          .step-item {
            display: flex;
            gap: 1rem;
            align-items: flex-start;
          }
          .step-num {
            background: #2563eb;
            color: #ffffff;
            width: 28px;
            height: 28px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 0.85rem;
            flex-shrink: 0;
          }
          .step-body h4 {
            margin: 0 0 0.25rem 0;
            font-size: 0.95rem;
            color: #1e293b;
          }
          .step-body p {
            margin: 0;
            font-size: 0.875rem;
            color: #64748b;
            line-height: 1.5;
          }
          .demo-link {
            display: inline-block;
            margin-left: 0.5rem;
            color: #2563eb;
            font-weight: 600;
            text-decoration: none;
          }
          .demo-link:hover {
            text-decoration: underline;
          }
        `}</style>
      </div>
    </AuthGuard>
  );
}
