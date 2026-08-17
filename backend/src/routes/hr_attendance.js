const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const {
  generateAttendanceToken,
  verifyAttendanceToken,
  calculateDistanceMeters,
  extractClientIp,
  validateNetworkIp,
} = require('../services/attendance');

// ═══════════════════════════════════════════════════════
// PUBLIC ATTENDANCE ENDPOINTS (Stateless / Link-driven)
// ═══════════════════════════════════════════════════════

/**
 * GET /api/hr/attendance/verify-token?token=...
 * Validates unique employee token and returns metadata for check-in UI
 */
router.get('/attendance/verify-token', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: 'Attendance token parameter is required.' });
  }

  try {
    const decoded = verifyAttendanceToken(token);
    const { employeeId, tenantId } = decoded;

    // Fetch employee details
    const empRes = await query(
      `SELECT id, name, email, position, department, status 
       FROM hr_employees 
       WHERE id = $1 AND tenant_id = $2`,
      [employeeId, tenantId],
      tenantId
    );

    if (!empRes.rows[0]) {
      return res.status(404).json({ error: 'Employee record associated with this token was not found.' });
    }

    const employee = empRes.rows[0];
    if (employee.status !== 'active') {
      return res.status(403).json({ error: 'Employee status is inactive or terminated.' });
    }

    // Fetch tenant office config
    const tenantRes = await query(
      `SELECT name, office_latitude, office_longitude, geofence_radius_meters, office_allowed_ips 
       FROM tenants 
       WHERE id = $1`,
      [tenantId],
      tenantId
    );

    const tenant = tenantRes.rows[0] || {};
    const allowedIps = tenant.office_allowed_ips || [];

    res.json({
      valid: true,
      employee: {
        id: employee.id,
        name: employee.name,
        email: employee.email,
        position: employee.position,
        department: employee.department,
      },
      tenant: {
        name: tenant.name || 'Company Office',
        has_location_configured: tenant.office_latitude != null && tenant.office_longitude != null,
        office_latitude: tenant.office_latitude,
        office_longitude: tenant.office_longitude,
        geofence_radius_meters: tenant.geofence_radius_meters || 200,
        has_ip_restrictions: Array.isArray(allowedIps) && allowedIps.length > 0 && !allowedIps.includes('*'),
      },
    });
  } catch (err) {
    return res.status(401).json({ error: err.message || 'Invalid attendance token.' });
  }
});

/**
 * POST /api/hr/attendance/mark
 * Mark attendance with location coordinates and token payload
 */
router.post('/attendance/mark', async (req, res) => {
  const { token, latitude, longitude } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Attendance token is required.' });
  }

  let decoded;
  try {
    decoded = verifyAttendanceToken(token);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token: ' + err.message });
  }

  const { employeeId, tenantId } = decoded;
  const clientIp = extractClientIp(req);

  // Fetch employee
  const empRes = await query(
    `SELECT id, name, email, position, department, status 
     FROM hr_employees 
     WHERE id = $1 AND tenant_id = $2`,
    [employeeId, tenantId],
    tenantId
  );

  if (!empRes.rows[0]) {
    return res.status(404).json({ error: 'Employee not found.' });
  }
  const employee = empRes.rows[0];
  if (employee.status !== 'active') {
    return res.status(403).json({ error: 'Employee account is not active.' });
  }

  // Fetch tenant office config
  const tenantRes = await query(
    `SELECT name, office_latitude, office_longitude, geofence_radius_meters, office_allowed_ips 
     FROM tenants 
     WHERE id = $1`,
    [tenantId],
    tenantId
  );

  const tenant = tenantRes.rows[0] || {};
  const officeLat = tenant.office_latitude;
  const officeLon = tenant.office_longitude;
  const maxRadius = tenant.geofence_radius_meters || 200;
  const allowedIps = tenant.office_allowed_ips || [];

  // 1. Validate Network IP
  const ipCheck = validateNetworkIp(clientIp, allowedIps);
  if (!ipCheck.isAllowed) {
    // Log failed attempt into database
    await query(
      `INSERT INTO hr_attendance_records 
       (tenant_id, employee_id, latitude, longitude, ip_address, status, rejection_reason, verification_details)
       VALUES ($1, $2, $3, $4, $5, 'rejected', $6, $7)`,
      [
        tenantId,
        employeeId,
        latitude != null ? parseFloat(latitude) : null,
        longitude != null ? parseFloat(longitude) : null,
        clientIp,
        ipCheck.reason,
        JSON.stringify({ ipCheck, clientIp, allowedIps }),
      ],
      tenantId
    );

    return res.status(403).json({
      error: 'Network IP Verification Failed',
      message: ipCheck.reason,
      status: 'rejected',
      client_ip: clientIp,
    });
  }

  // 2. Validate Proximity / Geofencing if office coordinates are configured
  let distanceMeters = null;
  let isWithinGeofence = true;
  let geofenceError = null;

  if (officeLat != null && officeLon != null) {
    if (latitude == null || longitude == null) {
      geofenceError = 'Device GPS coordinates are required by tenant office settings.';
      isWithinGeofence = false;
    } else {
      distanceMeters = calculateDistanceMeters(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(officeLat),
        parseFloat(officeLon)
      );

      if (distanceMeters > maxRadius) {
        isWithinGeofence = false;
        geofenceError = `Location verification failed: You are ${distanceMeters} meters away from the office (maximum allowed radius: ${maxRadius} meters).`;
      }
    }
  }

  if (!isWithinGeofence) {
    // Log rejected attendance attempt
    await query(
      `INSERT INTO hr_attendance_records 
       (tenant_id, employee_id, latitude, longitude, distance_meters, ip_address, status, rejection_reason, verification_details)
       VALUES ($1, $2, $3, $4, $5, $6, 'rejected', $7, $8)`,
      [
        tenantId,
        employeeId,
        latitude != null ? parseFloat(latitude) : null,
        longitude != null ? parseFloat(longitude) : null,
        distanceMeters,
        clientIp,
        geofenceError,
        JSON.stringify({ distanceMeters, maxRadius, officeLat, officeLon }),
      ],
      tenantId
    );

    return res.status(400).json({
      error: 'Location Geofence Verification Failed',
      message: geofenceError,
      status: 'rejected',
      distance_meters: distanceMeters,
      allowed_radius_meters: maxRadius,
    });
  }

  // 3. Save successful attendance check-in
  const recordRes = await query(
    `INSERT INTO hr_attendance_records 
     (tenant_id, employee_id, latitude, longitude, distance_meters, ip_address, status, verification_details)
     VALUES ($1, $2, $3, $4, $5, $6, 'present', $7)
     RETURNING *`,
    [
      tenantId,
      employeeId,
      latitude != null ? parseFloat(latitude) : null,
      longitude != null ? parseFloat(longitude) : null,
      distanceMeters,
      clientIp,
      JSON.stringify({ clientIp, distanceMeters, maxRadius, officeLat, officeLon }),
    ],
    tenantId
  );

  res.status(201).json({
    success: true,
    message: `Attendance marked successfully for ${employee.name}.`,
    record: recordRes.rows[0],
    employee: {
      id: employee.id,
      name: employee.name,
      email: employee.email,
    },
    verification: {
      ip_address: clientIp,
      distance_meters: distanceMeters,
      within_geofence: isWithinGeofence,
    },
  });
});

