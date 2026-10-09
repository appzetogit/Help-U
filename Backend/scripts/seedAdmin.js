const dotenv = require('dotenv');
const connectDB = require('../config/db');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');

dotenv.config();

const seedAdmin = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await connectDB();
    console.log('✅ Connected to MongoDB\n');

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin@appzeto.com' });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists! Resetting password...');
      existingAdmin.password = 'admin123';
      existingAdmin.role = 'super_admin';
      existingAdmin.isActive = true;
      await existingAdmin.save();
      console.log('✅ Admin password reset to: admin123\n');
      return;
    }

    // Create admin user
    const adminData = {
      name: 'Super Admin',
      email: 'admin@appzeto.com',
      password: 'admin123', // Plain text, let model pre-save hook hash it
      role: 'super_admin',
      isActive: true,
      permissions: {
        users: { read: true, write: true, delete: true },
        workers: { read: true, write: true, delete: true },
        bookings: { read: true, write: true, delete: true },
        payments: { read: true, write: true, delete: true },
        categories: { read: true, write: true, delete: true },
        services: { read: true, write: true, delete: true },
        homeContent: { read: true, write: true, delete: true },
        notifications: { read: true, write: true, delete: true },
        reports: { read: true, write: true, delete: true },
        settings: { read: true, write: true, delete: true }
      }
    };

    const admin = await Admin.create(adminData);
    console.log('✅ Admin user created successfully!');
    console.log('📧 Email: admin@appzeto.com');
    console.log('🔑 Password: admin123');
    console.log('🌐 Login URL: http://localhost:5173/admin/login\n');

    console.log('🔒 Important: Change the default password after first login!\n');

  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  } finally {
    // Close database connection
    const mongoose = require('mongoose');
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Run seed script
seedAdmin();





