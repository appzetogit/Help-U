import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { FiX, FiArrowLeft, FiPlus, FiCheck, FiClock, FiMinus, FiPhoneCall, FiEdit3 } from 'react-icons/fi';
import { AnimatePresence, motion } from 'framer-motion';
import { themeColors } from '../../../../../theme';
import { publicCatalogService } from '../../../../../services/catalogService';
import { optimizeCloudinaryUrl } from '../../../../../utils/cloudinaryOptimize';
import { useCart } from '../../../../../context/CartContext';
import { toast } from 'react-hot-toast';
import ModalLock from '../../../../../components/common/ModalLock';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

// The catalog's catch-all brand ("OTHER", "Others", "Other brand")
const isOtherBrand = (brand) => /^others?(\s+brands?)?$/i.test((brand?.title || '').trim());

// Brand names typed all-caps or all-lowercase in admin: "CROMPTON" / "crompton" -> "Crompton",
// short acronyms "lg" / "ifb" -> "LG" / "IFB". Mixed case (e.g. "McCoy") is kept as typed.
const formatBrandName = (title = '') => {
  const t = (title || '').trim();
  if (t !== t.toUpperCase() && t !== t.toLowerCase()) return t;
  return t.toLowerCase().split(/\s+/).map(word =>
    word.length <= 3 ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
};

// Typed brand name: letters, numbers, spaces and & . ' - only; single spaces; max 40
const cleanBrandInput = (value) => value.replace(/[^\p{L}\p{N} &.'-]/gu, '').replace(/\s+/g, ' ').slice(0, 40);

const CategoryModal = React.memo(({ isOpen, onClose, category, location, cartCount, currentCity }) => {
  const navigate = useNavigate();
  const { addToCart, cartItems, removeItem } = useCart();
  const [busyServiceId, setBusyServiceId] = useState(null);
  const [isClosing, setIsClosing] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const [view, setView] = useState('brands'); // 'brands' | 'services'
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [services, setServices] = useState([]); // Sub-services
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Hourly services ask for a duration before they can be added to cart.
  const [hoursPickerSvc, setHoursPickerSvc] = useState(null);
  const [pickedHours, setPickedHours] = useState(1);
  // "Other" brand: ask the user which brand they have
  const [otherPrompt, setOtherPrompt] = useState(null); // the catalog's Other brand while asking
  const [otherBrandInput, setOtherBrandInput] = useState('');

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
        setOtherPrompt(null);
        setOtherBrandInput('');
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

  const openBrandServices = (brand) => {
    setSelectedBrand(brand);
    setView('services');
    fetchServices(brand.id || brand._id);
  };

  const handleBrandClick = (brand) => {
    if (isOtherBrand(brand)) {
      setOtherBrandInput(selectedBrand?.customName || '');
      setOtherPrompt(brand);
      return;
    }
    openBrandServices(brand);
  };

  const confirmOtherBrand = (e) => {
    e?.preventDefault();
    const name = otherBrandInput.trim();
    if (name.length < 2) {
      toast.error('Please enter your brand name');
      return;
    }
    const brand = otherPrompt;
    setOtherPrompt(null);
    // Keep the catalog's Other brand (its services) and remember the typed name
    openBrandServices({ ...brand, customName: name });
  };

  const handleBackToBrands = () => {
    setView('brands');
    setSelectedBrand(null);
    setServices([]);
  };

  // Hourly services need a duration before pricing is known; everything else
  // adds straight away. quote_required is never clickable (see the card UI).
  const handleServiceClick = async (service, hours) => {
    if (service.pricingType === 'quote_required') return;
    if (service.pricingType === 'hourly' && !hours) {
      setPickedHours(service.minHours || 1);
      setHoursPickerSvc(service);
      return;
    }

    try {
      const isHourly = service.pricingType === 'hourly';
      const rate = service.hourlyRate || service.basePrice;
      // For fixed/starting_from/inspection_fee, service.amount (resolved by
      // the backend's getDisplayPricing) already is the right unit price;
      // discountPrice still wins when present, same as the existing fixed flow.
      const unitPrice = isHourly
        ? Math.round((rate || 0) * hours * 100) / 100
        : (service.discountPrice || service.amount || service.basePrice);
      const originalUnitPrice = isHourly
        ? null
        : (service.discountPrice ? (service.amount || service.basePrice) : null);

      const durationLabel = isHourly
        ? `${hours} hr${hours === 1 ? '' : 's'}`
        : (service.duration || '');

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
        sectionId: selectedBrand?.id || selectedBrand?._id || null,
        // Typed brand for "Other" reaches the booking (brandName) and the worker's job card
        sectionTitle: selectedBrand?.customName ? `${selectedBrand.customName} (Other)` : (selectedBrand?.title || ''),
        sectionIcon: toAssetUrl(selectedBrand?.iconUrl || selectedBrand?.icon || ''),
        price: unitPrice,
        originalPrice: originalUnitPrice,
        unitPrice,
        serviceCount: 1,
        pricingType: service.pricingType || 'fixed',
        hours: isHourly ? hours : undefined,
        // The service's admin-entered display values; empty when none
        rating: service.displayRating || "",
        reviews: service.reviewsLabel || "",
        vendorId: service.vendorId || selectedBrand?.vendorId || null,
        card: {
          title: service.title,
          subtitle: service.description || '',
          price: unitPrice,
          originalPrice: originalUnitPrice,
          duration: durationLabel,
          description: service.description || '',
          imageUrl: toAssetUrl(service.icon || ''),
          features: service.features || []
        }
      };

      setBusyServiceId(cartItemData.serviceId);
      const response = await addToCart(cartItemData);
      if (response.success) {
        setHoursPickerSvc(null);
        toast.success(`${service.title} added`, { id: 'service-added' });
      } else {
        toast.error(response.message || 'Failed to add to cart');
      }
    } catch (error) {
      toast.error('Failed to add to cart');
    } finally {
      setBusyServiceId(null);
    }
  };

  // This category's items already in the cart, by service id
  const categoryCartItems = (cartItems || []).filter(item =>
    (category?.id && String(item.categoryId?._id || item.categoryId) === String(category.id)) ||
    (category?.title && item.category === category.title)
  );
  const cartItemByService = new Map(categoryCartItems.map(item => [String(item.serviceId?._id || item.serviceId), item]));
  const categoryCartTotal = categoryCartItems.reduce((sum, item) => sum + (Number(item.price) || 0), 0);

  const handleRemoveService = async (service) => {
    const item = cartItemByService.get(String(service.id || service._id));
    if (!item) return;
    setBusyServiceId(String(service.id || service._id));
    try {
      const response = await removeItem(item._id || item.id);
      if (!response?.success) toast.error(response?.message || 'Failed to remove');
    } catch {
      toast.error('Failed to remove');
    } finally {
      setBusyServiceId(null);
    }
  };

  if (!isOpen && !isClosing) return null;
  if (!mounted) return null;

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <ModalLock />
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
                    <div className="min-w-0">
                      <h1 className="text-xl font-bold text-gray-900 truncate">
                        {view === 'brands'
                          ? (category?.title || 'Brands')
                          : (selectedBrand?.customName || formatBrandName(selectedBrand?.title) || 'Services')}
                      </h1>
                      {view === 'brands' && <p className="text-xs text-gray-500">Select your appliance brand</p>}
                      {view === 'services' && (
                        selectedBrand?.customName ? (
                          <p className="text-xs text-gray-500">
                            Other brand ·{' '}
                            <button
                              type="button"
                              onClick={() => { setOtherBrandInput(selectedBrand.customName); setOtherPrompt(selectedBrand); }}
                              className="font-semibold text-accent hover:underline"
                            >
                              Change
                            </button>
                          </p>
                        ) : (
                          <p className="text-xs text-gray-500">Add one or more services</p>
                        )
                      )}
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
                          <div className="grid grid-cols-3 sm:grid-cols-4 gap-x-3 gap-y-4">
                            {[...brands.filter(b => !isOtherBrand(b)), ...brands.filter(isOtherBrand)].map((brand) => {
                              const isOther = isOtherBrand(brand);
                              return (
                                <button
                                  type="button"
                                  key={brand.id || brand._id}
                                  onClick={() => handleBrandClick(brand)}
                                  className="flex flex-col items-center group active:scale-95 transition-transform focus:outline-none"
                                >
                                  {isOther ? (
                                    <div className="w-full aspect-square rounded-2xl border-2 border-dashed border-gray-200 bg-canvas flex flex-col items-center justify-center gap-1 group-hover:border-accent/40 group-hover:bg-accent-soft/40 transition-colors">
                                      <span className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-accent">
                                        <FiEdit3 className="w-5 h-5" />
                                      </span>
                                      <span className="text-[11px] font-semibold text-gray-500">Not listed?</span>
                                    </div>
                                  ) : (
                                    <div className="relative w-full aspect-square rounded-2xl bg-white border border-gray-100 flex items-center justify-center overflow-hidden group-hover:border-accent/30 transition-colors">
                                      {brand.icon ? (
                                        <img
                                          src={optimizeCloudinaryUrl(toAssetUrl(brand.icon), { width: 240, crop: 'limit', quality: 'auto' })}
                                          alt={brand.title}
                                          className="w-[74%] h-[62%] object-contain mix-blend-multiply brightness-[1.08] contrast-[1.08] group-hover:scale-105 transition-transform duration-300"
                                          loading="lazy"
                                        />
                                      ) : (
                                        <span className="text-[22px] font-bold text-gray-300">{formatBrandName(brand.title).charAt(0)}</span>
                                      )}
                                      {brand.badge && (
                                        <span className="absolute top-1.5 right-1.5 bg-accent-soft text-accent text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                          {brand.badge}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <p className="mt-2 text-[12px] font-semibold text-gray-800 text-center leading-tight line-clamp-2 px-1">
                                    {isOther ? 'Other brand' : formatBrandName(brand.title)}
                                  </p>
                                </button>
                              );
                            })}
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
                            {services.map((svc) => {
                              const isQuoteOnly = svc.pricingType === 'quote_required';
                              const isHourly = svc.pricingType === 'hourly';
                              const isInspection = svc.pricingType === 'inspection_fee';

                              return (
                                <div key={svc.id || svc._id} className="flex justify-between items-center p-3 border border-gray-100 rounded-xl hover:shadow-md transition-shadow">
                                  <div className="flex-1 pr-4">
                                    <h3 className="font-black text-gray-900 text-[15px] leading-snug mb-0.5">{svc.title}</h3>
                                    {isQuoteOnly ? (
                                      <p className="text-xs text-purple-700 font-semibold italic">{svc.quoteContactNote || 'Contact us for a custom quote'}</p>
                                    ) : isHourly ? (
                                      <div className="flex items-center gap-1 text-emerald-600">
                                        <span className="text-lg font-black">₹{svc.hourlyRate || svc.basePrice}</span>
                                        <span className="text-xs font-bold opacity-70">/hr · {svc.minHours}-{svc.maxHours}h</span>
                                      </div>
                                    ) : isInspection ? (
                                      <div className="flex items-center gap-2">
                                        <span className="text-lg font-black text-emerald-600">₹{svc.inspectionFee}</span>
                                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">Inspection visit</span>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span className="text-lg font-black text-emerald-600">₹{svc.discountPrice || svc.basePrice}</span>
                                        {svc.discountPrice && svc.discountPrice < svc.basePrice && (
                                          <span className="text-xs text-gray-400 line-through font-bold opacity-60">₹{svc.basePrice}</span>
                                        )}
                                        {svc.pricingType === 'starting_from' && (
                                          <span className="text-[10px] font-bold text-sky-700">starting from</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                  {isQuoteOnly ? (
                                    <a
                                      href="/user/help-support"
                                      className="px-4 py-2 bg-purple-50 text-purple-700 rounded-lg text-sm font-bold flex items-center gap-1 hover:bg-purple-100"
                                    >
                                      <FiPhoneCall /> Contact
                                    </a>
                                  ) : (
                                    cartItemByService.has(String(svc.id || svc._id)) ? (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveService(svc)}
                                        disabled={busyServiceId === String(svc.id || svc._id)}
                                        aria-label={`Remove ${svc.title}`}
                                        className="min-w-[88px] px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-1 border border-accent/40 bg-accent-soft text-accent disabled:opacity-60"
                                      >
                                        <FiCheck strokeWidth={3} /> Added
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => handleServiceClick(svc)}
                                        disabled={busyServiceId === String(svc.id || svc._id)}
                                        className="min-w-[88px] px-4 py-2 bg-green-50 text-green-700 rounded-lg text-sm font-bold flex items-center justify-center gap-1 hover:bg-green-100 disabled:opacity-60"
                                      >
                                        {isHourly ? <><FiClock /> Select</> : <><FiPlus /> Add</>}
                                      </button>
                                    )
                                  )}
                                </div>
                              );
                            })}
                            
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

              {categoryCartItems.length > 0 && !isRedirecting && (
                <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-100 px-4 pt-3" style={{ paddingBottom: 'max(14px, var(--safe-bottom))' }}>
                  <button
                    type="button"
                    onClick={() => { onClose?.(); navigate('/user/cart'); }}
                    className="w-full h-12 rounded-full bg-accent text-white px-5 flex items-center justify-between hover:bg-accent-dark active:scale-[0.99] transition-all"
                  >
                    <span className="text-[14px] font-semibold">
                      {categoryCartItems.length} added · ₹{Math.round(categoryCartTotal).toLocaleString('en-IN')}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[14px] font-semibold">
                      View cart <FiArrowLeft className="w-4 h-4 rotate-180" />
                    </span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>

          {/* "Other" brand: ask which brand the user has */}
          <AnimatePresence>
            {otherPrompt && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[10000] bg-black/50 flex items-end sm:items-center justify-center"
                onClick={() => setOtherPrompt(null)}
              >
                <ModalLock />
                <motion.form
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 40, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  onSubmit={confirmOtherBrand}
                  className="bg-white w-full sm:max-w-sm rounded-t-[28px] sm:rounded-3xl px-5 pt-5"
                  style={{ paddingBottom: 'max(20px, var(--safe-bottom))' }}
                >
                  <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4 sm:hidden" />
                  <h3 className="text-[18px] font-bold text-ink">Which brand is your {category?.title?.toLowerCase() || 'appliance'}?</h3>
                  <p className="text-[13px] text-gray-500 mt-1">We will share it with the professional so they come prepared.</p>

                  <label htmlFor="other-brand-name" className="sr-only">Brand name</label>
                  <input
                    id="other-brand-name"
                    type="text"
                    autoFocus
                    autoComplete="off"
                    maxLength={40}
                    value={otherBrandInput}
                    onChange={(e) => setOtherBrandInput(cleanBrandInput(e.target.value))}
                    placeholder="e.g. Whirlpool, IFB, Panasonic"
                    className="mt-4 w-full h-12 px-4 rounded-xl bg-canvas border border-transparent text-[15px] text-ink placeholder:text-gray-400 focus:outline-none focus:bg-white focus:border-accent/40 focus:ring-2 focus:ring-accent/15 transition-colors"
                  />

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setOtherPrompt(null)}
                      className="h-11 rounded-full border border-gray-200 bg-white text-[14px] font-semibold text-ink hover:border-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={otherBrandInput.trim().length < 2}
                      className="h-11 rounded-full bg-accent text-white text-[14px] font-semibold hover:bg-accent-dark disabled:opacity-50 transition-colors"
                    >
                      Continue
                    </button>
                  </div>
                </motion.form>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Duration picker for hourly services */}
          <AnimatePresence>
            {hoursPickerSvc && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[10000] bg-black/60 flex items-end sm:items-center justify-center"
                onClick={() => setHoursPickerSvc(null)}
              >
                <ModalLock />
                <motion.div
                  initial={{ y: 40, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 40, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6"
                >
                  <h3 className="text-lg font-black text-gray-900 mb-1">{hoursPickerSvc.title}</h3>
                  <p className="text-xs text-gray-500 mb-4">
                    ₹{hoursPickerSvc.hourlyRate || hoursPickerSvc.basePrice}/hr · choose how many hours you need
                  </p>

                  <div className="flex items-center justify-center gap-4 mb-5">
                    <button
                      onClick={() => setPickedHours(h => Math.max(hoursPickerSvc.minHours || 1, h - 0.5))}
                      className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center active:scale-95"
                    >
                      <FiMinus className="w-5 h-5 text-gray-700" />
                    </button>
                    <div className="text-center min-w-[80px]">
                      <span className="text-3xl font-black text-gray-900">{pickedHours}</span>
                      <p className="text-xs text-gray-500 font-bold">hour{pickedHours === 1 ? '' : 's'}</p>
                    </div>
                    <button
                      onClick={() => setPickedHours(h => Math.min(hoursPickerSvc.maxHours || 8, h + 0.5))}
                      className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center active:scale-95"
                    >
                      <FiPlus className="w-5 h-5 text-gray-700" />
                    </button>
                  </div>

                  <div className="flex justify-between items-center mb-5 px-1">
                    <span className="text-sm font-bold text-gray-600">Estimated price</span>
                    <span className="text-xl font-black text-emerald-600">
                      ₹{Math.round((hoursPickerSvc.hourlyRate || hoursPickerSvc.basePrice || 0) * pickedHours)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setHoursPickerSvc(null)}
                      className="py-3 rounded-xl font-bold text-gray-600 bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleServiceClick(hoursPickerSvc, pickedHours)}
                      className="py-3 rounded-xl font-bold text-white shadow-lg"
                      style={{ backgroundColor: themeColors.button }}
                    >
                      Add to cart
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  );

  return createPortal(modalContent, document.body);
});

CategoryModal.displayName = 'CategoryModal';
export default CategoryModal;
