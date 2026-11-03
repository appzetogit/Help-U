import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiTag, FiPlus, FiEdit2, FiTrash2, FiSearch, FiX, FiCheck,
  FiClock, FiToggleLeft, FiToggleRight, FiBarChart2, FiUsers,
  FiPercent, FiDollarSign, FiRefreshCw, FiCopy, FiAlertCircle
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import api from '../../../../services/api';
import CouponAreaPicker from './CouponAreaPicker';
import { areaIsIncomplete, initialAreaMode } from './couponArea';
import ModalLock from '../../../../components/common/ModalLock';

// ─── helpers ─────────────────────────────────────────────────────────────────

const fmt = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const isExpired = (d) => d && new Date(d) < new Date();

const statusBadge = (coupon) => {
  if (!coupon.isActive) return { label: 'Inactive', cls: 'bg-gray-100 text-gray-600' };
  if (isExpired(coupon.validUntil)) return { label: 'Expired', cls: 'bg-red-100 text-red-600' };
  if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return { label: 'Used up', cls: 'bg-orange-100 text-orange-600' };
  return { label: 'Active', cls: 'bg-green-100 text-green-700' };
};

const EMPTY_FORM = {
  code: '', title: '', description: '',
  discountType: 'percentage', discountValue: '',
  maxDiscountAmount: '', minOrderAmount: '',
  validFrom: new Date().toISOString().slice(0, 10),
  validUntil: '',
  usageLimit: '', usageLimitPerUser: 1,
  firstBookingOnly: false, isAutoApply: false, isActive: true,
  categories: [], cities: [], zones: []
};

// ─── API service ──────────────────────────────────────────────────────────────

const couponApi = {
  list: (p = {}) => {
    const q = new URLSearchParams();
    if (p.status) q.set('status', p.status);
    if (p.search) q.set('search', p.search);
    if (p.page) q.set('page', p.page);
    return api.get(`/admin/coupons${q.toString() ? `?${q}` : ''}`);
  },
  create: (data) => api.post('/admin/coupons', data),
  update: (id, data) => api.put(`/admin/coupons/${id}`, data),
  remove: (id) => api.delete(`/admin/coupons/${id}`),
  stats: (id) => api.get(`/admin/coupons/${id}/stats`),
  toggleActive: (id, isActive) => api.put(`/admin/coupons/${id}`, { isActive }),
};

// ─── Toggle Switch ────────────────────────────────────────────────────────────

