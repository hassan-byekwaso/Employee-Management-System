const express = require('express');
const crypto = require('crypto');
const { User, Employee, Department } = require('../models');
const { asyncHandler } = require('../utils/http');
const {
  authenticate, authorize, signAccessToken, createRefreshToken, hashToken, refreshCookieOptions,
  clearRefreshCookieOptions
} = require('../middleware/auth');
const { validateEnvironment } = require('../config/env');

const router = express.Router();
const safeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  employee: user.employee || null
});

router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, password, department, employeeId, designation, phone, salary } = req.body;
  const cleanName = String(name || '').trim();
  const cleanEmail = String(email || '').toLowerCase().trim();
  if (!cleanName || !cleanEmail || !password || !department || !designation) {
    return res.status(400).json({
      success: false,
      message: 'Name, email, password, department, and designation are required'
    });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
  }
  if (await User.exists({ email: cleanEmail }) || await Employee.exists({ email: cleanEmail })) {
    return res.status(409).json({ success: false, message: 'An account with that email already exists' });
  }
  const departmentRecord = await Department.findById(department).select('_id');
  if (!departmentRecord) return res.status(400).json({ success: false, message: 'Department not found' });
  const [firstName, ...lastParts] = cleanName.split(/\s+/);
  const employee = await Employee.create({
    employeeId: String(employeeId || `EMP-${crypto.randomBytes(5).toString('hex').toUpperCase()}`),
    firstName,
    lastName: lastParts.join(' ') || firstName,
    email: cleanEmail,
    phone: phone || '',
    department: departmentRecord._id,
    jobTitle: String(designation).trim(),
    salary: Number(salary || 0)
  });
  try {
    const user = await User.create({
      name: cleanName, email: cleanEmail, password: String(password), role: 'employee',
      employee: employee._id
    });
    employee.user = user._id;
    await employee.save();
    return res.status(201).json({ success: true, user: safeUser(user) });
  } catch (error) {
    await Employee.deleteOne({ _id: employee._id });
    throw error;
  }
}));

router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ success: false, message: 'Email and password are required' });
  const user = await User.findOne({ email: String(email).toLowerCase().trim() })
    .select('+password +refreshTokens').populate('employee');
  if (!user || !user.active || !(await user.verifyPassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }
  const env = validateEnvironment(process.env);
  const refreshToken = createRefreshToken();
  user.refreshTokens.push({
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + env.refreshDays * 86400000)
  });
  user.refreshTokens = user.refreshTokens.filter((item) => item.expiresAt > new Date());
  await user.save();
  res.cookie(env.refreshCookieName, refreshToken, refreshCookieOptions(env));
  res.json({ success: true, accessToken: signAccessToken(user), user: safeUser(user) });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const env = validateEnvironment(process.env);
  const token = req.cookies[env.refreshCookieName];
  if (!token) return res.status(401).json({ success: false, message: 'Refresh token required' });
  const hash = hashToken(token);
  const user = await User.findOne({ 'refreshTokens.tokenHash': hash })
    .select('+refreshTokens').populate('employee');
  const entry = user && user.refreshTokens.find((item) =>
    crypto.timingSafeEqual(Buffer.from(item.tokenHash), Buffer.from(hash)) && item.expiresAt > new Date());
  if (!user || !user.active || !entry) {
    res.clearCookie(env.refreshCookieName, clearRefreshCookieOptions(env));
    return res.status(401).json({ success: false, message: 'Invalid or expired refresh token' });
  }
  user.refreshTokens = user.refreshTokens.filter((item) => item.tokenHash !== hash && item.expiresAt > new Date());
  const nextToken = createRefreshToken();
  user.refreshTokens.push({
    tokenHash: hashToken(nextToken),
    expiresAt: new Date(Date.now() + env.refreshDays * 86400000)
  });
  await user.save();
  res.cookie(env.refreshCookieName, nextToken, refreshCookieOptions(env));
  res.json({ success: true, accessToken: signAccessToken(user), user: safeUser(user) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const env = validateEnvironment(process.env);
  const token = req.cookies[env.refreshCookieName];
  if (token) {
    await User.updateOne(
      { 'refreshTokens.tokenHash': hashToken(token) },
      { $pull: { refreshTokens: { tokenHash: hashToken(token) } } }
    );
  }
  res.clearCookie(env.refreshCookieName, clearRefreshCookieOptions(env));
  res.json({ success: true, message: 'Logged out' });
}));

router.get('/me', authenticate, (req, res) => res.json({ success: true, user: safeUser(req.user) }));

router.post('/users', authenticate, authorize('admin'), asyncHandler(async (req, res) => {
  const { name, email, password, role = 'employee', employee = null } = req.body;
  if (['employee', 'manager'].includes(role) && !employee) {
    return res.status(400).json({ success: false, message: 'Employee and manager accounts require an employee profile' });
  }
  const employeeRecord = employee ? await Employee.findById(employee) : null;
  if (employee && !employeeRecord) {
    return res.status(404).json({ success: false, message: 'Employee profile not found' });
  }
  if (employeeRecord?.user) {
    return res.status(409).json({ success: false, message: 'Employee profile already has an account' });
  }
  if (employeeRecord && String(employeeRecord.email).toLowerCase() !== String(email).toLowerCase()) {
    return res.status(400).json({ success: false, message: 'Account email must match the employee profile' });
  }
  const user = await User.create({ name, email, password, role, employee });
  if (employeeRecord) {
    employeeRecord.user = user._id;
    try {
      await employeeRecord.save();
    } catch (error) {
      await User.deleteOne({ _id: user._id });
      throw error;
    }
  }
  res.status(201).json({ success: true, user: safeUser(user) });
}));

module.exports = router;
