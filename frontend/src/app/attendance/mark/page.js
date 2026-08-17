'use client';
import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { verifyAttendanceToken, markAttendance } from '../../../lib/api';

export default function MarkAttendancePage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState(null);
  const [employeeInfo, setEmployeeInfo] = useState(null);
  const [tenantInfo, setTenantInfo] = useState(null);

  // Geolocation & Submission states
  const [coords, setCoords] = useState(null);
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | requesting | captured | error
  const [geoErrorMsg, setGeoErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errorResult, setErrorResult] = useState(null);

  // Live time indicator
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Verify Token on page mount
  useEffect(() => {
    if (!token) {
      setLoading(false);
      setTokenError('Missing attendance link token. Please access this page using your unique employee link.');
      return;
    }

    async function loadTokenDetails() {
      try {
        setLoading(true);
        const data = await verifyAttendanceToken(token);
        setEmployeeInfo(data.employee);
        setTenantInfo(data.tenant);
        setTokenError(null);
        // Automatically request GPS position once token is verified
        requestLocation();
      } catch (err) {
        setTokenError(err.message || 'Invalid or expired attendance link token.');
      } finally {
        setLoading(false);
      }
    }

    loadTokenDetails();
  }, [token]);

  // Request HTML5 Geolocation
  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('error');
      setGeoErrorMsg('HTML5 Geolocation is not supported by your browser.');
      return;
    }

    setGeoStatus('requesting');
    setGeoErrorMsg('');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
        });
        setGeoStatus('captured');
      },
      (err) => {
        setGeoStatus('error');
        let msg = 'Failed to acquire device location.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Location permission was denied. Please allow location access in your browser settings to mark attendance.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          msg = 'Location information is unavailable on your device.';
        } else if (err.code === err.TIMEOUT) {
          msg = 'The location request timed out. Please try again.';
        }
        setGeoErrorMsg(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  // Submit Attendance
  const handleMarkAttendance = async () => {
    if (!token) return;
    setSubmitting(true);
    setResult(null);
    setErrorResult(null);

    try {
      const res = await markAttendance(
        token,
        coords ? coords.latitude : null,
        coords ? coords.longitude : null
      );
      setResult(res);
    } catch (err) {
      console.error('Attendance submit error:', err);
      setErrorResult(err.details || { error: 'Verification Failed', message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 bg-slate-900/80 backdrop-blur-md p-8 rounded-2xl border border-slate-800 shadow-2xl">
          <div className="w-12 h-12 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
          <p className="text-slate-400 font-medium animate-pulse">Verifying secure employee link...</p>
        </div>
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900/90 backdrop-blur-xl border border-rose-500/30 rounded-3xl p-8 shadow-2xl text-center">
          <div className="w-16 h-16 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-500/20">
            <span className="material-symbols-outlined text-[36px]">no_accounts</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-100 mb-2">Invalid Access Link</h2>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">{tokenError}</p>
          <div className="p-4 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs text-slate-500">
            Please ask your HR Administrator to resend your personal stateless check-in link.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans">
      {/* Background Decorative Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-emerald-600/10 blur-[100px] rounded-full pointer-events-none"></div>

      <main className="max-w-lg w-full z-10">
        {/* Main Card */}
        <div className="bg-slate-900/80 backdrop-blur-2xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative">
          {/* Header */}
          <div className="flex items-center justify-between pb-6 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
                <span className="material-symbols-outlined text-[24px]">corporate_fare</span>
              </div>
              <div>
                <h1 className="font-semibold text-slate-100 text-lg leading-tight">
                  {tenantInfo?.name || 'On-Premise Check-In'}
                </h1>
                <p className="text-xs text-indigo-400 font-medium">Employee Attendance Portal</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400 font-mono">
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </div>
              <div className="text-[10px] text-slate-500">
                {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>

          {/* Employee Info Badge */}
          <div className="my-6 p-4 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white text-lg shadow-lg">
              {employeeInfo?.name?.charAt(0) || 'E'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-slate-100 text-base truncate">{employeeInfo?.name}</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate">{employeeInfo?.position} {employeeInfo?.department ? `• ${employeeInfo.department}` : ''}</p>
              <p className="text-[11px] text-slate-500 font-mono truncate">{employeeInfo?.email}</p>
            </div>
          </div>

          {/* Geolocation Status Bar */}
          <div className="mb-6 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="material-symbols-outlined text-[16px] text-indigo-400">location_on</span>
                Office Proximity Verification
              </span>
              <button
                onClick={requestLocation}
                disabled={geoStatus === 'requesting'}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1"
              >
                <span className={`material-symbols-outlined text-[14px] ${geoStatus === 'requesting' ? 'animate-spin' : ''}`}>sync</span>
                Refine GPS
              </button>
            </div>

            {geoStatus === 'captured' && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span>GPS Acquired (Accuracy ~{coords?.accuracy}m)</span>
                </div>
                <span className="font-mono text-[10px] text-emerald-400/80">
                  {coords?.latitude.toFixed(4)}, {coords?.longitude.toFixed(4)}
                </span>
              </div>
            )}

            {geoStatus === 'requesting' && (
              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></span>
                <span>Acquiring satellite GPS location...</span>
              </div>
            )}

            {geoStatus === 'error' && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300">
                <p className="font-semibold mb-1 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">warning</span>
                  Location Access Required
                </p>
                <p className="text-amber-200/80 text-[11px]">{geoErrorMsg}</p>
              </div>
            )}
          </div>

          {/* Verification Badges */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Geofence Check</div>
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-indigo-400">share_location</span>
                {tenantInfo?.has_location_configured ? `Max ${tenantInfo.geofence_radius_meters}m Radius` : 'No Geofence Set'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/40 border border-slate-800/60">
              <div className="text-[10px] text-slate-500 font-medium uppercase tracking-wider mb-1">Network Security</div>
              <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-indigo-400">lan</span>
                {tenantInfo?.has_ip_restrictions ? 'Office IP Restricted' : 'Network Validated'}
              </div>
            </div>
          </div>

          {/* Action Button */}
          {!result && (
            <button
              onClick={handleMarkAttendance}
              disabled={submitting}
              className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold text-base shadow-xl shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Verifying Coordinates & IP...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[22px] group-hover:scale-110 transition-transform">how_to_reg</span>
                  <span>Mark Attendance Now</span>
                </>
              )}
            </button>
          )}

          {/* SUCCESS RESULT CARD */}
          {result && (
            <div className="p-6 rounded-2xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-200 text-center animate-fadeIn">
              <div className="w-14 h-14 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-3 border border-emerald-500/30">
                <span className="material-symbols-outlined text-[32px]">check_circle</span>
              </div>
              <h3 className="text-xl font-bold text-emerald-100 mb-1">Attendance Recorded!</h3>
              <p className="text-xs text-emerald-300/80 mb-4">{result.message}</p>
              
              <div className="p-3 bg-emerald-900/30 rounded-xl border border-emerald-800/40 text-left text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-emerald-300">
                  <span className="text-emerald-400/70">Timestamp:</span>
                  <span>{new Date(result.record?.marked_at).toLocaleTimeString()}</span>
                </div>
                {result.verification?.distance_meters != null && (
                  <div className="flex justify-between text-emerald-300">
                    <span className="text-emerald-400/70">Distance to Office:</span>
                    <span>{result.verification.distance_meters} meters</span>
                  </div>
                )}
                <div className="flex justify-between text-emerald-300">
                  <span className="text-emerald-400/70">Validated Network IP:</span>
                  <span>{result.verification?.ip_address}</span>
                </div>
              </div>
            </div>
          )}

          {/* ERROR RESULT CARD */}
          {errorResult && (
            <div className="p-6 rounded-2xl bg-rose-950/60 border border-rose-500/30 text-rose-200 text-center animate-fadeIn">
              <div className="w-14 h-14 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto mb-3 border border-rose-500/30">
                <span className="material-symbols-outlined text-[32px]">gpp_bad</span>
              </div>
              <h3 className="text-xl font-bold text-rose-100 mb-1">{errorResult.error || 'Verification Failed'}</h3>
              <p className="text-xs text-rose-300/90 mb-4 leading-relaxed">{errorResult.message}</p>

              {errorResult.distance_meters != null && (
                <div className="p-3 bg-rose-900/30 rounded-xl border border-rose-800/40 text-xs text-rose-300 mb-4 font-mono">
                  Distance detected: <strong>{errorResult.distance_meters} meters</strong> (Maximum allowed: {errorResult.allowed_radius_meters}m)
                </div>
              )}

              <button
                onClick={handleMarkAttendance}
                className="px-4 py-2 rounded-xl bg-rose-600/80 hover:bg-rose-600 text-white text-xs font-semibold transition-colors flex items-center gap-1.5 mx-auto"
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                Retry Verification
              </button>
            </div>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-slate-600 mt-6">
          Enterprise AI Workflow Platform • Cryptographically Secured Link Validation
        </p>
      </main>
    </div>
  );
}
