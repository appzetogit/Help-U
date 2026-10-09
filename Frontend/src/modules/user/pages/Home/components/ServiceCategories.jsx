import React, { useState } from 'react';
import CategoryCard from '../../../components/common/CategoryCard';
import electricianIcon from '../../../../../assets/images/icons/services/electrician.png';
import womensSalonIcon from '../../../../../assets/images/icons/services/womens-salon-spa-icon.png';
import massageMenIcon from '../../../../../assets/images/icons/services/massage-men-icon.png';
import cleaningIcon from '../../../../../assets/images/icons/services/cleaning-icon.png';
import electricianPlumberIcon from '../../../../../assets/images/icons/services/electrician-plumber-carpenter-icon.png';
import acApplianceRepairIcon from '../../../../../assets/images/icons/services/ac-appliance-repair-icon.png';

const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

const ServiceCategories = React.memo(({ categories, onCategoryClick, onSeeAllClick }) => {


  if (!Array.isArray(categories) || categories.length === 0) {
    return null;
  }

  const serviceCategories = categories.map((cat) => ({
    ...cat,
    icon: toAssetUrl(cat.icon || cat.image),
  }));

  const [isExpanded, setIsExpanded] = useState(false);
  const displayCategories = isExpanded ? serviceCategories : serviceCategories.slice(0, 7);
  const showMoreButton = !isExpanded && serviceCategories.length > 7;

  return (
    <div className="px-5">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-col">
          <h2 className="text-[20px] font-black text-gray-900 tracking-tight flex items-center gap-2">
            Service Categories
            <div className="w-2 h-2 bg-primary-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(40,116,240,0.5)]"></div>
          </h2>
          <p className="text-[11px] text-gray-400 font-bold uppercase tracking-[0.15em] -mt-0.5">Premium Home Services</p>
        </div>

      </div>

      {/* Professional Grid Layout in White Container */}
      <div className="bg-white rounded-[24px] p-4 pb-4 shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100">
        <div className="grid grid-cols-4 gap-y-6 gap-x-2">
          {displayCategories.map((category, index) => {
            const iconSrc = toAssetUrl(category.icon || category.image);
            return (
              <div key={category.id || index} className="flex justify-center h-full">
                <CategoryCard
                  title={category.title}
                  icon={
                    <img
                      src={iconSrc}
                      alt={category.title}
                      className="w-12 h-12 object-contain group-hover:rotate-12 transition-transform duration-500 will-change-transform rounded-full"
                      loading="lazy"
                      decoding="async"
                    />
                  }
                  onClick={() => onCategoryClick?.(category)}
                  hasSaleBadge={category.hasSaleBadge}
                  index={index}
                />
              </div>
            );
          })}
          
          {/* More Services Button */}
          {showMoreButton && (
            <div className="flex justify-center h-full">
              <CategoryCard
                title="More Services"
                icon={
                  <div className="w-12 h-12 flex items-center justify-center rounded-full bg-teal-50">
                    <svg className="w-6 h-6 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  </div>
                }
                onClick={() => setIsExpanded(true)}
                index={7}
              />
            </div>
          )}
        </div>
      </div>

    </div>
  );
});

ServiceCategories.displayName = 'ServiceCategories';

export default ServiceCategories;

