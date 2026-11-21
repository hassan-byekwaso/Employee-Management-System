const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { validateEnvironment } = require('./config/env');
const { authenticate, requireEmployeeAccess } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errors');
const authRoutes = require('./routes/auth');
const resourceRoutes = require('./routes/resources');
const dashboardRoutes = require('./routes/dashboard');

function createApp() {
  const config = validateEnvironment(process.env);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });
    next();
  });
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.origins.includes(origin)) return callback(null, true);
      const error = new Error('Origin is not allowed by CORS');
      error.statusCode = 403;
      callback(error);
    }
  }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use((req, res, next) => {
    if (req.body === undefined) req.body = {};
    next();
  });
  app.use(cookieParser());

  app.get('/api/health', (req, res) => res.json({ success: true, status: 'ok' }));
  app.use('/api/auth', authRoutes);
  app.use('/api', authenticate);
  app.use('/api/dashboard', requireEmployeeAccess, dashboardRoutes);
  app.use('/api', resourceRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = createApp();
module.exports.createApp = createApp;
