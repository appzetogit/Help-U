import React from 'react';
import { workerTheme as themeColors } from '../../../../theme';

const ServiceTypeBadge = ({ serviceType, size = 'md' }) => {
  const serviceIcons = {
    'Fan Repair': '🔧',
    'AC Service': '❄️',
    'Electrical Wiring': '⚡',
    'Plumbing': '🚿',
    'Carpentry': '🪚',
    'Appliance Repair': '🔌',
    'Cleaning': '🧹',
    'Installation': '📦',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  return (
    <span
      className={`font-semibold rounded-lg flex items-center gap-1.5 ${sizeClasses[size]}`}
      style={{
        background: hexToRgba(themeColors.button, 0.15),
        color: themeColors.button,
      }}
    >
      {serviceIcons[serviceType] && <span>{serviceIcons[serviceType]}</span>}
      <span>{serviceType}</span>
    </span>
  );
};

export default ServiceTypeBadge;

