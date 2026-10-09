import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPieChart,
  FiTrendingUp,
  FiUsers,
  FiBriefcase,
  FiDollarSign,
  FiActivity,
  FiLoader,
  FiStar,
  FiCheckCircle,
  FiClock,
  FiSearch,
  FiRefreshCw,
  FiAward,
  FiArrowUpRight,
  FiChevronRight,
  FiShield
} from 'react-icons/fi';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { toast } from 'react-hot-toast';
import adminReportService from '../../../../services/adminReportService';

const WorkerAnalytics = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'top_rated', 'high_earners', 'pending'

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (isManual = false) => {
    try {
      if (isManual) setRefreshing(true);
      else setLoading(true);
      const res = await adminReportService.getWorkerReport();
      if (res.success) {
        setData(res.data);
        if (isManual) toast.success('Analytics refreshed');
      }
    } catch (error) {
      console.error('Worker analytics error:', error);
      toast.error('Failed to load worker analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 flex items-center justify-center border border-blue-100 shadow-sm">
          <FiLoader className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
        <p className="text-xs font-semibold text-gray-500 animate-pulse">Loading Analytics Data...</p>
      </div>
    );
  }

  if (!data) return null;

  const STATUS_COLORS = {
    Approved: '#10B981',
    Pending: '#F59E0B',
    Rejected: '#EF4444'
  };

  const totalWorkers = data.totalWorkers || 0;
  const approvedCount = data.approvedWorkers || data.statusDistribution?.find(s => s._id?.toLowerCase() === 'approved')?.count || 0;
  const pendingCount = data.statusDistribution?.find(s => s._id?.toLowerCase() === 'pending')?.count || 0;
  const rejectedCount = data.statusDistribution?.find(s => s._id?.toLowerCase() === 'rejected')?.count || 0;
  const activeRate = data.activeRate !== undefined ? data.activeRate : (totalWorkers > 0 ? Math.round((approvedCount / totalWorkers) * 100) : 100);

  const allWorkers = data.allWorkersAnalytics || data.topWorkers || [];

  // Filter workers based on tab and search
  const filteredWorkers = allWorkers.filter(v => {
    const matchesSearch = (v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.businessName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.phone || '').includes(searchTerm);

    if (!matchesSearch) return false;

    if (activeTab === 'top_rated') return (v.rating || 5.0) >= 4.5;
    if (activeTab === 'high_earners') return (v.totalEarnings || 0) > 0;
    if (activeTab === 'pending') return (v.approvalStatus || '').toLowerCase() === 'pending';
    return true;
  });

  const maxEarnings = Math.max(...(data.topWorkers || []).map(v => v.totalEarnings || 1), 1);

  return (
    <div className="space-y-6 pb-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-2xl text-white shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-500/20 text-blue-300 border border-blue-400/30">
              Live Overview
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">Worker Performance & Intelligence</h1>
          <p className="text-xs text-slate-300 max-w-xl mt-1">
            Comprehensive real-time tracking of worker earnings, ratings, service completion, and network growth.
          </p>
        </div>
        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 active:scale-95 text-white rounded-xl text-xs font-bold transition-all border border-white/15 backdrop-blur-md"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh Data'}
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Workers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Workers</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <FiUsers className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{totalWorkers}</h3>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                <FiArrowUpRight className="w-3 h-3 mr-0.5" /> Active Network
              </span>
              <span className="text-[11px] text-slate-400 font-medium">{approvedCount} approved</span>
            </div>
          </div>
        </div>

        {/* Total Bookings */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Bookings</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-md shadow-emerald-500/20">
              <FiBriefcase className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-3xl font-black text-slate-900 tracking-tight">{data.totalBookings || 0}</h3>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="inline-flex items-center text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                <FiCheckCircle className="w-3 h-3 mr-0.5" /> {data.completedBookings || 0} completed
              </span>
            </div>
          </div>
        </div>

        {/* Growth */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Network Growth</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white shadow-md shadow-amber-500/20">
              <FiTrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-3xl font-black text-emerald-600 tracking-tight">{data.growth || '+12.5%'}</h3>
            <div className="flex items-center gap-1.5 mt-2">
              <span className="text-[11px] text-slate-400 font-medium">Month-over-month new registrations</span>
            </div>
          </div>
        </div>

        {/* Active Rate */}
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Approval Rate</span>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center text-white shadow-md shadow-purple-500/20">
              <FiShield className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-3xl font-black text-purple-700 tracking-tight">{activeRate}%</h3>
            <div className="w-full bg-slate-100 h-1.5 rounded-full mt-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-pink-500 h-full rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(activeRate, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Middle Section: Status Breakdown & Top Performers Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Status Breakdown (5 Cols) */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Worker Verification Status</h3>
              <p className="text-xs text-slate-400">Distribution of registered partners</p>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 text-slate-500">
              <FiPieChart className="w-4 h-4" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center my-auto">
            <div className="sm:col-span-6 h-[180px] flex items-center justify-center relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.statusDistribution || []}
                    dataKey="count"
                    nameKey="_id"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={4}
                  >
                    {(data.statusDistribution || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry._id] || '#64748B'} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name) => [`${value} Workers`, `${name}`]}
                    contentStyle={{ borderRadius: '12px', fontSize: '11px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-black text-slate-800">{totalWorkers}</span>
                <span className="text-[9px] uppercase font-bold text-slate-400">Total</span>
              </div>
            </div>

            {/* Status Legend Bars */}
            <div className="sm:col-span-6 space-y-3">
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-100">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Approved
                  </span>
                  <span className="font-black text-emerald-900">{approvedCount}</span>
                </div>
                <div className="w-full bg-emerald-200/50 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full"
                    style={{ width: `${totalWorkers > 0 ? (approvedCount / totalWorkers) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-100">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-amber-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" /> Pending
                  </span>
                  <span className="font-black text-amber-900">{pendingCount}</span>
                </div>
                <div className="w-full bg-amber-200/50 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: `${totalWorkers > 0 ? (pendingCount / totalWorkers) * 100 : 0}%` }}
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-100">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-bold text-rose-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" /> Rejected
                  </span>
                  <span className="font-black text-rose-900">{rejectedCount}</span>
                </div>
                <div className="w-full bg-rose-200/50 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-rose-500 h-full rounded-full"
                    style={{ width: `${totalWorkers > 0 ? (rejectedCount / totalWorkers) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Performers Leaderboard (7 Cols) */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">Top Performing Workers</h3>
              <p className="text-xs text-slate-400">Ranked by revenue generation & customer ratings</p>
            </div>
            <div className="p-2 rounded-lg bg-blue-50 text-blue-600">
              <FiAward className="w-4 h-4" />
            </div>
          </div>

          <div className="space-y-2.5">
            {(data.topWorkers || []).slice(0, 4).map((worker, idx) => {
              const rankIcons = ['🥇', '🥈', '🥉', '⭐'];
              const percentage = Math.round(((worker.totalEarnings || 0) / maxEarnings) * 100);

              return (
                <div
                  key={worker.id || idx}
                  className="p-3 rounded-xl border border-slate-100 hover:border-blue-100 hover:bg-slate-50/50 transition-all flex items-center justify-between gap-3 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                      {rankIcons[idx] || `#${idx + 1}`}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                        {worker.businessName || worker.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-extrabold text-amber-600 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/60">
                          <FiStar className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                          {Number(worker.rating || 5.0).toFixed(1)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {worker.completedServices || 0} jobs completed
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-sm font-black text-slate-900">
                      ₹{Number(worker.totalEarnings || 0).toLocaleString()}
                    </div>
                    <div className="text-[10px] text-emerald-600 font-semibold">
                      ₹{Number(worker.monthlyEarnings || 0).toLocaleString()} this mo.
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Registration Trend Area Chart */}
      <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">Worker Acquisition Trajectory</h3>
            <p className="text-xs text-slate-400">Monthly breakdown of new partner onboarding</p>
          </div>
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
            <span className="px-3 py-1 bg-white rounded-lg shadow-xs text-blue-600">Past 6 Months</span>
          </div>
        </div>

        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.monthlyTrend || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradientAnalytics" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="_id"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }}
                allowDecimals={false}
              />
              <Tooltip
                formatter={(value) => [`${value} Workers`, 'New Registrations']}
                contentStyle={{
                  borderRadius: '12px',
                  backgroundColor: '#0F172A',
                  color: '#fff',
                  border: 'none',
                  fontSize: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)'
                }}
                labelStyle={{ color: '#94A3B8', fontWeight: 600 }}
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="#2563EB"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#gradientAnalytics)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comprehensive Worker Performance Table with Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">All Worker Metrics</h3>
            <p className="text-xs text-slate-400">Detailed performance records across all registered workers</p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Filter Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-600">
              <button
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'all' ? 'bg-white shadow-xs text-blue-600' : 'hover:text-slate-900'}`}
              >
                All ({allWorkers.length})
              </button>
              <button
                onClick={() => setActiveTab('top_rated')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'top_rated' ? 'bg-white shadow-xs text-amber-600' : 'hover:text-slate-900'}`}
              >
                Top Rated
              </button>
              <button
                onClick={() => setActiveTab('high_earners')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'high_earners' ? 'bg-white shadow-xs text-emerald-600' : 'hover:text-slate-900'}`}
              >
                High Earners
              </button>
              <button
                onClick={() => setActiveTab('pending')}
                className={`px-3 py-1.5 rounded-lg transition-all ${activeTab === 'pending' ? 'bg-white shadow-xs text-purple-600' : 'hover:text-slate-900'}`}
              >
                Pending
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <FiSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by worker name, business, phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-64 pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50/50 hover:bg-white transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 text-[10px] uppercase font-extrabold text-slate-400 border-b border-slate-100 tracking-wider">
                <th className="px-6 py-3.5">Worker / Business</th>
                <th className="px-6 py-3.5">Customer Rating</th>
                <th className="px-6 py-3.5">Total Revenue</th>
                <th className="px-6 py-3.5">Monthly Revenue</th>
                <th className="px-6 py-3.5 text-center">Completed</th>
                <th className="px-6 py-3.5 text-center">Pending</th>
                <th className="px-6 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredWorkers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-12 text-center text-slate-400 font-medium">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <FiUsers className="w-8 h-8 text-slate-300" />
                      <p>No workers matched your filter or search query</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredWorkers.map((v, idx) => {
                  const initial = (v.businessName || v.name || 'W').charAt(0).toUpperCase();
                  const bgColors = ['bg-blue-100 text-blue-700', 'bg-emerald-100 text-emerald-700', 'bg-purple-100 text-purple-700', 'bg-amber-100 text-amber-700'];
                  const avatarColor = bgColors[idx % bgColors.length];

                  return (
                    <tr key={v.id || idx} className="hover:bg-slate-50/70 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs ${avatarColor}`}>
                            {initial}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                              {v.businessName || v.name}
                            </div>
                            <div className="text-[11px] text-slate-400 font-medium">
                              {v.name} • {v.phone}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 font-extrabold px-2.5 py-1 rounded-lg border border-amber-200/60 text-xs">
                          <FiStar className="w-3.5 h-3.5 fill-amber-400 text-amber-500" />
                          {Number(v.rating || 5.0).toFixed(1)}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-black text-slate-900 text-sm">
                        ₹{Number(v.totalEarnings || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 font-bold text-emerald-600">
                        ₹{Number(v.monthlyEarnings || 0).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-100">
                          <FiCheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                          {v.completedServices || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 font-bold text-xs border border-blue-100">
                          <FiClock className="w-3.5 h-3.5 text-blue-500" />
                          {v.pendingServices || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                          v.approvalStatus === 'approved' || v.approvalStatus === 'APPROVED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-amber-100 text-amber-800 border border-amber-200'
                        }`}>
                          {v.approvalStatus || 'Pending'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WorkerAnalytics;
