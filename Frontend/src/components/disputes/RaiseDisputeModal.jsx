import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { FiX } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import bookingFeaturesService from '../../services/bookingFeaturesService';
import EvidencePicker from './EvidencePicker';
import { uploadedUrls, isUploading } from './disputeUi';
import ModalLock from '../common/ModalLock';

const NAVY = '#163B66';

const DEFAULT_CUSTOMER_DISPUTE_REASONS = [
  'Service not completed',
  'Poor quality of work',
  'Overcharged / billing issue',
  'Professional misbehaved',
  'Damage to property',
  'Professional did not arrive',
  'Payment issue',
  'Other'
];

const DEFAULT_WORKER_DISPUTE_REASONS = [
  'Customer unavailable / Not at location',
  'Customer refused to pay',
  'Customer misbehaved / Inappropriate behavior',
  'Incorrect address / Location unreachable',
  'Scope mismatch / Extra work demanded',
  'Customer cancelled at doorstep',
  'Safety or security concern',
  'Payment or settlement issue',
  'Other'
];

/**
 * Form to raise a dispute on a booking.
 * info: response of GET /disputes/booking/:id (reasons, maxEvidence, amountPaid)
 */
const RaiseDisputeModal = ({ role, bookingId, info, isOpen, onClose, onRaised }) => {
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [refund, setRefund] = useState('');
  const [evidence, setEvidence] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const reasonsList = (info?.reasons && info.reasons.length > 0)
    ? info.reasons
    : (role === 'worker' ? DEFAULT_WORKER_DISPUTE_REASONS : DEFAULT_CUSTOMER_DISPUTE_REASONS);

  const amountPaid = info?.amountPaid || 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) return toast.error('Please choose a reason');
    if (description.trim().length < 10) return toast.error('Please describe the problem in at least 10 characters');
    if (isUploading(evidence)) return toast.error('Please wait for the photos to finish uploading');

    setSubmitting(true);
    try {
      const res = await bookingFeaturesService.raiseDispute(role, {
        bookingId,
        reason,
        description: description.trim(),
        evidence: uploadedUrls(evidence),
        requestedRefund: role === 'user' ? Number(refund) || 0 : 0
      });
      if (res.success) {
        toast.success(res.message || 'Dispute raised');
        onRaised?.(res.data);
        onClose();
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to raise dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-end sm:items-center justify-center" onClick={onClose}>
      <ModalLock />
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto"
      >
        <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-900">Report a problem</h3>
            <p className="text-xs text-gray-500 mt-0.5">Our support team reviews every report and replies here.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100" aria-label="Close">
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase">What went wrong?</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {reasonsList.map((r) => (
                <button
                  type="button"
                  key={r}
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${reason === r ? 'text-white border-transparent' : 'bg-white text-gray-700 border-gray-200'}`}
                  style={reason === r ? { backgroundColor: NAVY } : undefined}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 uppercase" htmlFor="dispute-desc">Describe the problem</label>
            <textarea
              id="dispute-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
              rows={4}
              placeholder={role === 'worker' ? 'Tell us what went wrong with this booking or customer, with as much detail as you can' : 'Tell us what happened, with as much detail as you can'}
              className="mt-1 w-full p-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            <p className="text-[10px] text-gray-400 text-right">{description.length}/2000</p>
          </div>

          {role === 'user' && amountPaid > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase" htmlFor="dispute-refund">Refund you are asking for (optional)</label>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-gray-500 font-semibold">₹</span>
                <input
                  id="dispute-refund"
                  type="number"
                  min="0"
                  max={amountPaid}
                  value={refund}
                  onChange={(e) => setRefund(e.target.value)}
                  placeholder={`Up to ${amountPaid}`}
                  className="w-full p-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">You paid ₹{amountPaid.toLocaleString('en-IN')}. The final amount is decided by our team.</p>
            </div>
          )}

          {(info?.maxEvidence || 0) > 0 && (
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Photos (optional)</label>
              <div className="mt-2">
                <EvidencePicker role={role} items={evidence} setItems={setEvidence} max={info.maxEvidence} />
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white px-5 py-4 border-t border-gray-100">
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl text-white font-bold disabled:opacity-50"
            style={{ backgroundColor: NAVY }}
          >
            {submitting ? 'Submitting…' : 'Submit report'}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
};

export default RaiseDisputeModal;
