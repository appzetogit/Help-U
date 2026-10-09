import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMapPin, FiClock, FiArrowRight } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import StatusBadge from '../common/StatusBadge';
import PriceDisplay from '../common/PriceDisplay';
import ServiceTypeBadge from './ServiceTypeBadge';

const BookingCard = ({ booking, onClick }) => {
  const navigate = useNavigate();

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const handleClick = () => {
    if (onClick) {
      onClick(booking);
    } else {
      navigate(`/worker/booking/${booking.id}`);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="rounded-2xl p-5 shadow-lg relative overflow-hidden border-2 transition-all active:scale-[0.98] cursor-pointer"
      style={{
        background: 'linear-gradient(135deg, #FFFFFF 0%, #F9FAFB 100%)',
        borderColor: hexToRgba(themeColors.icon, 0.2),
        boxShadow: `0 4px 12px ${hexToRgba(themeColors.icon, 0.1)}`,
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <ServiceTypeBadge serviceType={booking.serviceType} />
            <StatusBadge status={booking.status} size="sm" />
          </div>
          <h3 className="font-bold text-lg text-gray-900 mb-1">
            {booking.user?.name || 'Customer'}
          </h3>
        </div>
        <FiArrowRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </div>

      {/* Details */}
      <div className="space-y-2 mb-4">
        {booking.location?.address && (
          <div className="flex items-start gap-2">
            <FiMapPin className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-gray-600 flex-1 line-clamp-2">
              {booking.location.address}
            </p>
            {booking.location?.distance && (
              <span className="text-xs text-gray-500 whitespace-nowrap ml-2">
                {booking.location.distance} km
              </span>
            )}
          </div>
        )}

        {booking.timeSlot && (
          <div className="flex items-center gap-2">
            <FiClock className="w-4 h-4 text-gray-500" />
            <p className="text-sm text-gray-600">
              {booking.timeSlot.date} at {booking.timeSlot.time}
            </p>
          </div>
        )}

        {booking.assignedTo && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Assigned to:</span>
            <span className="text-sm font-semibold text-gray-900">
              {typeof booking.assignedTo === 'string' 
                ? booking.assignedTo 
                : 'Self'}
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <PriceDisplay amount={booking.price || 0} size="lg" />
        <span className="text-xs text-gray-500">
          ID: {booking.id?.slice(-6) || 'N/A'}
        </span>
      </div>
    </div>
  );
};

export default BookingCard;

