import api from './api';

/**
 * Payment Service
 * Handles all API calls for Payments
 */

export const paymentService = {
  // Create Razorpay order for booking payment
  createOrder: async (bookingId, paymentType = 'final') => {
    const response = await api.post('/payments/create-order', { bookingId, paymentType });
    return response.data;
  },

  // Verify payment (webhook handler)
  verifyPayment: async (paymentData) => {
    const response = await api.post('/payments/verify', paymentData);
    return response.data;
  },

  // Process wallet payment
  processWalletPayment: async (bookingId, paymentType = 'final') => {
    const response = await api.post('/payments/wallet', { bookingId, paymentType });
    return response.data;
  },

  // Process refund
  processRefund: async (bookingId, amount = null) => {
    const response = await api.post('/payments/refund', { bookingId, amount });
    return response.data;
  },

  // Get payment history
  getPaymentHistory: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/payments/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  },

  // Confirm Pay at Home option
  confirmPayAtHome: async (bookingId) => {
    const response = await api.post('/payments/pay-at-home', { bookingId });
    return response.data;
  }
};

export default paymentService;
