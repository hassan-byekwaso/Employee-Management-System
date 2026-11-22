const express = require('express');
const { asyncHandler, pagination, toCsv } = require('../utils/http');
const { monthBounds } = require('../utils/dates');
const { authorize, requireEmployeeAccess } = require('../middleware/auth');
const { calculateKenyaPayroll } = require('../utils/kenyaPayroll');
const {
  User, Employee, Department, Attendance, Leave, Payroll, Performance, Goal, Notification
} = require('../models');

const adminHr = ['admin', 'hr'];
const managers = ['admin', 'hr', 'manager'];

function scopedEmployee(req, query) {
  if (req.user.role === 'employee') query.employee = req.user.employee._id;
  else if (req.params.employeeId) query.employee = req.params.employeeId;
  else if (req.query.employee) query.employee = req.query.employee;
  else if (req.user.role === 'manager') query.employee = { $in: req.allowedEmployeeIds };
  return query;
}

function normalizeFields(model, body, fields) {
  const source = { ...body };
  if (model === Employee) {
    if (source.name && (!source.firstName || !source.lastName)) {
      const parts = String(source.name).trim().split(/\s+/);
      source.firstName = parts.shift() || '';
      source.lastName = parts.join(' ');
    }
    if (source.designation !== undefined) source.jobTitle = source.designation;
    if (source.dateOfJoining !== undefined) source.hireDate = source.dateOfJoining;
    if (source.status !== undefined) source.employmentStatus = source.status;
  } else if (model === Payroll) {
    if (source.basicSalary !== undefined) source.baseSalary = source.basicSalary;
    if (source.netSalary !== undefined) source.netPay = source.netSalary;
    if (source.deductions !== undefined && source.otherDeductions === undefined) {
      source.otherDeductions = source.deductions;
    }
  } else if (model === Performance) {
    if (source.period !== undefined) source.reviewPeriod = source.period;
    if (source.feedback !== undefined) source.comments = source.feedback;
  }
  return Object.fromEntries(fields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function createCollectionRouter({ model, fields, roles, populate = '', allowEmployeeCreate = false, writeRoles = adminHr }) {
  const router = express.Router();
  router.get('/', authorize(...roles), requireEmployeeAccess, asyncHandler(async (req, res) => {
    const filter = {};
    for (const key of ['department', 'status', 'employmentStatus', 'employee', 'reviewPeriod']) {
      if (req.query[key] && model !== Notification && !(model === Employee && key === 'employee')
        && ['department', 'status', 'employmentStatus', 'employee', 'reviewPeriod'].includes(key)) {
        filter[key] = req.query[key];
      }
    }
    if (model === Employee && req.query.role) {
      const users = await User.find({ role: req.query.role }).select('_id');
      filter.user = { $in: users.map((user) => user._id) };
    }
    if (model === Employee && req.query.q) {
      const search = new RegExp(escapeRegex(req.query.q), 'i');
      const matchingUsers = await User.find({ $or: [{ name: search }, { email: search }] }).select('_id');
      filter.$or = [
        { employeeId: search }, { firstName: search }, { lastName: search },
        { email: search }, { jobTitle: search }, { user: { $in: matchingUsers.map((user) => user._id) } }
      ];
    }
    if (model === Employee && req.user.role === 'employee') {
      filter._id = req.user.employee._id;
    } else if (model === Employee && req.user.role === 'manager') {
      filter._id = { $in: req.allowedEmployeeIds };
    } else if (model === Department && req.user.role === 'manager') {
      filter._id = { $in: req.allowedDepartmentIds };
    } else if (model !== Employee && model !== Department && model !== Notification) {
      scopedEmployee(req, filter);
    }
    if (model === Attendance && req.query.month) {
      const { start, endExclusive } = monthBounds(req.query.month);
      filter.date = { $gte: start, $lt: endExclusive };
    } else if (req.query.from || req.query.to) {
      const dateField = model === Attendance ? 'date' : model === Leave ? 'startDate' : 'periodStart';
      filter[dateField] = {};
      if (req.query.from) filter[dateField].$gte = new Date(req.query.from);
      if (req.query.to) filter[dateField].$lte = new Date(req.query.to);
    }
    if (model === Notification) filter.recipient = req.user._id;
    const { page, limit, skip } = pagination(req.query);
    const [items, total, unreadCount] = await Promise.all([
      model.find(filter).populate(populate).sort({ createdAt: -1 }).skip(skip).limit(limit),
      model.countDocuments(filter),
      model === Notification ? model.countDocuments({ recipient: req.user._id, readAt: null }) : Promise.resolve(undefined)
    ]);
    const data = model === Notification ? { items, unreadCount } : items;
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  }));
  router.get('/:id', authorize(...roles), requireEmployeeAccess, asyncHandler(async (req, res) => {
    const filter = { _id: req.params.id };
    if (model === Employee && req.user.role === 'employee') filter._id = req.user.employee._id;
    else if (model === Employee && req.user.role === 'manager') {
      filter._id = { $in: req.allowedEmployeeIds };
    } else if (model === Department && req.user.role === 'manager') {
      filter._id = { $in: req.allowedDepartmentIds };
    } else if (model !== Department && model !== Notification) {
      scopedEmployee(req, filter);
    }
    if (model === Notification) filter.recipient = req.user._id;
    const item = await model.findOne(filter).populate(populate);
    if (!item) return res.status(404).json({ success: false, message: 'Record not found' });
    res.json({ success: true, data: item });
  }));
  router.post('/', authorize(...(allowEmployeeCreate ? roles : writeRoles)), requireEmployeeAccess, asyncHandler(async (req, res) => {
    const data = normalizeFields(model, req.body, fields);
    if (allowEmployeeCreate && req.user.role === 'employee') data.employee = req.user.employee._id;
    if (model === Payroll) {
      const employee = await Employee.findById(data.employee)
        .select('nssfExempt shifExempt housingLevyExempt payeExempt');
      if (!employee) return res.status(400).json({ success: false, message: 'Employee not found' });
      for (const field of ['nssfExempt', 'shifExempt', 'housingLevyExempt', 'payeExempt']) {
        if (data[field] === undefined) data[field] = employee[field];
      }
    }
    if (model === Leave && data.startDate && data.endDate) {
      const start = new Date(data.startDate);
      const end = new Date(data.endDate);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
        return res.status(400).json({ success: false, message: 'Leave dates must be valid' });
      }
      if (end < start) {
        return res.status(400).json({ success: false, message: 'Leave endDate must be on or after startDate' });
      }
      if (data.days === undefined) {
        const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
        const endDay = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
        data.days = Math.floor((endDay - startDay) / 86400000) + 1;
      }
    }
    if (model === Goal) data.createdBy = req.user._id;
    const item = await model.create(data);
    if (model === Performance && item.employee) {
      const employee = await Employee.findById(item.employee).select('user');
      if (employee?.user) {
        await Notification.create({
          recipient: employee.user,
          title: 'Performance review scheduled',
          message: `A performance review for ${item.reviewPeriod} has been scheduled.`,
          type: 'info',
          link: '/performance'
        });
      }
    }
    res.status(201).json({ success: true, data: item });
  }));
  const updateRecord = asyncHandler(async (req, res) => {
    const update = normalizeFields(model, req.body, fields);
    if (model === Goal && req.user.role === 'employee') {
      const progress = Number(req.body.progress);
      if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
        return res.status(400).json({ success: false, message: 'Progress must be a number from 0 to 100' });
      }
      const status = progress >= 100 ? 'completed' : progress > 0 ? 'in-progress' : 'not-started';
      const item = await Goal.findOneAndUpdate(
        { _id: req.params.id, employee: req.user.employee._id },
        { $set: { progress, status } }, { new: true, runValidators: true }
      ).populate(populate);
      if (!item) return res.status(404).json({ success: false, message: 'Goal not found' });
      return res.json({ success: true, data: item });
    }
    const filter = { _id: req.params.id };
    if ([Goal, Performance].includes(model) && req.user.role === 'manager') {
      filter.employee = { $in: req.allowedEmployeeIds };
    }
    let linkedUser;
    let previousEmail;
    if (model === Employee && update.email) {
      const currentEmployee = await Employee.findOne(filter).select('email user');
      if (!currentEmployee) return res.status(404).json({ success: false, message: 'Record not found' });
      const employeeConflict = await Employee.exists({ email: update.email, _id: { $ne: currentEmployee._id } });
      if (employeeConflict) return res.status(409).json({ success: false, message: 'Employee email is already in use' });
      if (currentEmployee.user) {
        linkedUser = currentEmployee.user;
        const userConflict = await User.exists({ email: update.email, _id: { $ne: linkedUser } });
        if (userConflict) return res.status(409).json({ success: false, message: 'Account email is already in use' });
        previousEmail = currentEmployee.email;
        await User.updateOne({ _id: linkedUser }, { $set: { email: update.email } }, { runValidators: true });
      }
    }
    let item;
    try {
      item = await model.findOneAndUpdate(filter, update, { new: true, runValidators: true }).populate(populate);
    } catch (error) {
      if (linkedUser) await User.updateOne({ _id: linkedUser }, { $set: { email: previousEmail } }, { runValidators: true });
      throw error;
    }
    if (!item) return res.status(404).json({ success: false, message: 'Record not found' });
    if (model === Employee && item.user) {
      const userUpdate = { $set: {} };
      if (update.firstName !== undefined || update.lastName !== undefined) userUpdate.$set.name = item.fullName;
      if (update.employmentStatus !== undefined) {
        userUpdate.$set.active = update.employmentStatus === 'active';
        if (!userUpdate.$set.active) userUpdate.$unset = { refreshTokens: 1 };
      }
      if (Object.keys(userUpdate.$set).length) {
        await User.updateOne({ _id: item.user }, userUpdate, { runValidators: true });
      }
    }
    res.json({ success: true, data: item });
  });
  const updateRoles = model === Goal ? [...writeRoles, 'employee'] : writeRoles;
  router.patch('/:id', authorize(...updateRoles), requireEmployeeAccess, updateRecord);
  router.put('/:id', authorize(...updateRoles), requireEmployeeAccess, updateRecord);
  router.delete('/:id', authorize(...writeRoles), requireEmployeeAccess, asyncHandler(async (req, res) => {
    const filter = { _id: req.params.id };
    if ([Goal, Performance].includes(model) && req.user.role === 'manager') {
      filter.employee = { $in: req.allowedEmployeeIds };
    }
    if (model === Department && await Employee.exists({ department: req.params.id })) {
      return res.status(409).json({ success: false, message: "Reassign this department's employees before deleting it" });
    }
    const item = await model.findOneAndDelete(filter);
    if (!item) return res.status(404).json({ success: false, message: 'Record not found' });
    if (model === Employee && item.user) {
      await User.updateOne(
        { _id: item.user },
        { $set: { active: false, employee: null }, $unset: { refreshTokens: 1 } }
      );
    }
    res.json({ success: true, message: 'Record deleted' });
  }));
  return router;
}

