import api from '../../../services/api';

/**
 * Admin Worker Service
 * Handles all admin worker management API calls
 */

/**
 * Get all workers with filters and pagination
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Workers data
 */
export const getAllWorkers = async (params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.search) queryParams.append('search', params.search);
    if (params.approvalStatus) queryParams.append('approvalStatus', params.approvalStatus);
    if (params.isActive !== undefined) queryParams.append('isActive', params.isActive);
    if (params.isScrapOpted !== undefined) queryParams.append('isScrapOpted', params.isScrapOpted);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/admin/workers?${queryParams.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching workers:', error);
    throw error;
  }
};

/**
 * Get worker details by ID
 * @param {string} id - Worker ID
 * @returns {Promise<Object>} Worker details
 */
export const getWorkerDetails = async (id) => {
  try {
    const response = await api.get(`/admin/workers/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching worker details:', error);
    throw error;
  }
};

/**
 * Approve worker registration
 * @param {string} id - Worker ID
 * @returns {Promise<Object>} Approval result
 */
export const approveWorker = async (id) => {
  try {
    const response = await api.post(`/admin/workers/${id}/approve`);
    return response.data;
  } catch (error) {
    console.error('Error approving worker:', error);
    throw error;
  }
};

/**
 * Reject worker registration
 * @param {string} id - Worker ID
 * @param {string} reason - Rejection reason (optional)
 * @returns {Promise<Object>} Rejection result
 */
export const rejectWorker = async (id, reason = '') => {
  try {
    const response = await api.post(`/admin/workers/${id}/reject`, { reason });
    return response.data;
  } catch (error) {
    console.error('Error rejecting worker:', error);
    throw error;
  }
};

/**
 * Suspend worker
 * @param {string} id - Worker ID
 * @returns {Promise<Object>} Suspension result
 */
export const suspendWorker = async (id) => {
  try {
    const response = await api.post(`/admin/workers/${id}/suspend`);
    return response.data;
  } catch (error) {
    console.error('Error suspending worker:', error);
    throw error;
  }
};

/**
 * Get worker bookings
 * @param {string} id - Worker ID
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Worker bookings
 */
export const getWorkerBookings = async (id, params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.page) queryParams.append('page', params.page);
    if (params.limit) queryParams.append('limit', params.limit);

    const response = await api.get(`/admin/workers/${id}/bookings?${queryParams.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching worker bookings:', error);
    throw error;
  }
};

/**
 * Get worker earnings
 * @param {string} id - Worker ID
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} Worker earnings
 */
export const getWorkerEarnings = async (id, params = {}) => {
  try {
    const queryParams = new URLSearchParams();
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);

    const response = await api.get(`/admin/workers/${id}/earnings?${queryParams.toString()}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching worker earnings:', error);
    throw error;
  }
};

/**
 * Dynamic Partner Registration Fields & Documents API
 */
export const getPartnerRegistrationFields = async () => {
  try {
    const response = await api.get('/admin/partner-registration-fields');
    return response.data;
  } catch (error) {
    console.error('Error fetching partner registration fields:', error);
    throw error;
  }
};

export const createPartnerRegistrationField = async (data) => {
  try {
    const response = await api.post('/admin/partner-registration-fields', data);
    return response.data;
  } catch (error) {
    console.error('Error creating partner registration field:', error);
    throw error;
  }
};

export const updatePartnerRegistrationField = async (id, data) => {
  try {
    const response = await api.put(`/admin/partner-registration-fields/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Error updating partner registration field:', error);
    throw error;
  }
};

export const togglePartnerRegistrationField = async (id) => {
  try {
    const response = await api.patch(`/admin/partner-registration-fields/${id}/toggle`);
    return response.data;
  } catch (error) {
    console.error('Error toggling partner registration field:', error);
    throw error;
  }
};

export const deletePartnerRegistrationField = async (id) => {
  try {
    const response = await api.delete(`/admin/partner-registration-fields/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error deleting partner registration field:', error);
    throw error;
  }
};

export const seedDefaultPartnerRegistrationFields = async () => {
  try {
    const response = await api.post('/admin/partner-registration-fields/seed-defaults');
    return response.data;
  } catch (error) {
    console.error('Error seeding default partner registration fields:', error);
    throw error;
  }
};

export default {
  getAllWorkers,
  getWorkerDetails,
  approveWorker,
  rejectWorker,
  suspendWorker,
  getWorkerBookings,
  getWorkerEarnings,
  getPartnerRegistrationFields,
  createPartnerRegistrationField,
  updatePartnerRegistrationField,
  togglePartnerRegistrationField,
  deletePartnerRegistrationField,
  seedDefaultPartnerRegistrationFields
};

