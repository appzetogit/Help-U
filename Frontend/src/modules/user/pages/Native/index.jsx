import React, { useState } from 'react';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import NativeSmartLocks from './components/NativeSmartLocks';
import NativeROPurifiers from './components/NativeROPurifiers';
import BestInClassFeatures from './components/BestInClassFeatures';
import TestimonialsSection from './components/TestimonialsSection';
import BrandPhilosophy from './components/BrandPhilosophy';

const Native = () => {
  const [location, setLocation] = useState('...');

  // Auto-detect location on mount
  React.useEffect(() => {
    const autoDetectLocation = async () => {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            try {
              const { latitude, longitude } = position.coords;
              const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
              const response = await fetch(
                `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`
              );
              const data = await response.json();

              if (data.status === 'OK' && data.results.length > 0) {
                const result = data.results[0];
                const getComponent = (type) =>
                  result.address_components.find(c => c.types.includes(type))?.long_name || '';

                const area = getComponent('sublocality_level_1') || getComponent('neighborhood') || getComponent('locality');
                const city = getComponent('locality') || getComponent('administrative_area_level_2');
                const state = getComponent('administrative_area_level_1');

                const formattedAddress = `${area}- ${city}- ${state}`;
                setLocation(formattedAddress);
              }
            } catch (error) {
            }
          },
          (error) => {
          }
        );
      }
    };

    autoDetectLocation();
  }, []);
  const [cartCount] = useState(0);

  const handleLocationClick = () => {
  };

  const handleCartClick = () => {
  };

  const handleKnowMoreClick = (productType) => {
  };

  const handleFeatureClick = (feature) => {
  };

  return (
    <div className="min-h-screen bg-white pb-20">
      <Header
        location={location}
        cartCount={cartCount}
        onLocationClick={handleLocationClick}
        onCartClick={handleCartClick}
      />

      <main className="pt-1">
        <BestInClassFeatures onFeatureClick={handleFeatureClick} />
        <NativeSmartLocks onKnowMoreClick={handleKnowMoreClick} />
        <NativeROPurifiers onKnowMoreClick={handleKnowMoreClick} />
        <TestimonialsSection />
        <BrandPhilosophy />
      </main>

      <BottomNav />
    </div>
  );
};

export default Native;

