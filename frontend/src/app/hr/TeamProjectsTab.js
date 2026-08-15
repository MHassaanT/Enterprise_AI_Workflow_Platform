'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  fetchEmployees, createEmployee, deleteEmployee, importEmployees,
  fetchProjects, createProject, fetchProject, updateProject, deleteProject,
  addProjectMember, removeProjectMember, submitProjectUpdate, checkProjectPacing
} from '@/lib/api';

export default function TeamProjectsTab() {
  const [subTab, setSubTab] = useState('projects'); // 'projects' | 'employees'
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProjectData, setActiveProjectData] = useState(null); // { project, members, updates }

  // Employee Form Modal
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', email: '', position: '', department: '', hire_date: '' });
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  // Project Form Modal
  const [showProjModal, setShowProjModal] = useState(false);
  const [projForm, setProjForm] = useState({ name: '', description: '', start_date: '', expected_completion: '' });

  // Member Modal
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberForm, setMemberForm] = useState({ employee_id: '', role: 'member', responsibilities: '' });

  // Update Modal
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateForm, setUpdateForm] = useState({ submitted_by: '', progress_pct: '', notes: '', blockers: '' });

  const [pacingChecking, setPacingChecking] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [empList, projList] = await Promise.all([fetchEmployees(), fetchProjects()]);
      setEmployees(empList);
      setProjects(projList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadProjectDetails = async (id) => {
    try {
      setActiveProjectId(id);
      const data = await fetchProject(id);
      setActiveProjectData(data);
    } catch (e) {
      alert(e.message);
    }
  };

  // Employee Actions
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    try {
      await createEmployee(empForm.name, empForm.email, empForm.position, empForm.department, empForm.hire_date);
      setEmpForm({ name: '', email: '', position: '', department: '', hire_date: '' });
      setShowEmpModal(false);
      loadData();
    } catch (e) { alert(e.message); }
  };

  const handleDeleteEmployee = async (id) => {
    if (!confirm('Are you sure you want to delete this employee?')) return;
    try {
      await deleteEmployee(id);
      loadData();
    } catch (e) { alert(e.message); }
  };

  const handleImportEmployees = async (e) => {
    e.preventDefault();
    if (!importFile) return;
    try {
      setImporting(true);
      const res = await importEmployees(importFile);
      alert(`Successfully imported ${res.imported} employee(s). ${res.errors?.length ? `(${res.errors.length} errors)` : ''}`);
      setImportFile(null);
      loadData();
    } catch (e) { alert(e.message); }
    finally { setImporting(false); }
  };

  // Project Actions
  const handleCreateProject = async (e) => {
    e.preventDefault();
    try {
      const proj = await createProject(projForm.name, projForm.description, projForm.start_date, projForm.expected_completion);
      setProjForm({ name: '', description: '', start_date: '', expected_completion: '' });
      setShowProjModal(false);
      await loadData();
      loadProjectDetails(proj.id);
    } catch (e) { alert(e.message); }
  };

  const handleDeleteProject = async (id) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      await deleteProject(id);
      if (activeProjectId === id) { setActiveProjectId(null); setActiveProjectData(null); }
      loadData();
    } catch (e) { alert(e.message); }
  };

  // Member Actions
  const handleAddMember = async (e) => {
    e.preventDefault();
    try {
      await addProjectMember(activeProjectId, memberForm.employee_id, memberForm.role, memberForm.responsibilities);
      setMemberForm({ employee_id: '', role: 'member', responsibilities: '' });
      setShowMemberModal(false);
      loadProjectDetails(activeProjectId);
      loadData();
    } catch (e) { alert(e.message); }
  };

  const handleRemoveMember = async (memberId) => {
    if (!confirm('Remove team member from project?')) return;
    try {
      await removeProjectMember(activeProjectId, memberId);
      loadProjectDetails(activeProjectId);
      loadData();
    } catch (e) { alert(e.message); }
  };

  // Status Update Actions
  const handleSubmitUpdate = async (e) => {
    e.preventDefault();
    try {
      await submitProjectUpdate(
        activeProjectId,
        updateForm.submitted_by,
        updateForm.progress_pct !== '' ? Number(updateForm.progress_pct) : null,
        updateForm.notes,
        updateForm.blockers
      );
      setUpdateForm({ submitted_by: '', progress_pct: '', notes: '', blockers: '' });
      setShowUpdateModal(false);
      loadProjectDetails(activeProjectId);
      loadData();
    } catch (e) { alert(e.message); }
  };

  const handleCheckPacing = async () => {
    try {
      setPacingChecking(true);
      await checkProjectPacing();
      alert('Pacing check complete. Email notifications sent for any behind-schedule projects.');
      if (activeProjectId) loadProjectDetails(activeProjectId);
    } catch (e) { alert(e.message); }
    finally { setPacingChecking(false); }
  };

  const pacingBadge = (status) => {
    const map = {
      on_track: { label: 'On Track', color: '#22c55e', bg: '#dcfce7' },
      at_risk: { label: 'At Risk', color: '#f59e0b', bg: '#fef3c7' },
      behind: { label: 'Behind Schedule', color: '#ef4444', bg: '#fee2e2' },
      ahead: { label: 'Ahead', color: '#3b82f6', bg: '#dbeafe' },
    };
    const item = map[status] || { label: status || 'Unknown', color: '#6b7280', bg: '#f3f4f6' };
    return (
      <span style={{ background: item.bg, color: item.color, padding: '3px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {item.label}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top Header & Subtabs */}
      <div style={{ padding: '16px 32px', background: '#fff', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ display: 'flex', background: '#f3f4f6', padding: 3, borderRadius: 8 }}>
            <button onClick={() => { setSubTab('projects'); setActiveProjectId(null); }}
              style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: subTab === 'projects' ? '#fff' : 'transparent', fontWeight: 600, fontSize: 13, color: subTab === 'projects' ? 'var(--color-primary)' : 'var(--color-muted)', cursor: 'pointer', boxShadow: subTab === 'projects' ? 'var(--shadow-sm)' : 'none' }}>
              Projects ({projects.length})
            </button>
            <button onClick={() => { setSubTab('employees'); setActiveProjectId(null); }}
              style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: subTab === 'employees' ? '#fff' : 'transparent', fontWeight: 600, fontSize: 13, color: subTab === 'employees' ? 'var(--color-primary)' : 'var(--color-muted)', cursor: 'pointer', boxShadow: subTab === 'employees' ? 'var(--shadow-sm)' : 'none' }}>
              Team Members ({employees.length})
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {subTab === 'projects' && (
            <>
              <button onClick={handleCheckPacing} disabled={pacingChecking}
                style={{ padding: '8px 16px', background: '#f0f9ff', color: '#0284c7', border: '1px solid #7dd3fc', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: pacingChecking ? 0.5 : 1 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>speed</span>
                {pacingChecking ? 'Checking...' : 'Check Pacing & Notify'}
              </button>
              <button onClick={() => setShowProjModal(true)}
                style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                + New Project
              </button>
            </>
          )}

          {subTab === 'employees' && (
            <button onClick={() => setShowEmpModal(true)}
              style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              + Add Employee / Import
            </button>
          )}
        </div>
      </div>

      {/* Main Body */}
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg)' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-muted)' }}>Loading...</div>
        ) : subTab === 'employees' ? (
          /* EMPLOYEES VIEW */
          <div style={{ maxWidth: 1100, margin: '32px auto', padding: '0 24px' }}>
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--color-text)' }}>Employee Directory</h3>
              </div>
              {employees.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, color: 'var(--color-muted)' }}>No employees registered. Add employees manually or import via CSV/XLSX.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '2px solid var(--color-border)', textAlign: 'left', background: '#fafbfc' }}>
                      <th style={{ padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Employee</th>
                      <th style={{ padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Position & Dept</th>
                      <th style={{ padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Active Projects</th>
                      <th style={{ padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase' }}>Status</th>
                      <th style={{ padding: '12px 16px', color: 'var(--color-muted)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', width: 60 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map(emp => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ fontWeight: 600, color: 'var(--color-text)' }}>{emp.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{emp.email}</div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ color: 'var(--color-text)', fontWeight: 500 }}>{emp.position}</div>
                          <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{emp.department || 'General'}</div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {emp.projects && emp.projects.length > 0 ? (
                              emp.projects.map((p, idx) => (
                                <span key={idx} style={{ background: '#f3f4f6', color: 'var(--color-text)', padding: '2px 8px', borderRadius: 4, fontSize: 11, border: '1px solid #e5e7eb' }}>
                                  {p.project_name} ({p.role})
                                </span>
                              ))
                            ) : (
                              <span style={{ color: 'var(--color-muted)', fontSize: 12 }}>Unassigned</span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <span style={{ background: emp.status === 'active' ? '#dcfce7' : '#fee2e2', color: emp.status === 'active' ? '#166534' : '#991b1b', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 }}>
                            {emp.status}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <button onClick={() => handleDeleteEmployee(emp.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}>
                            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : activeProjectId && activeProjectData ? (
          /* PROJECT DETAILS VIEW */
          <div style={{ maxWidth: 1100, margin: '32px auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
            <button onClick={() => setActiveProjectId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, alignSelf: 'flex-start' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span> Back to Projects List
            </button>

            {/* Project Summary Card */}
            <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow-sm)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--color-text)' }}>{activeProjectData.project.name}</h2>
                    {pacingBadge(activeProjectData.project.pacing_status)}
                  </div>
                  <p style={{ margin: 0, fontSize: 14, color: 'var(--color-muted)', maxWidth: 700 }}>{activeProjectData.project.description}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setShowUpdateModal(true)} style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    + Post Status Update
                  </button>
                </div>
              </div>

              {/* Progress Bar & Dates */}
              <div style={{ background: '#fafbfc', border: '1px solid var(--color-border)', borderRadius: 10, padding: 20, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 24, alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    <span>Actual Progress: {activeProjectData.project.current_progress}%</span>
                    <span style={{ color: 'var(--color-muted)' }}>Expected: {activeProjectData.project.expected_progress}%</span>
                  </div>
                  <div style={{ height: 10, background: 'var(--color-border)', borderRadius: 5, overflow: 'hidden', position: 'relative' }}>
                    <div style={{ width: `${activeProjectData.project.current_progress}%`, height: '100%', background: activeProjectData.project.pacing_status === 'behind' ? '#ef4444' : '#22c55e', borderRadius: 5, transition: 'width 0.8s ease' }} />
                  </div>
                </div>
                <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 20 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Timeline</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginTop: 4 }}>
                    {new Date(activeProjectData.project.start_date).toLocaleDateString()} — {new Date(activeProjectData.project.expected_completion).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ borderLeft: '1px solid var(--color-border)', paddingLeft: 20 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Team Size</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text)', marginTop: 4 }}>
                    {activeProjectData.members.length} members assigned
                  </div>
                </div>
              </div>
            </div>

            {/* Grid: Members & Updates */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              {/* Team Members Column */}
              <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>Team Members</h3>
                  <button onClick={() => setShowMemberModal(true)} style={{ padding: '6px 12px', background: '#f3f4f6', color: 'var(--color-text)', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    + Assign Member
                  </button>
                </div>
                {activeProjectData.members.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)', fontSize: 13 }}>No team members assigned yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {activeProjectData.members.map(m => (
                      <div key={m.member_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 12, border: '1px solid var(--color-border)', borderRadius: 8, background: '#fafbfc' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--color-text)' }}>{m.name}</div>
                          <div style={{ fontSize: 12, color: '#7c3aed', fontWeight: 500 }}>{m.role}</div>
                          {m.responsibilities && <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>{m.responsibilities}</div>}
                        </div>
                        <button onClick={() => handleRemoveMember(m.member_id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Updates Feed Column */}
              <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>Status Updates Feed</h3>
                </div>
                {activeProjectData.updates.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 32, color: 'var(--color-muted)', fontSize: 13 }}>No status updates posted yet.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflowY: 'auto' }}>
                    {activeProjectData.updates.map(u => (
                      <div key={u.id} style={{ padding: 14, border: '1px solid var(--color-border)', borderRadius: 8, background: '#fafbfc' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>{u.submitted_by_name}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{new Date(u.created_at).toLocaleString()}</span>
                        </div>
                        {u.progress_pct != null && (
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#0284c7', marginBottom: 4 }}>
                            Progress updated to {u.progress_pct}%
                          </div>
                        )}
                        <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>{u.notes}</p>
                        {u.blockers && (
                          <div style={{ marginTop: 8, padding: 8, background: '#fee2e2', borderRadius: 6, fontSize: 12, color: '#991b1b' }}>
                            <strong>Blockers:</strong> {u.blockers}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* PROJECTS GRID VIEW */
          <div style={{ maxWidth: 1100, margin: '32px auto', padding: '0 24px' }}>
            {projects.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: 'var(--color-muted)', background: '#fff', borderRadius: 12, border: '1px dashed var(--color-border)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.3, marginBottom: 12, display: 'block' }}>rocket_launch</span>
                <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No projects tracked yet.</p>
                <p style={{ fontSize: 13 }}>Create a project to track team assignments, progress, and automated deadline reminders.</p>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 20 }}>
                {projects.map(p => {
                  const startDate = new Date(p.start_date);
                  const endDate = new Date(p.expected_completion);
                  const now = new Date();
                  const totalDays = Math.max(1, (endDate - startDate) / (1000 * 60 * 60 * 24));
                  const elapsedDays = Math.max(0, (now - startDate) / (1000 * 60 * 60 * 24));
                  const expectedProgress = Math.min(100, Math.round((elapsedDays / totalDays) * 100));
                  const pacingDelta = p.current_progress - expectedProgress;
                  let pacingStatus = 'on_track';
                  if (pacingDelta < -15) pacingStatus = 'behind';
                  else if (pacingDelta < -5) pacingStatus = 'at_risk';
                  else if (pacingDelta > 10) pacingStatus = 'ahead';

                  return (
                    <div key={p.id} onClick={() => loadProjectDetails(p.id)}
                      style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, cursor: 'pointer', boxShadow: 'var(--shadow-sm)', transition: 'all 0.2s', position: 'relative' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
                      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--color-border)'}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <h4 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-text)' }}>{p.name}</h4>
                        {pacingBadge(pacingStatus)}
                      </div>
                      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--color-muted)', height: 38, overflow: 'hidden' }}>{p.description}</p>
                      
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                          <span>Progress</span>
                          <span>{p.current_progress}%</span>
                        </div>
                        <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${p.current_progress}%`, height: '100%', background: pacingStatus === 'behind' ? '#ef4444' : '#22c55e', borderRadius: 4 }} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--color-muted)', paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                        <span>{p.member_count || 0} members</span>
                        <span>Due: {new Date(p.expected_completion).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: CREATE EMPLOYEE */}
      {showEmpModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 500, padding: 24, boxShadow: 'var(--shadow-modal)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Add Employee or Import</h3>
              <button onClick={() => setShowEmpModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
            </div>

            {/* Single Add Form */}
            <form onSubmit={handleCreateEmployee} style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
              <h4 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Add Single Employee</h4>
              <input type="text" required placeholder="Full Name" value={empForm.name} onChange={e => setEmpForm({ ...empForm, name: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              <input type="email" required placeholder="Work Email" value={empForm.email} onChange={e => setEmpForm({ ...empForm, email: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              <input type="text" required placeholder="Position / Role" value={empForm.position} onChange={e => setEmpForm({ ...empForm, position: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              <input type="text" placeholder="Department" value={empForm.department} onChange={e => setEmpForm({ ...empForm, department: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              <button type="submit" style={{ padding: '8px 16px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                Save Employee
              </button>
            </form>

            {/* CSV Import Form */}
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 20 }}>
              <h4 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>Bulk Import (CSV / XLSX)</h4>
              <form onSubmit={handleImportEmployees} style={{ display: 'flex', gap: 8 }}>
                <input type="file" accept=".csv,.xlsx" onChange={e => setImportFile(e.target.files[0])}
                  style={{ flex: 1, fontSize: 12 }} />
                <button type="submit" disabled={!importFile || importing} style={{ padding: '6px 14px', background: '#f3f4f6', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                  {importing ? 'Importing...' : 'Upload'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PROJECT */}
      {showProjModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 500, padding: 24, boxShadow: 'var(--shadow-modal)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Create New Project</h3>
              <button onClick={() => setShowProjModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Project Name</label>
                <input type="text" required value={projForm.name} onChange={e => setProjForm({ ...projForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Description</label>
                <textarea value={projForm.description} onChange={e => setProjForm({ ...projForm, description: e.target.value })} rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Start Date</label>
                  <input type="date" required value={projForm.start_date} onChange={e => setProjForm({ ...projForm, start_date: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Expected Completion</label>
                  <input type="date" required value={projForm.expected_completion} onChange={e => setProjForm({ ...projForm, expected_completion: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
                </div>
              </div>
              <button type="submit" style={{ padding: '10px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
                Create Project
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN MEMBER */}
      {showMemberModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 450, padding: 24, boxShadow: 'var(--shadow-modal)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Assign Team Member</h3>
              <button onClick={() => setShowMemberModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Select Employee</label>
                <select required value={memberForm.employee_id} onChange={e => setMemberForm({ ...memberForm, employee_id: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Select an employee...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.position})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Role in Project</label>
                <input type="text" placeholder="e.g. Project Lead, Frontend Dev" value={memberForm.role} onChange={e => setMemberForm({ ...memberForm, role: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Responsibilities</label>
                <textarea placeholder="Key deliverables or tasks..." value={memberForm.responsibilities} onChange={e => setMemberForm({ ...memberForm, responsibilities: e.target.value })} rows={2}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <button type="submit" style={{ padding: '10px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
                Assign to Project
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: POST UPDATE */}
      {showUpdateModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 480, padding: 24, boxShadow: 'var(--shadow-modal)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Post Project Status Update</h3>
              <button onClick={() => setShowUpdateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleSubmitUpdate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Submitted By</label>
                <select required value={updateForm.submitted_by} onChange={e => setUpdateForm({ ...updateForm, submitted_by: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Select team member...</option>
                  {(activeProjectData?.members || []).map(m => <option key={m.employee_id} value={m.employee_id}>{m.name} ({m.role})</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>New Overall Progress % (Optional)</label>
                <input type="number" min="0" max="100" placeholder="e.g. 45" value={updateForm.progress_pct} onChange={e => setUpdateForm({ ...updateForm, progress_pct: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Progress Notes / Summary</label>
                <textarea required placeholder="What was accomplished..." value={updateForm.notes} onChange={e => setUpdateForm({ ...updateForm, notes: e.target.value })} rows={3}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Blockers / Risks (Optional)</label>
                <textarea placeholder="Any delays or impediments..." value={updateForm.blockers} onChange={e => setUpdateForm({ ...updateForm, blockers: e.target.value })} rows={2}
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 13 }} />
              </div>
              <button type="submit" style={{ padding: '10px 20px', background: 'var(--color-primary)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: 'pointer', marginTop: 10 }}>
                Post Update
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
