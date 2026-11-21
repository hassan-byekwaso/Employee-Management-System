require('dotenv').config();

const mongoose = require('mongoose');
const { validateEnvironment } = require('./src/config/env');
const { connectDB } = require('./utils/db');

async function start() {
  const config = validateEnvironment(process.env);
  const app = require('./src/app');
  await connectDB(config);
  const { sendMissingAttendanceReminders } = require('./src/controllers/dashboardController');
  const reminderTimer = setInterval(() => {
    sendMissingAttendanceReminders().catch((error) => {
      console.error('Scheduled attendance reminder failed:', error.message);
    });
  }, 24 * 60 * 60 * 1000);
  reminderTimer.unref();
  sendMissingAttendanceReminders().catch((error) => {
    console.error('Initial attendance reminder failed:', error.message);
  });
  const server = app.listen(config.port, () => {
    console.log(`Employee Management API listening on port ${config.port}`);
  });

  const shutdown = async (signal) => {
    console.log(`${signal} received; shutting down`);
    clearInterval(reminderTimer);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Server startup failed:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { start };
