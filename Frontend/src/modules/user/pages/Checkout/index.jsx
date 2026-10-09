import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import { FiArrowLeft, FiShoppingCart, FiTrash2, FiMinus, FiPlus, FiPhone, FiHome, FiClock, FiEdit2, FiCheckCircle, FiInfo } from 'react-icons/fi';
import { MdStar } from 'react-icons/md';
import { toast } from 'react-hot-toast';
import { themeColors } from '../../../../theme';
import AddressSelectionModal from './components/AddressSelectionModal';
import TimeSlotModal from './components/TimeSlotModal';
import WorkerSearchModal from './components/WorkerSearchModal';
import { bookingService } from '../../../../services/bookingService';
import { paymentService } from '../../../../services/paymentService';
import { cartService } from '../../../../services/cartService';
import { configService } from '../../../../services/configService';
import { getPlans } from '../../services/planService';
import { userAuthService } from '../../../../services/authService';
import { useCart } from '../../../../context/CartContext';
import LiveBookingCard from '../../components/booking/LiveBookingCard';

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
  const category = location.state?.category || null;
  const plan = location.state?.plan || null;
  const { fetchCart: fetchCartGlobal, clearCart: clearCartGlobal, removeCategoryItems: removeCategoryGlobal } = useCart();

  const [cartItems, setCartItems] = useState([]);
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showTimeSlotModal, setShowTimeSlotModal] = useState(false);
  const [address, setAddress] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [addressDetails, setAddressDetails] = useState(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);
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
  const [paymentMethod, setPaymentMethod] = useState('online'); // 'online' | 'pay_at_home'

  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const [selectedTime, setSelectedTime] = useState(null);
  const [visitedFee, setVisitedFee] = useState(29);
  const [gstPercentage, setGstPercentage] = useState(18);
  const [bookingType, setBookingType] = useState('instant'); // 'instant' | 'scheduled'

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

    // Refresh on focus to catch updates from profile page
    window.addEventListener('focus', loadUserData);
    return () => window.removeEventListener('focus', loadUserData);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);

        if (plan) {
          setCartItems([{
            id: plan.id,
            name: plan.name,
            price: plan.price,
            description: plan.description,
            isPlan: true,
            serviceCount: 1
          }]);

          // Still need config and address for plan checkout
          const response = await userAuthService.getCheckoutData();
          if (response.success) {
            setVisitedFee(0); // Plans usually have 0 visitor fee
            setGstPercentage(response.settings?.serviceGstPercentage ?? 18);

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
            }
          }
        } else {
          const response = await userAuthService.getCheckoutData();
          if (response.success) {
            // Set Config
            setVisitedFee(response.settings?.visitedCharges ?? 29);
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
        }
      } catch (error) {
        console.error('Failed to load checkout data', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [category, plan]);

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

  const handleRemoveItem = async (itemId) => {
    try {
      const response = await cartService.removeItem(itemId);
      if (response.success) {
        toast.success('Item removed');
        // Refresh global cart badge
        fetchCartGlobal();
        loadCart();
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

  const handleProceed = async () => {
    // Validation
    if (bookingType === 'instant') {
      if (!addressDetails) {
        setShowAddressModal(true);
        return;
      }
    } else {
      if (!addressDetails || !selectedDate || !selectedTime) {
        if (!addressDetails) setShowAddressModal(true);
        else if (!selectedDate || !selectedTime) setShowTimeSlotModal(true);
        return;
      }
    }

    try {
      setShowWorkerModal(true);
      setCurrentStep('searching');

      const firstItem = cartItems[0];
      if (!firstItem) {
        toast.error('Your cart is empty');
        return;
      }
      const serviceId = typeof firstItem.serviceId === 'object'
        ? firstItem.serviceId._id || firstItem.serviceId.id
        : firstItem.serviceId;

      const bookedItemsData = cartItems.map(item => ({
        brandName: item.sectionTitle || item.brand || '',
        brandIcon: item.sectionIcon || null,
        card: {
          title: item.card?.title || item.title,
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

      // Calculate Scheduled Data for Instant
      let finalDate = selectedDate;
      let finalTime = selectedTime;
      let finalTimeSlot = {
        start: selectedTime,
        end: getTimeSlots().find(slot => slot.value === selectedTime)?.end || selectedTime
      };

      if (bookingType === 'instant') {
        const now = new Date();
        finalDate = now;
        finalTime = "ASAP";
        finalTimeSlot = { start: "Now", end: "45 mins" };
      }

      const response = await bookingService.create({
        bookingType, // 'instant' or 'scheduled'
        serviceId,
        address: {
          type: addressDetails?.type || 'home',
          addressLine1: addressDetails?.addressLine1 || address,
          addressLine2: houseNumber,
          city: addressDetails?.city || getAddressComponent('locality') || getAddressComponent('administrative_area_level_2') || 'City',
          state: addressDetails?.state || getAddressComponent('administrative_area_level_1') || 'State',
          pincode: addressDetails?.pincode || getAddressComponent('postal_code') || '000000',
          lat: addressDetails?.lat,
          lng: addressDetails?.lng
        },
        scheduledDate: finalDate, // Date object
        scheduledTime: bookingType === 'instant' ? "ASAP" : (getTimeSlots().find(slot => slot.value === finalTime)?.display || finalTime),
        timeSlot: finalTimeSlot,
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

        contactDetails: {
          name: contactDetails.name,
          phone: contactDetails.phone.length === 10 && !contactDetails.phone.includes('+') ? `+91${contactDetails.phone}` : contactDetails.phone
        },

        paymentMethod: 'online',
        bookedItems: bookedItemsData
      });

      if (response.success) {
        setBookingRequest(response.data);

        // If the backend returns an assigned worker immediately (rare but possible)
        if (response.data.vendorId && (response.data.status === 'ACCEPTED' || response.data.status === 'ASSIGNED')) {
          setCurrentStep('accepted');
          setAcceptedWorker({
            ...(response.data.vendorId || {}),
            price: response.data.finalAmount || amountToPay,
            distance: 'within 5km', // default
            estimatedTime: '15-30 min'
          });
          setSearchingWorkers(false); // Finished search
        } else {
          // Normal flow: Entered pooling/searching
          setCurrentStep('waiting'); // Waiting for worker acceptance
          // Keep searchingWorkers = true to disable buttons and show progress
        }
      }
    } catch (error) {
      toast.error('Failed to initiate booking request. Please try again.');
      setShowWorkerModal(false);
      setSearchingWorkers(false);
    }
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

        // Close modal after 2 seconds and navigate to confirmation
        setTimeout(() => {
          setShowWorkerModal(false);
          navigate(`/user/booking-confirmation/${bookingRequest._id}`, {
            replace: true
          });
        }, 2000);
      }
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

      if (cartItems.length === 0 && !bookingRequest) {
        toast.error('Cart is empty');
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

      // Create booking request
      toast.loading('Searching for nearby workers...');

      // Ensure serviceId is a string (handle populated cart data)
      const serviceId = typeof firstItem.serviceId === 'object'
        ? firstItem.serviceId._id || firstItem.serviceId.id
        : firstItem.serviceId;

      // Prepare bookedItems array matching Service catalog structure
      // Prepare bookedItems array matching Service catalog structure
      const bookedItemsData = cartItems.map(item => ({
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



      const bookingResponse = await bookingService.create({
        bookingType, // 'instant' or 'scheduled'
        serviceId: serviceId,
        address: addressObj,
        scheduledDate: finalDate.toISOString(),
        scheduledTime: finalTimeDisplay,
        timeSlot: timeSlotObj,
        // userNotes: null, // Removed per request
        paymentMethod: amountToPay === 0 ? 'plan_benefit' : 'pay_at_home',
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

        bookedItems: bookedItemsData
      });

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
      toast.dismiss();

      // Clear cart immediately as search starts (consumes items) - ONLY if workers found
      if (!bookingResponse.noWorkersFound) {
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

      // If no workers found, redirect or refresh immediately
      if (bookingResponse.noWorkersFound) {
        toast.dismiss();
        const bookingId = booking?._id || booking?.id;

        // Ensure we stop searching and close the modal
        setSearchingWorkers(false);
        setShowWorkerModal(false);

        if (bookingId) {
          toast.error('No workers currently available for this service.');

          // Auto-cancel and refresh
          const cancelAndRefresh = async () => {
            try {
              await bookingService.cancel(bookingId, 'Initial search found no available workers');
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            } catch (err) {
              console.error('Auto-cancel failed:', err);
              window.location.reload();
            }
          };
          cancelAndRefresh();
        } else {
          // Fallback if ID is missing for some reason
          setCurrentStep('details');
          toast.error('Search failed. Please try again.');
          setTimeout(() => window.location.reload(), 2000);
        }
      } else {
        // Move to waiting state - alerts sent to nearby workers
        setCurrentStep('waiting');
        toast.success('Finding nearby workers... Alerts sent to workers within 10km!');
      }

      // REMOVED local setCartItems([]) - The summary should remain visible while searching
      // The cart is already cleared in server database by the backend and previous API call.

    } catch (error) {
      toast.dismiss();
      console.error('Search workers error:', error);
      toast.error('Failed to search for workers. Please try again.');
      setCurrentStep('details');
      setSearchingWorkers(false);
      setShowWorkerModal(false);
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

      // Get Razorpay key
      const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
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
              razorpay_signature: response.razorpay_signature
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
    if (totalAmount === 0) {
      // Free booking covered by plan
      toast.success('Booking confirmed!');
      // Clear cart
      try {
        await clearCartGlobal();
        setCartItems([]);
      } catch (error) { }

      // Navigate
      if (bookingRequest) {
        navigate(`/user/booking-confirmation/${bookingRequest._id}`, { replace: true });
      }
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
    }
    setShowAddressModal(false);

    // Save to profile
    if (locationObj) {
      try {
        const getComp = (type) => locationObj.components?.find(c => c.types.includes(type))?.long_name || '';

        const newAddress = {
          type: 'home',
          addressLine1: locationObj.address,
          addressLine2: savedHouseNumber,
          city: getComp('locality') || getComp('administrative_area_level_2') || 'City',
          state: getComp('administrative_area_level_1') || 'State',
          pincode: getComp('postal_code') || '000000',
          lat: locationObj.lat,
          lng: locationObj.lng,
          isDefault: true
        };

        const response = await userAuthService.getProfile();
        if (response.success && response.user) {
          const updatedAddresses = [newAddress]; // Always replace with single address
          await userAuthService.updateProfile({ addresses: updatedAddresses });
          toast.success('Address updated in profile!');
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

  const handleCartClick = () => {
    if (plan) return; // Disable cart click for plan
    navigate('/user/cart');
  };

  // Fetch plan upgrade details if applicable
  const [upgradePreview, setUpgradePreview] = useState(null);
  const isUpgrade = location.state?.isUpgrade;

  useEffect(() => {
    if (plan && isUpgrade) {
      const fetchUpgradeDetails = async () => {
        try {
          const res = await paymentService.getUpgradeDetails(plan.id);
          if (res.success) {
            setUpgradePreview(res.data);
          }
        } catch (error) {
          console.error(error);
          toast.error('Failed to calculate upgrade price');
        }
      };
      fetchUpgradeDetails();
    }
  }, [plan, isUpgrade]);

  const handlePlanPayment = async () => {
    try {
      if (!razorpayLoaded) {
        toast.error('Payment gateway not ready');
        return;
      }

      const response = await paymentService.createPlanOrder(plan.id);
      if (response.success) {
        const { orderId, amount, key } = response.data;

        const options = {
          key,
          amount: amount * 100,
          currency: 'INR',
          name: 'Help U',
          description: `Payment for ${plan.name} ${isUpgrade ? '(Upgrade)' : ''}`,
          order_id: orderId,
          handler: async (response) => {
            try {
              await paymentService.verifyPlanPayment({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                planId: plan.id
              });
              toast.success('Subscription activated successfully!');
              navigate('/user');
            } catch (e) {
              toast.error('Verification failed');
            }
          },
          prefill: {
            contact: userPhone
          },
          theme: {
            color: themeColors.primary
          }
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      }
    } catch (error) {
      console.error(error);
      toast.error('Payment initiation failed');
    }
  };

  // Fetch plan and user profile to determine discounts
  useEffect(() => {
    const fetchBenefits = async () => {
      try {
        const [plansRes, userRes] = await Promise.all([
          getPlans(),
          userAuthService.getProfile(), // Ensure we have latest status
        ]);

        if (plansRes.success && userRes.success && userRes.user?.plans?.isActive) {
          const userPlanName = userRes.user.plans.name;
          const activePlan = plansRes.data.find(p => p.name === userPlanName);

          if (activePlan) {
            setPlanBenefits({
              name: activePlan.name,
              freeCategories: activePlan.freeCategories || [],
              freeBrands: activePlan.freeBrands || [],
              freeServices: activePlan.freeServices || []
            });

          }
        }
      } catch (e) {
        console.error('Failed to load plan benefits', e);
      }
    };

    // Only fetch if not a plan purchase (standard checkout)
    if (!plan) {
      fetchBenefits();
    }
  }, [plan]);

  const [planBenefits, setPlanBenefits] = useState({ name: '', freeCategories: [], freeBrands: [], freeServices: [] });

  // Helper to normalize MongoDB IDs (handles strings, objects with _id, and $oid)
  const normalizeId = (id) => {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (id.$oid) return id.$oid;
    if (id._id) return normalizeId(id._id);
    return String(id);
  };

  // Calculate totals with Plan Benefits
  const calculateItemPrice = (item) => {
    if (plan) return item.price || 0; // Plan purchase

    const itemCatId = normalizeId(item.categoryId);
    const itemBrandId = normalizeId(item.brandId || item.sectionId);
    const itemServiceId = normalizeId(item.serviceId);

    // Check if free
    const isFreeCategory = itemCatId && planBenefits.freeCategories.some(cat => {
      return normalizeId(cat) === itemCatId;
    });

    const isFreeBrand = itemBrandId && planBenefits.freeBrands.some(brand => {
      return normalizeId(brand) === itemBrandId;
    });

    const isFreeService = itemServiceId && planBenefits.freeServices.some(svc => {
      return normalizeId(svc) === itemServiceId;
    });

    if (isFreeCategory || isFreeBrand || isFreeService) {
      return 0;
    }
    return item.price || 0;
  };

  const itemTotal = cartItems.reduce((sum, item) => sum + calculateItemPrice(item), 0);
  // Calculate savings including Plan Savings
  const totalOriginalPrice = cartItems.reduce((sum, item) => {
    const original = (item.originalPrice || item.unitPrice || (item.price / (item.serviceCount || 1))) * (item.serviceCount || 1);
    // If priced 0, original is huge saving
    return sum + original;
  }, 0);

  const savings = totalOriginalPrice - itemTotal;
  const taxesAndFee = Math.round((itemTotal * gstPercentage) / 100);
  // Visited fee logic: if Total is 0 (All free), user might still pay visited fee?
  // User says "no payemtn". So maybe visited fee also waived? Or user pays visited fee?
  // "ask direct servicebooking" -> implies fully free.
  // I'll set visitedFee to 0 if itemTotal is 0?
  // Configurable?
  // Assuming "Free under plan" means NO Payment.
  const finalVisitedFee = itemTotal === 0 ? 0 : visitedFee;

  const totalAmount = itemTotal + taxesAndFee + finalVisitedFee;
  const amountToPay = totalAmount;

  // Helper for Free Plan Full Breakdown Display
  // If the booking is free, we still want to show what the Tax/Fee WOULD have been
  const displayTax = totalAmount === 0 ? Math.round((totalOriginalPrice * gstPercentage) / 100) : taxesAndFee;
  const displayFee = totalAmount === 0 ? visitedFee : finalVisitedFee;
  const displaySavings = totalAmount === 0 ? (totalOriginalPrice + displayTax + displayFee) : savings;

  // Date and time slot helper functions
  const getDates = () => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const getTimeSlots = () => {
    const allSlots = [
      { value: '09:00', end: '10:00', display: '9:00 AM' },
      { value: '10:00', end: '11:00', display: '10:00 AM' },
      { value: '11:00', end: '12:00', display: '11:00 AM' },
      { value: '12:00', end: '13:00', display: '12:00 PM' },
      { value: '13:00', end: '14:00', display: '1:00 PM' },
      { value: '14:00', end: '15:00', display: '2:00 PM' },
      { value: '15:00', end: '16:00', display: '3:00 PM' },
      { value: '16:00', end: '17:00', display: '4:00 PM' },
      { value: '17:00', end: '18:00', display: '5:00 PM' },
      { value: '18:00', end: '19:00', display: '6:00 PM' },
      { value: '19:00', end: '20:00', display: '7:00 PM' },
      { value: '20:00', end: '21:00', display: '8:00 PM' },
    ];

    // If today is selected, filter out past time slots
    const now = new Date();
    const isToday = selectedDate && selectedDate.toDateString() === now.toDateString();

    if (!isToday) {
      return allSlots;
    }

    // Get current hour + 1 (minimum 1 hour buffer for workers to accept)
    const currentHour = now.getHours();
    const minHour = currentHour + 1;

    return allSlots.filter(slot => {
      const slotHour = parseInt(slot.value.split(':')[0], 10);
      return slotHour >= minHour;
    });
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
        <header className="bg-white">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <button
                onClick={handleBack}
                className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              >
                <FiArrowLeft className="w-6 h-6 text-black" />
              </button>
              <h1 className="text-xl font-bold text-black">Your cart</h1>
            </div>
          </div>
          <div className="border-b border-gray-200"></div>
        </header>
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
      <header className="bg-white">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiArrowLeft className="w-6 h-6 text-black" />
            </button>
            <h1 className="text-xl font-bold text-black">
              {category ? `${category} Checkout` : 'Your cart'}
            </h1>
          </div>
        </div>
        <div className="border-b border-gray-200"></div>
      </header>

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
                    ) : (
                      <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center text-[10px] font-bold text-gray-500">
                        {(brandName || "B").charAt(0)}
                      </div>
                    )}
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
                  </div>
                  {!item.isPlan && (
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
                  )}
                  {!item.isPlan && (
                    <button
                      onClick={() => handleRemoveItem(item._id)}
                      className="absolute top-3 right-3 p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-black">
                    {calculateItemPrice(item) === 0 ? (
                      <span className="text-green-600">Free</span>
                    ) : (
                      `₹${(item.price || 0).toLocaleString('en-IN')}`
                    )}
                  </span>
                  {calculateItemPrice(item) === 0 && (
                    <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full border border-green-200">
                      WITH PLAN
                    </span>
                  )}
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

        {/* ... */}


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

        {/* Payment Summary */}
        <div className="bg-white border-2 border-slate-100 rounded-2xl p-5 mb-6 shadow-sm overflow-hidden relative">
          {/* Decorative Background for Header */}
          <div className="absolute top-0 left-0 right-0 h-1" style={{ background: themeColors.gradient }}></div>

          <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
            <FiShoppingCart className="w-5 h-5" style={{ color: themeColors.button }} />
            Payment Summary
          </h3>

          <div className="space-y-3">
            {/* Original Price (before plan) */}
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

            {/* Upgrade Credit (for plan upgrades) */}
            {upgradePreview && upgradePreview.credit > 0 && (
              <div className="flex justify-between items-center text-green-600">
                <span className="text-sm font-medium">Plan Credit</span>
                <span className="text-sm font-bold">-₹{upgradePreview.credit.toLocaleString('en-IN')}</span>
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

            {/* Divider */}
            <div className="border-t border-slate-200 pt-4 mt-2">
              <div className="flex justify-between items-center">
                <span className="text-base font-bold text-slate-900">Total Payable</span>
                <div className="flex flex-col items-end">
                  {totalAmount === 0 ? (
                    <>
                      <span className="text-sm font-medium text-slate-400 line-through">
                        ₹{Math.round(totalOriginalPrice + displayTax + displayFee).toLocaleString('en-IN')}
                      </span>
                      <span className="text-xl font-black text-green-600">FREE</span>
                    </>
                  ) : (
                    <span className="text-xl font-black text-slate-900">
                      ₹{totalAmount.toLocaleString('en-IN')}
                    </span>
                  )}
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

        {/* Free Plan Benefit Card */}
        {totalAmount === 0 && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-100/50 border border-green-200 rounded-2xl p-5 mb-6 relative overflow-hidden">
            <div className="flex items-start gap-4 z-10 relative">
              <div className="bg-green-500 rounded-full p-2 shadow-lg shadow-green-200 shrink-0">
                <FiCheckCircle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-green-800 mb-1">Covered by {planBenefits.name}</h3>
                <p className="text-sm text-green-700 leading-relaxed font-medium opacity-90">
                  You save <span className="font-bold">₹{Math.round(totalOriginalPrice + displayTax + displayFee).toLocaleString('en-IN')}</span> on this booking!
                  Your plan covers all costs.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Cancellation Policy */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-base font-bold text-black mb-2">Cancellation policy</h3>
          <p className="text-sm text-gray-700 mb-2">
            Free cancellations if done more than 12 hrs before the service or if a professional isn't assigned. A fee will be charged otherwise.
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
              onClick={() => setBookingType('scheduled')}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${bookingType === 'scheduled' ? 'bg-white shadow-sm text-black' : 'text-gray-500'}`}
            >
              <span>📅</span> Slot
            </button>
          </div>
          {bookingType === 'instant' && (
            <p className="text-xs text-center text-green-600 font-medium mt-1 mb-1">
              <span className="font-bold">⚡ Priority Service:</span> Worker arrives in ~45 mins
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

        <div className="p-4">
          <button
            onClick={plan ? handlePlanPayment :
              (houseNumber || addressDetails) ?
                (currentStep === 'payment' ? handlePayment : handleSearchWorkers) :
                handleProceed}
            disabled={searchingWorkers}
            className="w-full text-white py-3 rounded-lg text-base font-semibold transition-colors disabled:opacity-50 shadow-lg shadow-teal-500/30"
            style={{ backgroundColor: themeColors.button }}
          >
            {searchingWorkers ? 'Searching for workers...' :
              currentStep === 'payment' ? (totalAmount === 0 ? 'Confirm Booking (Free)' : (paymentMethod === 'online' ? 'Proceed to Pay' : 'Confirm Booking')) :
                plan ? 'Proceed to Payment' :
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
        onRetry={() => {
          handleSearchWorkers();
        }}
      />

      {/* Contact Details Edit Modal */}
      {showContactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
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
