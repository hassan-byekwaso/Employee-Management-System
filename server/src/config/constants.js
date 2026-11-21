const ROLES = Object.freeze(['admin', 'hr', 'manager', 'employee']);
const LEAVE_STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'cancelled']);
const ATTENDANCE_STATUSES = Object.freeze(['present', 'absent', 'late', 'half-day', 'leave']);
const PERFORMANCE_STATUSES = Object.freeze(['not-started', 'in-progress', 'completed']);

module.exports = { ROLES, LEAVE_STATUSES, ATTENDANCE_STATUSES, PERFORMANCE_STATUSES };
