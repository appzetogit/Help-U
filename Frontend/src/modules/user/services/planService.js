import api from '../../../services/api';

export const getPlans = async () => {
  try {
    const response = await api.get('/public/plans');
    return response.data;
  } catch (error) {
    console.error('Error fetching plans:', error);
    throw error;
  }
};

export default { getPlans };
