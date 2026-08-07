'use client';
import { useEffect, useState } from 'react';
import Header from '../components/Header';
import AuthGuard from '../components/AuthGuard';
import { getUser } from '@/lib/api';

export default function WidgetSetupPage() {
  const [tenantId, setTenantId] = useState('');
  const [backendUrl, setBackendUrl] = useState('http://localhost:4000');
  const [copied, setCopied] = useState(false);
  const [copiedJs, setCopiedJs] = useState(false);

  useEffect(() => {
    const user = getUser();
    if (user && user.tenantId) {
      setTenantId(user.tenantId);
    }
    const envUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (envUrl) {
      setBackendUrl(envUrl.replace(/\/+$/, ''));
    } else if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
      setBackendUrl(window.location.origin);
    }
  }, []);

  const cleanBackendUrl = backendUrl.replace(/\/+$/, '');
  const htmlSnippet = `<script src="${cleanBackendUrl}/widget.js" data-tenant-id="${tenantId || 'YOUR_TENANT_ID'}"></script>`;

  const jsSnippet = `<script src="${cleanBackendUrl}/widget.js"></script>
<script>
  window.EnterpriseChatWidget.init({
    tenantId: "${tenantId || 'YOUR_TENANT_ID'}",
    apiHost: "${cleanBackendUrl}",
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
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <Header />

        <main className="max-w-container-max mx-auto px-lg py-xl">
          <header className="mb-xl border-b border-outline-variant pb-lg flex flex-col md:flex-row md:items-center justify-between gap-md">
            <div>
              <h1 className="font-display-lg text-display-lg text-on-surface mb-2">Embeddable Chat Widget Integration</h1>
              <p className="font-body-lg text-body-lg text-on-surface-variant max-w-2xl">
                Deploy your Customer Support AI Agent directly onto any external website with a single line of script.
              </p>
            </div>
            <div className="bg-surface-container border border-outline-variant px-lg py-md rounded-xl font-body-md text-on-surface flex items-center gap-2 whitespace-nowrap self-start md:self-center">
              <span>Tenant ID:</span> <code className="font-mono-sm text-mono-sm text-primary font-bold">{tenantId || 'Loading...'}</code>
            </div>
          </header>

          {/* Backend Host Config */}
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl mb-xl shadow-sm space-y-2">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-md">
              <label htmlFor="backendUrlInput" className="font-headline-md text-headline-md text-on-surface font-bold whitespace-nowrap">
                🌐 Backend Service API URL:
              </label>
              <input
                id="backendUrlInput"
                type="text"
                value={backendUrl}
                onChange={(e) => setBackendUrl(e.target.value)}
                placeholder="e.g. https://your-backend.up.railway.app"
                className="w-full md:flex-1 p-3 bg-surface border border-outline-variant rounded-lg text-on-surface font-mono-sm text-mono-sm focus:outline-none focus:border-primary"
              />
            </div>
            <p className="font-body-md text-body-md text-on-surface-variant">
              This host URL will be used in the script snippet below to load <code className="font-mono-sm text-mono-sm text-primary">widget.js</code> and connect the widget to your API.
            </p>
          </div>

          <div className="space-y-xl mb-xl">
            {/* HTML Method */}
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl bg-surface-container p-2 rounded-lg border border-outline-variant">⚡</span>
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface font-bold">Standard HTML Embedding (Recommended)</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant">Paste before the closing <code className="font-mono-sm text-mono-sm text-primary">&lt;/body&gt;</code> tag of your external site.</p>
                </div>
              </div>

              <div className="relative bg-surface border border-outline-variant rounded-xl p-lg overflow-x-auto">
                <pre className="font-mono-sm text-mono-sm text-primary whitespace-pre-wrap break-all">{htmlSnippet}</pre>
                <button
                  onClick={() => copyToClipboard(htmlSnippet, 'html')}
                  className="absolute top-md right-md px-md py-1.5 bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-md hover:bg-primary-container transition-colors shadow-sm"
                >
                  {copied ? '✅ Copied!' : '📋 Copy Snippet'}
                </button>
              </div>
            </div>

            {/* JS Init Method */}
            <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-md">
              <div className="flex items-center gap-3">
                <span className="text-2xl bg-surface-container p-2 rounded-lg border border-outline-variant">⚙️</span>
                <div>
                  <h3 className="font-headline-md text-headline-md text-on-surface font-bold">Programmatic JS Initialization</h3>
                  <p className="font-body-md text-body-md text-on-surface-variant">Customize titles and initial parameters programmatically.</p>
                </div>
              </div>

              <div className="relative bg-surface border border-outline-variant rounded-xl p-lg overflow-x-auto">
                <pre className="font-mono-sm text-mono-sm text-primary whitespace-pre-wrap break-all">{jsSnippet}</pre>
                <button
                  onClick={() => copyToClipboard(jsSnippet, 'js')}
                  className="absolute top-md right-md px-md py-1.5 bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-md hover:bg-primary-container transition-colors shadow-sm"
                >
                  {copiedJs ? '✅ Copied!' : '📋 Copy JS Snippet'}
                </button>
              </div>
            </div>
          </div>

          {/* Integration Guide */}
          <div className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-lg">
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">🚀 Quick Integration Checklist</h2>
            <div className="space-y-md">
              <div className="flex gap-md items-start">
                <div className="w-8 h-8 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center flex-shrink-0 font-mono">1</div>
                <div>
                  <h4 className="font-headline-md text-body-lg text-on-surface font-semibold">Copy your Tenant Embed Code</h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">Use the HTML script snippet above which contains your unique tenant key (<code className="font-mono-sm text-mono-sm text-primary">{tenantId}</code>).</p>
                </div>
              </div>

              <div className="flex gap-md items-start">
                <div className="w-8 h-8 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center flex-shrink-0 font-mono">2</div>
                <div>
                  <h4 className="font-headline-md text-body-lg text-on-surface font-semibold">Paste into External Webpage</h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">Insert the snippet into your website source code. The widget automatically initializes a floating bottom-right launcher button.</p>
                </div>
              </div>

              <div className="flex gap-md items-start">
                <div className="w-8 h-8 rounded-full bg-primary text-on-primary font-bold flex items-center justify-center flex-shrink-0 font-mono">3</div>
                <div>
                  <h4 className="font-headline-md text-body-lg text-on-surface font-semibold">Test Live Customer Interactions</h4>
                  <p className="font-body-md text-body-md text-on-surface-variant">
                    Visitors can chat directly with your AI Agent. Try opening the live demo page:
                    <a href={`${cleanBackendUrl}/demo.html`} target="_blank" rel="noreferrer" className="inline-block ml-2 text-primary font-semibold hover:underline">
                      Open Live Demo Page ↗
                    </a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
