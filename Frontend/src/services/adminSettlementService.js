import api from './api';

/**
 * Admin Settlement Service
 * Manages worker settlements from admin perspective
 */
const adminSettlementService = {
  /**
   * Get settlement dashboard summary
   */
  getDashboard: async () => {
    const response = await api.get('/admin/settlements/dashboard');
    return response.data;
  },

  /**
   * Get all workers with their wallet balances
   */
  getWorkerBalances: async (params = {}) => {
    const response = await api.get('/admin/settlements/workers', { params });
    return response.data;
  },

  /**
   * Get specific worker's ledger/transactions
   */
  getWorkerLedger: async (vendorId, params = {}) => {
    const response = await api.get(`/admin/settlements/workers/${vendorId}/ledger`, { params });
    return response.data;
  },

  /**
   * Get all pending settlement requests
   */
  getPendingSettlements: async (params = {}) => {
    const response = await api.get('/admin/settlements/pending', { params });
    return response.data;
  },

  /**
   * Get settlement history
   */
  getSettlementHistory: async (params = {}) => {
    const response = await api.get('/admin/settlements/history', { params });
    return response.data;
  },

  /**
   * Approve a settlement request
   */
  approveSettlement: async (settlementId, adminNotes = '') => {
    const response = await api.post(`/admin/settlements/${settlementId}/approve`, {
      adminNotes
    });
    return response.data;
  },

  /**
   * Reject a settlement request
   */
  rejectSettlement: async (settlementId, rejectionReason) => {
    const response = await api.post(`/admin/settlements/${settlementId}/reject`, {
      rejectionReason
    });
    return response.data;
  },

  /**
   * Block a worker manually
   */
  blockWorker: async (vendorId, reason = '') => {
    const response = await api.post(`/admin/settlements/workers/${vendorId}/block`, { reason });
    return response.data;
  },

  /**
   * Unblock a worker
   */
  unblockWorker: async (vendorId) => {
    const response = await api.post(`/admin/settlements/workers/${vendorId}/unblock`);
    return response.data;
  },

  /**
   * Update worker cash collection limit
   */
  updateCashLimit: async (vendorId, limit) => {
    const response = await api.post(`/admin/settlements/workers/${vendorId}/cash-limit`, { limit });
    return response.data;
  },

  /**
   * Get withdrawal requests
   */
  getWithdrawalRequests: async (params = {}) => {
    const response = await api.get('/admin/settlements/withdrawals', { params });
    return response.data;
  },

  /**
   * Approve a withdrawal
   */
  approveWithdrawal: async (withdrawalId, data) => {
    const response = await api.post(`/admin/settlements/withdrawals/${withdrawalId}/approve`, data);
    return response.data;
  },

  /**
   * Reject a withdrawal
   */
  rejectWithdrawal: async (withdrawalId, rejectionReason) => {
    const response = await api.post(`/admin/settlements/withdrawals/${withdrawalId}/reject`, { rejectionReason });
    return response.data;
  }
};

export default adminSettlementService;
