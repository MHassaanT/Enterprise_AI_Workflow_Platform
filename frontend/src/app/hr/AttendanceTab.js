'use client';
import { useState, useEffect } from 'react';
import {
  fetchAttendanceRecords,
  fetchOfficeConfig,
  updateOfficeConfig,
  fetchEmployees,
  generateEmployeeAttendanceLink,
} from '../../lib/api';

export default function AttendanceTab() {
  const [loading, setLoading] = useState(true);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [officeConfig, setOfficeConfig] = useState({
    office_latitude: '',
    office_longitude: '',
    geofence_radius_meters: 200,
    office_allowed_ips: [],
  });

  const [ipInput, setIpInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccessMsg, setConfigSuccessMsg] = useState('');
  const [configErrMsg, setConfigErrMsg] = useState('');

  // Link copy feedback state
  const [copiedEmpId, setCopiedEmpId] = useState(null);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterEmployeeId, setFilterEmployeeId] = useState('');

  useEffect(() => {
    loadData();
  }, [filterStatus, filterEmployeeId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterStatus) params.status = filterStatus;
      if (filterEmployeeId) params.employeeId = filterEmployeeId;

      const [logs, config, empList] = await Promise.all([
        fetchAttendanceRecords(params),
        fetchOfficeConfig(),
        fetchEmployees(),
      ]);

      setAttendanceLogs(logs);
      setOfficeConfig({
        office_latitude: config.office_latitude != null ? config.office_latitude : '',
        office_longitude: config.office_longitude != null ? config.office_longitude : '',
        geofence_radius_meters: config.geofence_radius_meters || 200,
        office_allowed_ips: config.office_allowed_ips || [],
      });
      setIpInput(Array.isArray(config.office_allowed_ips) ? config.office_allowed_ips.join(', ') : '');
      setEmployees(empList);
    } catch (err) {
      console.error('Failed to load attendance tab data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Obtain current browser coordinates for office setup
  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOfficeConfig((prev) => ({
          ...prev,
          office_latitude: pos.coords.latitude,
          office_longitude: pos.coords.longitude,
        }));
      },
      (err) => {
        alert('Failed to get current location: ' + err.message);
      },
      { enableHighAccuracy: true }
    );
  };

  // Save Office Location & IP Config
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccessMsg('');
    setConfigErrMsg('');

    try {
      const ips = ipInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await updateOfficeConfig({
        office_latitude: officeConfig.office_latitude,
        office_longitude: officeConfig.office_longitude,
        geofence_radius_meters: officeConfig.geofence_radius_meters,
        office_allowed_ips: ips,
      });

      setConfigSuccessMsg('Office location & security rules updated successfully!');
      setTimeout(() => setConfigSuccessMsg(''), 4000);
      loadData();
    } catch (err) {
      setConfigErrMsg(err.message || 'Failed to update office configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  // Copy or generate employee unique attendance link
  const handleCopyLink = async (employee) => {
    let token = employee.attendance_token;
    if (!token) {
      try {
        const res = await generateEmployeeAttendanceLink(employee.id);
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
      setCopiedEmpId(employee.id);
      setTimeout(() => setCopiedEmpId(null), 3000);
    } catch (err) {
      // Fallback
      prompt('Employee Attendance Link:', fullUrl);
    }
  };

  // Stats calculation
  const totalLogs = attendanceLogs.length;
  const presentLogs = attendanceLogs.filter((l) => l.status === 'present').length;
  const rejectedLogs = attendanceLogs.filter((l) => l.status === 'rejected').length;

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-surface-container-lowest text-on-surface">
      {/* Header & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">how_to_reg</span>
            Employee Attendance & Proximity Verification
          </h2>
          <p className="text-sm text-on-surface-variant">
            Stateless unique employee links, HTML5 Geolocation geofencing, and network IP validation.
          </p>
        </div>

        <button
          onClick={loadData}
          className="self-start md:self-auto px-4 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container border border-outline-variant text-sm font-semibold flex items-center gap-2 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Refresh Feed
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-2xl bg-surface border border-outline-variant flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Total Check-ins</div>
            <div className="text-3xl font-bold text-on-surface mt-1">{totalLogs}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary-container text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">fact_check</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-outline-variant flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Present</div>
            <div className="text-3xl font-bold text-emerald-600 mt-1">{presentLogs}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">verified</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-outline-variant flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Rejected / Flagged</div>
            <div className="text-3xl font-bold text-rose-600 mt-1">{rejectedLogs}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">gpp_bad</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Office Config & Employee Link Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* OFFICE LOCATION & NETWORK IP CONFIG */}
        <div className="p-6 rounded-2xl bg-surface border border-outline-variant shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-primary-container text-primary flex items-center justify-center">
                <span className="material-symbols-outlined text-[22px]">map</span>
              </div>
              <div>
                <h3 className="font-bold text-base text-on-surface">Office Geofence & Network Rules</h3>
                <p className="text-xs text-on-surface-variant">Set office GPS coordinates and authorized static IPs</p>
              </div>
            </div>

            {configSuccessMsg && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-600 font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                {configSuccessMsg}
              </div>
            )}

            {configErrMsg && (
              <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-600 font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">error</span>
                {configErrMsg}
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">Office Latitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 31.5204"
                    value={officeConfig.office_latitude}
                    onChange={(e) => setOfficeConfig({ ...officeConfig, office_latitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-on-surface-variant mb-1">Office Longitude</label>
                  <input
                    type="number"
                    step="any"
                    placeholder="e.g. 74.3587"
                    value={officeConfig.office_longitude}
                    onChange={(e) => setOfficeConfig({ ...officeConfig, office_longitude: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">my_location</span>
                  Use My Current GPS Location
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">Geofence Allowed Radius (meters)</label>
                <input
                  type="number"
                  min="10"
                  max="10000"
                  value={officeConfig.geofence_radius_meters}
                  onChange={(e) => setOfficeConfig({ ...officeConfig, geofence_radius_meters: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant text-sm text-on-surface focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  Authorized Office Static IPs (comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 192.168.1.1, 110.38.2.14 or * for any"
                  value={ipInput}
                  onChange={(e) => setIpInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant text-sm font-mono text-on-surface focus:outline-none focus:border-primary"
                />
                <p className="text-[11px] text-on-surface-variant mt-1">Leave empty or use * to skip IP origin enforcement in dev environment.</p>
              </div>

              <button
                type="submit"
                disabled={savingConfig}
                className="w-full py-2.5 px-4 rounded-xl bg-primary text-on-primary font-bold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {savingConfig ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-primary/30 border-t-on-primary rounded-full animate-spin"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    <span>Save Location & Security Rules</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* EMPLOYEE ATTENDANCE LINKS MANAGER */}
        <div className="p-6 rounded-2xl bg-surface border border-outline-variant shadow-xs flex flex-col">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">link</span>
            </div>
            <div>
              <h3 className="font-bold text-base text-on-surface">Stateless Unique Employee Links</h3>
              <p className="text-xs text-on-surface-variant">Copy persistent attendance JWT link for each employee</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[340px] pr-1 space-y-2">
            {employees.length === 0 ? (
              <div className="p-8 text-center text-xs text-on-surface-variant border border-dashed border-outline-variant rounded-xl">
                No employees registered yet. Go to Projects & Team tab to add employees.
              </div>
            ) : (
              employees.map((emp) => (
                <div key={emp.id} className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/60 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-bold text-xs text-on-surface truncate">{emp.name}</div>
                    <div className="text-[11px] text-on-surface-variant truncate">{emp.position} • {emp.email}</div>
                  </div>

                  <button
                    onClick={() => handleCopyLink(emp)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all flex-shrink-0 ${
                      copiedEmpId === emp.id
                        ? 'bg-emerald-500 text-white'
                        : 'bg-primary-container text-primary hover:bg-primary/20'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {copiedEmpId === emp.id ? 'check' : 'content_copy'}
                    </span>
                    {copiedEmpId === emp.id ? 'Copied Link!' : 'Copy Link'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ATTENDANCE AUDIT LOG TABLE */}
      <div className="p-6 rounded-2xl bg-surface border border-outline-variant shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-bold text-lg text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">history</span>
              Attendance Ledger Audit Log
            </h3>
            <p className="text-xs text-on-surface-variant">Immutable logs with timestamp, distance, and network IP details</p>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant text-xs text-on-surface focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="present">Present Only</option>
              <option value="rejected">Rejected Only</option>
            </select>

            <select
              value={filterEmployeeId}
              onChange={(e) => setFilterEmployeeId(e.target.value)}
              className="px-3 py-1.5 rounded-xl bg-surface-container-low border border-outline-variant text-xs text-on-surface focus:outline-none max-w-[160px]"
            >
              <option value="">All Employees</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-outline-variant text-on-surface-variant font-semibold">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4">Timestamp</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Distance from Office</th>
                <th className="py-3 px-4">Origin IP</th>
                <th className="py-3 px-4">Details / Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {attendanceLogs.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-on-surface-variant">
                    No attendance records found matching filters.
                  </td>
                </tr>
              ) : (
                attendanceLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-surface-container-low/50 transition-colors">
                    <td className="py-3 px-4 font-bold text-on-surface">
                      <div>{log.employee_name || 'Employee'}</div>
                      <div className="text-[10px] text-on-surface-variant font-normal">{log.employee_email}</div>
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant whitespace-nowrap font-mono">
                      {new Date(log.marked_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4">
                      {log.status === 'present' ? (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Present
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20 inline-flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Rejected
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant font-mono">
                      {log.distance_meters != null ? `${log.distance_meters} meters` : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-on-surface-variant font-mono">{log.ip_address}</td>
                    <td className="py-3 px-4 text-on-surface-variant max-w-xs truncate">
                      {log.rejection_reason || 'Geofence & IP verified'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
