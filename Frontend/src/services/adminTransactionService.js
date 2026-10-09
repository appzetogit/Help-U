import api from './api';

export const adminTransactionService = {
  getAllTransactions: async (params) => {
    try {
      const response = await api.get('/admin/transactions', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  },

  getTransactionStats: async (params) => {
    try {
      const response = await api.get('/admin/transactions/stats', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching transaction stats:', error);
      throw error;
    }
  },

  // Settlement / Worker endpoints
  getWorkerBalances: async (params) => {
    try {
      const response = await api.get('/admin/settlements/workers', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching worker balances:', error);
      throw error;
    }
  },

  getSettlementDashboard: async () => {
    try {
      const response = await api.get('/admin/settlements/dashboard');
      return response.data;
    } catch (error) {
      console.error('Error fetching settlement dashboard:', error);
      throw error;
    }
  },


  // Reports
  getPaymentReports: async (params) => {
    // Re-using transactions endpoint with report-specific filters if needed
    // or we can implement specific report endpoint later
    return adminTransactionService.getAllTransactions(params);
  }
};
