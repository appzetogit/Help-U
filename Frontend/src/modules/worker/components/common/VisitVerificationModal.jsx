import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { FiX, FiCheckCircle } from 'react-icons/fi';
import { verifySelfVisit } from '../../services/bookingService';
import flutterBridge from '../../../../utils/flutterBridge';
import LocationAccessModal from '../../../../components/common/LocationAccessModal';

/**
 * Reusable Visit Verification Modal
 * Used for OTP-based arrival verification by workers
 * 
 * @param {boolean} isOpen - Whether modal is visible
 * @param {function} onClose - Callback to close modal
 * @param {string} bookingId - The booking ID to verify
 * @param {function} onSuccess - Callback on successful verification
 */
const VisitVerificationModal = ({ isOpen, onClose, bookingId, onSuccess }) => {
  const [otpInput, setOtpInput] = useState(['', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [userType, setUserType] = useState('worker');

  // Detect user type
  React.useEffect(() => {
    const workerData = JSON.parse(localStorage.getItem('workerData') || '{}');
    if (workerData._id || workerData.id) setUserType('worker');
  }, []);

  // Auto-verify as last digit enters
  React.useEffect(() => {
    const otpValue = otpInput.join('');
    if (otpValue.length === 4 && !loading && isOpen) {
      handleVerify();
    }
  }, [otpInput]);

  const handleOtpChange = (index, value) => {
    const sanitized = value.replace(/[^0-9]/g, '');
    if (sanitized.length > 1) return;

    const newOtp = [...otpInput];
    newOtp[index] = sanitized;
    setOtpInput(newOtp);

    // Auto-focus next input
    if (sanitized && index < 3) {
      document.getElementById(`visit-otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpInput[index] && index > 0) {
      document.getElementById(`visit-otp-${index - 1}`)?.focus();
    }
  };

  /**
   * Use robust Native Bridge with Browser Fallback
   */
  const getPosition = async () => {
    try {
      const location = await flutterBridge.getCurrentLocation();
      return location;
    } catch (error) {
      console.error("[VisitVerification] Location fetching failed:", error);
      throw error;
    }
  };

  const handleVerify = async () => {
    const otp = otpInput.join('');
    if (otp.length !== 4) {
      toast.error('Please enter 4-digit OTP');
      return;
    }

    setLoading(true);

    if (!navigator.geolocation) {
      toast.error('Geolocation is required for verification');
      setLoading(false);
      return;
    }

    try {
      const locationData = await getPosition();
      const location = {
        lat: locationData.latitude,
        lng: locationData.longitude
      };

      const response = await verifySelfVisit(bookingId, otp, location);

      if (response.success) {
        toast.success('Visit Verified Successfully!');
        setOtpInput(['', '', '', '']);
        onClose();
        onSuccess?.();
      } else {
        toast.error(response.message || 'Verification failed');
      }
    } catch (error) {
      console.error("Verification Error:", error);

      // Handle geolocation errors
      if (error.code === 1) {
        toast.error('Location permission denied. Requesting access...');
        setShowLocationModal(true);
      } else if (error.code === 2) {
        toast.error('Location unavailable. Check your GPS settings.');
      } else if (error.code === 3) {
        toast.error('Location timeout. Please try again.');
      } else {
        // API error or other
        toast.error(error.response?.data?.message || 'Verification failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLocationSuccess = async (coords) => {
    setShowLocationModal(false);
    const otp = otpInput.join('');
    if (otp.length !== 4) return;

    setLoading(true);
    try {
      const location = { lat: coords.latitude || coords.lat, lng: coords.longitude || coords.lng };
      const response = await verifySelfVisit(bookingId, otp, location);

      if (response.success) {
        toast.success('Visit Verified Successfully!');
        setOtpInput(['', '', '', '']);
        onClose();
        onSuccess?.();
      } else {
        toast.error(response.message || 'Verification failed');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setOtpInput(['', '', '', '']);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 25 }}
            className="bg-white w-full max-w-sm rounded-[24px] p-8 shadow-2xl relative z-10"
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900 leading-tight">
                  Verify Arrival
                </h3>
                <p className="text-xs text-teal-600 font-bold uppercase tracking-wider mt-1">
                  Check-in Verification
                </p>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 disabled:opacity-50"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>

            {/* Description */}
            <div className="mb-8">
              <p className="text-gray-500 font-medium leading-relaxed">
                Please enter the <span className="text-gray-900 font-bold">4-digit code</span> provided by the customer to confirm your arrival.
              </p>
            </div>

            {/* OTP Inputs */}
            <div className="flex justify-between gap-3 mb-8">
              {otpInput.map((digit, idx) => (
                <input
                  key={idx}
                  id={`visit-otp-${idx}`}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  autoFocus={idx === 0}
                  disabled={loading}
                  className={`w-14 h-16 text-center text-2xl font-bold rounded-2xl transition-all outline-none border-2 disabled:opacity-50
                    ${digit
                      ? 'border-teal-500 bg-teal-50 text-teal-900'
                      : 'border-gray-200 bg-gray-50 text-gray-800 focus:border-teal-400 focus:bg-white focus:shadow-lg focus:shadow-teal-100'
                    }`}
                  onChange={(e) => handleOtpChange(idx, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(idx, e)}
                />
              ))}
            </div>

            {/* Verify Button */}
            <button
              onClick={handleVerify}
              disabled={loading}
              className="w-full py-4 bg-teal-600 hover:bg-teal-700 text-white rounded-2xl font-bold text-lg shadow-xl shadow-teal-600/20 transition-all active:scale-[0.98] disabled:opacity-70 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {loading ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <FiCheckCircle className="w-5 h-5" />
                  <span>Verify & Start Work</span>
                </>
              )}
            </button>
          </motion.div>

          <LocationAccessModal
            isOpen={showLocationModal}
            onClose={() => setShowLocationModal(false)}
            onSuccess={handleLocationSuccess}
            userType={userType}
          />
        </div>
      )}
    </AnimatePresence>
  );
};

export default VisitVerificationModal;
