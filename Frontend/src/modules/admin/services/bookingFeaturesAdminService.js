import api from '../../../services/api';

/**
 * Admin API for the booking feature set: configuration, add-ons, commission
 * rules, disputes, recurring plans, customer referrals and booking chat.
 */
const data = (p) => p.then((r) => r.data);

export const bookingFeaturesAdminService = {
  // Booking configuration
  getConfig: () => data(api.get('/admin/booking-config')),
  updateConfig: (patch) => data(api.put('/admin/booking-config', patch)),

  // Add-ons
  listAddOns: (params) => data(api.get('/admin/addons', { params })),
  createAddOn: (body) => data(api.post('/admin/addons', body)),
  updateAddOn: (id, body) => data(api.put(`/admin/addons/${id}`, body)),
  deleteAddOn: (id) => data(api.delete(`/admin/addons/${id}`)),

  // Commission rules
  listCommissionRules: (params) => data(api.get('/admin/commission-rules', { params })),
  createCommissionRule: (body) => data(api.post('/admin/commission-rules', body)),
  updateCommissionRule: (id, body) => data(api.put(`/admin/commission-rules/${id}`, body)),
  deleteCommissionRule: (id) => data(api.delete(`/admin/commission-rules/${id}`)),
  updateCommissionDefault: (body) => data(api.put('/admin/commission-rules/default', body)),
  previewCommission: (params) => data(api.get('/admin/commission-rules/preview', { params })),

  // Disputes
  listDisputes: (params) => data(api.get('/admin/disputes', { params })),
  getDispute: (id) => data(api.get(`/admin/disputes/${id}`)),
  updateDispute: (id, body) => data(api.put(`/admin/disputes/${id}`, body)),
  postDisputeMessage: (id, body) => data(api.post(`/admin/disputes/${id}/messages`, body)),
  resolveDispute: (id, body) => data(api.post(`/admin/disputes/${id}/resolve`, body)),

  // Recurring plans
  listRecurring: (params) => data(api.get('/admin/recurring-bookings', { params })),
  updateRecurring: (id, action) => data(api.post(`/admin/recurring-bookings/${id}/${action}`)),

  // Customer referrals
  listUserReferrals: (params) => data(api.get('/admin/user-referrals', { params })),
  approveUserReferral: (id) => data(api.put(`/admin/user-referrals/${id}/approve`)),
  rejectUserReferral: (id) => data(api.put(`/admin/user-referrals/${id}/reject`)),
  updateUserReferralSettings: (body) => data(api.put('/admin/user-referrals/settings', body)),

  // Booking chat (read-only)
  getBookingChat: (bookingId) => data(api.get(`/admin/bookings/${bookingId}/chat`)),

  // Lookups for pickers
  // → { categories: [{ id, title }] }
  listCategories: () => data(api.get('/admin/categories')),
  // → { data: [worker] }
  searchWorkers: (search) => data(api.get('/admin/workers', { params: { search, limit: 20 } })),
  // → { services: [{ _id, title, categoryId }] }
  listServices: () => data(api.get('/admin/services'))
};

export default bookingFeaturesAdminService;
