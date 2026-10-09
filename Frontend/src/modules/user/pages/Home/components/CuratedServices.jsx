import React from 'react';
import ServiceCard from '../../../components/common/ServiceCard';

const CuratedServices = React.memo(({ services, onServiceClick }) => {
  const serviceList = (services || []).filter(s => s.title && (s.gif || s.youtubeUrl));

  if (serviceList.length === 0) {
    return null;
  }

  return (
    <div className="px-4 sm:px-5">
      {/* Title Section */}
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-0.5 text-gray-900 tracking-tight">
          Thoughtful curations
        </h2>
        <p className="text-xs font-medium text-gray-500">
          of our finest experiences
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible">
        {serviceList.map((service, index) => (
          <ServiceCard
            key={service.id || index}
            title={service.title}
            gif={service.gif}
            youtubeUrl={service.youtubeUrl}
            onClick={() => onServiceClick?.(service)}
          />
        ))}
      </div>
    </div>
  );
});

CuratedServices.displayName = 'CuratedServices';

export default CuratedServices;

