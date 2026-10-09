import api from './api';
import { registerFCMToken, removeFCMToken } from './pushNotificationService';

/**
 * Notify Flutter WebView about successful login
 * This directly calls Flutter's captureLoginResponse handler
 * @param {object} responseData - The login response data containing accessToken and user/worker info
 */
function notifyFlutterLogin(responseData) {
  try {
    if (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) {
      window.flutter_inappwebview.callHandler('captureLoginResponse', JSON.stringify({
        url: '/auth/login',
        body: responseData
      }));
    }
  } catch (e) {
    console.error('[AUTH] Error notifying Flutter:', e);
  }
}

/**
 * Get the current platform type (web or mobile)
 * @returns {'web' | 'mobile'}
 */
function getPlatformType() {
  return (window.flutter_inappwebview && window.flutter_inappwebview.callHandler) ? 'mobile' : 'web';
}

/**
 * User Authentication Service
 */
export const userAuthService = {
  // Send OTP
  sendOTP: async (phone, email = null) => {
    const response = await api.post('/users/auth/send-otp', { phone, email });
    return response.data;
  },

  // Verify Login (Unified Flow)
  verifyLogin: async (data) => {
    const response = await api.post('/users/auth/verify-login', data);
    if (response.data.success && !response.data.isNewUser && response.data.accessToken) {
      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('userData', JSON.stringify(response.data.user));
      notifyFlutterLogin(response.data);
      registerFCMToken('user', true).catch(console.error);
    }
    return response.data;
  },

  // Register
  register: async (data) => {
    const response = await api.post('/users/auth/register', data);
    if (response.data.accessToken) {
      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('userData', JSON.stringify(response.data.user));
      notifyFlutterLogin(response.data);
      registerFCMToken('user', true).catch(console.error);
    }
    return response.data;
  },

  // Login
  login: async (data) => {
    const response = await api.post('/users/auth/login', data);
    if (response.data.accessToken) {
      localStorage.setItem('accessToken', response.data.accessToken);
      localStorage.setItem('refreshToken', response.data.refreshToken);
      localStorage.setItem('userData', JSON.stringify(response.data.user));
      notifyFlutterLogin(response.data);
      registerFCMToken('user', true).catch(console.error);
    }
    return response.data;
  },

  // Logout
  logout: async () => {
    // Remove FCM token before logout
    await removeFCMToken('user');
    try {
      await api.post('/users/auth/logout', { platform: getPlatformType() });
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
  },

  // Get profile
  getProfile: async () => {
    const response = await api.get('/users/profile');
    if (response.data.user) {
      localStorage.setItem('userData', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  // Update profile
  updateProfile: async (data) => {
    const response = await api.put('/users/profile', data);
    if (response.data.user) {
      localStorage.setItem('userData', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  // Get checkout summary data
  getCheckoutData: async () => {
    const response = await api.get('/users/checkout-data');
    return response.data;
  }
};

/**
 * Worker Authentication Service
 */
export const workerAuthService = {
  // Send OTP
  sendOTP: async (phone, email = null) => {
    const response = await api.post('/workers/auth/send-otp', { phone, email });
    return response.data;
  },

  // Verify Login (Unified Flow)
  verifyLogin: async (data) => {
    const response = await api.post('/workers/auth/verify-login', data);
    if (response.data.success && !response.data.isNewUser && response.data.accessToken) {
      localStorage.setItem('workerAccessToken', response.data.accessToken);
      localStorage.setItem('workerRefreshToken', response.data.refreshToken);
      localStorage.setItem('workerData', JSON.stringify(response.data.worker));
      notifyFlutterLogin(response.data);
      registerFCMToken('worker', true).catch(console.error);
    }
    return response.data;
  },

  // Register
  register: async (data) => {
    const response = await api.post('/workers/auth/register', data);
    return response.data;
  },

  // Login
  login: async (data) => {
    // Remove email from login payload if present
    const { email, ...loginData } = data;
    const response = await api.post('/workers/auth/login', loginData);
    if (response.data.accessToken) {
      localStorage.setItem('workerAccessToken', response.data.accessToken);
      localStorage.setItem('workerRefreshToken', response.data.refreshToken);
      localStorage.setItem('workerData', JSON.stringify(response.data.worker));
      notifyFlutterLogin(response.data);
      // Register FCM token after successful login
      console.log('[AUTH] Worker login successful, registering FCM token...');
      try {
        const fcmToken = await registerFCMToken('worker', true);
        if (fcmToken) {
          console.log('[AUTH] ✅ Worker FCM token registered successfully');
        } else {
          console.log('[AUTH] ⚠️ Worker FCM token registration returned null');
        }
      } catch (err) {
        console.error('[AUTH] ❌ Worker FCM token registration failed:', err);
      }
    }
    return response.data;
  },

  // Logout
  logout: async () => {
    // Remove FCM token before logout
    await removeFCMToken('worker');
    try {
      await api.post('/workers/auth/logout', { platform: getPlatformType() });
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('workerAccessToken');
    localStorage.removeItem('workerRefreshToken');
    localStorage.removeItem('workerData');
  },

  // Get profile
  getProfile: async () => {
    const response = await api.get('/workers/profile');
    if (response.data.worker) {
      localStorage.setItem('workerData', JSON.stringify(response.data.worker));
    }
    return response.data;
  },

  // Update profile
  updateProfile: async (data) => {
    const response = await api.put('/workers/profile', data);
    if (response.data.worker) {
      localStorage.setItem('workerData', JSON.stringify(response.data.worker));
    }
    return response.data;
  }
};

/**
 * Admin Authentication Service
 */
export const adminAuthService = {
  // Login
  login: async (email, password, rememberMe = false) => {
    const response = await api.post('/admin/auth/login', { email, password });
    if (response.data.accessToken) {
      // Clear any session storage to prevent conflicts
      sessionStorage.removeItem('adminAccessToken');
      sessionStorage.removeItem('adminRefreshToken');
      sessionStorage.removeItem('adminData');

      // Always use localStorage for consistency
      localStorage.setItem('adminAccessToken', response.data.accessToken);
      localStorage.setItem('adminRefreshToken', response.data.refreshToken);
      localStorage.setItem('adminData', JSON.stringify(response.data.admin));
    }
    return response.data;
  },

  // Logout
  logout: async () => {
    try {
      await api.post('/admin/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('adminAccessToken');
    localStorage.removeItem('adminRefreshToken');
    localStorage.removeItem('adminData');
  }
};


