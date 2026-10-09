import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FiAlertTriangle, FiX } from 'react-icons/fi';
import { getWalletBalance } from '../../services/walletService';

const CashLimitModal = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [show, setShow] = useState(false);
  const [walletData, setWalletData] = useState(null);

  const checkLimit = async () => {
    try {
      // Check if user is logged in before making the call
      const token = sessionStorage.getItem('workerAccessToken') || localStorage.getItem('workerAccessToken');
      if (!token) return;

      const wallet = await getWalletBalance();
      if (wallet) {
        setWalletData(wallet);
      }
    } catch (error) {
      // Silent fail
      console.warn('CashLimitModal: Failed to fetch wallet balance', error.message);
    }
  };

  // Initial Check & Interval
  useEffect(() => {
    checkLimit();
    const interval = setInterval(checkLimit, 30000);
    return () => clearInterval(interval);
  }, []);

  // Show modal based on data & Re-show on navigation
  useEffect(() => {
    if (walletData) {
      const dues = walletData.dues || 0;
      const limit = walletData.cashLimit || 10000;

      if (dues > limit) {
        setShow(true);
      } else {
        setShow(false);
      }
    }
  }, [location.pathname, walletData]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center animate-bounce-in relative">
        <button
          onClick={() => setShow(false)}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <FiX className="w-5 h-5 text-gray-400" />
        </button>

        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <FiAlertTriangle className="w-8 h-8 text-red-600" />
        </div>

        <h2 className="text-xl font-bold text-gray-900 mb-2">Service Suspended</h2>

        <p className="text-gray-600 mb-6 text-sm">
          You have reached your cash collection limit. Please settle your dues with the admin to resume receiving new bookings.
        </p>

        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-6">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">Outstanding Dues:</span>
            <span className="font-bold text-red-700">₹{walletData?.dues}</span>
          </div>
          <div className="flex justify-between items-center text-sm mt-1">
            <span className="text-gray-600">Limit:</span>
            <span className="font-bold text-gray-800">₹{walletData?.cashLimit}</span>
          </div>
        </div>

        <button
          onClick={() => {
            setShow(false);
            navigate('/worker/wallet/settle');
          }}
          className="w-full py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-200 hover:bg-red-700 transition-all active:scale-95"
        >
          Pay Now / Settle Dues
        </button>
      </div>
    </div>
  );
};

export default CashLimitModal;
