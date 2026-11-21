function monthBounds(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match) {
    const error = new Error('month must use YYYY-MM format');
    error.statusCode = 400;
    throw error;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    const error = new Error('month must be a valid calendar month');
    error.statusCode = 400;
    throw error;
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const endExclusive = new Date(Date.UTC(year, month, 1));
  return { start, endExclusive };
}

module.exports = { monthBounds };
