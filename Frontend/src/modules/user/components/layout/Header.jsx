import React, { useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HiLocationMarker } from 'react-icons/hi';
import { gsap } from 'gsap';
import LocationSelector from '../common/LocationSelector';
import { animateLogo } from '../../../../utils/gsapAnimations';
import Logo from '../../../../components/common/Logo';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { themeColors } from '../../../../theme';

import CitySelectorModal from '../common/CitySelectorModal';
import NotificationBell from '../common/NotificationBell';
import { useCity } from '../../../../context/CityContext';
import { useConfig } from '../../../../context/ConfigContext';
import { HiChevronDown } from 'react-icons/hi';

// "Area, City, State, ..." -> "Area, City" with case-insensitive deduplication
const getShortLocation = (location) => {
  if (!location || location === '...') return 'Select Location';
  const parts = location.split(',').map(p => p.trim()).filter(Boolean);
  const unique = [];
  for (const part of parts) {
    if (!unique.some(u => u.toLowerCase() === part.toLowerCase())) {
      unique.push(part);
    }
  }
  return unique.slice(0, 2).join(', ') || 'Select Location';
};

const Header = ({ location, onLocationClick, showNotifications = false }) => {
  const logoRef = useRef(null);
  const { currentCity } = useCity();
  const { isScrapEnabled } = useConfig();
  const [isCityModalOpen, setIsCityModalOpen] = React.useState(false);

  useEffect(() => {
    if (logoRef.current) {
      animateLogo(logoRef.current);
    }
  }, []);

  return (
    <header className="relative overflow-hidden">
      {/* Content wrapper with relative positioning */}
      <div className="relative z-10">
        <div className="w-full">
          {/* Top Row: Logo (Left) and Location (Right) */}
          <div className={`px-4 pt-3 ${showNotifications ? 'pb-0' : 'pb-2'} flex items-center justify-between gap-3`}>
            {/* Left: Logo */}
            <Link
              to="/user"
              className="cursor-pointer shrink-0"
              onMouseEnter={() => {
                if (logoRef.current) {
                  gsap.to(logoRef.current, {
                    scale: 1.1,
                    filter: `drop-shadow(0 0 16px ${themeColors.brand.teal}40)`,
                    duration: 0.3,
                    ease: 'power2.out',
                  });
                }
              }}
              onMouseLeave={() => {
                if (logoRef.current) {
                  gsap.to(logoRef.current, {
                    scale: 1,
                    filter: '',
                    duration: 0.3,
                    ease: 'power2.out',
                  });
                }
              }}
            >
              <Logo
                ref={logoRef}
                className={showNotifications ? 'h-14 sm:h-16 w-auto' : 'h-12 sm:h-14 w-auto'}
              />
            </Link>

            {/* Desktop Navigation - Hidden on Mobile */}
            <nav className="hidden lg:flex items-center gap-8 ml-10">
              <Link to="/user" className="text-gray-700 font-semibold hover:text-[#347989] transition-colors">Home</Link>
              <Link to="/user/my-bookings" className="text-gray-700 font-semibold hover:text-[#347989] transition-colors">Bookings</Link>
              {isScrapEnabled && (
                <Link to="/user/scrap" className="text-gray-700 font-semibold hover:text-[#347989] transition-colors">Scrap</Link>
              )}
              <Link to="/user/cart" className="text-gray-700 font-semibold hover:text-[#347989] transition-colors">Cart</Link>
              <Link to="/user/account" className="text-gray-700 font-semibold hover:text-[#347989] transition-colors">Account</Link>
            </nav>

            {/* Right: Location pill + Notifications (home variant) */}
            {showNotifications ? (
              <div className="flex items-center justify-end gap-2 flex-1 min-w-0">
                <button
                  type="button"
                  onClick={onLocationClick}
                  className="flex items-center gap-1.5 min-w-0 py-1.5 px-2.5 rounded-full bg-gray-50/90 hover:bg-gray-100 border border-gray-100/90 active:scale-[0.97] transition-all cursor-pointer"
                  aria-label="Change location"
                >
                  <HiLocationMarker className="w-4 h-4 shrink-0 text-accent" />
                  <span className="text-[12.5px] sm:text-sm font-bold text-gray-900 truncate tracking-tight">
                    {getShortLocation(location)}
                  </span>
                  <HiChevronDown className="w-3.5 h-3.5 shrink-0 text-gray-500" />
                </button>
                <NotificationBell />
              </div>
            ) : (
            <div className="flex flex-col items-end gap-1 flex-1 min-w-0 ml-4">



              {/* Location Selector */}
              <div className="flex flex-col items-end cursor-pointer group" onClick={onLocationClick}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <HiLocationMarker
                    className="w-4 h-4 shrink-0 text-teal-600 group-hover:scale-110 transition-transform"
                  />
                  <span className="text-sm font-bold text-gray-900 truncate max-w-[160px] tracking-tight">
                    {location && location !== '...' ? location.split('-')[0].trim() : 'Select Location'}
                  </span>
                </div>
                <LocationSelector
                  location={location}
                  onLocationClick={onLocationClick}
                />
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      <CitySelectorModal
        isOpen={isCityModalOpen}
        onClose={() => setIsCityModalOpen(false)}
      />
    </header>
  );
};

export default Header;
