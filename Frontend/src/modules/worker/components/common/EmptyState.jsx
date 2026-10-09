import React from 'react';
import { FiInbox, FiSearch, FiAlertCircle } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';

const EmptyState = ({ 
  icon = 'inbox', 
  title = 'No data found', 
  message = 'There is no data to display at the moment.',
  actionLabel,
  onAction,
  iconColor
}) => {
  const iconMap = {
    inbox: FiInbox,
    search: FiSearch,
    alert: FiAlertCircle,
  };

  const IconComponent = iconMap[icon] || FiInbox;
  const displayColor = iconColor || themeColors.button;

  return (
    <div className="w-full py-12 px-4 flex flex-col items-center justify-center text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
        style={{
          background: `${displayColor}15`,
        }}
      >
        <IconComponent className="w-10 h-10" style={{ color: displayColor }} />
      </div>
      <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-600 mb-6 max-w-sm">{message}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-3 rounded-xl font-semibold text-white transition-all active:scale-95"
          style={{
            background: themeColors.button,
            boxShadow: `0 4px 12px ${themeColors.button}40`,
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default EmptyState;