const Toggle = ({ checked, onChange, color = 'bg-blue-600' }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? color : 'bg-gray-300'}`}
  >
    <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
  </button>
);

// ─── Coupon Modal ─────────────────────────────────────────────────────────────

const CouponModal = ({ coupon, categories, cities, onClose, onSave }) => {
  const [form, setForm] = useState(coupon ? {
    ...coupon,
    validFrom: coupon.validFrom ? new Date(coupon.validFrom).toISOString().slice(0, 10) : '',
    validUntil: coupon.validUntil ? new Date(coupon.validUntil).toISOString().slice(0, 10) : '',
    discountValue: coupon.discountValue || '',
    maxDiscountAmount: coupon.maxDiscountAmount || '',
    minOrderAmount: coupon.minOrderAmount || '',
    usageLimit: coupon.usageLimit || '',
    usageLimitPerUser: coupon.usageLimitPerUser ?? 1,
    categories: coupon.categories?.map(c => c._id || c) || [],
    cities: coupon.cities?.map(c => c._id || c) || [],
    zones: coupon.zones?.map(z => z._id || z) || []
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [areaMode, setAreaMode] = useState(() => initialAreaMode(
    coupon?.cities?.map(c => c._id || c) || [],
    coupon?.zones?.map(z => z._id || z) || []
  ));

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    // An empty list means "no limit", so a limited mode with nothing picked would quietly become "everywhere"
    if (areaIsIncomplete(areaMode, form.cities, form.zones)) {
      toast.error(`Pick at least one ${areaMode === 'cities' ? 'city' : 'zone'}, or choose Everywhere`);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        discountValue: Number(form.discountValue),
        maxDiscountAmount: Number(form.maxDiscountAmount) || 0,
        minOrderAmount: Number(form.minOrderAmount) || 0,
        usageLimit: Number(form.usageLimit) || 0,
        usageLimitPerUser: Number(form.usageLimitPerUser) || 1,
      };
      await onSave(payload);
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to save coupon');
    } finally {
      setSaving(false);
    }
  };

  const inp = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50';
  const lbl = 'block text-xs font-semibold text-gray-600 mb-1.5';

  const toggleCategory = (id) =>
    set('categories', form.categories.includes(id) ? form.categories.filter(x => x !== id) : [...form.categories, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <ModalLock />
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <FiTag className="text-blue-600 text-lg" />
            </div>
            <h2 className="text-lg font-bold text-gray-800">{coupon ? 'Edit Coupon' : 'Create New Coupon'}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <FiX className="text-gray-500 text-xl" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* Code + Title */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Coupon Code *</label>
              <input required value={form.code} onChange={e => set('code', e.target.value.toUpperCase())}
                placeholder="e.g. SAVE50" className={`${inp} uppercase font-mono tracking-widest`} />
            </div>
            <div>
              <label className={lbl}>Title *</label>
              <input required value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Flat 50% Off" className={inp} />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={lbl}>Description</label>
            <textarea rows={2} value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Short description shown to customers" className={`${inp} resize-none`} />
          </div>

          {/* Discount config */}
          <div className="bg-blue-50 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-bold text-blue-800">Discount Configuration</h3>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={lbl}>Type *</label>
                <select required value={form.discountType} onChange={e => set('discountType', e.target.value)} className={inp}>
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                </select>
              </div>
              <div>
                <label className={lbl}>{form.discountType === 'percentage' ? 'Discount %' : 'Discount ₹'} *</label>
                <input required type="number" min="0.01" max={form.discountType === 'percentage' ? 100 : undefined}
                  step="0.01" value={form.discountValue} onChange={e => set('discountValue', e.target.value)}
                  placeholder={form.discountType === 'percentage' ? '50' : '200'} className={inp} />
              </div>
              {form.discountType === 'percentage' && (
                <div>
                  <label className={lbl}>Max Discount ₹ <span className="font-normal text-gray-400">(0=∞)</span></label>
                  <input type="number" min="0" value={form.maxDiscountAmount}
                    onChange={e => set('maxDiscountAmount', e.target.value)} placeholder="500" className={inp} />
                </div>
              )}
            </div>
            <div>
              <label className={lbl}>Min Order Amount ₹ <span className="font-normal text-gray-400">(0 = no minimum)</span></label>
              <input type="number" min="0" value={form.minOrderAmount}
                onChange={e => set('minOrderAmount', e.target.value)} placeholder="299" className={inp} />
            </div>
          </div>

          {/* Validity */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Valid From *</label>
              <input required type="date" value={form.validFrom} onChange={e => set('validFrom', e.target.value)} className={inp} />
            </div>
            <div>
              <label className={lbl}>Valid Until *</label>
              <input required type="date" value={form.validUntil} min={form.validFrom} onChange={e => set('validUntil', e.target.value)} className={inp} />
            </div>
          </div>

          {/* Usage limits */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Total Usage Limit <span className="font-normal text-gray-400">(0 = unlimited)</span></label>
              <input type="number" min="0" value={form.usageLimit}
                onChange={e => set('usageLimit', e.target.value)} placeholder="100" className={inp} />
            </div>
            <div>
              <label className={lbl}>Per-User Limit</label>
              <input type="number" min="1" value={form.usageLimitPerUser}
                onChange={e => set('usageLimitPerUser', e.target.value)} placeholder="1" className={inp} />
            </div>
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-3 flex-1 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
              <Toggle checked={form.firstBookingOnly} onChange={v => set('firstBookingOnly', v)} color="bg-purple-600" />
              <div>
                <p className="text-sm font-semibold text-gray-700">First Booking Only</p>
                <p className="text-xs text-gray-400">Only for new customers</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-1 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
              <Toggle checked={form.isActive} onChange={v => set('isActive', v)} color="bg-green-500" />
              <div>
                <p className="text-sm font-semibold text-gray-700">Active</p>
                <p className="text-xs text-gray-400">Coupon is live & usable</p>
              </div>
            </div>
          </div>

          {/* Auto-apply — shows as the offer strip inside the catalog */}
          <div className="flex items-center gap-3 bg-amber-50 rounded-xl px-4 py-3 border border-amber-100">
            <Toggle checked={form.isAutoApply} onChange={v => set('isAutoApply', v)} color="bg-amber-500" />
            <div>
              <p className="text-sm font-semibold text-gray-700">Auto-apply offer strip</p>
              <p className="text-xs text-gray-400">Show this coupon as a banner inside the service catalog without the customer typing a code</p>
            </div>
          </div>

          {/* Category restrictions */}
          {categories.length > 0 && (
            <div>
              <label className={lbl}>Restrict to Categories <span className="font-normal text-gray-400">(empty = all categories)</span></label>
              <div className="flex flex-wrap gap-2 mt-1">
                {categories.map(cat => (
                  <button key={cat._id} type="button" onClick={() => toggleCategory(cat._id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                      form.categories.includes(cat._id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                    }`}
                  >
                    {cat.title || cat.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Where it works: everywhere, specific cities, or specific zones */}
          <CouponAreaPicker
            mode={areaMode}
            onModeChange={setAreaMode}
            cities={cities}
            selectedCities={form.cities || []}
            selectedZones={form.zones || []}
            onChange={({ cities: c, zones: z }) => setForm(f => ({ ...f, cities: c, zones: z }))}
          />
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50 transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-60 flex items-center gap-2"
          >
            {saving ? <><FiRefreshCw className="animate-spin" /> Saving...</> : <><FiCheck /> {coupon ? 'Update Coupon' : 'Create Coupon'}</>}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Stats Modal ─────────────────────────────────────────────────────────────

