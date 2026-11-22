const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validateEnvironment } = require('../config/env');
const { User, Employee } = require('../models');

const config = () => validateEnvironment(process.env);

function signAccessToken(user) {
  const env = config();
  return jwt.sign({ sub: user.id }, env.accessSecret, { expiresIn: env.accessTtl });
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function refreshCookieOptions(env = config()) {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    path: '/',
    ...(env.cookieSecure ? { partitioned: true } : {}),
    maxAge: env.refreshDays * 24 * 60 * 60 * 1000
  };
}

function clearRefreshCookieOptions(env = config()) {
  const { httpOnly, secure, sameSite, path, partitioned } = refreshCookieOptions(env);
  return {
    httpOnly, secure, sameSite, path,
    ...(partitioned ? { partitioned } : {})
  };
}

async function authenticate(req, res, next) {
  try {
    const header = req.get('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const payload = jwt.verify(token, config().accessSecret);
    const user = await User.findById(payload.sub).populate('employee');
    if (!user || !user.active) {
      return res.status(401).json({ success: false, message: 'Account unavailable' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

async function requireEmployeeAccess(req, res, next) {
  try {
    if (['admin', 'hr'].includes(req.user.role)) return next();
    if (!req.user.employee) return res.status(403).json({ success: false, message: 'Access denied' });
    if (req.user.role === 'manager') {
    const reports = await Employee.find({
      $or: [{ manager: req.user.employee._id }, { _id: req.user.employee._id }]
    }).select('_id department');
    req.allowedEmployeeIds = reports.map((employee) => String(employee._id));
    req.allowedEmployeeObjectIds = reports.map((employee) => employee._id);
    req.allowedDepartmentIds = [...new Set(reports.map((employee) => String(employee.department)))];
    const requested = req.params.employeeId || req.body.employee || req.query.employee;
    if (requested && !req.allowedEmployeeIds.includes(String(requested))) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    return next();
    }
    const employeeId = req.params.employeeId || req.body.employee || req.query.employee;
    if (employeeId && String(req.user.employee._id) !== String(employeeId)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!employeeId) req.query.employee = String(req.user.employee._id);
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  authenticate, authorize, requireEmployeeAccess, signAccessToken,
  createRefreshToken, hashToken, refreshCookieOptions, clearRefreshCookieOptions
};
