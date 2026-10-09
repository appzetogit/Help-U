import React, { useState, useEffect } from 'react';
import { FiCheckCircle, FiShield, FiAlertCircle, FiPackage, FiX, FiInfo } from 'react-icons/fi';
import { motion, AnimatePresence } from 'framer-motion';
import { configService } from '../../../../services/configService';

const PaymentVerificationModal = ({ isOpen, onClose, booking, onPayOnline }) => {
  const [isOnlinePaymentEnabled, setIsOnlinePaymentEnabled] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await configService.getSettings();
        if (res.success && res.settings) {
          setIsOnlinePaymentEnabled(res.settings.isOnlinePaymentEnabled !== false);
        }
      } catch (error) {
        console.error('Error fetching payment config:', error);
      } finally {
        setConfigLoading(false);
      }
    };

    if (isOpen) {
      fetchConfig();
    }
  }, [isOpen]);

  if (!isOpen || !booking) return null;

  // --- 1. Total & Breakdown Calculations ---
  const isPlanBenefit = booking.paymentMethod === 'plan_benefit';
  const bill = booking.bill;
  const advancePayment = booking.advancePayment || {};
  const isAdvancePending = advancePayment.status === 'requested';
  const advancePaidAmount = Number(advancePayment.paidAmount || advancePayment.requestedAmount || 0);

  // Base Logic (Services)
  const originalBase = bill ? (bill.originalServiceBase || 0) : (parseFloat(booking.basePrice) || 0);

  // Extra Services
  const allBillServices = bill?.services || [];
  const services = allBillServices.filter(s => !s.isOriginal);
  const originalServiceFromBill = allBillServices.find(s => s.isOriginal);

  let extraServiceBase = 0;
  let extraServiceGST = 0;

  services.forEach(s => {
    const qty = parseFloat(s.quantity) || 1;
    const base = (parseFloat(s.price) || 0) * qty;
    const gst = parseFloat(s.gstAmount) || 0;
    extraServiceBase += base;
    extraServiceGST += gst;
  });

  const totalServiceBase = originalBase + extraServiceBase;

  // Parts & Custom Items
  const parts = bill?.parts || [];
  const customItems = bill?.customItems || [];

  let partsBase = 0;
  let partsGST = 0;

  parts.forEach(p => {
    const qty = parseFloat(p.quantity) || 1;
    partsBase += ((parseFloat(p.price) || 0) * qty);
    partsGST += (parseFloat(p.gstAmount) || 0);
  });

  customItems.forEach(c => {
    const qty = parseFloat(c.quantity) || 1;
    partsBase += ((parseFloat(c.price) || 0) * qty);
    partsGST += (parseFloat(c.gstAmount) || 0);
  });

  // Tax Logic
  const originalGST = bill ? (bill.originalGST || 0) : (originalBase * 0.18);
  const totalGST = originalGST + extraServiceGST + partsGST;

  // Final Total
  const finalTotal = bill?.grandTotal || (booking.finalAmount || 0);
  const remainingTotal = Number(booking.userPayableAmount ?? finalTotal);
  const amountDue = isAdvancePending ? Number(advancePayment.requestedAmount || 0) : remainingTotal;

  // --- 2. Identity Helpers ---
  const categoryName = booking.serviceCategory || 'General';
  const brandName = booking.brandName || booking.bookedItems?.[0]?.sectionTitle || '';
  const serviceName = booking.serviceName || 'Service Request';

  const CategoryIcon = booking.categoryIcon ? (
    <img src={booking.categoryIcon} alt={categoryName} className="w-full h-full object-cover" />
  ) : (
    <span className="text-2xl font-black uppercase text-white">{categoryName.charAt(0)}</span>
  );

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: "spring", bounce: 0.3 }}
          className="bg-white w-full max-w-sm rounded-[2rem] overflow-hidden shadow-2xl relative max-h-[90vh] flex flex-col"
        >
          {/* Header */}
          <div className="relative bg-slate-900 border-b border-slate-800 p-5 shrink-0">
            <button
              onClick={onClose}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
            >
              <FiX className="w-5 h-5 text-white/80" />
            </button>

            <div className="flex flex-col items-center text-center mt-2">
              <div className="w-14 h-14 bg-teal-500 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/30 mb-3 text-white overflow-hidden border-2 border-slate-800">
                {CategoryIcon}
              </div>
              <h3 className="text-white font-bold text-lg">{isAdvancePending ? 'Advance Payment Request' : 'Payment Verification'}</h3>
              <p className="text-slate-400 text-xs mt-1">{isAdvancePending ? 'Review the request and pay the advance' : 'Review bill and complete payment'}</p>
            </div>
          </div>

          <div className="p-5 overflow-y-auto custom-scrollbar flex-1">
            {/* Booking Identity Card */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-5 relative overflow-hidden">
              <div className="flex flex-col gap-1 relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                    {categoryName}
                  </span>
                  {brandName && (
                    <div className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      {booking.brandIcon && <img src={booking.brandIcon} alt={brandName} className="w-3 h-3 object-contain" />}
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        {brandName}
                      </span>
                    </div>
                  )}
                </div>
                <h4 className="text-lg font-bold text-slate-800 leading-tight">
                  {serviceName}
                </h4>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  ID: #{booking.bookingNumber || booking._id?.slice(-8).toUpperCase()}
                </p>
              </div>
              <FiPackage className="absolute -bottom-2 -right-2 w-16 h-16 text-slate-100 rotate-[-15deg] z-0" />
            </div>

            {/* Bill Details */}
            <div className="space-y-4">
              <div className="flex justify-between items-end border-b border-slate-100 pb-2">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{isAdvancePending ? 'Advance Amount' : 'Amount Due'}</p>
                <p className="text-3xl font-black text-slate-900">
                  ₹{amountDue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </p>
              </div>

              {isAdvancePending ? (
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-3">
                  <p className="text-sm font-bold text-amber-900">Advance requested for parts/materials</p>
                  {advancePayment.reason && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Reason</p>
                      <p className="text-xs text-gray-700 mt-1">{advancePayment.reason}</p>
                    </div>
                  )}
                  {advancePayment.partsDescription && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-700">Parts Details</p>
                      <p className="text-xs text-gray-700 mt-1">{advancePayment.partsDescription}</p>
                    </div>
                  )}
                </div>
              ) : (
              <>
              {/* 1. Services */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <FiCheckCircle className="w-3.5 h-3.5 text-teal-500" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Services</span>
                </div>
                <div className="space-y-2 pl-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>{originalServiceFromBill?.name || booking.serviceName || 'Service'}</span>
                    {isPlanBenefit ? (
                      <div className="flex items-center gap-1.5">
                        <span className="line-through text-slate-400">₹{originalBase.toFixed(2)}</span>
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 rounded">FREE</span>
                      </div>
                    ) : (
                      <span className="font-medium font-mono">₹{originalBase.toFixed(2)}</span>
                    )}
                  </div>
                  {services.map((s, idx) => (
                    <div key={`s-${idx}`} className="flex justify-between text-xs text-slate-600">
                      <span>{s.name} <span className="text-slate-400">x{s.quantity}</span></span>
                      <span className="font-medium font-mono">₹{((parseFloat(s.price) || 0) * (parseFloat(s.quantity) || 1)).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs text-slate-500 border-t border-dashed border-slate-100 pt-1 mt-1">
                    <span>GST (18%)</span>
                    <span className="font-mono">₹{(originalGST + extraServiceGST).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs font-bold text-slate-800 pt-1">
                    <span>Total Service</span>
                    <span>₹{(totalServiceBase + originalGST + extraServiceGST).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* 2. Parts */}
              {(parts.length > 0 || customItems.length > 0) && (
                <div>
                  <div className="flex items-center gap-2 mb-2 mt-4">
                    <FiPackage className="w-3.5 h-3.5 text-orange-500" />
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Parts & Materials</span>
                  </div>
                  <div className="space-y-2 pl-1">
                    {parts.map((p, idx) => (
                      <div key={`p-${idx}`} className="flex justify-between text-xs text-slate-600">
                        <span>{p.name} <span className="text-slate-400">x{p.quantity}</span></span>
                        <span className="font-medium font-mono">₹{(p.price * p.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    {customItems.map((c, idx) => (
                      <div key={`c-${idx}`} className="flex justify-between text-xs text-slate-600">
                        <span>{c.name} <span className="text-slate-400">x{c.quantity}</span></span>
                        <span className="font-medium font-mono">₹{(c.price * c.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs text-slate-500 border-t border-dashed border-slate-100 pt-1 mt-1">
                      <span>GST (18%)</span>
                      <span className="font-mono">₹{partsGST.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-bold text-slate-800 pt-1">
                      <span>Total Parts</span>
                      <span>₹{(partsBase + partsGST).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. Visiting Charges */}
              {(booking.visitingCharges > 0 || bill?.visitingCharges > 0) && (
                <div className="mt-4 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-2 uppercase tracking-wide">
                      <FiInfo className="w-3.5 h-3.5 text-blue-400" /> Visiting Charges
                    </span>
                    <span className="font-mono">₹{(bill?.visitingCharges || booking.visitingCharges || 0).toFixed(2)}</span>
                  </div>
                </div>
              )}

              {/* 4. Transport Charges */}
              {(bill?.transportCharges > 0) && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-2 uppercase tracking-wide">
                      <FiPackage className="w-3.5 h-3.5 text-blue-400" /> Transport Charges
                    </span>
                    <span className="font-mono">₹{(bill.transportCharges).toFixed(2)}</span>
                  </div>
                </div>
              )}
              {advancePaidAmount > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-100">
                  <div className="flex justify-between text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-2 uppercase tracking-wide">
                      <FiShield className="w-3.5 h-3.5 text-emerald-500" /> Advance Paid
                    </span>
                    <span className="font-mono text-emerald-600">-₹{advancePaidAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}
              </>
              )}
            </div>

            {/* Actions */}
            <div className="mt-8 space-y-3">
              {booking.paymentStatus === 'success' ? (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-500 shadow-sm shrink-0">
                    <FiCheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-emerald-900 font-bold text-sm">Payment Verified</p>
                    <p className="text-emerald-700 text-xs">Transaction completed successfully.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Online Pay - CONDITIONALLY RENDERED */}
                  {!configLoading && isOnlinePaymentEnabled ? (
                    <button
                      onClick={onPayOnline}
                      className="w-full py-3.5 rounded-xl bg-slate-900 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all"
                    >
                      {isAdvancePending ? 'Pay Advance Online' : 'Pay Online Securely'}
                    </button>
                  ) : (
                    !configLoading && (
                      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                        <FiAlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-[10px] font-bold text-amber-800 uppercase tracking-tight">
                           Online payment temporarily unavailable. Please pay by cash.
                        </p>
                      </div>
                    )
                  )}

                  {!isAdvancePending && (
                  <div className="relative py-2 text-center">
                    <span className="bg-white px-2 text-[10px] font-bold text-slate-400 relative z-10 uppercase tracking-wider">OR</span>
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-slate-100 z-0"></div>
                  </div>
                  )}

                  {/* Cash Code */}
                  {!isAdvancePending && (booking.customerConfirmationOTP || booking.paymentOtp) && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                      <p className="text-xs font-bold text-slate-700 mb-2">Paying Cash? Share Code</p>
                      <div className="bg-white border-2 border-dashed border-slate-300 rounded-lg py-2 px-4 inline-block mb-1">
                        <span className="text-2xl font-black font-mono text-slate-900 tracking-[0.2em]">
                          {booking.customerConfirmationOTP || booking.paymentOtp || '....'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1">Share with professional to confirm cash payment</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default PaymentVerificationModal;
