import adminMenu from '../config/adminMenu.json';

/**
 * Admin navigation helpers shared by the sidebar and the header search, so both list the same
 * pages and apply the same role / permission rules.
 */

// Sub-page routes for each menu item that has children
const CHILD_ROUTES = {
  '/admin/users': {
    'All Users': '/admin/users/all',
    'User Bookings': '/admin/users/bookings',
    'Transactions': '/admin/users/transactions',
    'User Analytics': '/admin/users/analytics',
    'Customer Referrals': '/admin/users/referrals',
  },
  '/admin/workers': {
    'All Workers': '/admin/workers/all',
    'Worker Bookings': '/admin/workers/bookings',
    'Worker Referrals': '/admin/workers/referrals',
    'Worker Analytics': '/admin/workers/analytics',
    'Worker Payments': '/admin/workers/payments',
    'Registration Fields': '/admin/workers/registration-fields',
  },
  '/admin/bookings': {
    'All Bookings': '/admin/bookings',
    'Booking Tracking': '/admin/bookings/tracking',
    'Booking Notifications': '/admin/bookings/notifications',
  },
  '/admin/user-categories': {
    'Home': '/admin/user-categories/home',
    'Service Management': '/admin/user-categories/service-management',
    'Home Sections': '/admin/user-categories/sections',
    'Manage Brands': '/admin/user-categories/brands',
  },
  '/admin/payments': {
    'Payment Overview': '/admin/payments/overview',
    'User Payments': '/admin/payments/users',
    'Worker Payments': '/admin/payments/workers',
    'Admin Revenue': '/admin/payments/revenue',
    'Payment Reports': '/admin/payments/reports',
  },
  '/admin/reports': {
    'Revenue Report': '/admin/reports/revenue',
    'Booking Report': '/admin/reports/bookings',
    'Worker Report': '/admin/reports/workers',
    'Payment Report': '/admin/payments/reports',
  },
  '/admin/notifications': {
    'Push Notifications': '/admin/notifications/push',
    'Custom Messages': '/admin/notifications/messages',
    'Notification Settings': '/admin/notifications/settings',
  },
  '/admin/settings': {
    'General Settings': '/admin/settings/general',
    'Service Configuration': '/admin/settings/service-config',
    'System Settings': '/admin/settings/system',
    'Commission': '/admin/settings/commission',
  },
  '/admin/settlements': {
    'Pending': '/admin/settlements/pending',
    'Withdrawals': '/admin/settlements/withdrawals',
    'Workers with Due': '/admin/settlements/workers',
    'History': '/admin/settlements/history',
  },
};

export const getChildRoute = (parentRoute, childName) =>
  CHILD_ROUTES[parentRoute]?.[childName] || parentRoute;

// The three price lists that live under Extras & Pricing. Each tab keeps the permission its page had
// before they were combined (see ROUTE_PERMISSION_MAP), so access did not change.
export const EXTRAS_TABS = [
  { key: 'addons', label: 'Checkout add-ons', hint: 'Customer ticks these at checkout', legacyRoute: '/admin/addons' },
  { key: 'repair-jobs', label: 'Bill: repair jobs', hint: 'Professional adds these to the final bill', legacyRoute: '/admin/user-categories/worker-services' },
  { key: 'parts', label: 'Bill: parts', hint: 'Professional adds spare parts to the final bill', legacyRoute: '/admin/user-categories/worker-parts' }
];

export const ROUTE_PERMISSION_MAP = {
  '/admin/dashboard': 'dashboard',
  '/admin/users': 'users',
  '/admin/workers': 'workers',
  '/admin/bookings': 'bookings',
  '/admin/disputes': 'disputes',
  '/admin/recurring-bookings': 'recurring-bookings',
  '/admin/scrap': 'scrap',
  '/admin/payments': 'payments',
  '/admin/settlements': 'settlements',
  '/admin/user-categories': 'user-categories',
  '/admin/user-categories/worker-services': 'worker-services',
  '/admin/user-categories/worker-parts': 'worker-parts',
  '/admin/addons': 'addons',
  '/admin/reports': 'reports',
  '/admin/reviews': 'reviews',
  '/admin/coupons': 'coupons',
  '/admin/settings': 'settings',
  '/admin/landing-page': 'landing-page',
  '/admin/login-banners': 'customization',
  '/admin/customization': 'customization',
  '/admin/booking-config': 'booking-config'
};

