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
import { useCity } from '../../../../context/CityContext';
import { useConfig } from '../../../../context/ConfigContext';
import { HiChevronDown } from 'react-icons/hi';

const Header = ({ location, onLocationClick }) => {
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
          <div className="px-4 py-3 flex items-center justify-between">
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
                className="h-10 sm:h-12 w-auto"
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

            {/* Right: City & Location */}
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
