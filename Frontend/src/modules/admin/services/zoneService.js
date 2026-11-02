import api from '../../../services/api';

const zoneService = {
  getAll: async (params = {}) => {
    const queryParams = new URLSearchParams();
    if (params.cityId) queryParams.append('cityId', params.cityId);
    if (params.status) queryParams.append('status', params.status);
    const qs = queryParams.toString();
    const response = await api.get(`/admin/zones${qs ? `?${qs}` : ''}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/admin/zones/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/admin/zones', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/admin/zones/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/admin/zones/${id}`);
    return response.data;
  },

  toggleStatus: async (id) => {
    const response = await api.patch(`/admin/zones/${id}/toggle-status`);
    return response.data;
  },

  // What customers see when their location is outside every active zone
  getOutOfZonePage: async () => {
    const response = await api.get('/admin/zones/out-of-zone-page');
    return response.data;
  },

  updateOutOfZonePage: async (data) => {
    const response = await api.put('/admin/zones/out-of-zone-page', data);
    return response.data;
  },

  findByPoint: async (lng, lat) => {
    const response = await api.get(`/admin/zones/lookup?lng=${lng}&lat=${lat}`);
    return response.data;
  }
};

export default zoneService;
