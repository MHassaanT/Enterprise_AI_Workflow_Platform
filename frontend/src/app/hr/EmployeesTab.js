'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  fetchEmployees, createEmployee, deleteEmployee, importEmployees, generateEmployeeAttendanceLink
} from '@/lib/api';

export default function EmployeesTab() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedEmpId, setCopiedEmpId] = useState(null);

  // Employee Form Modal
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [empForm, setEmpForm] = useState({ name: '', email: '', position: '', department: '', hire_date: '' });
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const list = await fetchEmployees();
      setEmployees(list);
    } catch (e) {
      console.error('Error fetching employees:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

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

  const handleCopyAttendanceLink = async (emp) => {
    let token = emp.attendance_token;
    if (!token) {
      try {
        const res = await generateEmployeeAttendanceLink(emp.id);
        token = res.attendance_token;
      } catch (err) {
        alert('Failed to generate attendance link: ' + err.message);
        return;
      }
    }
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = `${baseUrl}/attendance/mark?token=${token}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopiedEmpId(emp.id);
      setTimeout(() => setCopiedEmpId(null), 3000);
    } catch (err) {
      prompt('Employee Attendance Link:', fullUrl);
    }
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

  return (
    <div className="flex flex-col flex-1 overflow-hidden w-full bg-background p-6 lg:p-8">
      {/* Header Bar */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="font-headline-sm text-headline-sm text-on-surface">Employee Directory & Roster</h2>
          <p className="text-xs text-on-surface-variant mt-0.5">Manage company personnel, job titles, departments, and attendance tokens.</p>
        </div>
        <button
          onClick={() => setShowEmpModal(true)}
          className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-semibold hover:bg-primary-container transition-colors flex items-center gap-1.5 shadow-sm"
        >
          <span className="material-symbols-outlined text-[18px]">person_add</span>
          Add Employee / Bulk Import
        </button>
      </div>

      {/* Directory Table */}
      <div className="flex-1 overflow-y-auto bg-surface border border-outline-variant rounded-xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="text-center py-16 text-on-surface-variant">Loading employee roster...</div>
        ) : employees.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-[48px] opacity-30 mb-2">badge</span>
            <p className="text-sm font-medium">No employees registered yet.</p>
            <p className="text-xs mt-1">Add employees manually or upload a CSV/XLSX spreadsheet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-outline-variant text-on-surface-variant font-label-sm uppercase tracking-wider bg-surface-container-low">
                  <th className="p-4">Employee</th>
                  <th className="p-4">Position & Department</th>
                  <th className="p-4">Assigned Projects</th>
                  <th className="p-4">Status</th>
                  <th className="p-4 w-36">Actions</th>
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
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyAttendanceLink(emp)}
                          title="Copy Unique Attendance Link"
                          className="px-2.5 py-1 bg-primary-container text-primary rounded text-xs font-semibold hover:bg-primary/20 flex items-center gap-1 transition-colors"
                        >
                          <span className="material-symbols-outlined text-[16px]">
                            {copiedEmpId === emp.id ? 'check' : 'link'}
                          </span>
                          {copiedEmpId === emp.id ? 'Copied' : 'Link'}
                        </button>
                        <button onClick={() => handleDeleteEmployee(emp.id)} className="text-on-surface-variant hover:text-error transition-colors p-1">
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: ADD EMPLOYEE / BULK IMPORT */}
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
    </div>
  );
}
