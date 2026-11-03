import api from './api';

export const adminBookingService = {
  // Get all bookings with filters and search
  getAllBookings: async (params) => {
    try {
      const response = await api.get('/admin/bookings', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch bookings' };
    }
  },

  // Get booking details by ID
  getBookingById: async (id) => {
    try {
      const response = await api.get(`/admin/bookings/${id}`);
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch booking details' };
    }
  },

  // Get booking analytics
  getAnalytics: async (filters = {}) => {
    try {
      const response = await api.get('/admin/bookings/analytics', { params: filters });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch analytics' };
    }
  },

  // Bookings no professional could be found for automatically (waiting for a manual assignment)
  getUnassignedBookings: async (params = {}) => {
    try {
      const response = await api.get('/admin/bookings/unassigned', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to fetch unassigned bookings' };
    }
  },

  // Professionals with the right skill for a booking (in-zone first)
  getAssignableWorkers: async (id, search = '') => {
    try {
      const response = await api.get(`/admin/bookings/${id}/assignable-workers`, { params: { search } });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to load professionals' };
    }
  },

  // Send the booking to the chosen professional as a normal request
  assignBooking: async (id, workerId, note = '') => {
    try {
      const response = await api.post(`/admin/bookings/${id}/assign`, { workerId, note });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to assign the booking' };
    }
  },

  // Booking notification feed (new bookings, cancellations, completions, payments, refunds, bookings needing a professional)
  getBookingNotifications: async (params = {}) => {
    try {
      const response = await api.get('/admin/bookings/notifications', { params });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to load booking notifications' };
    }
  },

  markBookingNotificationsRead: async () => {
    try {
      const response = await api.post('/admin/bookings/notifications/read');
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to update booking notifications' };
    }
  },

  // Cancel booking
  cancelBooking: async (id, reason) => {
    try {
      const response = await api.post(`/admin/bookings/${id}/cancel`, { cancellationReason: reason });
      return response.data;
    } catch (error) {
      throw error.response?.data || { message: 'Failed to cancel booking' };
    }
  }
};
