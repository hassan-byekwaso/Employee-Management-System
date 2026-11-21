require('dotenv').config();

const mongoose = require('mongoose');
const { validateEnvironment } = require('./src/config/env');
const {
  User, Employee, Department, Attendance, Leave, Payroll, Performance, Goal, Notification
} = require('./src/models');

async function seed() {
  const config = validateEnvironment(process.env);
  await mongoose.connect(config.mongoUri);
  const credentials = {
    admin: { email: 'admin@orbitpeople.com', password: process.env.SEED_ADMIN_PASSWORD || 'Admin123!' },
    hr: { email: 'hr@orbitpeople.com', password: process.env.SEED_HR_PASSWORD || 'Admin123!' },
    manager: { email: 'alex.morgan@example.com', password: process.env.SEED_MANAGER_PASSWORD || 'Manager123!' },
    employee: { email: 'employee@orbitpeople.com', password: process.env.SEED_EMPLOYEE_PASSWORD || 'Admin123!' }
  };
  const upsert = { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true };
  const engineering = await Department.findOneAndUpdate(
    { name: 'Engineering' }, {
      $set: { description: 'Product engineering and platform', budget: 2400000 }
    }, upsert
  );
  const people = await Department.findOneAndUpdate(
    { name: 'People Operations' }, {
      $set: { description: 'Human resources and employee support', budget: 820000 }
    }, upsert
  );

  const getUser = async ({ name, email, role, employee, password }) => {
    let user = await User.findOne({ email }).select('+password');
    if (!user) user = new User({ name, email, password, role, employee });
    else {
      user.name = name;
      user.role = role;
      user.employee = employee || null;
      user.active = true;
      if (!(await user.verifyPassword(password))) user.password = password;
    }
    await user.save();
    return user;
  };
  const managerEmployee = await Employee.findOneAndUpdate({ employeeId: 'DEMO-001' }, {
    $set: {
      firstName: 'Alex', lastName: 'Morgan', email: 'alex.morgan@example.com',
      jobTitle: 'Engineering Manager', department: engineering._id,
      hireDate: new Date('2022-03-14'), employmentStatus: 'active', salary: 120000
    }
  }, upsert);
  const managerUser = await getUser({
    name: 'Alex Morgan', ...credentials.manager, role: 'manager', employee: managerEmployee._id
  });
  managerEmployee.user = managerUser._id;
  await managerEmployee.save();

  const employee = await Employee.findOneAndUpdate({ employeeId: 'DEMO-002' }, {
    $set: {
      firstName: 'Taylor', lastName: 'Reed', email: 'taylor.reed@example.com',
      jobTitle: 'Software Engineer', department: engineering._id, manager: managerEmployee._id,
      hireDate: new Date('2023-06-05'), employmentStatus: 'active', salary: 85000
    }
  }, upsert);
  const employeeUser = await getUser({
    name: 'Taylor Reed', ...credentials.employee, role: 'employee', employee: employee._id
  });
  employee.user = employeeUser._id;
  await employee.save();

  await getUser({
    name: 'Demo Administrator', ...credentials.admin, role: 'admin', employee: null
  });
  await getUser({ name: 'Demo HR', ...credentials.hr, role: 'hr', employee: null });
  engineering.manager = managerEmployee._id;
  await engineering.save();
  await Department.findByIdAndUpdate(people._id, { manager: managerEmployee._id });

  const today = new Date();
  const day = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  await Attendance.findOneAndUpdate({ employee: employee._id, date: day }, {
    $set: { checkIn: new Date(day.getTime() + 9 * 3600000), status: 'present', notes: 'Seeded demo attendance' }
  }, upsert);
  const leaveStart = new Date(day);
  leaveStart.setUTCDate(leaveStart.getUTCDate() + 7);
  const leaveEnd = new Date(leaveStart);
  leaveEnd.setUTCDate(leaveEnd.getUTCDate() + 1);
  await Leave.findOneAndUpdate({ employee: employee._id, type: 'Paid', startDate: leaveStart }, {
    $set: { endDate: leaveEnd, days: 2, reason: 'Planned personal time', status: 'pending' }
  }, upsert);
  const periodStart = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0));
  await Payroll.findOneAndUpdate({ employee: employee._id, periodStart, periodEnd }, {
    $set: {
      baseSalary: 85000 / 12, bonuses: 250, deductions: 100,
      netPay: 85000 / 12 + 150, currency: 'USD', status: 'processed'
    }
  }, upsert);
  await Performance.findOneAndUpdate({ employee: employee._id, reviewPeriod: '2026 H2' }, {
    $set: {
      reviewer: managerUser._id, rating: 4, strengths: 'Reliable delivery and collaboration',
      improvements: 'Continue building technical leadership', comments: 'Strong performance',
      status: 'completed'
    }
  }, upsert);
  await Goal.findOneAndUpdate({ employee: employee._id, title: 'Complete platform onboarding' }, {
    $set: {
      description: 'Complete onboarding and document core services',
      dueDate: new Date(day.getTime() + 30 * 86400000), progress: 75,
      status: 'in-progress', createdBy: managerUser._id
    }
  }, upsert);
  await Notification.findOneAndUpdate({ recipient: employeeUser._id, title: 'Welcome to the team' }, {
    $set: {
      message: 'Your employee account is ready. Review your profile and current goals.',
      type: 'info', link: '/dashboard'
    }
  }, upsert);

  console.log('Demo data is ready.');
  console.log('Demo logins:');
  for (const [role, login] of Object.entries(credentials)) {
    console.log(`  ${role}: ${login.email} / ${login.password}`);
  }
  console.log(`Engineering: ${engineering.id}; People Operations: ${people.id}`);
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => mongoose.disconnect());
