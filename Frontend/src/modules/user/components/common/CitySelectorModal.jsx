import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HiX, HiLocationMarker, HiCheck } from 'react-icons/hi';
import { themeColors } from '../../../../theme';
import { useCity } from '../../../../context/CityContext';

const CitySelectorModal = ({ isOpen, onClose }) => {
  const { cities, currentCity, selectCity } = useCity();
  const modalRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modalRef.current && !modalRef.current.contains(event.target)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleCitySelect = (city) => {
    selectCity(city);
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4"
          >
            <div
              ref={modalRef}
              className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
              style={{ maxHeight: '80vh' }}
            >
              {/* Header */}
              <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Select City</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Where would you like to find services?</p>
                </div>
                <button
                  onClick={onClose}
                  className="p-2 rounded-full hover:bg-gray-100 transition-colors text-gray-500"
                >
                  <HiX className="w-5 h-5" />
                </button>
              </div>

              {/* City List */}
              <div className="overflow-y-auto p-2" style={{ maxHeight: 'calc(80vh - 80px)' }}>
                <div className="grid gap-2">
                  {cities.map((city) => {
                    const isSelected = currentCity && (currentCity._id === city._id || currentCity.id === city.id);

                    return (
                      <button
                        key={city._id || city.id}
                        onClick={() => handleCitySelect(city)}
                        className={`
                        w-full text-left p-4 rounded-xl flex items-center justify-between group transition-all duration-200
                        ${isSelected
                            ? 'bg-gradient-to-r from-teal-50 to-emerald-50 border border-teal-100 shadow-sm'
                            : 'hover:bg-gray-50 border border-transparent hover:border-gray-100'
                          }
                      `}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`
                          w-10 h-10 rounded-full flex items-center justify-center transition-colors
                          ${isSelected ? 'bg-white shadow-sm' : 'bg-gray-100 group-hover:bg-white group-hover:shadow-sm'}
                        `}>
                            <HiLocationMarker className={`
                            w-5 h-5 
                            ${isSelected ? 'text-teal-600' : 'text-gray-400 group-hover:text-teal-500'}
                          `} />
                          </div>
                          <div>
                            <div className={`font-semibold ${isSelected ? 'text-teal-900' : 'text-gray-700'}`}>
                              {city.name}
                            </div>
                            {city.state && (
                              <div className="text-xs text-gray-400 mt-0.5">
                                {city.state}
                              </div>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-white shadow-sm">
                            <HiCheck className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                {cities.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <p>No cities available at the moment.</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CitySelectorModal;
