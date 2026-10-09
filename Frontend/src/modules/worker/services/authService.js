import api from '../../../services/api';
import { registerFCMToken } from '../../../services/pushNotificationService';

/**
 * Notify Flutter WebView about successful login
 * This directly calls Flutter's captureLoginResponse handler
 * @param {object} responseData - The login response data containing accessToken and worker info
 */
function notifyFlutterLogin(responseData) {
  try {
    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      console.log('[WORKER AUTH] Notifying Flutter about login with verify-login response');
      window.flutter_inappwebview.callHandler('captureLoginResponse', JSON.stringify({
        url: '/auth/verify-login',
        body: responseData
      }));
    }
  } catch (e) {
    console.error('[WORKER AUTH] Error notifying Flutter:', e);
  }
}

/**
 * Send OTP for worker authentication
 * @param {string} phone - Phone number
 * @returns {Promise<Object>} OTP response with token
 */
export const sendOTP = async (phone) => {
  try {
    const response = await api.post('/workers/auth/send-otp', { phone });
    return response.data;
  } catch (error) {
    console.error('Error sending OTP:', error);
    throw error;
  }
};

/**
 * Verify Login (Unified Flow)
 */
export const verifyLogin = async (data) => {
  try {
    const response = await api.post('/workers/auth/verify-login', data);

    // Check if worker is pending approval
    const isPending = response.data.worker?.adminApproval?.toLowerCase() === 'pending';

    if (response.data.success && !response.data.isNewUser && response.data.accessToken && !isPending) {
      localStorage.setItem('workerAccessToken', response.data.accessToken);
      localStorage.setItem('workerRefreshToken', response.data.refreshToken);
      localStorage.setItem('workerData', JSON.stringify(response.data.worker));

      // Notify Flutter about the login for mobile app FCM token handling
      notifyFlutterLogin(response.data);

      // Register FCM token after successful login
      console.log('[WORKER AUTH] Worker login successful via verify-login, registering FCM token...');
      registerFCMToken('worker', true).catch(err => {
        console.error('[WORKER AUTH] FCM token registration failed:', err);
      });
    }
    return response.data;
  } catch (error) {
    console.error('Error verifying login:', error);
    throw error;
  }
};

/**
 * Login worker with OTP
 * @param {Object} credentials - Login credentials (phone, otp, token)
 * @returns {Promise<Object>} Auth response with token and worker data
 */
export const login = async (credentials) => {
  try {
    const response = await api.post('/workers/auth/login', credentials);

    // Store tokens in localStorage
    if (response.data.success && response.data.accessToken) {
      localStorage.setItem('workerAccessToken', response.data.accessToken);
      localStorage.setItem('workerRefreshToken', response.data.refreshToken);
      localStorage.setItem('workerData', JSON.stringify(response.data.worker));
    }

    return response.data;
  } catch (error) {
    console.error('Error logging in:', error);
    throw error;
  }
};

/**
 * Logout worker
 * @returns {Promise<boolean>} Success status
 */
export const logout = async () => {
  try {
    const response = await api.post('/workers/auth/logout');

    // Clear tokens
    localStorage.removeItem('workerAccessToken');
    localStorage.removeItem('workerRefreshToken');
    localStorage.removeItem('workerData');

    return response.data;
  } catch (error) {
    console.error('Error logging out:', error);
    // Clear tokens anyway
    localStorage.removeItem('workerAccessToken');
    localStorage.removeItem('workerRefreshToken');
    localStorage.removeItem('workerData');
    throw error;
  }
};

/**
 * Register new worker
 * @param {Object} workerData - Worker registration data
 * @returns {Promise<Object>} Auth response with token and user data
 */
export const register = async (workerData) => {
  try {
    console.log('Calling worker register API with data:', workerData);
    const response = await api.post('/workers/auth/register', workerData);
    console.log('Worker register API response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error registering worker:', error);
    throw error;
  }
};

/**
 * Get current worker profile
 * @returns {Promise<Object>} Worker profile
 */
export const getCurrentWorker = async () => {
  try {
    // TODO: Replace with actual API call
    // const response = await fetch(`${API_BASE_URL}/auth/me`, {
    //   headers: {
    //     'Authorization': `Bearer ${localStorage.getItem('workerToken')}`,
    //   },
    // });
    // return await response.json();

    // Mock implementation
    const profile = JSON.parse(localStorage.getItem('workerProfile') || '{}');
    return profile;
  } catch (error) {
    console.error('Error fetching current worker:', error);
    throw error;
  }
};

/**
 * Update worker profile
 * @param {Object} profileData - Updated profile data
 * @returns {Promise<Object>} Updated worker profile
 */
export const updateProfile = async (profileData) => {
  try {
    // TODO: Replace with actual API call
    // const response = await fetch(`${API_BASE_URL}/auth/profile`, {
    //   method: 'PUT',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${localStorage.getItem('workerToken')}`,
    //   },
    //   body: JSON.stringify(profileData),
    // });
    // return await response.json();

    // Mock implementation
    const existing = JSON.parse(localStorage.getItem('workerProfile') || '{}');
    const updated = { ...existing, ...profileData, updatedAt: new Date().toISOString() };
    localStorage.setItem('workerProfile', JSON.stringify(updated));
    return updated;
  } catch (error) {
    console.error('Error updating profile:', error);
    throw error;
  }
};

/**
 * Change password
 * @param {Object} passwordData - Current and new password
 * @returns {Promise<boolean>} Success status
 */
export const changePassword = async (passwordData) => {
  try {
    // TODO: Replace with actual API call
    // const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     'Authorization': `Bearer ${localStorage.getItem('workerToken')}`,
    //   },
    //   body: JSON.stringify(passwordData),
    // });
    // return await response.json();

    // Mock implementation
    return { success: true };
  } catch (error) {
    console.error('Error changing password:', error);
    throw error;
  }
};

/**
 * Request password reset
 * @param {string} email - Worker email
 * @returns {Promise<boolean>} Success status
 */
export const requestPasswordReset = async (email) => {
  try {
    // TODO: Replace with actual API call
    // const response = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ email }),
    // });
    // return await response.json();

    // Mock implementation
    return { success: true, message: 'Password reset email sent' };
  } catch (error) {
    console.error('Error requesting password reset:', error);
    throw error;
  }
};

/**
 * Verify token validity
 * @returns {Promise<boolean>} Token validity
 */
export const verifyToken = async () => {
  try {
    // TODO: Replace with actual API call
    // const token = localStorage.getItem('workerToken');
    // if (!token) return false;
    // 
    // const response = await fetch(`${API_BASE_URL}/auth/verify`, {
    //   headers: {
    //     'Authorization': `Bearer ${token}`,
    //   },
    // });
    // return response.ok;

    // Mock implementation
    return !!localStorage.getItem('workerToken');
  } catch (error) {
    console.error('Error verifying token:', error);
    return false;
  }
};

