import api from '../../../services/api';

/**
 * Worker Dashboard Service
 * Handles all dashboard-related API calls
 */
export const workerDashboardService = {
  /**
   * Get worker dashboard statistics
   * @returns {Promise<Object>} Dashboard stats and recent bookings
   */
  getDashboardStats: async () => {
    try {
      const response = await api.get('/workers/dashboard/stats');
      return response.data;
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  },

  /**
   * Get revenue analytics
   * @param {string} period - 'daily', 'weekly', or 'monthly'
   * @returns {Promise<Object>} Revenue analytics data
   */
  getRevenueAnalytics: async (period = 'monthly') => {
    try {
      const response = await api.get(`/workers/dashboard/revenue?period=${period}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching revenue analytics:', error);
      throw error;
    }
  },


  /**
   * Get service performance metrics
   * @returns {Promise<Object>} Service performance data
   */
  getServicePerformance: async () => {
    try {
      const response = await api.get('/workers/dashboard/services');
      return response.data;
    } catch (error) {
      console.error('Error fetching service performance:', error);
      throw error;
    }
  }
};
