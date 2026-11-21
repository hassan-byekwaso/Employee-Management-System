const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { ROLES, LEAVE_STATUSES, ATTENDANCE_STATUSES, PERFORMANCE_STATUSES } = require('../config/constants');

const { Schema } = mongoose;
const options = { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } };

const departmentSchema = new Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true, default: '' },
  manager: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  budget: { type: Number, min: 0, default: 0 }
}, options);
departmentSchema.virtual('employeeCount', {
  ref: 'Employee', localField: '_id', foreignField: 'department', count: true
});

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  password: { type: String, required: true, minlength: 8, select: false },
  role: { type: String, enum: ROLES, default: 'employee', required: true },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  active: { type: Boolean, default: true },
  refreshTokens: {
    type: [{
      tokenHash: { type: String, required: true },
      expiresAt: { type: Date, required: true }
    }],
    select: false
  }
}, options);
userSchema.pre('save', async function hashPassword() {
  if (this.isModified('password')) this.password = await bcrypt.hash(this.password, 12);
});
userSchema.methods.verifyPassword = function verifyPassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

const employeeSchema = new Schema({
  employeeId: { type: String, required: true, trim: true, unique: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true, lowercase: true, unique: true },
  phone: { type: String, trim: true, default: '' },
  address: { type: String, trim: true, default: '' },
  dateOfBirth: Date,
  hireDate: { type: Date, default: Date.now },
  jobTitle: { type: String, required: true, trim: true },
  department: { type: Schema.Types.ObjectId, ref: 'Department', required: true },
  manager: { type: Schema.Types.ObjectId, ref: 'Employee', default: null },
  employmentStatus: { type: String, enum: ['active', 'inactive', 'on-leave', 'terminated'], default: 'active' },
  salary: { type: Number, min: 0, default: 0 },
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  emergencyContact: {
    name: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    relationship: { type: String, trim: true, default: '' }
  }
}, options);
employeeSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});
employeeSchema.virtual('name').get(function name() {
  return this.fullName;
});
employeeSchema.virtual('designation').get(function designation() {
  return this.jobTitle;
});
employeeSchema.virtual('dateOfJoining').get(function dateOfJoining() {
  return this.hireDate;
});
employeeSchema.virtual('status').get(function status() {
  return this.employmentStatus;
});
employeeSchema.index({ user: 1 }, {
  unique: true,
  partialFilterExpression: { user: { $type: 'objectId' } }
});

const attendanceSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  date: { type: Date, required: true },
  checkIn: Date,
  checkOut: Date,
  status: { type: String, enum: ATTENDANCE_STATUSES, default: 'present' },
  notes: { type: String, trim: true, default: '' }
}, options);
attendanceSchema.virtual('workingHours').get(function workingHours() {
  if (!this.checkIn || !this.checkOut) return 0;
  return Math.max(0, Math.round(((this.checkOut - this.checkIn) / 3600000) * 100) / 100);
});
attendanceSchema.virtual('overtime').get(function overtime() {
  return Math.max(0, Math.round((this.workingHours - 8) * 100) / 100);
});
attendanceSchema.pre('validate', function calculateAttendanceStatus() {
  if (this.checkIn) {
    const minutes = this.checkIn.getHours() * 60 + this.checkIn.getMinutes();
    this.status = minutes > 9 * 60 + 15 ? 'late' : 'present';
  }
  if (this.checkOut && this.workingHours > 0 && this.workingHours < 4) {
    this.status = 'half-day';
  }
});
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

const leaveSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  type: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number, required: true, min: 0.5 },
  reason: { type: String, trim: true, default: '' },
  status: { type: String, enum: LEAVE_STATUSES, default: 'pending' },
  reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: Date,
  reviewerNote: { type: String, trim: true, default: '' }
}, options);

const payrollSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  periodStart: { type: Date, required: true },
  periodEnd: { type: Date, required: true },
  baseSalary: { type: Number, required: true, min: 0 },
  allowances: { type: Number, min: 0, default: 0 },
  bonuses: { type: Number, min: 0, default: 0 },
  deductions: { type: Number, min: 0, default: 0 },
  tax: { type: Number, min: 0, default: 0 },
  netPay: { type: Number, required: true, min: 0 },
  currency: { type: String, uppercase: true, default: 'USD' },
  paymentDate: Date,
  status: { type: String, enum: ['draft', 'processed', 'paid'], default: 'draft' }
}, options);
payrollSchema.virtual('basicSalary').get(function basicSalary() {
  return this.baseSalary;
});
payrollSchema.virtual('netSalary').get(function netSalary() {
  return this.netPay;
});
payrollSchema.pre('validate', function calculateNetPay() {
  this.netPay = Math.max(0, Number(this.baseSalary || 0) + Number(this.allowances || 0) +
    Number(this.bonuses || 0) - Number(this.deductions || 0) - Number(this.tax || 0));
});
payrollSchema.index({ employee: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

const performanceSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  reviewer: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  reviewPeriod: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5 },
  strengths: { type: String, trim: true, default: '' },
  improvements: { type: String, trim: true, default: '' },
  comments: { type: String, trim: true, default: '' },
  status: { type: String, enum: PERFORMANCE_STATUSES, default: 'not-started' }
}, options);
performanceSchema.virtual('period').get(function period() {
  return this.reviewPeriod;
});
performanceSchema.virtual('feedback').get(function feedback() {
  return this.comments;
});

const goalSchema = new Schema({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true, default: '' },
  dueDate: Date,
  progress: { type: Number, min: 0, max: 100, default: 0 },
  status: { type: String, enum: PERFORMANCE_STATUSES, default: 'not-started' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
}, options);

const notificationSchema = new Schema({
  recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  type: { type: String, enum: ['info', 'success', 'warning', 'alert'], default: 'info' },
  readAt: Date,
  link: { type: String, trim: true, default: '' },
  dedupeKey: { type: String, trim: true, default: undefined }
}, options);
notificationSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });

const models = {
  User: mongoose.models.User || mongoose.model('User', userSchema),
  Employee: mongoose.models.Employee || mongoose.model('Employee', employeeSchema),
  Department: mongoose.models.Department || mongoose.model('Department', departmentSchema),
  Attendance: mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema),
  Leave: mongoose.models.Leave || mongoose.model('Leave', leaveSchema),
  Payroll: mongoose.models.Payroll || mongoose.model('Payroll', payrollSchema),
  Performance: mongoose.models.Performance || mongoose.model('Performance', performanceSchema),
  Goal: mongoose.models.Goal || mongoose.model('Goal', goalSchema),
  Notification: mongoose.models.Notification || mongoose.model('Notification', notificationSchema)
};

module.exports = models;