const employeeFields = [
  'employeeId', 'firstName', 'lastName', 'email', 'phone', 'address', 'dateOfBirth',
  'hireDate', 'jobTitle', 'department', 'manager', 'employmentStatus', 'salary', 'emergencyContact',
  'nssfExempt', 'shifExempt', 'housingLevyExempt', 'payeExempt'
];
const departmentFields = ['name', 'description', 'manager', 'budget'];
const attendanceFields = ['employee', 'date', 'checkIn', 'checkOut', 'status', 'notes'];
const leaveFields = ['employee', 'type', 'startDate', 'endDate', 'days', 'reason'];
const payrollFields = [
  'employee', 'periodStart', 'periodEnd', 'baseSalary', 'allowances', 'bonuses',
  'otherDeductions', 'deductions', 'insurancePremium', 'nssfExempt', 'shifExempt',
  'housingLevyExempt', 'payeExempt', 'paymentDate'
];
const performanceFields = ['employee', 'reviewer', 'reviewPeriod', 'rating', 'strengths', 'improvements', 'comments', 'status'];
const goalFields = ['employee', 'title', 'description', 'dueDate', 'progress', 'status'];
const notificationFields = ['recipient', 'title', 'message', 'type', 'link'];

const router = express.Router();
router.post('/payroll/preview', authorize(...adminHr), asyncHandler(async (req, res) => {
  const amounts = ['baseSalary', 'allowances', 'bonuses', 'grossPay', 'otherDeductions', 'deductions', 'insurancePremium'];
  for (const field of amounts) {
    if (req.body[field] !== undefined &&
      (!Number.isFinite(Number(req.body[field])) || Number(req.body[field]) < 0)) {
      return res.status(400).json({ success: false, message: `${field} must be a non-negative number` });
    }
  }
  res.json({ success: true, data: calculateKenyaPayroll(req.body) });
}));

