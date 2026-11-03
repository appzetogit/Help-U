/**
 * Application Constants
 */

// User Roles
const USER_ROLES = {
  USER: 'USER',
  WORKER: 'WORKER',
  ADMIN: 'ADMIN'
};

// Admin Roles
//
// super_admin and admin already existed; the rest are scoped roles so staff can
// be given only the part of the panel they work in.
const ADMIN_ROLES = {
  SUPER_ADMIN: 'super_admin',
  ADMIN: 'admin',
  SUB_ADMIN: 'sub_admin',
  OPERATIONS_MANAGER: 'operations_manager',
  CUSTOMER_SUPPORT: 'customer_support',
  FINANCE_MANAGER: 'finance_manager',
  SERVICE_MANAGER: 'service_manager',
  WORKER_MANAGER: 'worker_manager',
  CONTENT_MANAGER: 'content_manager'
};

// Granular modules that can be individually assigned to a Sub-Admin (matches all sidebar menu items)
const ADMIN_MODULE_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard', description: 'View system dashboard, revenue & counts' },
  { key: 'users', label: 'Users', description: 'Manage users, wallets & activities' },
  { key: 'workers', label: 'Workers', description: 'Approve, manage and track workers' },
  { key: 'bookings', label: 'Bookings', description: 'Monitor live bookings, assign and cancel' },
  { key: 'disputes', label: 'Disputes', description: 'Handle user and worker tickets & disputes' },
  { key: 'recurring-bookings', label: 'Recurring Bookings', description: 'Manage recurring subscription bookings' },
  { key: 'scrap', label: 'Scrap Items', description: 'Handle scrap requests and pricing' },
  { key: 'payments', label: 'Payments', description: 'View payment overviews and transaction logs' },
  { key: 'settlements', label: 'Settlements', description: 'Process worker withdrawals and settlements' },
  { key: 'commission', label: 'Commission', description: 'Configure tier & category commissions' },
  { key: 'user-categories', label: 'User Catalog', description: 'Manage categories, services and brands' },
  { key: 'worker-services', label: 'Worker Services', description: 'Manage worker-side service catalog' },
  { key: 'worker-parts', label: 'Worker Parts', description: 'Manage spare parts inventory and rates' },
  { key: 'addons', label: 'Add-ons', description: 'Manage extra add-on services' },
  { key: 'reports', label: 'Reports', description: 'Access advanced business analytics & reports' },
  { key: 'reviews', label: 'Reviews', description: 'Manage customer ratings and feedbacks' },
  { key: 'coupons', label: 'Coupons', description: 'Create and control coupon codes & discounts' },
  { key: 'settings', label: 'Settings', description: 'Configure system preferences & staff' },
  { key: 'data-export', label: 'Data Export', description: 'Download customer and professional data as Excel or PDF (also needs Users / Workers)' },
  { key: 'customization', label: 'Customization', description: 'Update home page banners and UI layout' },
  { key: 'booking-config', label: 'Booking Config', description: 'Change radius, search waves and algorithms' }
];

// What each role may do. Checked by requirePermission() in roleMiddleware.
// super_admin is handled separately and bypasses this map entirely.
const ADMIN_PERMISSIONS = {
  [ADMIN_ROLES.SUPER_ADMIN]: ['*'],
  [ADMIN_ROLES.ADMIN]: [
    'dashboard', 'bookings', 'users', 'workers', 'services', 'categories', 'brands', 'reports',
    'reviews', 'notifications', 'content', 'scrap', 'disputes', 'transactions',
    'addons', 'coupons', 'referrals', 'cities', 'payments', 'commission', 'booking_config',
    'settlements', 'withdrawals', 'worker-services', 'worker-parts', 'settings', 'customization'
  ],
  [ADMIN_ROLES.SUB_ADMIN]: [], // Controlled dynamically by admin.permissions array
  [ADMIN_ROLES.OPERATIONS_MANAGER]: ['dashboard', 'bookings', 'workers', 'reports', 'notifications', 'disputes', 'booking_config'],
  [ADMIN_ROLES.CUSTOMER_SUPPORT]: ['dashboard', 'bookings', 'users', 'reviews', 'notifications', 'disputes'],
  [ADMIN_ROLES.FINANCE_MANAGER]: ['dashboard', 'payments', 'settlements', 'withdrawals', 'reports', 'commission', 'transactions'],
  [ADMIN_ROLES.SERVICE_MANAGER]: ['dashboard', 'services', 'categories', 'brands', 'addons', 'worker-services', 'worker-parts'],
  [ADMIN_ROLES.WORKER_MANAGER]: ['dashboard', 'workers', 'settlements', 'reports'],
  [ADMIN_ROLES.CONTENT_MANAGER]: ['dashboard', 'content', 'notifications', 'cities']
};

