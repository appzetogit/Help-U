import React, { useState, useEffect } from 'react';
import { FiX, FiMapPin, FiClock, FiDollarSign, FiArrowRight, FiBell, FiAlertCircle, FiMinimize2, FiUsers } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { workerTheme as themeColors } from '../../../../theme';
import { playAlertRing, stopAlertRing } from '../../../../utils/notificationSound';

const BookingAlertCard = ({ booking, onAccept, onReject, maxSearchTimeMins = 1 }) => {
  // Calculate initial time synchronously instead of relying solely on useEffect
  const calculateInitialRemaining = () => {
    try {
      if (booking?.expiresAt) {
        const end = new Date(booking.expiresAt).getTime();
        if (!isNaN(end)) {
          const left = Math.floor((end - Date.now()) / 1000);
          return Math.max(0, left);
        }
      }

      const totalDurationMins = Number(maxSearchTimeMins) || 5;
      const initialDurationSecs = totalDurationMins * 60;

      if (booking?.createdAt) {
        const start = new Date(booking.createdAt).getTime();
        if (!isNaN(start)) {
          const elapsed = Math.floor((Date.now() - start) / 1000);
          return Math.max(0, initialDurationSecs - elapsed);
        }
      }

      return initialDurationSecs;
    } catch {
      return (Number(maxSearchTimeMins) || 1) * 60;
    }
  };

  const [timeLeft, setTimeLeft] = useState(calculateInitialRemaining());
  const [loadingAction, setLoadingAction] = useState(null);

  const handleAction = async (actionFn, actionType) => {
    if (loadingAction) return;
    setLoadingAction(actionType);
    const bookingId = booking.id || booking._id;
    localStorage.removeItem(`alert_start_${bookingId}`);
    try {
      if (actionFn) await actionFn(bookingId);
    } catch (error) {
      console.error(error);
    } finally {
      if (typeof window !== 'undefined') {
        // Prevent immediate re-enabling if unmounted, handled by React state memory leak warning natively, but usually safe
        setLoadingAction(null);
      }
    }
  };

  useEffect(() => {
    if (!booking) return;

    const bookingId = booking.id || booking._id;
    const totalDurationMins = Number(maxSearchTimeMins) || 5;
    const initialDurationSecs = totalDurationMins * 60;

    const calculateRemaining = () => {
      try {
        if (booking.expiresAt) {
          const end = new Date(booking.expiresAt).getTime();
          if (!isNaN(end)) {
            const left = Math.floor((end - Date.now()) / 1000);
            return Math.max(0, left);
          }
        }

        if (booking.createdAt) {
          const start = new Date(booking.createdAt).getTime();
          if (!isNaN(start)) {
            const elapsed = Math.floor((Date.now() - start) / 1000);
            return Math.max(0, initialDurationSecs - elapsed);
          }
        }

        return initialDurationSecs;
      } catch (err) {
        console.error("Timer calculation error:", err);
        return 0;
      }
    };

    const remaining = calculateRemaining();
    setTimeLeft(remaining);

    if (remaining <= 0) {
      onReject?.(bookingId);
      window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id: bookingId } }));
      return;
    }

    const timer = setInterval(() => {
      const currentRemaining = calculateRemaining();
      setTimeLeft(currentRemaining);

      if (currentRemaining <= 0) {
        clearInterval(timer);
        onReject?.(bookingId);
        window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id: bookingId } }));
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [booking, onReject, booking.expiresAt, booking.createdAt, maxSearchTimeMins]);

  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  // Progress relative to the total max search time to ensure the circle shrinks correctly
  const totalDurationSecs = (Number(maxSearchTimeMins) || 5) * 60;
  const progress = (timeLeft / totalDurationSecs) * circumference;
  const dashoffset = circumference - progress;

  return (
    <div className="bg-white w-full sm:w-[320px] flex-none rounded-[2rem] overflow-y-auto max-h-[85vh] shadow-[0_20px_40px_-10px_rgba(0,0,0,0.5)] relative scrollbar-hide snap-center">
      {/* Header Section */}
      <div className="relative h-20 bg-gradient-to-br from-teal-600 to-emerald-700 flex flex-col items-center justify-center">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute -top-10 -left-10 w-32 h-32 bg-white rounded-full"
          />
        </div>

        <div className="flex items-center gap-2 relative z-10 w-full px-4 justify-center">
          <div className="w-8 h-8 bg-white/10 backdrop-blur-xl rounded-lg border border-white/20 flex items-center justify-center shadow-md relative">
            <FiBell className="w-4 h-4 text-white animate-bounce" />
            <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-400 rounded-full border-2 border-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-white text-lg font-black tracking-tight leading-none">New Order!</h2>
            <div className="text-[8px] font-bold text-teal-100 uppercase tracking-widest mt-0.5">
              Action Required Immediately
            </div>
          </div>
        </div>
      </div>

      {/* Body Section */}
      <div className="px-5 py-4">
        <div className="flex justify-center -mt-9 mb-3 relative z-20">
          <div className="relative w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-xl p-0.5">
            <svg className="absolute inset-0 w-full h-full -rotate-90 transform" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r={radius} fill="none" stroke="#F3F4F6" strokeWidth="4" />
              <motion.circle
                cx="30" cy="30" r={radius} fill="none"
                stroke={timeLeft <= 10 ? '#EF4444' : '#059669'} strokeWidth="5"
                strokeDasharray={circumference} strokeDashoffset={dashoffset}
                strokeLinecap="round" className="transition-all duration-1000 ease-linear"
              />
            </svg>
            <div className="text-center mt-0.5">
              <span className={`text-lg font-black block leading-none ${timeLeft <= 20 ? 'text-red-500' : 'text-emerald-600'}`}>
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </span>
              <span className="text-[7px] font-bold text-gray-400 uppercase tracking-tighter block -mt-0.5">Mins Left</span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center mb-4 bg-emerald-50 py-2 rounded-xl border border-emerald-100">
          <div className="text-center">
            <span className="text-[9px] font-black text-emerald-800/60 uppercase tracking-[0.1em] mb-0.5 block">Distance</span>
            <div className="text-lg font-black text-emerald-700 tracking-tight flex items-center gap-1 justify-center">
              <FiMapPin className="w-3.5 h-3.5" />
              {booking.location?.distance || (booking.distance ? (String(booking.distance).includes('km') ? booking.distance : `${booking.distance} km`) : 'Near You')}
            </div>
          </div>
        </div>

        <div className="mb-4 space-y-2.5">
          {/* Category & Urgent Badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-2 py-1 rounded-lg shadow-sm">
              {booking.categoryIcon ? (
                <img src={booking.categoryIcon} alt="Cat" className="w-4 h-4 object-contain" />
              ) : (
                <span className="w-4 h-4 flex items-center justify-center bg-gray-200 rounded-full text-[9px]">⚡</span>
              )}
              <span className="text-[10px] font-black tracking-widest text-gray-700 uppercase line-clamp-1 max-w-[120px]">
                {booking.serviceCategory || booking.serviceId?.categoryId?.title || booking.serviceId?.category?.title || booking.categoryName || 'General Service'}
              </span>
            </div>
            <div className="bg-red-50 border border-red-100 px-1.5 py-1 rounded-md">
              <span className="text-[9px] font-black text-red-600 tracking-widest flex items-center gap-1 uppercase">
                <FiBell className="w-3 h-3 animate-pulse" /> Urgent
              </span>
            </div>
          </div>

          {/* Service Details Card */}
          <div className="bg-white rounded-[1rem] p-3 border border-gray-100 shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full bg-teal-500" />
            <div className="pl-2">
              <h4 className="text-[14px] font-black text-gray-900 leading-tight">
                {booking.serviceName || booking.serviceType || booking.serviceId?.title || 'Service Request'}
              </h4>
              {(booking.brandName || booking.brandIcon) && (
                <div className="flex items-center gap-1.5 mt-1.5 opacity-80">
                  <span className="text-[9px] font-bold text-gray-500 uppercase">Brand:</span>
                  <span className="text-[10px] font-black text-gray-800 uppercase tracking-wider">{booking.brandName}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 mb-5 text-xs space-y-2">
          <div className="flex items-start gap-2">
            <FiMapPin className="text-gray-400 w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="font-bold text-gray-800 leading-snug line-clamp-2">{booking.location?.address || booking.address?.addressLine1 || 'Address not available'}</span>
          </div>
          <div className="flex items-start gap-2 pt-2 border-t border-gray-200">
            <FiClock className="text-gray-400 w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span className="font-bold text-gray-800">
              {booking.timeSlot?.date || (booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString() : '')} {booking.timeSlot?.time || booking.scheduledTime || 'N/A'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={!!loadingAction}
            onClick={() => handleAction(onAccept, 'accept')}
            className="w-full py-3 rounded-xl bg-gray-900 hover:bg-gray-800 text-white font-black text-sm shadow-md active:scale-95 transition-all flex items-center justify-center gap-2 col-span-2 disabled:opacity-50">
            {loadingAction === 'accept' ? 'Accepting...' : 'Accept (Myself)'}
          </button>
          <button
            disabled={!!loadingAction}
            onClick={() => handleAction(onReject, 'reject')}
            className="w-full py-2.5 rounded-xl col-span-2 bg-red-50 border border-red-100 text-red-500 font-bold text-[11px] active:scale-95 transition-all uppercase flex items-center justify-center gap-1.5 disabled:opacity-50">
            {loadingAction === 'reject' ? '...' : <><FiX className="w-3.5 h-3.5" /> Decline</>}
          </button>
        </div>
      </div>
    </div>
  );
};

const BookingAlertModal = ({ isOpen, booking, bookings, onAccept, onReject, onMinimize, maxSearchTimeMins = 1 }) => {
  const alertsArray = bookings || (booking ? [booking] : []);

  return (
    <AnimatePresence>
      {isOpen && alertsArray.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 backdrop-blur-md"
        >
          {onMinimize && (
            <button
              onClick={() => { stopAlertRing(); onMinimize(); }}
              className="absolute top-4 right-4 z-50 p-2 bg-black/20 hover:bg-black/30 backdrop-blur-md rounded-full text-white transition-all active:scale-95"
              title="Minimize Alert"
            >
              <FiMinimize2 className="w-5 h-5" />
            </button>
          )}

          <div className="w-full overflow-x-auto snap-x snap-mandatory scrollbar-hide flex gap-4 px-8 items-center h-full">
            <div className="flex gap-4 m-auto">
              {alertsArray.map(b => (
                <BookingAlertCard
                  key={b.id || b._id}
                  booking={b}
                  onAccept={onAccept}
                  onReject={onReject}
                  maxSearchTimeMins={maxSearchTimeMins}
                />
              ))}
            </div>
          </div>

          {alertsArray.length > 1 && (
            <div className="absolute bottom-10 left-0 right-0 flex justify-center text-white text-sm font-medium animate-pulse drop-shadow-lg">
              Swipe to see all {alertsArray.length} alerts →
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default BookingAlertModal;
