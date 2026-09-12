'use client';

import { useState, useEffect, useRef } from 'react';
import AuthGuard from '../components/AuthGuard';
import {
  fetchToolRegistry,
  connectIntegration,
  connectStripeCredentials,
  fetchAgents,
  fetchAgentConfig,
  updateAgentConfig,
  getUser,
  getToken,
} from '@/lib/api';

// Pre-seeded integration definitions for visual consistency
const SEEDED_INTEGRATIONS = [
  {
    id: 'safepay-card',
    canonical_name: 'SafePay',
    display_name: 'SafePay Payment Gateway',
    provider_type: 'safepay',
    auth_mode: 'api_key',
    description: 'Process payment verification, refunds, and checkout link generation with encrypted secret keys.',
    category: 'Payments & Billing',
    icon: '💳',
    gradient: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
    fields: [
      { name: 'secret_key', label: 'Secret Key', type: 'password', placeholder: 'sec_live_sk_...' }
    ]
  },
  {
    id: 'supabase-card',
    canonical_name: 'Supabase',
    display_name: 'Supabase Database Hub',
    provider_type: 'supabase',
    auth_mode: 'api_key',
    description: 'Execute PostgREST queries, row-level mutations, and table lookups with service role authority.',
    category: 'Database & Backend',
    icon: '⚡',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    fields: [
      { name: 'project_url', label: 'Project URL', type: 'url', placeholder: 'https://xyzcompany.supabase.co' },
      { name: 'service_role_key', label: 'Service Role Key', type: 'password', placeholder: 'eyJhbGciOiJIUzI1NiIsInR5c...' }
    ]
  },
  {
    id: 'stripe-card',
    canonical_name: 'Stripe',
    display_name: 'Stripe B2B Billing & Payments',
    provider_type: 'stripe',
    auth_mode: 'api_key',
    description: 'Check subscription statuses, process customer refunds, and inspect charges with encrypted keys.',
    category: 'Payments & Billing',
    icon: '💳',
    gradient: 'linear-gradient(135deg, #635bff 0%, #32325d 100%)',
    fields: [
      { name: 'api_key', label: 'Restricted API Key', type: 'password', placeholder: 'rk_live_... / rk_test_...' }
    ]
  },
  {
    id: 'github-card',
    canonical_name: 'GitHub',
    display_name: 'GitHub Developer Platform',
    provider_type: 'github',
    auth_mode: 'oauth2',
    description: 'Manage repositories, track issues, inspect pull requests, and trigger workflow dispatches via OAuth2.',
    category: 'Developer Tools',
    icon: '🐙',
    gradient: 'linear-gradient(135deg, #24292e 0%, #040d21 100%)',
  },
  {
    id: 'vercel-card',
    canonical_name: 'Vercel',
    display_name: 'Vercel Cloud Platform',
    provider_type: 'vercel',
    auth_mode: 'oauth2',
    description: 'Inspect cloud deployments, check project build statuses, and manage environments via OAuth2.',
    category: 'Cloud & Infrastructure',
    icon: '▲',
    gradient: 'linear-gradient(135deg, #000000 0%, #1a1a1a 100%)',
  },
  {
    id: 'airtable-card',
    canonical_name: 'Airtable',
    display_name: 'Airtable Relational DB',
    provider_type: 'airtable',
    auth_mode: 'oauth2',
    description: 'Query base records, create rows, and inspect schema structures via OAuth2.',
    category: 'Database & Backend',
    icon: '📊',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  },
  {
    id: 'hubspot-card',
    canonical_name: 'HubSpot',
    display_name: 'HubSpot CRM Platform',
    provider_type: 'hubspot',
    auth_mode: 'oauth2',
    description: 'Search contacts, create deals, and manage customer support tickets via OAuth2.',
    category: 'Sales & CRM',
    icon: '🧡',
    gradient: 'linear-gradient(135deg, #ff7a59 0%, #ff522b 100%)',
  },
  {
    id: 'clickup-card',
    canonical_name: 'ClickUp',
    display_name: 'ClickUp Project Workspace',
    provider_type: 'clickup',
    auth_mode: 'oauth2',
    description: 'Create tasks, query team workspace task lists, and update statuses via OAuth2.',
    category: 'Project Management',
    icon: '🎯',
    gradient: 'linear-gradient(135deg, #7b68ee 0%, #5f4bb6 100%)',
  },
  {
    id: 'gmail-card',
    canonical_name: 'Gmail',
    display_name: 'Gmail (Google Workspace)',
    provider_type: 'gmail',
    auth_mode: 'oauth2',
    description: 'Query your inbox, read email threads, and send emails securely via Google OAuth2.',
    category: 'Productivity',
    icon: '📧',
    gradient: 'linear-gradient(135deg, #ea4335 0%, #c5221f 100%)',
  },
  {
    id: 'google-docs-card',
    canonical_name: 'Google Docs',
    display_name: 'Google Docs (Google Workspace)',
    provider_type: 'google_docs',
    auth_mode: 'oauth2',
    description: 'Read document text, append text, and create new documents via Google OAuth2.',
    category: 'Productivity',
    icon: '📄',
    gradient: 'linear-gradient(135deg, #4285f4 0%, #1a73e8 100%)',
  },
  {
    id: 'google-sheets-card',
    canonical_name: 'Google Sheets',
    display_name: 'Google Sheets (Google Workspace)',
    provider_type: 'google_sheets',
    auth_mode: 'oauth2',
    description: 'Read cell ranges, update spreadsheet rows, and create new spreadsheets via Google OAuth2.',
    category: 'Productivity',
    icon: '📊',
    gradient: 'linear-gradient(135deg, #34a853 0%, #1e8e3e 100%)',
  },
  {
    id: 'whatsapp-card',
    canonical_name: 'WhatsApp',
    display_name: 'WhatsApp Business Channel',
    provider_type: 'whatsapp',
    auth_mode: 'qr_pairing',
    description: 'Connect your business WhatsApp number via QR code to receive inbound customer inquiries and dispatch agent replies.',
    category: 'Communication Channels',
    icon: '💬',
    gradient: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
  }
];

