import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiX } from 'react-icons/fi';
import { themeColors } from '../../../../../theme';

const ServiceModal = ({ isOpen, onClose, service, location, cartCount }) => {
  const navigate = useNavigate();
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsClosing(false);
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300); // Match animation duration
  };

  if (!isOpen && !isClosing) return null;

  const handleServiceDetailClick = () => {
    handleClose();
    // Navigate to AC Service page if AC service is clicked
    if (service?.title === 'AC Service and Repair' || service?.title?.includes('AC')) {
      navigate('/user/ac-service');
    } else {
      // Navigate to other service detail pages
      // navigate(`/service/${service?.id}`);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity ${
          isClosing ? 'opacity-0' : 'opacity-100'
        }`}
        onClick={handleClose}
      />

      {/* Modal Container with Close Button */}
      <div className="fixed bottom-0 left-0 right-0 z-50">
        {/* Close Button - Above Modal */}
        <div className="absolute -top-12 right-4 z-[60]">
          <button
            onClick={handleClose}
            className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-50 transition-colors"
          >
            <FiX className="w-6 h-6 text-gray-800" />
          </button>
        </div>

        {/* Modal */}
        <div
          className={`bg-white rounded-t-3xl max-h-[90vh] overflow-y-auto ${
            isClosing ? 'animate-slide-down' : 'animate-slide-up'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Content */}
          <div className="px-4 py-6">
            {/* Title */}
            <h1 className="text-xl font-semibold text-black mb-6">{service?.title || 'Service'}</h1>

            {/* Service Image */}
            {service?.image && (
              <div className="mb-6">
                <img
                  src={service.image}
                  alt={service.title}
                  className="w-full h-48 object-cover rounded-xl"
                />
              </div>
            )}

            {/* Service Details */}
            <div className="mb-6">
              {service?.rating && (
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-lg font-bold text-black">{service.rating}</span>
                  <span className="text-sm text-gray-500">({service.reviews})</span>
                </div>
              )}

              {service?.price && (
                <div className="mb-4">
                  <div className="flex items-center gap-2">
                    {service.originalPrice && (
                      <span className="text-sm text-gray-400 line-through">₹{service.originalPrice}</span>
                    )}
                    <span className="text-2xl font-bold text-black">₹{service.price}</span>
                  </div>
                  {service.discount && (
                    <span className="inline-block bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded mt-2">
                      {service.discount} OFF
                    </span>
                  )}
                </div>
              )}

              {/* Book Now Button */}
              <button
                onClick={handleServiceDetailClick}
                className="w-full text-white font-semibold py-3 rounded-lg active:scale-98 transition-all"
                style={{ backgroundColor: themeColors.button }}
                onMouseEnter={(e) => e.target.style.backgroundColor = themeColors.button}
                onMouseLeave={(e) => e.target.style.backgroundColor = themeColors.button}
              >
                Book Now
              </button>
            </div>

            {/* Additional Info */}
            <div className="text-sm text-gray-600">
              <p>Select a time slot and book this service at your convenience.</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ServiceModal;

