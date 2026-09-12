const jwt = require('jsonwebtoken');

const authenticate = (req, res, next) => {
  // Check internal service token first (for inter-agent and backend-to-agent calls)
  const internalToken = req.headers['x-internal-token'];
  const expectedInternalToken = process.env.INTERNAL_SERVICE_TOKEN || 'internal_secret_change_in_production';
  if (internalToken && internalToken === expectedInternalToken) {
    const tenantId = req.headers['x-tenant-id'] || '00000000-0000-0000-0000-000000000000';
    req.user = {
      id: '00000000-0000-0000-0000-000000000000',
      tenantId: tenantId,
      role: 'admin',
      email: 'internal@service',
      isInternal: true
    };
    return next();
  }

  // Get token from Authorization header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // "Bearer <token>"

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    // Verify and decode the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Attach user info to the request object
    req.user = {
      id: decoded.userId,
      tenantId: decoded.tenantId,
      role: decoded.role,
      email: decoded.email
    };

    next(); // Let the request through
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

module.exports = { authenticate };
