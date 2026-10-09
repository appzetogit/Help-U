import React, { memo } from 'react';
import { AiFillStar } from 'react-icons/ai';
import { themeColors } from '../../../../theme';
import { optimizeCloudinaryUrl } from '../../../../utils/cloudinaryOptimize';

const ServiceWithRatingCard = memo(({ image, title, rating, reviews, price, originalPrice, discount, onClick, onAddClick }) => {
  const formatPrice = (p) => {
    if (!p) return null;
    const clean = p.toString().replace(/[^0-9]/g, '');
    return clean ? new Intl.NumberFormat('en-IN').format(clean) : null;
  };

  const displayPrice = formatPrice(price);
  const displayOriginalPrice = formatPrice(originalPrice);

  return (
    <div
      onClick={onClick}
      className="min-w-[165px] sm:min-w-[180px] w-[165px] sm:w-[180px] flex-shrink-0 bg-white rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_10px_25px_-4px_rgba(22,59,102,0.12)] hover:-translate-y-1 active:scale-[0.98] border border-gray-100 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.04)] group flex flex-col justify-between"
    >
      {/* Top Image Section */}
      <div className="relative h-32 sm:h-36 w-full overflow-hidden bg-gray-50">
        {discount && (
          <div
            className="absolute top-2.5 left-2.5 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full shadow-sm z-10 uppercase tracking-wide"
            style={{ backgroundColor: themeColors.button || '#163B66' }}
          >
            {discount.toString().toUpperCase().includes('OFF') ? discount : `${discount} OFF`}
          </div>
        )}
        {image ? (
          <img
            src={optimizeCloudinaryUrl(image, { width: 380, quality: 'auto', crop: 'fill' })}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gray-50 border-b border-gray-100">
            <img
              src="/helpu-logo.png"
              alt="Placeholder"
              className="w-12 h-12 object-contain opacity-40 grayscale"
            />
          </div>
        )}
      </div>

      {/* Card Content Area */}
      <div className="p-3 flex flex-col flex-1 justify-between bg-white">
        <div>
          <h3
            className="text-[13px] sm:text-[13.5px] font-bold text-gray-900 leading-snug line-clamp-2 min-h-[38px] group-hover:text-[#163B66] transition-colors"
            title={title}
          >
            {title}
          </h3>

          {rating && (
            <div className="flex items-center gap-1 mt-1.5 mb-0.5">
              <AiFillStar className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs text-gray-900 font-bold">{rating}</span>
              {reviews && (
                <span className="text-[10.5px] text-gray-400 font-medium">({reviews})</span>
              )}
            </div>
          )}
        </div>

        {/* Pricing & Add Button Row */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[14px] sm:text-[15px] font-extrabold text-gray-900">
                {displayPrice ? `₹${displayPrice}` : (price || 'Custom')}
              </span>
              {displayOriginalPrice && (
                <span className="text-[10.5px] text-gray-400 line-through decoration-gray-400/60">
                  ₹{displayOriginalPrice}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddClick?.();
            }}
            className="px-3.5 py-1 h-7.5 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all duration-200 border shadow-sm active:scale-95 flex items-center justify-center"
            style={{
              backgroundColor: `${themeColors.brand?.teal || '#163B66'}0A`,
              color: themeColors.button || '#163B66',
              borderColor: `${themeColors.brand?.teal || '#163B66'}20`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = themeColors.button || '#163B66';
              e.currentTarget.style.color = '#FFFFFF';
              e.currentTarget.style.borderColor = themeColors.button || '#163B66';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = `${themeColors.brand?.teal || '#163B66'}0A`;
              e.currentTarget.style.color = themeColors.button || '#163B66';
              e.currentTarget.style.borderColor = `${themeColors.brand?.teal || '#163B66'}20`;
            }}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
});

ServiceWithRatingCard.displayName = 'ServiceWithRatingCard';

export default ServiceWithRatingCard;


