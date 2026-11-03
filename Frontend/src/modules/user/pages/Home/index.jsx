import React, { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import SearchBar from './components/SearchBar';
import ServiceCategories from './components/ServiceCategories';
import { publicCatalogService } from '../../../../services/catalogService';
import { useCart } from '../../../../context/CartContext';
import { useCity } from '../../../../context/CityContext';
import { useZone } from '../../../../context/ZoneContext';
import { useConfig } from '../../../../context/ConfigContext';
import { useLanguage } from '../../../../context/LanguageContext';
import { useGoogleMapsConfig } from '../../../../hooks/useGoogleMapsConfig';
import { toast } from 'react-hot-toast';
import { registerFCMToken } from '../../../../services/pushNotificationService';
import { motion } from 'framer-motion';
import api from '../../../../services/api';

// Lazy load heavy components for better initial load performance
import PromoCarousel from './components/PromoCarousel';
import SpotlightCarousel from './components/SpotlightCarousel';
// Lazy load OTHER heavy components
const NewAndNoteworthy = lazy(() => import('./components/NewAndNoteworthy'));
const MostBookedServices = lazy(() => import('./components/MostBookedServices'));
const CuratedServices = lazy(() => import('./components/CuratedServices'));
const ServiceSectionWithRating = lazy(() => import('./components/ServiceSectionWithRating'));
const ApplianceRepairSection = lazy(() => import('./components/ApplianceRepairSection'));
const Banner = lazy(() => import('./components/Banner'));
const ReferEarnSection = lazy(() => import('./components/ReferEarnSection'));
import SearchOverlay from './components/SearchOverlay';
import VoiceSearchSheet from './components/VoiceSearchSheet';
import useVoiceSearch from '../../../../hooks/useVoiceSearch';
import HomeSkeleton from './components/HomeSkeleton';
import OutOfZoneScreen from '../../../../components/common/OutOfZoneScreen';
import AddressSelectionModal from '../Checkout/components/AddressSelectionModal';
import { userAuthService } from '../../../../services/authService';
import ScrapPromotionCard from './components/ScrapPromotionCard';
import DebugConsole from '../../components/common/DebugConsole';
import { getCategoryIllustration } from '../../utils/categoryIcons';
import { getSectionArtTheme, getSectionArtwork, getSectionArtworkFallback } from '../../utils/seasonalArtwork';




const mapCategories = (list) => (list || []).map(cat => {
  const dbIcon = cat.homeIconUrl || cat.icon || cat.iconUrl || cat.image || cat.imageUrl;
  return {
    id: cat.id || cat._id,
    _id: cat._id || cat.id,
    title: cat.title,
    slug: cat.slug,
    parentId: cat.parentId || null,
    homeIconUrl: cat.homeIconUrl || null,
    icon: (dbIcon ? toAssetUrl(dbIcon) : null) || getCategoryIllustration(cat.title),
    hasSaleBadge: Boolean(cat.hasSaleBadge),
    badge: cat.badge || cat.homeBadge || '',
    etaMinutes: cat.etaDefaultMinutes || cat.etaMinutes || null,
    etaDefaultMinutes: cat.etaDefaultMinutes || null,
    displayRating: cat.displayRating || '',
    bookingsLabel: cat.bookingsLabel || '',
    heroBanner: cat.heroBanner || null,
    showOnHome: cat.showOnHome !== false,
    homeOrder: cat.homeOrder || 0
  };
});


const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  if (clean.startsWith('/noteworthy') || clean.startsWith('/spotlight') || clean.startsWith('/categories') || clean.startsWith('/ServiceIcon') || clean.startsWith('/appliance') || clean.startsWith('/services') || clean.startsWith('/cleaning-essentials') || clean.startsWith('/cleaning')) {
    return clean;
  }
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

// All home sections are now 100% admin-managed via HomeContent.
// If admin has not configured a section it renders empty (standard CMS behavior).

const Home = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [address, setAddress] = useState(localStorage.getItem('currentAddress') || 'Select Location');
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);
  const [houseNumber, setHouseNumber] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Voice search: what was heard opens the search screen with the words filled in
  const [voiceQuery, setVoiceQuery] = useState(null);
  const voice = useVoiceSearch({
    onResult: (text) => {
      setVoiceQuery({ text, id: Date.now() });
      setIsSearchOpen(true);
    }
  });
  const [detectedCityName, setDetectedCityName] = useState(localStorage.getItem('currentCity') || null);


  const { cartCount, addToCart } = useCart();
  const { currentCity, cities, selectCity, loading: cityLoading } = useCity();
  const { isScrapEnabled } = useConfig();
  const { detectZone, zoneId, isOutOfZone, currentZone } = useZone();
  const { apiKey: configuredMapApiKey } = useGoogleMapsConfig();
  const { currentLanguage, mapLanguage, detectLanguageFromLocation, autoDetectEnabled, setLanguage } = useLanguage();

  // Clean up legacy storage keys on mount
  useEffect(() => {
    ['userAddress', 'detectedCity', 'user_formatted_address', 'user_city'].forEach(key => localStorage.removeItem(key));
  }, []);

  // Sync detectedCityName with Address on mount/update if not already set
  useEffect(() => {
    if (address && address !== 'Select Location' && cities && cities.length > 0) {
      const foundCity = cities.find(c =>
        address.toLowerCase().includes(c.name.toLowerCase())
      );
      if (foundCity) {
        if (detectedCityName !== foundCity.name) {
          setDetectedCityName(foundCity.name);
          localStorage.setItem('currentCity', foundCity.name);
        }
      } else {
        // Address is present but doesn't contain any supported city name
        // Try to parse ANY city from the address string (e.g. "Bhopal")
        const parts = address.split(',').map(p => p.trim());
        // Usually city is 2nd or 3rd to last in Google address strings
        const cityCandidate = parts.length > 2 ? parts[parts.length - 3] : (parts.length > 1 ? parts[parts.length - 2] : parts[0]);

        if (detectedCityName !== cityCandidate) {
          setDetectedCityName(cityCandidate);
          localStorage.setItem('currentCity', cityCandidate);
        }
      }
    }
  }, [address, cities, detectedCityName]);

  // Validate city whenever detected name or cities list changes
  useEffect(() => {
    if (!detectedCityName || !cities || cities.length === 0) return;

    const matchedCity = cities.find(c =>
      c.name.toLowerCase() === detectedCityName.toLowerCase() ||
      c.name.toLowerCase().includes(detectedCityName.toLowerCase()) ||
      detectedCityName.toLowerCase().includes(c.name.toLowerCase())
    );

    if (matchedCity) {
      const matchedId = matchedCity._id || matchedCity.id;
      const currentId = currentCity?._id || currentCity?.id;

      if (!cityLoading && currentId && matchedId !== currentId) {
        selectCity(matchedCity);
        toast.success(`Location updated to ${matchedCity.name}`);
      }
    } else if (currentCity) {
      // Unlisted city: show the default home content; booking still works wherever a worker is nearby
      selectCity(null);
    }
  }, [detectedCityName, cities, currentCity, cityLoading]);


  // Listen for user address selection updates
  useEffect(() => {
    const handleAddressSync = () => {
      const saved = localStorage.getItem('currentAddress');
      if (saved) setAddress(saved);
      const savedCity = localStorage.getItem('currentCity');
      if (savedCity) setDetectedCityName(savedCity);
    };
    window.addEventListener('userAddressSelected', handleAddressSync);
    return () => window.removeEventListener('userAddressSelected', handleAddressSync);
  }, []);

  const handleAddressSave = async (savedHouseNumber, locationObj) => {
    if (locationObj) {
      const newAddress = locationObj.address;
      setAddress(newAddress);
      localStorage.setItem('currentAddress', newAddress);
      if (typeof locationObj.lat === 'number' && typeof locationObj.lng === 'number') {
        try { localStorage.setItem('userCoords', JSON.stringify({ lat: locationObj.lat, lng: locationObj.lng })); } catch { /* ignore */ }
        detectZone(locationObj.lat, locationObj.lng);
      }

      // Try to parse city from location object (Google Places)
      const components = locationObj.components || locationObj.address_components || [];
      const getComponent = (type) => components.find(c => c.types.includes(type))?.long_name || '';

      let city = getComponent('locality') || getComponent('administrative_area_level_2');
      let state = getComponent('administrative_area_level_1') || '';
      let pincode = getComponent('postal_code') || '';

      // Fallback city parsing from address string if components failed
      if (!city && newAddress) {
        const parts = newAddress.split(',').map(p => p.trim());
        city = parts.length > 2 ? parts[parts.length - 3] : (parts.length > 1 ? parts[parts.length - 2] : parts[0]);
      }

      if (!pincode && newAddress) {
        const pinMatch = newAddress.match(/\b\d{6}\b/);
        if (pinMatch) pincode = pinMatch[0];
      }

      if (city) {
        setDetectedCityName(city);
        localStorage.setItem('currentCity', city);

        // Immediate update of selected city if supported
        if (cities && cities.length > 0) {
          const matchedCity = cities.find(c =>
            c.name.toLowerCase() === city.toLowerCase() ||
            c.name.toLowerCase().includes(city.toLowerCase()) ||
            city.toLowerCase().includes(c.name.toLowerCase())
          );
          if (matchedCity) {
            selectCity(matchedCity);
          } else {
            selectCity(null);
          }
        }

        toast.success(`Location set to ${city}`);
      }

      // Save to user's saved addresses in database so it shows in Manage Addresses
      try {
        const profile = await userAuthService.getProfile();
        if (profile.success && profile.user) {
          const existing = (profile.user.addresses || []).map(a => ({ ...a, isDefault: false }));
          const newSavedAddr = {
            type: locationObj.addressType || 'home',
            customName: locationObj.customName || '',
            addressLine1: newAddress,
            addressLine2: savedHouseNumber || '',
            city: city || 'City',
            state: state || 'State',
            pincode: pincode || '000000',
            landmark: locationObj.landmark || '',
            lat: locationObj.lat,
            lng: locationObj.lng,
            isDefault: true
          };
          existing.push(newSavedAddr);
          await userAuthService.updateProfile({ addresses: existing });
          window.dispatchEvent(new Event('userAddressSelected'));
        }
      } catch (err) {
        // User may be a guest
      }
    }
    setHouseNumber(savedHouseNumber);
    setIsAddressModalOpen(false);
  };

  // Auto-detect location on mount
  useEffect(() => {
    const autoDetectLocation = async () => {
      if (navigator.geolocation) {
        if (address === 'Select Location') {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              try {
                const { latitude, longitude } = position.coords;
                // Cache coordinates so category ETA badges can use them
                try { localStorage.setItem('userCoords', JSON.stringify({ lat: latitude, lng: longitude })); } catch { /* ignore */ }
                detectZone(latitude, longitude);

                let result = null;

                // 1. Try server-side reverse geocode endpoint (uses backend Google Maps API key, no client referrer restrictions)
                try {
                  const backendRes = await api.get('/public/reverse-geocode', {
                    params: { lat: latitude, lng: longitude, language: mapLanguage || 'en' }
                  });
                  if (backendRes.data?.success && backendRes.data?.result) {
                    result = backendRes.data.result;
                  }
                } catch (apiErr) {
                  // Fallback to direct client fetch
                }

                // 2. Direct client fetch fallback
                if (!result) {
                  try {
                    const apiKey = configuredMapApiKey || import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
                    const response = await fetch(
                      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}&language=${mapLanguage || 'en'}`
                    );
                    const data = await response.json();
                    if (data.status === 'OK' && data.results?.length > 0) {
                      result = data.results[0];
                    }
                  } catch (directErr) {
                    // Ignore direct fetch error
                  }
                }

                if (result) {
                  const getComponent = (type) =>
                    result.address_components?.find(c => c.types?.includes(type))?.long_name || '';

                  const area = getComponent('sublocality_level_1') || getComponent('neighborhood') || getComponent('locality');
                  const city = getComponent('locality') || getComponent('administrative_area_level_2');
                  const state = getComponent('administrative_area_level_1');

                  const formattedAddress = `${area ? area + ', ' : ''}${city ? city + ', ' : ''}${state}`;
                  setAddress(formattedAddress || result.formatted_address);
                  localStorage.setItem('currentAddress', formattedAddress || result.formatted_address);

                  if (city) {
                    setDetectedCityName(city);
                    localStorage.setItem('currentCity', city);

                    // Immediate update of selected city if supported
                    if (cities && cities.length > 0) {
                      const matchedCity = cities.find(c =>
                        c.name.toLowerCase() === city.toLowerCase() ||
                        c.name.toLowerCase().includes(city.toLowerCase()) ||
                        city.toLowerCase().includes(c.name.toLowerCase())
                      );
                      if (matchedCity) {
                        selectCity(matchedCity);
                      } else {
                        selectCity(null);
                      }
                    }
                  }
                }
              } catch (error) {
                // Silent fail
              }
            },
            (error) => {
              console.log("GPS Error:", error);
            },
            {
              enableHighAccuracy: true,
              timeout: 5000,
              maximumAge: 0
            }
          );
        }
      }
    };

    autoDetectLocation();

    // Register FCM token for user to receive push notifications
    registerFCMToken('user', true).catch(err => {/* Silent fail */ });
  }, []);

  // Revisits render instantly from the last known data; fresh data loads in the background
  const [initialSnapshot] = useState(() => publicCatalogService.peekHomeData(currentCity?._id || currentCity?.id, zoneId));
  const [categories, setCategories] = useState(() => mapCategories(initialSnapshot?.categories));
  const [homeContent, setHomeContent] = useState(() => initialSnapshot?.homeContent || null);
  const [loading, setLoading] = useState(() => !initialSnapshot);
  const hasDataRef = useRef(Boolean(initialSnapshot));

  // Handle scroll separately (only when needed)
  useEffect(() => {
    if (location.state?.scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.state?.scrollToTop, location.pathname]);

  // Fetch categories and home content on mount (and when city changes)
  useEffect(() => {
    const fetchData = async () => {
      // Full loader only when there is nothing to show yet
      if (!hasDataRef.current) setLoading(true);
      try {
        const cityId = currentCity?._id || currentCity?.id;
        const response = await publicCatalogService.getHomeData(cityId, zoneId);

        if (response.allCategories && response.allCategories.length > 0) {
          setCategories(mapCategories(response.allCategories));
        } else if (response.categories) {
          setCategories(mapCategories(response.categories));
        }
        if (response.homeContent) setHomeContent(response.homeContent);
        hasDataRef.current = true;
      } catch {
        // Keep showing the last known content
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Coming back to the app or tab picks up whatever the admin changed meanwhile
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => document.removeEventListener('visibilitychange', refreshWhenVisible);
  }, [currentCity, zoneId]);
  const handleSearch = (query) => {
    // Navigate to search results page
  };

  const handleCategoryClick = (category) => {
    const target = category?.slug || category?.id || category?._id;
    if (!target) return;
    // history state must be structured-cloneable, so pass plain data only
    navigate(`/user/category/${encodeURIComponent(target)}`, { state: { category: JSON.parse(JSON.stringify(category)) } });
  };

  const handlePromoClick = (promo) => {
    if (promo.targetCategoryId) {
      const cat = categories.find(c => (c.id === promo.targetCategoryId || c._id === promo.targetCategoryId));
      if (cat) {
        handleCategoryClick(cat);
        return;
      }
    }
    // Slug fallback: match slug (or whole-word title match) against the live
    // categories list. Lets static/default spotlight cards resolve to a real
    // category without the admin having to pick one.
    if (promo.slug) {
      const s = promo.slug.toLowerCase();
      const cat = categories.find(c => {
        const slug = (c.slug || '').toLowerCase();
        const title = (c.title || '').toLowerCase();
        return slug === s || title.includes(s) || s.includes(slug);
      });
      if (cat) {
        handleCategoryClick(cat);
        return;
      }
    }
    if (promo.route && !promo.slug) {
      if (promo.scrollToSection) {
        navigate(promo.route, {
          state: { scrollToSection: promo.scrollToSection }
        });
      } else {
        navigate(promo.route);
      }
    }
  };

  const findCategoryById = (id) => id && categories.find(c => c.id === id || c._id === id);

  // Category a home card belongs to: its admin link first, then a whole-word match on its title
  const resolveServiceCategory = (service) => {
    if (!service) return null;
    const linked = findCategoryById(service.targetCategoryId);
    if (linked) return linked;

    // Slug fallback: lets static/default cards point at a category by its slug
    // without the admin having to pick a specific category id.
    if (service.slug) {
      const s = service.slug.toLowerCase();
      const bySlug = categories.find(c => {
        const slug = (c.slug || '').toLowerCase();
        const name = (c.title || '').toLowerCase();
        return slug === s || slug.includes(s) || s.includes(slug) || name.includes(s);
      });
      if (bySlug) return bySlug;
    }

    const title = ` ${(service.title || '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ')} `;
    if (!title.trim()) return null;
    const byName = categories.find(c => {
      const name = (c.title || '').toLowerCase().trim();
      return name && title.includes(` ${name} `);
    });
    if (byName) return byName;

    return null;
  };

  // Category behind a whole row: admin "see all" link, else the one category all its cards share, else a title match
  const getSectionCategory = (section) => {
    const linked = findCategoryById(section?.seeAllTargetCategoryId);
    if (linked) return linked;
    const cardCats = (section?.cards || []).map(resolveServiceCategory);
    if (cardCats.length > 0 && cardCats.every(c => c && c.id === cardCats[0].id)) return cardCats[0];
    return resolveServiceCategory({ title: section?.title });
  };

  // "See all" of a row has its own page: /user/see-all/:sectionKey
  const openSeeAll = ({ title, subtitle, services, variant, category = null }) => {
    const brief = (c) => (c ? { id: c.id || c._id, slug: c.slug, title: c.title, image: c.image } : null);
    const section = {
      title,
      subtitle,
      variant,
      category: brief(category),
      // Each card remembers the category it opens, so the page needs no home data
      services: (services || []).map(service => ({ ...service, resolvedCategory: brief(resolveServiceCategory(service)) }))
    };
    const sectionKey = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    // history state must be structured-cloneable, so pass plain data only
    navigate(`/user/see-all/${sectionKey}`, { state: { section: JSON.parse(JSON.stringify(section)) } });
  };

  const handleServiceClick = (service) => {
    if (!service) return;
    const cat = resolveServiceCategory(service);
    if (cat) {
      handleCategoryClick({
        ...cat,
        title: service.title || cat.title,
        slug: service.slug || cat.slug,
        image: service.imageUrl || service.image || cat.image
      });
      return;
    }
    // Directly open ServiceCatalogModal with the clicked service
    handleCategoryClick({
      id: service.id || service._id || service.slug,
      title: service.title,
      slug: service.slug || service.title?.toLowerCase().replace(/\s+/g, '-'),
      image: service.imageUrl || service.image
    });
  };

  const handleAddClick = async (service) => {
    try {
      const linkedCat = findCategoryById(service.targetCategoryId);
      if (linkedCat) {
        handleCategoryClick({
          ...linkedCat,
          title: service.title || linkedCat.title,
          slug: service.slug || linkedCat.slug,
          image: service.imageUrl || service.image || linkedCat.image
        });
        return;
      }

      if (service.serviceId && service.categoryId) {
        const cartItemData = {
          serviceId: service.serviceId,
          categoryId: service.categoryId,
          title: service.title,
          description: service.subtitle || service.description || '',
          icon: service.image || '',
          category: service.category || 'Service',
          price: parseInt(service.price?.toString().replace(/,/g, '') || 0),
          originalPrice: service.originalPrice ? parseInt(service.originalPrice.toString().replace(/,/g, '')) : null,
          unitPrice: parseInt(service.price?.toString().replace(/,/g, '') || 0),
          serviceCount: 1,
          rating: service.rating || "",
          reviews: service.reviews || "",
          vendorId: service.vendorId || null,
          sectionId: service.sectionId || null
        };

        const response = await addToCart(cartItemData);
        if (response.success) {
          toast.success(`${service.title} added to cart!`);
          navigate('/user/cart');
        } else {
          toast.error(response.message || 'Failed to add to cart');
        }
      } else {
        // No direct service link: open its category so the user can pick the exact service
        handleServiceClick(service);
      }
    } catch (error) {
      toast.error('Failed to add to cart. Please try again.');
    }
  };

  const handleReferClick = () => {
    navigate('/user/rewards');
  };

  const handleLocationClick = () => {
    setIsAddressModalOpen(true);
  };

  // Animation Variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: -20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        type: "spring",
        stiffness: 100,
        damping: 15
      }
    }
  };

  // Every block fades in by itself. They used to wait for the page container to start them, and the
  // blocks that mounted a moment after it (the admin's category sections) were left hidden forever.
  const reveal = { variants: itemVariants, initial: initialSnapshot ? false : 'hidden', animate: 'visible' };

  if (loading) {
    return (
      <div className="h-[calc(100dvh-var(--bottom-nav-height,96px)-1rem)] overflow-hidden">
        <HomeSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative bg-canvas w-full max-w-full overflow-x-clip">
      <motion.div
        className="relative z-10 w-full max-w-full overflow-x-clip"
        initial={initialSnapshot ? false : 'hidden'}
        animate="visible"
        variants={containerVariants}
      >
        <motion.div
          {...reveal}
          className="sticky top-0 z-50 bg-canvas/90 backdrop-blur-xl w-full max-w-full overflow-x-clip"
        >
          <div className="max-w-screen-xl mx-auto w-full">
            <Header
              location={address}
              onLocationClick={handleLocationClick}
              showNotifications
            />
            <div className="px-4 sm:px-5 pb-2 pt-0 max-w-2xl mx-auto w-full min-w-0 max-w-full">
              <SearchBar suggestions={categories.filter(c => !c.parentId).map(c => c.title)} onInputClick={() => setIsSearchOpen(true)} onVoiceClick={voice.start} voiceSupported={voice.supported} />
            </div>
          </div>
        </motion.div>

        <main className="flex flex-col gap-4 sm:gap-5 max-w-screen-xl mx-auto w-full pb-6 overflow-x-clip min-w-0">
          {/* Outside every zone: the admin-edited "not in your area" page replaces the services */}
          {isOutOfZone ? (
            <OutOfZoneScreen embedded onChangeLocation={() => setIsAddressModalOpen(true)} />
          ) : (
            <>
              {/* Hero Section - Promo Carousel */}
              {homeContent?.isPromosVisible !== false && (homeContent?.promos || []).length > 0 && (
                <motion.section {...reveal} className="relative z-0 w-full max-w-full overflow-hidden min-w-0">
                  <PromoCarousel
                    promos={(homeContent?.promos || []).sort((a, b) => (a.order || 0) - (b.order || 0)).map(promo => ({
                      id: promo.id || promo._id,
                      title: promo.title || '',
                      subtitle: promo.subtitle || promo.description || '',
                      buttonText: promo.buttonText || 'Book now',
                      className: promo.gradientClass || 'from-[#00A6A6] to-[#008a8a]',
                      image: toAssetUrl(promo.imageUrl),
                      targetCategoryId: promo.targetCategoryId,
                      slug: promo.slug,
                      scrollToSection: promo.scrollToSection,
                      route: '/'
                    }))}
                    onPromoClick={handlePromoClick}
                  />
                </motion.section>
              )}

              {/* Categories Section */}
              {homeContent?.isCategoriesVisible !== false && (
                <motion.section {...reveal} className="relative w-full max-w-full overflow-hidden min-w-0">
                  <ServiceCategories
                    categories={categories}
                    onCategoryClick={handleCategoryClick}
                    limit={homeContent?.homeCategoryLimit}
                    showAllServices={homeContent?.showAllServicesTile !== false}
                    allServicesLabel={homeContent?.allServicesLabel}
                    showScrapTile={isScrapEnabled && homeContent?.isScrapVisible !== false}
                  />
                </motion.section>
              )}

              {/* Scrap banner, right under the categories so it is seen without scrolling */}
              {(isScrapEnabled && homeContent?.isScrapVisible !== false) && (
                <motion.section {...reveal} className="pt-3">
                  <ScrapPromotionCard onClick={() => navigate('/user/scrap')} />
                </motion.section>
              )}

              {/* In the Spotlight Section (Urban-Company hero banners) */}
              {homeContent?.isSpotlightVisible !== false && (() => {
                const items = (homeContent?.spotlight || []).length > 0
                  ? homeContent.spotlight
                    .slice()
                    .sort((a, b) => (a.order || 0) - (b.order || 0))
                    .map(item => ({
                      ...item,
                      imageUrl: toAssetUrl(item.imageUrl)
                    }))
                  : [];
                if (items.length === 0) return null;
                return (
                  <motion.section {...reveal} className="relative w-full max-w-full overflow-hidden min-w-0">
                    <SpotlightCarousel items={items} onItemClick={handlePromoClick} />
                  </motion.section>
                );
              })()}

              {/* New & Noteworthy (right below Spotlight) */}
              {homeContent?.isNoteworthyVisible !== false && (() => {
                const adminItems = (homeContent?.noteworthy || [])
                  .filter(item => item && item.title)
                  .slice()
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map(item => ({
                    id: item.id || item._id,
                    title: item.title,
                    subtitle: item.subtitle,
                    badge: item.badge,
                    duration: item.duration,
                    image: toAssetUrl(item.imageUrl),
                    slug: item.slug,
                    targetCategoryId: item.targetCategoryId,
                    targetServiceId: item.targetServiceId
                  }));
                const items = adminItems;
                if (items.length === 0) return null;
                return (
                  <motion.div {...reveal}>
                    <Suspense fallback={<div className="h-44 bg-gray-50 animate-pulse rounded-2xl mx-4" />}>
                      <NewAndNoteworthy
                        services={items}
                        onServiceClick={handleServiceClick}
                      />
                    </Suspense>
                  </motion.div>
                );
              })()}

              {/* Most Booked (right below New & Noteworthy) */}
              {homeContent?.isBookedVisible !== false && (() => {
                const adminBooked = (homeContent?.booked || [])
                  .filter(item => item && item.title)
                  .slice()
                  .sort((a, b) => (a.order || 0) - (b.order || 0))
                  .map(item => ({
                    id: item.id || item._id,
                    title: item.title,
                    rating: item.rating,
                    reviews: item.reviews,
                    price: item.price,
                    originalPrice: item.originalPrice,
                    discount: item.discount,
                    optionsCount: item.optionsCount,
                    image: toAssetUrl(item.imageUrl),
                    targetCategoryId: item.targetCategoryId,
                    slug: item.slug
                  }));
                const items = adminBooked;
                if (items.length === 0) return null;
                return (
                  <motion.div {...reveal}>
                    <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                      <MostBookedServices
                        services={items}
                        onServiceClick={handleServiceClick}
                        onAddClick={handleAddClick}
                        onSeeAllClick={(services) => openSeeAll({ title: 'Most booked services', services, variant: 'booked' })}
                      />
                    </Suspense>
                  </motion.div>
                );
              })()}


              {/* Dynamic Category Sections — all admin-managed. Visibility controlled
                  per-section via admin UI (delete or set isVisible=false). No hardcoded
                  title filters here. */}
              {homeContent?.isCategorySectionsVisible !== false && (homeContent?.categorySections || []).filter(s => (s.cards || []).length > 0 && !/winter/i.test(s.title || '')).sort((a, b) => (a.order || 0) - (b.order || 0)).map((section, sIdx) => {
                const isAppliance = (section.title || '').toLowerCase().includes('appliance');
                // Admin's first banner is injected right above the "Electric" section
                const isElectric = /electric|electrician/i.test(section.title || '');
                const electricBanner = isElectric && homeContent?.isBannersVisible !== false && homeContent?.banners?.[0]?.imageUrl ? (
                  <motion.div key={`banner-above-${section._id || sIdx}`} {...reveal}>
                    <Suspense fallback={<div className="mx-4 aspect-3/1 bg-slate-100 animate-pulse rounded-[22px]" />}>
                      <Banner
                        imageUrl={toAssetUrl(homeContent.banners[0].imageUrl)}
                        onClick={() => {
                          const b = homeContent?.banners?.[0];
                          if (b?.slug) { navigate(`/user/${b.slug}`); return; }
                          if (b?.targetCategoryId) {
                            const cat = categories.find(c => c.id === b.targetCategoryId);
                            if (cat) handleCategoryClick(cat);
                          }
                        }}
                      />
                    </Suspense>
                  </motion.div>
                ) : null;

                if (isAppliance) {
                  return (
                    <React.Fragment key={section._id || sIdx}>
                      {electricBanner}
                      <motion.div {...reveal}>
                        <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                          <ApplianceRepairSection
                            title="Appliance repair & service"
                            subtitle={section.subtitle}
                            services={section.cards?.map((card, cIdx) => ({
                              id: card._id || cIdx,
                              title: card.title,
                              rating: card.rating || "",
                              reviews: card.reviews || "",
                              price: card.price,
                              originalPrice: card.originalPrice,
                              discount: card.discount,
                              badge: card.badge,
                              optionsCount: card.optionsCount,
                              image: toAssetUrl(card.imageUrl),
                              targetCategoryId: card.targetCategoryId,
                              slug: card.slug
                            })) || []}
                            onSeeAllClick={(services) => openSeeAll({
                              title: 'Appliance repair & service',
                              subtitle: section.subtitle,
                              services,
                              variant: 'appliance',
                              category: getSectionCategory(section)
                            })}
                            onServiceClick={(service) => handleServiceClick(service)}
                            onAddClick={handleAddClick}
                          />
                        </Suspense>
                      </motion.div>
                    </React.Fragment>
                  );
                }

                // Themed sections (winter, electrical) use a matching illustration for each service
                const artTheme = getSectionArtTheme(section.title);
                return (
                  <React.Fragment key={section._id || sIdx}>
                    {electricBanner}
                    <motion.div {...reveal}>
                      <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                        <ServiceSectionWithRating
                          title={section.title}
                          subtitle={section.subtitle}
                          services={section.cards?.map((card, cIdx) => {
                            // The admin's image wins; the built-in illustration only fills in when there is none
                            const sectionArt = artTheme ? getSectionArtwork(artTheme, card.title) : null;
                            const processedImage = toAssetUrl(card.imageUrl) || sectionArt;
                            return {
                              id: card._id || cIdx,
                              title: card.title,
                              rating: card.rating || "",
                              reviews: card.reviews || "",
                              price: card.price,
                              originalPrice: card.originalPrice,
                              discount: card.discount,
                              badge: card.badge,
                              optionsCount: card.optionsCount,
                              image: processedImage,
                              fallbackImage: artTheme ? (sectionArt || getSectionArtworkFallback(artTheme)) : null,
                              targetCategoryId: card.targetCategoryId,
                              slug: card.slug
                            };
                          }) || []}
                          onSeeAllClick={(services) => openSeeAll({
                            title: section.title,
                            subtitle: section.subtitle,
                            services,
                            category: getSectionCategory(section)
                          })}
                          onServiceClick={(service) => handleServiceClick(service)}
                          onAddClick={handleAddClick}
                        />
                      </Suspense>
                    </motion.div>
                  </React.Fragment>
                );
              })}

              {/* Cleaning Essentials is now purely admin-driven: admin creates a
                  categorySection titled "Cleaning Essentials" (or similar) and it
                  renders in the dynamic categorySections map above. No fallback. */}

              {/* Dynamic Banner 1 (banners[1]) — banners[0] is injected above Electric above */}
              {homeContent?.isBannersVisible !== false && Boolean(homeContent?.banners?.[1]?.imageUrl) && (
                <motion.div {...reveal}>
                  <Suspense fallback={<div className="mx-4 aspect-3/1 bg-slate-100 animate-pulse rounded-[22px]" />}>
                    <Banner
                      imageUrl={toAssetUrl(homeContent.banners[1].imageUrl)}
                      onClick={() => {
                        const b = homeContent?.banners?.[1];
                        if (b?.slug) {
                          navigate(`/user/${b.slug}`);
                          return;
                        }
                        if (b?.targetCategoryId) {
                          const cat = categories.find(c => c.id === b.targetCategoryId);
                          if (cat) handleCategoryClick(cat);
                        }
                      }}
                    />
                  </Suspense>
                </motion.div>
              )}

              {/* Curated Services */}
              {homeContent?.isCuratedVisible !== false && (homeContent?.curated || []).filter(item => item.title && (item.gifUrl || item.imageUrl || item.youtubeUrl)).length > 0 && (
                <motion.div {...reveal}>
                  <Suspense fallback={<div className="h-40 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                    <CuratedServices
                      services={(homeContent?.curated || [])
                        .filter(item => item.title && (item.gifUrl || item.imageUrl || item.youtubeUrl))
                        .sort((a, b) => (a.order || 0) - (b.order || 0))
                        .map(item => ({
                          id: item.id || item._id,
                          title: item.title,
                          gif: toAssetUrl(item.gifUrl || item.imageUrl),
                          youtubeUrl: item.youtubeUrl || '',
                          slug: item.slug,
                          targetCategoryId: item.targetCategoryId
                        }))}
                      onServiceClick={handleServiceClick}
                    />
                  </Suspense>
                </motion.div>
              )}

              {/* Dynamic Banner 2 (banners[2]) */}
              {homeContent?.isBannersVisible !== false && Boolean(homeContent?.banners?.[2]?.imageUrl) && (
                <motion.div {...reveal}>
                  <Suspense fallback={<div className="mx-4 aspect-3/1 bg-slate-100 animate-pulse rounded-[22px]" />}>
                    <Banner
                      imageUrl={toAssetUrl(homeContent.banners[2].imageUrl)}
                      onClick={() => {
                        const b = homeContent?.banners?.[2];
                        if (b?.targetCategoryId) {
                          const cat = categories.find(c => (c.id === b.targetCategoryId || c._id === b.targetCategoryId));
                          if (cat) handleCategoryClick(cat);
                        }
                      }}
                    />
                  </Suspense>
                </motion.div>
              )}

              {/* Refer & Earn Section */}
              <motion.div {...reveal}>
                <Suspense fallback={<div className="h-32 bg-gray-50 animate-pulse rounded-xl mx-4" />}>
                  <ReferEarnSection onReferClick={handleReferClick} />
                </Suspense>
              </motion.div>
            </>
          )}
        </main>
      </motion.div>

      {/* Removed local BottomNav, rendered by routes */}

      {/* Search Overlay */}
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => { setIsSearchOpen(false); setVoiceQuery(null); }}
        categories={categories}
        onCategoryClick={handleCategoryClick}
        voiceQuery={voiceQuery}
        voiceSupported={voice.supported}
        onVoiceClick={voice.start}
      />

      {/* Voice search: the "Listening…" sheet */}
      <VoiceSearchSheet voice={voice} onTypeInstead={() => setIsSearchOpen(true)} />

      {/* Address Selection Modal */}
      <AddressSelectionModal
        isOpen={isAddressModalOpen}
        onClose={() => setIsAddressModalOpen(false)}
        houseNumber={houseNumber}
        onHouseNumberChange={setHouseNumber}
        onSave={handleAddressSave}
      />

      <DebugConsole />
    </div>
  );
};

export default Home;
