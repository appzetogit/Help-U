import React from 'react';
import { FiClock, FiMapPin, FiBell } from 'react-icons/fi';

// Internal Timer Component for unification
const CountdownTimer = ({ durationSeconds, createdAt, expiresAt, onExpire }) => {
  const calculateTimeLeft = () => {
    try {
      if (expiresAt) {
        const end = new Date(expiresAt).getTime();
        if (!isNaN(end)) {
          const left = Math.floor((end - Date.now()) / 1000);
          return Math.max(0, left);
        }
      }
      if (!createdAt) return Number(durationSeconds) || 300;
      const start = new Date(createdAt).getTime();
      if (!isNaN(start)) {
        const elapsed = Math.floor((Date.now() - start) / 1000);
        return Math.max(0, (Number(durationSeconds) || 300) - elapsed);
      }
      return Number(durationSeconds) || 300;
    } catch (err) {
      return 0;
    }
  };

  const [timeLeft, setTimeLeft] = React.useState(calculateTimeLeft());

  React.useEffect(() => {
    // Recalculate once on mount to handle refresh correctly
    const initial = calculateTimeLeft();
    setTimeLeft(initial);
    if (initial <= 0 && onExpire) onExpire();
  }, [createdAt, expiresAt]);

  React.useEffect(() => {
    if (timeLeft <= 0) {
      if (onExpire) onExpire();
      return;
    }
    const interval = setInterval(() => {
      const current = calculateTimeLeft();
      setTimeLeft(current);
      if (current <= 0) {
        clearInterval(interval);
        if (onExpire) onExpire();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [timeLeft, createdAt, expiresAt]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  return (
    <div className={`text-[10px] font-mono font-bold flex items-center gap-1 ${timeLeft < 30 ? 'text-red-600 animate-pulse' : 'text-yellow-600'}`}>
      <FiClock className="w-3 h-3" />
      <span>{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</span>
    </div>
  );
};

const PendingJobCard = ({ booking, onAccept, onReject, onClick, loadingAction, showTimer = false, maxSearchTimeMins = 5 }) => {
  const bookingId = booking.id || booking._id;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl shadow-md cursor-pointer active:scale-98 transition-transform border-l-4 overflow-hidden"
      style={{
        boxShadow: '0 4px 12px rgba(245, 158, 11, 0.15)',
        borderLeftColor: '#F59E0B',
        borderTop: '1px solid rgba(245, 158, 11, 0.2)',
        borderRight: '1px solid rgba(245, 158, 11, 0.2)',
        borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
      }}
    >
      {/* Urgency header */}
      {showTimer && (
        <div className="px-4 py-2 bg-yellow-50 border-b border-yellow-100 flex justify-between items-center">
          <span className={`text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 ${booking.bookingType === 'instant' ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}>
            {booking.bookingType === 'instant' && <span className="text-sm">⚡</span>}
            {booking.bookingType === 'instant' ? 'INSTANT' : 'NEW REQUEST'}
          </span>
          <CountdownTimer
            durationSeconds={maxSearchTimeMins * 60}
            createdAt={booking.createdAt}
            expiresAt={booking.expiresAt}
            onExpire={() => {
              // Locally remove from state if it expires
              window.dispatchEvent(new CustomEvent('removeWorkerBooking', { detail: { id: bookingId } }));
            }}
          />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between mb-2 gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-0.5">
              {booking.serviceCategory || (booking.serviceId?.category?.title) || (booking.categoryName) || 'General Service'}
            </p>
            <div className="flex items-start gap-2 mb-1">
              <p className="font-bold text-gray-800 text-sm leading-tight line-clamp-2">
                {booking.serviceName || booking.serviceType || booking.serviceId?.title || 'New Booking Request'}
              </p>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-yellow-100 text-yellow-600 uppercase tracking-widest shrink-0 mt-0.5">
                REQ
              </span>
            </div>
            {booking.brandName && (
              <div className="flex items-center gap-1.5 mb-1.5 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded-md w-fit">
                {booking.brandIcon && (
                  <img src={booking.brandIcon} alt={booking.brandName} className="w-3 h-3 object-contain" />
                )}
                <span className="text-[10px] font-bold text-gray-700 uppercase tracking-wide">{booking.brandName}</span>
              </div>
            )}
            <p className="text-xs text-gray-500 font-medium line-clamp-1">
              {booking.customerName || booking.userId?.name || 'Customer'} • {booking.location?.address || booking.address?.addressLine1 || 'Location'}
            </p>
          </div>
          <div className="flex flex-col items-center shrink-0">
            {booking.categoryIcon || booking.serviceId?.category?.icon ? (
              <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 overflow-hidden shadow-sm flex items-center justify-center p-0.5">
                <img src={booking.categoryIcon || booking.serviceId?.category?.icon} className="max-w-full max-h-full object-contain" alt="Category" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center">
                <FiBell className="w-5 h-5 animate-pulse" style={{ color: '#F59E0B' }} />
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <FiClock className="w-4 h-4" />
            <span>
              {booking.timeSlot?.date || (booking.scheduledDate ? new Date(booking.scheduledDate).toLocaleDateString() : '')}
              {(booking.timeSlot?.date || booking.scheduledDate) ? ' • ' : ''}
              {booking.timeSlot?.time || booking.scheduledTime || 'N/A'}
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <FiMapPin className="w-4 h-4" />
            <span>
              {(() => {
                const dist = booking.location?.distance || booking.distance;
                if (!dist || dist === 'N/A') return 'N/A';
                return String(dist).includes('km') ? dist : `${dist} km`;
              })()}
            </span>
          </div>
          <div className="text-sm font-bold text-gray-800">
            ₹{booking.price || booking.vendorEarnings || booking.finalAmount || 0}
          </div>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            disabled={!!loadingAction}
            onClick={(e) => onAccept(e, booking)}
            className="flex-1 bg-green-500 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {loadingAction === 'accept' ? 'Accepting...' : 'Accept'}
          </button>
          <button
            disabled={!!loadingAction}
            onClick={(e) => onReject(e, booking)}
            className="flex-1 bg-red-500 text-white py-2 px-3 rounded-lg text-sm font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            {loadingAction === 'reject' ? 'Rejecting...' : 'Reject'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PendingJobCard;