// Human-readable labels for the admin UI.
const ADMIN_ROLE_LABELS = {
  [ADMIN_ROLES.SUPER_ADMIN]: 'Super Admin',
  [ADMIN_ROLES.ADMIN]: 'Admin',
  [ADMIN_ROLES.SUB_ADMIN]: 'Sub-Admin (Custom Rights)',
  [ADMIN_ROLES.OPERATIONS_MANAGER]: 'Operations Manager',
  [ADMIN_ROLES.CUSTOMER_SUPPORT]: 'Customer Support',
  [ADMIN_ROLES.FINANCE_MANAGER]: 'Finance Manager',
  [ADMIN_ROLES.SERVICE_MANAGER]: 'Service Manager',
  [ADMIN_ROLES.WORKER_MANAGER]: 'Worker Manager',
  [ADMIN_ROLES.CONTENT_MANAGER]: 'Content Manager'
};

// Token Types
const TOKEN_TYPES = {
  EMAIL_VERIFICATION: 'EMAIL_VERIFICATION',
  PASSWORD_RESET: 'PASSWORD_RESET',
  PHONE_VERIFICATION: 'PHONE_VERIFICATION',
  REFRESH_TOKEN: 'REFRESH_TOKEN'
};

// Worker Approval Status
const WORKER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended'
};

// Booking Status
const BOOKING_STATUS = {
  SEARCHING: 'searching', // Initial search phase
  REQUESTED: 'requested', // Waiting for worker to accept
  AWAITING_PAYMENT: 'awaiting_payment', // Accepted by worker, waiting for user payment
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  ACCEPTED: 'accepted',
  ASSIGNED: 'assigned',
  JOURNEY_STARTED: 'journey_started',
  VISITED: 'visited',
  IN_PROGRESS: 'in_progress',
  WORK_DONE: 'work_done',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_WORKERS: 'cancelled',
  REJECTED: 'rejected'
};

// Who may cancel a booking, and until when. Enforced on the server (the apps only hide the button).
//   customer  until the professional arrives (free, or the on-the-way fee, as the cancellation policy says)
//   admin     the same, and also once they have arrived and while the work is in progress (a support override)
// From arrival on, a customer cannot cancel; and from work_done on nobody can: a booking can only end as completed,
// and a problem is handled as a dispute or refund.
const USER_CANCELLABLE_STATUSES = [
  BOOKING_STATUS.SEARCHING,
  BOOKING_STATUS.REQUESTED,
  BOOKING_STATUS.AWAITING_PAYMENT,
  BOOKING_STATUS.PENDING,
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.ASSIGNED,
  BOOKING_STATUS.JOURNEY_STARTED
];
const ADMIN_CANCELLABLE_STATUSES = [...USER_CANCELLABLE_STATUSES, BOOKING_STATUS.VISITED, BOOKING_STATUS.IN_PROGRESS];

// Payment Status
const PAYMENT_STATUS = {
  PENDING: 'pending',
  SUCCESS: 'success',
  PAID: 'paid',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  COLLECTED_BY_WORKER: 'collected_by_vendor',
  COLLECTED_BY_WORKER_LEGACY: 'collected by worker',
  PLAN_COVERED: 'plan_covered' // For plan_benefit bookings until bill is finalized
};

// Service Status
const SERVICE_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  DELETED: 'deleted'
};

// Bill Status
const BILL_STATUS = {
  DRAFT: 'draft',
  GENERATED: 'generated',
  PAID: 'paid',
  CANCELLED: 'cancelled'
};

// Dispute Status
const DISPUTE_STATUS = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  AWAITING_RESPONSE: 'awaiting_response',
  RESOLVED: 'resolved',
  REJECTED: 'rejected',
  CLOSED: 'closed'
};

// A booking can only have one dispute in any of these states at a time.
const DISPUTE_ACTIVE_STATUSES = [
  DISPUTE_STATUS.OPEN,
  DISPUTE_STATUS.UNDER_REVIEW,
  DISPUTE_STATUS.AWAITING_RESPONSE
];

// Recurring Booking Status
const RECURRING_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

// Days between occurrences for each recurring frequency. Monthly is handled
// separately (calendar month), so it is not listed here.
const RECURRING_FREQUENCY_DAYS = {
  weekly: 7,
  biweekly: 14
};

// Statuses in which the assigned worker is still expected to turn up.
// Used by chat and reassignment to tell an active booking from a finished one.
const ACTIVE_BOOKING_STATUSES = [
  BOOKING_STATUS.CONFIRMED,
  BOOKING_STATUS.ACCEPTED,
  BOOKING_STATUS.ASSIGNED,
  BOOKING_STATUS.JOURNEY_STARTED,
  BOOKING_STATUS.VISITED,
  BOOKING_STATUS.IN_PROGRESS,
  BOOKING_STATUS.WORK_DONE
];

module.exports = {
  USER_ROLES,
  ADMIN_ROLES,
  ADMIN_PERMISSIONS,
  ADMIN_ROLE_LABELS,
  ADMIN_MODULE_PERMISSIONS,
  TOKEN_TYPES,
  WORKER_STATUS,
  BOOKING_STATUS,
  USER_CANCELLABLE_STATUSES,
  ADMIN_CANCELLABLE_STATUSES,
  PAYMENT_STATUS,
  SERVICE_STATUS,
  BILL_STATUS,
  DISPUTE_STATUS,
  DISPUTE_ACTIVE_STATUSES,
  RECURRING_STATUS,
  RECURRING_FREQUENCY_DAYS,
  ACTIVE_BOOKING_STATUSES
};
