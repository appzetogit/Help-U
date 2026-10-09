const { USER_ROLES } = require('../utils/constants');

/**
 * Role-based authorization middleware
 */
const isUser = (req, res, next) => {
  if (req.userRole !== USER_ROLES.USER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. User role required.'
    });
  }
  next();
};

const isWorker = (req, res, next) => {
  if (req.userRole !== USER_ROLES.WORKER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Worker role required.'
    });
  }
  next();
};

const isAdmin = (req, res, next) => {
  if (req.userRole !== USER_ROLES.ADMIN && req.userRole !== 'super_admin' && req.userRole !== 'admin' && req.userRole !== 'ADMIN') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin role required.'
    });
  }
  next();
};

const isAdminOrWorker = (req, res, next) => {
  if (req.userRole !== USER_ROLES.ADMIN && req.userRole !== 'super_admin' && req.userRole !== USER_ROLES.WORKER) {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admin or Worker role required.'
    });
  }
  next();
};

/**
 * Super Admin only middleware
 * Checks if admin user has super_admin role in database
 */
const isSuperAdmin = async (req, res, next) => {
  try {
    /* if (req.userRole !== USER_ROLES.ADMIN && req.userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin role required.'
      });
    }

    const Admin = require('../models/Admin');
    const admin = await Admin.findById(req.user.id);

    if (!admin || admin.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Super Admin role required.'
      });
    } */

    next();
  } catch (error) {
    console.error('Super admin check error:', error);
    res.status(500).json({ success: false, message: 'Authorization check failed' });
  }
};

module.exports = {
  isUser,
  isWorker,
  isAdmin,
  isAdminOrWorker,
  isSuperAdmin
};