const leaveBalance = asyncHandler(async (req, res) => {
  const year = Number(req.query.year || new Date().getUTCFullYear());
  if (!Number.isInteger(year) || year < 1900 || year > 9998) {
    return res.status(400).json({ success: false, message: 'year must be a valid four-digit year' });
  }
  const employeeId = req.query.employee || (req.user.employee && req.user.employee._id);
  if (!employeeId) {
    return res.status(400).json({ success: false, message: 'Specify an employee query parameter' });
  }
  if (req.user.role === 'manager' && !req.allowedEmployeeIds.includes(String(employeeId))) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const employee = await Employee.findById(employeeId).select('_id');
  if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  const totals = await Leave.aggregate([
    {
      $match: {
        employee: employee._id, status: 'approved', type: { $ne: 'Unpaid' },
        startDate: { $gte: start, $lt: end }
      }
    },
    { $group: { _id: null, usedDays: { $sum: '$days' } } }
  ]);
  const configuredAllowance = Number(process.env.ANNUAL_LEAVE_DAYS);
  const allowanceDays = Number.isFinite(configuredAllowance) && configuredAllowance >= 0
    ? configuredAllowance
    : 20;
  const usedDays = totals[0] ? totals[0].usedDays : 0;
  res.json({
    success: true,
    data: { employee: employee._id, year, allowanceDays, usedDays, remainingDays: allowanceDays - usedDays }
  });
});
router.get('/leave/balance', authorize(...managers, 'employee'), requireEmployeeAccess, leaveBalance);
router.get('/leaves/balance', authorize(...managers, 'employee'), requireEmployeeAccess, leaveBalance);

