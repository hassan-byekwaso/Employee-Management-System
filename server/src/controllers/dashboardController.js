const { asyncHandler } = require('../utils/http');
const { Attendance, Employee, Leave, Payroll, Department, Notification } = require('../models');

async function createMissingAttendanceReminders(employeeFilter, today, tomorrow) {
  const dateKey = today.toISOString().slice(0, 10);
  const employees = await Employee.find({ ...employeeFilter, employmentStatus: 'active' }).select('_id user');
  const employeeIds = employees.map((employee) => employee._id);
  const checkedIn = new Set((await Attendance.distinct('employee', {
    employee: { $in: employeeIds }, date: { $gte: today, $lt: tomorrow }, checkIn: { $ne: null }
  })).map(String));
  for (const employee of employees) {
    if (!employee.user || checkedIn.has(String(employee._id))) continue;
    await Notification.updateOne({
      dedupeKey: `attendance-missing:${employee._id}:${dateKey}`
    }, {
      $setOnInsert: {
        recipient: employee.user,
        title: 'Attendance reminder',
        message: 'Please check in for today.',
        type: 'warning',
        link: '/attendance',
        dedupeKey: `attendance-missing:${employee._id}:${dateKey}`
      }
    }, { upsert: true });
  }
}

async function sendMissingAttendanceReminders() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await createMissingAttendanceReminders({}, today, tomorrow);
}

const getDashboard = asyncHandler(async (req, res) => {
  const employeeIds = req.user.role === 'employee'
    ? [req.user.employee && req.user.employee._id].filter(Boolean)
    : req.user.role === 'manager'
      ? req.allowedEmployeeObjectIds
      : null;
  const employeeFilter = employeeIds ? { employee: { $in: employeeIds } } : {};
  const employeeDocFilter = employeeIds ? { _id: { $in: employeeIds } } : {};
  const departmentFilter = req.user.role === 'manager'
    ? { _id: { $in: req.allowedDepartmentIds } }
    : req.user.role === 'employee'
      ? { _id: req.user.employee?.department }
      : {};
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const recentJoinDate = new Date(now.getTime() - 30 * 86400000);
  if (['admin', 'hr', 'manager'].includes(req.user.role)) {
    await createMissingAttendanceReminders(employeeDocFilter, today, tomorrow);
  }
  const [employees, departments, pendingLeaves, leaveToday, presentToday, payrollTotal, statusCounts, recentActivity, newStarters] = await Promise.all([
    req.user.role === 'employee' ? Promise.resolve(1) : Employee.countDocuments(employeeDocFilter),
    Department.find(departmentFilter).select('name').populate('employeeCount'),
    Leave.countDocuments({ ...employeeFilter, status: 'pending' }),
    Leave.countDocuments({
      ...employeeFilter, status: 'approved', startDate: { $lte: today }, endDate: { $gte: today }
    }),
    Attendance.countDocuments({
      ...employeeFilter, date: { $gte: today, $lt: tomorrow }, status: { $in: ['present', 'late'] }
    }),
    Payroll.aggregate([
      { $match: { ...employeeFilter, periodStart: { $gte: monthStart, $lt: nextMonthStart } } },
      { $group: { _id: null, total: { $sum: '$netPay' } } }
    ]),
    Employee.aggregate([
      { $match: employeeDocFilter },
      { $group: { _id: '$employmentStatus', count: { $sum: 1 } } }
    ]),
    Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(5).select('title message type createdAt'),
    Employee.find({ ...employeeDocFilter, hireDate: { $gte: recentJoinDate } })
      .populate('department', 'name').sort({ hireDate: -1 }).limit(3)
      .select('firstName lastName jobTitle hireDate department')
  ]);
  res.json({
    success: true,
    data: {
      totalEmployees: employees,
      employees,
      departments: departments.map((department) => ({
        _id: department._id,
        name: department.name,
        employeeCount: department.employeeCount
      })),
      pendingLeaves,
      onLeave: leaveToday,
      presentToday,
      monthlyPayroll: payrollTotal[0] ? payrollTotal[0].total : 0,
      recentActivity,
      newStarters: newStarters.map((employee) => ({
        _id: employee._id,
        fullName: employee.fullName,
        jobTitle: employee.jobTitle,
        department: employee.department?.name || '',
        hireDate: employee.hireDate
      })),
      employeesByStatus: statusCounts.reduce((result, item) => {
        result[item._id] = item.count;
        return result;
      }, {})
    }
  });
});

module.exports = { getDashboard, sendMissingAttendanceReminders };
