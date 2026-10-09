/**
 * Booking Service
 * Handles all booking-related API calls
 * 
 * Note: This is a structure file for backend integration.
 * Replace localStorage calls with actual API endpoints.
 */

import api from '../../../services/api';

const API_BASE_URL = '/api/workers';

/**
 * Get all bookings
 * @param {Object} filters - Filter options (status, date range, etc.)
 * @returns {Promise<Array>} List of bookings
 */
export const getBookings = async (filters = {}) => {
  try {
    const response = await api.get('/workers/bookings', { params: filters });
    return response.data;
  } catch (error) {
    console.error('Error fetching bookings:', error);
    throw error;
  }
};

/**
 * Get booking by ID
 * @param {string} bookingId - Booking ID
 * @returns {Promise<Object>} Booking details
 */
export const getBookingById = async (bookingId) => {
  try {
    const response = await api.get(`/workers/bookings/${bookingId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching booking:', error);
    throw error;
  }
};

/**
 * Accept a booking
 * @param {string} bookingId - Booking ID
 * @returns {Promise<Object>} Updated booking
 */
export const acceptBooking = async (bookingId) => {
  try {
    const response = await api.post(`/workers/bookings/${bookingId}/accept`);
    return response.data;
  } catch (error) {
    console.error('Error accepting booking:', error);
    throw error;
  }
};

/**
 * Reject a booking
 * @param {string} bookingId - Booking ID
 * @param {string} reason - Rejection reason
 * @returns {Promise<Object>} Updated booking
 */
export const rejectBooking = async (bookingId, reason = '') => {
  try {
    const response = await api.post(`/workers/bookings/${bookingId}/reject`, { reason });
    return response.data;
  } catch (error) {
    console.error('Error rejecting booking:', error);
    throw error;
  }
};

/**
 * Update booking status
 * @param {string} bookingId - Booking ID
 * @param {string} status - New status
 * @param {Object} data - Additional data (images, notes, etc.)
 * @returns {Promise<Object>} Updated booking
 */
export const updateBookingStatus = async (bookingId, status, data = {}) => {
  try {
    const response = await api.put(`/workers/bookings/${bookingId}/status`, { status, ...data });
    return response.data;
  } catch (error) {
    console.error('Error updating booking status:', error);
    throw error;
  }
};

/**
 * Start Self Job (Worker)
 */
export const startSelfJob = async (bookingId) => {
  const response = await api.post(`/workers/bookings/${bookingId}/self/start`);
  return response.data;
};

/**
 * Notify Reached (Worker)
 */
export const workerReached = async (bookingId) => {
  const response = await api.post(`/workers/bookings/${bookingId}/self/reached`);
  return response.data;
};

/**
 * Verify Self Visit (Worker)
 */
export const verifySelfVisit = async (bookingId, otp, location) => {
  const response = await api.post(`/workers/bookings/${bookingId}/self/visit/verify`, { otp, location });
  return response.data;
};

/**
 * Complete Self Job (Worker)
 */
export const completeSelfJob = async (bookingId, data) => {
  const response = await api.post(`/workers/bookings/${bookingId}/self/complete`, data);
  return response.data;
};

/**
 * Collect Self Cash (Worker)
 */
export const collectSelfCash = async (bookingId, otp, amount) => {
  const response = await api.post(`/workers/bookings/${bookingId}/self/payment/collect`, { otp, amount });
  return response.data;
};

/**
 * Request advance payment from customer
 */
export const requestAdvancePayment = async (bookingId, data) => {
  const response = await api.post(`/workers/bookings/${bookingId}/advance-payment-request`, data);
  return response.data;
};

/**
 * Get pending booking alerts
 * @returns {Promise<Array>} List of pending bookings
 */
export const getPendingAlerts = async () => {
  try {
    // TODO: Replace with actual API call
    // const response = await fetch(`${API_BASE_URL}/bookings/pending`);
    // return await response.json();

    // Mock implementation
    const pending = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
    return pending;
  } catch (error) {
    console.error('Error fetching pending alerts:', error);
    throw error;
  }
};

/**
 * Get worker ratings and reviews
 */
export const getRatings = async (params = {}) => {
  try {
    const response = await api.get('/workers/bookings/ratings', { params });
    return response.data;
  } catch (error) {
    console.error('Error fetching ratings:', error);
    throw error;
  }
};
