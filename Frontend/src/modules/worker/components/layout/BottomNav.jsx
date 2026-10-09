import React, { useState, useEffect, memo, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiHome, FiBriefcase, FiUsers, FiUser } from 'react-icons/fi';
import { HiHome, HiBriefcase, HiUsers, HiUser } from 'react-icons/hi';
import { FaWallet } from 'react-icons/fa';
import { workerTheme as themeColors } from '../../../../theme';

const BottomNav = memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingJobsCount, setPendingJobsCount] = useState(0);

  // Load pending jobs count from localStorage
  useEffect(() => {
    const updatePendingCount = () => {
      try {
        // Count active jobs (PENDING only) to show new requests
        const acceptedBookings = JSON.parse(localStorage.getItem('workerAcceptedBookings') || '[]');
        const activeJobs = acceptedBookings.filter(job => job.status === 'PENDING');
        setPendingJobsCount(activeJobs.length);
      } catch (error) {
        console.error('Error reading pending jobs:', error);
      }
    };

    updatePendingCount();
    window.addEventListener('storage', updatePendingCount);
    window.addEventListener('workerJobsUpdated', updatePendingCount);

    return () => {
      window.removeEventListener('storage', updatePendingCount);
      window.removeEventListener('workerJobsUpdated', updatePendingCount);
    };
  }, []);

  // Use useMemo to update navItems when pendingJobsCount changes
  const navItems = useMemo(() => {
    // Count jobs that require attention (Pending, Accepted, In Progress)
    const badgeCount = pendingJobsCount;

    return [
      { path: '/worker/dashboard', icon: FiHome, activeIcon: HiHome, label: 'Home' },
      { path: '/worker/jobs', icon: FiBriefcase, activeIcon: HiBriefcase, label: 'Jobs', badge: badgeCount },
      { path: '/worker/wallet', icon: FaWallet, activeIcon: FaWallet, label: 'Wallet' },
      { path: '/worker/profile', icon: FiUser, activeIcon: HiUser, label: 'Profile' },
    ];
  }, [pendingJobsCount]);

  const handleNavClick = (path) => {
    if (location.pathname !== path) {
      navigate(path);
    }
  };

  // Hide nav when specific routes are active (booking alerts, maps)
  const hideNavRoutes = [
    '/worker/booking-alert/',
    '/worker/booking/',
    '/worker/booking-alert/',
    '/worker/booking/',
  ];

  const shouldHideNav = hideNavRoutes.some(route =>
    location.pathname.includes(route) &&
    (location.pathname.includes('/map') || location.pathname.includes('/alert/'))
  );

  if (shouldHideNav) {
    return null;
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-white"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        width: '100%',
        zIndex: 40,
        willChange: 'transform',
        transform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        borderTop: '2px solid rgba(0, 0, 0, 0.35)',
        borderTopLeftRadius: '20px',
        borderTopRightRadius: '20px',
        boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.15), 0 -4px 12px rgba(0, 0, 0, 0.1), 0 -2px 6px rgba(0, 0, 0, 0.08)',
        background: 'linear-gradient(to top, #FFFFFF 0%, #FAFAFA 100%)',
      }}
    >
      <div className="flex items-center justify-around px-2 py-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path ||
            (item.path === '/worker/dashboard' && (location.pathname === '/worker' || location.pathname === '/vendor'));
          const IconComponent = isActive ? item.activeIcon : item.icon;

          return (
            <button
              key={item.path}
              onClick={() => handleNavClick(item.path)}
              className="flex flex-col items-center justify-center relative w-16 h-14 rounded-xl transition-all duration-200 group hover:scale-105"
            >
              {/* Active Indicator Bar - Gradient Accent */}
              {isActive && (
                <div
                  className="absolute -top-2 w-10 h-1 rounded-b-full"
                  style={{
                    background: themeColors.gradient,
                    boxShadow: `0 2px 8px ${themeColors.brand.teal}4D`,
                  }}
                />
              )}

              {/* Active Background - Very Subtle Teal Tint */}
              {isActive && (
                <div
                  className="absolute inset-0 rounded-xl scale-90"
                  style={{ backgroundColor: `${themeColors.brand.teal}0A` }}
                />
              )}

              <div className="relative z-10 flex flex-col items-center justify-center">
                <div className="relative mb-0.5">
                  <IconComponent
                    className={`w-6 h-6 transition-all duration-300 ${isActive ? 'scale-110' : 'text-gray-400 group-hover:text-gray-600'}`}
                    style={{
                      color: isActive ? themeColors.button : '#9CA3AF',
                      filter: isActive ? `drop-shadow(0 2px 4px ${themeColors.brand.teal}1A)` : 'none'
                    }}
                  />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className="absolute bg-gradient-to-br from-red-500 to-red-600 text-white text-xs font-bold rounded-full flex items-center justify-center"
                      style={{
                        top: '-6px',
                        right: '-8px',
                        minWidth: '18px',
                        height: '18px',
                        padding: '0 4px',
                        fontSize: '10px',
                        lineHeight: '18px',
                        border: '2px solid white',
                        boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)',
                        zIndex: 50,
                      }}
                    >
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </div>
                <span
                  className={`text-[10px] transition-colors duration-300 ${isActive ? 'font-bold' : 'font-medium text-gray-500'}`}
                  style={{
                    color: isActive ? themeColors.button : '#6B7280',
                  }}
                >
                  {item.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';
export default BottomNav;

