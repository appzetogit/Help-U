import api from '../../../services/api';

/**
 * Notification Service
 * Handles all notification-related API calls
 */

const BASE_URL = '/notifications';

/**
 * Get all notifications
 * @param {Object} filters - Filter options (type, read status, etc.)
 * @returns {Promise<Array>} List of notifications
 */
export const getNotifications = async (filters = {}) => {
  try {
    const params = new URLSearchParams();
    if (filters.isRead !== undefined) params.append('isRead', filters.isRead);
    if (filters.page) params.append('page', filters.page);
    if (filters.limit) params.append('limit', filters.limit);

    const response = await api.get(`${BASE_URL}/worker?${params.toString()}`);

    if (response.data.success) {
      return response.data.data.map(n => ({
        ...n,
        id: n._id,
        read: n.isRead,
        time: new Date(n.createdAt).toLocaleString()
      }));
    }
    return [];
  } catch (error) {
    console.error('Error fetching notifications:', error);
    // Fallback to empty array to prevents app crash
    return [];
  }
};

/**
 * Mark notification as read
 * @param {string} notificationId - Notification ID
 * @returns {Promise<Object>} Updated notification
 */
export const markAsRead = async (notificationId) => {
  try {
    const response = await api.put(`${BASE_URL}/${notificationId}/read`);
    if (response.data.success) {
      const n = response.data.data;
      return {
        ...n,
        id: n._id,
        read: n.isRead,
        time: new Date(n.createdAt).toLocaleString()
      };
    }
    return null;
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
};

/**
 * Mark all notifications as read
 * @returns {Promise<boolean>} Success status
 */
export const markAllAsRead = async () => {
  try {
    const response = await api.put(`${BASE_URL}/read-all`);
    return response.data.success;
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
};

/**
 * Delete notification
 * @param {string} notificationId - Notification ID
 * @returns {Promise<boolean>} Success status
 */
export const deleteNotification = async (notificationId) => {
  try {
    const response = await api.delete(`${BASE_URL}/${notificationId}`);
    return response.data.success;
  } catch (error) {
    console.error('Error deleting notification:', error);
    throw error;
  }
};

/**
 * Delete all notifications
 * @returns {Promise<boolean>} Success status
 */
export const deleteAllNotifications = async () => {
  try {
    const response = await api.delete(`${BASE_URL}/delete-all`);
    return response.data.success;
  } catch (error) {
    console.error('Error deleting all notifications:', error);
    throw error;
  }
};

/**
 * Get unread notification count
 * @returns {Promise<number>} Unread count
 */
export const getUnreadCount = async () => {
  try {
    const response = await api.get(`${BASE_URL}/worker?isRead=false&limit=1`);
    if (response.data.success) {
      return response.data.unreadCount;
    }
    return 0;
  } catch (error) {
    console.error('Error fetching unread count:', error);
    return 0;
  }
};

