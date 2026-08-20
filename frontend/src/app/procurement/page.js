'use client';

import { useState, useEffect } from 'react';
import AuthGuard from '../components/AuthGuard';
import { getAuthHeader } from '@/lib/api';

export default function ProcurementPage() {
  const [activeTab, setActiveTab] = useState('intake');
  const [requests, setRequests] = useState([]);
  const [selectedReqId, setSelectedReqId] = useState(null);
  const [currentReqDetails, setCurrentReqDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // New Request Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('50000');
  const [department, setDepartment] = useState('Engineering & IT');
  const [files, setFiles] = useState([]);

  // HITL Selection Form State
  const [selectedVendorId, setSelectedVendorId] = useState('');
  const [selectionNotes, setSelectionNotes] = useState('');

  useEffect(() => {
    fetchRequests();
  }, []);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/procurement/requests', {
        headers: getAuthHeader()
      });
      const data = await res.json();
      if (data.success) {
        setRequests(data.requests || []);
        if (data.requests.length > 0 && !selectedReqId) {
          setSelectedReqId(data.requests[0].id);
          fetchRequestDetails(data.requests[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching procurement requests:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRequestDetails = async (id) => {
    if (!id) return;
    try {
      const res = await fetch(`/api/v1/procurement/requests/${id}`, {
        headers: getAuthHeader()
      });
      const data = await res.json();
      if (data.success) {
        setCurrentReqDetails(data);
      }
    } catch (err) {
      console.error('Error fetching request details:', err);
    }
  };

  const handleSelectRequest = (id) => {
    setSelectedReqId(id);
    fetchRequestDetails(id);
  };

  // Submit New Procurement Request (Sub-Agent 1)
  const handleCreateRequest = async (e) => {
    e.preventDefault();
    if (!title) return;
    setSubmitting(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);
      formData.append('budget_limit', budgetLimit);
      formData.append('department', department);

      if (files && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          formData.append('documents', files[i]);
        }
      }

      const headers = getAuthHeader();
      delete headers['Content-Type']; // Let browser set boundary

      const res = await fetch('/api/v1/procurement/requests', {
        method: 'POST',
        headers,
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Procurement Request & Specs Ingested! Sub-Agent 1 extracted specs.' });
        setTitle('');
        setDescription('');
        setFiles([]);
        fetchRequests();
        if (data.id) {
          handleSelectRequest(data.id);
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to submit request.' });
      }
    } catch (err) {
      console.error('Error creating request:', err);
      setMessage({ type: 'error', text: 'Error submitting procurement request.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Trigger Next Sub-Agent Step
  const handleTriggerSubAgent = async (stageName) => {
    if (!selectedReqId) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/procurement/requests/${selectedReqId}/subagent/${stageName}`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stage: stageName })
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Sub-agent '${stageName}' executed successfully!` });
        fetchRequests();
        fetchRequestDetails(selectedReqId);
      } else {
        setMessage({ type: 'error', text: data.error || 'Sub-agent execution failed.' });
      }
    } catch (err) {
      console.error('Error running subagent:', err);
      setMessage({ type: 'error', text: 'Sub-agent execution error.' });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit HITL Vendor Selection Decision (Sub-Agent 5 & 6)
  const handleVendorSelectionDecision = async (e) => {
    e.preventDefault();
    if (!selectedReqId || !selectedVendorId) {
      setMessage({ type: 'error', text: 'Please select a winning vendor.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`/api/v1/procurement/requests/${selectedReqId}/select-vendor`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          selected_vendor_id: selectedVendorId,
          selection_notes: selectionNotes
        })
      });

      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: 'Winning Vendor Selected! Privacy-guarded notifications sent to all vendors & PO synchronized with Finance Agent!'
        });
        fetchRequests();
        fetchRequestDetails(selectedReqId);
        setActiveTab('finance');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to submit selection.' });
      }
    } catch (err) {
      console.error('Error submitting vendor selection:', err);
      setMessage({ type: 'error', text: 'Error executing vendor selection.' });
    } finally {
      setSubmitting(false);
    }
  };

  const reqObj = currentReqDetails?.request;
  const vendorsList = currentReqDetails?.vendors || [];
  const docsList = currentReqDetails?.documents || [];
  const researchReport = reqObj?.research_report;
  const comparisonMatrix = reqObj?.comparison_matrix;
  const finalReport = reqObj?.final_report;

  // KPI Calculations
  const totalRequests = requests.length;
  const totalVendors = requests.reduce((acc, r) => acc + parseInt(r.vendor_count || 0), 0);
  const pendingHitlCount = requests.filter(r => r.current_stage === 'REPLIES_PARSED' || r.current_stage === 'AWAITING_SELECTION').length;
  const completedCount = requests.filter(r => r.current_stage === 'COMPLETED').length;

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md flex flex-col h-screen overflow-hidden">
        <main className="flex-1 overflow-y-auto p-md md:p-lg space-y-lg">
          {/* Header Banner & Supervisor Badge */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-md bg-surface-container border border-outline-variant rounded-2xl p-lg bg-gradient-to-r from-surface-container via-surface-container-high to-surface-container-highest">
            <div className="space-y-xs">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-2xl">shopping_cart</span>
                <h1 className="font-headline-md text-headline-md font-bold text-on-surface">Procurement Multi-Agent Hub</h1>
                <span className="px-3 py-1 rounded-full text-label-md font-semibold bg-primary-container/30 text-primary border border-primary/40 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  Supervisor Architecture Active
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
                Multi-agent purchasing orchestration: Sub-Agents handle intake, Hunter.io market research, RFQ outreach, quote matrix synthesis, HITL selection, privacy-safe vendor emails, and Finance Agent PO creation.
              </p>
            </div>

            <button
              onClick={fetchRequests}
              className="px-md py-xs bg-surface-container-high hover:bg-surface-container-highest border border-outline-variant rounded-xl font-label-md text-label-md font-semibold text-on-surface flex items-center gap-2 self-start md:self-auto transition-colors"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Refresh State
            </button>
          </div>

          {/* Top Analytics KPI Header Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-md flex items-center justify-between">
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant">Procurement Requests</p>
                <p className="font-headline-lg text-headline-lg font-bold text-on-surface mt-xs">{totalRequests}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-primary-container/20 border border-primary/30 flex items-center justify-center text-primary">
                <span className="material-symbols-outlined">assignment</span>
              </div>
            </div>

            <div className="bg-surface-container border border-outline-variant rounded-2xl p-md flex items-center justify-between">
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant">Discovered Vendors</p>
                <p className="font-headline-lg text-headline-lg font-bold text-on-surface mt-xs">{totalVendors}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-tertiary-container/20 border border-tertiary/30 flex items-center justify-center text-tertiary">
                <span className="material-symbols-outlined">domain</span>
              </div>
            </div>

            <div className="bg-surface-container border border-outline-variant rounded-2xl p-md flex items-center justify-between">
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant">Pending HITL Decisions</p>
                <p className="font-headline-lg text-headline-lg font-bold text-amber-400 mt-xs">{pendingHitlCount}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <span className="material-symbols-outlined">gavel</span>
              </div>
            </div>

            <div className="bg-surface-container border border-outline-variant rounded-2xl p-md flex items-center justify-between">
              <div>
                <p className="font-label-md text-label-md text-on-surface-variant">Executed POs & Synced GL</p>
                <p className="font-headline-lg text-headline-lg font-bold text-emerald-400 mt-xs">{completedCount}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <span className="material-symbols-outlined">verified</span>
              </div>
            </div>
          </div>

          {/* Feedback Messages */}
          {message && (
            <div className={`p-md rounded-xl border flex items-center gap-md ${
              message.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                : 'bg-error-container/20 border-error/40 text-error'
            }`}>
              <span className="material-symbols-outlined">
                {message.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <p className="font-body-md text-body-md">{message.text}</p>
            </div>
          )}

          {/* Request Selector Header */}
          {requests.length > 0 && (
            <div className="bg-surface-container border border-outline-variant rounded-2xl p-md flex flex-wrap items-center justify-between gap-md">
              <div className="flex items-center gap-md">
                <span className="font-label-md text-label-md text-on-surface-variant font-semibold">Active Project:</span>
                <select
                  value={selectedReqId || ''}
                  onChange={(e) => handleSelectRequest(e.target.value)}
                  className="bg-surface-container-high border border-outline-variant rounded-xl px-md py-xs text-on-surface font-body-md focus:outline-none focus:border-primary"
                >
                  {requests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.title} (${parseFloat(r.budget_limit || 0).toLocaleString()}) — [{r.current_stage}]
                    </option>
                  ))}
                </select>
              </div>

              {reqObj && (
                <div className="flex items-center gap-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant">Active Sub-Agent:</span>
                  <span className="px-3 py-0.5 rounded-lg bg-surface-container-highest border border-outline-variant font-mono-sm text-mono-sm text-primary font-bold">
                    {reqObj.active_subagent || 'intake_spec'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Multi-Tab Navigation Header */}
          <div className="border-b border-outline-variant flex overflow-x-auto gap-2">
            <button
              onClick={() => setActiveTab('intake')}
              className={`px-md py-sm font-label-md text-label-md font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'intake'
                  ? 'border-primary text-primary bg-primary-container/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-lg">add_box</span>
              1. Intake & Specs (Sub-Agent 1)
            </button>

            <button
              onClick={() => setActiveTab('research')}
              className={`px-md py-sm font-label-md text-label-md font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'research'
                  ? 'border-primary text-primary bg-primary-container/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-lg">travel_explore</span>
              2. Vendor Research (Sub-Agent 2)
            </button>

            <button
              onClick={() => setActiveTab('rfq')}
              className={`px-md py-sm font-label-md text-label-md font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'rfq'
                  ? 'border-primary text-primary bg-primary-container/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-lg">forward_to_inbox</span>
              3. RFQ Outreach (Sub-Agent 3)
            </button>

            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-md py-sm font-label-md text-label-md font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'matrix'
                  ? 'border-primary text-primary bg-primary-container/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-lg">analytics</span>
              4. Matrix & HITL Decision (Sub-Agent 4 & 5)
            </button>

            <button
              onClick={() => setActiveTab('comms')}
              className={`px-md py-sm font-label-md text-label-md font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'comms'
                  ? 'border-primary text-primary bg-primary-container/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-lg">mail_lock</span>
              5. Vendor Comms (Sub-Agent 5)
            </button>

            <button
              onClick={() => setActiveTab('finance')}
              className={`px-md py-sm font-label-md text-label-md font-semibold whitespace-nowrap border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'finance'
                  ? 'border-primary text-primary bg-primary-container/10'
                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-lg">payments</span>
              6. Finance Sync (Sub-Agent 6)
            </button>
          </div>

          {/* TAB 1: INTAKE & SPECS */}
          {activeTab === 'intake' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
              {/* Form Card */}
              <div className="bg-surface-container border border-outline-variant rounded-2xl p-lg space-y-md">
                <div>
                  <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Submit New Procurement Request</h2>
                  <p className="font-body-md text-body-md text-on-surface-variant">Input requirements and attach specification files (PDF/DOCX) for Sub-Agent 1 to extract technical criteria.</p>
                </div>

                <form onSubmit={handleCreateRequest} className="space-y-md">
                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md font-semibold text-on-surface">Requirement Title *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Enterprise Cloud Infrastructure & Server Deployment"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-md text-on-surface font-body-md focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                    <div className="space-y-xs">
                      <label className="font-label-md text-label-md font-semibold text-on-surface">Budget Limit ($)</label>
                      <input
                        type="number"
                        placeholder="50000"
                        value={budgetLimit}
                        onChange={(e) => setBudgetLimit(e.target.value)}
                        className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-md text-on-surface font-body-md focus:outline-none focus:border-primary"
                      />
                    </div>

                    <div className="space-y-xs">
                      <label className="font-label-md text-label-md font-semibold text-on-surface">Department</label>
                      <select
                        value={department}
                        onChange={(e) => setDepartment(e.target.value)}
                        className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-md text-on-surface font-body-md focus:outline-none focus:border-primary"
                      >
                        <option value="Engineering & IT">Engineering & IT</option>
                        <option value="Marketing & Growth">Marketing & Growth</option>
                        <option value="Operations & Logistics">Operations & Logistics</option>
                        <option value="Corporate Facilities">Corporate Facilities</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md font-semibold text-on-surface">Detailed Description & Specifications</label>
                    <textarea
                      rows={4}
                      placeholder="Provide detailed description of required products, SLAs, minimum hardware specs, or service deliverables..."
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-md text-on-surface font-body-md focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="space-y-xs">
                    <label className="font-label-md text-label-md font-semibold text-on-surface">Attach RFP Specification Files (PDF / DOCX)</label>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.docx,.txt"
                      onChange={(e) => setFiles(Array.from(e.target.files))}
                      className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-md text-on-surface font-body-md file:mr-4 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-label-md file:font-semibold file:bg-primary file:text-on-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-md bg-primary hover:bg-primary/90 text-on-primary font-label-md text-label-md font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">send</span>
                    {submitting ? 'Ingesting Requirements...' : 'Submit & Trigger Intake Sub-Agent'}
                  </button>
                </form>
              </div>

              {/* Current Active Specs Display */}
              <div className="bg-surface-container border border-outline-variant rounded-2xl p-lg space-y-md">
                <div className="flex items-center justify-between">
                  <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Sub-Agent 1 Extracted Specs</h2>
                  {reqObj && (
                    <button
                      onClick={() => handleTriggerSubAgent('vendor_research')}
                      disabled={submitting}
                      className="px-md py-xs bg-primary hover:bg-primary/90 text-on-primary font-label-md text-label-md font-semibold rounded-xl transition-colors flex items-center gap-2"
                    >
                      <span>Trigger Vendor Research</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  )}
                </div>

                {reqObj ? (
                  <div className="space-y-md">
                    <div className="bg-surface-container-high border border-outline-variant rounded-xl p-md space-y-xs">
                      <p className="font-label-md text-label-md text-on-surface-variant font-semibold">Title & Department</p>
                      <p className="font-title-md text-title-md font-bold text-on-surface">{reqObj.title}</p>
                      <p className="font-body-md text-body-md text-primary font-semibold">{reqObj.department} — Budget Cap: ${parseFloat(reqObj.budget_limit || 0).toLocaleString()}</p>
                    </div>

                    {reqObj.extracted_specs && (
                      <div className="bg-surface-container-high border border-outline-variant rounded-xl p-md space-y-md">
                        <div>
                          <p className="font-label-md text-label-md text-on-surface-variant font-semibold">Executive Summary</p>
                          <p className="font-body-md text-body-md text-on-surface mt-xs">{reqObj.extracted_specs.summary || 'Summary generated by Intake Sub-Agent.'}</p>
                        </div>

                        {reqObj.extracted_specs.technical_requirements && (
                          <div>
                            <p className="font-label-md text-label-md text-on-surface-variant font-semibold">Technical Requirements</p>
                            <ul className="list-disc list-inside font-body-md text-body-md text-on-surface mt-xs space-y-1">
                              {reqObj.extracted_specs.technical_requirements.map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {reqObj.extracted_specs.key_deliverables && (
                          <div>
                            <p className="font-label-md text-label-md text-on-surface-variant font-semibold">Expected Deliverables</p>
                            <div className="flex flex-wrap gap-2 mt-xs">
                              {reqObj.extracted_specs.key_deliverables.map((del, i) => (
                                <span key={i} className="px-2.5 py-1 rounded-lg bg-surface-container-highest border border-outline-variant text-label-md font-medium text-on-surface">
                                  {del}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {docsList.length > 0 && (
                      <div className="bg-surface-container-high border border-outline-variant rounded-xl p-md space-y-xs">
                        <p className="font-label-md text-label-md text-on-surface-variant font-semibold">Attached RFP Documents ({docsList.length})</p>
                        <div className="space-y-1">
                          {docsList.map((d) => (
                            <div key={d.id} className="flex items-center gap-2 text-body-md text-on-surface">
                              <span className="material-symbols-outlined text-primary text-base">description</span>
                              <span>{d.filename}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-xl text-on-surface-variant font-body-md">
                    No procurement request selected. Submit a new request on the left or select an existing project.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: VENDOR RESEARCH */}
          {activeTab === 'research' && (
            <div className="space-y-lg">
              <div className="flex items-center justify-between bg-surface-container border border-outline-variant rounded-2xl p-md">
                <div>
                  <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Sub-Agent 2: Vendor Sourcing & Market Analysis</h2>
                  <p className="font-body-md text-body-md text-on-surface-variant">Sources vendor candidates via Hunter.io API & web research, enriches deliverability, and compiles market report.</p>
                </div>

                <button
                  onClick={() => handleTriggerSubAgent('vendor_research')}
                  disabled={submitting}
                  className="px-md py-xs bg-primary hover:bg-primary/90 text-on-primary font-label-md text-label-md font-semibold rounded-xl transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">search</span>
                  {submitting ? 'Searching Vendors...' : 'Run Vendor Research'}
                </button>
              </div>

              {/* Vendor Candidates Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-md">
                {vendorsList.map((v) => (
                  <div key={v.id || v.vendor_name} className="bg-surface-container border border-outline-variant rounded-2xl p-md space-y-xs hover:border-primary/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full font-mono-sm text-mono-sm font-bold bg-emerald-950/50 text-emerald-400 border border-emerald-700/50">
                        {v.deliverability_status || 'VALID'}
                      </span>
                      <span className="font-label-md text-label-md text-on-surface-variant">{v.contact_status}</span>
                    </div>
                    <h3 className="font-title-md text-title-md font-bold text-on-surface">{v.vendor_name}</h3>
                    <p className="font-body-md text-body-md text-primary font-medium">{v.domain}</p>
                    <p className="font-body-md text-body-md text-on-surface-variant truncate">{v.vendor_email}</p>
                  </div>
                ))}
              </div>

              {/* Market Research Report */}
              {researchReport ? (
                <div className="bg-surface-container border border-outline-variant rounded-2xl p-lg space-y-md">
                  <div className="flex items-center justify-between border-b border-outline-variant pb-md">
                    <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">assessment</span>
                      Market Research & Fit Report
                    </h3>
                    <button
                      onClick={() => {
                        handleTriggerSubAgent('rfq_outreach');
                        setActiveTab('rfq');
                      }}
                      className="px-md py-xs bg-primary text-on-primary font-label-md text-label-md font-semibold rounded-xl"
                    >
                      Proceed to RFQ Outreach →
                    </button>
                  </div>

                  <div className="space-y-md">
                    <div>
                      <p className="font-label-md text-label-md text-on-surface-variant font-semibold">Market Landscape Overview</p>
                      <p className="font-body-md text-body-md text-on-surface mt-xs leading-relaxed">{researchReport.market_overview}</p>
                    </div>

                    {researchReport.recommended_vendors && (
                      <div>
                        <p className="font-label-md text-label-md text-on-surface-variant font-semibold mb-xs">Candidate Fit Scores</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                          {researchReport.recommended_vendors.map((rv, idx) => (
                            <div key={idx} className="bg-surface-container-high border border-outline-variant rounded-xl p-md space-y-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-title-md text-title-md font-bold text-on-surface">{rv.vendor_name}</span>
                                <span className="font-headline-sm text-headline-sm font-bold text-emerald-400">{rv.perceived_fit_score}/100</span>
                              </div>
                              <p className="font-body-md text-body-md text-on-surface-variant">Price Est: {rv.estimated_price_range}</p>
                              {rv.key_strengths && (
                                <div className="flex flex-wrap gap-1 mt-xs">
                                  {rv.key_strengths.map((str, sIdx) => (
                                    <span key={sIdx} className="px-2 py-0.5 rounded bg-surface-container-highest text-label-md text-on-surface">
                                      {str}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-surface-container border border-outline-variant rounded-2xl p-xl text-center text-on-surface-variant font-body-md">
                  Click "Run Vendor Research" above to discover candidate vendors and compile the Market Research Report.
                </div>
              )}
            </div>
          )}

          {/* TAB 3: RFQ OUTREACH */}
          {activeTab === 'rfq' && (
            <div className="space-y-lg">
              <div className="flex items-center justify-between bg-surface-container border border-outline-variant rounded-2xl p-md">
                <div>
                  <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Sub-Agent 3: RFQ & Vendor Outreach</h2>
                  <p className="font-body-md text-body-md text-on-surface-variant">Formats formal RFQ packages and dispatches outreach emails to candidate vendors via Gmail adapter.</p>
                </div>

                <button
                  onClick={() => handleTriggerSubAgent('rfq_outreach')}
                  disabled={submitting}
                  className="px-md py-xs bg-primary hover:bg-primary/90 text-on-primary font-label-md text-label-md font-semibold rounded-xl transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">send</span>
                  {submitting ? 'Dispatching RFQs...' : 'Dispatch RFQ Emails'}
                </button>
              </div>

              {/* Vendors Dispatch Status */}
              <div className="bg-surface-container border border-outline-variant rounded-2xl p-lg space-y-md">
                <h3 className="font-title-md text-title-md font-bold text-on-surface">Dispatched RFQ Log</h3>
                <div className="space-y-md">
                  {vendorsList.map((v) => (
                    <div key={v.id || v.vendor_name} className="bg-surface-container-high border border-outline-variant rounded-xl p-md flex items-center justify-between">
                      <div className="space-y-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-title-md text-title-md font-bold text-on-surface">{v.vendor_name}</span>
                          <span className={`px-2.5 py-0.5 rounded-full font-mono-sm text-mono-sm font-bold ${
                            v.contact_status === 'RFQ_SENT' || v.contact_status === 'REPLIED'
                              ? 'bg-emerald-950/50 text-emerald-400 border border-emerald-700/50'
                              : 'bg-surface-container-highest text-on-surface-variant'
                          }`}>
                            {v.contact_status}
                          </span>
                        </div>
                        <p className="font-body-md text-body-md text-on-surface-variant">{v.vendor_email} ({v.domain})</p>
                      </div>

                      <button
                        onClick={() => {
                          handleTriggerSubAgent('negotiation_synthesis');
                          setActiveTab('matrix');
                        }}
                        className="px-md py-xs bg-surface-container-highest hover:bg-surface-container-low text-on-surface font-label-md text-label-md font-semibold rounded-xl"
                      >
                        Parse Quote Replies →
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MATRIX & HITL DECISION */}
          {activeTab === 'matrix' && (
            <div className="space-y-lg">
              <div className="flex items-center justify-between bg-surface-container border border-outline-variant rounded-2xl p-md">
                <div>
                  <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">Sub-Agent 4 & 5: Quote Matrix & HITL Selection</h2>
                  <p className="font-body-md text-body-md text-on-surface-variant">Synthesizes vendor quote responses, compares SLAs, lead times, and enforces human selection gate.</p>
                </div>

                <button
                  onClick={() => handleTriggerSubAgent('negotiation_synthesis')}
                  disabled={submitting}
                  className="px-md py-xs bg-primary hover:bg-primary/90 text-on-primary font-label-md text-label-md font-semibold rounded-xl transition-colors flex items-center gap-2"
                >
                  <span className="material-symbols-outlined">analytics</span>
                  {submitting ? 'Synthesizing Matrix...' : 'Synthesize Quote Matrix'}
                </button>
              </div>

              {/* Vendor Quote Comparison Matrix Table */}
              {comparisonMatrix ? (
                <div className="bg-surface-container border border-outline-variant rounded-2xl p-lg space-y-md">
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">table_chart</span>
                    Vendor Quote Comparison Matrix
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-outline-variant font-label-md text-label-md text-on-surface-variant bg-surface-container-high">
                          <th className="p-md">Vendor</th>
                          <th className="p-md">Quote Amount ($)</th>
                          <th className="p-md">Budget Var (%)</th>
                          <th className="p-md">Lead Time</th>
                          <th className="p-md">SLA Score</th>
                          <th className="p-md">Recommendation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant font-body-md text-body-md">
                        {comparisonMatrix.comparison_matrix?.map((row, idx) => (
                          <tr key={idx} className="hover:bg-surface-container-high/50">
                            <td className="p-md font-semibold text-on-surface">{row.vendor_name}</td>
                            <td className="p-md font-bold text-primary">${parseFloat(row.quote_amount || 0).toLocaleString()}</td>
                            <td className="p-md text-on-surface-variant">{row.variance_from_budget_pct}</td>
                            <td className="p-md text-on-surface-variant">{row.lead_time_days} Days</td>
                            <td className="p-md text-emerald-400 font-bold">{row.sla_score}/10</td>
                            <td className="p-md font-bold text-emerald-400">{row.recommendation_score}/100</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {comparisonMatrix.top_recommended_vendor && (
                    <div className="bg-primary-container/20 border border-primary/30 rounded-xl p-md flex items-center gap-md">
                      <span className="material-symbols-outlined text-primary text-2xl">auto_awesome</span>
                      <div>
                        <p className="font-label-md text-label-md text-primary font-bold">Top AI Recommendation</p>
                        <p className="font-body-md text-body-md text-on-surface font-semibold">{comparisonMatrix.top_recommended_vendor}</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-surface-container border border-outline-variant rounded-2xl p-xl text-center text-on-surface-variant font-body-md">
                  Click "Synthesize Quote Matrix" above to parse vendor replies and populate the comparison matrix.
                </div>
              )}

              {/* Human-in-the-Loop Selection Box */}
              <div className="bg-amber-950/20 border border-amber-500/30 rounded-2xl p-lg space-y-md">
                <div className="flex items-center gap-2 text-amber-400">
                  <span className="material-symbols-outlined text-2xl">gavel</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold">Human-in-the-Loop Selection Gate</h3>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Review vendor quotes above and make the final vendor selection decision. Once confirmed, Sub-Agent 5 will dispatch acceptance & regret emails, and Sub-Agent 6 will execute the Finance PO sync.
                </p>

                <form onSubmit={handleVendorSelectionDecision} className="space-y-md">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
                    <div className="space-y-xs">
                      <label className="font-label-md text-label-md font-semibold text-on-surface">Select Winning Vendor *</label>
                      <select
                        required
                        value={selectedVendorId}
                        onChange={(e) => setSelectedVendorId(e.target.value)}
                        className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-md text-on-surface font-body-md focus:outline-none focus:border-amber-400"
                      >
                        <option value="">-- Choose Vendor --</option>
                        {vendorsList.map((v) => (
                          <option key={v.id || v.vendor_name} value={v.id || v.vendor_name}>
                            {v.vendor_name} (${parseFloat(v.quote_amount || 0).toLocaleString()})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-xs">
                      <label className="font-label-md text-label-md font-semibold text-on-surface">Selection Rationale / Decision Notes</label>
                      <input
                        type="text"
                        placeholder="e.g. Best SLA terms and fastest 14-day lead time."
                        value={selectionNotes}
                        onChange={(e) => setSelectionNotes(e.target.value)}
                        className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-md text-on-surface font-body-md focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-md bg-amber-500 hover:bg-amber-600 text-black font-label-md text-label-md font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined">how_to_reg</span>
                    {submitting ? 'Executing Selection & Notifications...' : 'Confirm & Select Winning Vendor'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* TAB 5: VENDOR COMMS */}
          {activeTab === 'comms' && (
            <div className="space-y-lg">
              <div className="bg-surface-container border border-outline-variant rounded-2xl p-lg space-y-md">
                <div className="flex items-center justify-between border-b border-outline-variant pb-md">
                  <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">mail_lock</span>
                    Sub-Agent 5: Vendor Communications Audit Log
                  </h2>
                  <span className="px-3 py-1 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-700/50 text-label-md font-bold">
                    🔒 Privacy Guardrails Active
                  </span>
                </div>

                <p className="font-body-md text-body-md text-on-surface-variant">
                  Outbound email logs dispatched to all vendors post-selection. Polite regret emails strictly protect winning vendor identity and bid details.
                </p>

                <div className="space-y-md">
                  {vendorsList.map((v) => (
                    <div key={v.id || v.vendor_name} className={`bg-surface-container-high border rounded-xl p-md flex items-center justify-between ${
                      v.contact_status === 'SELECTED' ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-outline-variant'
                    }`}>
                      <div className="space-y-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-title-md text-title-md font-bold text-on-surface">{v.vendor_name}</span>
                          <span className={`px-2.5 py-0.5 rounded-full font-mono-sm text-mono-sm font-bold ${
                            v.contact_status === 'SELECTED' ? 'bg-emerald-400 text-black' : 'bg-surface-container-highest text-on-surface-variant'
                          }`}>
                            {v.contact_status}
                          </span>
                        </div>
                        <p className="font-body-md text-body-md text-on-surface-variant">{v.vendor_email}</p>
                      </div>

                      {v.contact_status === 'REJECTED' && (
                        <span className="px-3 py-1 rounded-lg bg-surface-container-highest text-emerald-400 font-mono-sm text-mono-sm font-semibold border border-emerald-800/40">
                          ✓ Privacy Non-Disclosure Check Passed
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: FINANCE SYNC */}
          {activeTab === 'finance' && (
            <div className="space-y-lg">
              <div className="bg-surface-container border border-outline-variant rounded-2xl p-lg space-y-md">
                <div className="flex items-center justify-between border-b border-outline-variant pb-md">
                  <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-emerald-400">payments</span>
                    Sub-Agent 6: Cross-Agent Finance Synchronization
                  </h2>
                  {reqObj?.po_number && (
                    <span className="px-3 py-1 rounded-full bg-emerald-950/50 text-emerald-400 border border-emerald-700/50 text-label-md font-bold">
                      PO Executed: {reqObj.po_number}
                    </span>
                  )}
                </div>

                {finalReport ? (
                  <div className="space-y-md">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-md">
                      <div className="bg-surface-container-high border border-outline-variant rounded-xl p-md space-y-xs">
                        <p className="font-label-md text-label-md text-on-surface-variant">Purchase Order Number</p>
                        <p className="font-headline-sm text-headline-sm font-bold text-emerald-400">{reqObj.po_number}</p>
                      </div>

                      <div className="bg-surface-container-high border border-outline-variant rounded-xl p-md space-y-xs">
                        <p className="font-label-md text-label-md text-on-surface-variant">Selected Vendor</p>
                        <p className="font-headline-sm text-headline-sm font-bold text-on-surface">{finalReport.selected_vendor?.vendor_name}</p>
                      </div>

                      <div className="bg-surface-container-high border border-outline-variant rounded-xl p-md space-y-xs">
                        <p className="font-label-md text-label-md text-on-surface-variant">Agreed Total Amount</p>
                        <p className="font-headline-sm text-headline-sm font-bold text-primary">${parseFloat(finalReport.selected_vendor?.agreed_amount || 0).toLocaleString()}</p>
                      </div>
                    </div>

                    <div className="bg-surface-container-high border border-outline-variant rounded-xl p-md space-y-xs">
                      <p className="font-label-md text-label-md text-on-surface-variant font-semibold">Finance Agent Sync Status</p>
                      <div className="space-y-2 mt-xs">
                        <div className="flex items-center gap-2 text-emerald-400 font-body-md">
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          <span>Purchase Order created in database (`purchase_orders` table)</span>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-400 font-body-md">
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          <span>Funds reserved in General Ledger (`account_code = 'EXP-PROC-501'`)</span>
                        </div>
                        <div className="flex items-center gap-2 text-emerald-400 font-body-md">
                          <span className="material-symbols-outlined text-base">check_circle</span>
                          <span>Cross-agent audit record logged (`NOTIFY_FINANCE_PROCUREMENT_CLOSED`)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-xl text-on-surface-variant font-body-md">
                    Complete the Human-in-the-Loop vendor selection in Tab 4 to execute Finance Agent PO synchronization.
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
