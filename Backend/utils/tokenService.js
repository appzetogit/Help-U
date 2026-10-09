const jwt = require('jsonwebtoken');

/**
 * Generate access token
 * @param {Object} payload - Token payload
 * @returns {string} - JWT token
 */
const generateAccessToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d'
  });
};

/**
 * Generate refresh token
 * @param {Object} payload - Token payload
 * @returns {string} - JWT refresh token
 */
const generateRefreshToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d'
  });
};

/**
 * Generate token pair (access + refresh)
 * @param {Object} payload - Token payload
 * @returns {Object} - Token pair
 */
const generateTokenPair = (payload) => {
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload)
  };
};

/**
 * Tokens issued before the vendor -> worker rename carry role 'VENDOR'.
 * Treat them as 'WORKER' so existing worker sessions stay logged in.
 */
const normalizeLegacyRole = (decoded) => {
  if (decoded && decoded.role === 'VENDOR') decoded.role = 'WORKER';
  return decoded;
};

/**
 * Verify access token
 * @param {string} token - JWT token
 * @returns {Object} - Decoded token
 */
const verifyAccessToken = (token) => {
  return normalizeLegacyRole(jwt.verify(token, process.env.JWT_SECRET));
};

/**
 * Verify refresh token
 * @param {string} token - JWT refresh token
 * @returns {Object} - Decoded token
 */
const verifyRefreshToken = (token) => {
  return normalizeLegacyRole(jwt.verify(token, process.env.JWT_REFRESH_SECRET));
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,

  /**
   * Generate temporary verification token for signup flow
   * @param {string} phone - Verified phone number
   * @returns {string} - JWT verification token
   */
  generateVerificationToken: (phone) => {
    return jwt.sign({ phone, type: 'verification' }, process.env.JWT_SECRET, {
      expiresIn: '15m'
    });
  },

  /**
   * Verify verification token
   * @param {string} token - JWT verification token
   * @returns {string|null} - Phone number if valid, null otherwise
   */
  verifyVerificationToken: (token) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.type !== 'verification') return null;
      return decoded.phone;
    } catch (error) {
      return null;
    }
  }
};

