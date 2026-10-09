import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiArrowLeft, FiClock, FiTrendingUp, FiX, FiLayers, FiChevronRight } from 'react-icons/fi';
import { publicCatalogService } from '../../../../../services/catalogService';
import { themeColors } from '../../../../../theme';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const SearchOverlay = ({ isOpen, onClose, categories = [], onCategoryClick }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const [trendingServices, setTrendingServices] = useState([]);
  const inputRef = useRef(null);

  // Load recent searches and trending services on mount
  useEffect(() => {
    const saved = localStorage.getItem('recent_searches');
    if (saved) {
      setRecentSearches(JSON.parse(saved).slice(0, 5));
    }

    // Fetch trending services (Most Booked)
    const fetchTrending = async () => {
      try {
        const res = await publicCatalogService.getHomeContent();
        if (res.success && res.homeContent?.booked && res.homeContent.booked.length > 0) {
          // Take top 5 most booked services, EXCLUDING 'Fan Installation', 'Top Load', etc.
          const filtered = res.homeContent.booked.filter(s =>
            !s.title.toLowerCase().includes('fan install') &&
            !s.title.toLowerCase().includes('fan repair') &&
            !s.title.toLowerCase().includes('top load') &&
            !s.title.toLowerCase().includes('automatic')
          );
          setTrendingServices(filtered.slice(0, 5));
        } else {
          // Fallback to project-specific trending services if API returns empty
          console.log('Using fallback trending services');
          setTrendingServices([
            { id: 'trend-1', title: 'AC Repair & Service', category: 'AC & Appliance', imageUrl: '/assets/icons/services/ac.png' },
            { id: 'trend-2', title: 'Washing Machine Repair', category: 'AC & Appliance', imageUrl: '/assets/icons/services/washing-machine.png' },
            { id: 'trend-3', title: 'Microwave Repair', category: 'AC & Appliance', imageUrl: '/assets/icons/services/microwave.png' },
            { id: 'trend-4', title: 'Refrigerator Repair', category: 'AC & Appliance', imageUrl: '/assets/icons/services/refrigerator.png' },
            { id: 'trend-5', title: 'RO Water Purifier Service', category: 'AC & Appliance', imageUrl: '/assets/icons/services/ro.png' }
          ]);
        }
      } catch (error) {
        console.error("Failed to load trending services", error);
        // Fallback on error too
        setTrendingServices([
          { id: 'trend-1', title: 'AC Repair & Service', category: 'AC & Appliance' },
          { id: 'trend-2', title: 'Washing Machine Repair', category: 'AC & Appliance' },
          { id: 'trend-3', title: 'Microwave Repair', category: 'AC & Appliance' },
          { id: 'trend-4', title: 'Refrigerator Repair', category: 'AC & Appliance' },
          { id: 'trend-5', title: 'RO Water Purifier Service', category: 'AC & Appliance' }
        ]);
      }
    };
    fetchTrending();
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (query.trim().length >= 2) {
        setLoading(true);
        try {
          const lowerQ = query.toLowerCase();

          // 1. Search Categories (Local)
          const categoryMatches = categories.filter(c =>
            c.title.toLowerCase().includes(lowerQ)
          ).map(c => ({ ...c, isCategory: true }));

          // 2. Search Services (API)
          const response = await publicCatalogService.getServices({ search: query });
          let serviceMatches = [];

          if (response.success) {
            serviceMatches = response.services;
          }

          // Combine: Categories first, then Services
          setResults([...categoryMatches, ...serviceMatches]);

        } catch (error) {
          console.error("Search failed", error);
        } finally {
          setLoading(false);
        }
      } else {
        setResults([]);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [query, categories]);

  const handleResultClick = (item) => {
    // Add to recent searches
    const newRecent = [item.title, ...recentSearches.filter(s => s !== item.title)].slice(0, 5);
    setRecentSearches(newRecent);
    localStorage.setItem('recent_searches', JSON.stringify(newRecent));

    onClose();

    // 1. Handle Category Click
    if (item.isCategory) {
      onCategoryClick(item);
      return;
    }

    // 2. Handle Service/Brand Click
    let catId = item.categoryId || item.targetCategoryId || item.categoryId;
    let category = null;

    if (catId) {
      category = categories.find(c => (c.id === catId || c._id === catId));
    }

    if (!category && item.category) {
      category = categories.find(c => c.title === item.category);
    }

    if (category) {
      // If it's a service match, tell the modal to open THIS brand immediately
      const initialBrand = item.brandId ? {
        id: item.brandId,
        title: item.brandName || item.category,
        iconUrl: item.brandIcon || item.icon
      } : (item.id && !item.isCategory ? item : null);

      onCategoryClick({
        ...category,
        initialBrand: initialBrand
      });
    }
  };

  const handleTermClick = (term) => {
    setQuery(term);
  };

  const clearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent_searches');
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 bg-white z-[9999] flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-gray-100 shadow-sm bg-white">
            <button
              onClick={onClose}
              className="p-2 -ml-2 rounded-full hover:bg-gray-100 transition-colors"
            >
              <FiArrowLeft className="w-6 h-6 text-gray-700" />
            </button>
            <div className="flex-1 relative">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search for services..."
                className="w-full pl-10 pr-4 py-3 bg-gray-100 rounded-xl focus:bg-white focus:ring-2 focus:ring-primary-100 transition-all border-none outline-none text-base font-medium text-gray-900"
                style={{ '--tw-ring-color': `${themeColors.primary}33` }}
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 bg-gray-200 rounded-full"
                >
                  <FiX className="w-3 h-3 text-gray-600" />
                </button>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto bg-gray-50/50">
            {query.length >= 2 ? (
              // Create Search Results List
              <div className="p-4 space-y-3">
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-10 opacity-60">
                    <div className="w-8 h-8 border-2 border-gray-300 border-t-primary-500 rounded-full animate-spin mb-2" style={{ borderTopColor: themeColors.primary }}></div>
                    <p className="text-sm text-gray-500">Searching...</p>
                  </div>
                ) : results.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between mb-4 mt-2">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Search Results</p>
                      <span className="text-[10px] text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded-full">{results.length} found</span>
                    </div>
                    {results.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleResultClick(item)}
                        className="flex items-center gap-4 p-4 bg-white rounded-2xl active:scale-[0.98] active:bg-gray-50 transition-all cursor-pointer border border-gray-100 hover:border-primary-100 shadow-sm group"
                      >
                        <div className="w-14 h-14 bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden shrink-0 border border-gray-100 group-hover:bg-primary-50/30 transition-colors">
                          {(item.icon || item.imageUrl || item.brandIcon) ? (
                            <img
                              src={toAssetUrl(item.icon || item.brandIcon || item.imageUrl)}
                              alt=""
                              className="w-10 h-10 object-contain group-hover:scale-110 transition-transform duration-300"
                            />
                          ) : (
                            <FiLayers className="w-7 h-7 text-gray-300" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 text-[15px] truncate group-hover:text-primary-600 transition-colors">
                            {item.title}
                          </h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.isCategory ? (
                              <span className="text-[10px] font-bold bg-blue-50 text-blue-500 px-2 py-0.5 rounded-md uppercase tracking-tighter">Category</span>
                            ) : (
                              <span className="text-[11px] font-semibold text-gray-500 flex items-center gap-1">
                                {item.brandName || item.category || 'Service'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-primary-50 group-hover:text-primary-600 transition-colors">
                          <FiChevronRight className="w-4 h-4 text-gray-400 group-hover:translate-x-0.5 transition-transform" />
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="text-center py-20">
                    <p className="text-gray-500 font-medium">No services found for "{query}"</p>
                    <p className="text-sm text-gray-400 mt-1">Try a different keyword</p>
                  </div>
                )}
              </div>
            ) : (
              // Default State (Recent & Popular)
              <div className="p-5 space-y-8">
                {/* Recent Searches */}
                {recentSearches.length > 0 && (
                  <section>
                    <div className="flex justify-between items-center mb-3">
                      <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                        <FiClock className="text-gray-400" /> Recent Searches
                      </h3>
                      <button onClick={clearRecent} className="text-xs text-red-500 font-semibold hover:text-red-600">Clear</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recentSearches.map((term, i) => (
                        <button
                          key={i}
                          onClick={() => handleTermClick(term)}
                          className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all active:scale-95 shadow-sm"
                        >
                          {term}
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                {/* Popular Services */}
                {trendingServices.length > 0 && (
                  <section>
                    <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2 mb-3">
                      <FiTrendingUp className="text-blue-500" /> Trending Services
                    </h3>
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                      {trendingServices.map((service) => (
                        <button
                          key={service.id}
                          onClick={() => handleResultClick(service)}
                          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 bg-white transition-colors text-left group"
                        >
                          <div className="flex items-center gap-3">
                            {service.imageUrl && (
                              <img src={toAssetUrl(service.imageUrl)} alt="" className="w-8 h-8 rounded-lg object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            )}
                            <span className="font-medium text-gray-700 group-hover:text-gray-900 transition-colors">{service.title}</span>
                          </div>
                          <FiChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                        </button>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default SearchOverlay;
