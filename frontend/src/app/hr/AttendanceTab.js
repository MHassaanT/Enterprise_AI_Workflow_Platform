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

  // Calendar view states
  const [selectedEmpId, setSelectedEmpId] = useState('');
  const [currentDate, setCurrentDate] = useState(new Date());

  // Auto-select first employee when list loads
  useEffect(() => {
    if (employees.length > 0 && !selectedEmpId) {
      setSelectedEmpId(employees[0].id);
    }
  }, [employees]);

  // Stats calculation
  const totalEmployeesCount = employees.length;
  const todayStr = new Date().toISOString().split('T')[0];
  const presentTodaySet = new Set(
    attendanceLogs
      .filter((l) => l.status === 'present' && new Date(l.marked_at).toISOString().split('T')[0] === todayStr)
      .map((l) => l.employee_id)
  );
  const totalPresentTodayCount = presentTodaySet.size;

  // Calendar calculations
  const selectedYear = currentDate.getFullYear();
  const selectedMonth = currentDate.getMonth();

  const handlePrevMonth = () => setCurrentDate(new Date(selectedYear, selectedMonth - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(selectedYear, selectedMonth + 1, 1));
  const handleTodayMonth = () => setCurrentDate(new Date());

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const selectedEmp = employees.find((e) => e.id === selectedEmpId) || employees[0];

  // Filter present logs for selected employee in selected month & year
  const empLogsInMonth = attendanceLogs.filter((log) => {
    if (log.employee_id !== selectedEmpId) return false;
    const d = new Date(log.marked_at);
    return d.getFullYear() === selectedYear && d.getMonth() === selectedMonth && log.status === 'present';
  });

  const presentDatesMap = {};
  empLogsInMonth.forEach((log) => {
    const d = new Date(log.marked_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    presentDatesMap[key] = true;
  });

  const totalDaysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay();

  const todayObj = new Date();
  const todayYYYY = todayObj.getFullYear();
  const todayMM = todayObj.getMonth();
  const todayDD = todayObj.getDate();

  let monthPresentsCount = 0;
  let monthAbsentsCount = 0;
  let monthSundaysCount = 0;

  for (let day = 1; day <= totalDaysInMonth; day++) {
    const d = new Date(selectedYear, selectedMonth, day);
    const dayOfWeek = d.getDay();
    const dateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    const isSunday = dayOfWeek === 0;
    const isPastOrToday =
      selectedYear < todayYYYY ||
      (selectedYear === todayYYYY && selectedMonth < todayMM) ||
      (selectedYear === todayYYYY && selectedMonth === todayMM && day <= todayDD);

    if (isSunday) {
      monthSundaysCount++;
    } else if (presentDatesMap[dateKey]) {
      monthPresentsCount++;
    } else if (isPastOrToday) {
      monthAbsentsCount++;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-surface-container-lowest text-on-surface">
      {/* Header & Refresh */}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <div className="p-5 rounded-2xl bg-surface border border-outline-variant flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Total Employees</div>
            <div className="text-3xl font-bold text-on-surface mt-1">{totalEmployeesCount}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-primary-container text-primary flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">groups</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-surface border border-outline-variant flex items-center justify-between shadow-xs">
          <div>
            <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Total Present Today</div>
            <div className="text-3xl font-bold text-emerald-600 mt-1">{totalPresentTodayCount}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-[26px]">event_available</span>
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

      {/* EMPLOYEE ATTENDANCE CALENDAR VIEW */}
      <div className="p-6 rounded-2xl bg-surface border border-outline-variant shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="font-bold text-lg text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[24px]">calendar_month</span>
              Employee Attendance Calendar
            </h3>
            <p className="text-xs text-on-surface-variant">
              Monthly breakdown marking Present (Green), Absent (Red), and Sundays (Orange)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Employee Selector */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-on-surface-variant">Select Employee:</label>
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-surface-container-low border border-outline-variant text-xs font-bold text-on-surface focus:outline-none focus:border-primary"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.position})
                  </option>
                ))}
              </select>
            </div>

            {/* Month Navigator */}
            <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                title="Previous Month"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
              </button>
              <span className="px-3 text-xs font-bold text-on-surface min-w-[120px] text-center">
                {monthNames[selectedMonth]} {selectedYear}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors"
                title="Next Month"
              >
                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
              </button>
              <button
                onClick={handleTodayMonth}
                className="px-2.5 py-1 text-[11px] font-semibold bg-primary-container text-primary rounded-lg hover:bg-primary/20 transition-colors"
              >
                Today
              </button>
            </div>
          </div>
        </div>

        {/* Selected Employee Info Header & Monthly Stat Pills */}
        <div className="mb-6 p-4 rounded-xl bg-surface-container-low border border-outline-variant/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary-container text-primary font-bold flex items-center justify-center text-sm">
              {selectedEmp?.name?.charAt(0) || 'E'}
            </div>
            <div>
              <div className="font-bold text-sm text-on-surface">{selectedEmp?.name || 'Selected Employee'}</div>
              <div className="text-xs text-on-surface-variant">
                {selectedEmp?.position} • {selectedEmp?.department || 'General'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-bold">{monthPresentsCount} Present</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="text-xs font-bold">{monthAbsentsCount} Absent</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span className="text-xs font-bold">{monthSundaysCount} Sundays (Off)</span>
            </div>
          </div>
        </div>

        {/* Calendar Grid Header */}
        <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold text-on-surface-variant uppercase tracking-wider">
          <div className="py-2 text-amber-500">Sun</div>
          <div className="py-2">Mon</div>
          <div className="py-2">Tue</div>
          <div className="py-2">Wed</div>
          <div className="py-2">Thu</div>
          <div className="py-2">Fri</div>
          <div className="py-2">Sat</div>
        </div>

        {/* Calendar Day Grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Empty offset tiles */}
          {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
            <div key={`empty-${idx}`} className="h-20 sm:h-24 rounded-xl bg-surface-container-lowest/30 border border-outline-variant/20"></div>
          ))}

          {/* Days of Month */}
          {Array.from({ length: totalDaysInMonth }).map((_, idx) => {
            const day = idx + 1;
            const d = new Date(selectedYear, selectedMonth, day);
            const dayOfWeek = d.getDay(); // 0 = Sun
            const isSunday = dayOfWeek === 0;
            const dateKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isPresent = !!presentDatesMap[dateKey];
            const isPastOrToday =
              selectedYear < todayYYYY ||
              (selectedYear === todayYYYY && selectedMonth < todayMM) ||
              (selectedYear === todayYYYY && selectedMonth === todayMM && day <= todayDD);
            const isToday = selectedYear === todayYYYY && selectedMonth === todayMM && day === todayDD;

            let cardStyle = 'bg-surface-container-low border-outline-variant/40 text-on-surface-variant';
            let statusBadge = null;

            if (isSunday) {
              cardStyle = 'bg-amber-500/10 border-amber-500/30 text-amber-600';
              statusBadge = (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-600">
                  Sunday
                </span>
              );
            } else if (isPresent) {
              cardStyle = 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600';
              statusBadge = (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-600 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">check_circle</span>
                  Present
                </span>
              );
            } else if (isPastOrToday) {
              cardStyle = 'bg-rose-500/15 border-rose-500/40 text-rose-600';
              statusBadge = (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-600 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[12px]">cancel</span>
                  Absent
                </span>
              );
            } else {
              cardStyle = 'bg-surface-container-lowest border-outline-variant/30 text-on-surface-variant/50';
              statusBadge = <span className="text-[10px] text-on-surface-variant/40">Upcoming</span>;
            }

            return (
              <div
                key={`day-${day}`}
                className={`h-20 sm:h-24 p-2 rounded-xl border flex flex-col justify-between transition-all ${cardStyle} ${
                  isToday ? 'ring-2 ring-primary shadow-sm' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${isToday ? 'text-primary' : ''}`}>
                    {day}
                  </span>
                  {isToday && (
                    <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 bg-primary text-on-primary rounded">
                      Today
                    </span>
                  )}
                </div>
                <div className="mt-auto">{statusBadge}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
