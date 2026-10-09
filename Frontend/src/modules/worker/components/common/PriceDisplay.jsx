import React from 'react';

const PriceDisplay = ({ amount, currency = '₹', size = 'md', showDecimals = false }) => {
  const formattedAmount = showDecimals
    ? amount.toFixed(2)
    : Math.round(amount).toLocaleString('en-IN');

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg',
    xl: 'text-xl',
    '2xl': 'text-2xl',
    '3xl': 'text-3xl',
  };

  return (
    <span className={`font-bold ${sizeClasses[size]}`}>
      {currency} {formattedAmount}
    </span>
  );
};

export default PriceDisplay;

