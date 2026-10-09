import React, { useState, useEffect } from 'react';
import {
  FiUsers,
  FiDollarSign,
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiSettings,
  FiSearch,
  FiFilter,
  FiCheck,
  FiX,
  FiGift,
  FiPhone,
  FiBriefcase,
  FiAlertCircle
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';

const WorkerReferrals = () => {
  const [loading, setLoading] = useState(true);
  const [referrals, setReferrals] = useState([]);
  const [stats, setStats] = useState({
    totalReferrals: 0,
    pendingReferrals: 0,
    rewardedReferrals: 0,
    totalRewardsDisbursed: 0
  });
  const [settings, setSettings] = useState({
    vendorReferralEnabled: true,
    vendorReferralReward: 100,
    vendorReferralCriteria: 'MANUAL_ADMIN_APPROVAL'
  });

  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    fetchReferrals();
  }, [filter]);

  const fetchReferrals = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filter !== 'all') params.status = filter;
      if (search) params.search = search;

      const res = await api.get('/admin/referrals', { params });
      if (res.data.success) {
        setReferrals(res.data.data);
        if (res.data.stats) setStats(res.data.stats);
        if (res.data.settings) setSettings(res.data.settings);
      }
    } catch (err) {
      console.error('Error fetching admin referrals:', err);
      toast.error('Failed to load referrals');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchReferrals();
  };

  const handleApprove = async (referral) => {
    const reward = referral.rewardAmount || settings.vendorReferralReward || 100;
    if (!window.confirm(`Are you sure you want to approve this referral and credit ₹${reward} directly to ${referral.referrerId?.name}'s wallet?`)) {
      return;
    }

    try {
      setActionLoading(referral._id);
      const res = await api.put(`/admin/referrals/${referral._id}/approve`, {
        customRewardAmount: reward
      });
      if (res.data.success) {
        toast.success(res.data.message || 'Reward credited successfully!');
        fetchReferrals();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to approve referral');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (referral) => {
    const reason = window.prompt('Enter rejection reason (optional):', 'Referral criteria not met');
    if (reason === null) return; // User cancelled prompt

    try {
      setActionLoading(referral._id);
      const res = await api.put(`/admin/referrals/${referral._id}/reject`, { reason });
      if (res.data.success) {
        toast.success('Referral rejected');
        fetchReferrals();
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to reject referral');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      setSavingSettings(true);
      const res = await api.put('/admin/referrals/settings', settings);
      if (res.data.success) {
        toast.success('Referral settings updated successfully!');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Failed to update settings');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-xl font-bold">
            <FiUsers />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Referrals</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5">{stats.totalReferrals}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-xl font-bold">
            <FiClock />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Pending Approvals</p>
            <p className="text-2xl font-black text-amber-600 mt-0.5">{stats.pendingReferrals}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-green-50 text-green-600 flex items-center justify-center text-xl font-bold">
            <FiCheckCircle />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Rewarded Referrals</p>
            <p className="text-2xl font-black text-green-600 mt-0.5">{stats.rewardedReferrals}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-xl font-bold">
            <FiDollarSign />
          </div>
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Rewards Disbursed</p>
            <p className="text-2xl font-black text-purple-600 mt-0.5">₹{stats.totalRewardsDisbursed}</p>
          </div>
        </div>
      </div>

      {/* Referral Settings Card */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-gray-100">
          <FiSettings className="w-5 h-5 text-blue-600" />
          <h3 className="text-base font-bold text-gray-900">Worker Referral Program Settings</h3>
        </div>

        <form onSubmit={handleSaveSettings} className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Program Status
            </label>
            <select
              value={settings.vendorReferralEnabled ? 'true' : 'false'}
              onChange={(e) => setSettings({ ...settings, vendorReferralEnabled: e.target.value === 'true' })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-semibold text-gray-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="true">Active (Enabled)</option>
              <option value="false">Disabled (Paused)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
              Referrer Reward Amount (₹)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-bold text-xs">₹</span>
              <input
                type="number"
                min="0"
                step="10"
                value={settings.vendorReferralReward}
                onChange={(e) => setSettings({ ...settings, vendorReferralReward: Number(e.target.value) })}
                className="w-full pl-7 pr-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="100"
                required
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={savingSettings}
              className="w-full py-2 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase tracking-wider shadow-sm transition-colors disabled:opacity-50"
            >
              {savingSettings ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>

      {/* Referrals List Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {/* Filters & Search */}
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3 justify-between items-center bg-gray-50/50">
          {/* Status Tabs */}
          <div className="flex gap-1.5 overflow-x-auto w-full sm:w-auto">
            {[
              { key: 'all', label: 'All' },
              { key: 'pending', label: 'Pending' },
              { key: 'rewarded', label: 'Rewarded' },
              { key: 'rejected', label: 'Rejected' }
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${filter === f.key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                  }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2 w-full sm:w-72">
            <div className="relative flex-1">
              <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search worker, code, phone..."
                className="w-full pl-9 pr-3 py-1.5 bg-white border border-gray-300 rounded-xl text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold rounded-xl"
            >
              Search
            </button>
          </form>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50/60 border-b border-gray-100">
              <tr>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Referrer Worker</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Referred Worker (New)</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Referral Code</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Reward (₹)</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Date Joined</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-xs text-gray-500 font-medium">
                    Loading referrals...
                  </td>
                </tr>
              ) : referrals.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-xs text-gray-500 font-medium">
                    No referrals found
                  </td>
                </tr>
              ) : (
                referrals.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50 transition-colors">
                    {/* Referrer */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-bold text-gray-900">{item.referrerId?.name || 'N/A'}</p>
                        <p className="text-[10px] text-gray-500">{item.referrerId?.phone}</p>
                        <p className="text-[9px] text-teal-600 font-medium">
                          Wallet: ₹{item.referrerId?.wallet?.earnings || 0}
                        </p>
                      </div>
                    </td>

                    {/* Referred Worker */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-xs font-bold text-gray-900">{item.referredVendorId?.name || 'New Worker'}</p>
                        <p className="text-[10px] text-gray-500">{item.referredVendorId?.phone}</p>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                          item.referredVendorId?.approvalStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {item.referredVendorId?.approvalStatus || 'PENDING'}
                        </span>
                      </div>
                    </td>

                    {/* Referral Code */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs font-bold text-gray-800 bg-gray-100 px-2 py-0.5 rounded-md border border-gray-200">
                        {item.referralCode}
                      </span>
                    </td>

                    {/* Reward */}
                    <td className="px-4 py-3">
                      <span className="text-xs font-black text-green-700">
                        ₹{item.rewardAmount || settings.vendorReferralReward || 100}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${
                        item.status === 'rewarded' || item.status === 'approved'
                          ? 'bg-green-100 text-green-800 border border-green-200'
                          : item.status === 'rejected'
                          ? 'bg-red-100 text-red-800 border border-red-200'
                          : 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                      }`}>
                        {item.status === 'rewarded' ? 'Rewarded' : item.status}
                      </span>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-[10px] text-gray-500 font-medium">
                      {new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      {item.status === 'pending' ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleApprove(item)}
                            disabled={actionLoading === item._id}
                            className="px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider shadow-sm transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            <FiCheck className="w-3 h-3" />
                            Approve & Credit ₹{item.rewardAmount || settings.vendorReferralReward}
                          </button>
                          <button
                            onClick={() => handleReject(item)}
                            disabled={actionLoading === item._id}
                            className="p-1 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Reject Referral"
                          >
                            <FiX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-gray-400 font-medium italic">
                          {item.status === 'rewarded' ? `Credited on ${new Date(item.rewardedAt || item.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'Closed'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WorkerReferrals;
