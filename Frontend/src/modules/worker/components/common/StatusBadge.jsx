import React from 'react';
import { workerTheme as themeColors } from '../../../../theme';

const StatusBadge = ({ status, size = 'md' }) => {
  const statusConfig = {
    REQUESTED: {
      label: 'Requested',
      color: '#F59E0B',
      bgColor: '#FEF3C7',
    },
    ACCEPTED: {
      label: 'Accepted',
      color: '#3B82F6',
      bgColor: '#DBEAFE',
    },
    ASSIGNED: {
      label: 'Assigned',
      color: '#8B5CF6',
      bgColor: '#EDE9FE',
    },
    VISITED: {
      label: 'Visited',
      color: '#10B981',
      bgColor: '#D1FAE5',
    },
    WORK_DONE: {
      label: 'Work Done',
      color: '#059669',
      bgColor: '#A7F3D0',
    },
    SETTLEMENT_PENDING: {
      label: 'Settlement Pending',
      color: '#F97316',
      bgColor: '#FED7AA',
    },
    COMPLETED: {
      label: 'Completed',
      color: '#10B981',
      bgColor: '#D1FAE5',
    },
    REJECTED: {
      label: 'Rejected',
      color: '#EF4444',
      bgColor: '#FEE2E2',
    },
    ONLINE: {
      label: 'Online',
      color: themeColors.icon,
      bgColor: `${themeColors.icon}25`,
    },
    OFFLINE: {
      label: 'Offline',
      color: '#94A3B8',
      bgColor: '#F1F5F9',
    },
  };

  const config = statusConfig[status] || {
    label: status,
    color: '#6B7280',
    bgColor: '#F3F4F6',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
    lg: 'text-sm px-3 py-1.5',
  };

  return (
    <span
      className={`font-bold rounded-full ${sizeClasses[size]}`}
      style={{
        background: config.bgColor,
        color: config.color,
      }}
    >
      {config.label}
    </span>
  );
};

export default StatusBadge;

