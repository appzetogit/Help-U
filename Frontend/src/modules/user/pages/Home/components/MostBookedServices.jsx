import React from 'react';
import DetailedServiceCard from '../../../components/common/DetailedServiceCard';

const MostBookedServices = React.memo(({ services, onServiceClick, onAddClick }) => {
  const serviceList = (services || []).filter(s => s.title && s.image);

  if (serviceList.length === 0) {
    return null;
  }

  return (
    <div className="px-4 sm:px-5">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-900 tracking-tight">
          Most booked services
        </h2>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide lg:grid lg:grid-cols-4 lg:gap-6 lg:overflow-visible">
        {serviceList.map((service, index) => (
          <DetailedServiceCard
            key={service.id || index}
            title={service.title}
            rating={service.rating}
            reviews={service.reviews}
            price={service.price}
            originalPrice={service.originalPrice}
            discount={service.discount}
            image={service.image}
            onClick={() => onServiceClick?.(service)}
            onAddClick={() => onAddClick?.(service)}
          />
        ))}
      </div>
    </div>
  );
});

MostBookedServices.displayName = 'MostBookedServices';

export default MostBookedServices;

