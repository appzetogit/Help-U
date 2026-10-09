import React, { useRef, useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiHome, FiGift, FiShoppingCart, FiUser, FiTrash2, FiCalendar } from 'react-icons/fi';
import { HiHome, HiGift, HiShoppingCart, HiUser, HiTrash, HiCalendar } from 'react-icons/hi';
import { motion, AnimatePresence } from 'framer-motion';
import { useCart } from '../../../../context/CartContext';
import { useConfig } from '../../../../context/ConfigContext';

// Colorful theme for each nav item
const navItemColors = {
  home: {
    primary: '#3B82F6', // Blue
    gradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    bg: 'rgba(59, 130, 246, 0.1)',
    shadow: 'rgba(59, 130, 246, 0.4)'
  },
  bookings: {
    primary: '#10B981', // Emerald
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    bg: 'rgba(16, 185, 129, 0.1)',
    shadow: 'rgba(16, 185, 129, 0.4)'
  },
  scrap: {
    primary: '#F59E0B', // Amber
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    bg: 'rgba(245, 158, 11, 0.1)',
    shadow: 'rgba(245, 158, 11, 0.4)'
  },
  cart: {
    primary: '#EC4899', // Pink
    gradient: 'linear-gradient(135deg, #EC4899 0%, #DB2777 100%)',
    bg: 'rgba(236, 72, 153, 0.1)',
    shadow: 'rgba(236, 72, 153, 0.4)'
  },
  account: {
    primary: '#8B5CF6', // Violet
    gradient: 'linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)',
    bg: 'rgba(139, 92, 246, 0.1)',
    shadow: 'rgba(139, 92, 246, 0.4)'
  }
};

const BottomNav = React.memo(() => {
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef(null);
  const { cartCount } = useCart();
  const { isScrapEnabled } = useConfig();
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });

  const navItems = useMemo(() => {
    const items = [
      { id: 'home', label: 'Home', icon: FiHome, filledIcon: HiHome, path: '/user' },
      { id: 'bookings', label: 'Bookings', icon: FiCalendar, filledIcon: HiCalendar, path: '/user/my-bookings' },
      ...(isScrapEnabled ? [{ id: 'scrap', label: 'Scrap', icon: FiTrash2, filledIcon: HiTrash, path: '/user/scrap' }] : []),
      { id: 'cart', label: 'Cart', icon: FiShoppingCart, filledIcon: HiShoppingCart, path: '/user/cart', isCart: true },
      { id: 'account', label: 'Account', icon: FiUser, filledIcon: HiUser, path: '/user/account' },
    ];
    return items;
  }, [isScrapEnabled]);

  const getActiveTab = () => {
    if (location.pathname === '/user' || location.pathname === '/user/') return 'home';
    if (location.pathname === '/user/my-bookings') return 'bookings';
    if (location.pathname === '/user/scrap') return 'scrap';
    if (location.pathname === '/user/cart') return 'cart';
    if (location.pathname === '/user/account') return 'account';
    return 'home';
  };

  const activeTab = getActiveTab();
  const activeIndex = navItems.findIndex(item => item.id === activeTab);
  const activeColor = navItemColors[activeTab];



  // Update indicator position when active tab changes
  useEffect(() => {
    if (navRef.current) {
      const buttons = navRef.current.querySelectorAll('button');
      if (buttons[activeIndex]) {
        const button = buttons[activeIndex];
        const navRect = navRef.current.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();

        setIndicatorStyle({
          left: buttonRect.left - navRect.left + (buttonRect.width / 2) - 16, // Center the 32px indicator
          width: 32
        });
      }
    }
  }, [activeIndex, activeTab]);

  const handleTabClick = (path) => {
    navigate(path);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 w-full lg:hidden"
      style={{
        WebkitBackfaceVisibility: 'hidden',
      }}
    >
      <div
        className="w-full pb-4 pt-3 px-2 rounded-t-[24px]"
        style={{
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.08)',
          borderTop: '1px solid rgba(229, 231, 235, 0.6)',
        }}
      >
        <div ref={navRef} className="flex items-center justify-around max-w-md mx-auto relative">

          {/* Animated Sliding Indicator */}
          <motion.div
            className="absolute -top-3 h-1 rounded-full"
            animate={{
              left: indicatorStyle.left,
              width: indicatorStyle.width,
              background: activeColor?.gradient || navItemColors.home.gradient,
            }}
            transition={{
              type: "spring",
              stiffness: 380,
              damping: 30
            }}
            style={{
              boxShadow: `0 2px 12px ${activeColor?.shadow || navItemColors.home.shadow}`,
            }}
          />

          {navItems.map((item) => {
            const IconComponent = activeTab === item.id ? item.filledIcon : item.icon;
            const isActive = activeTab === item.id;
            const itemColor = navItemColors[item.id];

            return (
              <motion.button
                key={item.id}
                onClick={() => handleTabClick(item.path)}
                whileTap={{ scale: 0.9 }}
                className="flex flex-col items-center justify-center w-16 h-14 rounded-2xl transition-all duration-200 relative"
              >
                {/* Active Background Glow */}
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-1 rounded-xl"
                      style={{
                        background: itemColor.bg,
                      }}
                    />
                  )}
                </AnimatePresence>

                <div className="relative z-10 flex flex-col items-center justify-center">
                  <motion.div
                    className="relative mb-1"
                    animate={{
                      scale: isActive ? 1.1 : 1,
                      y: isActive ? -2 : 0
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <IconComponent
                      className="w-6 h-6 transition-colors duration-200"
                      style={{
                        color: isActive ? itemColor.primary : '#9CA3AF',
                      }}
                    />
                    {item.isCart && cartCount > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1.5 -right-2.5 bg-gradient-to-br from-red-500 to-red-600 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center border-2 border-white shadow-lg"
                      >
                        {cartCount > 9 ? '9+' : cartCount}
                      </motion.span>
                    )}
                  </motion.div>
                  <motion.span
                    animate={{
                      color: isActive ? itemColor.primary : '#6B7280',
                      fontWeight: isActive ? 600 : 500
                    }}
                    className="text-[10px]"
                  >
                    {item.label}
                  </motion.span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>
    </nav>
  );
});

BottomNav.displayName = 'BottomNav';

export default BottomNav;
