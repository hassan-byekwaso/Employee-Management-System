const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { validateEnvironment } = require('../src/config/env');
const { escapeCsvCell, toCsv, pagination } = require('../src/utils/http');
const { monthBounds } = require('../src/utils/dates');
const { calculateKenyaPayroll, calculateNssf, calculatePaye } = require('../src/utils/kenyaPayroll');
const { Employee, Attendance, Payroll } = require('../src/models');
const {
  hashToken, createRefreshToken, refreshCookieOptions, clearRefreshCookieOptions
} = require('../src/middleware/auth');

process.env.MONGODB_URI = 'mongodb://localhost/test';
process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
process.env.CLIENT_ORIGIN = 'https://app.example.com,http://localhost:3000';
process.env.NODE_ENV = 'test';
const app = require('../src/app');

const validEnv = {
  MONGODB_URI: 'mongodb://localhost/test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  CLIENT_ORIGIN: ' https://app.example.com/ , http://localhost:3000 ',
  NODE_ENV: 'test'
};

test('environment validation requires secrets and allowed frontend origins', () => {
  assert.throws(() => validateEnvironment({}), /MONGODB_URI, JWT_ACCESS_SECRET/);
  assert.deepEqual(validateEnvironment(validEnv).origins, [
    'https://app.example.com', 'http://localhost:3000'
  ]);
  assert.throws(() => validateEnvironment({ ...validEnv, JWT_ACCESS_SECRET: 'short' }), /at least 32/);
});

test('cookie policy follows production and COOKIE_SECURE settings', () => {
  const development = validateEnvironment(validEnv);
  assert.equal(development.cookieSameSite, 'lax');
  assert.equal(development.cookieSecure, false);
  const production = validateEnvironment({ ...validEnv, NODE_ENV: 'production' });
  assert.equal(production.cookieSameSite, 'none');
  assert.equal(production.cookieSecure, true);
  const explicitlySecure = validateEnvironment({ ...validEnv, COOKIE_SECURE: 'true' });
  assert.equal(explicitlySecure.cookieSameSite, 'none');
  assert.equal(explicitlySecure.cookieSecure, true);
});

