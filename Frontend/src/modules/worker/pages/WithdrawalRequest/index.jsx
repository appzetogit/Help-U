import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiDollarSign, FiArrowRight, FiCreditCard, FiAlertCircle, FiCheckCircle, FiEdit2, FiClock, FiActivity } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import { requestWithdrawal, getWalletBalance, getWithdrawalHistory } from '../../services/walletService';
import { toast } from 'react-hot-toast';
import LogoLoader from '../../../../components/common/LogoLoader';
import { workerAuthService } from '../../../../services/authService';

const WithdrawalRequest = () => {
  const navigate = useNavigate();
  const [wallet, setWallet] = useState({ available: 0 });
  const [amount, setAmount] = useState('');
  const [history, setHistory] = useState([]);
  const [bankAccount, setBankAccount] = useState({
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    branchName: '',
    ifscCode: '',
    upiId: '',
    qrCodeImage: ''
  });
  const [isBankSaved, setIsBankSaved] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [walletRes, historyRes, profileRes] = await Promise.all([
        getWalletBalance(),
        getWithdrawalHistory(),
        workerAuthService.getProfile()
      ]);
      setWallet({ available: walletRes.earnings || 0 });
      setHistory(historyRes || []);

      const profileBankDetails = profileRes?.worker?.bankDetails || {};
      const hasRequiredBankDetails = Boolean(
        profileBankDetails.accountHolderName &&
        profileBankDetails.bankName &&
        profileBankDetails.accountNumber &&
        profileBankDetails.ifscCode &&
        profileBankDetails.qrCodeImage
      );

      if (hasRequiredBankDetails) {
        setBankAccount({
          accountHolderName: profileBankDetails.accountHolderName || '',
          bankName: profileBankDetails.bankName || '',
          accountNumber: profileBankDetails.accountNumber || '',
          branchName: profileBankDetails.branchName || '',
          ifscCode: profileBankDetails.ifscCode || '',
          upiId: profileBankDetails.upiId || '',
          qrCodeImage: profileBankDetails.qrCodeImage || ''
        });
        setIsBankSaved(true);
      } else {
        toast.error('Please add bank details and QR code first');
        navigate('/worker/bank-details', { replace: true, state: { redirectTo: '/worker/wallet/withdraw' } });
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Unable to load withdrawal details');
    }
  };

  const handleAmountChange = (value) => {
    const numValue = value.replace(/[^0-9]/g, '');
    setAmount(numValue);
    setError('');

    const numAmount = parseInt(numValue) || 0;
    if (numAmount > wallet.available) {
      setError('Amount cannot exceed available earnings');
    } else if (numAmount < 100 && numValue !== '') {
      setError('Minimum withdrawal amount is ₹100');
    }
  };

  const handleMaxAmount = () => {
    setAmount(wallet.available.toString());
    setError('');
  };

  const handleSubmit = async () => {
    const numAmount = parseInt(amount) || 0;
    if (!amount || numAmount === 0 || error) return;
    if (!isBankSaved) {
      toast.error('Please add bank details');
      return;
    }

    try {
      setLoading(true);
      await requestWithdrawal({
        amount: numAmount,
        bankDetails: bankAccount
      });
      toast.success('Request sent successfully!');
      window.dispatchEvent(new Event('workerWalletUpdated'));
      navigate('/worker/wallet');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Submission failed.');
    } finally {
      setLoading(false);
    }
  };

  const tdsRate = 2;
  const tdsAmount = Math.round((parseInt(amount) || 0) * (tdsRate / 100));
  const netAmount = (parseInt(amount) || 0) - tdsAmount;

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Request Withdrawal" />

      <main className="px-4 py-6 max-w-lg mx-auto">
        {/* Modern Balance Header */}
        {/* Modern Balance Header - Matched with Wallet Earnings Card */}
        <div className="rounded-2xl p-6 shadow-xl relative overflow-hidden mb-8 bg-gradient-to-br from-green-600 to-green-800">
          <div className="relative z-10 text-white flex flex-col items-center">
            <span className="text-white/80 text-[11px] font-bold uppercase tracking-[0.2em] mb-1">Total Redeemable</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-black text-white/90">₹</span>
              <span className="text-5xl font-black text-white tracking-tight">
                {wallet.available.toLocaleString()}
              </span>
            </div>
            <div className="mt-4 flex gap-2">
              <div className="px-3 py-1 bg-white/20 text-white rounded-full text-[10px] font-bold border border-white/30 flex items-center gap-1 backdrop-blur-sm">
                <FiCheckCircle className="w-3 h-3" /> Verified Balance
              </div>
            </div>
          </div>
          {/* Decorative Icon Background */}
          <div className="absolute -bottom-6 -right-6 text-white/10 transform rotate-12">
            <FiDollarSign className="w-40 h-40" />
          </div>
        </div>

        {/* Input Card */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-50 mb-6 group transition-all hover:shadow-2xl">
          <div className="flex justify-between items-center mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <FiDollarSign className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-gray-800">Withdraw Amount</h3>
            </div>
            <button
              onClick={handleMaxAmount}
              className="text-[10px] font-black text-white px-3 py-1.5 rounded-lg transition-all active:scale-95"
              style={{ background: themeColors.button }}
            >
              USE MAX
            </button>
          </div>

          <div className="relative mb-4 group-focus-within:scale-[1.02] transition-transform duration-300">
            <div className="absolute top-1/2 left-4 -translate-y-1/2 text-gray-400 font-bold text-3xl">₹</div>
            <input
              type="text"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="0"
              className={`w-full pl-10 pr-4 py-5 bg-white rounded-2xl border-2 border-dashed ${error ? 'border-red-300 bg-red-50 text-red-500' : 'border-emerald-300 focus:border-emerald-500'
                } text-4xl font-black text-center focus:outline-none transition-all shadow-sm focus:shadow-emerald-100/50 focus:shadow-lg text-gray-900 caret-emerald-500 placeholder:text-gray-200`}
            />
          </div>

          {error && <p className="text-red-500 text-[11px] font-bold text-center mb-4 flex justify-center items-center gap-1"><FiAlertCircle className="w-3.5 h-3.5" /> {error}</p>}

          {amount && !error && (
            <div className="bg-emerald-50/50 rounded-2xl p-4 space-y-3 border border-emerald-50">
              <div className="flex justify-between text-xs font-bold text-gray-500">
                <span>Gross Total</span>
                <span>₹{parseInt(amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-red-500/70">
                <span>TDS Deduction (2%)</span>
                <span>- ₹{tdsAmount.toLocaleString()}</span>
              </div>
              <div className="pt-2 border-t border-emerald-100 flex justify-between items-end">
                <span className="text-xs font-black text-gray-400 uppercase tracking-widest leading-none">Net Payout</span>
                <span className="text-2xl font-black text-emerald-600 leading-none">₹{netAmount.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>

        {/* Bank Detail Card - Pro Style */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-gray-50 mb-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-[0.03]">
            <FiCreditCard className="w-32 h-32" />
          </div>

          <div className="flex items-center justify-between mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                <FiCreditCard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Payout Destination</h3>
                <p className="text-[10px] text-gray-500 font-medium">Where should we send money?</p>
              </div>
            </div>
            {isBankSaved && (
              <button
                onClick={() => navigate('/worker/bank-details')}
                className="w-9 h-9 rounded-xl bg-gray-50 flex items-center justify-center text-gray-500 hover:text-blue-600 hover:bg-blue-50 transition-all border border-gray-200 active:scale-95"
              >
                <FiEdit2 className="w-4 h-4" />
              </button>
            )}
          </div>

          {isBankSaved ? (
            <div className="bg-blue-50/50 rounded-2xl p-5 border border-blue-100 shadow-sm relative group transition-all">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Account Holder</p>
                    <p className="font-bold text-gray-900 text-sm">{bankAccount.accountHolderName}</p>
                  </div>
                  <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                    <FiCreditCard className="w-5 h-5" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Bank Name</p>
                    <p className="font-bold text-gray-800 text-sm">{bankAccount.bankName}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">IFSC Code</p>
                    <p className="font-bold text-gray-800 text-sm uppercase">{bankAccount.ifscCode}</p>
                  </div>
                </div>

                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Account Number</p>
                  <p className="font-mono font-bold text-gray-900 text-lg tracking-wider">
                    {bankAccount.accountNumber?.replace(/(.{4})/g, '$1 ').trim()}
                  </p>
                </div>

                {bankAccount.branchName && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">Branch Name</p>
                    <p className="font-bold text-gray-800 text-sm">{bankAccount.branchName}</p>
                  </div>
                )}

                {bankAccount.upiId && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-0.5">UPI ID</p>
                    <p className="font-bold text-gray-800 text-sm">{bankAccount.upiId}</p>
                  </div>
                )}

                {bankAccount.qrCodeImage && (
                  <div>
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">QR Code</p>
                    <div className="w-40 h-40 rounded-2xl border border-blue-100 bg-white p-2">
                      <img
                        src={bankAccount.qrCodeImage}
                        alt="Worker payout QR"
                        className="w-full h-full object-contain rounded-xl"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="absolute top-4 right-12">
                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full flex items-center gap-1">
                  <FiCheckCircle className="w-3 h-3" /> Verified
                </span>
              </div>
              <FiEdit2 className="w-4 h-4 text-gray-300 absolute top-5 right-5" />
            </div>
          ) : (
            <div className="bg-amber-50/60 rounded-2xl p-5 border border-amber-100">
              <p className="text-sm font-bold text-amber-900 mb-2">Bank details are required before withdrawal.</p>
              <button
                onClick={() => navigate('/worker/bank-details')}
                className="text-xs font-black uppercase tracking-wider text-white px-4 py-3 rounded-xl"
                style={{ background: themeColors.button }}
              >
                Add Bank Details
              </button>
            </div>
          )}
        </div>

        {/* Ledger Summary */}
        {history.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4 px-2">
              <FiActivity className="text-gray-400 w-4 h-4" />
              <h3 className="font-black text-gray-400 text-[10px] uppercase tracking-[0.2em]">Recent Activity</h3>
            </div>
            <div className="space-y-3">
              {history.slice(0, 3).map((item) => (
                <div
                  key={item._id}
                  className={`rounded-[1.2rem] p-4 flex justify-between items-center shadow-sm border transition-all ${item.status === 'approved' ? 'bg-emerald-50/50 border-emerald-100 hover:border-emerald-200' :
                    item.status === 'rejected' ? 'bg-red-50/50 border-red-100 hover:border-red-200' :
                      'bg-amber-50/50 border-amber-100 hover:border-amber-200'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${item.status === 'approved' ? 'bg-emerald-100 text-emerald-600' :
                      item.status === 'rejected' ? 'bg-red-100 text-red-600' :
                        'bg-amber-100 text-amber-600'
                      }`}>
                      <FiClock className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-black text-sm text-gray-800">₹{item.amount.toLocaleString()}</p>
                      <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
                        {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <div className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${item.status === 'approved' ? 'bg-white/60 text-emerald-700 border border-emerald-100' :
                    item.status === 'rejected' ? 'bg-white/60 text-red-700 border border-red-100' :
                      'bg-white/60 text-amber-700 border border-amber-100'
                    }`}>
                    {item.status}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Submit Action */}
        <button
          onClick={handleSubmit}
          disabled={!amount || !!error || !isBankSaved || loading}
          className="w-full py-5 rounded-[1.5rem] font-black text-white text-[13px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all active:scale-[0.98] disabled:opacity-40 disabled:grayscale shadow-2xl group"
          style={{
            background: `linear-gradient(135deg, ${themeColors.button}, #0f172a)`,
          }}
        >
          {loading ? (
            <LogoLoader fullScreen={false} size="w-6 h-6" />
          ) : (
            <>
              Confirm Payout
              <FiArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </>
          )}
        </button>

        <p className="text-center text-[10px] text-gray-400 mt-8 font-black uppercase tracking-wider leading-relaxed opacity-50 px-6">
          Payouts hit your bank in 24-48 business hours.<br />
          TDS is mandated by govt. regulations.
        </p>
      </main>

      <BottomNav />
    </div>
  );
};

export default WithdrawalRequest;
