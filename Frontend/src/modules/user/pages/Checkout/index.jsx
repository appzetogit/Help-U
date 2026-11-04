import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FiArrowLeft, FiShoppingCart, FiTrash2, FiMinus, FiPlus, FiPhone, FiHome, FiClock, FiEdit2, FiCheckCircle, FiInfo, FiTag, FiPercent, FiX, FiChevronDown, FiChevronUp } from 'react-icons/fi';
import { MdStar } from 'react-icons/md';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../../theme';
import AddressSelectionModal from './components/AddressSelectionModal';
import TimeSlotModal from './components/TimeSlotModal';
import WorkerSearchModal from './components/WorkerSearchModal';
import IssuePhotosPicker from './components/IssuePhotosPicker';
import { AddOnsSelector, EmergencyOption, BookingNotes, RecurringOption } from './components/CheckoutExtras';
import useBookingConfig from '../../../../hooks/useBookingConfig';
import bookingFeaturesService from '../../../../services/bookingFeaturesService';
import couponService from '../../../../services/couponService';
import { bookingService } from '../../../../services/bookingService';
import { paymentService } from '../../../../services/paymentService';
import { walletService } from '../../../../services/walletService';
import { cartService } from '../../../../services/cartService';
import { configService } from '../../../../services/configService';
import { userAuthService } from '../../../../services/authService';
import { useCart } from '../../../../context/CartContext';
import { useZone } from '../../../../context/ZoneContext';
import { useCity } from '../../../../context/CityContext';
import LiveBookingCard from '../../components/booking/LiveBookingCard';
import ModalLock from '../../../../components/common/ModalLock';
import {
  loadPersistedCheckoutMedia,
  savePersistedCheckoutMedia,
  clearPersistedCheckoutMedia
} from '../../utils/checkoutMediaStorage';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const Checkout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Preserve category across page refresh so the filtered category view doesn't revert unexpectedly
  const [activeCategory, setActiveCategory] = useState(() => {
    return location.state?.category || sessionStorage.getItem('helpu_checkout_category') || null;
  });

  useEffect(() => {
    if (location.state?.category) {
      setActiveCategory(location.state.category);
      sessionStorage.setItem('helpu_checkout_category', location.state.category);
    }
  }, [location.state?.category]);

  const category = activeCategory;
  const { fetchCart: fetchCartGlobal, clearCart: clearCartGlobal, removeCategoryItems: removeCategoryGlobal } = useCart();
  const { zoneId, isOutOfZone, detectZone, markOutOfZone } = useZone() || {};
  const { currentCity } = useCity() || {};
  const cityId = currentCity?._id || currentCity?.id || undefined;

  const [cartItems, setCartItems] = useState([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showTimeSlotModal, setShowTimeSlotModal] = useState(false);
  const [address, setAddress] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [addressDetails, setAddressDetails] = useState(null);
  const [, setRazorpayLoaded] = useState(false);
  const [userPhone, setUserPhone] = useState('');

  // Custom Contact State (for this booking only)
  const [contactDetails, setContactDetails] = useState({ name: '', phone: '' });
  const [showContactModal, setShowContactModal] = useState(false);

  // New state for worker search flow
  const [currentStep, setCurrentStep] = useState('details'); // 'details' | 'searching' | 'waiting' | 'accepted' | 'payment'
  const [acceptedWorker, setAcceptedWorker] = useState(null);
  const [bookingRequest, setBookingRequest] = useState(null);
  const [searchingWorkers, setSearchingWorkers] = useState(false);
  const [showWorkerModal, setShowWorkerModal] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('online'); // 'online' | 'pay_at_home' | 'wallet'
  const [walletBalance, setWalletBalance] = useState(0);

  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const [selectedTime, setSelectedTime] = useState(null);
  const [visitedFee, setVisitedFee] = useState(0); // replaced by the admin's value once settings load
  // A cancellation fee still owed from an earlier booking; it is added to this booking's bill
  const [pendingFee, setPendingFee] = useState(0);
  const [gstPercentage, setGstPercentage] = useState(18);
  const [bookingType, setBookingType] = useState('instant'); // 'instant' | 'scheduled'
  const [issuePhotos, setIssuePhotos] = useState(() => loadPersistedCheckoutMedia('photos', category));
  const [issueVideos, setIssueVideos] = useState(() => loadPersistedCheckoutMedia('videos', category));
  const [searchInfo, setSearchInfo] = useState(null); // live worker-search details for WorkerSearchModal

  // Persist completed issue photos & videos across page refreshes
  useEffect(() => {
    savePersistedCheckoutMedia('photos', issuePhotos, category);
  }, [issuePhotos, category]);

  useEffect(() => {
    savePersistedCheckoutMedia('videos', issueVideos, category);
  }, [issueVideos, category]);

  // Admin-configured checkout extras
  const bookingConfig = useBookingConfig();
  const [bookingOptions, setBookingOptions] = useState({ addOns: [], emergency: { available: false } });
  const [selectedAddOns, setSelectedAddOns] = useState({}); // { addOnId: quantity }
  const [isEmergency, setIsEmergency] = useState(false);
  const [customerNotes, setCustomerNotes] = useState('');
  const [recurring, setRecurring] = useState({ frequency: '', occurrences: 4 });

  // Coupon state
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponDiscount, setCouponDiscount] = useState(0);
  const [couponLoading, setCouponLoading] = useState(false);
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [showCouponList, setShowCouponList] = useState(false);


  // Check if Razorpay is loaded (defer to avoid blocking initial render)
  useEffect(() => {
    // Defer Razorpay check until after page load
    const checkRazorpay = () => {
      if (window.Razorpay) {
        setRazorpayLoaded(true);
      } else {
        // Retry after a short delay (non-blocking)
        setTimeout(checkRazorpay, 100);
      }
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if (window.requestIdleCallback) {
      window.requestIdleCallback(checkRazorpay, { timeout: 200 });
    } else {
      setTimeout(checkRazorpay, 100);
    }
  }, []);

  // Load user data and cart
  useEffect(() => {
    const loadUserData = () => {
      const storedUserData = localStorage.getItem('userData');
      if (storedUserData) {
        const userData = JSON.parse(storedUserData);
        if (userData.phone) {
          setUserPhone(userData.phone);
        }
        // Initialize contact details for editing
        setContactDetails({
          name: userData.name || '',
          phone: userData.phone || ''
        });
      }
    };
    loadUserData();
    walletService.getBalance()
      .then(res => { if (res.success && res.data) setWalletBalance(res.data.balance || 0); })
      .catch(() => {});

    // Refresh on focus to catch updates from profile page
    window.addEventListener('focus', loadUserData);
    return () => window.removeEventListener('focus', loadUserData);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        const response = await userAuthService.getCheckoutData();
        if (response.success) {
          // Set Config
          setVisitedFee(response.settings?.visitedCharges ?? 0);
          setPendingFee(Math.max(0, Number(response.pendingPenalty) || 0));
          setGstPercentage(response.settings?.serviceGstPercentage ?? 18);

          // Set Addresses
          if (response.user?.addresses?.length > 0) {
            const defaultAddr = response.user.addresses.find(a => a.isDefault) || response.user.addresses[0];
            setAddress(defaultAddr.addressLine1);
            setHouseNumber(defaultAddr.addressLine2 || '');
            setAddressDetails({
              address: defaultAddr.addressLine1,
              lat: defaultAddr.lat,
              lng: defaultAddr.lng,
              type: defaultAddr.type,
              city: defaultAddr.city,
              state: defaultAddr.state,
              pincode: defaultAddr.pincode
            });
            if (defaultAddr.lat && defaultAddr.lng && detectZone) {
              detectZone(defaultAddr.lat, defaultAddr.lng);
            }
          }

          // Set Cart Items
          let items = response.cartItems || [];
          if (category) {
            const normalizedCategory = category.toLowerCase().trim();
            items = items.filter(item => {
              const itemCat = (item.category || 'Other').toLowerCase().trim();
              return itemCat === normalizedCategory;
            });
          }
          setCartItems(items);
        }
      } catch (error) {
        console.error('Failed to load checkout data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [category]);

  const loadCart = async () => {
    try {
      setLoading(true);
      const response = await cartService.getCart();
      if (response.success) {
        let items = response.data || [];
        if (category) {
          const normalizedCategory = category.toLowerCase().trim();
          items = items.filter(item => {
            const itemCat = (item.category || 'Other').toLowerCase().trim();
            return itemCat === normalizedCategory;
          });
        }
        setCartItems(items);
      } else {
        setCartItems([]);
      }
    } catch (error) {
      setCartItems([]);
    } finally {
      setLoading(false);
    }
  };

  const cartCount = cartItems.length;

  const handleBack = () => {
    navigate(-1);
  };

  const handleQuantityChange = async (itemId, change) => {
    try {
      const item = cartItems.find(i => (i._id || i.id) === itemId);
      if (!item) return;

      const newCount = Math.max(1, (item.serviceCount || 1) + change);
      const response = await cartService.updateItem(itemId, newCount);

      if (response.success) {
        // Refresh global cart badge
        fetchCartGlobal();

        // Reload cart and filter by category
        const cartResponse = await cartService.getCart();
        if (cartResponse.success) {
          let items = cartResponse.data || [];
          if (category) {
            const normalizedCategory = category.toLowerCase().trim();
            items = items.filter(item => {
              const itemCat = (item.category || 'Other').toLowerCase().trim();
              return itemCat === normalizedCategory;
            });
          }
          setCartItems(items);
        }
      } else {
        toast.error(response.message || 'Failed to update quantity');
      }
    } catch (error) {
      toast.error('Failed to update quantity');
    }
  };

  const cleanupCheckoutMedia = () => {
    clearPersistedCheckoutMedia(category);
    sessionStorage.removeItem('helpu_checkout_category');
  };

  const handleRemoveItem = async (itemId) => {
    try {
      const response = await cartService.removeItem(itemId);
      if (response.success) {
        toast.success('Item removed');
        // Refresh global cart badge
        fetchCartGlobal();
        loadCart();
        if (cartItems.length <= 1) {
          cleanupCheckoutMedia();
        }
      } else {
        toast.error(response.message || 'Failed to remove item');
      }
    } catch (error) {
      toast.error('Failed to remove item');
    }
  };



  const getAddressComponent = (type) => {
    return addressDetails?.components?.find(c => c.types.includes(type))?.long_name || '';
  };

  // URLs of the optional problem photos that finished uploading; failed ones are left out
  const getUploadedIssuePhotos = () =>
    issuePhotos.filter(p => p.status === 'done' && p.url).map(p => p.url);
  const getUploadedIssueVideos = () =>
    issueVideos.filter(v => v.status === 'done' && v.url).map(v => v.url);

  // Checkout options (add-ons, emergency) for the service in the cart
  const firstServiceId = (() => {
    const s = cartItems[0]?.serviceId;
    if (!s) return null;
    return typeof s === 'object' ? (s._id || s.id) : s;
  })();

  useEffect(() => {
    if (!firstServiceId) return;
    let active = true;
    bookingFeaturesService.getBookingOptions(firstServiceId)
      .then((res) => {
        if (!active || !res.success) return;
        setBookingOptions(res.data);
        // Drop selections that are no longer offered
        const offered = new Set((res.data.addOns || []).map(a => a._id));
        setSelectedAddOns(prev => Object.fromEntries(Object.entries(prev).filter(([id]) => offered.has(id))));
        if (!res.data.emergency?.available) setIsEmergency(false);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [firstServiceId, bookingConfig.isAddOnsEnabled, bookingConfig.isEmergencyEnabled]);

  const handleEmergencyToggle = (on) => {
    setIsEmergency(on);
    // Emergency jobs are dispatched immediately
    if (on) setBookingType('instant');
  };

  const handleProceed = async () => {

    // Without an address or slot, collect it first; otherwise start the search.
    if (bookingType === 'instant') {
      if (!addressDetails) {
        setShowAddressModal(true);
        return;
      }
    } else if (!addressDetails || !selectedDate || !selectedTime) {
      if (!addressDetails) setShowAddressModal(true);
      else setShowTimeSlotModal(true);
      return;
    }
    return handleSearchWorkers();
  };


  // Listen for real-time worker acceptance
  useEffect(() => {
    if (currentStep !== 'waiting' || !bookingRequest) return;

    const socketUrl = import.meta.env.VITE_API_BASE_URL?.replace(/\/api$/, '') || 'http://localhost:5000';
    const socket = io(socketUrl, {
      auth: { token: localStorage.getItem('accessToken') },
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
    });

    socket.on('connect_error', (err) => {
    });

    socket.on('booking_accepted', (data) => {
      if (data.bookingId === bookingRequest._id) {

        // Construct worker object from event data
        // Note: Real backend should send full details, falling back to defaults for display
        const workerData = {
          id: data.worker.id,
          name: data.worker.name || 'Worker',
          businessName: data.worker.businessName || 'Service Provider',
          rating: 4.8, // Default if not sent
          distance: 'Nearby', // Default if not sent
          estimatedTime: '15-20 mins',
          price: bookingRequest.amount
        };

        setAcceptedWorker(workerData);
        setCurrentStep('accepted');
        setSearchingWorkers(false);
        toast.success(`${workerData.businessName || workerData.name || 'Worker'} accepted your booking!`);

        // Close search modal after brief confirmation and transition to payment step
        setTimeout(() => {
          setShowWorkerModal(false);
          if (totalAmount === 0 || itemTotal === 0) {
            cleanupCheckoutMedia();
            navigate(`/user/booking-confirmation/${bookingRequest._id}`, {
              replace: true
            });
          } else {
            setCurrentStep('payment');
          }
        }, 1500);
      }
    });

    // Each new wave of alerted workers updates the searching popup
    socket.on('booking_search_progress', (data) => {
      if (String(data.bookingId) !== String(bookingRequest._id)) return;
      setSearchInfo(prev => ({
        ...(prev || {}),
        wave: data.wave,
        // Never count down: events can arrive out of order with the HTTP response
        notifiedCount: Math.max(prev?.notifiedCount || 0, data.notifiedCount || 0),
        nearbyCount: data.nearbyCount ?? prev?.nearbyCount
      }));
    });

    socket.on('booking_search_failed', (data) => {
      if (data.bookingId === bookingRequest._id) {
        setSearchingWorkers(false);
        setCurrentStep('failed');
        toast.error(data.message || 'No workers available at the moment.');

        // Auto-cancel and refresh on failure
        const handleAutoCancel = async () => {
          try {
            await bookingService.cancel(bookingRequest._id, 'No workers found after search timeout');
            setTimeout(() => {
              window.location.reload();
            }, 3000); // 3 second delay to let the user see the error
          } catch (err) {
            console.error('Auto-cancel failed:', err);
            setTimeout(() => {
              window.location.reload();
            }, 3000);
          }
        };
        handleAutoCancel();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [currentStep, bookingRequest]);

  // Search for nearby workers
  const handleSearchWorkers = async () => {
    try {
      // Validate required fields
      if (bookingType === 'scheduled') {
        if (!selectedDate || !selectedTime) {
          toast.error('Please select time slot');
          return;
        }
        if (!addressDetails) {
          toast.error('Please select address');
          return;
        }
      } else {
        // Instant
        if (!addressDetails) {
          toast.error('Please select address');
          return;
        }
      }

      if (isOutOfZone) {
        toast.error('We do not currently serve this location. Please choose an address within our service area.');
        setShowAddressModal(true);
        return;
      }

      if (cartItems.length === 0 && !bookingRequest) {
        toast.error('Cart is empty');
        return;
      }

      const needsDetails = cartItems.find(item => (item.missingDetailKeys || []).length > 0);
      if (needsDetails) {
        toast.error(`Please add the required details for ${needsDetails.title || 'your service'}`);
        navigate('/user/cart');
        return;
      }

      if (issuePhotos.some(p => p.status === 'uploading') || issueVideos.some(v => v.status === 'uploading')) {
        toast.error('Please wait, your photos and videos are still uploading');
        return;
      }

      // Open modal and start searching
      setShowWorkerModal(true);
      setCurrentStep('searching');
      setSearchingWorkers(true);

      // Get first service
      const firstItem = cartItems[0];
      if (!firstItem.serviceId) {
        toast.error('Service information missing. Please try again.');
        setCurrentStep('details');
        setSearchingWorkers(false);
        setShowWorkerModal(false);
        return;
      }

      // Prepare address object
      const addressObj = {
        type: 'home',
        addressLine1: address,
        addressLine2: houseNumber,
        city: addressDetails?.city || getAddressComponent('locality') || getAddressComponent('administrative_area_level_2') || 'City',
        state: addressDetails?.state || getAddressComponent('administrative_area_level_1') || 'State',
        pincode: addressDetails?.pincode || getAddressComponent('postal_code') || '123456',

        landmark: addressDetails?.landmark || '',
        lat: addressDetails?.lat || null,
        lng: addressDetails?.lng || null
      };

      // Prepare time slot
      let finalDate = selectedDate;
      let finalTimeDisplay = selectedTime;
      let timeSlotObj = {
        start: selectedTime,
        end: getTimeSlots().find(slot => slot.value === selectedTime)?.end || selectedTime
      };

      if (bookingType === 'instant') {
        finalDate = new Date();
        finalTimeDisplay = "ASAP";
        timeSlotObj = { start: "Now", end: "45 mins" };
      } else {
        finalTimeDisplay = getTimeSlots().find(slot => slot.value === selectedTime)?.display || selectedTime;
      }

      // Create booking request (progress is shown in WorkerSearchModal)
      setSearchInfo(null);

      // Ensure serviceId is a string (handle populated cart data)
      const serviceId = typeof firstItem.serviceId === 'object'
        ? firstItem.serviceId._id || firstItem.serviceId.id
        : firstItem.serviceId;

      // Prepare bookedItems array matching Service catalog structure
      // Prepare bookedItems array matching Service catalog structure
      const bookedItemsData = cartItems.map(item => ({
        // The server reads this cart item's saved details (answers are never taken from here)
        cartItemId: item._id || item.id,
        brandName: item.sectionTitle || item.brand || '',
        brandIcon: item.sectionIcon || null,
        card: {
          title: item.card?.title || item.title || 'Unknown Service',
          subtitle: item.card?.subtitle || item.description || '',
          price: item.card?.price || item.price || 0,
          originalPrice: item.card?.originalPrice || item.originalPrice || null,
          duration: item.card?.duration || item.duration || '',
          description: item.card?.description || item.description || '',
          imageUrl: item.card?.imageUrl || item.icon || '',
          features: item.card?.features || []
        },
        quantity: item.serviceCount || 1
      }));

      // Hourly items were priced (rate × hours) when added to the cart; record
      // the hours actually booked for the worker/admin bill and any dispute.
      const hourlyItem = cartItems.find(item => item.pricingType === 'hourly' && item.hours);



      const bookingResponse = await bookingService.create({
        bookingType, // 'instant' or 'scheduled'
        serviceId: serviceId,
        zoneId: zoneId || undefined,
        cityId,
        address: addressObj,
        scheduledDate: finalDate.toISOString(),
        scheduledTime: finalTimeDisplay,
        timeSlot: timeSlotObj,
        paymentMethod: 'pay_at_home',
        amount: amountToPay,

        // Pass Full Breakdown to Backend
        basePrice: totalOriginalPrice,
        discount: savings,
        tax: taxesAndFee,
        visitationFee: finalVisitedFee,

        // Metadata for better data capture
        serviceCategory: firstItem.categoryTitle || firstItem.category || 'General',
        categoryIcon: firstItem.categoryIcon || firstItem.icon || null,
        brandName: firstItem.sectionTitle || firstItem.brand || '',
        brandIcon: firstItem.sectionIcon || null,

        bookedItems: bookedItemsData,
        hours: hourlyItem?.hours,
        issuePhotos: getUploadedIssuePhotos(),
        issueVideos: getUploadedIssueVideos(),

        // Admin-configured extras; prices are recalculated on the server
        customerNotes: bookingConfig.isCustomerNotesEnabled ? customerNotes.trim() : undefined,
        addOns: Object.entries(selectedAddOns).map(([addOnId, quantity]) => ({ addOnId, quantity })),
        isEmergency: isEmergency && bookingOptions.emergency?.available ? true : undefined,
        recurring: isRecurring ? recurring : undefined,
        couponCode: appliedCoupon?.code || undefined
      });

      if (bookingResponse.recurring) {
        toast.success(`Recurring plan created: ${bookingResponse.recurring.occurrencesPlanned} visits`, { icon: '🔁' });
      }

      if (!bookingResponse.success) {
        toast.dismiss();
        toast.error(bookingResponse.message || 'Failed to search for workers');
        setCurrentStep('details');
        setSearchingWorkers(false);
        setShowWorkerModal(false);
        return;
      }

      const booking = bookingResponse.data;
      setBookingRequest(booking);
      setSearchInfo(bookingResponse.search || null);
      toast.dismiss();

      // Clear cart immediately as search starts (consumes items) - ONLY if the booking is being
      // handled: workers were alerted, or it is waiting for the admin to assign one
      if (!bookingResponse.noWorkersFound || bookingResponse.sentToAdmin) {
        try {
          if (category) {
            await removeCategoryGlobal(category);
          } else {
            await clearCartGlobal();
          }
          setCartItems([]);
        } catch (err) {
          console.error('Failed to clear cart after search start', err);
        }
      }

      // Nobody could be alerted automatically, but the booking is not lost: our team picks a
      // professional by hand. Take the customer to the booking, where they will see it get assigned.
      if (bookingResponse.sentToAdmin) {
        cleanupCheckoutMedia();
        setSearchingWorkers(false);
        setShowWorkerModal(false);
        toast.success("Booking placed! Our team is arranging a professional and will notify you shortly.", { duration: 5000 });
        navigate(`/user/booking/${booking?._id || booking?.id}`, { replace: true });
      } else if (bookingResponse.noWorkersFound) {
        // No one nearby (and no admin queue): cancel the empty booking and show the "no professional"
        // screen. The cart was kept above, so "Search again" can rebook.
        const bookingId = booking?._id || booking?.id;
        setSearchingWorkers(false);
        setCurrentStep('failed');

        if (bookingId) {
          bookingService.cancel(bookingId, 'Initial search found no available workers')
            .catch(err => console.error('Auto-cancel failed:', err));
        }
      } else if (bookingType === 'scheduled' && !isEmergency) {
        // A future booking stays open for workers for hours, so don't hold the customer on a
        // countdown: confirm it and take them to the booking, where they'll see it get accepted.
        cleanupCheckoutMedia();
        setSearchingWorkers(false);
        setShowWorkerModal(false);
        toast.success("Booking placed! We'll notify you as soon as a professional accepts.", { duration: 4000 });
        navigate(`/user/booking/${booking?._id || booking?.id}`, { replace: true });
      } else {
        // Move to waiting state - alerts sent to nearby workers
        setCurrentStep('waiting');
      }

      // REMOVED local setCartItems([]) - The summary should remain visible while searching
      // The cart is already cleared in server database by the backend and previous API call.

    } catch (error) {
      toast.dismiss();
      console.error('Search workers error:', error);
      toast.error(error.response?.data?.message || 'Failed to search for workers. Please try again.');
      // The server says this address is outside every zone (the app's own check can lag behind)
      if (error.response?.data?.code === 'OUT_OF_ZONE' && markOutOfZone) {
        markOutOfZone(error.response.data.outOfZonePage);
        setShowAddressModal(true);
      }
      setCurrentStep('details');
      setSearchingWorkers(false);
      setShowWorkerModal(false);
      // Details were removed or changed since the cart was loaded; they are filled in on the cart
      if (error.response?.data?.code === 'DETAILS_REQUIRED') navigate('/user/cart');
    }
  };

  // Proceed to payment after worker acceptance
  const handleOnlinePayment = async () => {
    try {
      if (!acceptedWorker || !bookingRequest) {
        toast.error('No worker selected or booking not created');
        return;
      }

      // Create Razorpay order
      toast.loading('Creating payment order...');
      const orderResponse = await paymentService.createOrder(bookingRequest._id);

      if (!orderResponse.success) {
        toast.dismiss();
        toast.error(orderResponse.message || 'Failed to create payment order');
        return;
      }

      toast.dismiss();

      // Use the key returned by the backend (tied to the account that created this order_id)
      // rather than a separate frontend env var, which can drift out of sync with the backend's key.
      const razorpayKey = orderResponse.data.key;
      if (!razorpayKey) {
        toast.error('Razorpay key not configured');
        return;
      }

      if (!window.Razorpay) {
        toast.error('Razorpay SDK not loaded');
        return;
      }

      const options = {
        key: razorpayKey,
        amount: orderResponse.data.amount * 100,
        currency: orderResponse.data.currency || 'INR',
        order_id: orderResponse.data.orderId,
        name: 'Help U',
        description: `Payment for ${bookingRequest.serviceName || 'service'}`,
        handler: async function (response) {
          try {
            toast.loading('Verifying payment...');
            const verifyResponse = await paymentService.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            bookingId: orderResponse.data.bookingId
            });

            toast.dismiss();

            if (verifyResponse.success) {
              toast.success('Payment successful!');

              // Clear cart (or just category items)
              try {
                if (category) {
                  await removeCategoryGlobal(category);
                } else {
                  await clearCartGlobal();
                }
                setCartItems([]);
              } catch (error) {
              }

              cleanupCheckoutMedia();
              // Navigate to booking confirmation
              navigate(`/user/booking-confirmation/${bookingRequest._id}`, {
                replace: true
              });
            } else {
              toast.error(verifyResponse.message || 'Payment verification failed');
            }
          } catch (error) {
            toast.dismiss();
            toast.error('Failed to verify payment');
          }
        },
        prefill: {
          name: contactDetails.name || JSON.parse(localStorage.getItem('userData'))?.name || 'User',
          email: JSON.parse(localStorage.getItem('userData'))?.email || '',
          contact: contactDetails.phone || userPhone
        },
        theme: {
          color: themeColors.button
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.on('payment.failed', function (response) {
        toast.dismiss();
        toast.error(`Payment failed: ${response.error.description || 'Unknown error'}`);
      });
      razorpay.open();

    } catch (error) {
      toast.dismiss();
      toast.error('Failed to process payment');
    }
  };

  const handleWalletPayment = async () => {
    try {
      if (!acceptedWorker || !bookingRequest) {
        toast.error('No worker selected or booking not created');
        return;
      }
      toast.loading('Processing wallet payment...');
      const response = await paymentService.processWalletPayment(bookingRequest._id, 'final');
      toast.dismiss();

      if (response.success) {
        toast.success('Payment successful via Wallet!');
        try {
          if (category) {
            await removeCategoryGlobal(category);
          } else {
            await clearCartGlobal();
          }
          setCartItems([]);
        } catch (error) {}
        cleanupCheckoutMedia();
        navigate(`/user/booking-confirmation/${bookingRequest._id}`, { replace: true });
      } else {
        toast.error(response.message || 'Failed to process wallet payment');
      }
    } catch (error) {
      toast.dismiss();
      toast.error(error.response?.data?.message || 'Failed to process wallet payment');
    }
  };

  const handlePayAtHome = async () => {
    try {
      if (!bookingRequest) return;
      toast.loading('Confirming booking...');
      const response = await paymentService.confirmPayAtHome(bookingRequest._id);
      toast.dismiss();

      if (response.success) {
        toast.success('Booking confirmed!');
        // Clear cart (or just category items)
        try {
          if (category) {
            await removeCategoryGlobal(category);
          } else {
            await clearCartGlobal();
          }
          setCartItems([]);
        } catch (error) {
        }
        cleanupCheckoutMedia();
        // Navigate to booking confirmation
        navigate(`/user/booking-confirmation/${bookingRequest._id}`, {
          replace: true
        });
      } else {
        toast.error(response.message || 'Failed to confirm booking');
      }
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to process request');
    }
  };

  const handlePayment = async () => {
    if (paymentMethod === 'wallet') {
      await handleWalletPayment();
    } else if (paymentMethod === 'online') {
      await handleOnlinePayment();
    } else {
      await handlePayAtHome();
    }
  };

  const handleAddressSave = async (savedHouseNumber, locationObj) => {
    setHouseNumber(savedHouseNumber);
    if (locationObj) {
      setAddress(locationObj.address);
      setAddressDetails(locationObj);
      if (locationObj.lat && locationObj.lng && detectZone) {
        try {
          localStorage.setItem('userCoords', JSON.stringify({ lat: locationObj.lat, lng: locationObj.lng }));
        } catch {}
        detectZone(locationObj.lat, locationObj.lng);
      }
    }
    setShowAddressModal(false);

    // Save to profile
    if (locationObj) {
      try {
        const getComp = (type) => locationObj.components?.find(c => c.types.includes(type))?.long_name || '';

        const newAddress = {
          type: locationObj.addressType || 'home',
          customName: locationObj.customName || '',
          addressLine1: locationObj.address,
          addressLine2: savedHouseNumber,
          landmark: locationObj.landmark || '',
          city: getComp('locality') || getComp('administrative_area_level_2') || 'City',
          state: getComp('administrative_area_level_1') || 'State',
          pincode: getComp('postal_code') || '000000',
          lat: locationObj.lat,
          lng: locationObj.lng,
          isDefault: true
        };

        const response = await userAuthService.getProfile();
        if (response.success && response.user) {
          const existing = (response.user.addresses || []).map(a => ({ ...a, isDefault: false }));
          const updatedAddresses = [...existing, newAddress];
          await userAuthService.updateProfile({ addresses: updatedAddresses });
          toast.success('Address saved to profile!');
        }
      } catch (e) {
        console.error('Failed to save address to profile', e);
      }
    }

    if (bookingType === 'scheduled') {
      setShowTimeSlotModal(true);
    }
  };

  const handleTimeSlotSave = (date, time) => {
    setSelectedDate(date);
    setSelectedTime(time);
    setShowTimeSlotModal(false);
  };

  // Helper to normalize MongoDB IDs (handles strings, objects with _id, and $oid)
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (id.$oid) return id.$oid;
    if (id._id) return normalizeId(id._id);
    return String(id);
  };

  const calculateItemPrice = (item) => item.price || 0;

  const itemTotal = cartItems.reduce((sum, item) => sum + calculateItemPrice(item), 0);
  const totalOriginalPrice = cartItems.reduce((sum, item) => {
    const original = (item.originalPrice || item.unitPrice || (item.price / (item.serviceCount || 1))) * (item.serviceCount || 1);
    // If priced 0, original is huge saving
    return sum + original;
  }, 0);

  const savings = totalOriginalPrice - itemTotal;
  const taxesAndFee = Math.round((itemTotal * gstPercentage) / 100);
  const finalVisitedFee = itemTotal === 0 ? 0 : visitedFee;

  // Extras — mirrors services/bookingCreationService.js so the total shown is
  // the total charged. Extras are taxed at the service GST rate.
  const serviceValue = itemTotal === 0 ? totalOriginalPrice : itemTotal;
  const addOnsTotal = (bookingOptions.addOns || []).reduce(
    (sum, a) => sum + (selectedAddOns[a._id] ? a.price * selectedAddOns[a._id] : 0), 0
  );
  const emergencyActive = isEmergency && bookingOptions.emergency?.available;
  const emergencyCharge = emergencyActive
    ? (bookingOptions.emergency.surchargeType === 'percentage'
      ? Math.round(serviceValue * (bookingOptions.emergency.surchargeValue || 0) / 100)
      : Math.round(bookingOptions.emergency.surchargeValue || 0))
    : 0;
  const extrasBase = addOnsTotal + emergencyCharge;
  const extrasTax = Math.round(extrasBase * gstPercentage / 100);

  const isRecurring = bookingType === 'scheduled' && !!recurring.frequency && bookingConfig.isRecurringEnabled;
  const recurringPct = isRecurring && itemTotal > 0 ? (bookingConfig.recurringDiscountPercentage || 0) : 0;
  const recurringDiscount = Math.round(itemTotal * recurringPct / 100);
  const recurringTaxCut = Math.min(taxesAndFee + extrasTax, Math.round(recurringDiscount * gstPercentage / 100));

  // Available coupons effect
  useEffect(() => {
    if (itemTotal === 0) return;
    const firstItem = cartItems[0];
    const catId = normalizeId(firstItem?.categoryId || firstItem?.category);
    const srvId = normalizeId(firstItem?.serviceId);
    couponService.getAvailableCoupons({
      orderAmount: itemTotal,
      categoryId: catId,
      serviceId: srvId,
      cityId,
      zoneId: zoneId || undefined
    }).then(res => {
      if (res?.success && Array.isArray(res.coupons)) {
        setAvailableCoupons(res.coupons);
      }
    }).catch(() => {});
  }, [itemTotal, cartItems.length, zoneId, cityId]);

  const handleApplyCoupon = async (codeToApply) => {
    const code = (codeToApply || couponInput || '').trim().toUpperCase();
    if (!code) {
      toast.error('Please enter a coupon code');
      return;
    }
    setCouponLoading(true);
    try {
      const firstItem = cartItems[0];
      const catId = normalizeId(firstItem?.categoryId || firstItem?.category);
      const srvId = normalizeId(firstItem?.serviceId);
      const res = await couponService.validateCoupon({
        code,
        orderAmount: itemTotal,
        categoryId: catId,
        serviceId: srvId,
        cityId,
        zoneId: zoneId || undefined
      });
      if (res.success && res.valid) {
        setAppliedCoupon({
          code: res.coupon.code,
          title: res.coupon.title,
          description: res.coupon.description,
          discountType: res.coupon.discountType,
          discountValue: res.coupon.discountValue
        });
        setCouponDiscount(res.discount || 0);
        toast.success(res.message || `₹${res.discount} discount applied! 🎉`);
        setCouponInput('');
        setShowCouponList(false);
      } else {
        toast.error(res.message || 'Invalid coupon code');
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to apply coupon');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponDiscount(0);
    toast.success('Coupon removed');
  };

  const effectiveCouponDiscount = itemTotal === 0 ? 0 : Math.min(couponDiscount, itemTotal);
  const totalAmount = Math.max(0, itemTotal + taxesAndFee + finalVisitedFee + extrasBase + extrasTax - recurringDiscount - recurringTaxCut - effectiveCouponDiscount) + pendingFee;
  const amountToPay = totalAmount;

  const displayTax = taxesAndFee + extrasTax - recurringTaxCut;
  const displayFee = finalVisitedFee;
  const displaySavings = savings;

  // Date and time slot helper functions
  const getDates = () => {
    const dates = [];
    const today = new Date();
    const daysAhead = Math.max(1, Number(bookingConfig.slotMaxDaysAhead) || 7);
    for (let i = 0; i < daysAhead; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  // Slots come from the admin's time-slot settings: they start at slotStartHour and run through
  // slotEndHour (the last slot may start at that hour), one every slotDurationMinutes.
  const getTimeSlots = () => {
    const startMin = Math.max(0, Number(bookingConfig.slotStartHour) || 0) * 60;
    const endMin = Math.max(1, Number(bookingConfig.slotEndHour) || 20) * 60;
    const step = Math.max(15, Number(bookingConfig.slotDurationMinutes) || 60);

    const fmt = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const display = (mins) => {
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
    };

    const allSlots = [];
    for (let m = startMin; m <= endMin; m += step) {
      allSlots.push({ value: fmt(m), end: fmt(m + step), display: display(m), startMin: m });
    }

    // If today is selected, hide slots that start sooner than the admin's minimum lead time
    const now = new Date();
    const isToday = selectedDate && selectedDate.toDateString() === now.toDateString();
    if (!isToday) return allSlots;

    const earliest = now.getHours() * 60 + now.getMinutes() + (Number(bookingConfig.slotMinLeadMinutes) || 0);
    return allSlots.filter((slot) => slot.startMin >= earliest);
  };

  const formatDate = (date) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
    };
  };



  const isDateSelected = (date) => {
    return selectedDate && date.toDateString() === selectedDate.toDateString();
  };

  const isTimeSelected = (time) => {
    return selectedTime === time;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white pb-32 flex items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4" style={{ borderColor: themeColors.button }}></div>
          <p className="text-gray-500">Loading checkout details...</p>
        </div>
      </div>
    );
  }

  if (cartItems.length === 0 && currentStep === 'details' && !searchingWorkers && !showWorkerModal) {
    return (
      <div className="min-h-screen bg-white pb-32">
        <PageHeader title="Your cart" onBack={handleBack} />
        <main className="px-4 py-4">
          <div className="flex flex-col items-center justify-center py-20">
            <FiShoppingCart className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg font-medium">Your cart is empty</p>
            <p className="text-gray-400 text-sm mt-2">Add services to get started</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-80">
      {/* Header */}
      <PageHeader title={category ? `${category} Checkout` : 'Your cart'} onBack={handleBack} />

      <main className="px-4 py-4">
        {/* Savings Banner */}
        {savings > 0 && (
          <div className="bg-green-50 border border-green-100 rounded-2xl p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center shrink-0 shadow-lg shadow-green-200">
                <MdStar className="text-white w-6 h-6" />
              </div>
              <div>
                <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Smart Choice!</p>
                <p className="text-sm font-black text-slate-900">
                  You're saving ₹{savings.toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <div className="bg-white px-3 py-1 rounded-full shadow-sm border border-green-100">
              <span className="text-[10px] font-black text-green-600">BEST PRICE</span>
            </div>
          </div>
        )}

        {/* Cart Items */}
        <div className="space-y-4 mb-4">
          {cartItems.map((item) => {
            const brandName = item.brand || item.sectionTitle;
            const categoryName = item.categoryTitle || item.category;

            return (
              <div key={item._id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative overflow-hidden">
                {/* Brand Header */}
                {(brandName || categoryName) && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b border-gray-50">
                    {item.sectionIcon ? (
                      <img src={toAssetUrl(item.sectionIcon)} className="w-5 h-5 rounded-md object-cover border border-gray-100" alt="" />
                    ) : brandName ? (
                      <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                        {brandName.charAt(0)}
                      </div>
                    ) : null}
                    <div className="flex flex-col leading-none">
                      {brandName && <span className="text-xs font-bold text-gray-900">{brandName}</span>}
                      {categoryName && <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mt-0.5">{categoryName}</span>}
                    </div>
                  </div>
                )}

                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 pr-4">
                    <h3 className="text-base font-bold text-gray-900 mb-1 leading-snug">{item.title}</h3>
                    {item.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">{item.description}</p>
                    )}
                    {item.duration && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                        <FiClock className="w-3 h-3" />
                        {item.duration}
                      </div>
                    )}
                    {(item.details || []).length > 0 && (
                      <dl className="mt-2 flex flex-wrap gap-1.5">
                        {item.details.map(d => (
                          <div key={d.key} className="text-[11px] bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
                            <dt className="inline text-gray-500">{d.label}: </dt>
                            <dd className="inline font-semibold text-gray-800">{d.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg p-0.5">
                      <button
                        onClick={() => handleQuantityChange(item._id, -1)}
                        className="p-1.5 hover:bg-white rounded-md transition-all shadow-sm"
                      >
                        <FiMinus className="w-3.5 h-3.5 text-gray-600" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-gray-900">{item.serviceCount || 1}</span>
                      <button
                        onClick={() => handleQuantityChange(item._id, 1)}
                        className="p-1.5 hover:bg-white rounded-md transition-all shadow-sm"
                      >
                        <FiPlus className="w-3.5 h-3.5 text-gray-900" />
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveItem(item._id)}
                    className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-black">
                    ₹{(item.price || 0).toLocaleString('en-IN')}
                  </span>
                  {calculateItemPrice(item) > 0 && (() => {
                    const unitPrice = item.unitPrice || (item.price / (item.serviceCount || 1));
                    const unitOriginalPrice = item.originalPrice || unitPrice;
                    const currentTotal = item.price;
                    const originalTotal = unitOriginalPrice * (item.serviceCount || 1);
                    if (originalTotal > currentTotal) {
                      return (
                        <span className="text-sm text-gray-400 line-through">
                          ₹{originalTotal.toLocaleString('en-IN')}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Optional extras, all switched on/off from the admin booking configuration */}
        {cartItems.length > 0 && (
          <>
            {bookingConfig.isAddOnsEnabled && (
              <AddOnsSelector addOns={bookingOptions.addOns} selected={selectedAddOns} onChange={setSelectedAddOns} />
            )}

            <EmergencyOption
              emergency={bookingOptions.emergency}
              enabled={emergencyActive}
              onToggle={handleEmergencyToggle}
              surchargeAmount={emergencyActive ? emergencyCharge : (bookingOptions.emergency?.surchargeType === 'percentage'
                ? Math.round(serviceValue * (bookingOptions.emergency?.surchargeValue || 0) / 100)
                : bookingOptions.emergency?.surchargeValue || 0)}
            />

            {/* Optional photos and videos of the problem for the worker */}
            <IssuePhotosPicker
              photos={issuePhotos}
              setPhotos={setIssuePhotos}
              videos={issueVideos}
              setVideos={setIssueVideos}
              config={bookingConfig}
            />

            {bookingConfig.isCustomerNotesEnabled && (
              <BookingNotes value={customerNotes} onChange={setCustomerNotes} maxLength={bookingConfig.customerNotesMaxLength} />
            )}

            {bookingType === 'scheduled' && (
              <RecurringOption config={bookingConfig} value={recurring} onChange={setRecurring} />
            )}
          </>
        )}


        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FiPhone className="w-5 h-5 text-gray-600" />
              <div>
                <p className="text-sm font-medium text-black">{contactDetails.name || JSON.parse(localStorage.getItem('userData'))?.name || 'Verified Customer'}</p>
                <p className="text-xs text-gray-600">{contactDetails.phone || userPhone || 'Loading...'}</p>
              </div>
            </div>
            <button
              onClick={() => setShowContactModal(true)}
              className="text-sm font-medium hover:underline"
              style={{ color: themeColors.button }}
            >
              Change
            </button>
          </div>
        </div>

        {/* Coupons & Promo Codes Section */}
        {itemTotal > 0 && (
          <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center text-teal-600">
                  <FiTag className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Coupons & Offers</h4>
                  <p className="text-xs text-slate-500">Apply promo codes for extra savings</p>
                </div>
              </div>
              {availableCoupons.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCouponList(prev => !prev)}
                  className="text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                >
                  {showCouponList ? 'Hide Offers' : `View Offers (${availableCoupons.length})`}
                  {showCouponList ? <FiChevronUp className="w-3.5 h-3.5" /> : <FiChevronDown className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>

            {appliedCoupon ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500 text-white flex items-center justify-center font-bold text-xs shadow-sm">
                    ✓
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm text-emerald-900 tracking-wider">
                        {appliedCoupon.code}
                      </span>
                      <span className="text-[11px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                        Applied
                      </span>
                    </div>
                    <p className="text-xs text-emerald-700 font-medium mt-0.5">
                      You save ₹{effectiveCouponDiscount.toLocaleString('en-IN')} with this coupon
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="text-xs font-bold text-red-600 hover:text-red-700 hover:bg-red-50 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="ENTER COUPON CODE"
                    className="w-full uppercase font-mono tracking-wider px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:bg-white transition-all"
                  />
                  {couponInput && (
                    <button
                      type="button"
                      onClick={() => setCouponInput('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <FiX className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  disabled={couponLoading || !couponInput.trim()}
                  onClick={() => handleApplyCoupon()}
                  className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm ${
                    couponInput.trim() && !couponLoading
                      ? 'bg-teal-600 hover:bg-teal-700 text-white cursor-pointer active:scale-95'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {couponLoading ? 'Checking...' : 'Apply'}
                </button>
              </div>
            )}

            {/* Expandable Available Coupons List */}
            {showCouponList && availableCoupons.length > 0 && !appliedCoupon && (
              <div className="mt-4 pt-4 border-t border-slate-100 space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {availableCoupons.map((c) => (
                  <div
                    key={c.code}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                      c.applicable
                        ? 'bg-slate-50/70 border-slate-200 hover:border-teal-300'
                        : 'bg-gray-50/50 border-gray-100 opacity-60'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono font-bold text-xs text-slate-900 px-2 py-0.5 bg-white rounded border border-slate-200 tracking-wider">
                          {c.code}
                        </span>
                        <span className="text-xs font-semibold text-teal-700">
                          {c.discountType === 'percentage'
                            ? `${c.discountValue}% OFF`
                            : `₹${c.discountValue} OFF`}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 truncate">{c.title || c.description}</p>
                      {c.minOrderAmount > 0 && (
                        <p className="text-[11px] text-slate-400 mt-0.5">Min. order ₹{c.minOrderAmount}</p>
                      )}
                      {!c.applicable && c.reason && (
                        <p className="text-[11px] text-amber-600 font-medium mt-0.5">{c.reason}</p>
                      )}
                    </div>
                    {c.applicable ? (
                      <button
                        type="button"
                        onClick={() => handleApplyCoupon(c.code)}
                        className="text-xs font-bold text-teal-600 hover:text-teal-700 bg-white border border-teal-200 hover:bg-teal-50 px-3 py-1.5 rounded-lg shrink-0 transition-colors"
                      >
                        Apply
                      </button>
                    ) : (
                      <span className="text-[11px] font-medium text-slate-400 shrink-0">Not eligible</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Payment Summary */}
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 mb-6 shadow-sm overflow-hidden relative">
          {/* Decorative Background for Header */}
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: themeColors.gradient }}></div>

          <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
            <FiShoppingCart className="w-5 h-5" style={{ color: themeColors.button }} />
            Payment Summary
          </h3>

          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Item Total</span>
              <span className="text-sm font-medium text-slate-900">
                ₹{totalOriginalPrice.toLocaleString('en-IN')}
              </span>
            </div>

            {/* Discount Line */}
            {displaySavings > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-600">Discount</span>
                <span className="text-sm font-medium text-green-600">-₹{displaySavings.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Add-ons */}
            {addOnsTotal > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-600">Add-ons</span>
                <span className="text-sm font-medium text-slate-900">₹{addOnsTotal.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Emergency surcharge */}
            {emergencyCharge > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-rose-600">Emergency charge</span>
                <span className="text-sm font-medium text-rose-600">₹{emergencyCharge.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Recurring plan discount */}
            {recurringDiscount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-green-600">Recurring discount ({recurringPct}%)</span>
                <span className="text-sm font-medium text-green-600">-₹{recurringDiscount.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Coupon discount */}
            {effectiveCouponDiscount > 0 && appliedCoupon && (
              <div className="flex justify-between items-center text-emerald-600">
                <span className="text-sm font-medium flex items-center gap-1.5">
                  <FiTag className="w-3.5 h-3.5" /> Coupon ({appliedCoupon.code})
                </span>
                <span className="text-sm font-bold">-₹{effectiveCouponDiscount.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Taxes */}
            {displayTax > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">GST ({gstPercentage}%)</span>
                <span className="text-sm font-medium text-slate-700">₹{displayTax.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Visited Fee */}
            {displayFee > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Convenience Fee</span>
                <span className="text-sm font-medium text-slate-700">₹{displayFee.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* A cancellation fee carried over from an earlier cancelled booking */}
            {pendingFee > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-slate-500">Earlier cancellation fee</span>
                <span className="text-sm font-medium text-slate-700">₹{pendingFee.toLocaleString('en-IN')}</span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-slate-200 pt-4 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-slate-900">Total Payable</span>
                <div className="flex flex-col items-end">
                  <span className="text-xl font-black text-slate-900">
                    ₹{totalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Important Note regarding Base Price */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6 flex items-start gap-4 shadow-sm">
          <div className="bg-blue-100 p-2 rounded-full shrink-0 mt-0.5">
            <FiInfo className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-blue-900 mb-1">Note</h4>
            <p className="text-sm text-blue-800 leading-relaxed font-medium">
              This is a base booking cost. Additional service cost is decided by the worker after service bill preparation.
            </p>
          </div>
        </div>

        {/* Cancellation Policy */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-base font-bold text-black mb-2">Cancellation policy</h3>
          <p className="text-sm text-gray-700 mb-2">
            Free cancellation until the professional starts their journey. After that, a cancellation fee applies.
          </p>
          <button
            onClick={() => navigate('/user/cancellation-policy')}
            className="text-sm font-medium hover:underline"
            style={{ color: themeColors.button }}
          >
            Read full policy
          </button>
        </div>


      </main>

      {/* Bottom Action Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">

        {/* Booking Type Toggle */}
        <div className="px-4 pt-3 pb-0">
          <div className="flex bg-gray-100 p-1 rounded-xl mb-1">
            <button
              onClick={() => setBookingType('instant')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${bookingType === 'instant' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
            >
              <span className="text-yellow-500">⚡</span> Book
            </button>
            <button
              onClick={() => {
                setBookingType('scheduled');
                // Emergency jobs are always instant
                setIsEmergency(false);
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${bookingType === 'scheduled' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
            >
              <span>📅</span> Slot
            </button>
          </div>
          {bookingType === 'instant' && (emergencyActive ? (
            <p className="text-xs text-center text-rose-600 font-medium mt-1 mb-1">
              <span className="font-bold">🚨 Emergency:</span> alerting more professionals nearby
            </p>
          ) : (
            <p className="text-xs text-center text-green-600 font-medium mt-1 mb-1">
              <span className="font-bold">⚡ Priority Service:</span> Worker arrives in ~45 mins
            </p>
          ))}
          {isRecurring && (
            <p className="text-xs text-center text-indigo-600 font-medium mt-1 mb-1">
              🔁 Repeats {recurring.frequency === 'biweekly' ? 'every 2 weeks' : recurring.frequency === 'monthly' ? 'every month' : 'every week'} · {recurring.occurrences} visits
            </p>
          )}
        </div>

        {/* Address and Slot Display */}
        <div className="px-4 pt-2 pb-2 border-b border-gray-100">
          {(houseNumber || addressDetails) ? (
            <div className="space-y-2.5">
              {/* Address */}
              <div className="flex items-start gap-2.5">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  <FiHome className="w-4 h-4" style={{ color: themeColors.button }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-600 mb-0.5">Address</p>
                  <p className="text-sm font-medium text-black truncate">
                    {houseNumber ? `${houseNumber}, ` : ''}{address || 'Select Address'}
                  </p>
                </div>
                <button
                  onClick={() => setShowAddressModal(true)}
                  className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0 mt-0.5"
                >
                  <FiEdit2 className="w-4 h-4 text-gray-600" />
                </button>
              </div>

              {/* Out of Zone Alert */}
              {isOutOfZone && (
                <div className="mt-2 flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-xs text-amber-800">
                  <div className="flex items-center gap-1.5">
                    <span>⚠️</span>
                    <span className="font-semibold">Selected location is outside our operational service area</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAddressModal(true)}
                    className="font-bold underline text-amber-900 ml-2 shrink-0 hover:text-black transition-colors"
                  >
                    Change
                  </button>
                </div>
              )}

              {/* Time Slot (Only for Scheduled) */}
              {bookingType === 'scheduled' && (
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                    <FiClock className="w-4 h-4" style={{ color: themeColors.button }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-600 mb-0.5">Time Slot</p>
                    <p className="text-sm font-medium text-black">
                      {selectedDate ? (() => {
                        const { day, date: dateNum } = formatDate(selectedDate);
                        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                        const month = monthNames[selectedDate.getMonth()];
                        const timeStr = selectedTime && getTimeSlots().find(slot => slot.value === selectedTime)?.display ? ` • ${getTimeSlots().find(slot => slot.value === selectedTime).display}` : '';
                        return `${day}, ${dateNum} ${month}${timeStr}`;
                      })() : (
                        <span className="text-gray-400">Select Date & Time</span>
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => setShowTimeSlotModal(true)}
                    className="p-1.5 hover:bg-gray-100 rounded-full transition-colors shrink-0 mt-0.5"
                  >
                    <FiEdit2 className="w-4 h-4 text-gray-600" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div
              onClick={() => setShowAddressModal(true)}
              className="flex items-center justify-between p-3 bg-red-50 border border-red-100 rounded-xl cursor-pointer active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <FiHome className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-red-900">Delivery Address Missing</p>
                  <p className="text-xs text-red-600">Please add address to see availability</p>
                </div>
              </div>
              <FiEdit2 className="w-4 h-4 text-red-400" />
            </div>
          )}
        </div>

        {/* Payment Method Selector on Payment Step */}
        {currentStep === 'payment' && totalAmount > 0 && (
          <div className="px-4 py-3 bg-gray-50/70 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5">Select Payment Method</p>
            <div className="space-y-2">
              <label className={`flex items-center justify-between p-3 rounded-xl border bg-white cursor-pointer transition-all ${paymentMethod === 'online' ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="online"
                    checked={paymentMethod === 'online'}
                    onChange={() => setPaymentMethod('online')}
                    className="accent-teal-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Pay Online</p>
                    <p className="text-xs text-gray-500">UPI, Cards, NetBanking via Razorpay</p>
                  </div>
                </div>
              </label>

              <label className={`flex items-center justify-between p-3 rounded-xl border bg-white transition-all ${walletBalance >= totalAmount ? 'cursor-pointer' : 'opacity-60 cursor-not-allowed'} ${paymentMethod === 'wallet' ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="wallet"
                    disabled={walletBalance < totalAmount}
                    checked={paymentMethod === 'wallet'}
                    onChange={() => setPaymentMethod('wallet')}
                    className="accent-teal-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Help-U Wallet</p>
                    <p className="text-xs text-gray-500">Balance: ₹{walletBalance.toFixed(2)} {walletBalance < totalAmount && '(Insufficient balance)'}</p>
                  </div>
                </div>
              </label>

              <label className={`flex items-center justify-between p-3 rounded-xl border bg-white cursor-pointer transition-all ${paymentMethod === 'pay_at_home' ? 'border-teal-500 ring-2 ring-teal-500/20' : 'border-gray-200'}`}>
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="pay_at_home"
                    checked={paymentMethod === 'pay_at_home'}
                    onChange={() => setPaymentMethod('pay_at_home')}
                    className="accent-teal-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Pay at Home</p>
                    <p className="text-xs text-gray-500">Pay cash or QR after service completion</p>
                  </div>
                </div>
              </label>
            </div>
          </div>
        )}

        <div className="p-4 pb-[max(1rem,var(--safe-bottom))]">
          <button
            onClick={(houseNumber || addressDetails) ?
              (currentStep === 'payment' ? handlePayment : handleSearchWorkers) :
              handleProceed}
            disabled={searchingWorkers}
            className="w-full text-white py-3 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-teal-500/30"
            style={{ backgroundColor: themeColors.button }}
          >
            {searchingWorkers ? 'Searching for workers...' :
              currentStep === 'payment' ? (paymentMethod === 'online' ? 'Proceed to Pay' : paymentMethod === 'wallet' ? 'Pay from Wallet' : 'Confirm Booking') :
                bookingType === 'instant' ? 'Find nearby workers now' :
                  (selectedDate && selectedTime && houseNumber ?
                    'Find nearby workers' :
                    (houseNumber || addressDetails) ? 'Select Time Slot' : 'Add address to proceed')}
          </button>
        </div>
      </div>

      {/* Live Booking Status Card (Visible when minimized) */}
      <LiveBookingCard key={bookingRequest?._id || 'default'} />

      {/* Worker Search Modal */}
      <WorkerSearchModal
        isOpen={showWorkerModal}
        onClose={() => {
          setShowWorkerModal(false);
          if (currentStep === 'accepted') {
            setCurrentStep('payment');
          } else if (currentStep === 'failed') {
            setCurrentStep('details');
          }
        }}
        currentStep={currentStep}
        acceptedWorker={acceptedWorker}
        search={searchInfo}
        booking={{
          serviceName: bookingRequest?.serviceName || cartItems[0]?.title,
          categoryIcon: toAssetUrl(bookingRequest?.categoryIcon || cartItems[0]?.categoryIcon || ''),
          address: [houseNumber, address].filter(Boolean).join(', '),
          photosCount: getUploadedIssuePhotos().length + getUploadedIssueVideos().length
        }}
        onRetry={() => {
          handleSearchWorkers();
        }}
      />

      {/* Contact Details Edit Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <ModalLock />
          <div className="bg-white w-full max-w-sm rounded-2xl p-6 shadow-xl animate-scale-in">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Update Contact Details</h3>
            <p className="text-sm text-gray-500 mb-4">These details will be used for this booking only.</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Name</label>
                <input
                  type="text"
                  value={contactDetails.name}
                  onChange={(e) => setContactDetails(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full mt-1 p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="Enter name"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Phone Number</label>
                <div className="flex gap-2">
                  <span className="p-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-500 font-medium select-none">+91</span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={contactDetails.phone?.replace('+91', '')?.replace(/^\+91/, '') || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setContactDetails(prev => ({ ...prev, phone: val }));
                    }}
                    className="w-full p-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-500"
                    placeholder="9999999999"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => setShowContactModal(false)}
                  className="py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (contactDetails.name.length < 2) {
                      toast.error('Please enter a valid name');
                      return;
                    }
                    if (!contactDetails.phone || contactDetails.phone.length < 10) {
                      toast.error('Please enter a valid 10-digit phone number');
                      return;
                    }
                    setShowContactModal(false);
                  }}
                  className="py-3 rounded-xl font-bold text-white shadow-lg shadow-teal-500/30 active:scale-95 transition-all"
                  style={{ backgroundColor: themeColors.button }}
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Address Selection Modal */}
      <AddressSelectionModal
        isOpen={showAddressModal}
        onClose={() => setShowAddressModal(false)}
        address={address}
        houseNumber={houseNumber}
        onHouseNumberChange={setHouseNumber}
        onSave={handleAddressSave}
      />

      {/* Time Slot Modal */}
      <TimeSlotModal
        isOpen={showTimeSlotModal}
        onClose={() => setShowTimeSlotModal(false)}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        onDateSelect={setSelectedDate}
        onTimeSelect={setSelectedTime}
        onSave={handleTimeSlotSave}
        getDates={getDates}
        getTimeSlots={getTimeSlots}
        formatDate={formatDate}
        isDateSelected={isDateSelected}
        isTimeSelected={isTimeSelected}
      />
    </div>
  );
};

export default Checkout;
