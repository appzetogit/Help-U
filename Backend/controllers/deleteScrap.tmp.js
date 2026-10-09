// Helper to get user type for notifications
const getUserTypeStr = (role) => {
  if (!role) return 'User';
  role = role.toLowerCase();
  if (role === 'admin' || role === 'super_admin') return 'Admin';
  if (role === 'worker') return 'Partner'; // 'Worker' is internal, 'Partner' is user-facing
  return 'User';
};

// ... existing imports ...

// Delete scrap item
exports.deleteScrap = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const userRole = req.user.role; // e.g., 'ADMIN', 'USER'

    const scrap = await Scrap.findById(id);
    if (!scrap) return res.status(404).json({ success: false, message: 'Scrap item not found' });

    // Authorization check
    // Allow deletion if:
    // 1. User is the creator of the scrap item
    // 2. User is an Admin
    const isOwner = scrap.userId.toString() === userId;
    const isAdmin = ['ADMIN', 'admin', 'super_admin'].includes(userRole);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this item' });
    }

    await Scrap.findByIdAndDelete(id);

    // If Admin deleted a user's item, notify the user? 
    // Maybe simpler to just delete for now.

    res.json({ success: true, message: 'Scrap item deleted successfully' });
  } catch (error) {
    console.error('Delete scrap error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
