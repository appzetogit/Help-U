import React, { useState, useEffect } from 'react';
import { FiX, FiPlus, FiTrash2, FiCreditCard, FiClock, FiCheck, FiDollarSign, FiPlusCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';

/**
 * CashCollectionModal
 * A unified component for collecting cash payments with support for extra items/services.
 */
const CashCollectionModal = ({
  isOpen,
  onClose,
  booking,
  onConfirm,
  onInitiateOTP,
  loading
}) => {
  const [extraItems, setExtraItems] = useState([]);
  const [showOTPInput, setShowOTPInput] = useState(false);
  const [otp, setOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastInitiatedTotal, setLastInitiatedTotal] = useState(0);
  const [devOTP, setDevOTP] = useState('');

  const baseAmount = parseFloat(booking?.finalAmount) || parseFloat(booking?.price) || 0;
  const totalExtra = extraItems.reduce((sum, item) => {
    const price = parseFloat(item.price);
    const qty = parseFloat(item.qty);
    const itemTotal = (isNaN(price) ? 0 : price) * (isNaN(qty) ? 1 : qty);
    return sum + itemTotal;
  }, 0);
  const finalTotal = baseAmount + totalExtra;

  const isTotalChanged = showOTPInput && finalTotal !== lastInitiatedTotal;

  // Clear state only when switching to a different booking
  useEffect(() => {
    setExtraItems([]);
    setShowOTPInput(false);
    setOtp('');
    setSubmitting(false);
    setLastInitiatedTotal(0);
    setDevOTP('');
  }, [booking?._id, booking?.id]);

  const handleAddItem = () => {
    setExtraItems([...extraItems, { title: '', price: '', qty: 1 }]);
  };

  const handleUpdateItem = (index, field, value) => {
    const newItems = [...extraItems];
    newItems[index][field] = value;
    setExtraItems(newItems);
  };

  const handleRemoveItem = (index) => {
    setExtraItems(extraItems.filter((_, i) => i !== index));
  };

  const handleInitiate = async () => {
    // Validate extra items if any
    for (const item of extraItems) {
      if (!item.title?.trim()) {
        toast.error('Please provide a title for all extra items');
        return;
      }
      const price = parseFloat(item.price);
      if (isNaN(price) || price < 0) {
        toast.error(`Invalid price for "${item.title}"`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await onInitiateOTP(finalTotal, extraItems);
      setLastInitiatedTotal(finalTotal);
      setShowOTPInput(true);
      if (res?.otp) setDevOTP(res.otp);
      toast.success(showOTPInput ? 'OTP updated and sent' : 'OTP sent to customer');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to send OTP');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirm = async () => {
    if (!otp || otp.length < 4) {
      toast.error('Please enter 4-digit OTP');
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(finalTotal, extraItems, otp);
      onClose();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to confirm payment');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in slide-in-from-bottom-4 duration-300">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="text-xl font-bold text-gray-900">Collect Cash</h3>
            <p className="text-xs text-gray-500 font-medium tracking-wide">CONFIRM PAYMENT WITH OTP</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiX className="w-6 h-6 text-gray-400" />
          </button>
        </div>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* Base Amount Section */}
          <div className="bg-blue-50/50 rounded-2xl p-5 mb-6 border border-blue-100/50">
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-medium text-blue-800">Booking Amount</span>
              <span className="text-lg font-bold text-blue-900">₹{baseAmount.toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-blue-600/80">Original service booking amount</p>
          </div>

          {/* Extra Items Section */}
          <div className="space-y-4 mb-6">
            <div className="flex justify-between items-center">
              <h4 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Extra Services / Items</h4>
              <button
                onClick={handleAddItem}
                className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <FiPlus className="w-3.5 h-3.5" />
                Add Extra
              </button>
            </div>

            {extraItems.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed border-gray-100 rounded-2xl">
                <p className="text-xs text-gray-400">No extra charges added yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {extraItems.map((item, index) => (
                  <div key={index} className="flex gap-2 items-start animate-in slide-in-from-right-2 duration-200">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        placeholder="Service name (e.g. Extra pipe)"
                        className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 transition-all"
                        value={item.title}
                        onChange={(e) => handleUpdateItem(index, 'title', e.target.value)}
                      />
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₹</span>
                          <input
                            type="number"
                            placeholder="Price"
                            className="w-full pl-7 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                            value={item.price}
                            onChange={(e) => handleUpdateItem(index, 'price', e.target.value)}
                          />
                        </div>
                        <div className="w-20">
                          <input
                            type="number"
                            placeholder="Qty"
                            className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500"
                            value={item.qty}
                            onChange={(e) => handleUpdateItem(index, 'qty', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(index)}
                      className="p-2 text-red-400 hover:bg-red-50 rounded-lg mt-1"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Final Summary */}
          <div className="bg-gray-900 rounded-2xl p-6 text-white shadow-xl shadow-gray-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
              <FiCreditCard className="w-16 h-16" />
            </div>
            <div className="relative z-10">
              <div className="flex justify-between items-center mb-4 text-gray-400/80 text-xs font-bold uppercase tracking-widest">
                <span>Payment Summary</span>
                <span>Total Due</span>
              </div>
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-3xl font-black tracking-tight">₹{finalTotal.toLocaleString()}</p>
                  <p className="text-[10px] text-gray-400 mt-1 uppercase">Inclusive of all extra services</p>
                </div>
                <div className="text-right">
                  <div className="px-2 py-1 bg-green-500/20 text-green-400 text-[10px] font-bold rounded-lg border border-green-500/30">
                    CASH PAYMENT
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 bg-gray-50/50 border-t border-gray-100">
          {!showOTPInput ? (
            <button
              onClick={handleInitiate}
              disabled={submitting || loading}
              className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 hover:brightness-105"
              style={{
                background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                boxShadow: '0 8px 16px -4px rgba(59, 130, 246, 0.4)',
              }}
            >
              {submitting ? 'Initiating...' : 'Send OTP to Customer'}
              <FiArrowRight className="w-5 h-5" />
            </button>
          ) : (
            <div className="space-y-4 animate-in fade-in zoom-in duration-300">
              <div className="text-center">
                <p className="text-sm font-semibold text-gray-700 mb-2">Enter Verification OTP</p>
                <div className="flex justify-center">
                  <input
                    type="text"
                    maxLength={4}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="0000"
                    className="w-40 text-center text-3xl font-black tracking-[0.5em] py-3 bg-white border-2 border-blue-100 rounded-2xl focus:border-blue-500 focus:outline-none shadow-inner"
                  />
                </div>
              </div>
              <button
                onClick={handleConfirm}
                disabled={submitting || loading || otp.length < 4}
                className="w-full py-4 rounded-xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50 hover:brightness-105"
                style={{
                  background: 'linear-gradient(135deg, #10B981, #059669)',
                  boxShadow: '0 8px 16px -4px rgba(16, 185, 129, 0.4)',
                }}
              >
                {submitting ? 'Confirming...' : 'Verify & Record Payment'}
                <FiCheck className="w-5 h-5" />
              </button>
              <p className="text-[10px] text-gray-400 text-center italic">
                By clicking confirm, you verify that you have received ₹{finalTotal.toLocaleString()} in cash.
              </p>
              {devOTP && (
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-1">Development Mode OTP</p>
                  <p className="text-xl font-black text-amber-700 tracking-widest">{devOTP}</p>
                </div>
              )}
            </div>
          )}

          {showOTPInput && isTotalChanged && (
            <div className="mt-4 animate-in slide-in-from-top-2">
              <button
                onClick={handleInitiate}
                disabled={submitting || loading}
                className="w-full py-3 rounded-xl font-bold text-blue-600 bg-blue-50 border border-blue-100 flex items-center justify-center gap-2 hover:bg-blue-100 transition-all"
              >
                {submitting ? 'Updating...' : 'Update Total & Resend OTP'}
                <FiClock className="w-4 h-4" />
              </button>
              <p className="text-[10px] text-blue-500 text-center mt-2 italic">
                Total amount changed. You need to resend OTP to confirm current total.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Internal icon for button
const FiArrowRight = ({ className }) => (
  <svg className={className} stroke="currentColor" fill="none" strokeWidth="2" viewBox="0 0 24 24" strokeLinecap="round" strokeLinejoin="round" height="1em" width="1em" xmlns="http://www.w3.org/2000/svg">
    <line x1="5" y1="12" x2="19" y2="12"></line>
    <polyline points="12 5 19 12 12 19"></polyline>
  </svg>
);

export default CashCollectionModal;
