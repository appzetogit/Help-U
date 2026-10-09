import axios from 'axios';
import { apiCache } from '../utils/apiCache';

// API Base URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  },
  withCredentials: true // For cookies
});

// Helper to get token keys based on role/path
const getTokenKeys = (url) => {
  // 1. Prioritize current page context for role-based tokens
  if (window.location.pathname.startsWith('/admin')) {
    return { access: 'adminAccessToken', refresh: 'adminRefreshToken', role: 'admin' };
  }
  if (window.location.pathname.startsWith('/worker') || window.location.pathname.startsWith('/vendor')) {
    return { access: 'workerAccessToken', refresh: 'workerRefreshToken', role: 'worker' };
  }

  // 2. Explicitly detect auth routes regardless of current page (for cross-role login/actions)
  if (url?.includes('/admin/auth')) return { access: 'adminAccessToken', refresh: 'adminRefreshToken', role: 'admin' };
  if (url?.includes('/workers/auth')) return { access: 'workerAccessToken', refresh: 'workerRefreshToken', role: 'worker' };

  // 3. Fallback to user token (most common case for user app)
  return { access: 'accessToken', refresh: 'refreshToken', role: 'user' };
};

// Request interceptor - Add auth token
api.interceptors.request.use(
  (config) => {
    const { access } = getTokenKeys(config.url);
    const token = sessionStorage.getItem(access) || localStorage.getItem(access);

    // For debugging
    // console.log(`Request to ${config.url}, using token key: ${access}, token exists: ${!!token}`);

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Track if we're currently refreshing
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor - Handle token refresh
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // If error is 401, we haven't tried to refresh yet, and it's NOT a login request
    if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url.includes('/login')) {
      if (isRefreshing) {
        // If already refreshing, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const { access, refresh, role } = getTokenKeys(originalRequest.url);
      const refreshToken = sessionStorage.getItem(refresh) || localStorage.getItem(refresh);

      if (!refreshToken) {
        // No refresh token, logout
        isRefreshing = false;
        handleLogout(role);
        return Promise.reject(error);
      }

      try {
        // Determine correct refresh endpoint based on current path
        let refreshEndpoint = '/users/auth/refresh-token'; // Default to user
        if (role === 'worker') refreshEndpoint = '/workers/auth/refresh-token';
        else if (role === 'admin') refreshEndpoint = '/admin/auth/refresh-token';

        // Try to refresh the token
        const response = await axios.post(`${API_BASE_URL}${refreshEndpoint}`, {
          refreshToken
        });

        const { accessToken } = response.data;

        // Save new access token - Try session first, then local (update where it was found)
        if (sessionStorage.getItem(access)) {
          sessionStorage.setItem(access, accessToken);
        } else {
          localStorage.setItem(access, accessToken);
        }

        // Update authorization header
        api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        // Process queued requests
        processQueue(null, accessToken);
        isRefreshing = false;

        // Retry original request
        return api(originalRequest);
      } catch (refreshError) {
        console.error('RefreshToken failed:', refreshError);
        // Refresh failed, logout
        processQueue(refreshError, null);
        isRefreshing = false;
        handleLogout(role);
        return Promise.reject(refreshError);
      }
    }

    // Handle 403 Forbidden - Role mismatch or Invalid Token
    if (error.response?.status === 403) {
      console.error('Access Denied (403):', error.response.data.message);
      // Removed automatic logout to prevent login loops during debugging
    }

    // Maintenance mode turned on mid-session. Tell ConfigProvider to re-read the
    // public config so the maintenance screen appears without a manual reload.
    if (
      error.response?.status === 503 &&
      error.response?.data?.code === 'UNDER_MAINTENANCE'
    ) {
      window.dispatchEvent(new Event('systemConfigUpdated'));
    }

    return Promise.reject(error);
  }
);

// Handle logout
export const handleLogout = (role = null) => {
  if (!role) {
    // Determine role from path if not provided
    const path = window.location.pathname;
    if (path.startsWith('/admin')) role = 'admin';
    else if (path.startsWith('/worker') || path.startsWith('/vendor')) role = 'worker';
    else role = 'user';
  }

  // Clear role-specific tokens selectively
  const clearTokens = (prefix) => {
    // Clear both sessionStorage and localStorage to prevent state mismatch
    sessionStorage.removeItem(`${prefix}AccessToken`);
    sessionStorage.removeItem(`${prefix}RefreshToken`);
    sessionStorage.removeItem(`${prefix}Data`);

    localStorage.removeItem(`${prefix}AccessToken`);
    localStorage.removeItem(`${prefix}RefreshToken`);
    localStorage.removeItem(`${prefix}Data`);
  };

  if (role === 'worker') {
    clearTokens('worker');
    if (window.location.pathname !== '/worker/login' && window.location.pathname !== '/vendor/login') {
      window.location.href = '/worker/login';
    }
  } else if (role === 'admin') {
    clearTokens('admin');
    if (window.location.pathname !== '/admin/login') {
      window.location.href = '/admin/login';
    }
  } else {
    // User
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('userData');
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    sessionStorage.removeItem('userData');
    if (!window.location.pathname.includes('/login')) {
      window.location.href = '/user/login';
    }
  }
};

export { apiCache };
export default api;
