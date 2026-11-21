const mongoose = require('mongoose');
const { validateEnvironment } = require('../src/config/env');

async function connectDB(config = validateEnvironment(process.env)) {
  try {
    await mongoose.connect(config.mongoUri);
    console.log('MongoDB connection established');
    return mongoose.connection;
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    throw error;
  }
}

module.exports = { connectDB };
