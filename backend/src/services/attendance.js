const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'attendance_secret_key_default';

/**
 * Generate a persistent cryptographically signed JWT link for employee attendance.
 */
function generateAttendanceToken(employeeId, tenantId) {
  const payload = {
    type: 'attendance_link',
    employeeId,
    tenantId,
    createdAt: new Date().toISOString(),
  };
  // Persistent stateless link without expiration
  return jwt.sign(payload, JWT_SECRET);
}

/**
 * Verify and decode an attendance link JWT.
 */
function verifyAttendanceToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.type !== 'attendance_link' || !decoded.employeeId || !decoded.tenantId) {
      throw new Error('Invalid attendance token payload.');
    }
    return decoded;
  } catch (err) {
    throw new Error('Invalid or corrupted attendance token: ' + err.message);
  }
}

/**
 * Calculate distance between two GPS coordinates in meters using the Haversine formula.
 */
function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) {
    return null;
  }

  const R = 6371000; // Earth radius in meters
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Extract clean IPv4/IPv6 client address from request.
 */
function extractClientIp(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || req.ip || '';
  if (typeof ip === 'string' && ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Strip IPv6-mapped IPv4 prefix
  if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return ip || '127.0.0.1';
}

/**
 * Cross-reference origin client IP against tenant's configured office static IPs.
 */
function validateNetworkIp(clientIp, allowedIps) {
  // If allowedIps is null, empty array, or contains '*', all IPs are allowed
  if (!allowedIps || !Array.isArray(allowedIps) || allowedIps.length === 0 || allowedIps.includes('*')) {
    return { isAllowed: true, reason: 'No IP restriction configured' };
  }

  const cleanClientIp = clientIp.trim();

  // Normalize localhost representations
  const isClientLocal = cleanClientIp === '127.0.0.1' || cleanClientIp === '::1' || cleanClientIp === 'localhost';

  const isMatch = allowedIps.some((allowed) => {
    const cleanAllowed = String(allowed).trim();
    if (cleanAllowed === '*') return true;
    if (cleanAllowed === cleanClientIp) return true;
    if (isClientLocal && (cleanAllowed === '127.0.0.1' || cleanAllowed === '::1' || cleanAllowed === 'localhost')) {
      return true;
    }
    return false;
  });

  if (isMatch) {
    return { isAllowed: true };
  }

  return {
    isAllowed: false,
    reason: `Request origin IP (${cleanClientIp}) is not listed in tenant authorized office network IPs.`,
  };
}

module.exports = {
  generateAttendanceToken,
  verifyAttendanceToken,
  calculateDistanceMeters,
  extractClientIp,
  validateNetworkIp,
};
