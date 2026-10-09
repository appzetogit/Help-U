import React, { useState } from 'react';
import { FiCheckCircle, FiPlus } from 'react-icons/fi';
import { MdQrCode } from 'react-icons/md';

const ScanAndPayModal = ({ 
  isOpen, 
  onClose, 
  qrImageUrl, 
  amount, 
  onCheckStatus,
  onSwitchToOtp
}) => {
  const [isZoomed, setIsZoomed] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <div className="bg-white w-full max-w-sm rounded-[2.5rem] overflow-hidden shadow-2xl relative animate-in zoom-in-95 duration-200">
          <div className="p-8 pb-4 text-center">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <MdQrCode className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-black text-gray-900 mb-1">Scan & Pay</h2>
            <p className="text-xs text-gray-500 mb-4 font-medium">
              Pay <span className="font-black text-gray-900">₹{amount.toFixed(2)}</span>
            </p>

            <div
              className="bg-gray-50 rounded-3xl overflow-hidden mb-6 border border-gray-100 shadow-inner transition-transform active:scale-95 cursor-zoom-in relative group"
              onClick={() => setIsZoomed(true)}
            >
              <img
                src={qrImageUrl}
                alt="Payment QR"
                className="w-full h-auto max-h-[400px] mx-auto mix-blend-multiply object-contain block"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                <span className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-gray-600 bg-white/90 px-3 py-1.5 rounded-full shadow-sm border border-gray-100">Click to Full Screen</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={onCheckStatus}
                className="w-full py-3.5 bg-gray-900 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 text-sm"
              >
                <FiCheckCircle className="w-4 h-4" />
                Paid? Check Status
              </button>

              {onSwitchToOtp && (
                <button
                  onClick={onSwitchToOtp}
                  className="w-full py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-2xl font-bold transition-all text-xs flex items-center justify-center gap-2 border border-emerald-200 active:scale-95"
                >
                  <FiCheckCircle className="w-4 h-4 text-emerald-600" />
                  Or Verify via Customer OTP
                </button>
              )}
              
              <button
                onClick={onClose}
                className="w-full py-2 text-gray-500 font-bold hover:text-gray-700 transition-colors text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Zoom */}
      {isZoomed && (
        <div 
          className="fixed inset-0 z-[300] bg-black/95 backdrop-blur-3xl flex flex-col items-center justify-center p-4 animate-in fade-in duration-300"
          onClick={() => setIsZoomed(false)}
        >
          <div className="relative w-full max-w-xl flex flex-col items-center animate-in zoom-in-95 duration-300">
            <div className="bg-white p-4 rounded-[2rem] shadow-2xl w-full mb-6 text-center">
               <img 
                src={qrImageUrl} 
                alt="Zoomed QR" 
                className="w-full h-auto max-h-[80vh] object-contain rounded-xl block mx-auto"
              />
            </div>
            
            <div className="text-center text-white mb-8">
              <p className="text-2xl font-black mb-1">Scan to Pay</p>
              <p className="text-gray-400 font-black text-xl">₹{amount.toFixed(2)}</p>
            </div>

            <button 
              className="px-8 py-3 bg-white text-black rounded-full font-black flex items-center gap-2 active:scale-95 transition-transform shadow-xl"
              onClick={() => setIsZoomed(false)}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default ScanAndPayModal;
