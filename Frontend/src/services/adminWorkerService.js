import api from './api';

const adminWorkerService = {
  /**
   * Get all workers with optional filters
   */
  getAllWorkers: async (params = {}) => {
    const response = await api.get('/admin/workers', { params });
    return response.data;
  },

  /**
   * Get specific worker details
   */
  getWorkerDetails: async (id) => {
    const response = await api.get(`/admin/workers/${id}`);
    return response.data;
  },

  /**
   * Approve worker registration
   */
  approveWorker: async (id) => {
    const response = await api.post(`/admin/workers/${id}/approve`);
    return response.data;
  },

  /**
   * Reject worker registration
   */
  rejectWorker: async (id, reason) => {
    const response = await api.post(`/admin/workers/${id}/reject`, { reason });
    return response.data;
  },

  /**
   * Suspend worker
   */
  suspendWorker: async (id) => {
    const response = await api.post(`/admin/workers/${id}/suspend`);
    return response.data;
  },

  /**
   * Toggle worker active status
   */
  toggleStatus: async (id, isActive) => {
    const response = await api.patch(`/admin/workers/${id}/status`, { isActive });
    return response.data;
  },

  /**
   * Delete worker
   */
  deleteWorker: async (id) => {
    const response = await api.delete(`/admin/workers/${id}`);
    return response.data;
  },

  /**
   * Get bookings for a specific worker
   */
  getWorkerBookings: async (id, params = {}) => {
    const response = await api.get(`/admin/workers/${id}/bookings`, { params });
    return response.data;
  },

  /**
   * Get all worker bookings (across all workers)
   */
  getAllBookings: async (params = {}) => {
    const response = await api.get('/admin/workers/bookings', { params });
    return response.data;
  },

  /**
   * Get worker earnings and analytics
   */
  getWorkerEarnings: async (id, params = {}) => {
    const response = await api.get(`/admin/workers/${id}/earnings`, { params });
    return response.data;
  },

  /**
   * Get worker payments summary
   */
  getWorkerPayments: async (params = {}) => {
    const response = await api.get('/admin/workers/payments', { params });
    return response.data;
  },

  /**
   * Get worker report/analytics (reusing report endpoint if needed, or separate)
   */
  getWorkerAnalytics: async (params = {}) => {
    const response = await api.get('/admin/reports/workers', { params });
    return response.data;
  }
};

export default adminWorkerService;
