import React from 'react';
import homepageBanner from '../../../../../assets/images/pages/Home/Banner/homepage-banner.png';
import { optimizeCloudinaryUrl } from '../../../../../utils/cloudinaryOptimize';

const Banner = React.memo(({ imageUrl, onClick }) => {
  // Optimize Cloudinary URLs for faster loading
  const optimizedUrl = imageUrl ? optimizeCloudinaryUrl(imageUrl, { quality: 'auto' }) : homepageBanner;

  return (
    <div className="mb-6 px-4 cursor-pointer group" onClick={onClick}>
      <div className="relative w-full aspect-[16/8.5] sm:aspect-[21/9] rounded-2xl sm:rounded-3xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:scale-[1.01] active:scale-[0.98] border border-black/[0.04] shadow-[0_4px_20px_rgba(0,0,0,0.06)] bg-slate-100">
        <img
          src={optimizedUrl}
          alt="Banner"
          className="w-full h-full object-cover object-center"
          loading="lazy"
          decoding="async"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none" />
      </div>
    </div>
  );
});

Banner.displayName = 'Banner';

export default Banner;
