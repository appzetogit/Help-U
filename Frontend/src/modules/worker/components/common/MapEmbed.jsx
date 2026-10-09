import React from 'react';

const MapEmbed = ({ lat, lng, address, height = '200px' }) => {
  // Google Maps Embed URL
  const mapUrl = `https://www.google.com/maps/embed/v1/place?key=YOUR_API_KEY&q=${lat},${lng}`;
  
  // Fallback: Use Google Maps search URL if API key not available
  const searchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || `${lat},${lng}`)}`;

  return (
    <div className="w-full rounded-xl overflow-hidden border-2 border-gray-200" style={{ height }}>
      {lat && lng ? (
        <iframe
          width="100%"
          height="100%"
          style={{ border: 0 }}
          loading="lazy"
          allowFullScreen
          referrerPolicy="no-referrer-when-downgrade"
          src={mapUrl}
          title="Location Map"
        />
      ) : (
        <a
          href={searchUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full h-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <div className="text-center p-4">
            <p className="text-gray-600 font-semibold mb-2">View on Google Maps</p>
            <p className="text-sm text-gray-500">{address}</p>
          </div>
        </a>
      )}
    </div>
  );
};

export default MapEmbed;

