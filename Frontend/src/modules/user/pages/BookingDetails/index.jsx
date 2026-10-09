import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import useAppNotifications from '../../../../hooks/useAppNotifications';
import { themeColors } from '../../../../theme';
import { MdQrCode } from 'react-icons/md';
import {
  FiArrowLeft,
  FiMapPin,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiLoader,
  FiCalendar,
  FiDollarSign,
  FiPackage,
  FiEdit2,
  FiPhone,
  FiMail,
  FiKey,
  FiStar,
  FiAward,
  FiX,
  FiUser,
  FiChevronRight,
  FiSearch,
  FiHome,
  FiAlertCircle
} from 'react-icons/fi';
import { bookingService } from '../../../../services/bookingService';
import { paymentService } from '../../../../services/paymentService';
import { cartService } from '../../../../services/cartService';
import RatingModal from '../../components/booking/RatingModal';
import PaymentVerificationModal from '../../components/booking/PaymentVerificationModal';
import { ConfirmDialog } from '../../../../components/common';
import ReviewCard from '../../components/booking/ReviewCard';
import NotificationBell from '../../components/common/NotificationBell';
import api from '../../../../services/api';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};


const BookingDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paying, setPaying] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });

  const [supportInfo, setSupportInfo] = useState({
    email: 'support@homestr.com',
    phone: ''
  });

  const socket = useAppNotifications();

  // Fetch support settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await api.get('/public/config');
        if (response.data?.success && response.data?.settings) {
          const { supportEmail, supportPhone } = response.data.settings;
          setSupportInfo({
            email: supportEmail || 'help@homestr.in',
            phone: supportPhone || '+919999999999'
          });
        }
      } catch (error) {
        console.error('Failed to fetch support settings:', error);
        setSupportInfo({
          email: 'help@homestr.in',
          phone: '+919999999999'
        });
      }
    };
    fetchSettings();
  }, []);

  // Function to load booking
  const loadBooking = async () => {
    try {
      // Don't set loading true on refresh to avoid flicker
      const response = await bookingService.getById(id);
      if (response.success) {
        const data = { ...response.data };
        // Calculate notional display values for plan_benefit
        if (data.paymentMethod === 'plan_benefit') {
          if (!data.tax) data.tax = (data.basePrice || 0) * 0.18;
          if (!data.visitingCharges && !data.visitationFee) data.visitingCharges = 49;
        }
        setBooking(data);
      } else {
        toast.error(response.message || 'Booking not found');
        navigate('/user/my-bookings');
      }
    } catch (error) {
      // Failed to load booking details
      // toast.error('Failed to load booking details'); 
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadBooking();
    }
  }, [id, navigate]);

  // Auto-show rating modal ONLY when booking is fully completed AND paid
  useEffect(() => {
    if (booking) {
      const isCompleted = ['completed', 'work_done'].includes(booking.status?.toLowerCase());
      const isPaid = ['success', 'paid', 'collected_by_vendor'].includes(booking.paymentStatus?.toLowerCase());
      const isRated = !!booking.rating;
      const isDismissed = localStorage.getItem(`rating_dismissed_${id}`);

      // Only show rating modal if work is done AND payment is verified
      if (isCompleted && isPaid && !isRated && !isDismissed) {
        setShowRatingModal(true);
      }
    }
  }, [booking, id]);

  // Track if we've shown the payment modal this session to prevent re-opening on data refresh


  // Handle Payment Modal Visibility - Auto-open on new payment request from worker
  useEffect(() => {
    if (!booking) return;
    
    const isPaymentDone = booking.paymentStatus === 'success' || booking.cashCollected === true;
    const isAdvancePaid = booking.advancePayment?.status === 'paid';
    const hasAdvanceRequest = booking.advancePayment?.status === 'requested';

    // Track the latest OTP to detect a fresh payment request from the worker
    const lastSeenOtp = sessionStorage.getItem(`last_seen_otp_${booking._id}`);
    const hasNewOtpRequest = booking.customerConfirmationOTP && booking.customerConfirmationOTP !== lastSeenOtp;
    
    // We also show if it was never shown and we have a pending payment request
    const hasShown = sessionStorage.getItem(`payment_modal_shown_${booking._id}`);

    if ((!isPaymentDone && (hasNewOtpRequest || (!hasShown && (booking.customerConfirmationOTP || booking.qrPaymentInitiated)))) || hasAdvanceRequest) {
      setShowPaymentModal(true);
      sessionStorage.setItem(`payment_modal_shown_${booking._id}`, 'true');
      if (booking.customerConfirmationOTP) {
        sessionStorage.setItem(`last_seen_otp_${booking._id}`, booking.customerConfirmationOTP);
      }
    } else if (booking.qrPaymentInitiated === false && booking.customerConfirmationOTP && !isPaymentDone) {
      // Re-trigger if it switches from QR to Cash
      setShowPaymentModal(true);
    }
    // Close if payment becomes done
    else if (isPaymentDone || isAdvancePaid) {
      setShowPaymentModal(false);
    }
  }, [booking]);

  // Socket Listener for Real-time Updates
  useEffect(() => {
    if (socket && id) {
      // Handler for booking updates
      const handleUpdate = (data) => {
        // Check if update relates to this booking
        if (data.bookingId === id || data.relatedId === id || data.data?.bookingId === id) {

          // Instant UI update for critical fields (status, OTPs, amounts)
          setBooking(prev => {
            if (!prev) return prev;
            const newData = { ...prev, ...(data.data || data) };

            // Calculate notional display values for plan_benefit
            if (newData.paymentMethod === 'plan_benefit') {
              if (!newData.tax) newData.tax = (newData.basePrice || 0) * 0.18;
              if (!newData.visitingCharges && !newData.visitationFee) newData.visitingCharges = 49;
            }
            return newData;
          });

          // Fetch full data to ensure consistency
          loadBooking();

          if (data.message) {
            toast(data.message, { icon: '🔔' });
          }
        }
      };

      socket.on('booking_updated', handleUpdate);
      socket.on('notification', handleUpdate);

      return () => {
        socket.off('booking_updated', handleUpdate);
        socket.off('notification', handleUpdate);
      };
    }
  }, [socket, id]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'confirmed':
        return <FiCheckCircle className="w-5 h-5 text-green-500" />;
      case 'in_progress':
      case 'journey_started':
        return <FiLoader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'visited':
        return <FiMapPin className="w-5 h-5 text-teal-600" />;
      case 'completed':
        return <FiCheckCircle className="w-5 h-5 text-green-600" />;
      case 'cancelled':
        return <FiXCircle className="w-5 h-5 text-red-500" />;
      case 'awaiting_payment':
      case 'work_done':
        return <FiClock className="w-5 h-5 text-orange-500" />;
      case 'requested':
      case 'searching':
        return <FiSearch className="w-5 h-5 text-amber-500 animate-pulse" />;
      default:
        return <FiClock className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'in_progress':
      case 'journey_started':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'visited':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      case 'completed':
        return 'bg-gray-50 text-gray-700 border-gray-200';
      case 'cancelled':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'awaiting_payment':
      case 'work_done':
        return 'bg-orange-50 text-orange-700 border-orange-200';
      case 'requested':
      case 'searching':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'confirmed': return 'Confirmed';
      case 'journey_started': return 'Agent En Route';
      case 'visited': return 'Agent Arrived';
      case 'in_progress': return 'In Progress';
      case 'work_done': return 'Work Done'; // Payment Pending
      case 'completed': return 'Completed';
      case 'cancelled': return 'Cancelled';
      case 'requested':
      case 'searching': return 'Finding Expert';
      default: return status?.replace('_', ' ') || 'Pending';
    }
  };

  // ... (keep handle methods same) ...

  const handleCancelBooking = async () => {
    // Check if journey has started to determine if a fee applies
    const journeyStarted = ['journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase());
    const cancellationFee = booking.visitingCharges || 49;

    const modalTitle = journeyStarted ? 'Cancellation Fee Applies' : 'Cancel Booking';
    const modalMessage = journeyStarted
      ? `The service agent has already started their journey. Cancelling now will incur a fee of ₹${cancellationFee}, which will be deducted from your wallet or refund amount. Do you want to proceed?`
      : 'Are you sure you want to cancel this booking? You will receive a full refund if applicable. This action cannot be undone.';

    setConfirmDialog({
      isOpen: true,
      title: modalTitle,
      message: modalMessage,
      type: 'danger',
      onConfirm: async () => {
        try {
          const response = await bookingService.cancel(booking._id || booking.id, 'Cancelled by user');
          if (response.success) {
            toast.success('Booking cancelled successfully');
            loadBooking();
          } else {
            toast.error(response.message || 'Failed to cancel booking');
          }
        } catch (error) {
          toast.error('Failed to cancel booking. Please try again.');
        }
      }
    });
  };

  const handleOnlinePayment = async () => {
    if (paying) return;
    const paymentType = booking.advancePayment?.status === 'requested' ? 'advance' : 'final';

    // If a Razorpay order already exists for this booking and hasn't been used, skip creating a new one
    const existingOrderId = paymentType === 'advance'
      ? booking.advancePayment?.razorpayOrderId
      : booking.razorpayOrderId;

    if (existingOrderId) {
      // Open Razorpay with existing order
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: Math.round(((paymentType === 'advance'
          ? booking.advancePayment?.requestedAmount
          : (booking.userPayableAmount || booking.finalAmount)) || 0) * 100),
        currency: 'INR',
        order_id: existingOrderId,
        name: 'Help U',
        description: `${paymentType === 'advance' ? 'Advance' : 'Final'} payment for ${booking.serviceName}`,
        handler: async function (response) {
          toast.loading('Verifying payment...');
          const verifyResponse = await paymentService.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
          toast.dismiss();

          if (verifyResponse.success) {
            toast.success('Payment successful!');
            window.location.reload();
          } else {
            toast.error('Payment verification failed');
          }
          setPaying(false);
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
          }
        },
        prefill: { name: 'User', contact: '' },
        theme: { color: themeColors.button }
      };
      setPaying(true);
      const razorpay = new window.Razorpay(options);
      razorpay.open();
      return;
    }

    try {
      setPaying(true);
      toast.loading('Creating payment order...');
      const orderResponse = await paymentService.createOrder(booking._id || booking.id, paymentType);
      toast.dismiss();

      if (!orderResponse.success) {
        toast.error(orderResponse.message || 'Failed to create payment order');
        setPaying(false);
        return;
      }

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: Math.round(orderResponse.data.amount * 100),
        currency: orderResponse.data.currency || 'INR',
        order_id: orderResponse.data.orderId,
        name: 'Help U',
        description: `${paymentType === 'advance' ? 'Advance' : 'Final'} payment for ${booking.serviceName}`,
        handler: async function (response) {
          toast.loading('Verifying payment...');
          const verifyResponse = await paymentService.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
          toast.dismiss();

          if (verifyResponse.success) {
            toast.success('Payment successful!');
            loadBooking();
          } else {
            toast.error('Payment verification failed');
          }
          setPaying(false);
        },
        modal: {
          onhighlight: function () { },
          ondismiss: function () {
            setPaying(false);
          }
        },
        prefill: {
          name: 'User',
          contact: ''
        },
        theme: {
          color: themeColors.button
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to process payment');
      setPaying(false);
    }
  };

  const handlePayAtHome = async () => {
    try {
      toast.loading('Confirming request...');
      const response = await paymentService.confirmPayAtHome(booking._id || booking.id);
      toast.dismiss();

      if (response.success) {
        toast.success('Booking confirmed!');
        loadBooking();
      } else {
        toast.error(response.message || 'Failed to confirm booking');
      }
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to process request');
    }
  };


  const handleRateSubmit = async (ratingData) => {
    try {
      const response = await bookingService.addReview(booking._id || booking.id, ratingData);
      if (response.success) {
        toast.success('Thank you for your feedback!');
        setShowRatingModal(false);
        loadBooking();
      } else {
        toast.error(response.message || 'Failed to submit review');
      }
    } catch (error) {
      toast.error('Failed to submit review');
    }
  };


  const getAddressString = (address) => {
    if (typeof address === 'string') return address;
    if (address && typeof address === 'object') {
      return `${address.addressLine1 || ''}${address.addressLine2 ? `, ${address.addressLine2}` : ''}, ${address.city || ''}, ${address.state || ''} - ${address.pincode || ''}`;
    }
    return 'N/A';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50/50 pb-32">
        {/* Skeleton Header */}
        <header className="bg-white/80 backdrop-blur-md sticky top-0 z-40 border-b border-gray-100">
          <div className="px-4 py-3">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-gray-200 animate-pulse"></div>
              <div className="flex-1 space-y-2">
                <div className="h-5 w-32 bg-gray-200 rounded animate-pulse"></div>
                <div className="h-3 w-24 bg-gray-200 rounded animate-pulse"></div>
              </div>
            </div>
          </div>
        </header>
        {/* Skeleton Body */}
        <main className="max-w-xl mx-auto px-4 py-6 space-y-6">
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-24 animate-pulse"></div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-32 animate-pulse"></div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-48 animate-pulse"></div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 h-64 animate-pulse"></div>
        </main>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center relative bg-white">
        {/* Refined Brand Mesh Gradient Background */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0"
            style={{
              background: `
                radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}25 0%, transparent 70%),
                radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}20 0%, transparent 70%),
                radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}15 0%, transparent 75%),
                radial-gradient(at 0% 100%, ${themeColors?.brand?.teal || '#347989'}10 0%, transparent 70%),
                radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#347989'}03 0%, transparent 100%),
                #FFFFFF
              `
            }}
          />
        </div>
        <div className="text-center relative z-10 px-6">
          <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mx-auto mb-6">
            <FiSearch className="w-10 h-10 text-gray-300" />
          </div>
          <p className="text-gray-500 font-bold">Booking not found</p>
          <button
            onClick={() => navigate('/user/my-bookings')}
            className="mt-6 px-8 py-3 bg-gray-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg active:scale-95 transition-all"
          >
            Go to My Bookings
          </button>
        </div>
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // --- Payment Breakdown Calculations ---
  // Default values from booking (fallback)
  const isPlanBenefit = booking.paymentMethod === 'plan_benefit';
  const bill = booking.bill;

  // Base Logic (Services)
  // Use bill.originalServiceBase if available, else booking.basePrice
  const originalBase = bill ? (bill.originalServiceBase || 0) : (parseFloat(booking.basePrice) || 0);

  // Extra Services & Parts from worker bill (if available)
  const allBillServices = bill?.services || [];
  const services = allBillServices.filter(s => !s.isOriginal);
  const originalServiceFromBill = allBillServices.find(s => s.isOriginal);
  const parts = bill?.parts || [];
  const customItems = bill?.customItems || [];

  let extraServiceBase = 0;
  let extraServiceGST = 0;
  services.forEach(s => {
    // s.price is UNIT BASE PRICE. s.total is INCLUSIVE.
    const qty = parseFloat(s.quantity) || 1;
    const base = (parseFloat(s.price) || 0) * qty;
    const gst = parseFloat(s.gstAmount) || 0;
    extraServiceBase += base;
    extraServiceGST += gst;
  });

  let partsBase = 0;
  let partsGST = 0;
  parts.forEach(p => {
    const qty = parseFloat(p.quantity) || 1;
    partsBase += ((parseFloat(p.price) || 0) * qty);
    partsGST += (parseFloat(p.gstAmount) || 0);
  });
  customItems.forEach(c => {
    const qty = parseFloat(c.quantity) || 1;
    partsBase += ((parseFloat(c.price) || 0) * qty);
    partsGST += (parseFloat(c.gstAmount) || 0);
  });

  // Use bill.originalGST if available
  const originalGST = bill ? (bill.originalGST || 0) : (originalBase * 0.18);
  const totalGST = originalGST + extraServiceGST + partsGST;

  // Final Total
  const hasBill = !!bill;
  const finalTotal = bill?.grandTotal || (booking.finalAmount || booking.totalAmount || 0);

  // --------------------------------------

  return (
    <div className="min-h-screen pb-32 relative bg-white">
      {/* Refined Brand Mesh Gradient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute inset-0"
          style={{
            background: `
              radial-gradient(at 0% 0%, ${themeColors?.brand?.teal || '#347989'}25 0%, transparent 70%),
              radial-gradient(at 100% 0%, ${themeColors?.brand?.yellow || '#D68F35'}20 0%, transparent 70%),
              radial-gradient(at 100% 100%, ${themeColors?.brand?.orange || '#BB5F36'}15 0%, transparent 75%),
              radial-gradient(at 0% 100%, ${themeColors?.brand?.teal || '#347989'}10 0%, transparent 70%),
              radial-gradient(at 50% 50%, ${themeColors?.brand?.teal || '#347989'}03 0%, transparent 100%),
              #FFFFFF
            `
          }}
        />
        {/* Elegant Dot Grid Pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `radial-gradient(${themeColors?.brand?.teal || '#347989'} 0.8px, transparent 0.8px)`,
            backgroundSize: '32px 32px'
          }}
        />
      </div>

      <div className="relative z-10">
        {/* Modern Glassmorphism Header */}
        <header className="sticky top-0 z-40 backdrop-blur-xl bg-white/40 border-b border-black/[0.03] px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/user/my-bookings')}
              className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm border border-black/[0.02]"
            >
              <FiArrowLeft className="w-5 h-5 text-gray-800" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">Booking Details</h1>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                ID: <span className="font-mono">{booking.bookingNumber || booking._id?.slice(-8).toUpperCase()}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
          </div>
        </header>

        <main className="max-w-xl mx-auto px-4 py-6 space-y-6">


          {/* Visual Progress Stepper */}
          {['cancelled', 'rejected'].includes(booking.status?.toLowerCase()) ? (
            <div className="bg-red-50 rounded-2xl p-4 border border-red-100 flex items-center gap-3 text-red-700">
              <FiXCircle className="w-5 h-5 shrink-0" />
              <p className="font-medium text-sm">This booking has been {booking.status.toLowerCase()}.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl p-6 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="flex justify-between relative z-10">
                {/* Step 1: Booked */}
                <div className="flex flex-col items-center gap-2 w-1/4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${['pending', 'requested', 'searching', 'confirmed', 'assigned', 'journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status?.toLowerCase())
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                    <FiCheckCircle className="w-4 h-4" />
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center">Booked</p>
                </div>

                {/* Step 2: Assigned */}
                <div className="flex flex-col items-center gap-2 w-1/4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${['assigned', 'journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status?.toLowerCase())
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                    2
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center">Assigned</p>
                </div>

                {/* Step 3: In Progress */}
                <div className="flex flex-col items-center gap-2 w-1/4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${['journey_started', 'visited', 'in_progress', 'work_done', 'completed'].includes(booking.status?.toLowerCase())
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                    3
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center">Started</p>
                </div>

                {/* Step 4: Done */}
                <div className="flex flex-col items-center gap-2 w-1/4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${['work_done', 'completed'].includes(booking.status?.toLowerCase())
                    ? 'bg-teal-600 text-white shadow-lg shadow-teal-200' : 'bg-gray-100 text-gray-400'
                    }`}>
                    4
                  </div>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wide text-center">Done</p>
                </div>
              </div>
              {/* Connect lines */}
              <div className="absolute top-[4.5rem] left-[15%] right-[15%] h-0.5 bg-gray-100 -z-0">
                <div className="h-full bg-teal-500 transition-all duration-1000" style={{
                  width:
                    ['work_done', 'completed'].includes(booking.status?.toLowerCase()) ? '100%' :
                      ['journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase()) ? '66%' :
                        ['assigned'].includes(booking.status?.toLowerCase()) ? '33%' : '0%'
                }}></div>
              </div>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center justify-center">
            <div className={`px-4 py-2 rounded-full flex items-center gap-2 shadow-sm border ${getStatusColor(booking.status)}`}>
              {getStatusIcon(booking.status)}
              <span className="text-xs font-black uppercase tracking-wider">{getStatusLabel(booking.status)}</span>
            </div>
          </div>

          {/* Broadcast/Searching State Card */}
          {!booking.assignedTo && ['requested', 'searching'].includes(booking.status?.toLowerCase()) && (
            <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-amber-100 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-50 rounded-full -translate-y-16 translate-x-16 blur-3xl opacity-50 group-hover:opacity-80 transition-opacity"></div>

              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 shadow-sm">
                    <FiSearch className="w-6 h-6 text-amber-500 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-gray-900 leading-tight">Finding Your Expert</h3>
                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Broadcast in Progress</p>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-4 leading-relaxed font-medium">
                  We've sent your request to all verified experts in your area. You'll be notified automatically as soon as someone accepts.
                </p>

                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-ping"></span>
                    <span>Waiting for response from 12+ nearby partners...</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Service Partner Card */}
          {(booking.assignedTo || booking.vendorId) && ['confirmed', 'assigned', 'journey_started', 'visited', 'in_progress', 'work_done'].includes(booking.status?.toLowerCase()) && (
            <div className="bg-white rounded-3xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 transition-all hover:shadow-[0_8px_30px_rgb(0,0,0,0.08)]">
              <div className="flex justify-between items-start mb-4">
                {['journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase()) ? (
                  <div className="flex items-center gap-2">
                    <span className="flex h-3 w-3 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                    </span>
                    <p className="text-xs font-bold text-green-600 tracking-wider">LIVE TRACKING ACTIVE</p>
                  </div>
                ) : (
                  <p className="text-xs font-bold text-gray-400 tracking-wider uppercase">Your Professional</p>
                )}

                <button
                  onClick={() => navigate(`/user/booking/${booking._id || booking.id}/track`)}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  Map View <FiChevronRight />
                </button>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full p-1 bg-gradient-to-tr from-gray-100 to-gray-50 shrink-0">
                  <div className="w-full h-full rounded-full overflow-hidden relative bg-white">
                    {(booking.assignedTo?.profileImage || booking.assignedTo?.profilePhoto || booking.vendorId?.profileImage || booking.vendorId?.profilePhoto) ? (
                      <>
                        <img
                          src={toAssetUrl(booking.assignedTo?.profileImage || booking.assignedTo?.profilePhoto || booking.vendorId?.profileImage || booking.vendorId?.profilePhoto)}
                          alt="Professional"
                          className="w-full h-full object-cover"
                          onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.querySelector('.fallback-icon').style.display = 'block'; }}
                        />
                        <FiUser className="w-8 h-8 text-gray-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 fallback-icon hidden" />
                      </>
                    ) : (
                      <FiUser className="w-8 h-8 text-gray-300 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                    )}
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-gray-900 text-lg truncate">
                    {booking.assignedTo?.name || booking.vendorId?.name || 'Service Partner'}
                  </h3>
                  <div className="flex items-center gap-1.5 mt-1">
                    <div className="flex items-center gap-1 bg-yellow-50 px-2 py-0.5 rounded-md border border-yellow-100">
                      <FiStar className="w-3 h-3 text-yellow-500 fill-current" />
                      <span className="text-xs font-bold text-yellow-700">
                        {(booking.assignedTo?.rating || booking.vendorId?.rating || 0) > 0
                          ? (booking.assignedTo?.rating || booking.vendorId?.rating).toFixed(1)
                          : 'New'}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400 font-medium">• Verified</span>
                  </div>
                </div>

                {/* Quick Call Action */}
                {(booking.assignedTo?.phone || booking.vendorId?.phone) && (
                  <a
                    href={`tel:${booking.assignedTo?.phone || booking.vendorId?.phone}`}
                    className="w-10 h-10 bg-green-50 text-green-600 rounded-full flex items-center justify-center hover:bg-green-100 transition-colors active:scale-95 border border-green-100"
                  >
                    <FiPhone className="w-5 h-5" />
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Arrival OTP Card - Show during early stages until verified */}
          {(booking.arrivalOTP || booking.visitOtp) && ['confirmed', 'assigned', 'journey_started'].includes(booking.status?.toLowerCase()) && (
            <div className="relative overflow-hidden rounded-3xl shadow-lg border border-blue-100 mb-6 active:scale-[0.99] transition-all">
              {/* Animated gradient background */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 opacity-95"></div>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)]"></div>

              <div className="relative z-10 p-6 flex flex-col items-center">
                <div className="flex items-center gap-3 w-full mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                    <FiMapPin className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">Verification OTP</h3>
                    <p className="text-xs text-blue-100 font-medium">Share when professional reaches</p>
                  </div>
                </div>

                {/* OTP Display */}
                <div className="flex justify-center gap-3 mb-5">
                  {String(booking.arrivalOTP || booking.visitOtp).split('').map((digit, idx) => (
                    <div
                      key={idx}
                      className="w-14 h-16 bg-white/20 backdrop-blur-sm rounded-2xl flex items-center justify-center border-2 border-white/40 shadow-xl"
                    >
                      <span className="text-3xl font-black text-white drop-shadow-md">{digit}</span>
                    </div>
                  ))}
                </div>

                <div className="w-full bg-white/10 backdrop-blur-md rounded-xl p-3 border border-white/20">
                  <div className="flex items-center justify-center gap-2 text-white text-sm">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)]"></span>
                    <p className="font-medium">Waiting for professional to reach your location</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Professional Arrived Notification - Only after OTP verified */}
          {booking?.status?.toLowerCase() === 'visited' && (
            <div className="relative overflow-hidden rounded-3xl shadow-lg mb-6 active:scale-[0.98] transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-teal-500 via-teal-600 to-emerald-700 opacity-95"></div>
              <div className="relative z-10 p-6 flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
                  <FiCheckCircle className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white tracking-tight">Professional Arrived</h3>
                  <p className="text-sm text-teal-50 font-medium">Expert is at your location and starting the work.</p>
                </div>
              </div>
            </div>
          )}

          {/* Advance Payment Requested Card */}
          {booking.advancePayment?.status === 'requested' && (
            <div className="relative overflow-hidden rounded-3xl shadow-lg border border-amber-200 mb-6 active:scale-[0.99] transition-all">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500 via-orange-500 to-amber-600 opacity-95"></div>
              <div className="relative z-10 p-6 text-white">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                    <FiDollarSign className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white tracking-tight">Advance Payment Requested</h3>
                    <p className="text-xs text-amber-100 font-medium">{booking.advancePayment.reason || 'Requested for spare parts / materials'}</p>
                  </div>
                </div>

                <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/20 mb-4 flex justify-between items-center">
                  <div>
                    <p className="text-xs text-amber-100 font-bold uppercase tracking-wider">Requested Advance</p>
                    <p className="text-2xl font-black text-white">₹{Number(booking.advancePayment.requestedAmount || 0).toLocaleString('en-IN')}</p>
                  </div>
                  {booking.advancePayment.partsDescription && (
                    <p className="text-xs text-amber-50 max-w-[50%] text-right truncate">{booking.advancePayment.partsDescription}</p>
                  )}
                </div>

                <button
                  onClick={() => handleOnlinePayment('advance')}
                  disabled={paying}
                  className="w-full py-3.5 bg-white text-orange-600 rounded-2xl font-black text-sm shadow-xl hover:bg-amber-50 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <FiDollarSign className="w-4 h-4" />
                  Pay Advance ₹{Number(booking.advancePayment.requestedAmount || 0).toLocaleString('en-IN')}
                </button>
              </div>
            </div>
          )}

          {/* Waiting for Worker to initiate Payment */}
          {!booking.customerConfirmationOTP && ['work_done'].includes(booking.status?.toLowerCase()) && !booking.cashCollected && (
            <div className="bg-white rounded-3xl p-6 shadow-lg border border-teal-100 mb-6 flex items-center gap-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-teal-50 rounded-full -translate-y-12 translate-x-12 blur-2xl"></div>
              <div className="w-12 h-12 rounded-2xl bg-teal-50 flex items-center justify-center shrink-0 border border-teal-100">
                <FiLoader className="w-6 h-6 text-teal-600 animate-spin" />
              </div>
              <div className="relative z-10">
                <h3 className="font-bold text-gray-900">Finalizing Bill</h3>
                <p className="text-sm text-gray-500">Professional is finalizing payment details. Please wait a moment...</p>
              </div>
            </div>
          )}

          {/* Plan Covered Card - Show for plan_benefit bookings (before OTP is sent) */}
          {(booking.paymentStatus === 'plan_covered' || (booking.paymentMethod === 'plan_benefit' && booking.paymentStatus !== 'success')) &&
            ['visited', 'in_progress', 'work_done', 'completed'].includes(booking.status?.toLowerCase()) &&
            !booking.customerConfirmationOTP && (
              <div className="relative overflow-hidden rounded-3xl shadow-lg border border-emerald-100 mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 via-teal-600 to-green-700 opacity-95"></div>
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)]"></div>

                <div className="relative z-10 p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                      <FiCheckCircle className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white tracking-tight">
                        {booking.status?.toLowerCase() === 'work_done' ? 'Finalizing Bill' : 'Plan Benefit Active'}
                      </h3>
                      <p className="text-xs font-medium text-emerald-100">
                        {booking.status?.toLowerCase() === 'work_done' ? 'Worker preparing final bill' : 'Base service covered by your plan'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-white/15 backdrop-blur-sm rounded-2xl p-4 border border-white/20">
                    <div className="flex items-center gap-3 mb-2">
                      <FiCheckCircle className="w-5 h-5 text-emerald-200" />
                      <span className="font-bold text-white">Base Service Covered</span>
                    </div>
                    <p className="text-sm text-emerald-100 leading-relaxed">
                      Your base service fee is covered by your membership plan. {booking.status?.toLowerCase() === 'work_done' ? 'The worker is preparing the final bill for any additional charges.' : 'You may only need to pay for extra parts or services.'}
                    </p>
                  </div>

                  {booking.status?.toLowerCase() === 'work_done' && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-white/80">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-xs font-medium">Waiting for worker to finalize...</span>
                    </div>
                  )}
                </div>
              </div>
            )}

          {/* Payment Card - Show when work is done AND bill is finalized (OTP exists) or paid */}
          {(booking.customerConfirmationOTP || booking.paymentOtp || booking.paymentStatus === 'success') && ['work_done'].includes(booking.status?.toLowerCase()) && !booking.cashCollected && (
            <div
              onClick={() => setShowPaymentModal(true)}
              className={`relative overflow-hidden rounded-3xl shadow-lg border cursor-pointer active:scale-[0.98] transition-all ${booking.paymentStatus === 'success' ? 'border-green-100' : 'border-orange-100'
                }`}>
              {/* Animated gradient background */}
              <div className={`absolute inset-0 opacity-95 ${booking.paymentStatus === 'success'
                ? 'bg-gradient-to-br from-green-500 via-green-600 to-emerald-700'
                : 'bg-gradient-to-br from-orange-500 via-orange-600 to-red-600'
                }`}></div>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(255,255,255,0.15)_0%,transparent_50%)]"></div>

              <div className="relative z-10 p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30">
                    {booking.paymentStatus === 'success' ? (
                      <FiCheckCircle className="w-6 h-6 text-white" />
                    ) : (
                      <FiDollarSign className="w-6 h-6 text-white" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white tracking-tight">
                      {booking.paymentStatus === 'success' ? 'Payment Received' : 'Final Payment'}
                    </h3>
                    <p className={`text-xs font-medium ${booking.paymentStatus === 'success' ? 'text-green-50' : 'text-orange-100'}`}>
                      {booking.paymentStatus === 'success' ? 'Transaction verified successfully' : 'Final amount after service completion'}
                    </p>
                  </div>
                </div>

                {/* Action Button for Online Payment - Only show if not paid */}
                {booking.paymentStatus !== 'success' && (
                  <>
                    <button
                      onClick={handleOnlinePayment}
                      className="w-full py-4 mb-4 bg-white text-orange-600 rounded-2xl font-black text-sm shadow-xl hover:bg-orange-50 active:scale-95 transition-all flex items-center justify-center gap-2 group"
                    >
                      <FiDollarSign className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                      Pay Online Now
                      <FiChevronRight className="w-4 h-4" />
                    </button>

                    <div className="flex flex-col items-center mb-6">
                      <p className="text-[10px] font-bold text-orange-100 uppercase tracking-[0.2em] mb-3 opacity-90">Verification Code</p>
                      <div className="flex justify-center gap-2">
                        {String(booking.customerConfirmationOTP || booking.paymentOtp || '0000').split('').map((digit, idx) => (
                          <div
                            key={idx}
                            className="w-12 h-14 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/30 shadow-lg"
                          >
                            <span className="text-2xl font-black text-white">{digit}</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-orange-50 mt-3 font-medium bg-black/10 px-3 py-1 rounded-full backdrop-blur-sm">
                        Share this code with the professional ONLY after your satisfaction
                      </p>
                    </div>
                  </>
                )}

                <div className={`backdrop-blur-sm rounded-xl p-4 border ${booking.paymentStatus === 'success' ? 'bg-white/10 border-white/10' : 'bg-white/15 border-white/20'
                  }`}>
                  <div className="flex items-center gap-3 text-white">
                    {booking.paymentStatus === 'success' ? (
                      <FiCheckCircle className="w-5 h-5 text-green-200" />
                    ) : (
                      <FiClock className="w-5 h-5 text-orange-200" />
                    )}
                    <div className="text-sm">
                      {booking.paymentStatus === 'success'
                        ? (
                          booking.paymentMethod === 'plan_benefit'
                            ? <p className="font-medium">Covered by your Membership Plan</p>
                            : <p className="font-medium">Booking completed successfully. Thank you for choosing us!</p>
                        )
                        : <p className="font-medium">Total Amount: <span className="text-lg font-black ml-1">₹{(booking.finalAmount || booking.totalAmount || 0).toLocaleString('en-IN')}</span></p>
                      }
                      {booking.paymentStatus !== 'success' && <p className="text-[10px] text-orange-100 mt-0.5 opacity-80">Pay online above or prepare cash for the professional.</p>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Location & Time Section */}
          <section className="space-y-4">
            {/* Map Preview - Improved overlay for better usability */}
            {booking.address && (
              <>
                <div className="group relative rounded-3xl overflow-hidden shadow-sm border border-gray-200 bg-gray-100 h-48">
                  {(() => {
                    let mapQuery = '';
                    if (typeof booking.address === 'object' && booking.address.lat && booking.address.lng) {
                      mapQuery = `${booking.address.lat},${booking.address.lng}`;
                    } else {
                      const addrStr = typeof booking.address === 'string'
                        ? booking.address
                        : `${booking.address?.addressLine1 || ''}, ${booking.address?.city || ''}`;
                      mapQuery = encodeURIComponent(addrStr);
                    }
                    return (
                      <iframe
                        className="w-full h-full opacity-80 group-hover:opacity-100 transition-opacity"
                        frameBorder="0"
                        style={{ border: 0, pointerEvents: 'none' }}
                        src={`https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`}
                        allowFullScreen
                        tabIndex="-1"
                        title="Location"
                      />
                    )
                  })()}

                  {/* Floating Info */}
                  <div className="absolute top-4 left-4 right-4 flex justify-between pointer-events-none">
                    <div className="bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-xl shadow-sm border border-white/50 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                      <span className="text-xs font-bold text-gray-700">Destination</span>
                    </div>
                  </div>

                  {/* Track Button Overlay - Only clickable when journey started */}
                  {['journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase()) && (
                    <div className="absolute inset-0 flex items-center justify-center bg-transparent pointer-events-none">
                      <div
                        className="pointer-events-auto bg-white text-gray-900 px-5 py-2.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all border border-gray-100 cursor-pointer"
                        onClick={() => navigate(`/user/booking/${booking._id || booking.id}/track`)}
                      >
                        <FiMapPin className="w-4 h-4 text-red-500" /> View Live Location
                      </div>
                    </div>
                  )}
                </div>

                {/* Dedicated Track Button - Only visible when journey started */}
                {['journey_started', 'visited', 'in_progress'].includes(booking.status?.toLowerCase()) && (
                  <button
                    onClick={() => navigate(`/user/booking/${booking._id || booking.id}/track`)}
                    className="w-full py-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white rounded-2xl font-bold shadow-lg shadow-gray-200 active:scale-95 transition-all flex items-center justify-center gap-3 hover:shadow-xl"
                  >
                    <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                      <FiMapPin className="w-4 h-4 text-white" />
                    </div>
                    Track Service Agent
                  </button>
                )}
              </>
            )}

            <div className="bg-white rounded-3xl p-5 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-teal-50 flex items-center justify-center shrink-0">
                  <FiMapPin className="w-5 h-5 text-teal-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">Service Address</p>
                  <p className="text-sm font-medium text-gray-900 leading-relaxed">{getAddressString(booking.address)}</p>
                </div>
              </div>
              <div className="w-full h-px bg-gray-50 mb-4"></div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center shrink-0">
                  <FiCalendar className="w-5 h-5 text-indigo-600" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-wide mb-1">Slot</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(booking.scheduledDate)}
                  </p>
                  <p className="text-sm text-gray-500">{booking.scheduledTime || booking.timeSlot?.start || 'N/A'}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Service Details */}
          <section className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-50 bg-gray-50/50">
              <h3 className="font-bold text-gray-900">Order Summary</h3>
            </div>

            <div className="p-5 space-y-4">
              {/* 1. Service Category */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0 border border-teal-100 overflow-hidden">
                  {booking.categoryIcon ? (
                    <img src={booking.categoryIcon} alt="" className="w-6 h-6 object-contain" />
                  ) : (
                    <FiPackage className="w-5 h-5 text-teal-400" />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Service Category</p>
                  <p className="text-sm font-bold text-gray-800">{booking.serviceCategory || booking.serviceName || 'Service'}</p>
                </div>
              </div>

              {/* 2. Brand */}
              {(() => {
                const brandName = booking.brandName || booking.bookedItems?.[0]?.brandName;
                const brandIcon = booking.brandIcon || booking.bookedItems?.[0]?.brandIcon;
                if (!brandName) return null;
                return (
                  <div className="flex items-center gap-3 pt-3 border-t border-dashed border-gray-100">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                      {brandIcon ? (
                        <img src={brandIcon} alt={brandName} className="w-7 h-7 object-contain" />
                      ) : (
                        <span className="text-lg font-black text-slate-400">{brandName.charAt(0)}</span>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</p>
                      <p className="text-sm font-bold text-gray-800">{brandName}</p>
                    </div>
                  </div>
                );
              })()}

              {/* 3. Service Cards */}
              {booking.bookedItems && booking.bookedItems.length > 0 && (
                <div className="pt-3 border-t border-dashed border-gray-100 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Services Booked</p>
                  {booking.bookedItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-start bg-gray-50 rounded-xl p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded border border-teal-100">×{item.quantity}</span>
                          <span className="text-sm font-semibold text-gray-900 truncate">{item.card?.title || 'Service'}</span>
                        </div>
                        {item.card?.subtitle && <p className="text-xs text-gray-400 mt-0.5 ml-8 line-clamp-1">{item.card.subtitle}</p>}
                        {item.card?.duration && <p className="text-xs text-gray-400 mt-0.5 ml-8">⏱ {item.card.duration}</p>}
                      </div>
                      <span className="text-sm font-bold text-gray-900 ml-3 shrink-0">₹{((item.card?.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Payment Summary - Only show if payment is completed/collected OR if a payment request is active (Work Done) */}
          {(['work_done', 'completed'].includes(booking.status?.toLowerCase()) || booking.paymentStatus === 'success' || booking.cashCollected) && (
            <section className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 overflow-hidden">
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-gray-100">
                <div className={`p-2 rounded-lg ${booking.paymentMethod === 'plan_benefit' ? 'bg-amber-100' : 'bg-green-50'}`}>
                  {booking.paymentMethod === 'plan_benefit' ? (
                    <FiAward className="w-5 h-5 text-amber-600" />
                  ) : (
                    <FiDollarSign className="w-5 h-5 text-green-600" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-gray-900">
                    {booking.paymentMethod === 'plan_benefit' ? 'Membership Benefit' : 'Payment Summary'}
                  </h3>
                </div>
              </div>

              <div className="space-y-3 text-sm">
                {hasBill ? (
                  // NEW DETAILED BREAKDOWN
                  <div className="space-y-4">
                    {/* Services Section */}
                    <div>
                      <h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                        <FiCheckCircle className="w-3.5 h-3.5" /> Services
                      </h4>
                      <div className="space-y-2 pl-1">
                        {/* Original Base */}
                        <div className="flex justify-between items-center text-gray-600">
                          <span>Original Booking : {originalServiceFromBill?.name || booking.serviceName || 'Service'}</span>
                          {isPlanBenefit ? (
                            <div className="flex items-center gap-2">
                              <span className="line-through text-gray-400 text-xs">₹{originalBase.toLocaleString('en-IN')}</span>
                              <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">FREE</span>
                            </div>
                          ) : (
                            <span className="font-medium text-gray-900">₹{originalBase.toLocaleString('en-IN')}</span>
                          )}
                        </div>

                        {/* Extra Services */}
                        {services.map((s, i) => (
                          <div key={i} className="flex justify-between items-center text-gray-600">
                            <span>{s.name} <span className="text-gray-400 text-xs">x{s.quantity}</span></span>
                            <span className="font-mono text-xs">₹{((parseFloat(s.price) || 0) * (parseFloat(s.quantity) || 1)).toFixed(2)}</span>
                          </div>
                        ))}

                        {/* Service GST */}
                        <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                          <span>GST (18%)</span>
                          <span className="font-mono">₹{(originalGST + extraServiceGST).toFixed(2)}</span>
                        </div>

                        {/* Service Subtotal */}
                        <div className="flex justify-between font-bold text-gray-800 pt-1">
                          <span>Total Service</span>
                          <span>₹{(originalBase + extraServiceBase + originalGST + extraServiceGST).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Parts Section */}
                    {(parts.length > 0 || customItems.length > 0) && (
                      <div>
                        <h4 className="flex items-center gap-2 text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 mt-4">
                          <FiPackage className="w-3.5 h-3.5 text-orange-500" /> Parts & Material
                        </h4>
                        <div className="space-y-2 pl-1">
                          {parts.map((p, i) => (
                            <div key={`p-${i}`} className="flex justify-between items-center text-gray-600">
                              <span>{p.name} <span className="text-gray-400 text-xs">x{p.quantity}</span></span>
                              <span className="font-mono text-xs">₹{(p.price * p.quantity).toFixed(2)}</span>
                            </div>
                          ))}
                          {customItems.map((c, i) => (
                            <div key={`c-${i}`} className="flex justify-between items-center text-gray-600">
                              <div>
                                <span>{c.name} <span className="text-gray-400 text-xs">x{c.quantity}</span></span>
                                {c.hsnCode && <span className="block text-[9px] text-gray-400">HSN: {c.hsnCode}</span>}
                              </div>
                              <span className="font-mono text-xs">₹{(c.price * c.quantity).toFixed(2)}</span>
                            </div>
                          ))}

                          {/* Parts GST */}
                          <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                            <span>GST (18%)</span>
                            <span className="font-mono">₹{partsGST.toFixed(2)}</span>
                          </div>

                          {/* Parts Subtotal */}
                          <div className="flex justify-between font-bold text-gray-800 pt-1">
                            <span>Total Parts</span>
                            <span>₹{(partsBase + partsGST).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Visiting Charges */}
                    {(booking.visitingCharges > 0 || bill?.visitingCharges > 0) && (
                      <div className="mt-4 pt-2 border-t border-gray-100">
                        <div className="flex justify-between text-xs font-bold text-gray-600">
                          <span className="flex items-center gap-2 uppercase tracking-wide">
                            <FiClock className="w-3.5 h-3.5 text-blue-400" /> Visiting Charges
                          </span>
                          <span className="font-mono">₹{(bill?.visitingCharges || booking.visitingCharges || 0).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {/* Transport Charges */}
                    {bill?.transportCharges > 0 && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="flex justify-between text-xs font-bold text-gray-600">
                          <span className="flex items-center gap-2 uppercase tracking-wide">
                            <FiPackage className="w-3.5 h-3.5 text-blue-400" /> Transport Charges
                          </span>
                          <span className="font-mono">₹{(bill.transportCharges).toFixed(2)}</span>
                        </div>
                      </div>
                    )}

                    {(booking.paymentMethod || booking.paymentStatus === 'success') && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <div className="flex justify-between text-xs font-bold text-gray-600">
                          <span className="flex items-center gap-2 uppercase tracking-wide">
                            {booking.paymentMethod === 'cash collected' ? <FiDollarSign className="text-emerald-500" /> : <MdQrCode className="text-blue-500" />}
                            Payment Method
                          </span>
                          <span className={`${booking.paymentMethod === 'cash collected' ? 'text-emerald-600' : 'text-blue-600'} uppercase`}>
                            {booking.paymentMethod === 'cash collected' ? 'Cash Collected' : 
                             booking.paymentMethod === 'Qr online' ? 'QR Online' : 
                             booking.paymentMethod === 'online' ? 'Online Paid' : 
                             booking.paymentMethod === 'plan_benefit' ? 'Plan Benefit' : 
                             booking.paymentMethod || 'Online'}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 mt-2 border-t-2 border-gray-100 flex justify-between items-center">
                      <span className="font-bold text-gray-900 text-lg">Grand Total</span>
                      <span className="font-black text-teal-700 text-2xl">
                        ₹{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ) : (
                  // OLD SIMPLE BREAKDOWN (Fallback)
                  <>
                    {/* Base Items */}
                    <div className="flex justify-between items-center text-gray-600">
                      <span>Base Price</span>
                      {booking.paymentMethod === 'plan_benefit' ? (
                        <div className="flex items-center gap-2">
                          <span className="line-through text-gray-400 text-xs">₹{(booking.basePrice || 0).toLocaleString('en-IN')}</span>
                          <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE ✓</span>
                        </div>
                      ) : (
                        <span className="font-medium text-gray-900">₹{(booking.basePrice || 0).toLocaleString('en-IN')}</span>
                      )}
                    </div>

                    {(booking.tax > 0 || booking.paymentMethod === 'plan_benefit') && (
                      <div className="flex justify-between items-center text-gray-600">
                        <span>GST (18%)</span>
                        {booking.paymentMethod === 'plan_benefit' ? (
                          <div className="flex items-center gap-2">
                            <span className="line-through text-gray-400 text-xs">₹{(booking.tax || 0).toLocaleString('en-IN')}</span>
                            <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE ✓</span>
                          </div>
                        ) : (
                          <span className="font-medium text-gray-900">₹{(booking.tax || 0).toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    )}

                    {(booking.visitingCharges > 0 || booking.visitationFee > 0 || booking.paymentMethod === 'plan_benefit') && (
                      <div className="flex justify-between items-center text-gray-600">
                        <span>Convenience Fee</span>
                        {booking.paymentMethod === 'plan_benefit' ? (
                          <div className="flex items-center gap-2">
                            <span className="line-through text-gray-400 text-xs">₹{(booking.visitingCharges || booking.visitationFee || 0).toLocaleString('en-IN')}</span>
                            <span className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">FREE ✓</span>
                          </div>
                        ) : (
                          <span className="font-medium text-gray-900">₹{(booking.visitingCharges || booking.visitationFee || 0).toLocaleString('en-IN')}</span>
                        )}
                      </div>
                    )}

                    {booking.paymentMethod !== 'plan_benefit' && booking.discount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-green-600">Discount</span>
                        <span className="font-medium text-green-600">-₹{booking.discount.toLocaleString('en-IN')}</span>
                      </div>
                    )}

                    {/* Extra Charges Section */}
                    {booking.extraCharges && booking.extraCharges.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-dashed border-gray-200">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Extra Charges</p>
                        <div className="bg-gray-50 rounded-lg p-3 space-y-2 border border-gray-100">
                          {booking.extraCharges.map((item, idx) => (
                            <div key={idx} className="flex justify-between text-gray-700 text-sm">
                              <span className="flex items-center gap-2">
                                <span className="text-xs font-bold bg-white border px-1.5 rounded text-gray-500">x{item.quantity || 1}</span>
                                <span>{item.name}</span>
                              </span>
                              <span className="font-medium">+₹{(item.total || item.price || 0).toLocaleString('en-IN')}</span>
                            </div>
                          ))}
                          <div className="flex justify-between font-bold text-blue-600 pt-2 mt-2 border-t border-gray-200">
                            <span>Total Extras</span>
                            <span>+₹{(booking.extraChargesTotal || 0).toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="pt-4 mt-2 border-t border-gray-100 flex justify-between items-center">
                      <span className="font-bold text-gray-900 text-lg">Total Payable</span>
                      <span className="font-black text-gray-900 text-xl">
                        ₹{(booking.paymentMethod === 'plan_benefit'
                          ? (booking.userPayableAmount || booking.extraChargesTotal || 0)
                          : (booking.finalAmount || booking.totalAmount || 0)
                        ).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Payment Status Footer */}
            <div className="bg-gray-50 px-5 py-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Payment Status</span>
              <span className={`px-2.5 py-1 rounded-md text-xs font-bold capitalize ${['success', 'collected_by_vendor', 'paid'].includes(booking.paymentStatus?.toLowerCase()) ? 'bg-green-100 text-green-700' :
                booking.paymentStatus === 'pending' || booking.paymentStatus === 'plan_covered' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'
                }`}>
                {['success', 'collected_by_vendor', 'paid', 'paid_online'].includes(booking.paymentStatus?.toLowerCase()) ? 'Paid' :
                  booking.paymentStatus === 'plan_covered' ? 'Processing Bill' :
                    booking.paymentStatus?.replace(/_/g, ' ') || 'Pending'}
              </span>
            </div>
            </section>
          )}

          {/* Action Card for Awaiting Payment */}
          {booking.status === 'awaiting_payment' && (
            <div className="bg-white rounded-3xl shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100 p-6 space-y-4">
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <FiDollarSign className="w-8 h-8 text-orange-600" />
                </div>
                <h3 className="text-lg font-bold text-black">Payment Required</h3>
                <p className="text-sm text-gray-500">The professional has completed the work. Please choose a payment method to verify and close your booking.</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleOnlinePayment}
                  className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-transform"
                  style={{ background: themeColors.button }}
                >
                  <FiDollarSign className="w-5 h-5" />
                  Pay Online (Razorpay/UPI)
                </button>

                <button
                  onClick={handlePayAtHome}
                  className="w-full py-4 rounded-xl font-bold text-gray-700 bg-gray-100 flex items-center justify-center gap-2 active:scale-95 transition-transform"
                >
                  <FiHome className="w-5 h-5" />
                  Pay at Home (After Service)
                </button>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-4">
            {/* Support */}
            {/* Support */}
            <button
              onClick={() => {
                const phone = supportInfo.phone || '+919999999999';
                if (phone) {
                  // Use native anchor click for better WebView compatibility
                  const link = document.createElement('a');
                  link.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                } else {
                  toast.error('Support phone number not available');
                }
              }}
              className="col-span-1 flex flex-col items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors active:scale-95"
            >
              <FiPhone className="w-6 h-6 text-gray-700" />
              <span className="text-sm font-bold text-gray-700">Call Support</span>
            </button>
            <button
              onClick={() => {
                const email = supportInfo.email || 'help@homestr.in';
                const link = document.createElement('a');
                link.href = `mailto:${email}`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="col-span-1 flex flex-col items-center justify-center gap-2 p-4 bg-white border border-gray-200 rounded-2xl hover:bg-gray-50 transition-colors active:scale-95"
            >
              <FiMail className="w-6 h-6 text-gray-700" />
              <span className="text-sm font-bold text-gray-700">Email Help</span>
            </button>

            {/* Cancel */}
            {!['cancelled', 'completed', 'work_done'].includes(booking.status?.toLowerCase()) && (
              <button
                onClick={handleCancelBooking}
                className="col-span-2 py-4 rounded-2xl text-red-600 font-bold text-sm bg-red-50 border border-red-100 hover:bg-red-100 transition-colors active:scale-95"
              >
                Cancel Booking
              </button>
            )}
          </div>

          {/* Rate & Review (Conditional) */}
          {/* Rate & Review (Conditional) */}
          <ReviewCard
            booking={booking}
            onWriteReview={() => setShowRatingModal(true)}
          />

        </main>

        {/* Rating Modal */}
        <RatingModal
          isOpen={showRatingModal}
          onClose={() => {
            setShowRatingModal(false);
            localStorage.setItem(`rating_dismissed_${id}`, 'true');
          }}
          onSubmit={handleRateSubmit}
          bookingName={booking.serviceName || booking.serviceCategory || 'Service'}
          providerName={booking.vendorId?.name || booking.assignedTo?.name || 'Service Provider'}
        />

        {/* Payment Verification Modal */}
        <PaymentVerificationModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          booking={booking}
          onPayOnline={handleOnlinePayment}
        />

        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type}
        />
      </div>
    </div>
  );
};

export default BookingDetails;