const StatsModal = ({ couponId, couponCode, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    couponApi.stats(couponId)
      .then(r => { setData(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [couponId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <ModalLock />
      <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">
            Stats: <span className="font-mono text-blue-600">{couponCode}</span>
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><FiX className="text-gray-500" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <FiRefreshCw className="animate-spin text-gray-400 text-2xl" />
            </div>
          ) : !data ? (
            <p className="text-center text-gray-400 py-8">Failed to load stats</p>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: 'Total Uses', value: data.summary?.count || 0, icon: FiUsers, cls: 'text-blue-600 bg-blue-50' },
                  { label: 'Total Discount', value: fmt(data.summary?.totalDiscount), icon: FiPercent, cls: 'text-green-600 bg-green-50' },
                  { label: 'Order Value', value: fmt(data.summary?.totalOrderValue), icon: FiDollarSign, cls: 'text-purple-600 bg-purple-50' },
                ].map(s => (
                  <div key={s.label} className="bg-gray-50 rounded-xl p-4 text-center">
                    <div className={`w-9 h-9 rounded-xl ${s.cls} flex items-center justify-center mx-auto mb-2`}>
                      <s.icon className="text-lg" />
                    </div>
                    <p className="text-lg font-bold text-gray-800">{s.value}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-bold text-gray-700 mb-3">Recent Redemptions</h3>
              {!data.redemptions?.length ? (
                <p className="text-sm text-gray-400 text-center py-4">No redemptions yet</p>
              ) : (
                <div className="space-y-2">
                  {data.redemptions.map((r, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-gray-700">{r.userId?.name || 'Unknown'}</p>
                        <p className="text-xs text-gray-400">{r.userId?.phone} · {fmtDate(r.createdAt)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-green-600">-{fmt(r.discountAmount)}</p>
                        <p className="text-xs text-gray-400">on {fmt(r.orderAmount)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [modalCoupon, setModalCoupon] = useState(undefined); // undefined=closed, null=create, obj=edit
  const [statsId, setStatsId] = useState(null);
  const [statsCode, setStatsCode] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [cities, setCities] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });

  const fetchCoupons = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await couponApi.list({ status: filterStatus !== 'all' ? filterStatus : undefined, search, page });
      setCoupons(res.data.coupons || []);
      setPagination({ page: res.data.page || 1, pages: res.data.pages || 1, total: res.data.total || 0 });
    } catch {
      toast.error('Failed to load coupons');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, search]);

  useEffect(() => { fetchCoupons(1); }, [fetchCoupons]);

  useEffect(() => {
    api.get('/admin/categories').then(r => setCategories(r.data.categories || r.data.data || [])).catch(() => {});
    api.get('/admin/cities').then(r => setCities(r.data.cities || r.data.data || [])).catch(() => {});
  }, []);

  const handleSave = async (payload) => {
    if (modalCoupon) {
      await couponApi.update(modalCoupon._id, payload);
      toast.success('Coupon updated!');
    } else {
      await couponApi.create(payload);
      toast.success('Coupon created!');
    }
    fetchCoupons(pagination.page);
  };

  const handleDelete = async () => {
    try {
      const res = await couponApi.remove(deleteId);
      toast.success(res.data.deactivated ? 'Coupon deactivated (has redemptions)' : 'Coupon deleted');
      setDeleteId(null);
      fetchCoupons(pagination.page);
    } catch {
      toast.error('Failed to delete coupon');
    }
  };

  const handleToggle = async (coupon) => {
    try {
      await couponApi.toggleActive(coupon._id, !coupon.isActive);
      toast.success(`Coupon ${coupon.isActive ? 'deactivated' : 'activated'}`);
      fetchCoupons(pagination.page);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const copyCode = (code) => {
    navigator.clipboard?.writeText(code).then(() => toast.success('Code copied!'));
  };

  const statusFilters = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'expired', label: 'Expired' },
  ];

  // Stat counters from current page data
  const activeCnt = coupons.filter(c => statusBadge(c).label === 'Active').length;
  const expiredCnt = coupons.filter(c => isExpired(c.validUntil)).length;
  const totalUses = coupons.reduce((s, c) => s + (c.usedCount || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-6">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Coupon Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Create and manage discount codes for customers</p>
        </div>
        <button
          onClick={() => setModalCoupon(null)}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm shadow-blue-200"
        >
          <FiPlus /> Create Coupon
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Coupons', value: pagination.total, color: 'text-gray-800', bg: 'bg-white border border-gray-100' },
          { label: 'Active (this page)', value: activeCnt, color: 'text-green-700', bg: 'bg-green-50' },
          { label: 'Expired (this page)', value: expiredCnt, color: 'text-red-700', bg: 'bg-red-50' },
          { label: 'Uses (this page)', value: totalUses, color: 'text-blue-700', bg: 'bg-blue-50' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-4 shadow-sm`}>
            <p className="text-xs text-gray-500 font-medium">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color} mt-1`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by code or title..."
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {statusFilters.map(f => (
            <button key={f.value} onClick={() => setFilterStatus(f.value)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${filterStatus === f.value ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <FiRefreshCw className="animate-spin text-gray-400 text-2xl" />
          </div>
        ) : coupons.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
              <FiTag className="text-gray-400 text-3xl" />
            </div>
            <p className="text-gray-600 font-semibold">No coupons found</p>
            <p className="text-gray-400 text-sm mt-1">Create your first coupon to get started</p>
            <button onClick={() => setModalCoupon(null)}
              className="mt-4 px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors"
            >
              + Create Coupon
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {['Code / Title', 'Discount', 'Validity', 'Usage', 'Status', ''].map(h => (
                    <th key={h} className="text-left text-xs font-bold text-gray-500 uppercase px-5 py-3.5">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {coupons.map((coupon, idx) => {
                  const badge = statusBadge(coupon);
                  return (
                    <motion.tr key={coupon._id}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Code + Title */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <code className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-mono font-bold tracking-widest">
                            {coupon.code}
                          </code>
                          <button onClick={() => copyCode(coupon.code)} className="text-gray-300 hover:text-blue-500 transition-colors">
                            <FiCopy className="text-xs" />
                          </button>
                        </div>
                        <p className="text-sm text-gray-700 font-medium mt-1">{coupon.title}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {coupon.firstBookingOnly && (
                            <span className="inline-flex items-center text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded font-semibold">
                              First booking only
                            </span>
                          )}
                          {Array.isArray(coupon.zones) && coupon.zones.length > 0 && (
                            <span className="inline-flex items-center text-[10px] text-indigo-600 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded font-semibold">
                              {coupon.zones.length} {coupon.zones.length === 1 ? 'Zone' : 'Zones'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Discount */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5">
                          {coupon.discountType === 'percentage'
                            ? <FiPercent className="text-green-500 text-sm" />
                            : <FiDollarSign className="text-green-500 text-sm" />
                          }
                          <span className="text-base font-bold text-gray-800">
                            {coupon.discountType === 'percentage' ? `${coupon.discountValue}%` : fmt(coupon.discountValue)}
                          </span>
                        </div>
                        {coupon.minOrderAmount > 0 && <p className="text-xs text-gray-400 mt-0.5">Min: {fmt(coupon.minOrderAmount)}</p>}
                        {coupon.discountType === 'percentage' && coupon.maxDiscountAmount > 0 && (
                          <p className="text-xs text-gray-400">Max: {fmt(coupon.maxDiscountAmount)}</p>
                        )}
                      </td>

                      {/* Validity */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <FiClock className="text-gray-400 flex-shrink-0" />
                          <div>
                            <p>{fmtDate(coupon.validFrom)}</p>
                            <p className="text-gray-400">to {fmtDate(coupon.validUntil)}</p>
                          </div>
                        </div>
                      </td>

                      {/* Usage */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-700">{coupon.usedCount || 0}</span>
                          {coupon.usageLimit > 0 && (
                            <span className="text-xs text-gray-400">/ {coupon.usageLimit}</span>
                          )}
                        </div>
                        {coupon.usageLimit > 0 && (
                          <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full w-20 overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full"
                              style={{ width: `${Math.min(100, ((coupon.usedCount || 0) / coupon.usageLimit) * 100)}%` }}
                            />
                          </div>
                        )}
                        <p className="text-[10px] text-gray-400 mt-1">per user: {coupon.usageLimitPerUser || 1}</p>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => { setStatsId(coupon._id); setStatsCode(coupon.code); }}
                            className="p-2 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-lg transition-colors" title="Stats">
                            <FiBarChart2 className="text-base" />
                          </button>
                          <button onClick={() => handleToggle(coupon)}
                            className={`p-2 rounded-lg transition-colors ${coupon.isActive ? 'hover:bg-red-50 text-green-500 hover:text-red-500' : 'hover:bg-green-50 text-gray-400 hover:text-green-600'}`}
                            title={coupon.isActive ? 'Deactivate' : 'Activate'}>
                            {coupon.isActive ? <FiToggleRight className="text-xl" /> : <FiToggleLeft className="text-xl" />}
                          </button>
                          <button onClick={() => setModalCoupon(coupon)}
                            className="p-2 hover:bg-yellow-50 text-gray-400 hover:text-yellow-600 rounded-lg transition-colors" title="Edit">
                            <FiEdit2 className="text-base" />
                          </button>
                          <button onClick={() => setDeleteId(coupon._id)}
                            className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-lg transition-colors" title="Delete">
                            <FiTrash2 className="text-base" />
                          </button>
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.pages > 1 && (
          <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">Page {pagination.page} of {pagination.pages} · {pagination.total} total</p>
            <div className="flex gap-2">
              <button disabled={pagination.page <= 1} onClick={() => fetchCoupons(pagination.page - 1)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Prev</button>
              <button disabled={pagination.page >= pagination.pages} onClick={() => fetchCoupons(pagination.page + 1)}
                className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modalCoupon !== undefined && (
          <CouponModal coupon={modalCoupon} categories={categories} cities={cities}
            onClose={() => setModalCoupon(undefined)} onSave={handleSave} />
        )}
        {statsId && <StatsModal couponId={statsId} couponCode={statsCode} onClose={() => setStatsId(null)} />}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <ModalLock />
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                  <FiAlertCircle className="text-red-600 text-xl" />
                </div>
                <h3 className="text-lg font-bold text-gray-800">Delete Coupon?</h3>
              </div>
              <p className="text-sm text-gray-600 mb-5">If this coupon has been redeemed, it will be <b>deactivated</b> instead of permanently deleted to preserve history.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteId(null)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-gray-50">Cancel</button>
                <button onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700">Delete</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminCoupons;
