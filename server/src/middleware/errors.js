function notFound(req, res, next) {
  const error = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let status = error.statusCode || error.status || 500;
  let message = error.message || 'Internal server error';
  if (error.name === 'ValidationError') {
    status = 400;
    message = Object.values(error.errors).map((item) => item.message).join(', ');
  } else if (error.name === 'CastError') {
    status = 400;
    message = `Invalid ${error.path}`;
  } else if (error.code === 11000) {
    status = 409;
    message = `A record with that ${Object.keys(error.keyValue || {}).join(', ')} already exists`;
  } else if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    status = 401;
    message = 'Invalid or expired token';
  }
  if (status >= 500) console.error(error);
  res.status(status).json({ success: false, message });
}

module.exports = { notFound, errorHandler };
