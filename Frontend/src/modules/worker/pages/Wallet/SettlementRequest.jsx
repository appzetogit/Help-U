import React, { useEffect, useLayoutEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiAlertCircle, FiCheckCircle, FiCreditCard } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import { workerTheme as themeColors } from '../../../../theme';
import workerWalletService from '../../../../services/workerWalletService';

const SettlementRequest = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [wallet, setWallet] = useState({ amountDue: 0, dues: 0 });
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');

  useLayoutEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const bgStyle = themeColors.backgroundGradient;

    if (html) html.style.background = bgStyle;
    if (body) body.style.background = bgStyle;
    if (root) root.style.background = bgStyle;

    return () => {
      if (html) html.style.background = '';
      if (body) body.style.background = '';
      if (root) root.style.background = '';
    };
  }, []);

  useEffect(() => {
    loadWallet();
  }, []);

  const loadWallet = async () => {
    try {
      setLoading(true);
      const res = await workerWalletService.getWallet();
      if (res.success) {
        const data = res.data || {};
        setWallet(data);
        setAmount(String(data.amountDue || data.dues || 0));
      }
    } catch (error) {
      console.error('Load wallet error:', error);
      toast.error('Failed to load wallet');
    } finally {
      setLoading(false);
    }
  };

  const handlePayNow = async () => {
    const settlementAmount = Number(amount);

    if (!Number.isFinite(settlementAmount) || settlementAmount <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    if (settlementAmount > Number(wallet.amountDue || wallet.dues || 0)) {
      toast.error(`Amount cannot exceed ₹${Number(wallet.amountDue || wallet.dues || 0).toLocaleString('en-IN')}`);
      return;
    }

    if (!window.Razorpay) {
      toast.error('Razorpay SDK not loaded');
      return;
    }

    try {
      setSubmitting(true);
      const orderRes = await workerWalletService.createSettlementOrder(settlementAmount);

      if (!orderRes.success) {
        toast.error(orderRes.message || 'Failed to create settlement order');
        setSubmitting(false);
        return;
      }

      const orderData = orderRes.data;

      const razorpay = new window.Razorpay({
        key: orderData.key,
        amount: Math.round(Number(orderData.amount) * 100),
        currency: orderData.currency || 'INR',
        name: 'Help U Admin Settlement',
        description: 'Worker settlement payment',
        order_id: orderData.orderId,
        prefill: {},
        theme: { color: themeColors.button },
        handler: async (response) => {
          try {
            const verifyRes = await workerWalletService.verifySettlementPayment({
              amount: settlementAmount,
              notes,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            if (verifyRes.success) {
              toast.success('Settlement completed successfully');
              navigate('/worker/wallet');
              return;
            }

            toast.error(verifyRes.message || 'Payment verification failed');
          } catch (error) {
            console.error('Settlement verification error:', error);
            toast.error(error.response?.data?.message || 'Failed to verify settlement payment');
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
          }
        }
      });

      razorpay.open();
    } catch (error) {
      console.error('Settlement order error:', error);
      toast.error(error.response?.data?.message || 'Failed to start settlement payment');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: themeColors.backgroundGradient }}>
        <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${themeColors.button} transparent ${themeColors.button} ${themeColors.button}` }} />
      </div>
    );
  }

  const maxDue = Number(wallet.amountDue || wallet.dues || 0);

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Pay to Admin" showBack={true} onBack={() => navigate('/worker/wallet')} />

      <main className="px-4 py-6">
        <div
          className="rounded-3xl p-5 mb-6 text-white shadow-xl"
          style={{
            background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
            boxShadow: '0 18px 40px rgba(220, 38, 38, 0.24)'
          }}
        >
          <p className="text-white/75 text-sm mb-1">Current Amount Due</p>
          <p className="text-3xl font-black">₹{maxDue.toLocaleString('en-IN')}</p>
          <p className="text-xs text-white/70 mt-2">This payment is settled instantly after Razorpay verification.</p>
        </div>

        <div className="bg-white rounded-3xl p-5 shadow-lg border border-white/70 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Settlement Amount</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">₹</span>
              <input
                type="number"
                min="1"
                max={maxDue}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 focus:border-blue-400 focus:outline-none"
                placeholder="Enter amount"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Max payable now: ₹{maxDue.toLocaleString('en-IN')}</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 rounded-2xl border border-gray-200 focus:border-blue-400 focus:outline-none resize-none"
              placeholder="Optional note for this settlement"
            />
          </div>

          <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 flex gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <FiCheckCircle className="w-5 h-5" />
            </div>
            <div className="text-sm">
              <p className="font-bold text-emerald-900">Automated settlement</p>
              <p className="text-emerald-700 text-xs mt-1">No admin approval is needed. Once payment succeeds, dues reduce automatically and admins are only notified that the settlement is done.</p>
            </div>
          </div>

          <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 flex gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <FiAlertCircle className="w-5 h-5" />
            </div>
            <div className="text-sm">
              <p className="font-bold text-amber-900">Payment mode</p>
              <p className="text-amber-700 text-xs mt-1">Razorpay will let you pay using UPI, card, net banking, or supported methods directly to admin settlement flow.</p>
            </div>
          </div>
        </div>

        <button
          onClick={handlePayNow}
          disabled={submitting || maxDue <= 0}
          className="w-full mt-6 py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
          style={{
            background: themeColors.button,
            boxShadow: `0 4px 12px ${themeColors.button}40`
          }}
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <FiCreditCard className="w-5 h-5" />
              Pay with Razorpay
            </>
          )}
        </button>
      </main>

      <BottomNav />
    </div>
  );
};

export default SettlementRequest;
