import api from './api';

/**
 * Cart Service - Backend API Based
 * All cart data stored in database
 */

export const cartService = {
  // Get user's cart
  getCart: async () => {
    const response = await api.get('/users/cart');
    return response.data;
  },

  // Add item to cart
  addToCart: async (itemData) => {
    const response = await api.post('/users/cart', itemData);
    return response.data;
  },

  // Update cart item quantity
  updateItem: async (itemId, serviceCount) => {
    const response = await api.put(`/users/cart/${itemId}`, { serviceCount });
    return response.data;
  },

  // Remove item from cart
  removeItem: async (itemId) => {
    const response = await api.delete(`/users/cart/${itemId}`);
    return response.data;
  },

  // Remove all items from a category
  removeCategoryItems: async (category) => {
    const response = await api.delete(`/users/cart/category/${encodeURIComponent(category)}`);
    return response.data;
  },

  // Clear entire cart
  clearCart: async () => {
    const response = await api.delete('/users/cart');
    return response.data;
  }
};

export default cartService;
