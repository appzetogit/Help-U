import React, { useRef, useState, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { AiFillStar } from 'react-icons/ai';
import { themeColors } from '../../../../../theme';
import { optimizeCloudinaryUrl } from '../../../../../utils/cloudinaryOptimize';

const NewAndNoteworthy = React.memo(({ services, onServiceClick }) => {
  const serviceList = (services || []).filter(s => s.title && s.image);
  const scrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 10);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [serviceList]);

  const handleScroll = (direction) => {
    if (scrollRef.current) {
      const scrollAmount = 240;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (serviceList.length === 0) {
    return null;
  }

  const formatPrice = (p) => {
    if (!p) return null;
    const clean = p.toString().replace(/[^0-9]/g, '');
    return clean ? new Intl.NumberFormat('en-IN').format(clean) : null;
  };

  return (
    <div className="px-4 sm:px-5 py-2">
      {/* Clean Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            New and noteworthy
          </h2>
        </div>

        {/* Minimal Scroll Controls for Desktop */}
        <div className="hidden sm:flex items-center gap-1">
          <button
            onClick={() => handleScroll('left')}
            disabled={!canScrollLeft}
            aria-label="Previous"
            className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
              canScrollLeft
                ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm'
                : 'bg-transparent border-transparent text-gray-300 cursor-default'
            }`}
          >
            <FiChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleScroll('right')}
            disabled={!canScrollRight}
            aria-label="Next"
            className={`w-7 h-7 rounded-full flex items-center justify-center border transition-all ${
              canScrollRight
                ? 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 shadow-sm'
                : 'bg-transparent border-transparent text-gray-300 cursor-default'
            }`}
          >
            <FiChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Clean Card Carousel */}
      <div
        ref={scrollRef}
        onScroll={checkScroll}
        className="flex gap-3 overflow-x-auto pb-2 pt-0.5 scrollbar-hide scroll-smooth -mx-4 px-4 sm:mx-0 sm:px-0"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {serviceList.map((service, index) => {
          const displayPrice = formatPrice(service.price);
          const rating = service.rating;

          return (
            <div
              key={service.id || index}
              onClick={() => onServiceClick?.(service)}
              className="min-w-[150px] sm:min-w-[170px] max-w-[180px] flex-shrink-0 bg-white rounded-2xl p-2 border border-gray-100/80 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.04)] hover:shadow-[0_8px_20px_-4px_rgba(22,59,102,0.12)] hover:-translate-y-1 active:scale-[0.98] transition-all duration-300 cursor-pointer group flex flex-col justify-between"
            >
              {/* Image Container */}
              <div className="relative h-28 sm:h-32 w-full rounded-xl overflow-hidden bg-gray-50">
                <img
                  src={optimizeCloudinaryUrl(service.image, { width: 360, quality: 'auto', crop: 'fill' })}
                  alt={service.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                  loading="lazy"
                  decoding="async"
                />

                {/* Only show badge if explicitly configured */}
                {service.badge && (
                  <span className="absolute top-2 left-2 text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-black/70 text-white backdrop-blur-sm">
                    {service.badge}
                  </span>
                )}
              </div>

              {/* Title & Info */}
              <div className="pt-2 px-1 flex flex-col flex-1 justify-between">
                <h3 className="text-[13px] font-semibold text-gray-900 group-hover:text-[#163B66] transition-colors leading-snug line-clamp-2 min-h-[36px]">
                  {service.title}
                </h3>

                {/* Bottom clean meta row: rating / price if available */}
                {(rating || displayPrice) && (
                  <div className="flex items-center justify-between mt-1.5 pt-1 text-[11px] text-gray-600">
                    {rating && (
                      <div className="flex items-center gap-0.5 text-gray-800 font-medium">
                        <AiFillStar className="w-3 h-3 text-amber-500" />
                        <span>{rating}</span>
                      </div>
                    )}
                    {displayPrice && (
                      <span className="font-bold text-gray-900 ml-auto">
                        ₹{displayPrice}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

NewAndNoteworthy.displayName = 'NewAndNoteworthy';

export default NewAndNoteworthy;



