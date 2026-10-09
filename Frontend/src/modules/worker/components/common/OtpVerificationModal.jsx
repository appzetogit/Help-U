import React, { useState, useEffect, useRef } from 'react';
import { FiX, FiShield, FiSmartphone, FiMinimize2 } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';

const OtpVerificationModal = ({ isOpen, onClose, onVerify, loading }) => {
  const [otp, setOtp] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setOtp('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (otp.length === 4) {
      onVerify(otp);
    }
  }, [otp, onVerify]);

  // Clear OTP on failure (when loading finishes and modal is still open)
  const prevLoading = useRef(loading);
  useEffect(() => {
    if (prevLoading.current && !loading && isOpen) {
      setOtp('');
      inputRef.current?.focus();
    }
    prevLoading.current = loading;
  }, [loading, isOpen]);

  const handleChange = (e) => {
    const val = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
    setOtp(val);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 40 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 40 }}
          className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)] relative"
        >
          {/* Header */}
          <div className="relative h-28 bg-gradient-to-br from-blue-600 to-indigo-700 flex flex-col items-center justify-center">
            <div className="absolute inset-0 opacity-20 pointer-events-none">
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute -top-10 -left-10 w-40 h-40 bg-white rounded-full"
              />
            </div>

            <button
              onClick={onClose}
              className="absolute top-4 right-4 z-50 p-2 bg-black/20 hover:bg-black/30 backdrop-blur-md rounded-full text-white transition-all active:scale-95"
            >
              <FiMinimize2 className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 bg-white/10 backdrop-blur-xl rounded-xl border border-white/20 flex items-center justify-center shadow-lg mb-2">
              <FiShield className="w-6 h-6 text-white" />
            </div>
            <h2 className="text-white text-lg font-black tracking-tight">Payment Verification</h2>
          </div>

          {/* Body */}
          <div className="px-6 py-8">
            <div className="text-center mb-6">
              <p className="text-gray-500 text-sm font-medium">
                Enter the 4-digit code sent to the customer
              </p>
            </div>

            <div className="flex justify-center mb-8">
              <input
                ref={inputRef}
                type="number"
                value={otp}
                onChange={handleChange}
                disabled={loading}
                placeholder="0000"
                className="w-full text-center bg-gray-50 border border-gray-200 rounded-2xl py-4 text-4xl font-black tracking-[0.5em] text-gray-900 outline-none focus:ring-4 focus:ring-blue-100 focus:border-blue-500 transition-all placeholder:text-gray-200"
              />
            </div>

            <div className="flex justify-center">
              {loading ? (
                <div className="text-blue-600 font-bold animate-pulse">Verifying...</div>
              ) : (
                <div className="text-xs text-center text-gray-400">
                  Auto-verifying on entry
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default OtpVerificationModal;