export default function IntegrationHubPage() {
  const [user, setUser] = useState(() => (typeof window !== 'undefined' ? getUser() : null));
  const [integrations, setIntegrations] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agentBindings, setAgentBindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Modal State
  const [activeModal, setActiveModal] = useState(null); // 'SafePay' | 'Supabase' | 'Stripe' | null
  const [modalTarget, setModalTarget] = useState(null);
  
  // SafePay Modal Fields
  const [safePaySecret, setSafePaySecret] = useState('');

  // Supabase Modal Fields
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseKey, setSupabaseKey] = useState('');

  // Stripe Modal Fields
  const [stripeApiKey, setStripeApiKey] = useState('');

  // Hunter.io Modal Fields
  const [hunterApiKey, setHunterApiKey] = useState('');

  // WhatsApp QR, Pairing Code & SSE Stream State
  const [waStatus, setWaStatus] = useState('disconnected'); // 'disconnected' | 'connecting' | 'qr_pending' | 'connected'
  const [waQr, setWaQr] = useState(null);
  const [waPhoneNumber, setWaPhoneNumber] = useState(null);
  const [waEventSource, setWaEventSource] = useState(null);
  const [waLoading, setWaLoading] = useState(false);
  const [waPairMode, setWaPairMode] = useState('qr'); // 'qr' | 'code'
  const [waPairPhone, setWaPairPhone] = useState('');
  const [waPairCode, setWaPairCode] = useState(null);
  const [waPairCodeLoading, setWaPairCodeLoading] = useState(false);
  const [waPairError, setWaPairError] = useState('');
  const waPollRef = useRef(null);

  // Form state for binding a tool to selected agent
  const [newToolName, setNewToolName] = useState('');
  const [newToolConnector, setNewToolConnector] = useState('builtin');
  const [newToolIsHighRisk, setNewToolIsHighRisk] = useState(false);
  const [newToolDescription, setNewToolDescription] = useState('');

  const loadAgentConfig = async (agentId) => {
    try {
      const config = await fetchAgentConfig(agentId);
      setAgentBindings(config.tool_bindings || []);
    } catch (err) {
      console.error('Error loading agent config:', err);
    }
  };

  const loadInitialData = async () => {
    try {
      setLoading(true);
      const token = getToken() || (typeof window !== 'undefined' ? localStorage.getItem('ai_platform_token') : '');
      const [registryTools, agentList, waStatusData] = await Promise.all([
        fetchToolRegistry().catch(() => []),
        fetchAgents().catch(() => []),
        fetch('/api/whatsapp/status', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }).then((r) => r.ok ? r.json() : null).catch(() => null),
      ]);

      if (waStatusData) {
        setWaStatus(waStatusData.status || 'disconnected');
        setWaPhoneNumber(waStatusData.phoneNumber || null);
        if (waStatusData.qr) setWaQr(waStatusData.qr);
      }

      // Merge backend registry tool statuses into seeded cards
      const merged = SEEDED_INTEGRATIONS.map((seed) => {
        if (seed.provider_type === 'whatsapp') {
          const isConnected = waStatusData?.status === 'connected';
          return {
            ...seed,
            isConnected,
            phoneNumber: waStatusData?.phoneNumber || null,
            status: waStatusData?.status || 'disconnected',
            updated_at: waStatusData?.connectedAt,
          };
        }

        const matched = registryTools.find(
          (t) => t.canonical_name.toLowerCase() === seed.canonical_name.toLowerCase()
        );
        return {
          ...seed,
          tool_id: matched?.id || seed.id,
          isConnected: Boolean(matched?.credential_id),
          updated_at: matched?.credential_updated_at,
        };
      });

      setIntegrations(merged);
      setAgents(agentList);

      if (agentList.length > 0 && !selectedAgentId) {
        setSelectedAgentId(agentList[0].id);
        loadAgentConfig(agentList[0].id);
      }
    } catch (err) {
      console.error('Error loading Integration Hub data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInitialData();

    // Listen for OAuth2 popup success messages
    const handleOAuthMessage = (event) => {
      if (event.data && event.data.type === 'OAUTH_SUCCESS') {
        setMessage({
          type: 'success',
          text: `🎉 ${event.data.provider.toUpperCase()} authorized & connected successfully via OAuth2!`
        });
        loadInitialData();
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => {
      window.removeEventListener('message', handleOAuthMessage);
      if (waPollRef.current) clearInterval(waPollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectAgent = (e) => {
    const id = e.target.value;
    setSelectedAgentId(id);
    loadAgentConfig(id);
  };

  const handleConnectClick = (integration) => {
    if (integration.provider_type === 'whatsapp' || integration.auth_mode === 'qr_pairing') {
      openWhatsAppModal();
    } else if (integration.auth_mode === 'oauth2') {
      handleOAuthConnect(integration.provider_type || integration.canonical_name);
    } else {
      openConnectModal(integration);
    }
  };

  const openWhatsAppModal = async () => {
    setActiveModal('WhatsApp');
    setWaLoading(true);
    setWaQr(null);
    setWaPairMode('qr');
    setWaPairCode(null);
    setWaPairError('');
    setWaStatus('connecting');
    const token = getToken() || (typeof window !== 'undefined' ? localStorage.getItem('ai_platform_token') : '');

    try {
      // 1. Check current status
      const statusRes = await fetch('/api/whatsapp/status', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      let currentStatus = 'disconnected';
      if (statusRes.ok) {
        const data = await statusRes.json();
        currentStatus = data.status || 'disconnected';
        setWaStatus(currentStatus);
        setWaPhoneNumber(data.phoneNumber || null);
        if (data.qr) setWaQr(data.qr);
      }

      // 2. If not connected, trigger connect to ensure socket is running and generating QR
      if (currentStatus !== 'connected') {
        setWaStatus('connecting');
        fetch('/api/whatsapp/connect', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ forceNew: false }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((resData) => {
            if (resData?.qr) {
              setWaQr(resData.qr);
              setWaStatus('qr_pending');
            }
            if (resData?.status) setWaStatus(resData.status);
          })
          .catch((e) => console.error('Connect init error:', e));
      }

      // 3. Fallback active polling every 1.5s while modal is active
      if (waPollRef.current) clearInterval(waPollRef.current);
      waPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch('/api/whatsapp/status', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.qr) {
              setWaQr(pollData.qr);
              setWaStatus('qr_pending');
            }
            if (pollData.status === 'connected') {
              setWaStatus('connected');
              setWaPhoneNumber(pollData.phoneNumber || null);
              if (waPollRef.current) {
                clearInterval(waPollRef.current);
                waPollRef.current = null;
              }
              loadInitialData();
            }
          }
        } catch (pollErr) {}
      }, 1500);

      // 4. Open SSE stream
      if (waEventSource) {
        try {
          waEventSource.close();
        } catch (e) {}
      }
      const sseUrl = `/api/whatsapp/qr-stream?token=${encodeURIComponent(token || '')}`;
      const es = new EventSource(sseUrl);

      es.addEventListener('status', (e) => {
        try {
          const parsed = JSON.parse(e.data);
          setWaStatus(parsed.status || 'disconnected');
          if (parsed.phoneNumber) setWaPhoneNumber(parsed.phoneNumber);
          if (parsed.qr) setWaQr(parsed.qr);
          if (parsed.status === 'connected') {
            if (waPollRef.current) {
              clearInterval(waPollRef.current);
              waPollRef.current = null;
            }
            loadInitialData();
          }
        } catch (err) {}
      });

      es.addEventListener('qr', (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.qr) {
            setWaQr(parsed.qr);
            setWaStatus('qr_pending');
          }
        } catch (err) {}
      });

      es.addEventListener('pairing_code', (e) => {
        try {
          const parsed = JSON.parse(e.data);
          if (parsed.code) setWaPairCode(parsed.code);
        } catch (err) {}
      });

      es.onerror = () => {
        // Auto reconnect
      };

      setWaEventSource(es);
    } catch (err) {
      console.error('Error opening WhatsApp modal:', err);
    } finally {
      setWaLoading(false);
    }
  };

  const handleWhatsAppDisconnect = async () => {
    try {
      if (waPollRef.current) {
        clearInterval(waPollRef.current);
        waPollRef.current = null;
      }
      setWaLoading(true);
      const token = getToken() || (typeof window !== 'undefined' ? localStorage.getItem('ai_platform_token') : '');
      const res = await fetch('/api/whatsapp/disconnect', {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        setWaStatus('disconnected');
        setWaPhoneNumber(null);
        setWaQr(null);
        setMessage({ type: 'success', text: 'WhatsApp session disconnected successfully.' });
        loadInitialData();
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to disconnect WhatsApp.' });
    } finally {
      setWaLoading(false);
    }
  };

  const handleRefreshQr = async () => {
    try {
      setWaLoading(true);
      setWaQr(null);
      setWaStatus('connecting');
      const token = getToken() || (typeof window !== 'undefined' ? localStorage.getItem('ai_platform_token') : '');
      const res = await fetch('/api/whatsapp/connect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ forceNew: true }),
      });
      const data = await res.json();
      if (data.qr) {
        setWaQr(data.qr);
        setWaStatus('qr_pending');
      }
      if (data.status) setWaStatus(data.status);

      // Start fallback poll for fresh QR
      if (waPollRef.current) clearInterval(waPollRef.current);
      waPollRef.current = setInterval(async () => {
        try {
          const pollRes = await fetch('/api/whatsapp/status', {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (pollRes.ok) {
            const pollData = await pollRes.json();
            if (pollData.qr) {
              setWaQr(pollData.qr);
              setWaStatus('qr_pending');
              if (waPollRef.current) {
                clearInterval(waPollRef.current);
                waPollRef.current = null;
              }
            }
          }
        } catch (e) {}
      }, 1500);
    } catch (err) {
      console.error('Failed to regenerate QR:', err);
    } finally {
      setWaLoading(false);
    }
  };

  const handleRequestPairCode = async (e) => {
    if (e) e.preventDefault();
    setWaPairError('');
    const clean = waPairPhone.replace(/\D/g, '');
    if (!clean || clean.length < 8) {
      setWaPairError('Please enter a valid phone number with country code (e.g. 923001234567 or 15551234567).');
      return;
    }
    try {
      setWaPairCodeLoading(true);
      setWaPairCode(null);
      const token = getToken() || (typeof window !== 'undefined' ? localStorage.getItem('ai_platform_token') : '');
      const res = await fetch('/api/whatsapp/pair-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ phoneNumber: clean }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to request pairing code.');
      }
      setWaPairCode(data.code);
    } catch (err) {
      setWaPairError(err.message || 'Failed to generate pairing code');
    } finally {
      setWaPairCodeLoading(false);
    }
  };

  const handleOAuthConnect = (provider) => {
    const providerKey = provider.toLowerCase().replace(/\s+/g, '_');
    const token = getToken() || localStorage.getItem('ai_platform_token');
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;
    const popupUrl = `/api/integrations/connect/${providerKey}?token=${encodeURIComponent(token || '')}`;

    const popup = window.open(
      popupUrl,
      `Connect ${provider}`,
      `width=${width},height=${height},left=${left},top=${top},status=no,menubar=no,toolbar=no`
    );

    if (!popup) {
      alert('Popup blocked! Please allow popups for this site to complete OAuth connection.');
    }
  };

  const openConnectModal = (integration) => {
    setModalTarget(integration);
    setMessage({ type: '', text: '' });
    if (integration.canonical_name === 'SafePay') {
      setSafePaySecret('');
      setActiveModal('SafePay');
    } else if (integration.canonical_name === 'Supabase') {
      setSupabaseUrl('');
      setSupabaseKey('');
      setActiveModal('Supabase');
    } else if (integration.canonical_name === 'Stripe') {
      setStripeApiKey('');
      setActiveModal('Stripe');
    } else if (integration.canonical_name === 'Hunter.io') {
      setHunterApiKey('');
      setActiveModal('Hunter');
    }
  };

  const closeModal = () => {
    if (waPollRef.current) {
      clearInterval(waPollRef.current);
      waPollRef.current = null;
    }
    if (waEventSource) {
      try {
        waEventSource.close();
      } catch (e) {}
      setWaEventSource(null);
    }
    setActiveModal(null);
    setModalTarget(null);
    setSafePaySecret('');
    setSupabaseUrl('');
    setSupabaseKey('');
    setStripeApiKey('');
    setHunterApiKey('');
    setWaPairCode(null);
    setWaPairError('');
    setWaPairMode('qr');
  };

  const handleHunterSubmit = async (e) => {
    e.preventDefault();
    if (!hunterApiKey) {
      setMessage({ type: 'error', text: 'Hunter.io API Key is required.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = { api_key: hunterApiKey };
      await connectIntegration(modalTarget?.tool_id, 'Hunter.io', payload, 'api_key');

      setMessage({ type: 'success', text: '🎯 Hunter.io credentials encrypted and connected successfully!' });
      closeModal();
      await loadInitialData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Hunter.io credentials.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleStripeSubmit = async (e) => {
    e.preventDefault();
    if (!stripeApiKey) {
      setMessage({ type: 'error', text: 'Stripe Restricted API Key is required.' });
      return;
    }

    try {
      setSubmitting(true);
      await connectStripeCredentials(stripeApiKey);
      setMessage({ type: 'success', text: '🔐 Stripe credentials encrypted and connected successfully!' });
      closeModal();
      await loadInitialData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Stripe credentials.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSafePaySubmit = async (e) => {
    e.preventDefault();
    if (!safePaySecret) {
      setMessage({ type: 'error', text: 'SafePay Secret Key is required.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = { secret_key: safePaySecret };
      await connectIntegration(modalTarget?.tool_id, 'SafePay', payload, 'api_key');

      setMessage({ type: 'success', text: '🔐 SafePay credentials encrypted and connected successfully!' });
      closeModal();
      await loadInitialData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect SafePay credentials.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSupabaseSubmit = async (e) => {
    e.preventDefault();
    if (!supabaseUrl || !supabaseKey) {
      setMessage({ type: 'error', text: 'Both Project URL and Service Role Key are required.' });
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        project_url: supabaseUrl,
        service_role_key: supabaseKey,
      };
      await connectIntegration(modalTarget?.tool_id, 'Supabase', payload, 'service_role');

      setMessage({ type: 'success', text: '🔐 Supabase credentials encrypted and connected successfully!' });
      closeModal();
      await loadInitialData();
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Supabase credentials.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddToolBinding = () => {
    if (!newToolName) return;

    const existing = agentBindings.find((b) => b.tool_name === newToolName);
    if (existing) {
      alert(`Tool '${newToolName}' is already bound to this agent.`);
      return;
    }

    const newBinding = {
      tool_name: newToolName,
      connector_type: newToolConnector,
      is_high_risk: newToolIsHighRisk,
      config: { description: newToolDescription },
    };

    setAgentBindings([...agentBindings, newBinding]);
    setNewToolName('');
    setNewToolDescription('');
  };

  const handleRemoveToolBinding = (toolName) => {
    setAgentBindings(agentBindings.filter((b) => b.tool_name !== toolName));
  };

  const handleToggleHighRisk = (toolName) => {
    setAgentBindings(
      agentBindings.map((b) =>
        b.tool_name === toolName ? { ...b, is_high_risk: !b.is_high_risk } : b
      )
    );
  };

  const handleSaveAgentConfig = async () => {
    if (!selectedAgentId) return;

    try {
      setSubmitting(true);
      setMessage({ type: '', text: '' });
      const highRiskList = agentBindings.filter((b) => b.is_high_risk).map((b) => b.tool_name);
      await updateAgentConfig(selectedAgentId, agentBindings, highRiskList);
      setMessage({ type: 'success', text: 'Agent dynamic tool allowlist & runtime config saved successfully!' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const isAdmin = user?.role === 'admin';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md antialiased">
        <main className="max-w-container-max mx-auto px-lg py-xl">
          {/* Header Banner */}
          <header className="mb-xl border-b border-outline-variant pb-lg">
            <span className="font-label-md text-label-md text-primary bg-primary-container/10 px-3 py-1 rounded-full border border-primary/20 inline-block mb-3">
              ⚡ Integration Hub
            </span>
            <h1 className="font-display-lg text-display-lg text-on-surface mb-2">
              Centralized API & OAuth2 Integration Hub
            </h1>
            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-3xl">
              Connect services (GitHub, Vercel, SafePay, Supabase) with zero-trust AES-256-GCM credential encryption.
            </p>
          </header>

          {message.text && (
            <div className={`p-md rounded-lg mb-lg font-body-md ${message.type === 'error' ? 'bg-error-container/20 text-error border border-error/30' : 'bg-emerald-950/20 text-emerald-400 border border-emerald-800/40'}`}>
              {message.text}
            </div>
          )}

          {/* Section 1: Integration Grid */}
          <section className="mb-xl">
            <div className="mb-md">
              <h2 className="font-headline-md text-headline-md text-on-surface">🔌 API Key & OAuth2 Integrations</h2>
              <p className="font-body-md text-body-md text-on-surface-variant">Select an integration card to connect via OAuth2 popup or secure input modal.</p>
            </div>

            {loading ? (
              <p className="text-on-surface-variant py-lg">Loading Integration Hub...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-lg">
                {integrations.map((item) => (
                  <div key={item.canonical_name} className="bg-surface-container-low border border-outline-variant rounded-xl overflow-hidden shadow-sm flex flex-col hover:border-outline transition-colors">
                    <div className="p-md text-white flex items-center justify-between" style={{ background: item.gradient }}>
                      <span className="text-2xl">{item.icon}</span>
                      <span className="font-label-md text-label-md bg-white/20 px-2 py-0.5 rounded uppercase font-mono tracking-wider">
                        {item.category}
                      </span>
                    </div>

                    <div className="p-md flex-1 flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-headline-md text-headline-md text-on-surface font-semibold">{item.display_name}</h3>
                        <span className={`font-label-md text-label-md px-2 py-0.5 rounded ${item.isConnected ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/50' : 'bg-surface-container text-on-surface-variant border border-outline-variant'}`}>
                          {item.isConnected
                            ? item.provider_type === 'whatsapp' && item.phoneNumber
                              ? `● Connected (+${item.phoneNumber})`
                              : '● Connected'
                            : '○ Not Connected'}
                        </span>
                      </div>
                      <p className="font-body-md text-body-md text-on-surface-variant flex-1">{item.description}</p>
                    </div>

                    <div className="p-md bg-surface border-t border-outline-variant">
                      {isAdmin ? (
                        <button
                          onClick={() => handleConnectClick(item)}
                          className="w-full py-2 px-md bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-md hover:bg-primary-container transition-colors shadow-sm"
                        >
                          {item.isConnected
                            ? item.provider_type === 'whatsapp'
                              ? '📱 Manage WhatsApp / QR'
                              : item.auth_mode === 'oauth2' ? '🔄 Re-authorize OAuth2' : '⚙️ Reconfigure Credentials'
                            : item.provider_type === 'whatsapp'
                              ? '💬 Connect WhatsApp (QR Code)'
                              : item.auth_mode === 'oauth2' ? '🔗 Authorize via OAuth2' : '🔌 Connect Integration'}
                        </button>
                      ) : (
                        <span className="font-label-md text-label-md text-on-surface-variant text-center block">Admin Access Required to Connect</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Section 2: Per-Agent Tool Allowlist */}
          <section className="bg-surface-container-low border border-outline-variant rounded-xl p-xl shadow-sm space-y-lg">
            <div>
              <h2 className="font-headline-md text-headline-md text-on-surface">🤖 Per-Agent Tool Access & Policy Controls</h2>
              <span className="font-body-md text-body-md text-on-surface-variant">Configure dynamic tool allowlists and human-in-the-loop approvals per agent instance.</span>
            </div>

            {agents.length === 0 ? (
              <p className="text-on-surface-variant">No active agent instances found.</p>
            ) : (
              <div className="flex flex-col gap-2 max-w-md">
                <label className="font-label-md text-label-md text-on-surface-variant">Select Agent Instance:</label>
                <select value={selectedAgentId} onChange={handleSelectAgent} className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary">
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id.slice(0, 8)}...)
                    </option>
                  ))}
                </select>
              </div>
            )}

            <hr className="border-outline-variant" />

            {/* Add Tool to Allowlist */}
            {isAdmin && (
              <div className="bg-surface border border-dashed border-outline-variant rounded-xl p-lg space-y-md">
                <h4 className="font-headline-md text-headline-md text-on-surface">Bind Integration Tool to Agent</h4>
                <div className="flex flex-col md:flex-row gap-md">
                  <input
                    type="text"
                    placeholder="Tool Name (e.g. get_issues, list_deployments, SafePay)"
                    value={newToolName}
                    onChange={(e) => setNewToolName(e.target.value)}
                    className="flex-2 p-3 bg-surface-container border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                  <select
                    value={newToolConnector}
                    onChange={(e) => setNewToolConnector(e.target.value)}
                    className="flex-1 p-3 bg-surface-container border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  >
                    <option value="builtin">Built-in</option>
                    <option value="airtable">Airtable</option>
                    <option value="github">GitHub</option>
                    <option value="vercel">Vercel</option>
                    <option value="safepay">SafePay</option>
                    <option value="supabase">Supabase</option>
                    <option value="stripe">Stripe</option>
                    <option value="hubspot">HubSpot</option>
                    <option value="clickup">ClickUp</option>
                    <option value="resend">Resend</option>
                    <option value="gmail">Gmail</option>
                    <option value="google_docs">Google Docs</option>
                    <option value="google_sheets">Google Sheets</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>

                <div>
                  <input
                    type="text"
                    placeholder="Description for LLM tool selection..."
                    value={newToolDescription}
                    onChange={(e) => setNewToolDescription(e.target.value)}
                    className="w-full p-3 bg-surface-container border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <label className="flex items-center gap-2 cursor-pointer font-body-md text-on-surface">
                    <input
                      type="checkbox"
                      checked={newToolIsHighRisk}
                      onChange={(e) => setNewToolIsHighRisk(e.target.checked)}
                      className="rounded border-outline-variant bg-surface text-primary focus:ring-primary"
                    />
                    <span>Require Human Approval (High-Risk Action)</span>
                  </label>

                  <button onClick={handleAddToolBinding} className="px-md py-2 bg-surface-container border border-outline-variant text-on-surface font-label-md text-label-md rounded-md hover:bg-surface-container-high transition-colors">
                    + Add Tool
                  </button>
                </div>
              </div>
            )}

            {/* Current Tool Bindings List */}
            <div>
              <h3 className="font-headline-md text-headline-md text-on-surface mb-md">Bound Tools Allowlist ({agentBindings.length})</h3>
              <div className="space-y-3">
                {agentBindings.length === 0 ? (
                  <div className="p-xl text-center text-on-surface-variant bg-surface border border-dashed border-outline-variant rounded-lg">No tools bound to this agent instance.</div>
                ) : (
                  agentBindings.map((binding) => (
                    <div key={binding.tool_name} className="bg-surface border border-outline-variant rounded-lg p-md flex items-center justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <code className="font-mono-sm text-mono-sm text-on-surface bg-surface-container px-2 py-0.5 rounded border border-outline-variant">{binding.tool_name}</code>
                          <span className="font-label-md text-label-md px-2 py-0.5 rounded uppercase font-mono bg-surface-container-high border border-outline-variant text-on-surface-variant">
                            {binding.connector_type}
                          </span>
                        </div>
                        {binding.config?.description && (
                          <p className="font-body-md text-body-md text-on-surface-variant">{binding.config.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-md">
                        <button
                          onClick={() => handleToggleHighRisk(binding.tool_name)}
                          className={`px-3 py-1.5 rounded font-label-md text-label-md border transition-colors ${binding.is_high_risk ? 'bg-tertiary-container/20 text-tertiary border-tertiary/30' : 'bg-emerald-950/30 text-emerald-400 border-emerald-800/40'}`}
                          title="Toggle Human Approval Requirement"
                          disabled={!isAdmin}
                        >
                          {binding.is_high_risk ? '🛡️ Approval Required' : '⚡ Auto Execute'}
                        </button>

                        {isAdmin && (
                          <button
                            onClick={() => handleRemoveToolBinding(binding.tool_name)}
                            className="px-3 py-1.5 bg-error-container/20 text-error border border-error/30 rounded font-label-md text-label-md hover:bg-error-container/40 transition-colors"
                            title="Remove tool from allowlist"
                          >
                            ✖
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {isAdmin && (
              <div className="pt-md border-t border-outline-variant">
                <button
                  onClick={handleSaveAgentConfig}
                  className="w-full py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50"
                  disabled={submitting || !selectedAgentId}
                >
                  {submitting ? 'Saving Configuration...' : '💾 Save Agent Runtime Config'}
                </button>
              </div>
            )}
          </section>
        </main>

        {/* SAFEPAY MODAL */}
        {activeModal === 'SafePay' && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50" onClick={closeModal}>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-lg bg-surface border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💳</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Connect SafePay Payment Gateway</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">API-Key Credentials Encryption</span>
                  </div>
                </div>
                <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface text-xl">×</button>
              </div>

              <form onSubmit={handleSafePaySubmit} className="p-xl space-y-md">
                <div className="flex flex-col gap-2">
                  <label className="font-label-md text-label-md text-on-surface-variant">SafePay Secret Key</label>
                  <input
                    type="password"
                    placeholder="sec_live_sk_xxxxxxxxxxxxxxxx"
                    value={safePaySecret}
                    onChange={(e) => setSafePaySecret(e.target.value)}
                    required
                    autoFocus
                    className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                  <small className="font-label-md text-label-md text-on-surface-variant">Key is encrypted with AES-256-GCM before database insertion.</small>
                </div>

                <div className="flex justify-end gap-md pt-md">
                  <button type="button" onClick={closeModal} className="px-lg py-md bg-surface border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SUPABASE MODAL */}
        {activeModal === 'Supabase' && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50" onClick={closeModal}>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-lg bg-surface border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚡</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Connect Supabase Database Hub</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">PostgREST & Service Role Credentials</span>
                  </div>
                </div>
                <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface text-xl">×</button>
              </div>

              <form onSubmit={handleSupabaseSubmit} className="p-xl space-y-md">
                <div className="flex flex-col gap-2">
                  <label className="font-label-md text-label-md text-on-surface-variant">Project URL</label>
                  <input
                    type="url"
                    placeholder="https://xyzcompany.supabase.co"
                    value={supabaseUrl}
                    onChange={(e) => setSupabaseUrl(e.target.value)}
                    required
                    autoFocus
                    className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="font-label-md text-label-md text-on-surface-variant">Service Role Key</label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR..."
                    value={supabaseKey}
                    onChange={(e) => setSupabaseKey(e.target.value)}
                    required
                    className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                  <small className="font-label-md text-label-md text-on-surface-variant">Payload encrypted using AES-256-GCM and scoped to active tenant.</small>
                </div>

                <div className="flex justify-end gap-md pt-md">
                  <button type="button" onClick={closeModal} className="px-lg py-md bg-surface border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* STRIPE MODAL */}
        {activeModal === 'Stripe' && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50" onClick={closeModal}>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-lg bg-surface border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💳</span>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">Connect Stripe B2B Billing & Payments</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">Restricted API Key Credentials</span>
                  </div>
                </div>
                <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface text-xl">×</button>
              </div>

              <form onSubmit={handleStripeSubmit} className="p-xl space-y-md">
                <div className="flex flex-col gap-2">
                  <label className="font-label-md text-label-md text-on-surface-variant">Restricted API Key</label>
                  <input
                    type="password"
                    placeholder="rk_live_... / rk_test_..."
                    value={stripeApiKey}
                    onChange={(e) => setStripeApiKey(e.target.value)}
                    required
                    autoFocus
                    className="p-3 bg-surface border border-outline-variant rounded-lg text-on-surface focus:outline-none focus:border-primary"
                  />
                  <small className="font-label-md text-label-md text-on-surface-variant">Payload encrypted using AES-256-GCM and scoped to active tenant. High-risk operations (refunds) require HITL approval.</small>
                </div>

                <div className="flex justify-end gap-md pt-md">
                  <button type="button" onClick={closeModal} className="px-lg py-md bg-surface border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container transition-colors">
                    Cancel
                  </button>
                  <button type="submit" className="py-md px-lg bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-lg hover:bg-primary-container transition-colors disabled:opacity-50" disabled={submitting}>
                    {submitting ? 'Encrypting & Saving...' : '🔒 Save Credentials'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* WHATSAPP MODAL */}
        {activeModal === 'WhatsApp' && (
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-md z-50" onClick={closeModal}>
            <div className="bg-surface-container-low border border-outline-variant rounded-xl max-w-lg w-full shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-lg bg-surface border-b border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center text-2xl text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)' }}>
                    💬
                  </div>
                  <div>
                    <h2 className="font-headline-md text-headline-md text-on-surface">WhatsApp Business Channel</h2>
                    <span className="font-label-md text-label-md text-on-surface-variant">Multi-Tenant Baileys Web Protocol</span>
                  </div>
                </div>
                <button onClick={closeModal} className="text-on-surface-variant hover:text-on-surface text-xl font-bold">×</button>
              </div>

              <div className="p-xl space-y-md">
                {/* Status Header */}
                <div className="flex items-center justify-between p-md bg-surface border border-outline-variant rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-on-surface">Status:</span>
                    <span className={`px-2 py-0.5 rounded font-label-md text-label-md uppercase font-mono ${
                      waStatus === 'connected'
                        ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/50'
                        : waStatus === 'qr_pending'
                        ? 'bg-amber-950/40 text-amber-400 border border-amber-800/50'
                        : 'bg-surface-container text-on-surface-variant border border-outline-variant'
                    }`}>
                      {waStatus === 'connected' ? '● Connected' : waStatus === 'qr_pending' ? '📷 Scan QR Code' : '⏳ Initializing...'}
                    </span>
                  </div>
                  {waPhoneNumber && (
                    <span className="font-mono text-sm text-on-surface bg-surface-container px-2 py-0.5 rounded border border-outline-variant">
                      +{waPhoneNumber}
                    </span>
                  )}
                </div>

                {/* Main Body */}
                {waStatus === 'connected' ? (
                  <div className="text-center py-lg space-y-md bg-surface border border-outline-variant rounded-xl p-lg">
                    <div className="text-5xl">🎉</div>
                    <div>
                      <h3 className="text-lg font-semibold text-on-surface">WhatsApp Channel Active</h3>
                      <p className="text-sm text-on-surface-variant mt-1">
                        Inbound customer messages sent to <strong className="text-on-surface">+{waPhoneNumber}</strong> will automatically create conversations and route through your AI agent.
                      </p>
                    </div>
                    <div className="pt-md flex justify-center gap-3">
                      <button
                        type="button"
                        onClick={handleWhatsAppDisconnect}
                        disabled={waLoading}
                        className="px-lg py-2 bg-error-container/20 text-error border border-error/30 font-label-md text-label-md rounded-lg hover:bg-error-container/40 transition-colors disabled:opacity-50"
                      >
                        {waLoading ? 'Disconnecting...' : '🔴 Disconnect WhatsApp'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-md">
                    {/* Tab Selector: QR Code vs Phone Pairing Code */}
                    <div className="flex p-1 bg-surface-container border border-outline-variant rounded-xl gap-1">
                      <button
                        type="button"
                        onClick={() => { setWaPairMode('qr'); setWaPairError(''); }}
                        className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                          waPairMode === 'qr'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface'
                        }`}
                      >
                        📷 Scan QR Code
                      </button>
                      <button
                        type="button"
                        onClick={() => { setWaPairMode('code'); setWaPairError(''); }}
                        className={`flex-1 py-2 px-3 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-2 ${
                          waPairMode === 'code'
                            ? 'bg-primary text-on-primary shadow-sm'
                            : 'text-on-surface-variant hover:text-on-surface hover:bg-surface'
                        }`}
                      >
                        🔢 Link with Phone Number
                      </button>
                    </div>

                    {/* Mode 1: QR Code */}
                    {waPairMode === 'qr' && (
                      <div className="space-y-md">
                        <div className="p-md bg-surface-container/50 border border-outline-variant rounded-lg text-sm text-on-surface space-y-1">
                          <p className="font-semibold text-on-surface">To connect via QR Code:</p>
                          <ol className="list-decimal list-inside text-on-surface-variant text-xs space-y-1 pt-1">
                            <li>Open <strong>WhatsApp</strong> on your phone</li>
                            <li>Tap <strong>Settings</strong> or <strong>Menu (⋮)</strong> → <strong>Linked Devices</strong></li>
                            <li>Tap <strong>Link a Device</strong></li>
                            <li>Point your phone camera at the QR code below</li>
                          </ol>
                        </div>

                        {/* QR Display */}
                        <div className="flex flex-col items-center justify-center p-md bg-white border border-outline-variant rounded-xl min-h-[280px]">
                          {waQr ? (
                            <div className="space-y-3 flex flex-col items-center">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={waQr}
                                alt="WhatsApp Pairing QR Code"
                                className="w-60 h-60 object-contain rounded-lg shadow-sm border border-gray-200"
                              />
                              <p className="text-xs text-gray-500 font-mono text-center">
                                QR updates automatically. Scan before expiration.
                              </p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-3 text-on-surface-variant py-8">
                              <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                              <p className="text-sm text-gray-600">Generating secure pairing QR code...</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-1">
                          <button
                            type="button"
                            onClick={handleRefreshQr}
                            disabled={waLoading}
                            className="text-xs text-primary hover:underline flex items-center gap-1 disabled:opacity-50"
                          >
                            🔄 Reload QR Code
                          </button>
                          <span className="text-xs text-on-surface-variant">Encrypted via AES-256</span>
                        </div>
                      </div>
                    )}

                    {/* Mode 2: Phone Pairing Code */}
                    {waPairMode === 'code' && (
                      <div className="space-y-md">
                        <div className="p-md bg-surface-container/50 border border-outline-variant rounded-lg text-sm text-on-surface space-y-1">
                          <p className="font-semibold text-on-surface">Link directly with your phone number (No camera needed):</p>
                          <ol className="list-decimal list-inside text-on-surface-variant text-xs space-y-1 pt-1">
                            <li>Enter your WhatsApp phone number below (with country code, e.g. <code>923001234567</code>).</li>
                            <li>Click <strong>Get Pairing Code</strong>.</li>
                            <li>On your phone, open <strong>WhatsApp</strong> → <strong>Linked Devices</strong> → <strong>Link a Device</strong>.</li>
                            <li>Tap <strong>&quot;Link with phone number instead&quot;</strong> at the bottom of your phone screen.</li>
                            <li>Type the 8-character pairing code shown below.</li>
                          </ol>
                        </div>

                        <form onSubmit={handleRequestPairCode} className="space-y-2">
                          <label className="block text-xs font-medium text-on-surface">
                            WhatsApp Phone Number (with Country Code)
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="tel"
                              value={waPairPhone}
                              onChange={(e) => setWaPairPhone(e.target.value)}
                              placeholder="e.g. 923001234567 or +1 555 123 4567"
                              className="flex-1 px-3 py-2 bg-surface border border-outline-variant rounded-lg text-sm text-on-surface focus:outline-none focus:border-primary font-mono placeholder:text-on-surface-variant/40"
                              disabled={waPairCodeLoading}
                            />
                            <button
                              type="submit"
                              disabled={waPairCodeLoading || !waPairPhone.trim()}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-label-md text-label-md rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap shadow-sm"
                            >
                              {waPairCodeLoading ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  <span>Generating...</span>
                                </>
                              ) : (
                                'Get Code'
                              )}
                            </button>
                          </div>
                          {waPairError && (
                            <p className="text-xs text-error font-medium">{waPairError}</p>
                          )}
                        </form>

                        {waPairCode && (
                          <div className="flex flex-col items-center justify-center p-md bg-emerald-950/20 border-2 border-emerald-500/40 rounded-xl space-y-2 text-center">
                            <span className="text-xs text-emerald-400 uppercase tracking-wider font-semibold">
                              Your 8-Character Pairing Code
                            </span>
                            <div className="text-3xl font-mono font-bold tracking-widest text-emerald-300 bg-black/40 px-6 py-2.5 rounded-lg border border-emerald-700 select-all">
                              {waPairCode.length === 8 ? `${waPairCode.slice(0, 4)} - ${waPairCode.slice(4)}` : waPairCode}
                            </div>
                            <p className="text-xs text-on-surface-variant max-w-sm">
                              Enter this code in WhatsApp on your phone. Code expires in 60 seconds.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TOS Notice */}
                <div className="p-sm bg-amber-950/20 border border-amber-800/30 rounded-lg text-xs text-amber-300">
                  ⚠️ <strong>Notice:</strong> This integration connects via WhatsApp Web protocol. Follow Meta terms of service and avoid unsolicited bulk messaging.
                </div>

                <div className="flex justify-end pt-md">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-lg py-md bg-surface border border-outline-variant text-on-surface font-label-md text-label-md rounded-lg hover:bg-surface-container transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </AuthGuard>
  );
}
