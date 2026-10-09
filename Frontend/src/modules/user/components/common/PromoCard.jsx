import React, { memo } from 'react';
import OptimizedImage from '../../../../components/common/OptimizedImage';
import OptimizedVideo from '../../../../components/common/OptimizedVideo';

const PromoCard = memo(({ title, subtitle, buttonText, image, onClick, className = '' }) => {
  const isVideo = image && (
    image.includes('video/upload') ||
    image.match(/\.(mp4|webm|ogg|mov)$|^https:\/\/res\.cloudinary\.com.*\/video\//i)
  );

  return (
    <div
      className={`relative rounded-2xl sm:rounded-3xl overflow-hidden w-[calc(100vw-36px)] sm:w-[380px] md:w-[420px] aspect-[16/8.5] max-h-56 cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] border border-black/[0.04] shadow-[0_4px_20px_rgba(0,0,0,0.06)] bg-slate-100 flex-shrink-0 ${className}`}
      onClick={onClick}
    >
      {image ? (
        isVideo ? (
          <OptimizedVideo
            src={image}
            className="w-full h-full object-cover object-center"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <OptimizedImage
            src={image}
            alt={title || 'Promo'}
            className="w-full h-full object-cover object-center"
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-100">
          <span className="text-gray-400 text-sm font-medium">Help U Banner</span>
        </div>
      )}
    </div>
  );
});

PromoCard.displayName = 'PromoCard';

export default PromoCard;
