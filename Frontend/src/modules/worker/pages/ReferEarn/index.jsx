import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FiArrowLeft,
  FiCopy,
  FiCheck,
  FiShare2,
  FiGift,
  FiUsers,
  FiDollarSign,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiChevronRight,
  FiInfo,
  FiAward
} from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import { workerTheme as themeColors } from '../../../../theme';

const ReferEarn = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState({
    referralCode: '',
    rewardPerReferral: 100,
    isProgramEnabled: true,
    stats: {
      totalReferrals: 0,
      rewardedReferrals: 0,
      pendingReferrals: 0,
      rejectedReferrals: 0,
      totalEarnings: 0
    },
    referrals: []
  });

  useEffect(() => {
    fetchReferralDetails();
  }, []);

  const fetchReferralDetails = async () => {
    try {
      setLoading(true);
      const res = await api.get('/workers/referrals');
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error('Error fetching referral details:', err);
      toast.error('Failed to load referral details');
    } finally {
      setLoading(false);
    }
  };

  const getShareLink = () => {
    const origin = window.location.origin;
    return `${origin}/worker/signup?ref=${data.referralCode}`;
  };

  const handleCopyCode = () => {
    if (!data.referralCode) return;
    navigator.clipboard.writeText(data.referralCode);
    setCopied(true);
    toast.success('Referral code copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShareWhatsApp = () => {
    const text = `Hey! Join Help U as a verified worker to get more bookings and grow your business.\n\nUse my Referral Code: *${data.referralCode}*\nSign up here: ${getShareLink()}`;
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  const handleNativeShare = async () => {
    const text = `Join Help U as a verified service worker partner! Use my referral code: ${data.referralCode}`;
    const link = getShareLink();

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Help U as a Worker Partner',
          text,
          url: link
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          handleCopyCode();
        }
      }
    } else {
      handleCopyCode();
    }
  };

  const brandTeal = themeColors?.primary || '#347989';

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 px-4 py-3.5 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-700 hover:bg-gray-200 active:scale-95 transition-all"
          >
            <FiArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-lg font-black text-gray-900 leading-tight">Refer & Earn</h1>
            <p className="text-[11px] text-gray-500 font-medium">Invite workers & earn rewards</p>
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
          <FiGift className="w-5 h-5" />
        </div>
      </header>

      {/* Main Content */}
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Hero Card */}
        <div
          className="rounded-3xl p-6 text-white shadow-xl relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #2b6573 0%, #347989 50%, #4396a8 100%)'
          }}
        >
          {/* Background decorative circles */}
          <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-xl pointer-events-none" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-amber-400/20 blur-lg pointer-events-none" />

          <div className="relative z-10 space-y-3">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-[11px] font-bold uppercase tracking-wider text-amber-300 border border-white/20">
              <FiAward className="w-3.5 h-3.5" /> Worker Referral Program
            </div>

            <h2 className="text-2xl font-black leading-tight">
              Earn <span className="text-amber-300">₹{data.rewardPerReferral}</span> for every worker you invite!
            </h2>

            <p className="text-xs text-teal-100 font-medium leading-relaxed">
              Share your code with contractors, technicians, and service providers. Once their application is approved, ₹{data.rewardPerReferral} is credited directly into your wallet.
            </p>
          </div>
        </div>

        {/* Referral Code Box */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-4">
          <div className="text-center space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Your Unique Referral Code</p>
            <div className="inline-flex items-center justify-center gap-3 bg-gray-50 border-2 border-dashed border-teal-300 px-6 py-3 rounded-2xl w-full">
              <span className="text-2xl font-black tracking-widest text-teal-800">
                {loading ? '••••••••' : data.referralCode || 'HOMV-0000'}
              </span>
              <button
                onClick={handleCopyCode}
                className="p-2 rounded-xl bg-teal-50 text-teal-700 hover:bg-teal-100 active:scale-90 transition-all flex items-center gap-1 text-xs font-bold"
                title="Copy code"
              >
                {copied ? <FiCheck className="w-4 h-4 text-green-600" /> : <FiCopy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={handleShareWhatsApp}
              className="py-3 px-4 rounded-2xl bg-[#25D366] hover:bg-[#20bd5a] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
            >
              <FaWhatsapp className="w-4 h-4 text-white text-base" />
              WhatsApp Share
            </button>
            <button
              onClick={handleNativeShare}
              className="py-3 px-4 rounded-2xl bg-gray-900 hover:bg-gray-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
            >
              <FiShare2 className="w-4 h-4 text-white" />
              Share Link
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1.5 font-bold">
              <FiUsers className="w-4 h-4" />
            </div>
            <p className="text-lg font-black text-gray-900">{data.stats.totalReferrals}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Total Invited</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center">
            <div className="w-8 h-8 rounded-xl bg-green-50 text-green-600 flex items-center justify-center mx-auto mb-1.5 font-bold">
              <FiCheckCircle className="w-4 h-4" />
            </div>
            <p className="text-lg font-black text-green-600">{data.stats.rewardedReferrals}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Rewarded</p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm text-center">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-1.5 font-bold">
              <FiDollarSign className="w-4 h-4" />
            </div>
            <p className="text-lg font-black text-amber-600">₹{data.stats.totalEarnings}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">Earned</p>
          </div>
        </div>

        {/* How It Works */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
          <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider flex items-center gap-2">
            <FiInfo className="text-teal-600" /> How It Works
          </h3>

          <div className="space-y-3 pt-1">
            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-black shrink-0 border border-teal-100">
                1
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">Share your referral code</h4>
                <p className="text-[11px] text-gray-500">Send your link or code to other service workers & technicians.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-black shrink-0 border border-teal-100">
                2
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">New worker registers</h4>
                <p className="text-[11px] text-gray-500">They register using your code and upload required documents.</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center text-xs font-black shrink-0 border border-teal-100">
                3
              </div>
              <div>
                <h4 className="text-xs font-bold text-gray-900">Get ₹{data.rewardPerReferral} reward in wallet</h4>
                <p className="text-[11px] text-gray-500">Once verified, ₹{data.rewardPerReferral} is credited directly into your wallet earnings.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Referral History */}
        <div className="bg-white rounded-3xl p-5 shadow-sm border border-gray-100 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
              Referral History ({data.referrals.length})
            </h3>
          </div>

          {loading ? (
            <div className="py-6 text-center text-xs text-gray-400 font-medium">Loading history...</div>
          ) : data.referrals.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mx-auto text-gray-400">
                <FiUsers className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-gray-700">No referrals yet</p>
              <p className="text-[11px] text-gray-400">Share your code now to start earning rewards!</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {data.referrals.map((item) => (
                <div key={item.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-bold text-gray-900 truncate">
                        {item.referredWorker?.name || 'Registered Worker'}
                      </p>
                      <span className="text-[10px] text-gray-400 font-medium">
                        {item.referredWorker?.phone ? `(${item.referredWorker.phone})` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-gray-400">
                      <span>Joined {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    {item.status === 'rewarded' || item.status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-[10px] font-black border border-green-200">
                        <FiCheck className="w-3 h-3" /> +₹{item.rewardAmount || data.rewardPerReferral}
                      </span>
                    ) : item.status === 'rejected' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-50 text-red-600 text-[9px] font-bold">
                        <FiXCircle className="w-3 h-3" /> Rejected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[9px] font-bold">
                        <FiClock className="w-3 h-3" /> Pending Approval
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReferEarn;