router.post('/payroll/generate', authorize(...adminHr), asyncHandler(async (req, res) => {
  const month = req.body && req.body.month;
  const { start, endExclusive } = monthBounds(month);
  const end = new Date(endExclusive.getTime() - 86400000);
  const employees = await Employee.find({ employmentStatus: 'active' })
    .select('_id salary nssfExempt shifExempt housingLevyExempt payeExempt');
  if (employees.length) {
    await Payroll.bulkWrite(employees.map((employee) => {
      const baseSalary = Number(employee.salary || 0) / 12;
      const exemptions = {
        nssfExempt: employee.nssfExempt,
        shifExempt: employee.shifExempt,
        housingLevyExempt: employee.housingLevyExempt,
        payeExempt: employee.payeExempt
      };
      const calculation = calculateKenyaPayroll({ baseSalary, ...exemptions });
      return {
        updateOne: {
          filter: { employee: employee._id, periodStart: start, periodEnd: end },
          update: {
            $setOnInsert: {
              employee: employee._id, periodStart: start, periodEnd: end,
              baseSalary, allowances: 0, bonuses: 0, otherDeductions: 0, deductions: 0,
              insurancePremium: 0, ...exemptions, ...calculation,
              tax: calculation.paye, currency: 'KES', status: 'draft'
            }
          },
          upsert: true
        }
      };
    }));
  }
  const records = employees.length
    ? await Payroll.find({
      employee: { $in: employees.map((employee) => employee._id) },
      periodStart: start, periodEnd: end
    }).populate('employee').sort({ createdAt: -1 })
    : [];
  res.status(201).json({ success: true, data: records, generated: employees.length, month });
}));

