import React, { useState, useEffect, useRef } from 'react';
import { FiX } from 'react-icons/fi';
import { gsap } from 'gsap';
import { animateModalIn, animateModalOut } from '../../../../utils/gsapAnimations';

const MenuModal = React.memo(({ isOpen, onClose, onCategoryClick, categories = [] }) => {
  const [isClosing, setIsClosing] = useState(false);
  const modalRef = useRef(null);
  const backdropRef = useRef(null);

  useEffect(() => {
    if (isOpen && modalRef.current && backdropRef.current) {
      // Animate backdrop
      gsap.fromTo(
        backdropRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.2 }
      );

      // Animate modal
      animateModalIn(modalRef.current);
    }
  }, [isOpen]);

  const handleClose = () => {
    if (modalRef.current && backdropRef.current) {
      setIsClosing(true);

      // Animate out
      gsap.to(backdropRef.current, {
        opacity: 0,
        duration: 0.2,
      });

      animateModalOut(modalRef.current, () => {
        onClose();
        setIsClosing(false);
      });
    }
  };

  if (!isOpen && !isClosing) return null;

  const handleCategoryClick = (category) => {
    onCategoryClick?.(category);
    handleClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className="fixed inset-0 bg-black/85 z-[9998]"
        onClick={handleClose}
        style={{ 
          opacity: 0,
          position: 'fixed',
          willChange: 'opacity',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      />

      {/* Modal Container - Centered Card */}
      <div 
        className="fixed inset-0 z-[9999] flex items-end justify-center px-4 pb-20 pointer-events-none"
        style={{
          position: 'fixed',
          willChange: 'transform',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
      >
        <div className="flex flex-col items-center w-full max-w-sm">
          {/* Modal Card - Square */}
          <div
            ref={modalRef}
            className="bg-white rounded-3xl overflow-y-auto w-full shadow-2xl pointer-events-auto"
            style={{
              maxHeight: 'calc(100vh - 180px)',
              transform: 'translateY(100%)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Content */}
            <div className="px-3 py-4">
              {/* Categories Grid - 3 columns */}
              <div className="grid grid-cols-3 gap-2">
                {categories.map((category) => (
                  <div
                    key={category.id}
                    className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform"
                    onClick={() => handleCategoryClick(category)}
                  >
                    <div className="relative w-full aspect-square max-w-[80px] mx-auto rounded-lg overflow-hidden mb-1" style={{ backgroundColor: '#f5f5f5' }}>
                      {category.image ? (
                        <img
                          src={category.image}
                          alt={category.title}
                          className="w-full h-full object-cover"
                          loading="lazy"
                          decoding="async"
                        />
                      ) : category.icon ? (
                        <div className="w-full h-full flex items-center justify-center">
                          {category.icon}
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-gray-400 text-[8px]">Image</span>
                        </div>
                      )}
                      {category.badge && (
                        <div className="absolute top-0.5 left-0.5 bg-green-500 text-white text-[8px] font-semibold px-1.5 py-0.5 rounded">
                          {category.badge}
                        </div>
                      )}
                    </div>
                    {/* Text stacked vertically */}
                    <div className="flex flex-col items-center">
                      {category.title.split(' ').map((word, index) => (
                        <span key={index} className="text-[10px] text-center text-gray-700 font-medium leading-tight">
                          {word}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Close Button - Below Modal */}
          <div className="mt-4 z-[60] pointer-events-auto">
            <button
              onClick={handleClose}
              className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors border border-gray-200"
            >
              <FiX className="w-5 h-5 text-gray-800" />
            </button>
          </div>
        </div>
      </div>
      </>
    );
});

MenuModal.displayName = 'MenuModal';

export default MenuModal;

