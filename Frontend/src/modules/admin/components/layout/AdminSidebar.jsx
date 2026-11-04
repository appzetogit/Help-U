import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FiHome,
  FiUsers,
  FiBriefcase,
  FiUser,
  FiShoppingBag,
  FiGrid,
  FiDollarSign,
  FiFileText,
  FiBell,
  FiSettings,
  FiSliders,
  FiChevronDown,
  FiX,
  FiLayers,
  FiTrash2,
  FiStar,
  FiGift,
  FiAlertOctagon,
  FiRepeat,
  FiPlusCircle,
  FiTag,
  FiBook,
  FiMap,
  FiSearch,
  FiLayout,
  FiSmartphone,
} from "react-icons/fi";
import dashboardService from "../../services/dashboardService";
import useModalLock from "../../../../hooks/useModalLock";
import {
  getChildRoute,
  getVisibleMenu,
  groupMenu,
  matches,
  readAdminUser,
} from "../../utils/adminNav";

// Icon mapping for menu items
const iconMap = {
  Dashboard: FiHome,
  Users: FiUsers,
  Workers: FiBriefcase,
  "Worker Referrals": FiGift,
  Referrals: FiGift,
  Bookings: FiShoppingBag,
  "User Catalog": FiGrid,
  "Extras & Pricing": FiLayers,
  Payments: FiDollarSign,
  Reports: FiFileText,
  Notifications: FiBell,
  "Scrap Items": FiTrash2,
  Reviews: FiStar,
  Settlements: FiDollarSign,
  Settings: FiSettings,
  Customization: FiSliders,
  "Landing Page": FiLayout,
  "Login Banners": FiSmartphone,
  "Legal & Help Pages": FiBook,
  Disputes: FiAlertOctagon,
  "Recurring Bookings": FiRepeat,
  "Add-ons": FiPlusCircle,
  "Booking Config": FiSliders,
  Coupons: FiTag,
  Zones: FiMap,
};

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Wraps the part of `text` that matches the search in <mark>
const Highlight = ({ text, query }) => {
  const q = query.trim();
  if (!q) return text;
  const parts = String(text).split(new RegExp(`(${escapeRegExp(q)})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="bg-amber-300/90 text-slate-900 rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
};

const CountBadge = ({ count, tone = "red" }) => {
  if (!count || count <= 0) return null;
  const color = tone === "orange" ? "bg-orange-500" : "bg-red-500";
  return (
    <span className={`${color} text-white text-[10px] font-bold h-[18px] min-w-[18px] px-1.5 flex items-center justify-center rounded-full`}>
      {count > 99 ? "99+" : count}
    </span>
  );
};

const AdminSidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  // The drawer (and its backdrop) only exists below lg; on desktop isOpen stays false
  useModalLock(isOpen);
  const searchRef = useRef(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [query, setQuery] = useState("");
  const [adminUser] = useState(readAdminUser);
  const [counts, setCounts] = useState({
    bookings: 0,
    workers: 0,
    withdrawals: 0,
    pendingSettlements: 0,
    scraps: 0,
  });

  const searching = query.trim().length > 0;

  // The menu this admin may see
  const visibleMenu = useMemo(() => getVisibleMenu(adminUser), [adminUser]);

  // While searching: keep items whose title matches, or that have a matching sub-page (showing
  // only the matching sub-pages unless the parent itself matched)
  const displayMenu = useMemo(() => {
    if (!searching) return visibleMenu;
    return visibleMenu
      .map((item) => {
        const parentMatch = matches(item.title, query);
        const children = (item.children || []).filter((c) => matches(c, query));
        if (parentMatch) return item;
        if (children.length > 0) return { ...item, children };
        return null;
      })
      .filter(Boolean);
  }, [visibleMenu, query, searching]);

  const groups = useMemo(() => groupMenu(displayMenu), [displayMenu]);

  // Pending counts for the badges
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const response = await dashboardService.getStats();
        if (response.success && response.data?.stats) {
          const stats = response.data.stats;
          setCounts({
            bookings: stats.pendingBookings || 0,
            workers: stats.pendingWorkers || 0,
            withdrawals: stats.pendingWithdrawals || 0,
            pendingSettlements: stats.pendingSettlements || 0,
            scraps: stats.pendingScraps || 0,
          });
        }
      } catch (error) {
        console.error("Error fetching sidebar counts:", error);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-close the mobile drawer when the route changes
  useEffect(() => {
    if (window.innerWidth < 1024) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Open the group that contains the current page
  useEffect(() => {
    const activeItem = visibleMenu.find((item) => {
      if (item.route === "/admin/dashboard") return false;
      return location.pathname.startsWith(item.route) && location.pathname !== item.route;
    });
    if (activeItem && activeItem.children && activeItem.children.length > 0) {
      setExpandedItems((prev) => (prev[activeItem.title] ? prev : { [activeItem.title]: true }));
    }
  }, [location.pathname, visibleMenu]);

  const isActive = (route) => {
    if (route === "/admin/dashboard") return location.pathname === "/admin/dashboard";
    return location.pathname === route || location.pathname.startsWith(route + "/");
  };

  const toggleExpand = (title) => {
    setExpandedItems((prev) => ({ [title]: !prev[title] }));
  };

  const go = (route, parentTitle = null) => {
    if (parentTitle) setExpandedItems({ [parentTitle]: true });
    navigate(route);
    if (window.innerWidth < 1024) onClose();
  };

  // Enter in the search box opens the first result
  const openFirstResult = () => {
    const first = displayMenu[0];
    if (!first) return;
    const hasChildren = first.children && first.children.length > 0;
    const parentMatched = matches(first.title, query);
    if (hasChildren && !parentMatched) {
      go(getChildRoute(first.route, first.children[0]), first.title);
    } else {
      go(first.route);
    }
    setQuery("");
  };

  const onSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      setQuery("");
      e.currentTarget.blur();
    } else if (e.key === "Enter") {
      e.preventDefault();
      openFirstResult();
    }
  };

  const badgeFor = (title) => {
    if (title === "Bookings") return counts.bookings;
    if (title === "Workers") return counts.workers;
    if (title === "Settlements") return counts.withdrawals + counts.pendingSettlements;
    if (title === "Scrap Items") return counts.scraps;
    return 0;
  };

  const childBadgeFor = (parentTitle, childTitle) => {
    if (parentTitle === "Workers" && childTitle === "All Workers") {
      return { count: counts.workers, tone: "red" };
    }
    if (parentTitle === "Bookings" && childTitle === "All Bookings") {
      return { count: counts.bookings, tone: "red" };
    }
    if (parentTitle === "Settlements") {
      if (childTitle === "Pending") return { count: counts.pendingSettlements, tone: "red" };
      if (childTitle === "Withdrawals") return { count: counts.withdrawals, tone: "orange" };
    }
    return null;
  };

  const renderMenuItem = (item) => {
    const Icon = iconMap[item.title] || FiHome;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = searching ? hasChildren : expandedItems[item.title];
    const active = isActive(item.route);

    return (
      <div key={item.route} className="mb-0.5">
        <button
          type="button"
          onClick={() => (hasChildren ? toggleExpand(item.title) : go(item.route))}
          aria-expanded={hasChildren ? !!isExpanded : undefined}
          className={`group w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors duration-150
            ${active ? "bg-primary-600 text-white shadow-sm" : "text-slate-300 hover:bg-slate-700/70 hover:text-white"}`}
        >
          <Icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-white" : "text-slate-400 group-hover:text-slate-200"}`} />
          <span className="flex-1 text-[14px] font-medium truncate">
            <Highlight text={item.title} query={query} />
          </span>
          <CountBadge count={badgeFor(item.title)} />
          {hasChildren && (
            <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0">
              <FiChevronDown className={`w-4 h-4 ${active ? "text-white/80" : "text-slate-500"}`} />
            </motion.span>
          )}
        </button>

        <AnimatePresence initial={false}>
          {hasChildren && isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="ml-[22px] mt-0.5 mb-1 pl-3 border-l border-slate-600/70 space-y-0.5">
                {item.children.map((child) => {
                  const childRoute = getChildRoute(item.route, child);
                  const isChildActive =
                    location.pathname === childRoute ||
                    (childRoute !== item.route && location.pathname.startsWith(childRoute + "/"));
                  const childBadge = childBadgeFor(item.title, child);

                  return (
                    <button
                      type="button"
                      key={child}
                      onClick={() => go(childRoute, item.title)}
                      className={`w-full px-3 py-1.5 text-[13px] rounded-md text-left flex justify-between items-center transition-colors
                        ${isChildActive ? "bg-slate-700 text-white font-medium" : "text-slate-400 hover:bg-slate-700/60 hover:text-slate-100"}`}
                    >
                      <span className="truncate"><Highlight text={child} query={query} /></span>
                      {childBadge && <CountBadge count={childBadge.count} tone={childBadge.tone} />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const roleLabel =
    adminUser.role === "super_admin" ? "Super Admin" : adminUser.role === "sub_admin" ? "Sub Admin" : "Admin";

  const sidebarContent = (
    <div className="h-full w-full flex flex-col bg-slate-800">
      {/* Brand Header with Help U Logo */}
      <div className="px-4 py-3.5 border-b border-slate-700 bg-slate-900 flex items-center justify-between">
        <Link
          to="/admin/dashboard"
          onClick={() => {
            if (window.innerWidth < 1024) onClose();
          }}
          className="flex items-center gap-3 min-w-0 group focus:outline-none"
          title="Help U Admin Dashboard"
        >
          <div className="bg-white rounded-lg px-2 py-1 shadow-sm shrink-0 flex items-center justify-center transition-transform duration-200 group-hover:scale-105">
            <img
              src="/helpu-logo.png"
              alt="Help U"
              className="h-7 sm:h-8 w-auto object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>
          <div className="min-w-0">
            <div className="font-extrabold text-[15px] leading-tight text-white tracking-tight flex items-center">
              Help<span className="text-amber-400 font-black">-U</span>
            </div>
            <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 block mt-0.5">
              Admin Panel
            </span>
          </div>
        </Link>

        {/* Close button, mobile only */}
        <button
          onClick={onClose}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors shrink-0 lg:hidden text-slate-400 hover:text-white"
          aria-label="Close sidebar"
        >
          <FiX className="text-xl" />
        </button>
      </div>

      {/* Admin Profile */}
      <div className="px-4 py-3 border-b border-slate-700/70 bg-slate-800/90">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shadow-md shrink-0"
            style={{ background: "linear-gradient(135deg, #2874F0 0%, #4787F7 100%)" }}
          >
            <FiUser className="text-white text-base" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-semibold text-white text-[14px] leading-tight truncate">{adminUser.name}</h2>
            <span className="inline-block mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 bg-amber-300/10 rounded px-1.5 py-0.5">
              {roleLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Menu search */}
      <div className="px-3 pt-3 pb-2 bg-slate-800">
        <div className="relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onSearchKeyDown}
            placeholder="Search menu…"
            aria-label="Search the menu"
            className="w-full h-9 pl-9 pr-8 rounded-lg bg-slate-700/60 text-[13px] text-slate-100 placeholder:text-slate-400 border border-transparent focus:border-primary-500 focus:bg-slate-700 outline-none transition-colors"
          />
          {searching && (
            <button
              type="button"
              onClick={() => { setQuery(""); searchRef.current?.focus(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-slate-400 hover:text-white hover:bg-white/10"
              aria-label="Clear search"
            >
              <FiX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 pb-3 scrollbar-admin">
        {groups.length === 0 && (
          <div className="px-3 py-10 text-center text-[13px] text-slate-400">
            No menu items match “{query.trim()}”.
          </div>
        )}

        {groups.map((group, gi) => (
          <div key={group.label} className={gi === 0 ? "" : "mt-3"}>
            <p className="px-3 pt-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {group.label}
            </p>
            {group.items.map((item) => renderMenuItem(item))}
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Mobile: backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-60 lg:hidden backdrop-blur-sm"
          />
        )}
      </AnimatePresence>

      {/* Mobile drawer */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="fixed left-0 top-0 bottom-0 w-[280px] z-61 lg:hidden shadow-2xl"
          >
            {sidebarContent}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Desktop: fixed */}
      <div className="hidden lg:flex fixed left-0 top-0 bottom-0 z-30" style={{ width: "278px" }}>
        {sidebarContent}
      </div>
    </>
  );
};

export default AdminSidebar;
