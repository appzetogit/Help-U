import React from 'react';
import { FiCheckCircle, FiClock, FiAlertCircle } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';

const BookingStatusIndicator = ({ status, currentStage, stage }) => {
  const isCompleted = currentStage > stage;
  const isCurrent = currentStage === stage;
  const isPending = currentStage < stage;

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  if (isCompleted) {
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: '#D1FAE5',
        }}
      >
        <FiCheckCircle className="w-6 h-6 text-green-600" />
      </div>
    );
  }

  if (isCurrent) {
    return (
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 animate-pulse"
        style={{
          background: hexToRgba(themeColors.button, 0.2),
          border: `2px solid ${themeColors.button}`,
        }}
      >
        <FiClock className="w-5 h-5" style={{ color: themeColors.button }} />
      </div>
    );
  }

  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        background: '#F3F4F6',
        border: '2px solid #E5E7EB',
      }}
    >
      <FiAlertCircle className="w-5 h-5 text-gray-400" />
    </div>
  );
};

export default BookingStatusIndicator;