/** Reads the signed-in admin from storage. */
export const readAdminUser = () => {
  try {
    const stored = JSON.parse(sessionStorage.getItem('adminData') || localStorage.getItem('adminData') || localStorage.getItem('adminUser') || '{}');
    return {
      name: stored.name || 'Admin',
      email: stored.email || '',
      role: stored.role || 'super_admin',
      permissions: Array.isArray(stored.permissions) ? stored.permissions : []
    };
  } catch {
    return { name: 'Admin', email: '', role: 'super_admin', permissions: [] };
  }
};

/** Whether this admin may see a menu item (super admin: everything; sub-admin: only granted areas). */
export const canAccessItem = (item, adminUser) => {
  if (adminUser.role === 'super_admin') return true;

  // Extras & Pricing is shown when at least one of its tabs is allowed
  if (item.route === '/admin/extras') {
    return EXTRAS_TABS.some((t) => canAccessItem({ route: t.legacyRoute, allowedRoles: item.allowedRoles }, adminUser));
  }

  const permKey = ROUTE_PERMISSION_MAP[item.route];
  const perms = adminUser.permissions || [];

  if (perms.length > 0) {
    if (perms.includes('*')) return true;
    if (permKey) {
      const alt1 = permKey.replace(/-/g, '_');
      const alt2 = permKey.replace(/_/g, '-');
      if (perms.includes(permKey) || perms.includes(alt1) || perms.includes(alt2)) return true;
    }
    // Legacy / alias permissions
    if (item.route.startsWith('/admin/user-categories') && (perms.includes('services') || perms.includes('user-categories'))) return true;
    if (item.route === '/admin/customization' && (perms.includes('content') || perms.includes('customization'))) return true;
    if (item.route === '/admin/support-messages' && perms.includes('content')) return true;
    if (item.route === '/admin/settlements' && (perms.includes('payments') || perms.includes('settlements'))) return true;
    if (item.route === '/admin/recurring-bookings' && (perms.includes('bookings') || perms.includes('recurring-bookings'))) return true;

    // A sub-admin is denied anything not explicitly granted
    if (adminUser.role === 'sub_admin') return false;
  }

  if (!item.allowedRoles) return true;
  return item.allowedRoles.includes(adminUser.role);
};

/** The menu this admin can see. */
export const getVisibleMenu = (adminUser) => adminMenu.filter((item) => canAccessItem(item, adminUser));

/** Sidebar sections, in display order. Anything not listed falls into "More". */
export const NAV_GROUPS = [
  { label: 'Overview', titles: ['Dashboard'] },
  { label: 'People', titles: ['Users', 'Workers'] },
  { label: 'Operations', titles: ['Bookings', 'Disputes', 'Recurring Bookings', 'Scrap Items', 'Reviews'] },
  { label: 'Finance', titles: ['Payments', 'Settlements', 'Coupons'] },
  { label: 'Catalog', titles: ['User Catalog', 'Extras & Pricing', 'Zones'] },
  { label: 'Insights', titles: ['Reports'] },
  { label: 'System', titles: ['Landing Page', 'Settings', 'Booking Config', 'Customization', 'Legal & Help Pages', 'Support Messages'] },
];

/** Splits the visible menu into the labelled sections above (empty sections are dropped). */
export const groupMenu = (menu) => {
  const placed = new Set();
  const groups = NAV_GROUPS.map((g) => {
    const items = g.titles.map((t) => menu.find((m) => m.title === t)).filter(Boolean);
    items.forEach((i) => placed.add(i.title));
    return { label: g.label, items };
  }).filter((g) => g.items.length > 0);

  const rest = menu.filter((m) => !placed.has(m.title));
  if (rest.length > 0) groups.push({ label: 'More', items: rest });
  return groups;
};

/** Every page (top level and sub-pages) the admin can open, for the header search. */
export const buildPageIndex = (adminUser) => {
  const pages = [];
  getVisibleMenu(adminUser).forEach((item) => {
    pages.push({ title: item.title, parent: null, route: item.route });
    (item.children || []).forEach((child) => {
      pages.push({ title: child, parent: item.title, route: getChildRoute(item.route, child) });
    });
  });
  return pages;
};

/** Case-insensitive match used by both searches. */
export const matches = (text, query) =>
  String(text || '').toLowerCase().includes(String(query || '').trim().toLowerCase());
