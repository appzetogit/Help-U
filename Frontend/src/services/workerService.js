import api from './api';

const workerService = {
  // Get worker profile
  getProfile: async () => {
    const response = await api.get('/workers/profile');
    return response.data;
  },

  // Update worker profile
  updateProfile: async (profileData) => {
    const response = await api.put('/workers/profile', profileData);
    return response.data;
  },

  // Update worker address
  updateAddress: async (addressData) => {
    const response = await api.put('/workers/address', addressData);
    return response.data;
  },

  // Update real-time location
  updateLocation: async (lat, lng) => {
    return api.put('/workers/profile/location', { lat, lng });
  },

  // Get dashboard stats
  getDashboardStats: async () => {
    const response = await api.get('/workers/dashboard/stats');
    return response.data;
  },

  // Get revenue analytics
  getRevenueAnalytics: async (period) => {
    const response = await api.get(`/workers/dashboard/revenue?period=${period}`);
    return response.data;
  }
};

export default workerService;
