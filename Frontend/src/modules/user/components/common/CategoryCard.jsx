import React, { useState, useRef, memo, useEffect } from 'react';
import { gsap } from 'gsap';
import { createRipple } from '../../../../utils/gsapAnimations';

import { themeColors } from '../../../../theme';

const CategoryCard = memo(({ icon, title, onClick, hasSaleBadge = false, index = 0 }) => {
  const cardRef = useRef(null);

  // Simple entrance animation
  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { y: 15, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          delay: index * 0.05,
          ease: 'power2.out',
        }
      );
    }
  }, [index]);

  return (
    <div
      ref={cardRef}
      className="flex flex-col items-center justify-center p-1 cursor-pointer relative category-card-container group transition-transform duration-300 ease-out active:scale-95 w-full"
      onClick={onClick}
      style={{
        opacity: 0, // Start hidden for GSAP
      }}
    >
      <div
        className="w-[64px] h-[64px] rounded-full flex items-center justify-center mb-2 relative border border-gray-100 flex-shrink-0 transition-all duration-500 group-hover:shadow-lg group-hover:shadow-primary-100 group-hover:-translate-y-1 bg-white"
        style={{
          boxShadow: '0 8px 20px -6px rgba(0,0,0,0.05)',
        }}
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
        {icon || (
          <svg
            className="w-7 h-7 text-gray-400 transition-colors duration-300"
            style={{ color: 'inherit' }}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            onMouseEnter={(e) => e.currentTarget.style.color = themeColors.button}
            onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        )}
        {hasSaleBadge && (
          <div
            className="absolute -top-1.5 -right-1.5 text-white text-[9px] font-bold px-2 py-0.5 rounded-full shadow-lg z-10 border border-white"
            style={{
              background: themeColors.gradient,
              boxShadow: `0 4px 12px ${themeColors.brand.teal}4D`
            }}
          >
            SALE
          </div>
        )}
      </div>
      <span
        className="text-[11px] text-center text-gray-700 font-medium leading-tight tracking-tight mt-1 transition-colors duration-300 w-full line-clamp-2 px-1"
        style={{
          wordWrap: 'break-word',
          color: 'inherit'
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = themeColors.button}
        onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'}
      >
        {title}
      </span>
    </div>
  );
});

CategoryCard.displayName = 'CategoryCard';

export default CategoryCard;

