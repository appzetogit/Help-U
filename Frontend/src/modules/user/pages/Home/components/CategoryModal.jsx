import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { FiX, FiLayers, FiArrowLeft, FiPlus, FiCheck } from 'react-icons/fi';
import { AnimatePresence, motion } from 'framer-motion';
import { themeColors } from '../../../../../theme';
import { publicCatalogService } from '../../../../../services/catalogService';
import { useCart } from '../../../../../context/CartContext';
import { toast } from 'react-hot-toast';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const CategoryModal = React.memo(({ isOpen, onClose, category, location, cartCount, currentCity }) => {
  const navigate = useNavigate();
  const { addToCart } = useCart();
  const [isClosing, setIsClosing] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const [view, setView] = useState('brands'); // 'brands' | 'services'
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [services, setServices] = useState([]); // Sub-services
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const cityId = currentCity?._id || currentCity?.id;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setIsClosing(false);
      // Reset state on close
      setTimeout(() => {
        setView('brands');
        setSelectedBrand(null);
        setBrands([]);
        setServices([]);
        setIsRedirecting(false);
      }, 300);
    } else if (category?.id) {
      if (category.initialBrand) {
        // Direct to brand services if initialBrand is provided (from search)
        const brand = category.initialBrand;
        setSelectedBrand(brand);
        setView('services');
        fetchServices(brand.id || brand._id);
      }
      // Always fetch brands for this category to populate the background/back-navigation
      fetchBrands();
    }
  }, [isOpen, category?.id, cityId]);

  const fetchBrands = async () => {
    try {
      setLoading(true);
      const response = await publicCatalogService.getBrands({
        categoryId: category.id,
        cityId: cityId
      });
      if (response.success) {
        setBrands(response.brands || []);
      }
    } catch (error) {
      console.error("Failed to load brands:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchServices = async (brandId) => {
    try {
      setLoading(true);
      const response = await publicCatalogService.getServices({
        brandId: brandId,
        cityId: cityId,
        categoryId: category?.id
      });
      if (response.success) {
        setServices(response.services || []);
      }
    } catch (error) {
      console.error("Failed to load services:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleBrandClick = (brand) => {
    setSelectedBrand(brand);
    setView('services');
    fetchServices(brand.id || brand._id);
  };

  const handleBackToBrands = () => {
    setView('brands');
    setSelectedBrand(null);
    setServices([]);
  };

  const handleServiceClick = async (service) => {
    // Add to cart logic
    try {
      const cartItemData = {
        serviceId: service.id || service._id,
        categoryId: category?.id,
        title: service.title,
        description: service.description || '',
        icon: toAssetUrl(service.icon || ''),
        category: category?.title,
        categoryTitle: category?.title || '', // Explicit field
        categoryIcon: toAssetUrl(category?.homeIconUrl || category?.iconUrl || ''), // Explicit field
        // Brand info — stored as sectionTitle/sectionIcon for booking flow
        sectionId: selectedBrand?.id || selectedBrand?._id || null, // VITAL: Added for plan benefits
        sectionTitle: selectedBrand?.title || '',
        sectionIcon: toAssetUrl(selectedBrand?.iconUrl || selectedBrand?.icon || ''),
        price: service.discountPrice || service.basePrice,
        originalPrice: service.discountPrice ? service.basePrice : null,
        unitPrice: service.discountPrice || service.basePrice,
        serviceCount: 1,
        rating: "4.8",
        reviews: "1k+",
        vendorId: service.vendorId || selectedBrand?.vendorId || null,
        card: {
          title: service.title,
          subtitle: service.description || '',
          price: service.discountPrice || service.basePrice,
          originalPrice: service.discountPrice ? service.basePrice : null,
          duration: service.duration || '',
          description: service.description || '',
          imageUrl: toAssetUrl(service.icon || ''),
          features: service.features || []
        }
      };

      const response = await addToCart(cartItemData);
      if (response.success) {
        setIsRedirecting(true);
        setTimeout(() => {
          navigate('/user/cart');
        }, 1200);
      } else {
        toast.error(response.message || 'Failed to add to cart');
      }
    } catch (error) {
      toast.error('Failed to add to cart');
    }
  };

  if (!isOpen && !isClosing) return null;
  if (!mounted) return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[9998]"
            onClick={onClose}
            style={{
              position: 'fixed',
              willChange: 'opacity',
              transform: 'translateZ(0)',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-[9999]"
            style={{
              position: 'fixed',
              willChange: 'transform',
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
            }}
          >
            {/* Close Button */}
            <div className="absolute -top-12 right-4 z-[60]">
              <button
                onClick={onClose}
                className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors"
              >
                <FiX className="w-6 h-6 text-gray-800" />
              </button>
            </div>

            <div className="bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto min-h-[50vh]">
              {isRedirecting ? (
                <div className="flex flex-col items-center justify-center min-h-[40vh] py-12">
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                    className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mb-6"
                  >
                    <FiCheck className="w-10 h-10 text-green-500" />
                  </motion.div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Service Added!</h3>
                  <p className="text-gray-500 text-sm">Proceeding to checkout...</p>
                </div>
              ) : (
                <div className="px-4 py-6">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-6">
                    {view === 'services' && (
                      <button
                        onClick={handleBackToBrands}
                        className="p-1 rounded-full hover:bg-gray-100"
                      >
                        <FiArrowLeft className="w-6 h-6 text-gray-800" />
                      </button>
                    )}
                    <div>
                      <h1 className="text-xl font-bold text-gray-900">
                        {view === 'brands' ? (category?.title || 'Brands') : (selectedBrand?.title || 'Services')}
                      </h1>
                      {view === 'services' && <p className="text-xs text-gray-500">Select a service to add</p>}
                    </div>
                    {loading && <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin ml-auto"></div>}
                  </div>

                  {/* Content */}
                  {loading && (view === 'brands' ? brands.length === 0 : services.length === 0) ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-4 animate-pulse">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className="flex flex-col items-center">
                          <div className="w-20 h-20 bg-gray-200 rounded-2xl mb-2"></div>
                          <div className="h-3 w-16 bg-gray-200 rounded"></div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {view === 'brands' ? (
                        // Brands Grid
                        brands.length > 0 ? (
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-4">
                            {brands.map((brand) => (
                              <div
                                key={brand.id || brand._id}
                                onClick={() => handleBrandClick(brand)}
                                className="flex flex-col items-center cursor-pointer group active:scale-95 transition-all"
                              >
                                <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center mb-2 group-hover:bg-gray-100 transition-colors shadow-sm overflow-hidden border border-gray-100 relative">
                                  {brand.icon ? (
                                    <img
                                      src={toAssetUrl(brand.icon)}
                                      alt={brand.title}
                                      className="w-14 h-14 object-contain group-hover:scale-110 transition-transform"
                                      loading="lazy"
                                    />
                                  ) : (
                                    <FiLayers className="w-8 h-8 text-gray-300" />
                                  )}
                                  {brand.badge && (
                                    <span className="absolute top-0 right-0 bg-purple-100 text-purple-700 text-[9px] font-bold px-1.5 py-0.5 rounded-bl-lg">
                                      {brand.badge}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] font-bold text-gray-800 text-center leading-tight line-clamp-2 px-1">
                                  {brand.title}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-500">
                            <p>No brands found in this category.</p>
                          </div>
                        )
                      ) : (
                        // Services List
                        services.length > 0 ? (
                          <div className="space-y-4">
                            {services.map((svc) => (
                              <div key={svc.id || svc._id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:shadow-md transition-shadow">
                                <div className="flex-1 pr-4">
                                  <h3 className="font-black text-gray-900 text-[15px] leading-snug mb-0.5">{svc.title}</h3>
                                  <div className="flex items-center gap-2">
                                    <span className="text-lg font-black text-emerald-600">₹{svc.discountPrice || svc.basePrice}</span>
                                    {svc.discountPrice && svc.discountPrice < svc.basePrice && (
                                      <span className="text-xs text-gray-400 line-through font-bold opacity-60">₹{svc.basePrice}</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleServiceClick(svc)}
                                  className="px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-green-100"
                                >
                                  <FiPlus /> Add
                                </button>
                              </div>
                            ))}
                            
                            {/* Bottom Disclaimer */}
                            <div className="mt-6 mb-6 p-4 sm:p-5 rounded-2xl bg-slate-50 border-2 border-slate-200 flex items-start gap-4 shadow-sm">
                              <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-md shadow-amber-500/25 font-black text-lg">
                                ℹ
                              </div>
                              <div className="space-y-1.5 flex-1">
                                <div className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-wide">
                                  Pricing Disclaimer
                                </div>
                                <p className="text-sm sm:text-base text-slate-800 font-semibold leading-snug">
                                  Prices shown are <span className="font-black text-slate-950 underline decoration-amber-500 decoration-2">starting base charges</span> only. Any required spare parts, materials, or extra repair work will be charged additionally after on-site inspection.
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-12 text-gray-500">
                            <p>No services available for this brand yet.</p>
                          </div>
                        )
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
});

CategoryModal.displayName = 'CategoryModal';
export default CategoryModal;
