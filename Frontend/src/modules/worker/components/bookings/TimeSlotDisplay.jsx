import React from 'react';
import { FiClock, FiCalendar } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';

const TimeSlotDisplay = ({ timeSlot, showIcon = true, size = 'md' }) => {
  if (!timeSlot) return null;

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      weekday: 'short', 
      day: 'numeric', 
      month: 'short' 
    });
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    // If time is in HH:MM format, convert to 12-hour format
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  return (
    <div className={`flex items-center gap-2 ${sizeClasses[size]}`}>
      {showIcon && (
        <div
          className="p-1.5 rounded-lg flex-shrink-0"
          style={{
            background: hexToRgba(themeColors.icon, 0.15),
          }}
        >
          <FiClock className="w-4 h-4" style={{ color: themeColors.icon }} />
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {timeSlot.date && (
          <span className="flex items-center gap-1 text-gray-700 font-medium">
            {showIcon && <FiCalendar className="w-3 h-3" />}
            {formatDate(timeSlot.date)}
          </span>
        )}
        {timeSlot.time && (
          <span className="text-gray-600">
            {formatTime(timeSlot.time)}
          </span>
        )}
      </div>
    </div>
  );
};

export default TimeSlotDisplay;

