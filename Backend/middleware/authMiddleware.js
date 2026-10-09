const { verifyAccessToken } = require('../utils/tokenService');
const User = require('../models/User');
const Worker = require('../models/Worker');
const Admin = require('../models/Admin');
const { USER_ROLES } = require('../utils/constants');

/**
 * Authentication middleware - verifies JWT token
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. Please login.'
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = verifyAccessToken(token);
      // console.log('Decoded Token:', decoded); // Debug
    } catch (error) {
      console.error('Token verification failed:', error.message);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token. Please login again.'
      });
    }

    // Get user based on role
    let user;
    // console.log('Role from token:', decoded.role); // Debug
    switch (decoded.role) {
      case USER_ROLES.USER:
        user = await User.findById(decoded.userId).select('-password').lean();
        // SINGLE DEVICE LOGOUT Logic
        if (user && user.loginSessionId && decoded.loginSessionId && user.loginSessionId !== decoded.loginSessionId) {
          return res.status(401).json({ success: false, message: 'Account logged in on another device. Please login again.' });
        }
        break;
      case USER_ROLES.WORKER:
        user = await Worker.findById(decoded.userId).select('-password').lean();
        if (user && user.approvalStatus !== 'approved') {
          return res.status(403).json({
            success: false,
            message: 'Your worker account is pending approval or has been rejected.'
          });
        }

        // SINGLE DEVICE LOGOUT Logic: Check if token's session ID matches DB
        if (user && user.loginSessionId && decoded.loginSessionId && user.loginSessionId !== decoded.loginSessionId) {
          return res.status(401).json({
            success: false,
            message: 'Account logged in on another device. Please login again.'
          });
        }
        break;
      case USER_ROLES.ADMIN:
      case 'super_admin':
      case 'admin':
      case 'ADMIN':
        user = await Admin.findById(decoded.userId).select('-password').lean();
        break;
      default:
        console.error('Role mismatch in middleware:', decoded.role);
        return res.status(401).json({
          success: false,
          message: 'Invalid user role.'
        });
    }

    if (!user) {
      console.error('User not found for ID:', decoded.userId);
      return res.status(401).json({
        success: false,
        message: 'User not found. Please login again.'
      });
    }

    // Attach user to request
    // NOTE: .lean() removes the virtual .id getter — restore it manually
    req.user = { ...user, id: user._id.toString() };
    req.userId = decoded.userId;
    req.userRole = decoded.role;

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error. Please try again.'
    });
  }
};

module.exports = { authenticate };

