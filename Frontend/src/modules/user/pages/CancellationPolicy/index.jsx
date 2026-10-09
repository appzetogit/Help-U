import React, { useLayoutEffect, useState, useEffect } from 'react'; // Added hooks
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiAlertCircle, FiClock, FiCheckCircle, FiInfo } from 'react-icons/fi';
import { themeColors } from '../../../../theme';
import { configService } from '../../../../services/configService'; // Import service

const CancellationPolicy = () => {
  const navigate = useNavigate();
  const [fees, setFees] = useState({
    penalty: 49,
    visitingCharges: 49
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await configService.getSettings();
        if (res.success && res.settings) {
          setFees({
            penalty: res.settings.cancellationPenalty || 49,
            visitingCharges: res.settings.visitedCharges || 49
          });
        }
      } catch (error) {
        console.error('Failed to fetch settings:', error);
      }
    };
    fetchSettings();
  }, []);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white sticky top-0 z-40 border-b border-gray-100 shadow-sm">
        <div className="px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiArrowLeft className="w-6 h-6 text-gray-800" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Cancellation Policy</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Key Policy Highlights with Icons */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mb-3">
              <FiCheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">Free Cancellation</h3>
            <p className="text-xs text-gray-500 font-medium">Until professional is assigned</p>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col items-center text-center">
            <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center mb-3">
              <FiClock className="w-6 h-6 text-orange-600" />
            </div>
            <h3 className="font-bold text-gray-900 mb-1">Late Fee</h3>
            <p className="text-xs text-gray-500 font-medium">If cancelled after assignment</p>
          </div>
        </div>

        {/* Detailed Timeline Visualization */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 overflow-hidden relative">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Cancellation Timeline</h2>

          <div className="relative pl-8 space-y-8 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">

            {/* Stage 1 */}
            <div className="relative">
              <span className="absolute -left-8 w-8 h-8 rounded-full bg-green-500 border-4 border-white shadow-sm flex items-center justify-center z-10">
                <FiCheckCircle className="w-4 h-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Before Journey Start</h3>
                <p className="text-xs text-gray-500 mt-1 mb-2">Any time before professional starts travel</p>
                <div className="inline-block px-3 py-1 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100">
                  Full Refund • No Fee
                </div>
              </div>
            </div>

            {/* Stage 2 */}
            <div className="relative">
              <span className="absolute -left-8 w-8 h-8 rounded-full bg-orange-400 border-4 border-white shadow-sm flex items-center justify-center z-10">
                <FiClock className="w-4 h-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Journey Started</h3>
                <p className="text-xs text-gray-500 mt-1 mb-2">When professional is on the way</p>
                <div className="inline-block px-3 py-1 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg border border-orange-100">
                  ₹{fees.penalty} Cancellation Penalty Applies
                </div>
              </div>
            </div>

            {/* Stage 3 */}
            <div className="relative">
              <span className="absolute -left-8 w-8 h-8 rounded-full bg-red-500 border-4 border-white shadow-sm flex items-center justify-center z-10">
                <FiAlertCircle className="w-4 h-4 text-white" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Professional Arrived</h3>
                <p className="text-xs text-gray-500 mt-1 mb-2">When professional reaches your location</p>
                <div className="inline-block px-3 py-1 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-100">
                  ₹{fees.visitingCharges} Visiting Charges Apply
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Fee Breakdown */}
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-50 rounded-xl">
              <FiInfo className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Why do we charge a fee?</h2>
              <p className="text-xs text-gray-500">To support our professionals time & effort</p>
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-xl text-sm text-gray-600 leading-relaxed border border-gray-100">
            Our service partners reserve their time exclusively for your booking and may travel significant distances. The cancellation fee compensates them for their lost time and travel expenses if a confirmed booking is cancelled last minute.
          </div>
        </div>

        {/* Reschedule Option */}
        <div className="bg-gradient-to-r from-teal-50 to-emerald-50 rounded-3xl p-6 border border-teal-100">
          <h3 className="font-bold text-teal-900 mb-2">Need to change plans?</h3>
          <p className="text-sm text-teal-700 mb-4 opacity-90">
            Instead of cancelling, you can reschedule your booking for free up to 2 hours before the service time.
          </p>
          <button
            onClick={() => navigate(-1)}
            className="w-full py-3 bg-white text-teal-700 font-bold rounded-xl shadow-sm border border-teal-200 active:scale-95 transition-all"
          >
            Go Back to Booking
          </button>
        </div>

      </main>
    </div>
  );
};

export default CancellationPolicy;
