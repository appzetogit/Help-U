const dns = require('node:dns');
const mongoose = require('mongoose');

const configureDnsForMongoSrv = (mongoUri) => {
  if (!mongoUri || !mongoUri.startsWith('mongodb+srv://')) {
    return;
  }

  try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    console.log('Using custom DNS servers for MongoDB SRV lookup');
  } catch (error) {
    console.warn('Failed to configure custom DNS servers:', error.message);
  }
};

/**
 * Connect to MongoDB
 */
const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 8000
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (initialError) {
    console.warn(`Initial MongoDB connection failed (${initialError.message}). Retrying with alternate DNS lookup...`);
    try {
      if (mongoUri.startsWith('mongodb+srv://')) {
        dns.setServers(['8.8.8.8', '1.1.1.1']);
      }
      const conn = await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 10000
      });
      console.log(`MongoDB Connected (via DNS fallback): ${conn.connection.host}`);
    } catch (fallbackError) {
      console.error('MongoDB connection error:', fallbackError.message);
      process.exit(1);
    }
  }
};

module.exports = connectDB;

