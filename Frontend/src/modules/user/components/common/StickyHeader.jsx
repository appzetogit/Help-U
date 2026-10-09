import React from 'react';
import { FiArrowLeft, FiSearch, FiShare2 } from 'react-icons/fi';

const StickyHeader = React.memo(({
  title = 'Appzeto',
  onBack,
  onSearch,
  onShare,
  isVisible = false
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        backgroundColor: '#ffffff',
        padding: '12px 16px',
        borderBottom: '1px solid #e5e7eb',
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
        zIndex: 9999,
        opacity: 1,
        transform: 'translateZ(0)',
        pointerEvents: 'auto',
        display: 'block',
        visibility: 'visible',
        willChange: 'transform',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
    >
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <FiArrowLeft className="w-6 h-6 text-gray-800" />
        </button>

        <h1 className="text-base font-semibold text-black">{title}</h1>

        <div className="flex items-center gap-2">
          <button
            onClick={onSearch}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <FiSearch className="w-6 h-6 text-gray-800" />
          </button>
          <button
            onClick={onShare}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <FiShare2 className="w-6 h-6 text-gray-800" />
          </button>
        </div>
      </div>
    </header>
  );
});

StickyHeader.displayName = 'StickyHeader';

export default StickyHeader;

