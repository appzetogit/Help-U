import { createPortal } from 'react-dom';
import useModalLock from '../../../../hooks/useModalLock';
import React, { useState } from 'react';
import { FiX, FiTrash, FiCamera, FiDollarSign, FiCheckCircle } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import flutterBridge from '../../../../utils/flutterBridge';

const WorkCompletionModal = ({ isOpen, onClose, job, onComplete, loading }) => {
  useModalLock(isOpen);
  const [workPhotos, setWorkPhotos] = useState([]);
  const [beforePhotos, setBeforePhotos] = useState([]); // optional: how it looked before the work
  const beforeInputRef = React.useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const cameraInputRef = React.useRef(null);

  const handleNativeCamera = async () => {
    try {
      setIsUploading(true);
      const file = await flutterBridge.openCamera();
      if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setWorkPhotos(prev => [...prev, reader.result]);
          setIsUploading(false);
          flutterBridge.hapticFeedback('success');
        };
        reader.readAsDataURL(file);
      } else {
        setIsUploading(false);
      }
    } catch (error) {
      console.error('Native camera failed:', error);
      setIsUploading(false);
    }
  };

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    setIsUploading(true);
    const uploadPromises = files.map(file => {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    });

    Promise.all(uploadPromises).then(urls => {
      setWorkPhotos(prev => [...prev, ...urls]);
      setIsUploading(false);
    });
  };

  const handleBeforeUpload = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    Promise.all(files.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(file);
    }))).then((urls) => setBeforePhotos((prev) => [...prev, ...urls].slice(0, 3)));
    e.target.value = '';
  };

  const handleRemovePhoto = (index) => {
    setWorkPhotos(prev => prev.filter((_, i) => i !== index));
    flutterBridge.hapticFeedback('light');
  };

  const calculateTotal = () => {
    // For Plan Benefit, user only pays for Extra Charges
    if (job?.paymentMethod === 'plan_benefit') {
      return job?.extraChargesTotal || 0;
    }

    if (job?.bill?.grandTotal > 0) {
      return job.bill.grandTotal;
    }

    if (typeof job?.totals?.total === 'number' && job.totals.total > 0) {
      return job.totals.total;
    }

    const previous = typeof job?.finalAmount === 'number'
      ? job.finalAmount
      : ((job?.basePrice || 0) + (job?.tax || 0) - (job?.discount || 0) + (job?.visitingCharges || 0));

    const repairTotal = (job?.customerAddedServices || [])
      .filter(item => !item.isOther && Number(item.unitPrice) > 0)
      .reduce((sum, item) => {
        const base = (Number(item.unitPrice) || 0) * (Number(item.quantity) || 1);
        const gst = (base * 18) / 100;
        return sum + base + gst;
      }, 0);

    return Math.round((previous + repairTotal) * 100) / 100;
  };

  const showPhotoError = photoError && workPhotos.length === 0;

  const handleSubmit = () => {
    if (workPhotos.length === 0) {
      // Shown inside the modal: a toast would render behind it
      setPhotoError(true);
      flutterBridge.hapticFeedback('error');
      return;
    }
    // Typed so the booking can show before and after separately
    onComplete([
      ...beforePhotos.map((url) => ({ url, type: 'before' })),
      ...workPhotos.map((url) => ({ url, type: 'after' }))
    ]);
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="bg-white w-full max-w-md rounded-[24px] shadow-2xl relative z-10 overflow-hidden"
          >
            {/* Header */}
            <div className="px-8 pt-8 pb-4 flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-black text-gray-900 leading-tight">Complete Work</h3>
                <p className="text-xs text-green-600 font-bold uppercase tracking-wider mt-1">Final Step</p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-400 active:scale-95"
              >
                <FiX className="w-6 h-6" />
              </button>
            </div>

            <div className="px-8 pb-8 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">

              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                Please upload proof of work from your camera to confirm completion.
              </p>

              {/* Photo Upload Section */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Work Photos <span className="text-red-500 font-bold">(Mandatory)</span></p>
                  <span className="text-[10px] bg-red-50 text-red-500 px-2 py-0.5 rounded-md font-bold whitespace-nowrap">
                    {workPhotos.length}/5 (Min 1)
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {workPhotos.map((photo, index) => (
                    <div key={index} className="aspect-square rounded-2xl bg-gray-100 border border-gray-100 relative overflow-hidden group">
                      <img src={photo} className="w-full h-full object-cover" alt="work" />
                      <button
                        type="button"
                        onClick={() => handleRemovePhoto(index)}
                        aria-label="Remove photo"
                        className="absolute top-1 right-1 w-7 h-7 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white shadow-md active:scale-90 transition-transform"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  {workPhotos.length < 5 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (flutterBridge.isFlutter) {
                          handleNativeCamera();
                        } else {
                          cameraInputRef.current?.click();
                        }
                      }}
                      className={`aspect-square rounded-2xl bg-gray-50 border-2 border-dashed ${showPhotoError ? 'border-red-400 bg-red-50/40' : 'border-gray-200'} hover:border-green-400 hover:bg-green-50/30 flex flex-col items-center justify-center text-gray-400 hover:text-green-500 cursor-pointer active:scale-95 transition-all`}
                    >
                      <FiCamera className="w-7 h-7 mb-1" />
                      <span className="text-[10px] font-bold uppercase">Camera Only</span>
                    </button>
                  )}
                </div>

                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={cameraInputRef}
                  onChange={handlePhotoUpload}
                  className="hidden"
                />

                {showPhotoError && (
                  <p role="alert" className="text-red-500 text-xs font-semibold mt-2 ml-1">
                    Take at least one photo of the finished work to continue.
                  </p>
                )}
                {isUploading && <p className="text-blue-500 text-[10px] font-bold mt-2 ml-1 animate-pulse">Uploading photos...</p>}
              </div>

              {/* Optional "before" photos */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Before the work <span className="text-gray-400 font-semibold normal-case">(optional)</span></p>
                  <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-md font-bold whitespace-nowrap">{beforePhotos.length}/3</span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {beforePhotos.map((photo, index) => (
                    <div key={index} className="aspect-square rounded-2xl bg-gray-100 border border-gray-100 relative overflow-hidden">
                      <img src={photo} className="w-full h-full object-cover" alt="before the work" />
                      <button
                        type="button"
                        onClick={() => setBeforePhotos((prev) => prev.filter((_, i) => i !== index))}
                        aria-label="Remove before photo"
                        className="absolute top-1 right-1 w-7 h-7 bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center text-white shadow-md active:scale-90 transition-transform"
                      >
                        <FiX className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {beforePhotos.length < 3 && (
                    <button
                      type="button"
                      onClick={() => beforeInputRef.current?.click()}
                      className="aspect-square rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 hover:border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer active:scale-95 transition-all"
                    >
                      <FiCamera className="w-6 h-6 mb-1" />
                      <span className="text-[10px] font-bold uppercase">Add</span>
                    </button>
                  )}
                </div>
                <input type="file" accept="image/*" capture="environment" ref={beforeInputRef} onChange={handleBeforeUpload} className="hidden" />
              </div>

              {/* Quality Checklist (Restored from Worker Design) */}
              <div className="bg-emerald-50/50 p-5 rounded-2xl border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 mb-3">
                  <FiCheckCircle className="w-5 h-5" />
                  <span className="font-bold text-sm">Quality Checklist</span>
                </div>
                <ul className="space-y-2">
                  {[
                    'Double checked the results',
                    'Cleaned up work area',
                    'Customer satisfaction confirmed'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Payment Info */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase">Total Bill Value</p>
                  <p className="text-lg font-black text-gray-800">₹{calculateTotal().toFixed(2)}</p>
                </div>
                <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-green-600 shadow-sm">
                  <FiDollarSign className="w-5 h-5" />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="py-4 rounded-xl border border-gray-200 font-bold text-gray-600 hover:bg-gray-50 transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || isUploading}
                  className="py-4 rounded-xl font-bold text-white shadow-lg shadow-green-500/30 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
                  style={{ background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)' }}
                >
                  {loading ? 'Confirming...' : 'Complete Work'}
                </button>
              </div>

            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  , document.body);
};

export default WorkCompletionModal;
