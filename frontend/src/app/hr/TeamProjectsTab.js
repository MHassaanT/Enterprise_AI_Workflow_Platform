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
      alert('Pacing check complete. Email notifications dispatched for behind-schedule projects.');
      if (activeProjectId) loadProjectDetails(activeProjectId);
    } catch (e) { alert(e.message); }
    finally { setPacingChecking(false); }
  };

  const renderPacingBadge = (status) => {
    const map = {
      on_track: { label: 'On Track', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
      at_risk: { label: 'At Risk', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
      behind: { label: 'Behind Schedule', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
      ahead: { label: 'Ahead', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    };
    const item = map[status] || { label: status || 'Active', cls: 'bg-surface-container text-on-surface-variant border-outline-variant' };
    return (
      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${item.cls}`}>
        {item.label}
      </span>
    );
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden w-full bg-background">
      {/* Subtab Navigation Bar */}
      <div className="px-6 py-3 bg-surface border-b border-outline-variant flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2 bg-surface-container-low p-1 rounded-xl border border-outline-variant">
          <button
            onClick={() => { setSubTab('projects'); setActiveProjectId(null); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === 'projects'
                ? 'bg-surface text-primary shadow-sm border border-outline-variant/50'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Projects ({projects.length})
          </button>
          <button
            onClick={() => { setSubTab('employees'); setActiveProjectId(null); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              subTab === 'employees'
                ? 'bg-surface text-primary shadow-sm border border-outline-variant/50'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Team Directory ({employees.length})
          </button>
        </div>

        <div className="flex items-center gap-3">
          {subTab === 'projects' && (
            <>
              <button
                onClick={handleCheckPacing}
                disabled={pacingChecking}
                className="px-3.5 py-1.5 bg-secondary text-on-secondary rounded-lg text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">speed</span>
                {pacingChecking ? 'Checking...' : 'Check Pacing & Notify'}
              </button>
              <button
                onClick={() => setShowProjModal(true)}
                className="px-3.5 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:bg-primary-container transition-colors flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                New Project
              </button>
            </>
          )}

          {subTab === 'employees' && (
            <button
              onClick={() => setShowEmpModal(true)}
              className="px-3.5 py-1.5 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:bg-primary-container transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">person_add</span>
              Add Employee / Import
            </button>
          )}
        </div>
      </div>

      {/* Main Body Container — Spans full width! */}
      <div className="flex-1 overflow-y-auto p-6 lg:p-8 w-full">
        {loading ? (
          <div className="text-center py-12 text-on-surface-variant">Loading platform data...</div>
        ) : subTab === 'employees' ? (
          /* EMPLOYEES DIRECTORY VIEW */
          <div className="space-y-6 w-full">
            <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
              <div className="p-6 border-b border-outline-variant flex justify-between items-center">
                <div>
                  <h3 className="font-headline-sm text-on-surface">Employee Directory</h3>
                  <p className="text-xs text-on-surface-variant mt-1">Manage team members, roles, and project assignments.</p>
                </div>
              </div>
              {employees.length === 0 ? (
                <div className="text-center py-16 text-on-surface-variant bg-surface-container-low border-dashed">
                  <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">groups</span>
                  <p className="text-sm font-medium">No employees registered yet.</p>
                  <p className="text-xs mt-1">Add employees manually or upload a CSV/XLSX spreadsheet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant text-on-surface-variant font-label-sm uppercase tracking-wider bg-surface-container-low">
                        <th className="p-4">Employee</th>
                        <th className="p-4">Position & Dept</th>
                        <th className="p-4">Assigned Projects</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 w-16"></th>
                      </tr>
                    </thead>
                    <tbody className="align-top text-sm">
                      {employees.map(emp => (
                        <tr key={emp.id} className="border-b border-outline-variant/50 hover:bg-surface-container-low transition-colors">
                          <td className="p-4">
                            <div className="font-medium text-on-surface">{emp.name}</div>
                            <div className="text-xs text-on-surface-variant">{emp.email}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-on-surface font-medium">{emp.position}</div>
                            <div className="text-xs text-on-surface-variant">{emp.department || 'General'}</div>
                          </td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1.5">
                              {emp.projects && emp.projects.length > 0 ? (
                                emp.projects.map((p, idx) => (
                                  <span key={idx} className="text-xs px-2.5 py-0.5 bg-surface-container text-on-surface rounded border border-outline-variant">
                                    {p.project_name} ({p.role})
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-on-surface-variant italic">Unassigned</span>
                              )}
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                              emp.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {emp.status}
                            </span>
                          </td>
                          <td className="p-4">
                            <button onClick={() => handleDeleteEmployee(emp.id)} className="text-on-surface-variant hover:text-error transition-colors">
                              <span className="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : activeProjectId && activeProjectData ? (
          /* PROJECT DETAILS VIEW */
          <div className="space-y-6 w-full">
            <button
              onClick={() => setActiveProjectId(null)}
              className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span> Back to Projects List
            </button>

            {/* Project Banner Card */}
            <div className="bg-surface border border-outline-variant rounded-xl p-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="font-headline-md text-on-surface">{activeProjectData.project.name}</h2>
                    {renderPacingBadge(activeProjectData.project.pacing_status)}
                  </div>
                  <p className="text-sm text-on-surface-variant max-w-3xl">{activeProjectData.project.description}</p>
                </div>
                <button
                  onClick={() => setShowUpdateModal(true)}
                  className="px-4 py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">post_add</span> Post Status Update
                </button>
              </div>

              {/* Progress & Pacing Metrics Bar */}
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-on-surface">Actual Progress: {activeProjectData.project.current_progress}%</span>
                    <span className="text-on-surface-variant">Expected: {activeProjectData.project.expected_progress}%</span>
                  </div>
                  <div className="h-2.5 bg-surface-container-high rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-800 ${
                        activeProjectData.project.pacing_status === 'behind' ? 'bg-red-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${activeProjectData.project.current_progress}%` }}
                    />
                  </div>
                </div>
                <div className="md:border-l border-outline-variant md:pl-4">
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Timeline</span>
                  <p className="text-sm font-semibold text-on-surface mt-0.5">
                    {new Date(activeProjectData.project.start_date).toLocaleDateString()} — {new Date(activeProjectData.project.expected_completion).toLocaleDateString()}
                  </p>
                </div>
                <div className="md:border-l border-outline-variant md:pl-4">
                  <span className="text-[10px] text-on-surface-variant uppercase tracking-wider font-semibold">Team Roster</span>
                  <p className="text-sm font-semibold text-on-surface mt-0.5">
                    {activeProjectData.members.length} member(s) assigned
                  </p>
                </div>
              </div>
            </div>

            {/* Split View: Roster & Updates */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
              {/* Team Roster Column */}
              <div className="bg-surface border border-outline-variant rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-headline-sm text-on-surface">Assigned Team Members</h3>
                  <button
                    onClick={() => setShowMemberModal(true)}
                    className="px-3 py-1 bg-surface-container hover:bg-surface-container-high border border-outline-variant rounded-md text-xs font-semibold text-on-surface transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span> Assign Member
                  </button>
                </div>
                {activeProjectData.members.length === 0 ? (
                  <p className="text-xs text-on-surface-variant py-8 text-center bg-surface-container-low rounded-lg border border-dashed border-outline-variant">
                    No team members assigned yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {activeProjectData.members.map(m => (
                      <div key={m.member_id} className="p-3 bg-surface-container-low border border-outline-variant rounded-lg flex justify-between items-center">
                        <div>
                          <div className="font-medium text-on-surface text-sm">{m.name}</div>
                          <div className="text-xs text-primary font-semibold">{m.role}</div>
                          {m.responsibilities && <div className="text-xs text-on-surface-variant mt-1">{m.responsibilities}</div>}
                        </div>
                        <button onClick={() => handleRemoveMember(m.member_id)} className="text-on-surface-variant hover:text-error transition-colors">
                          <span className="material-symbols-outlined text-[18px]">close</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Updates Feed Column */}
              <div className="bg-surface border border-outline-variant rounded-xl p-6">
                <h3 className="font-headline-sm text-on-surface mb-4">Status Update History</h3>
                {activeProjectData.updates.length === 0 ? (
                  <p className="text-xs text-on-surface-variant py-8 text-center bg-surface-container-low rounded-lg border border-dashed border-outline-variant">
                    No status updates logged yet.
                  </p>
                ) : (
                  <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                    {activeProjectData.updates.map(u => (
                      <div key={u.id} className="p-3.5 bg-surface-container-low border border-outline-variant rounded-lg text-xs space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-on-surface text-sm">{u.submitted_by_name}</span>
                          <span className="text-on-surface-variant text-[11px]">{new Date(u.created_at).toLocaleString()}</span>
                        </div>
                        {u.progress_pct != null && (
                          <div className="text-primary font-semibold">Progress updated to {u.progress_pct}%</div>
                        )}
                        <p className="text-on-surface mt-1 text-sm leading-relaxed">{u.notes}</p>
                        {u.blockers && (
                          <div className="mt-2 p-2 bg-error-container/20 border border-error/30 text-error rounded-md text-xs">
                            <strong>Blocker:</strong> {u.blockers}
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
          /* PROJECTS GRID VIEW — Full responsive width */
          <div className="space-y-6 w-full">
            {projects.length === 0 ? (
              <div className="text-center py-16 text-on-surface-variant bg-surface border border-outline-variant rounded-xl border-dashed">
                <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">rocket_launch</span>
                <p className="text-sm font-medium">No projects currently tracked.</p>
                <p className="text-xs mt-1">Create a project to manage deadlines, team assignments, and automated pacing alerts.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
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
                    <div
                      key={p.id}
                      onClick={() => loadProjectDetails(p.id)}
                      className="bg-surface border border-outline-variant hover:border-primary/50 rounded-xl p-5 cursor-pointer transition-all space-y-4 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <h4 className="font-semibold text-on-surface text-base truncate">{p.name}</h4>
                          {renderPacingBadge(pacingStatus)}
                        </div>
                        <p className="text-xs text-on-surface-variant line-clamp-2">{p.description}</p>
                      </div>

                      <div className="space-y-3 pt-2">
                        <div>
                          <div className="flex justify-between text-xs font-semibold mb-1">
                            <span className="text-on-surface">Progress</span>
                            <span className="text-primary">{p.current_progress}%</span>
                          </div>
                          <div className="h-2 bg-surface-container-high rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-800 ${
                                pacingStatus === 'behind' ? 'bg-red-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${p.current_progress}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex justify-between text-xs text-on-surface-variant pt-3 border-t border-outline-variant/50">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">groups</span>
                            {p.member_count || 0} members
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                            {new Date(p.expected_completion).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* MODAL: ADD EMPLOYEE / IMPORT */}
      {showEmpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-outline-variant rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col p-6 space-y-6">
            <div className="flex justify-between items-center border-b border-outline-variant pb-3">
              <h3 className="font-headline-sm text-on-surface">Add Employee / Bulk Import</h3>
              <button onClick={() => setShowEmpModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Single Add Form */}
            <form onSubmit={handleCreateEmployee} className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Add Single Team Member</h4>
              <input
                type="text"
                required
                placeholder="Full Name"
                value={empForm.name}
                onChange={e => setEmpForm({ ...empForm, name: e.target.value })}
                className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
              />
              <input
                type="email"
                required
                placeholder="Work Email"
                value={empForm.email}
                onChange={e => setEmpForm({ ...empForm, email: e.target.value })}
                className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
              />
              <input
                type="text"
                required
                placeholder="Position / Title"
                value={empForm.position}
                onChange={e => setEmpForm({ ...empForm, position: e.target.value })}
                className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
              />
              <input
                type="text"
                placeholder="Department"
                value={empForm.department}
                onChange={e => setEmpForm({ ...empForm, department: e.target.value })}
                className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
              />
              <button type="submit" className="w-full py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container transition-colors">
                Save Employee
              </button>
            </form>

            {/* Bulk CSV/XLSX Upload */}
            <div className="pt-4 border-t border-outline-variant space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Bulk Spreadsheet Import (CSV / XLSX)</h4>
              <form onSubmit={handleImportEmployees} className="flex gap-2 items-center">
                <input
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={e => setImportFile(e.target.files[0])}
                  className="flex-1 bg-surface-container border border-outline-variant rounded-md p-2 text-xs text-on-surface cursor-pointer"
                />
                <button
                  type="submit"
                  disabled={!importFile || importing}
                  className="px-4 py-2 bg-secondary text-on-secondary rounded text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-colors"
                >
                  {importing ? 'Importing...' : 'Upload'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE PROJECT */}
      {showProjModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-outline-variant rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant pb-3">
              <h3 className="font-headline-sm text-on-surface">Create New Project</h3>
              <button onClick={() => setShowProjModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={projForm.name}
                  onChange={e => setProjForm({ ...projForm, name: e.target.value })}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Description</label>
                <textarea
                  value={projForm.description}
                  onChange={e => setProjForm({ ...projForm, description: e.target.value })}
                  rows={3}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={projForm.start_date}
                    onChange={e => setProjForm({ ...projForm, start_date: e.target.value })}
                    className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface mb-1">Expected Completion</label>
                  <input
                    type="date"
                    required
                    value={projForm.expected_completion}
                    onChange={e => setProjForm({ ...projForm, expected_completion: e.target.value })}
                    className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <button type="submit" className="w-full py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container transition-colors">
                Create Project
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN MEMBER */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-outline-variant rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant pb-3">
              <h3 className="font-headline-sm text-on-surface">Assign Team Member</h3>
              <button onClick={() => setShowMemberModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleAddMember} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Employee</label>
                <select
                  required
                  value={memberForm.employee_id}
                  onChange={e => setMemberForm({ ...memberForm, employee_id: e.target.value })}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">Select an employee...</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.position})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Project Role</label>
                <input
                  type="text"
                  placeholder="e.g. Lead Developer, Designer"
                  value={memberForm.role}
                  onChange={e => setMemberForm({ ...memberForm, role: e.target.value })}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Responsibilities</label>
                <textarea
                  placeholder="Deliverables..."
                  value={memberForm.responsibilities}
                  onChange={e => setMemberForm({ ...memberForm, responsibilities: e.target.value })}
                  rows={2}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <button type="submit" className="w-full py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container transition-colors">
                Assign Member
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: POST UPDATE */}
      {showUpdateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-surface border border-outline-variant rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col p-6 space-y-4">
            <div className="flex justify-between items-center border-b border-outline-variant pb-3">
              <h3 className="font-headline-sm text-on-surface">Post Status Update</h3>
              <button onClick={() => setShowUpdateModal(false)} className="text-on-surface-variant hover:text-on-surface">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <form onSubmit={handleSubmitUpdate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Submitted By</label>
                <select
                  required
                  value={updateForm.submitted_by}
                  onChange={e => setUpdateForm({ ...updateForm, submitted_by: e.target.value })}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                >
                  <option value="">Select team member...</option>
                  {(activeProjectData?.members || []).map(m => <option key={m.employee_id} value={m.employee_id}>{m.name} ({m.role})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">New Progress % (Optional)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  placeholder="e.g. 50"
                  value={updateForm.progress_pct}
                  onChange={e => setUpdateForm({ ...updateForm, progress_pct: e.target.value })}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Notes / Summary</label>
                <textarea
                  required
                  placeholder="Work completed..."
                  value={updateForm.notes}
                  onChange={e => setUpdateForm({ ...updateForm, notes: e.target.value })}
                  rows={3}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-on-surface mb-1">Blockers (Optional)</label>
                <textarea
                  placeholder="Impediments..."
                  value={updateForm.blockers}
                  onChange={e => setUpdateForm({ ...updateForm, blockers: e.target.value })}
                  rows={2}
                  className="w-full bg-surface-container border border-outline-variant rounded-md px-3 py-2 text-sm text-on-surface focus:outline-none focus:border-primary resize-none"
                />
              </div>
              <button type="submit" className="w-full py-2 bg-primary text-on-primary rounded font-label-md hover:bg-primary-container transition-colors">
                Submit Update
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