// ═══════════════════════════════════════════════════════
// AUTHENTICATED HR ADMIN ENDPOINTS
// ═══════════════════════════════════════════════════════

/**
 * GET /api/hr/attendance
 * List attendance logs for HR dashboard
 */
router.get('/attendance', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;
  const { employeeId, status, startDate, endDate } = req.query;

  const conditions = ['r.tenant_id = $1'];
  const params = [tenantId];
  let idx = 2;

  if (employeeId) {
    conditions.push(`r.employee_id = $${idx++}`);
    params.push(employeeId);
  }

  if (status) {
    conditions.push(`r.status = $${idx++}`);
    params.push(status);
  }

  if (startDate) {
    conditions.push(`r.marked_at >= $${idx++}`);
    params.push(startDate);
  }

  if (endDate) {
    conditions.push(`r.marked_at <= $${idx++}`);
    params.push(endDate);
  }

  const sql = `
    SELECT r.*, e.name as employee_name, e.email as employee_email, e.position as employee_position, e.department as employee_department
    FROM hr_attendance_records r
    JOIN hr_employees e ON r.employee_id = e.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY r.marked_at DESC
    LIMIT 200
  `;

  const result = await query(sql, params, tenantId);
  res.json({ attendance: result.rows });
});

/**
 * GET /api/hr/office-config
 * Fetch tenant office geofence & network IP settings
 */
router.get('/office-config', authenticate, authorize('admin', 'employee', 'reviewer'), async (req, res) => {
  const { tenantId } = req.user;

  const result = await query(
    `SELECT office_latitude, office_longitude, geofence_radius_meters, office_allowed_ips 
     FROM tenants 
     WHERE id = $1`,
    [tenantId],
    tenantId
  );

  const config = result.rows[0] || {};
  res.json({
    office_latitude: config.office_latitude || null,
    office_longitude: config.office_longitude || null,
    geofence_radius_meters: config.geofence_radius_meters || 200,
    office_allowed_ips: config.office_allowed_ips || [],
  });
});

/**
 * PUT /api/hr/office-config
 * Update tenant office geofence & network IP settings
 */
router.put('/office-config', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { office_latitude, office_longitude, geofence_radius_meters, office_allowed_ips } = req.body;

  let parsedIps = [];
  if (Array.isArray(office_allowed_ips)) {
    parsedIps = office_allowed_ips.map((ip) => String(ip).trim()).filter(Boolean);
  } else if (typeof office_allowed_ips === 'string') {
    parsedIps = office_allowed_ips
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
  }

  const latVal = office_latitude !== '' && office_latitude != null ? parseFloat(office_latitude) : null;
  const lonVal = office_longitude !== '' && office_longitude != null ? parseFloat(office_longitude) : null;
  const radiusVal = geofence_radius_meters != null ? parseInt(geofence_radius_meters, 10) : 200;

  const result = await query(
    `UPDATE tenants 
     SET office_latitude = $1, 
         office_longitude = $2, 
         geofence_radius_meters = $3, 
         office_allowed_ips = $4 
     WHERE id = $5 
     RETURNING office_latitude, office_longitude, geofence_radius_meters, office_allowed_ips`,
    [latVal, lonVal, radiusVal, JSON.stringify(parsedIps), tenantId],
    tenantId
  );

  res.json({
    message: 'Office location & network configuration updated successfully.',
    config: result.rows[0],
  });
});

/**
 * POST /api/hr/employees/:id/attendance-link
 * Generate or regenerate unique attendance JWT link for employee
 */
router.post('/employees/:id/attendance-link', authenticate, authorize('admin'), async (req, res) => {
  const { tenantId } = req.user;
  const { id } = req.params;

  const empRes = await query(
    `SELECT id, name, email FROM hr_employees WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId],
    tenantId
  );

  if (!empRes.rows[0]) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  const token = generateAttendanceToken(id, tenantId);

  await query(
    `UPDATE hr_employees SET attendance_token = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3`,
    [token, id, tenantId],
    tenantId
  );

  res.json({
    message: 'Attendance link generated successfully.',
    employee_id: id,
    attendance_token: token,
  });
});

module.exports = router;