router.use('/employees', createCollectionRouter({
  model: Employee, fields: employeeFields, roles: [...managers, 'employee'],
  populate: 'department manager user'
}));
router.use('/departments', createCollectionRouter({
  model: Department, fields: departmentFields, roles: managers, populate: 'manager employeeCount'
}));
router.use('/attendance', createCollectionRouter({
  model: Attendance, fields: attendanceFields, roles: [...managers, 'employee'], populate: 'employee',
  allowEmployeeCreate: true
}));
router.use('/leaves', createCollectionRouter({
  model: Leave, fields: leaveFields, roles: [...managers, 'employee'], populate: 'employee reviewedBy',
  allowEmployeeCreate: true
}));
router.use('/leave', createCollectionRouter({
  model: Leave, fields: leaveFields, roles: [...managers, 'employee'], populate: 'employee reviewedBy',
  allowEmployeeCreate: true
}));
router.use('/payroll', createCollectionRouter({
  model: Payroll, fields: payrollFields, roles: [...managers, 'employee'], populate: 'employee'
}));
router.use('/performance', createCollectionRouter({
  model: Performance, fields: performanceFields, roles: [...managers, 'employee'], populate: 'employee reviewer',
  writeRoles: managers
}));
router.use('/goals', createCollectionRouter({
  model: Goal, fields: goalFields, roles: [...managers, 'employee'], populate: 'employee createdBy',
  writeRoles: managers
}));
router.patch('/notifications/read-all', asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { recipient: req.user._id, readAt: null },
    { $set: { readAt: new Date() } }
  );
  res.json({ success: true, modifiedCount: result.modifiedCount });
}));
router.use('/notifications', createCollectionRouter({
  model: Notification, fields: notificationFields,
  roles: ['admin', 'hr', 'manager', 'employee'],
  allowEmployeeCreate: false
}));

const reviewLeave = (status) => asyncHandler(async (req, res) => {
  const existing = await Leave.findById(req.params.id).select('employee status type days startDate');
  if (!existing) return res.status(404).json({ success: false, message: 'Leave request not found' });
  if (req.user.role === 'manager' && !req.allowedEmployeeIds.includes(String(existing.employee))) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  if (existing.status !== 'pending') {
    return res.status(409).json({ success: false, message: 'Only pending leave requests can be reviewed' });
  }
  if (status === 'approved' && existing.type.toLowerCase() !== 'unpaid') {
    const year = existing.startDate.getUTCFullYear();
    const periodStart = new Date(Date.UTC(year, 0, 1));
    const periodEnd = new Date(Date.UTC(year + 1, 0, 1));
    const totals = await Leave.aggregate([
      {
        $match: {
          employee: existing.employee, status: 'approved', type: { $ne: 'Unpaid' },
          startDate: { $gte: periodStart, $lt: periodEnd }
        }
      },
      { $group: { _id: null, usedDays: { $sum: '$days' } } }
    ]);
    const allowance = Number(process.env.ANNUAL_LEAVE_DAYS);
    const allowanceDays = Number.isFinite(allowance) && allowance >= 0 ? allowance : 20;
    if ((totals[0]?.usedDays || 0) + existing.days > allowanceDays) {
      return res.status(409).json({ success: false, message: 'This approval would exceed the employee leave balance' });
    }
  }
  const leave = await Leave.findOneAndUpdate({ _id: req.params.id, status: 'pending' }, {
    status, reviewerNote: req.body.reviewerNote || '', reviewedBy: req.user._id, reviewedAt: new Date()
  }, { new: true, runValidators: true }).populate('employee reviewedBy');
  if (!leave) return res.status(409).json({ success: false, message: 'Leave request is no longer pending' });
  if (leave.employee && leave.employee.user) {
    await Notification.create({
      recipient: leave.employee.user,
      title: `Leave request ${status}`,
      message: `Your ${leave.type} leave request was ${status}.`,
      type: status === 'approved' ? 'success' : 'warning',
      link: '/leave'
    });
  }
  res.json({ success: true, data: leave });
});
for (const basePath of ['/leaves', '/leave']) {
  router.patch(`${basePath}/:id/approve`, authorize(...managers), requireEmployeeAccess, reviewLeave('approved'));
  router.patch(`${basePath}/:id/reject`, authorize(...managers), requireEmployeeAccess, reviewLeave('rejected'));
  router.patch(`${basePath}/:id/review`, authorize(...managers), requireEmployeeAccess, asyncHandler(async (req, res, next) => {
    if (!['approved', 'rejected'].includes(req.body.status)) {
      return res.status(400).json({ success: false, message: 'Review status must be approved or rejected' });
    }
    return reviewLeave(req.body.status)(req, res, next);
  }));
  router.patch(`${basePath}/:id/cancel`, authorize(...managers, 'employee'), requireEmployeeAccess, asyncHandler(async (req, res) => {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave request not found' });
    const employeeId = String(leave.employee);
    if (req.user.role === 'employee' && employeeId !== String(req.user.employee._id)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (req.user.role === 'manager' && !req.allowedEmployeeIds.includes(employeeId)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (leave.status !== 'pending') {
      return res.status(409).json({ success: false, message: 'Only pending leave requests can be cancelled' });
    }
    leave.status = 'cancelled';
    await leave.save();
    res.json({ success: true, data: leave });
  }));
}

router.patch('/notifications/:id/read', asyncHandler(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, recipient: req.user._id },
    { readAt: new Date() },
    { new: true, runValidators: true }
  );
  if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
  res.json({ success: true, data: notification });
}));

