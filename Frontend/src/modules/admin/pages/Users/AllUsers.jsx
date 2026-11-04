import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiUser, FiPhone, FiMail, FiMapPin, FiCheckCircle, FiSlash, FiCheck, FiTrash2, FiCreditCard, FiPlus, FiMinus, FiX, FiRefreshCw } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { adminUserService } from '../../../../services/adminUserService';
import DataExportButton from '../../components/common/DataExportButton';
import ModalLock from '../../../../components/common/ModalLock';

const formatSavedAddress = (addresses = []) => {
  if (!Array.isArray(addresses) || addresses.length === 0) return 'No saved address';

  const primaryAddress = addresses.find((address) => address?.isDefault) || addresses[0];
  const formattedAddress = [
    primaryAddress?.addressLine1,
    primaryAddress?.addressLine2,
    primaryAddress?.city,
    primaryAddress?.state,
    primaryAddress?.pincode
  ]
    .filter(Boolean)
    .join(', ');

  return formattedAddress || 'No saved address';
};

const AllUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get('search') || '');
  // The header search opens this list with ?search=…; follow it when it changes
  const [urlParams] = useSearchParams();
  useEffect(() => {
    const fromUrl = urlParams.get('search');
    if (fromUrl !== null) setSearch(fromUrl);
  }, [urlParams]);

  const [statusFilter, setStatusFilter] = useState('all'); // all, active, inactive
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Wallet Modal state
  const [selectedWalletUser, setSelectedWalletUser] = useState(null);
  const [walletData, setWalletData] = useState(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustForm, setAdjustForm] = useState({
    amount: '',
    action: 'credit',
    walletType: 'balance',
    description: ''
  });

  const openWalletModal = async (user) => {
    setSelectedWalletUser(user);
    setAdjustForm({
      amount: '',
      action: 'credit',
      walletType: 'balance',
      description: ''
    });
    try {
      setWalletLoading(true);
      const res = await adminUserService.getUserWalletTransactions(user._id);
      if (res.success) {
        setWalletData(res.data);
      }
    } catch (err) {
      toast.error('Failed to load wallet data');
    } finally {
      setWalletLoading(false);
    }
  };

  const handleAdjustWallet = async (e) => {
    e.preventDefault();
    if (!adjustForm.amount || Number(adjustForm.amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }
    try {
      setAdjusting(true);
      const res = await adminUserService.adjustUserWallet(selectedWalletUser._id, adjustForm);
      if (res.success) {
        toast.success(res.message);
        // Reload wallet transactions
        const walletRes = await adminUserService.getUserWalletTransactions(selectedWalletUser._id);
        if (walletRes.success) {
          setWalletData(walletRes.data);
        }
        // Update user in main list
        setUsers(prev => prev.map(u => {
          if (u._id === selectedWalletUser._id) {
            return { ...u, wallet: res.data.wallet };
          }
          return u;
        }));
        setAdjustForm({ amount: '', action: 'credit', walletType: 'balance', description: '' });
      }
    } catch (err) {
      toast.error(err.message || 'Failed to adjust wallet');
    } finally {
      setAdjusting(false);
    }
  };

  // Debounce search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 whenever search, status filter, or limit changes
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, limit]);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit,
        search: debouncedSearch
      };

      if (statusFilter !== 'all') {
        params.isActive = statusFilter === 'active';
      }

      const response = await adminUserService.getAllUsers(params);
      if (response.success) {
        setUsers(response.data);
        setTotalPages(response.pagination.pages);
        setTotalUsers(response.pagination.total);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [page, debouncedSearch, statusFilter, limit]);

  const handleStatusToggle = async (userId, currentStatus) => {
    if (!window.confirm(`Are you sure you want to ${currentStatus ? 'block' : 'activate'} this user?`)) {
      return;
    }

    try {
      const response = await adminUserService.toggleUserStatus(userId, !currentStatus);
      if (response.success) {
        toast.success(response.message);
        setUsers(users.map(user =>
          user._id === userId ? { ...user, isActive: !currentStatus } : user
        ));
      }
    } catch (error) {
      toast.error(error.message || 'Failed to update user status');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await adminUserService.deleteUser(userId);
      if (response.success) {
        toast.success(response.message);
        fetchUsers();
      }
    } catch (error) {
      toast.error(error.message || 'Failed to delete user');
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <FiSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all text-xs"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 focus:outline-none focus:border-green-500 cursor-pointer"
          >
            <option value="all">All Status</option>
            <option value="active">Active Only</option>
            <option value="inactive">Blocked Only</option>
          </select>

          <DataExportButton
            entity="users"
            label="users"
            params={{ search: search.trim(), isActive: statusFilter === 'all' ? undefined : statusFilter === 'active' }}
            filterText={[search.trim() && `search "${search.trim()}"`, statusFilter === 'active' && 'active only', statusFilter === 'inactive' && 'blocked only'].filter(Boolean).join(', ')}
          />

          <div className="px-3 py-2 bg-green-50 rounded-lg border border-green-100">
            <span className="text-xs font-bold text-green-700">{totalUsers} Users</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">User</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Wallet Balance</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider">Joined Date</th>
                <th className="px-4 py-3 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-xs text-gray-500">Loading users...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-xs text-gray-500">No users found</td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                          <FiUser className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-xs">{user.name}</p>
                          <p className="text-[10px] text-gray-400">ID: {user._id.slice(-6).toUpperCase()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-gray-600 text-[11px]">
                          <FiMail className="w-3 h-3" />
                          <span>{user.email || 'No email'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-gray-600 text-[11px]">
                          <FiPhone className="w-3 h-3" />
                          <span>{user.phone}</span>
                        </div>
                        <div className="flex items-start gap-1.5 text-gray-600 text-[11px]">
                          <FiMapPin className="w-3 h-3 mt-0.5 shrink-0" />
                          <span className="leading-4">{formatSavedAddress(user.addresses)}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <span className="font-bold text-xs text-slate-900">
                          ₹{Number(user.wallet?.balance || 0).toLocaleString('en-IN')}
                        </span>
                        <div className="flex flex-wrap gap-1 text-[10px]">
                          {user.wallet?.promoBalance > 0 && (
                            <span className="bg-teal-50 text-teal-700 px-1.5 py-0.2 rounded font-medium border border-teal-100">
                              +₹{user.wallet.promoBalance} promo
                            </span>
                          )}
                          {user.wallet?.cashbackBalance > 0 && (
                            <span className="bg-amber-50 text-amber-700 px-1.5 py-0.2 rounded font-medium border border-amber-100">
                              +₹{user.wallet.cashbackBalance} cb
                            </span>
                          )}
                          {user.wallet?.penalty > 0 && (
                            <span className="bg-red-50 text-red-700 px-1.5 py-0.2 rounded font-medium border border-red-100">
                              -₹{user.wallet.penalty} pen
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${user.isActive
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                        }`}>
                        {user.isActive ? 'Active' : 'Blocked'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[10px] text-gray-600 font-medium">
                        {new Date(user.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric'
                        })}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => openWalletModal(user)}
                          className="p-1.5 text-teal-600 hover:bg-teal-50 rounded-lg transition-colors"
                          title="Manage User Wallet (Credit/Debit)"
                        >
                          <FiCreditCard className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleStatusToggle(user._id, user.isActive)}
                          className={`p-1.5 rounded-lg transition-colors ${user.isActive
                            ? 'text-red-500 hover:bg-red-50'
                            : 'text-green-500 hover:bg-green-50'
                            }`}
                          title={user.isActive ? 'Block User' : 'Activate User'}
                        >
                          {user.isActive ? <FiSlash className="w-3.5 h-3.5" /> : <FiCheck className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user._id)}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete User"
                        >
                          <FiTrash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && users.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/30">
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">
                Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, totalUsers)} of {totalUsers} users
              </p>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="px-2 py-1 bg-white border border-gray-200 rounded text-[11px] text-gray-600 focus:outline-none cursor-pointer"
              >
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-gray-500 font-medium mr-1">
                Page {page} of {Math.max(1, totalPages)}
              </span>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-white transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                Prev
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-bold text-gray-600 disabled:opacity-50 hover:bg-white transition-all cursor-pointer disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Wallet Management Modal */}
      <AnimatePresence>
        {selectedWalletUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <ModalLock />
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-xl overflow-hidden border border-gray-100 flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/20 text-teal-300 flex items-center justify-center font-bold">
                    <FiCreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">
                      Wallet: {selectedWalletUser.name}
                    </h3>
                    <p className="text-xs text-slate-300">{selectedWalletUser.phone} · {selectedWalletUser.email || 'No email'}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedWalletUser(null)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <FiX className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-6">
                {/* Balance Cards */}
                <div className="grid grid-cols-4 gap-2">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Cash</p>
                    <p className="text-base font-extrabold text-slate-900 mt-0.5">
                      ₹{walletData ? Number(walletData.balance || 0).toLocaleString('en-IN') : '...'}
                    </p>
                  </div>
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-teal-700 uppercase">Promo</p>
                    <p className="text-base font-extrabold text-teal-800 mt-0.5">
                      ₹{walletData ? Number(walletData.promoBalance || 0).toLocaleString('en-IN') : '...'}
                    </p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-amber-700 uppercase">Cashback</p>
                    <p className="text-base font-extrabold text-amber-800 mt-0.5">
                      ₹{walletData ? Number(walletData.cashbackBalance || 0).toLocaleString('en-IN') : '...'}
                    </p>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <p className="text-[10px] font-bold text-red-700 uppercase">Penalty</p>
                    <p className="text-base font-extrabold text-red-700 mt-0.5">
                      ₹{walletData ? Number(walletData.penalty || 0).toLocaleString('en-IN') : '...'}
                    </p>
                  </div>
                </div>

                {/* Adjust Form */}
                <form onSubmit={handleAdjustWallet} className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    Manual Wallet Credit / Debit
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Action</label>
                      <select
                        value={adjustForm.action}
                        onChange={e => setAdjustForm({ ...adjustForm, action: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-semibold"
                      >
                        <option value="credit">Credit (Add Funds)</option>
                        <option value="debit">Debit (Deduct Funds)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Wallet Bucket</label>
                      <select
                        value={adjustForm.walletType}
                        onChange={e => setAdjustForm({ ...adjustForm, walletType: e.target.value })}
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-semibold"
                      >
                        <option value="balance">Wallet Cash</option>
                        <option value="promoBalance">Promo Credits</option>
                        <option value="cashbackBalance">Cashback</option>
                        <option value="penalty">Penalty</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Amount (₹)</label>
                      <input
                        type="number"
                        min="1"
                        required
                        value={adjustForm.amount}
                        onChange={e => setAdjustForm({ ...adjustForm, amount: e.target.value })}
                        placeholder="e.g. 100"
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Note / Reason</label>
                      <input
                        type="text"
                        value={adjustForm.description}
                        onChange={e => setAdjustForm({ ...adjustForm, description: e.target.value })}
                        placeholder="e.g. Festival Promotional Bonus"
                        className="w-full px-3 py-2 text-xs bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                  </div>

                  <div className="pt-1 flex justify-end">
                    <button
                      type="submit"
                      disabled={adjusting}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {adjusting ? 'Processing...' : (adjustForm.action === 'credit' ? 'Apply Credit' : 'Apply Debit')}
                    </button>
                  </div>
                </form>

                {/* Recent Transactions List */}
                <div>
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide mb-2">
                    Recent Wallet Transactions
                  </h4>
                  {walletLoading ? (
                    <div className="text-center py-6 text-xs text-gray-400">Loading history...</div>
                  ) : !walletData?.transactions || walletData.transactions.length === 0 ? (
                    <div className="text-center py-6 text-xs text-gray-400 bg-gray-50 rounded-lg">No transactions found</div>
                  ) : (
                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                      {walletData.transactions.map((txn, idx) => (
                        <div key={txn._id || idx} className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-lg flex items-center justify-between text-xs">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.2 rounded text-[9px] font-bold uppercase tracking-wider ${
                                ['credit', 'promo_credit', 'cashback', 'referral_bonus'].includes(txn.type)
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-red-100 text-red-800'
                              }`}>
                                {txn.type}
                              </span>
                              <span className="font-medium text-slate-800 truncate max-w-[240px]">{txn.description}</span>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {new Date(txn.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={`font-bold font-mono text-sm ${
                            ['credit', 'promo_credit', 'cashback', 'referral_bonus'].includes(txn.type) ? 'text-emerald-600' : 'text-red-600'
                          }`}>
                            {['credit', 'promo_credit', 'cashback', 'referral_bonus'].includes(txn.type) ? '+' : '-'}₹{txn.amount}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AllUsers;
