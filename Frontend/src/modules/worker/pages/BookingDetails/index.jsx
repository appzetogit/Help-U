import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { FiMapPin, FiClock, FiDollarSign, FiUser, FiPhone, FiNavigation, FiArrowRight, FiEdit, FiCheckCircle, FiCreditCard, FiX, FiCheck, FiTool, FiXCircle, FiAward, FiPackage, FiAlertCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import {
  getBookingById,
  updateBookingStatus,
  startSelfJob,
  workerReached,
  verifySelfVisit,
  completeSelfJob,
  requestAdvancePayment as requestAdvancePaymentApi
} from '../../services/bookingService';
import workerBillService from '../../../../services/workerBillService';
import { CashCollectionModal, ConfirmDialog, OtpVerificationModal } from '../../components/common';
import VisitVerificationModal from '../../components/common/VisitVerificationModal';
import { WorkCompletionModal } from '../../components/common';
// import BillingModal from '../../components/bookings/BillingModal'; // Consumed by page now
import workerWalletService from '../../../../services/workerWalletService';
import { toast } from 'react-hot-toast';
import { useAppNotifications } from '../../../../hooks/useAppNotifications';
import { useLocationTracking } from '../../../../hooks/useLocationTracking';

export default function BookingDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(false);
  const [paySubmitting, setPaySubmitting] = useState(false);
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  const [isWorkDoneModalOpen, setIsWorkDoneModalOpen] = useState(false);
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({
    amount: '',
    reason: '',
    partsDescription: ''
  });


  const [actionLoading, setActionLoading] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    type: 'warning'
  });

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  const loadBooking = async () => {
    try {
      setLoading(true);
      let billData = null;

      const [bookingRes, billRes] = await Promise.all([
        getBookingById(id),
        workerBillService.getBill(id).catch(() => ({ success: false }))
      ]);

      const apiData = bookingRes.data || bookingRes;
      if (billRes && billRes.success) {
        billData = billRes.bill;
      }

      // Map API response to Component State structure
      const mappedBooking = {
        ...apiData,
        bill: billData || apiData.bill, // Prioritize fetched bill
        id: apiData._id || apiData.id,
        user: apiData.userId || apiData.user || { name: apiData.customerName || 'Customer', phone: apiData.customerPhone || 'Hidden' },
        customerName: apiData.userId?.name || apiData.customerName || 'Customer',
        customerPhone: apiData.userId?.phone || apiData.customerPhone || 'Hidden',
        serviceType: apiData.serviceId?.title || apiData.serviceName || apiData.serviceType || 'Service',
        items: apiData.bookedItems || [],
        location: {
          address: (() => {
            const a = apiData.address;
            if (!a) return 'Address not available';
            if (typeof a === 'string') return a;
            return `${a.addressLine2 ? a.addressLine2 + ', ' : ''}${a.addressLine1 || ''}, ${a.city || ''}`;
          })(),
          lat: apiData.address?.lat || 0,
          lng: apiData.address?.lng || 0,
          distance: apiData.distance ? `${apiData.distance.toFixed(1)} km` : 'N/A'
        },
        // Price Breakdown
        basePrice: parseFloat(apiData.basePrice || 0),
        tax: parseFloat(apiData.tax || (apiData.paymentMethod === 'plan_benefit' ? (apiData.basePrice || 0) * 0.18 : 0)),
        visitingCharges: parseFloat(apiData.visitingCharges || apiData.visitationFee || (apiData.paymentMethod === 'plan_benefit' ? 49 : 0)),
        discount: parseFloat(apiData.discount || 0),
        platformCommission: parseFloat(apiData.adminCommission || apiData.platformFee || apiData.commission || 0),
        finalAmount: parseFloat(apiData.finalAmount || 0),
        vendorEarnings: parseFloat(
          billData?.vendorTotalEarning ||
          apiData.vendorEarnings ||
          (apiData.paymentMethod === 'plan_benefit'
            ? (Number(apiData.basePrice || 0) * 0.7) // Fallback: 70% share from base
            : (apiData.finalAmount ? apiData.finalAmount - (apiData.commission || 0) : 0)
          )
        ),

        // Display Price (Worker Earnings by default as requested)
        price: (apiData.vendorEarnings || (apiData.finalAmount ? apiData.finalAmount - (apiData.commission || 0) : 0)).toFixed(2),

        timeSlot: {
          date: apiData.scheduledDate ? new Date(apiData.scheduledDate).toLocaleDateString() : 'Today',
          time: apiData.scheduledTime || apiData.timeSlot?.start ? `${apiData.timeSlot.start} - ${apiData.timeSlot.end}` : 'Flexible'
        },
        status: apiData.status,
        description: apiData.description || apiData.notes || 'No description provided',
        assignedTo: apiData.assignedAt ? { name: 'You (Self)' } : null,
        paymentMethod: apiData.paymentMethod,
        paymentStatus: apiData.paymentStatus,
        advancePayment: apiData.advancePayment || { status: 'none', requestedAmount: 0, paidAmount: 0 },
        userPayableAmount: parseFloat(apiData.userPayableAmount || apiData.finalAmount || 0),
        cashCollected: apiData.cashCollected || false,
        finalSettlementStatus: apiData.finalSettlementStatus
      };

      setBooking(mappedBooking);
    } catch (error) {
      // Error loading booking
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBooking();
    window.addEventListener('workerJobsUpdated', loadBooking);

    return () => {
      window.removeEventListener('workerJobsUpdated', loadBooking);
    };
  }, [id]);


  // ADDED: Socket for Live Location Tracking in Details Page
  const socket = useAppNotifications('worker'); // Get socket

  // Optimized Live Location Tracking with distance filter and heading
  const isTrackingActive = booking?.status === 'journey_started' || booking?.status === 'visited';
  useLocationTracking(socket, id, isTrackingActive, {
    distanceFilter: 10, // Only emit when moved 10+ meters
    interval: 3000,     // Minimum 3s between emissions
    enableHighAccuracy: true
  });

  // Listen for Real-Time Booking Updates (e.g. Online Payment)
  useEffect(() => {
    if (socket && id) {
      const handleBookingUpdate = (data) => {
        // Check if update is for this booking
        if (data.bookingId === id || data.relatedId === id || data._id === id) {

          // Update local state to trigger effects immediately
          setBooking(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              ...data, // Merge updates
              status: data.status || prev.status,
              paymentStatus: data.paymentStatus || prev.paymentStatus
            };
          });

          // Also trigger a full reload to be safe/sync
          window.dispatchEvent(new Event('workerJobsUpdated'));

          // Check if this update is a payment success, if so, trigger reload for fresh state
          const isPaymentSuccess =
            data.paymentStatus === 'SUCCESS' ||
            data.paymentStatus === 'paid' ||
            data.type === 'payment_success';

          if (isPaymentSuccess) {
            toast.success('Online Payment Received!');
            setTimeout(() => window.location.reload(), 1500);
          }
        }
      };

      socket.on('booking_updated', handleBookingUpdate);
      socket.on('payment_success', handleBookingUpdate);

      return () => {
        socket.off('booking_updated', handleBookingUpdate);
        socket.off('payment_success', handleBookingUpdate);
      };
    }
  }, [socket, id]);

  const handleVerifyVisit = async () => {
    const otp = otpInput.join('');
    if (otp.length !== 4) return toast.error('Enter 4-digit OTP');

    setActionLoading(true);

    if (!navigator.geolocation) {
      toast.error('Geolocation required for verification');
      setActionLoading(false);
      return;
    }

    // Robust Geolocation Helper - PERMISSIVE MODE
    const getPosition = () => {
      return new Promise((resolve, reject) => {
        // FASTEST STRATEGY: Prefer Wi-Fi/Cell (Low Accuracy) + Cached Positions
        // Detailed GPS is often blocked indoors where workers verify arrival
        const options = {
          enableHighAccuracy: false, // Critical fix: Disable GPS requirement
          timeout: 30000,            // 30s timeout
          maximumAge: Infinity       // Accept any valid cached position
        };

        navigator.geolocation.getCurrentPosition(
          resolve,
          (error) => {
            console.warn("Standard geo failed, trying high accuracy as last resort...", error);
            // Emergency fallback: Try GPS if Wi-Fi location fails (rare)
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
            );
          },
          options
        );
      });
    };

    try {
      const position = await getPosition();
      const location = { lat: position.coords.latitude, lng: position.coords.longitude };
      await verifySelfVisit(id, otp, location);
      toast.success('Visit Verified');
      setIsVisitModalOpen(false);
      window.location.reload();
    } catch (error) {
      console.error("Geo Error:", error);
      if (error.code === 1) toast.error('Location permission denied');
      else if (error.code === 2) toast.error('Location unavailable. Check GPS.');
      else if (error.code === 3) toast.error('Location timeout. Move to better signal area.');
      else toast.error('Failed to get location');
    } finally {
      setActionLoading(false);
    }
  };
  const getAvailableStatuses = (currentStatus, booking) => {
    // Check payment status
    const finalSettlementDone = booking?.finalSettlementStatus === 'DONE';
    const isSelfJob = booking?.assignedTo?.name === 'You (Self)';

    const statusFlow = {
      'confirmed': ['assigned', 'visited', 'journey_started'],
      'assigned': ['visited', 'journey_started'],
      'journey_started': ['visited'],
      'visited': ['in_progress', 'work_done'],
      'in_progress': ['work_done'],
      'work_done': ['completed', 'final_settlement'],
      'final_settlement': ['completed'],
      'completed': [],
    };
    return statusFlow[currentStatus] || [];
  };

  const canDoFinalSettlement = (booking) => {
    // Check if payment is already done (Online SUCCESS or Cash COLLECTED)
    // Robust check for various status strings (case-insensitive)
    const pStatus = booking?.paymentStatus?.toLowerCase() || '';
    const isPaid = pStatus === 'success' || pStatus === 'paid' || booking?.cashCollected;

    const status = booking?.status?.toLowerCase() || '';
    const isWorkDone = status === 'work_done' || status === 'completed';

    return isWorkDone && isPaid && booking?.finalSettlementStatus !== 'DONE';
  };

  const handleStatusChange = async (newStatus) => {
    if (!booking) return;

    const availableStatuses = getAvailableStatuses(booking.status, booking);
    if (!availableStatuses.includes(newStatus)) {
      toast.error(`Cannot change status from ${booking.status} to ${newStatus}. Please follow the proper flow.`);
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Update Status',
      message: `Are you sure you want to change status to ${newStatus.replace('_', ' ')}?`,
      type: 'info',
      onConfirm: async () => {
        setLoading(true);
        try {
          await updateBookingStatus(id, newStatus);
          window.dispatchEvent(new Event('workerJobsUpdated'));
          toast.success(`Status updated to ${newStatus.replace('_', ' ')} successfully!`);
          loadBooking();
        } catch (error) {
          console.error('Error updating status:', error);
          toast.error('Failed to update status. Please try again.');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleRequestAdvancePayment = async () => {
    const amount = Number(advanceForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid advance amount');
      return;
    }

    try {
      setActionLoading(true);
      const response = await requestAdvancePaymentApi(id, {
        amount,
        reason: advanceForm.reason,
        partsDescription: advanceForm.partsDescription
      });

      if (response.success) {
        toast.success(response.message || 'Advance payment request sent');
        setAdvanceForm({ amount: '', reason: '', partsDescription: '' });
        await loadBooking();
      } else {
        toast.error(response.message || 'Failed to send advance request');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send advance request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFinalSettlement = async () => {
    if (!booking) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Final Settlement',
      message: 'Mark final settlement as done? This will allow you to complete the booking.',
      type: 'warning',
      onConfirm: async () => {
        setLoading(true);
        try {
          await updateBookingStatus(id, booking.status, {
            finalSettlementStatus: 'DONE'
          });
          window.dispatchEvent(new Event('workerJobsUpdated'));
          toast.success('Final settlement marked as done!');
          loadBooking();
        } catch (error) {
          console.error('Error updating settlement:', error);
          toast.error('Failed to update settlement. Please try again.');
        } finally {
          setLoading(false);
        }
      }
    });
  };



  // Handle cash collection button click
  const handleCollectCashClick = () => {
    // If OTP already sent, open modal. Otherwise navigate to full billing page.
    if (booking?.customerConfirmationOTP || booking?.paymentOtp) {
      setIsCashModalOpen(true);
    } else {
      // Navigate to the full page billing flow
      navigate(`/worker/booking/${booking.id || id}/billing`);
    }
  };

  const handleCashCollectionConfirm = async (amount, extras, code) => {
    try {
      const res = await workerWalletService.confirmCashCollection(id, amount, code, extras);
      if (res.success) {
        toast.success('Payment verified successfully!');
        window.location.reload();
      }
      return res;
    } catch (error) {
      console.error('Verify OTP error:', error);
      toast.error('Verification failed');
      throw error;
    }
  };

  const canCollectCash = (booking) => {
    // Hide if already collected or paid online
    if (booking?.cashCollected || booking?.paymentStatus === 'collected_by_vendor') {
      return false;
    }

    // Cash can be collected when booking is completed/work_done and payment was cash/at home
    const isSelfJob = booking?.assignedTo?.name === 'You (Self)';
    const validStatus = isSelfJob
      ? (booking?.status === 'work_done' || booking?.status === 'completed')
      : booking?.status === 'completed';

    if (!validStatus) return false;

    // CRITICAL FIX: Allow bill preparation for Plan Benefit bookings
    // Even if base is pre-paid (SUCCESS), worker must generate final bill (for extras etc.)
    if (booking?.paymentMethod === 'plan_benefit') {
      return true;
    }

    if (booking?.paymentStatus === 'SUCCESS' || booking?.paymentStatus === 'paid') {
      return false;
    }

    // IMPORTANT: Only for Cash/Pay at Home methods OR Online if not paid yet.
    return (
      booking?.paymentMethod === 'cash' ||
      booking?.paymentMethod === 'pay_at_home' ||
      booking?.paymentMethod === 'online'
    );
  };



  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  const handleCallUser = () => {
    const phone = booking.user?.phone || booking.customerPhone;
    if (phone) {
      window.location.href = `tel:${phone}`;
    } else {
      alert('Phone number not available');
    }
  };

  const handleViewTimeline = () => {
    navigate(`/worker/booking/${booking.id}/timeline`);
  };

  const handleStartJourney = async () => {
    try {
      setLoading(true);
      if (booking.status !== 'journey_started') {
        await startSelfJob(id);
        toast.success('Journey Started! OTP sent to customer.');
      }
      navigate(`/worker/booking/${booking.id || id}/map`);
    } catch (error) {
      console.error('Error starting journey:', error);
      // Navigate to map even if already started
      navigate(`/worker/booking/${booking.id || id}/map`);
    } finally {
      setLoading(false);
    }
  };





  const handleCompleteWork = async (photos) => {
    try {
      setActionLoading(true);
      await completeSelfJob(id, { workPhotos: photos || [] });
      toast.success('Work marked done');
      setIsWorkDoneModalOpen(false);
      window.location.reload();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to complete job');
    } finally {
      setActionLoading(false);
    }
  };

  // --- Payment Breakdown Calculations ---
  // Default values from booking (fallback)
  const isPlanBenefit = booking?.paymentMethod === 'plan_benefit';
  const bill = booking?.bill;

  // Base Logic (Services)
  const originalBase = bill ? (bill.originalServiceBase || 0) : (parseFloat(booking?.basePrice) || 0);

  // Extra Services & Parts from worker bill (if available)
  const allBillServices = bill?.services || [];
  const services = allBillServices.filter(s => !s.isOriginal);
  const originalServiceFromBill = allBillServices.find(s => s.isOriginal);
  const parts = bill?.parts || [];
  const customItems = bill?.customItems || [];

  let extraServiceBase = 0;
  let extraServiceGST = 0;
  services.forEach(s => {
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

  // Tax Logic
  const originalGST = bill ? (bill.originalGST || 0) : (originalBase * 0.18);
  const totalGST = originalGST + extraServiceGST + partsGST;

  // Final Total from bill or booking
  const finalTotal = bill?.grandTotal || (booking?.finalAmount || 0);
  const hasBill = !!bill;

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Booking Details" />

      <main className="px-4 py-6">
        {/* Service Type Card */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Service Type</p>
              <p className="text-xl font-bold" style={{ color: themeColors.button }}>
                {booking.serviceType}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div
                className="px-3 py-1 rounded-full text-sm font-semibold"
                style={{
                  background: `${themeColors.button}15`,
                  color: themeColors.button,
                }}
              >
                {booking.status}
              </div>
              {booking.assignedTo?.name === 'You (Self)' && (
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-md border border-green-100 uppercase tracking-wider">
                  Personal Job
                </span>
              )}
            </div>
          </div>
        </div>

        {/* User Info Card */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${themeColors.icon}15` }}
              >
                <FiUser className="w-6 h-6" style={{ color: themeColors.icon }} />
              </div>
              <div>
                <p className="font-semibold text-gray-800">{booking.user?.name || booking.customerName || 'Customer'}</p>
                <p className="text-sm text-gray-600">{booking.user?.phone || booking.customerPhone || 'Phone hidden'}</p>
              </div>
            </div>
            <button
              onClick={handleCallUser}
              className="p-2 rounded-full hover:bg-gray-100 transition-colors"
              style={{ backgroundColor: `${themeColors.button}15` }}
            >
              <FiPhone className="w-5 h-5" style={{ color: themeColors.button }} />
            </button>
          </div>
        </div>

        {/* Address Card with Map */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-start gap-3 mb-3">
            <FiMapPin className="w-5 h-5 mt-0.5" style={{ color: themeColors.icon }} />
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-1">Address</p>
              <p className="font-semibold text-gray-800">{booking.location.address}</p>
              <p className="text-sm text-gray-500 mt-1">{booking.location.distance} away</p>
            </div>
          </div>

          {/* Map Embed */}
          <div className="w-full h-48 rounded-lg overflow-hidden mb-3 bg-gray-200 relative group cursor-pointer" onClick={() => navigate(`/worker/booking/${booking.id}/map`)}>
            {(() => {
              const hasCoordinates = booking.location.lat && booking.location.lng && booking.location.lat !== 0 && booking.location.lng !== 0;
              const mapQuery = hasCoordinates
                ? `${booking.location.lat},${booking.location.lng}`
                : encodeURIComponent(booking.location.address);

              return (
                <>
                  <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0, pointerEvents: 'none' }}
                    src={`https://maps.google.com/maps?q=${mapQuery}&z=15&output=embed`}
                    allowFullScreen
                    tabIndex="-1"
                  ></iframe>
                  {/* Overlay to intercept clicks */}
                  <div className="absolute inset-0 bg-transparent group-hover:bg-black/5 transition-colors flex items-center justify-center">
                    <span className="bg-white/90 px-3 py-1 rounded-full text-xs font-medium text-gray-700 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      View Full Map
                    </span>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={() => navigate(`/worker/booking/${booking.id || id}/map`)}
              className="flex-1 py-3.5 rounded-xl font-bold border-2 flex items-center justify-center gap-2 transition-all active:scale-95 bg-white"
              style={{
                borderColor: themeColors.button,
                color: themeColors.button,
              }}
            >
              <FiMapPin className="w-5 h-5" />
              View Map
            </button>
            <button
              onClick={() => {
                const hasCoords = booking.location.lat && booking.location.lng;
                const dest = hasCoords
                  ? `${booking.location.lat},${booking.location.lng}`
                  : encodeURIComponent(booking.location.address);
                // Open directly to trigger app intent
                window.location.href = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
              }}
              className="flex-1 py-3.5 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-200"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
              }}
            >
              <FiNavigation className="w-5 h-5" />
              Get Directions
            </button>
          </div>
        </div>

        {/* Service Description */}
        {/* Service Description */}
        {(() => {
          const genericDesc = 'No description provided';
          const mainDesc = booking.description === genericDesc ? null : booking.description;
          const serviceDesc = booking.serviceId?.description;
          const itemDesc = booking.items?.[0]?.card?.description;

          const displayDesc = mainDesc || serviceDesc || itemDesc;

          if (!displayDesc) return null;

          return (
            <div
              className="bg-white rounded-xl p-4 mb-4 shadow-md"
              style={{
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}
            >
              <p className="text-sm text-gray-600 mb-2">Service Description</p>
              <p className="text-gray-800">{displayDesc}</p>
            </div>
          );
        })()}

        {/* Booked Items Details */}
        {booking.items && booking.items.length > 0 && (
          <div
            className="bg-white rounded-xl p-4 mb-4 shadow-md"
            style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)' }}
          >
            <p className="text-sm font-bold text-gray-700 mb-4">Order Summary</p>

            {/* Service Category */}
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                style={{ backgroundColor: `${themeColors.button}15`, border: `1px solid ${themeColors.button}25` }}>
                {booking.categoryIcon ? (
                  <img src={booking.categoryIcon} alt="" className="w-5 h-5 object-contain" />
                ) : (
                  <FiTool className="w-4 h-4" style={{ color: themeColors.button }} />
                )}
              </div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Service Category</p>
                <p className="text-sm font-bold text-gray-800">{booking.serviceCategory || booking.serviceType || 'Service'}</p>
              </div>
            </div>

            {/* Brand */}
            {(() => {
              const brandName = booking.brandName || booking.items?.[0]?.brandName;
              const brandIcon = booking.brandIcon || booking.items?.[0]?.brandIcon;
              if (!brandName) return null;
              return (
                <div className="flex items-center gap-3 mb-3 pt-3 border-t border-dashed border-gray-100">
                  <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100 overflow-hidden">
                    {brandIcon ? (
                      <img src={brandIcon} alt={brandName} className="w-6 h-6 object-contain" />
                    ) : (
                      <span className="text-base font-black text-slate-400">{brandName.charAt(0)}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Brand</p>
                    <p className="text-sm font-bold text-gray-800">{brandName}</p>
                  </div>
                </div>
              );
            })()}

            {/* Service Cards */}
            <div className="pt-3 border-t border-dashed border-gray-100 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Services</p>
              {booking.items.map((item, index) => (
                <div key={index} className="flex justify-between items-start bg-gray-50 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-1.5 py-0.5 rounded border"
                        style={{ color: themeColors.button, backgroundColor: `${themeColors.button}10`, borderColor: `${themeColors.button}25` }}>
                        ×{item.quantity}
                      </span>
                      <span className="text-sm font-semibold text-gray-900 truncate">{item.card?.title || 'Service Item'}</span>
                    </div>
                    {item.card?.subtitle && <p className="text-xs text-gray-400 mt-0.5 ml-8 line-clamp-1">{item.card.subtitle}</p>}
                    {item.card?.duration && <p className="text-xs text-gray-400 mt-0.5 ml-8">⏱ {item.card.duration}</p>}
                  </div>
                  <div className="text-right ml-3 shrink-0">
                    <p className="text-sm font-bold text-gray-900">₹{((item.card?.price || 0) * (item.quantity || 1)).toLocaleString()}</p>
                    {item.quantity > 1 && <p className="text-xs text-gray-400">₹{item.card?.price || 0} each</p>}
                  </div>
                </div>
              ))}
              <div className="flex justify-between items-center pt-2 border-t border-gray-100 mt-1">
                <p className="text-sm font-semibold text-gray-700">Total Base Price</p>
                <p className="text-base font-bold" style={{ color: themeColors.button }}>₹{(booking.basePrice || 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Time Slot */}
        <div
          className="bg-white rounded-xl p-4 mb-4 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center gap-3">
            <FiClock className="w-5 h-5" style={{ color: themeColors.icon }} />
            <div>
              <p className="text-sm text-gray-600">Preferred Time</p>
              <p className="font-semibold text-gray-800">{booking.timeSlot.date}</p>
              <p className="text-sm text-gray-600">{booking.timeSlot.time}</p>
            </div>
          </div>
        </div>

        {/* Payment Invoice Card - Dark Header Style (Exact Match with Billing) */}
        <div className="bg-white rounded-3xl overflow-hidden shadow-xl border border-gray-100 mb-6">
          <div className="bg-gray-900 px-6 py-6 text-white text-center">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-widest mb-1">TOTAL INVOICE AMOUNT</p>
            <h2 className="text-4xl font-black">₹{finalTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</h2>
            {isPlanBenefit && (
              <span className="inline-block mt-2 bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase">
                Plan Benefit Applied
              </span>
            )}
          </div>

          <div className="p-6 space-y-6 text-sm">
            {/* Services Section */}
            <div>
              <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs"><FiTool /></span>
                Services
              </h4>
              <div className="space-y-2 pl-2">
                <div className="flex justify-between text-gray-600">
                  <span>Original Booking : {booking.serviceType || 'Service'}</span>
                  {isPlanBenefit ? (
                    <div className="flex items-center gap-2">
                      <span className="line-through text-gray-400 text-xs">₹{originalBase.toFixed(2)}</span>
                      <span className="text-emerald-600 font-bold text-[10px] bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">FREE</span>
                    </div>
                  ) : (
                    <span className="font-medium text-gray-900">₹{originalBase.toFixed(2)}</span>
                  )}
                </div>

                {services.map((s, i) => (
                  <div key={i} className="flex justify-between text-gray-600">
                    <span>{s.name} x {s.quantity}</span>
                    <span className="font-mono">₹{((parseFloat(s.price) || 0) * (parseFloat(s.quantity) || 1)).toFixed(2)}</span>
                  </div>
                ))}

                {/* Service GST */}
                <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                  <span>Service GST (18%)</span>
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
                <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                  <span className="w-6 h-6 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center text-xs"><FiPackage /></span>
                  Parts & Material
                </h4>
                <div className="space-y-2 pl-2">
                  {parts.map((p, i) => (
                    <div key={`p-${i}`} className="flex justify-between text-gray-600">
                      <span>{p.name} x {p.quantity}</span>
                      <span className="font-mono">₹{(p.price * p.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  {customItems.map((c, i) => (
                    <div key={`c-${i}`} className="flex justify-between text-gray-600">
                      <div>
                        <span>{c.name} x {c.quantity}</span>
                        {c.hsnCode && <p className="text-[9px] text-gray-400">HSN: {c.hsnCode}</p>}
                      </div>
                      <span className="font-mono">₹{(c.price * c.quantity).toFixed(2)}</span>
                    </div>
                  ))}

                  {/* Parts GST */}
                  <div className="flex justify-between text-xs text-gray-500 border-t border-dashed border-gray-100 pt-1 mt-1">
                    <span>Parts GST (18%)</span>
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
              <div>
                <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                  <span className="w-6 h-6 rounded-full bg-gray-50 text-gray-600 flex items-center justify-center text-xs"><FiClock /></span>
                  Visiting Charges
                </h4>
                <div className="flex justify-between pl-2 font-bold text-gray-800">
                  <span>Visiting Price</span>
                  <span>₹{(bill?.visitingCharges || booking.visitingCharges || 0).toFixed(2)}</span>
                </div>
              </div>
            )}

            {/* Transport Charges */}
            {bill?.transportCharges > 0 && (
              <div className="mt-4">
                <h4 className="font-bold text-gray-900 flex items-center gap-2 mb-2 pb-2 border-b border-gray-100">
                  <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs"><FiPackage /></span>
                  Transport Charges
                </h4>
                <div className="flex justify-between pl-2 font-bold text-gray-800">
                  <span>Transport/Travel</span>
                  <span>₹{(bill.transportCharges).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Worker Earnings Footer - ONLY SHOW WHEN COMPLETED */}
          {(booking.status === 'completed' || booking.status === 'work_done' || booking.cashCollected) ? (
            <div className="bg-emerald-50 px-6 py-4 border-t border-emerald-100">
              <div className="space-y-2 mb-3 text-sm">
                <div className="flex justify-between items-center text-emerald-700">
                  <span>Service Earnings ({bill?.payoutConfig?.serviceSplitPercentage || 70}%)</span>
                  <span className="font-bold">₹{(bill?.vendorServiceEarning || (booking.vendorEarnings || 0)).toFixed(2)}</span>
                </div>
                {(parts.length > 0 || customItems.length > 0 || bill?.vendorPartsEarning > 0) && (
                  <div className="flex justify-between items-center text-emerald-700">
                    <span>Parts Earnings ({bill?.payoutConfig?.partsSplitPercentage || 10}%)</span>
                    <span className="font-bold">₹{(bill?.vendorPartsEarning || 0).toFixed(2)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-emerald-200/50">
                <span className="text-emerald-800 font-bold text-xs uppercase tracking-wider">
                  {(booking?.paymentStatus === 'SUCCESS' || booking?.paymentStatus === 'paid' || booking?.cashCollected)
                    ? 'Total Net Earnings'
                    : 'Estimated Net Earnings'}
                </span>
                <span className="text-emerald-700 font-black text-xl">
                  ₹{(bill?.vendorTotalEarning || booking.vendorEarnings || 0).toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-emerald-600/70 text-[10px] mt-2">
                <span>Platform Commission</span>
                <span>-₹{(booking.adminCommission || booking.platformCommission || 0).toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-100/50 text-center">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center justify-center gap-2">
                <FiAlertCircle className="w-3 h-3" />
                Net Earnings will be visible once completed
              </p>
            </div>
          )}
        </div>

        {/* Work Photos (after completion) */}
        {booking.workPhotos && booking.workPhotos.length > 0 && booking.assignedTo?.name !== 'You (Self)' && (
          <div className="bg-white rounded-xl p-4 mb-4 shadow-md border-t-4 border-green-500">
            <p className="text-sm font-semibold text-gray-700 mb-3">Work Evidence (Photos)</p>
            <div className="grid grid-cols-2 gap-2">
              {booking.workPhotos.map((photo, index) => (
                <div key={index} className="aspect-square rounded-lg overflow-hidden bg-gray-100 border relative group">
                  <img
                    src={photo.replace('/api/upload', 'http://localhost:5000/upload')}
                    alt={`Work evidence ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button
                      onClick={() => window.open(photo.replace('/api/upload', 'http://localhost:5000/upload'), '_blank')}
                      className="bg-white text-gray-900 px-3 py-1 rounded-full text-xs font-bold"
                    >
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>

          </div>
        )}

        {['visited', 'in_progress'].includes((booking.status || '').toLowerCase()) && (
          <div className="bg-white rounded-2xl mb-4 overflow-hidden shadow-lg border border-amber-100">
            <div className="h-2 bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <FiAlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Advance Payment</h3>
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Before marking work done</p>
                </div>
              </div>

              {booking.advancePayment?.status === 'paid' ? (
                <div className="rounded-2xl border border-green-100 bg-green-50 p-4">
                  <p className="text-sm font-bold text-green-800">Advance received</p>
                  <p className="text-xs text-green-700 mt-1">₹{Number(booking.advancePayment.paidAmount || booking.advancePayment.requestedAmount || 0).toLocaleString()} has already been paid by the customer.</p>
                </div>
              ) : booking.advancePayment?.status === 'requested' ? (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-800">Request pending</p>
                  <p className="text-xs text-amber-700 mt-1">₹{Number(booking.advancePayment.requestedAmount || 0).toLocaleString()} requested from the customer.</p>
                  {booking.advancePayment.reason && (
                    <p className="text-xs text-gray-600 mt-2">{booking.advancePayment.reason}</p>
                  )}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3">
                    <input
                      type="number"
                      min="1"
                      placeholder="Advance amount"
                      value={advanceForm.amount}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, amount: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 outline-none focus:border-amber-400"
                    />
                    <input
                      type="text"
                      placeholder="Reason for advance payment"
                      value={advanceForm.reason}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, reason: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-amber-400"
                    />
                    <textarea
                      rows={3}
                      placeholder="Parts/material details"
                      value={advanceForm.partsDescription}
                      onChange={(e) => setAdvanceForm(prev => ({ ...prev, partsDescription: e.target.value }))}
                      className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-900 outline-none focus:border-amber-400 resize-none"
                    />
                  </div>
                  <button
                    onClick={handleRequestAdvancePayment}
                    disabled={actionLoading}
                    className="w-full py-3.5 rounded-xl font-bold text-white shadow-lg active:scale-95 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #F59E0B, #EA580C)' }}
                  >
                    Request Advance Payment
                  </button>
                  <p className="text-[11px] text-gray-500 text-center">
                    Use this only after reaching the customer and starting work, if costly parts need approval.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Payment Collection Section */}
        {canCollectCash(booking) && (
          <div
            className="bg-white rounded-2xl mb-4 overflow-hidden shadow-lg border-none relative group"
            style={{
              boxShadow: booking.paymentMethod === 'plan_benefit'
                ? '0 10px 30px -5px rgba(16, 185, 129, 0.2)'
                : '0 10px 30px -5px rgba(249, 115, 22, 0.2)',
            }}
          >
            {/* Top Accent Gradient */}
            <div className={`h-2 bg-gradient-to-r ${booking.paymentMethod === 'plan_benefit' ? 'from-emerald-400 to-teal-600' : 'from-orange-400 to-orange-600'}`} />

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner ${booking.paymentMethod === 'plan_benefit' ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-500'}`}>
                  <FiCreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">
                    {booking.paymentMethod === 'plan_benefit' ? 'Prepare Final Bill' : 'Collect Payment'}
                  </h3>
                  <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">
                    {booking.paymentMethod === 'plan_benefit' ? 'Add extra charges if any' : 'Step 1: Finish Settlement'}
                  </p>
                </div>
              </div>

              {booking.paymentMethod === 'plan_benefit' ? (
                /* Plan Benefit UI */
                <div className="bg-emerald-50/50 rounded-2xl p-4 mb-6 border border-emerald-100/50">
                  <div className="flex items-center gap-3 mb-3">
                    <FiCheckCircle className="w-5 h-5 text-emerald-600" />
                    <span className="font-bold text-emerald-800">Base Service Covered by Plan</span>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">
                    The base service fee is covered by customer's membership. You can add extra charges for parts or additional work.
                  </p>
                </div>
              ) : (
                /* Normal Cash Collection UI */
                <div className="bg-orange-50/50 rounded-2xl p-4 mb-6 border border-orange-100/50">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Amount to Collect</span>
                    <span className="text-2xl font-black text-orange-600">
                      ₹{(booking.finalAmount || parseFloat(booking.price) || 0).toLocaleString()}
                    </span>
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-[11px] text-orange-700/80 leading-relaxed">
                    <FiClock className="w-3 h-3 mt-0.5" />
                    <span>Customer chose {
                      booking.paymentMethod === 'cash collected' ? 'Cash Collected' : 
                      booking.paymentMethod === 'Qr online' ? 'QR Online' : 
                      booking.paymentMethod === 'online' ? 'Online Paid' : 
                      booking.paymentMethod?.replace('_', ' ') || 'Cash'
                    } payment. Please verify collection to proceed.</span>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-3 w-full">
                <button
                  onClick={() => navigate(`/worker/booking/${booking.id || id}/billing`)}
                  disabled={loading}
                  className="w-full py-4 rounded-xl font-bold bg-blue-600 text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #3B82F6, #2563EB)' }}
                >
                  <FiDollarSign className="w-5 h-5" />
                  {booking.paymentMethod === 'plan_benefit' ? 'Prepare/Edit Final Bill' : 'Prepare Bill & Collect Cash'}
                </button>

                {(booking?.customerConfirmationOTP || booking?.paymentOtp) && (
                  <button
                    onClick={() => setIsOtpModalOpen(true)}
                    disabled={loading}
                    className="w-full py-4 rounded-xl font-bold bg-green-600 text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                    style={{ background: 'linear-gradient(135deg, #10B981, #059669)' }}
                  >
                    <FiCheckCircle className="w-5 h-5" />
                    Enter OTP
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Online Payment Done State */}
        {(booking?.paymentStatus === 'SUCCESS' || booking?.paymentStatus === 'paid') && booking?.status !== 'completed' && (
          <div className="bg-white rounded-2xl mb-4 overflow-hidden shadow-lg border-none relative group"
            style={{ boxShadow: '0 10px 30px -5px rgba(16, 185, 129, 0.2)' }}
          >
            <div className="h-2 bg-gradient-to-r from-green-400 to-green-600" />
            <div className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center text-green-500 shadow-inner">
                  <FiCheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900 leading-tight">Paid Online</h3>
                  <p className="text-xs text-green-600 font-bold uppercase tracking-wider">Payment Verified</p>
                </div>
              </div>
              <div className="mt-4 bg-green-50/50 rounded-xl p-3 border border-green-100">
                <p className="text-xs text-green-800 font-medium">Customer has paid ₹{booking.finalAmount.toLocaleString()} online via Razorpay. No cash collection needed.</p>
              </div>
            </div>
          </div>
        )}

        {canDoFinalSettlement(booking) && (
          <div
            className="bg-white rounded-2xl mb-4 overflow-hidden shadow-lg border-none relative"
            style={{
              boxShadow: '0 10px 30px -5px rgba(139, 92, 246, 0.15)',
            }}
          >
            <div className="h-2 bg-gradient-to-r from-violet-400 to-indigo-600" />

            <div className="p-6">
              <div className="flex items-center gap-4 mb-4">
                <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-500 shadow-inner">
                  <FiCheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Finish Job</h3>
                  <p className="text-xs text-gray-500 font-medium tracking-wide uppercase">Step 2: Close Booking</p>
                </div>
              </div>

              <div className="bg-violet-50/50 rounded-2xl p-4 mb-6 border border-violet-100/50">
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <FiCheck className="w-4 h-4 text-violet-600" />
                  </div>
                  <div>
                    <span className="text-sm text-gray-700 font-medium">Payment Verified</span>
                    <p className="text-xs text-gray-500 mt-0.5">Payment has been successfully recorded. You can now close this booking.</p>
                  </div>
                </div>
              </div>

              <button
                onClick={handleFinalSettlement}
                disabled={loading}
                className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 hover:brightness-105"
                style={{
                  background: 'linear-gradient(135deg, #8B5CF6, #6366F1)',
                  boxShadow: '0 8px 16px -4px rgba(139, 92, 246, 0.4)',
                }}
              >
                <FiCheckCircle className="w-5 h-5" />
                Close Booking & Finalize
              </button>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            onClick={handleViewTimeline}
            className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: themeColors.button,
              boxShadow: `0 4px 12px ${themeColors.button}40`,
            }}
          >
            View Timeline
            <FiArrowRight className="w-5 h-5" />
          </button>


          {/* Worker Operational Buttons */}
          {(
            <div className="space-y-3 pt-2">
              {(booking.status === 'confirmed' || booking.status === 'assigned' || booking.status === 'accepted' || booking.status === 'pending') && (
                <button
                  onClick={handleStartJourney}
                  className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <FiNavigation className="w-5 h-5" />
                  Start Journey
                </button>
              )}

              {booking.status === 'journey_started' && (
                <button
                  onClick={async () => {
                    try {
                      setIsVisitModalOpen(true);
                      await workerReached(id);
                    } catch (err) {
                      console.error('Failed to notify reached:', err);
                    }
                  }}
                  className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                    boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                  }}
                >
                  <FiMapPin className="w-5 h-5" />
                  Arrived (Arrived at customer's site)
                </button>
              )}

              {(booking.status === 'visited' || booking.status === 'in_progress') && (
                <button
                  onClick={() => setIsWorkDoneModalOpen(true)}
                  className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg"
                  style={{
                    background: 'linear-gradient(135deg, #10B981, #059669)',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.4)',
                  }}
                >
                  <FiCheckCircle className="w-5 h-5" />
                  Work Done
                </button>
              )}
            </div>
          )}
        </div>
      </main>


      {/* Cash Collection / OTP Modal */}
      <CashCollectionModal
        isOpen={isCashModalOpen}
        onClose={() => setIsCashModalOpen(false)}
        booking={booking}
        onConfirm={handleCashCollectionConfirm}
        onInitiateOTP={async (amt, items) => {
          return await workerWalletService.initiateCashCollection(id, amt, items);
        }}
        loading={loading}
      />

      <OtpVerificationModal
        isOpen={isOtpModalOpen}
        onClose={() => setIsOtpModalOpen(false)}
        onVerify={(otp) => {
          const amount = booking.finalAmount || 0;
          const extras = booking.workDoneDetails?.items || [];
          handleCashCollectionConfirm(amount, extras, otp);
        }}
        loading={loading}
      />


      {/* Visit OTP Modal */}
      <VisitVerificationModal
        isOpen={isVisitModalOpen}
        onClose={() => setIsVisitModalOpen(false)}
        bookingId={id}
        onSuccess={() => window.location.reload()}
      />

      {/* Work Completion Modal */}
      <WorkCompletionModal
        isOpen={isWorkDoneModalOpen}
        onClose={() => setIsWorkDoneModalOpen(false)}
        job={booking}
        onComplete={async (photos) => {
          try {
            setActionLoading(true);
            // Use worker-specific service call (completeSelfJob)
            await completeSelfJob(id, { workPhotos: photos });
            toast.success('Work marked done');
            setIsWorkDoneModalOpen(false);
            window.location.reload();
          } catch (err) {
            toast.error(err.response?.data?.message || 'Failed to complete job');
          } finally {
            setActionLoading(false);
          }
        }}
        loading={actionLoading}
      />

      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog(prev => { return { ...prev, isOpen: false }; })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />



      <BottomNav />
    </div>
  );
}