router.post('/notifications/announcement', authorize(...adminHr), asyncHandler(async (req, res) => {
  const title = String(req.body.title || '').trim();
  const message = String(req.body.message || '').trim();
  if (!title || !message) {
    return res.status(400).json({ success: false, message: 'Announcement title and message are required' });
  }
  const users = await User.find({ active: true }).select('_id');
  if (users.length) {
    await Notification.insertMany(users.map(({ _id }) => ({
      recipient: _id, title, message, type: 'info', link: req.body.link || '/notifications'
    })));
  }
  res.status(201).json({ success: true, notified: users.length });
}));

const exportReport = asyncHandler(async (req, res) => {
  const definitions = {
    employees: {
      model: Employee, populate: 'department',
      columns: [
        { label: 'Employee ID', value: 'employeeId' }, { label: 'First name', value: 'firstName' },
        { label: 'Last name', value: 'lastName' }, { label: 'Email', value: 'email' },
        { label: 'Department', value: (row) => row.department && row.department.name },
        { label: 'Job title', value: 'jobTitle' }, { label: 'Date of joining', value: 'hireDate' },
        { label: 'Status', value: 'employmentStatus' }, { label: 'Salary (KES)', value: 'salary' }
      ]
    },
    attendance: {
      model: Attendance, populate: 'employee',
      columns: [
        { label: 'Employee', value: (row) => row.employee && `${row.employee.firstName} ${row.employee.lastName}` },
        { label: 'Date', value: 'date' }, { label: 'Check in', value: 'checkIn' },
        { label: 'Check out', value: 'checkOut' }, { label: 'Working hours', value: 'workingHours' },
        { label: 'Overtime', value: 'overtime' }, { label: 'Status', value: 'status' }
      ]
    },
    leaves: {
      model: Leave, populate: 'employee',
      columns: [
        { label: 'Employee', value: (row) => row.employee && `${row.employee.firstName} ${row.employee.lastName}` },
        { label: 'Type', value: 'type' }, { label: 'Start date', value: 'startDate' },
        { label: 'End date', value: 'endDate' }, { label: 'Days', value: 'days' },
        { label: 'Status', value: 'status' }
      ]
    },
    payroll: {
      model: Payroll, populate: 'employee',
      columns: [
        { label: 'Employee ID', value: (row) => row.employee && row.employee.employeeId },
        { label: 'Period start', value: 'periodStart' }, { label: 'Period end', value: 'periodEnd' },
        { label: 'Gross pay (KES)', value: 'grossPay' },
        { label: 'NSSF employee (KES)', value: 'nssfEmployee' },
        { label: 'NSSF employer (KES)', value: 'nssfEmployer' },
        { label: 'SHIF (KES)', value: 'shif' },
        { label: 'Housing levy employee (KES)', value: 'housingLevyEmployee' },
        { label: 'Housing levy employer (KES)', value: 'housingLevyEmployer' },
        { label: 'Taxable pay (KES)', value: 'taxablePay' },
        { label: 'PAYE before relief (KES)', value: 'payeBeforeRelief' },
        { label: 'Personal relief (KES)', value: 'personalRelief' },
        { label: 'Insurance relief (KES)', value: 'insuranceRelief' },
        { label: 'PAYE (KES)', value: 'paye' },
        { label: 'Other deductions (KES)', value: 'otherDeductions' },
        { label: 'Total deductions (KES)', value: 'totalDeductions' },
        { label: 'Net pay (KES)', value: 'netPay' },
        { label: 'Status', value: 'status' }
      ]
    }
  };
  const definition = definitions[req.params.resource];
  if (!definition) return res.status(404).json({ success: false, message: 'Unknown report' });
  const filter = {};
  if (req.user.role === 'manager') {
    if (req.params.resource === 'employees') filter._id = { $in: req.allowedEmployeeIds };
    else filter.employee = { $in: req.allowedEmployeeIds };
  }
  if (req.params.resource === 'attendance' && req.query.month) {
    const { start, endExclusive } = monthBounds(req.query.month);
    filter.date = { $gte: start, $lt: endExclusive };
  } else if (req.query.from || req.query.to) {
    const field = req.params.resource === 'attendance' ? 'date'
      : req.params.resource === 'leaves' ? 'startDate' : 'periodStart';
    filter[field] = {};
    if (req.query.from) filter[field].$gte = new Date(req.query.from);
    if (req.query.to) filter[field].$lte = new Date(req.query.to);
  }
  const rows = await definition.model.find(filter).populate(definition.populate || '').sort({ createdAt: -1 }).limit(10000);
  const csv = toCsv(rows, definition.columns);
  res.type('text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${req.params.resource}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
router.get('/reports/:resource/csv', authorize(...managers), requireEmployeeAccess, exportReport);
router.get('/reports/:resource.csv', authorize(...managers), requireEmployeeAccess, exportReport);

router.patch('/payroll/:id/process', authorize(...adminHr), asyncHandler(async (req, res) => {
  const payroll = await Payroll.findById(req.params.id);
  if (!payroll) return res.status(404).json({ success: false, message: 'Payroll record not found' });
  if (payroll.status !== 'draft') {
    return res.status(409).json({ success: false, message: 'Only draft payroll can be processed' });
  }
  payroll.status = 'processed';
  await payroll.save();
  const employee = await Employee.findById(payroll.employee).select('user');
  if (employee?.user) {
    await Notification.create({
      recipient: employee.user,
      title: 'Payroll processed',
      message: `Your payroll for ${payroll.periodStart.toISOString().slice(0, 7)} has been processed.`,
      type: 'success',
      link: '/payroll'
    });
  }
  res.json({ success: true, data: payroll });
}));

router.patch('/payroll/:id/pay', authorize(...adminHr), asyncHandler(async (req, res) => {
  const payroll = await Payroll.findById(req.params.id);
  if (!payroll) return res.status(404).json({ success: false, message: 'Payroll record not found' });
  if (payroll.status !== 'processed') {
    return res.status(409).json({ success: false, message: 'Only processed payroll can be paid' });
  }
  payroll.status = 'paid';
  payroll.paymentDate = new Date();
  await payroll.save();
  const employee = await Employee.findById(payroll.employee).select('user');
  if (employee?.user) {
    await Notification.create({
      recipient: employee.user,
      title: 'Salary paid',
      message: `Your payroll for ${payroll.periodStart.toISOString().slice(0, 7)} has been paid.`,
      type: 'success',
      link: '/payroll'
    });
  }
  res.json({ success: true, data: payroll });
}));

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

router.get('/payroll/:id/slip', authorize(...managers, 'employee'), requireEmployeeAccess, asyncHandler(async (req, res) => {
  const payroll = await Payroll.findById(req.params.id).populate('employee');
  if (!payroll) return res.status(404).json({ success: false, message: 'Payroll record not found' });
  if (req.user.role === 'employee' && String(payroll.employee._id) !== String(req.user.employee._id)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  if (req.user.role === 'manager' && !req.allowedEmployeeIds.includes(String(payroll.employee._id))) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  const employeeName = escapeHtml(payroll.employee.fullName);
  const month = payroll.periodStart.toLocaleDateString('en-KE', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const currencyFormatter = new Intl.NumberFormat('en-KE', {
    style: 'currency', currency: 'KES', minimumFractionDigits: 2, maximumFractionDigits: 2
  });
  const money = (amount) => currencyFormatter.format(Number(amount || 0));
  const lines = [
    ['Basic salary', payroll.baseSalary], ['Allowances', payroll.allowances],
    ['Bonuses', payroll.bonuses], ['Gross pay', payroll.grossPay],
    ['NSSF employee contribution', -payroll.nssfEmployee],
    ['SHIF', -payroll.shif],
    ['Affordable Housing Levy (employee)', -payroll.housingLevyEmployee],
    ['Taxable pay', payroll.taxablePay],
    ['PAYE before relief', payroll.payeBeforeRelief],
    ['Personal relief', -payroll.personalRelief],
    ['Insurance relief', -payroll.insuranceRelief],
    ['PAYE after relief', -payroll.paye],
    ['Other deductions', -payroll.otherDeductions],
    ['Total deductions', -payroll.totalDeductions],
    ['NSSF employer contribution (not deducted from employee)', payroll.nssfEmployer],
    ['Affordable Housing Levy (employer; not deducted from employee)', payroll.housingLevyEmployer]
  ];
  const rows = lines.map(([label, amount]) => `<tr><th>${label}</th><td>${money(amount)}</td></tr>`).join('');
  res.type('html').set('Content-Disposition', `inline; filename="payslip-${payroll.periodStart.toISOString().slice(0, 7)}.html"`)
    .send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Payslip ${escapeHtml(month)}</title><style>body{font:16px Arial,sans-serif;max-width:680px;margin:48px auto;color:#20283a}h1{font-size:24px}p{color:#647084}table{width:100%;border-collapse:collapse;margin:28px 0}th,td{text-align:left;padding:12px;border-bottom:1px solid #e8ebf0}td{text-align:right}.total{font-weight:bold;font-size:18px}@media print{body{margin:0}}</style><h1>Salary statement</h1><p>${employeeName} · ${escapeHtml(month)}</p><table>${rows}<tr class="total"><th>Net pay</th><td>${money(payroll.netPay)}</td></tr></table><button onclick="window.print()">Print payslip</button></html>`);
}));

async function attendanceAction(req, res, next, action) {
  try {
    const employeeId = req.body.employee || (req.user.employee && req.user.employee._id);
    if (!employeeId) return res.status(400).json({ success: false, message: 'Employee is required' });
    const now = new Date();
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    if (action === 'in') {
      let attendance = await Attendance.findOne({ employee: employeeId, date });
      if (attendance && attendance.checkIn) {
        return res.status(409).json({ success: false, message: 'Already checked in for today' });
      }
      if (attendance) {
        attendance.checkIn = now;
        attendance.status = 'present';
        await attendance.save();
        return res.json({ success: true, data: attendance });
      }
      attendance = await Attendance.create({ employee: employeeId, date, checkIn: now, status: 'present' });
      return res.status(201).json({ success: true, data: attendance });
    }
    const attendance = await Attendance.findOne({ employee: employeeId, date });
    if (!attendance || !attendance.checkIn) {
      return res.status(409).json({ success: false, message: 'Check in before checking out' });
    }
    if (attendance.checkOut) return res.status(409).json({ success: false, message: 'Already checked out for today' });
    attendance.checkOut = now;
    await attendance.save();
    res.json({ success: true, data: attendance });
  } catch (error) {
    next(error);
  }
}
router.post('/attendance/check-in', requireEmployeeAccess, (req, res, next) => attendanceAction(req, res, next, 'in'));
router.post('/attendance/check-out', requireEmployeeAccess, (req, res, next) => attendanceAction(req, res, next, 'out'));
router.post('/attendance/checkin', requireEmployeeAccess, (req, res, next) => attendanceAction(req, res, next, 'in'));
router.post('/attendance/checkout', requireEmployeeAccess, (req, res, next) => attendanceAction(req, res, next, 'out'));

module.exports = router;
