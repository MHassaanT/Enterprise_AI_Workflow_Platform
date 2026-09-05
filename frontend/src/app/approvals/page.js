'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import AuthGuard from '../components/AuthGuard';
import {
  getAuthHeader,
  fetchAppointments,
  updateAppointment,
  createAppointment,
  deleteAppointment,
} from '@/lib/api';

export default function ApprovalsAndAppointmentsPage() {
  const [activeTab, setActiveTab] = useState('approvals'); // 'approvals' | 'appointments'

  // ── Approvals State ──
  const [approvals, setApprovals] = useState([]);
  const [approvalsLoading, setApprovalsLoading] = useState(true);
  const [actingId, setActingId] = useState(null);
  const [approvalMessage, setApprovalMessage] = useState('');

  // ── Appointments State ──
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [appointmentFilterStatus, setAppointmentFilterStatus] = useState('all');
  const [appointmentSearch, setAppointmentSearch] = useState('');
  const [appointmentFilterDate, setAppointmentFilterDate] = useState('');
  const [appointmentActionId, setAppointmentActionId] = useState(null);
  const [appointmentMessage, setAppointmentMessage] = useState('');

  // ── Modal State (Manual Booking) ──
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [submittingModal, setSubmittingModal] = useState(false);
  const [newAppointment, setNewAppointment] = useState({
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    service_type: 'Software Development Consultation',
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: '14:00',
    duration_minutes: 60,
    notes: '',
  });

  useEffect(() => {
    loadApprovals();
    loadAppointments();
  }, []);

  // ── Approvals Load & Decision ──
  const loadApprovals = async () => {
    setApprovalsLoading(true);
    try {
      const res = await fetch('/api/v1/approvals', {
        headers: { ...getAuthHeader() },
      });
      const data = await res.json();
      setApprovals(data.approvals || data.pending_approvals || []);
    } catch (err) {
      console.error('Failed to load approvals:', err);
    } finally {
      setApprovalsLoading(false);
    }
  };

  const handleDecision = async (id, decision) => {
    setActingId(id);
    setApprovalMessage('');
    try {
      const res = await fetch(`/api/v1/approvals/${id}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        setApprovalMessage(`✅ Approval ID ${id} set to '${decision.toUpperCase()}'. Sub-agent resumed.`);
        loadApprovals();
      } else {
        setApprovalMessage(`❌ Action failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err) {
      setApprovalMessage(`❌ Network error: ${err.message}`);
    } finally {
      setActingId(null);
    }
  };

  // ── Appointments Load & Actions ──
  const loadAppointments = async () => {
    setAppointmentsLoading(true);
    try {
      const params = {};
      if (appointmentFilterStatus !== 'all') params.status = appointmentFilterStatus;
      if (appointmentSearch.trim()) params.search = appointmentSearch.trim();
      if (appointmentFilterDate) params.date = appointmentFilterDate;

      const data = await fetchAppointments(params);
      setAppointments(data.appointments || []);
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setAppointmentsLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, [appointmentFilterStatus, appointmentFilterDate]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadAppointments();
  };

  const handleUpdateStatus = async (id, newStatus) => {
    setAppointmentActionId(id);
    setAppointmentMessage('');
    try {
      await updateAppointment(id, { status: newStatus });
      setAppointmentMessage(`Appointment updated to ${newStatus.toUpperCase()}.`);
      loadAppointments();
    } catch (err) {
      setAppointmentMessage(`Failed to update appointment: ${err.message}`);
    } finally {
      setAppointmentActionId(null);
    }
  };

  const handleDeleteAppointment = async (id) => {
    if (!window.confirm('Are you sure you want to delete this appointment?')) return;
    setAppointmentActionId(id);
    try {
      await deleteAppointment(id);
      setAppointmentMessage('Appointment deleted successfully.');
      loadAppointments();
    } catch (err) {
      setAppointmentMessage(`Failed to delete appointment: ${err.message}`);
    } finally {
      setAppointmentActionId(null);
    }
  };

  const handleCreateAppointment = async (e) => {
    e.preventDefault();
    setSubmittingModal(true);
    setAppointmentMessage('');
    try {
      await createAppointment(newAppointment);
      setIsModalOpen(false);
      setAppointmentMessage('Appointment booked successfully!');
      setNewAppointment({
        customer_name: '',
        customer_email: '',
        customer_phone: '',
        service_type: 'Software Development Consultation',
        appointment_date: new Date().toISOString().split('T')[0],
        appointment_time: '14:00',
        duration_minutes: 60,
        notes: '',
      });
      loadAppointments();
    } catch (err) {
      alert(`Error creating appointment: ${err.message}`);
    } finally {
      setSubmittingModal(false);
    }
  };

  // ── Metrics Calculation ──
  const metrics = useMemo(() => {
    const total = appointments.length;
    const scheduled = appointments.filter((a) => a.status === 'scheduled').length;
    const completed = appointments.filter((a) => a.status === 'completed').length;
    const cancelled = appointments.filter((a) => a.status === 'cancelled').length;
    return { total, scheduled, completed, cancelled };
  }, [appointments]);

  const pendingApprovalsCount = useMemo(() => {
    return approvals.filter((a) => a.status === 'pending').length;
  }, [approvals]);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-background text-on-surface font-body-md flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="border-b border-outline-variant bg-surface px-lg py-md flex items-center justify-between z-10 flex-shrink-0">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-on-surface-variant hover:text-primary transition-colors flex items-center">
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center">
                <span className="material-symbols-outlined text-primary text-[24px]">
                  {activeTab === 'approvals' ? 'gavel' : 'event_available'}
                </span>
              </div>
              <div>
                <h1 className="font-headline-sm text-headline-sm text-on-surface m-0 leading-tight">
                  Approvals and Appointments
                </h1>
                <p className="font-body-sm text-body-sm text-on-surface-variant m-0">
                  Manage agent operations approvals and customer service appointments
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {activeTab === 'appointments' && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-md py-sm bg-primary hover:bg-primary/90 text-on-primary rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2 shadow-sm"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span> Book Appointment
              </button>
            )}
            <button
              onClick={() => {
                if (activeTab === 'approvals') loadApprovals();
                else loadAppointments();
              }}
              className="px-md py-sm bg-surface-variant hover:bg-outline-variant rounded-md text-body-sm font-label-md transition-colors flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span> Refresh
            </button>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="bg-surface border-b border-outline-variant px-lg flex items-center gap-6 flex-shrink-0">
          <button
            onClick={() => setActiveTab('approvals')}
            className={`py-md text-label-lg font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'approvals'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">gavel</span>
            Pending Approvals
            {pendingApprovalsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-error-container text-error">
                {pendingApprovalsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('appointments')}
            className={`py-md text-label-lg font-bold flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'appointments'
                ? 'border-primary text-primary'
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[20px]">calendar_month</span>
            Appointments
            {metrics.scheduled > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary-container text-primary">
                {metrics.scheduled}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        <main className="flex-1 p-lg overflow-y-auto flex flex-col gap-md">
          {/* ═══════════════════════════════════════════════════ */}
          {/* TAB 1: APPROVALS HUB                                */}
          {/* ═══════════════════════════════════════════════════ */}
          {activeTab === 'approvals' && (
            <>
              {approvalMessage && (
                <div className="p-md bg-surface-variant border border-outline rounded-md text-body-sm">
                  {approvalMessage}
                </div>
              )}

              <div className="bg-surface border border-outline-variant rounded-lg p-md flex flex-col gap-md">
                <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
                  <span className="material-symbols-outlined text-error">verified_user</span> Pending Human Approval Requests
                </h2>

                {approvalsLoading ? (
                  <p className="text-on-surface-variant font-body-sm italic p-md">Loading pending approvals...</p>
                ) : approvals.length === 0 ? (
                  <div className="p-xl text-center border border-dashed border-outline-variant rounded-md">
                    <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-sm">task_alt</span>
                    <p className="font-title-md text-on-surface">No Pending Approval Requests</p>
                    <p className="font-body-sm text-on-surface-variant">All multi-agent operations have completed or are cleared.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-md">
                    {approvals.map((item) => {
                      const payload = item.action_payload || item.details || {};
                      const details = typeof payload === 'string' ? JSON.parse(payload) : payload;
                      return (
                        <div key={item.id} className="p-md bg-surface-variant/40 border border-outline-variant rounded-lg flex flex-col gap-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded text-xs font-bold bg-primary-container text-primary">
                                {item.action_type || 'APPROVAL_ACTION'}
                              </span>
                              <span className="text-body-sm font-bold text-on-surface">ID: {item.id}</span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-bold ${
                                item.status === 'pending'
                                  ? 'bg-yellow-900/40 text-yellow-300'
                                  : 'bg-green-900/40 text-green-300'
                              }`}
                            >
                              {item.status.toUpperCase()}
                            </span>
                          </div>

                          <div className="grid grid-cols-3 gap-md text-body-sm my-xs bg-background/50 p-sm rounded border border-outline-variant/40">
                            <div>
                              <span className="text-on-surface-variant font-label-md block">Requester Sub-Agent</span>
                              <span className="font-bold text-primary">
                                {item.requester_id || item.agent_instance_id || 'Customer Support Agent'}
                              </span>
                            </div>
                            <div>
                              <span className="text-on-surface-variant font-label-md block">Amount / Reference</span>
                              <span className="font-bold">
                                {details.amount
                                  ? `$${parseFloat(details.amount).toLocaleString()}`
                                  : details.order_id || details.orderId || details.bid_reference || details.invoice_number || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-on-surface-variant font-label-md block">Vendor / Customer</span>
                              <span className="font-bold">
                                {details.customer_name || details.customer_email || details.vendor_name || details.vendor_email || 'N/A'}
                              </span>
                            </div>
                          </div>

                          {item.status === 'pending' && (
                            <div className="flex items-center justify-end gap-md mt-xs">
                              <button
                                onClick={() => handleDecision(item.id, 'rejected')}
                                disabled={actingId === item.id}
                                className="px-md py-sm bg-error/20 hover:bg-error/30 text-error font-label-md rounded-md transition-colors flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[18px]">close</span> Reject Action
                              </button>
                              <button
                                onClick={() => handleDecision(item.id, 'approved')}
                                disabled={actingId === item.id}
                                className="px-md py-sm bg-primary hover:bg-primary/90 text-on-primary font-label-md rounded-md transition-colors flex items-center gap-1"
                              >
                                <span className="material-symbols-outlined text-[18px]">check</span> Approve & Execute Sub-Agent
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══════════════════════════════════════════════════ */}
          {/* TAB 2: APPOINTMENTS                                 */}
          {/* ═══════════════════════════════════════════════════ */}
          {activeTab === 'appointments' && (
            <div className="flex flex-col gap-md">
              {appointmentMessage && (
                <div className="p-md bg-surface-variant border border-outline rounded-md text-body-sm flex items-center justify-between">
                  <span>{appointmentMessage}</span>
                  <button onClick={() => setAppointmentMessage('')} className="text-on-surface-variant hover:text-on-surface">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              )}

              {/* Metrics Summary Bar */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-md">
                <div className="bg-surface border border-outline-variant p-md rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase font-bold text-on-surface-variant mb-1">Scheduled Slots</p>
                    <p className="text-2xl font-bold text-primary">{metrics.scheduled}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-primary-container flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[22px]">calendar_today</span>
                  </div>
                </div>

                <div className="bg-surface border border-outline-variant p-md rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase font-bold text-on-surface-variant mb-1">Completed</p>
                    <p className="text-2xl font-bold text-emerald-400">{metrics.completed}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-emerald-950/40 flex items-center justify-center text-emerald-400">
                    <span className="material-symbols-outlined text-[22px]">check_circle</span>
                  </div>
                </div>

                <div className="bg-surface border border-outline-variant p-md rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase font-bold text-on-surface-variant mb-1">Cancelled</p>
                    <p className="text-2xl font-bold text-rose-400">{metrics.cancelled}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-rose-950/40 flex items-center justify-center text-rose-400">
                    <span className="material-symbols-outlined text-[22px]">cancel</span>
                  </div>
                </div>

                <div className="bg-surface border border-outline-variant p-md rounded-lg flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase font-bold text-on-surface-variant mb-1">Total Bookings</p>
                    <p className="text-2xl font-bold text-on-surface">{metrics.total}</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-surface-variant flex items-center justify-center text-on-surface-variant">
                    <span className="material-symbols-outlined text-[22px]">groups</span>
                  </div>
                </div>
              </div>

              {/* Filters & Search Control Bar */}
              <div className="bg-surface border border-outline-variant rounded-lg p-md flex flex-wrap items-center justify-between gap-md">
                <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-md">
                  <div className="relative flex-1">
                    <span className="material-symbols-outlined absolute left-3 top-2.5 text-on-surface-variant text-[18px]">
                      search
                    </span>
                    <input
                      type="text"
                      placeholder="Search customer, service, phone, or notes..."
                      value={appointmentSearch}
                      onChange={(e) => setAppointmentSearch(e.target.value)}
                      className="w-full bg-background border border-outline-variant rounded-md pl-9 pr-3 py-1.5 text-body-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-md py-1.5 bg-surface-variant hover:bg-outline-variant text-body-sm font-label-md rounded-md transition-colors"
                  >
                    Filter
                  </button>
                </form>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px]">filter_alt</span> Status:
                    <select
                      value={appointmentFilterStatus}
                      onChange={(e) => setAppointmentFilterStatus(e.target.value)}
                      className="bg-background border border-outline-variant rounded-md px-3 py-1.5 text-body-sm text-on-surface focus:outline-none focus:border-primary"
                    >
                      <option value="all">All Statuses</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                    <span className="material-symbols-outlined text-[18px]">event</span> Date:
                    <input
                      type="date"
                      value={appointmentFilterDate}
                      onChange={(e) => setAppointmentFilterDate(e.target.value)}
                      className="bg-background border border-outline-variant rounded-md px-2 py-1.5 text-body-sm text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>

                  {(appointmentFilterStatus !== 'all' || appointmentFilterDate || appointmentSearch) && (
                    <button
                      onClick={() => {
                        setAppointmentFilterStatus('all');
                        setAppointmentFilterDate('');
                        setAppointmentSearch('');
                      }}
                      className="text-xs text-primary hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Appointments List */}
              <div className="bg-surface border border-outline-variant rounded-lg p-md flex flex-col gap-md">
                <div className="flex items-center justify-between">
                  <h2 className="font-title-md text-title-md text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">event_note</span> Service Appointments
                  </h2>
                  <span className="text-body-sm text-on-surface-variant">
                    Showing {appointments.length} record{appointments.length === 1 ? '' : 's'}
                  </span>
                </div>

                {appointmentsLoading ? (
                  <p className="text-on-surface-variant font-body-sm italic p-md">Loading service appointments...</p>
                ) : appointments.length === 0 ? (
                  <div className="p-xl text-center border border-dashed border-outline-variant rounded-md">
                    <span className="material-symbols-outlined text-[48px] text-on-surface-variant mb-sm">calendar_month</span>
                    <p className="font-title-md text-on-surface">No Appointments Found</p>
                    <p className="font-body-sm text-on-surface-variant">
                      When customers request services in conversation, the AI Customer Support Agent will schedule them here.
                    </p>
                    <button
                      onClick={() => setIsModalOpen(true)}
                      className="mt-md inline-flex items-center gap-2 px-md py-sm bg-primary hover:bg-primary/90 text-on-primary rounded-md text-body-sm font-label-md transition-colors"
                    >
                      <span className="material-symbols-outlined text-[18px]">add</span> Book First Appointment
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-md">
                    {appointments.map((appt) => {
                      const apptDateFormatted = appt.appointment_date
                        ? new Date(appt.appointment_date).toLocaleDateString(undefined, {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'N/A';

                      return (
                        <div
                          key={appt.id}
                          className="p-md bg-surface-variant/40 border border-outline-variant rounded-lg flex flex-col gap-sm hover:border-primary/50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                <span className="text-base font-bold text-on-surface">{appt.service_type}</span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                                    appt.status === 'scheduled'
                                      ? 'bg-blue-900/40 text-blue-300 border border-blue-800/50'
                                      : appt.status === 'completed'
                                      ? 'bg-emerald-900/40 text-emerald-300 border border-emerald-800/50'
                                      : 'bg-rose-900/40 text-rose-300 border border-rose-800/50'
                                  }`}
                                >
                                  {appt.status.toUpperCase()}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded bg-surface-variant text-on-surface-variant font-mono">
                                  {appt.created_by === 'ai_agent' ? '🤖 Booked by AI Agent' : '👤 Manual Booking'}
                                </span>
                              </div>
                              <p className="text-xs text-on-surface-variant font-mono">ID: {appt.id}</p>
                            </div>

                            {/* Date Badge */}
                            <div className="flex items-center gap-2 bg-primary-container text-primary px-3 py-1.5 rounded-lg">
                              <span className="material-symbols-outlined text-[20px]">schedule</span>
                              <div className="text-right">
                                <p className="text-xs font-bold leading-tight">{apptDateFormatted}</p>
                                <p className="text-xs leading-tight">
                                  {appt.appointment_time} ({appt.duration_minutes || 60}m)
                                </p>
                              </div>
                            </div>
                          </div>

                          {/* Customer & Scope Info */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-md text-body-sm my-xs bg-background/60 p-sm rounded-lg border border-outline-variant/40">
                            <div>
                              <span className="text-on-surface-variant font-label-md block text-xs">Customer Details</span>
                              <span className="font-bold text-on-surface block">{appt.customer_name}</span>
                              <a
                                href={`mailto:${appt.customer_email}`}
                                className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5"
                              >
                                <span className="material-symbols-outlined text-[14px]">mail</span>
                                {appt.customer_email}
                              </a>
                              {appt.customer_phone && (
                                <a
                                  href={`tel:${appt.customer_phone}`}
                                  className="text-xs text-on-surface-variant hover:text-on-surface flex items-center gap-1 mt-0.5"
                                >
                                  <span className="material-symbols-outlined text-[14px]">call</span>
                                  {appt.customer_phone}
                                </a>
                              )}
                            </div>

                            <div className="md:col-span-2">
                              <span className="text-on-surface-variant font-label-md block text-xs">Requirements & Notes</span>
                              <p className="text-sm text-on-surface mt-0.5 whitespace-pre-wrap">
                                {appt.notes || <span className="text-on-surface-variant italic">No special notes provided.</span>}
                              </p>
                            </div>
                          </div>

                          {/* Actions Bar */}
                          <div className="flex items-center justify-between pt-1 border-t border-outline-variant/30">
                            <span className="text-xs text-on-surface-variant">
                              Created {new Date(appt.created_at).toLocaleString()}
                            </span>

                            <div className="flex items-center gap-2">
                              {appt.status === 'scheduled' && (
                                <>
                                  <button
                                    onClick={() => handleUpdateStatus(appt.id, 'completed')}
                                    disabled={appointmentActionId === appt.id}
                                    className="px-3 py-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 font-label-md text-xs rounded-md transition-colors flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">check</span> Mark Completed
                                  </button>
                                  <button
                                    onClick={() => handleUpdateStatus(appt.id, 'cancelled')}
                                    disabled={appointmentActionId === appt.id}
                                    className="px-3 py-1 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 font-label-md text-xs rounded-md transition-colors flex items-center gap-1"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">close</span> Cancel
                                  </button>
                                </>
                              )}

                              {appt.status !== 'scheduled' && (
                                <button
                                  onClick={() => handleUpdateStatus(appt.id, 'scheduled')}
                                  disabled={appointmentActionId === appt.id}
                                  className="px-3 py-1 bg-surface-variant hover:bg-outline-variant text-on-surface font-label-md text-xs rounded-md transition-colors flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-[16px]">replay</span> Reopen Slot
                                </button>
                              )}

                              <button
                                onClick={() => handleDeleteAppointment(appt.id)}
                                disabled={appointmentActionId === appt.id}
                                className="px-2 py-1 text-on-surface-variant hover:text-rose-400 font-label-md text-xs rounded-md transition-colors flex items-center"
                                title="Delete Record"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>

        {/* ═══════════════════════════════════════════════════ */}
        {/* MODAL: MANUAL APPOINTMENT CREATION                  */}
        {/* ═══════════════════════════════════════════════════ */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-md">
            <div className="bg-surface border border-outline-variant rounded-xl max-w-lg w-full p-lg flex flex-col gap-md shadow-2xl">
              <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center text-primary">
                    <span className="material-symbols-outlined text-[20px]">calendar_add_on</span>
                  </div>
                  <h3 className="font-title-lg text-title-lg text-on-surface m-0">Book Service Appointment</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateAppointment} className="flex flex-col gap-sm text-body-sm">
                <div className="grid grid-cols-2 gap-sm">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Customer Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={newAppointment.customer_name}
                      onChange={(e) => setNewAppointment({ ...newAppointment, customer_name: e.target.value })}
                      className="w-full bg-background border border-outline-variant rounded-md px-3 py-1.5 text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Customer Email *</label>
                    <input
                      type="email"
                      required
                      placeholder="jane@example.com"
                      value={newAppointment.customer_email}
                      onChange={(e) => setNewAppointment({ ...newAppointment, customer_email: e.target.value })}
                      className="w-full bg-background border border-outline-variant rounded-md px-3 py-1.5 text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-sm">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Customer Phone</label>
                    <input
                      type="tel"
                      placeholder="+1 (555) 000-1122"
                      value={newAppointment.customer_phone}
                      onChange={(e) => setNewAppointment({ ...newAppointment, customer_phone: e.target.value })}
                      className="w-full bg-background border border-outline-variant rounded-md px-3 py-1.5 text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Service Type *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Software Consultation, Cleaning"
                      value={newAppointment.service_type}
                      onChange={(e) => setNewAppointment({ ...newAppointment, service_type: e.target.value })}
                      className="w-full bg-background border border-outline-variant rounded-md px-3 py-1.5 text-on-surface focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-sm">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Date *</label>
                    <input
                      type="date"
                      required
                      value={newAppointment.appointment_date}
                      onChange={(e) => setNewAppointment({ ...newAppointment, appointment_date: e.target.value })}
                      className="w-full bg-background border border-outline-variant rounded-md px-2 py-1.5 text-on-surface focus:outline-none focus:border-primary text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Time *</label>
                    <input
                      type="time"
                      required
                      value={newAppointment.appointment_time}
                      onChange={(e) => setNewAppointment({ ...newAppointment, appointment_time: e.target.value })}
                      className="w-full bg-background border border-outline-variant rounded-md px-2 py-1.5 text-on-surface focus:outline-none focus:border-primary text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Duration (mins)</label>
                    <input
                      type="number"
                      min="15"
                      step="15"
                      value={newAppointment.duration_minutes}
                      onChange={(e) => setNewAppointment({ ...newAppointment, duration_minutes: parseInt(e.target.value) || 60 })}
                      className="w-full bg-background border border-outline-variant rounded-md px-2 py-1.5 text-on-surface focus:outline-none focus:border-primary text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Scope & Requirements Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Project details, address, client requests, tech stack..."
                    value={newAppointment.notes}
                    onChange={(e) => setNewAppointment({ ...newAppointment, notes: e.target.value })}
                    className="w-full bg-background border border-outline-variant rounded-md px-3 py-1.5 text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 mt-sm pt-sm border-t border-outline-variant">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-md py-sm bg-surface-variant hover:bg-outline-variant text-on-surface rounded-md font-label-md transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingModal}
                    className="px-md py-sm bg-primary hover:bg-primary/90 text-on-primary rounded-md font-label-md transition-colors flex items-center gap-1"
                  >
                    {submittingModal ? 'Booking...' : 'Confirm Appointment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
