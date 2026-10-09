/**
 * Delete all notifications for the current user
 */
const deleteAllNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Build query based on user role to ensure they only delete their own notifications
    let query = {};
    if (userRole === 'USER') query.userId = userId;
    else if (userRole === 'WORKER') query.vendorId = userId;
    else if (userRole === 'ADMIN') query.adminId = userId;
    else {
      // Safety fallback: if role is unknown, do not delete anything
      return res.status(403).json({
        success: false,
        message: 'Invalid user role'
      });
    }

    const result = await Notification.deleteMany(query);

    res.status(200).json({
      success: true,
      message: 'All notifications deleted successfully',
      count: result.deletedCount
    });
  } catch (error) {
    console.error('Delete all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete all notifications. Please try again.'
    });
  }
};