test('month filters use inclusive calendar bounds and reject invalid values', () => {
  const { start, endExclusive } = monthBounds('2026-02');
  assert.equal(start.toISOString(), '2026-02-01T00:00:00.000Z');
  assert.equal(endExclusive.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.throws(() => monthBounds('2026-13'), /valid calendar month/);
  assert.throws(() => monthBounds('202602'), /YYYY-MM/);
});

test('CSV export quotes fields and neutralizes spreadsheet formulas', () => {
  assert.equal(escapeCsvCell('=1+1'), '"\'=1+1"');
  assert.equal(toCsv([{ name: 'A "quoted", name' }], [{ label: 'Name', value: 'name' }]),
    '"Name"\r\n"A ""quoted"", name"');
});

test('Kenyan statutory payroll calculation applies configured rates, bands, and reliefs', () => {
  const nssf = calculateNssf(200000);
  assert.deepEqual(nssf, { employee: 6480, employer: 6480, tierI: 540, tierII: 5940 });
  assert.equal(calculateNssf(200000, true).employee, 0);
  assert.equal(calculatePaye(24000), 2400);
  assert.equal(calculatePaye(32333), 4483.25);
  assert.equal(calculatePaye(800001), 242283.7);

  const payroll = calculateKenyaPayroll({ baseSalary: 100000, insurancePremium: 10000 });
  assert.deepEqual({
    grossPay: payroll.grossPay,
    nssfEmployee: payroll.nssfEmployee,
    nssfEmployer: payroll.nssfEmployer,
    shif: payroll.shif,
    housingLevyEmployee: payroll.housingLevyEmployee,
    housingLevyEmployer: payroll.housingLevyEmployer,
    taxablePay: payroll.taxablePay,
    payeBeforeRelief: payroll.payeBeforeRelief,
    personalRelief: payroll.personalRelief,
    insuranceRelief: payroll.insuranceRelief,
    paye: payroll.paye,
    totalDeductions: payroll.totalDeductions,
    netPay: payroll.netPay
  }, {
    grossPay: 100000,
    nssfEmployee: 6000,
    nssfEmployer: 6000,
    shif: 2750,
    housingLevyEmployee: 1500,
    housingLevyEmployer: 1500,
    taxablePay: 89750,
    payeBeforeRelief: 21708.35,
    personalRelief: 2400,
    insuranceRelief: 1500,
    paye: 17808.35,
    totalDeductions: 28058.35,
    netPay: 71941.65
  });

  const lowPay = calculateKenyaPayroll({ grossPay: 6000 });
  assert.equal(lowPay.shif, 300);
  assert.equal(lowPay.paye, 0);
  assert.equal(lowPay.netPay, 5250);
  const exempt = calculateKenyaPayroll({
    grossPay: 100000, nssfExempt: true, shifExempt: true,
    housingLevyExempt: true, payeExempt: true, otherDeductions: 5000
  });
  assert.equal(exempt.nssfEmployee, 0);
  assert.equal(exempt.shif, 0);
  assert.equal(exempt.housingLevyEmployee, 0);
  assert.equal(exempt.paye, 0);
  assert.equal(exempt.netPay, 95000);
});

test('employee, attendance, and payroll virtuals expose computed business values', async () => {
  const department = new mongoose.Types.ObjectId();
  const employee = new Employee({
    employeeId: 'TEST-001', firstName: 'Jamie', lastName: 'Lee', email: 'jamie@example.test',
    department, jobTitle: 'Analyst', salary: 72000
  });
  assert.equal(employee.name, 'Jamie Lee');
  assert.equal(employee.designation, 'Analyst');
  const attendance = new Attendance({
    employee: employee._id,
    date: new Date('2026-09-16T00:00:00.000Z'),
    checkIn: new Date(2026, 8, 16, 8, 30),
    checkOut: new Date(2026, 8, 16, 18, 30)
  });
  assert.equal(attendance.workingHours, 10);
  assert.equal(attendance.overtime, 2);
  const lateAttendance = new Attendance({
    employee: employee._id,
    date: new Date('2026-09-16T00:00:00.000Z'),
    checkIn: new Date(2026, 8, 16, 9, 30),
    checkOut: new Date(2026, 8, 16, 12, 0)
  });
  await lateAttendance.validate();
  assert.equal(lateAttendance.status, 'half-day');
  const lateStatus = new Attendance({
    employee: employee._id,
    date: new Date('2026-09-16T00:00:00.000Z'),
    checkIn: new Date(2026, 8, 16, 9, 30),
    checkOut: new Date(2026, 8, 16, 17, 30)
  });
  await lateStatus.validate();
  assert.equal(lateStatus.status, 'late');
  const payroll = new Payroll({
    employee: employee._id, periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30'),
    baseSalary: 100000, allowances: 0, bonuses: 0, deductions: 20, tax: 30,
    insurancePremium: 10000, netPay: 1
  });
  await payroll.validate();
  assert.equal(payroll.currency, 'KES');
  assert.equal(payroll.grossPay, 100000);
  assert.equal(payroll.nssfEmployee, 6000);
  assert.equal(payroll.nssfEmployer, 6000);
  assert.equal(payroll.shif, 2750);
  assert.equal(payroll.housingLevyEmployee, 1500);
  assert.equal(payroll.payeBeforeRelief, 21708.35);
  assert.equal(payroll.personalRelief, 2400);
  assert.equal(payroll.otherDeductions, 20);
  assert.equal(payroll.insuranceRelief, 1500);
  assert.equal(payroll.totalDeductions, 28078.35);
  assert.equal(payroll.netPay, 71921.65);
  assert.equal(payroll.netSalary, 71921.65);
});

test('pagination is bounded and refresh credentials are opaque', () => {
  assert.deepEqual(pagination({ page: '-2', limit: '1000' }), { page: 1, limit: 100, skip: 0 });
  const token = createRefreshToken();
  assert.equal(token.length > 40, true);
  assert.equal(hashToken(token).length, 64);
  const cookie = refreshCookieOptions({
    cookieSecure: true, cookieSameSite: 'none', refreshDays: 3
  });
  assert.equal(cookie.httpOnly, true);
  assert.equal(cookie.secure, true);
  assert.equal(cookie.sameSite, 'none');
  assert.equal(cookie.path, '/');
  assert.equal(cookie.partitioned, true);
  assert.equal(cookie.maxAge, 259200000);
  const clearCookie = clearRefreshCookieOptions({
    cookieSecure: true, cookieSameSite: 'none', refreshDays: 3
  });
  assert.equal(clearCookie.secure, true);
  assert.equal(clearCookie.sameSite, 'none');
  assert.equal(clearCookie.path, '/');
  assert.equal(clearCookie.partitioned, true);
  assert.equal(Object.hasOwn(clearCookie, 'maxAge'), false);
  const localCookie = refreshCookieOptions({
    cookieSecure: false, cookieSameSite: 'lax', refreshDays: 3
  });
  assert.equal(localCookie.secure, false);
  assert.equal(localCookie.sameSite, 'lax');
  assert.equal(localCookie.path, '/');
  assert.equal(Object.hasOwn(localCookie, 'partitioned'), false);
});

test('HTTP app serves health and protects API routes', async () => {
  assert.equal(app.get('trust proxy'), 1);
  const server = app.listen(0);
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const health = await fetch(`${base}/api/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { success: true, status: 'ok' });
    const preflight = await fetch(`${base}/api/dashboard`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://app.example.com',
        'Access-Control-Request-Method': 'GET',
        'Access-Control-Request-Headers': 'authorization'
      }
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.example.com');
    assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
    const protectedResponse = await fetch(`${base}/api/dashboard`);
    assert.equal(protectedResponse.status, 401);
    const rejectedOrigin = await fetch(`${base}/api/health`, {
      headers: { Origin: 'https://untrusted.example' }
    });
    assert.equal(rejectedOrigin.status, 403);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
