function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function escapeCsvCell(value) {
  const text = value == null ? '' : value instanceof Date ? value.toISOString() : String(value);
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(rows, columns) {
  const header = columns.map((column) => escapeCsvCell(column.label)).join(',');
  const body = rows.map((row) => columns
    .map((column) => escapeCsvCell(typeof column.value === 'function' ? column.value(row) : row[column.value]))
    .join(','));
  return [header, ...body].join('\r\n');
}

function pagination(query, defaultLimit = 25, maxLimit = 100) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { asyncHandler, escapeCsvCell, toCsv, pagination };
