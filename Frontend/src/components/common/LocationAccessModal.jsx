import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMapPin, FiNavigation, FiX, FiCheckCircle, FiShield, FiSettings } from 'react-icons/fi';
import { themeColors } from '../../theme';
import { toast } from 'react-hot-toast';
import flutterBridge from '../../utils/flutterBridge';

const LocationAccessModal = ({
  isOpen,
  onClose,
  onSuccess,
  onManualSearch,
  initialLocationDisabled = false,
  userType = 'user' // 'user' | 'worker'
}) => {
  const [requesting, setRequesting] = useState(false);
  const [locationDisabled, setLocationDisabled] = useState(initialLocationDisabled);

  const getTheme = () => {
    switch (userType) {
      case 'worker': return themeColors.worker || themeColors;
      default: return themeColors.user || themeColors;
    }
  };

  const currentTheme = getTheme();
  const themeColor = currentTheme.button || '#00A6A6';

  const getContent = () => {
    if (locationDisabled) {
      return {
        title: "LOCATION IS OFF",
        subtitle: "Please turn on your GPS to continue using Help U features.",
        icon: FiSettings
      };
    }
    return {
      title: "ALLOW GPS LOCATION",
      subtitle: "Help U needs your location to show available services and workers near you.",
      icon: FiNavigation
    };
  };

  const content = getContent();

  const handleRequestLocation = async () => {
    setRequesting(true);
    setLocationDisabled(false);
    try {
      const location = await flutterBridge.getCurrentLocation();
      setRequesting(false);
      toast.success("Location access granted!");
      if (onSuccess) onSuccess(location);
      if (onClose) onClose();
    } catch (error) {
      setRequesting(false);
      let errorMsg = "Failed to get location";

      // HTML5 Geolocation API error codes
      // 1: PERMISSION_DENIED
      // 2: POSITION_UNAVAILABLE (often means GPS is off)
      // 3: TIMEOUT
      if (error.code === 1) {
        errorMsg = "Location permission denied. Please allow it.";
        setLocationDisabled(true);
      } else if (error.code === 2) {
        errorMsg = "Location information is unavailable. Is your GPS on?";
        setLocationDisabled(true);
      } else if (error.code === 3) {
        errorMsg = "Request timed out. Please try again.";
      }
      toast.error(errorMsg);
    }
  };

  const handleOpenSettings = () => {
    if (flutterBridge.isFlutter) {
      flutterBridge.openAppSettings();
      onClose();
    } else {
      toast("Please open your browser settings to allow location access.");
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          className="relative bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Decorative Header */}
          <div
            className="h-32 relative flex items-center justify-center overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${themeColor} 0%, ${themeColor}dd 100%)` }}
          >
            <div className="absolute inset-0 opacity-20">
              <div className="absolute top-0 left-0 w-32 h-32 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl" />
              <div className="absolute bottom-0 right-0 w-32 h-32 bg-white rounded-full translate-x-1/2 translate-y-1/2 blur-2xl" />
            </div>

            <motion.div
              animate={locationDisabled ? { rotate: [0, 10, -10, 0] } : { y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity }}
              className={`w-16 h-16 bg-white rounded-2xl shadow-xl flex items-center justify-center relative z-10 ${locationDisabled ? 'text-orange-500' : ''}`}
              style={{ color: locationDisabled ? '#f97316' : themeColor }}
            >
              <content.icon className="w-8 h-8" />
            </motion.div>
          </div>

          <div className="p-8 pt-6 text-center">
            <h3 className="text-2xl font-black text-gray-900 mb-2">{content.title}</h3>
            <p className="text-sm text-gray-500 mb-8 font-medium">{content.subtitle}</p>

            {/* Actions */}
            <div className="space-y-3">
              {locationDisabled ? (
                <button
                  onClick={handleOpenSettings}
                  className="w-full py-4 rounded-2xl bg-orange-500 text-white font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group mb-4"
                  style={{ boxShadow: '0 10px 25px -5px rgba(249, 115, 22, 0.4)' }}
                >
                  OPEN SYSTEM SETTINGS
                  <FiSettings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-500" />
                </button>
              ) : (
                <button
                  onClick={handleRequestLocation}
                  disabled={requesting}
                  className="w-full py-4 rounded-2xl text-white font-black text-lg shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 relative overflow-hidden group"
                  style={{
                    backgroundColor: themeColor,
                    boxShadow: `0 10px 25px -5px ${themeColor}55`
                  }}
                >
                  {requesting ? (
                    <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      ALLOW LOCATION ACCESS
                      <FiNavigation className="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                    </>
                  )}

                  {/* Shine effect */}
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-white/10 skew-y-[-10deg] -translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                </button>
              )}

              {onManualSearch && (
                <button
                  onClick={onManualSearch}
                  className="w-full py-3 rounded-2xl border border-gray-100 text-gray-400 font-bold text-xs hover:text-gray-600 transition-colors uppercase tracking-widest"
                >
                  Enter Location Manually
                </button>
              )}

              <button
                onClick={onClose}
                className="w-full py-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
              >
                Maybe Later
              </button>
            </div>

            <p className="mt-6 text-[10px] text-gray-400">
              Your location is protected and used only for service accuracy.
            </p>
          </div>

          {/* Close tiny button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <FiX className="w-4 h-4" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default LocationAccessModal;
