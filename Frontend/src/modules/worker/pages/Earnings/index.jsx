import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiDollarSign, FiTrendingUp, FiCalendar, FiArrowRight } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';


const Earnings = () => {
  const navigate = useNavigate();
  const [earnings, setEarnings] = useState({
    today: 0,
    week: 0,
    month: 0,
    total: 0,
  });
  const [earningsHistory, setEarningsHistory] = useState([]);
  const [filter, setFilter] = useState('all'); // all, today, week, month

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


    const loadEarnings = () => {
      try {
        const vendorEarnings = JSON.parse(localStorage.getItem('vendorEarnings') || '{}');
        const earningsData = {
          today: vendorEarnings.today || 0,
          week: vendorEarnings.week || 0,
          month: vendorEarnings.month || 0,
          total: vendorEarnings.total || 0,
        };
        setEarnings(earningsData);

        const history = JSON.parse(localStorage.getItem('workerEarningsHistory') || '[]');
        setEarningsHistory(history);
      } catch (error) {
        console.error('Error loading earnings:', error);
      }
    };

    // Load immediately and after a delay
    loadEarnings();
    setTimeout(loadEarnings, 200);

    window.addEventListener('workerEarningsUpdated', loadEarnings);

    return () => {
      window.removeEventListener('workerEarningsUpdated', loadEarnings);
    };
  }, []);

  const filteredHistory = earningsHistory.filter(item => {
    if (filter === 'all') return true;
    const itemDate = new Date(item.date);
    const now = new Date();

    if (filter === 'today') {
      return itemDate.toDateString() === now.toDateString();
    }
    if (filter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return itemDate >= weekAgo;
    }
    if (filter === 'month') {
      return itemDate.getMonth() === now.getMonth() && itemDate.getFullYear() === now.getFullYear();
    }
    return true;
  });

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Earnings" />

      <main className="px-4 py-6">
        {/* Earnings Overview Cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div
            className="bg-white rounded-xl p-4 shadow-md"
            style={{
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Today</p>
              <FiCalendar className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-bold" style={{ color: themeColors.button }}>
              ₹{earnings.today.toLocaleString()}
            </p>
          </div>

          <div
            className="bg-white rounded-xl p-4 shadow-md"
            style={{
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">This Week</p>
              <FiTrendingUp className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-bold" style={{ color: themeColors.button }}>
              ₹{earnings.week.toLocaleString()}
            </p>
          </div>

          <div
            className="bg-white rounded-xl p-4 shadow-md"
            style={{
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">This Month</p>
              <FiDollarSign className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-2xl font-bold" style={{ color: themeColors.button }}>
              ₹{earnings.month.toLocaleString()}
            </p>
          </div>

          <div
            className="bg-white rounded-xl p-4 shadow-md"
            style={{
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
            }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Total</p>
              <FiDollarSign className="w-4 h-4" style={{ color: themeColors.icon }} />
            </div>
            <p className="text-2xl font-bold" style={{ color: themeColors.button }}>
              ₹{earnings.total.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: 'all', label: 'All' },
            { id: 'today', label: 'Today' },
            { id: 'week', label: 'This Week' },
            { id: 'month', label: 'This Month' },
          ].map((filterOption) => (
            <button
              key={filterOption.id}
              onClick={() => setFilter(filterOption.id)}
              className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${filter === filterOption.id
                  ? 'text-white'
                  : 'bg-white text-gray-700'
                }`}
              style={
                filter === filterOption.id
                  ? {
                    background: themeColors.button,
                    boxShadow: `0 2px 8px ${themeColors.button}40`,
                  }
                  : {
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }
              }
            >
              {filterOption.label}
            </button>
          ))}
        </div>

        {/* Earnings History */}
        <div>
          <h3 className="font-bold text-gray-800 mb-4">Earnings History</h3>
          {filteredHistory.length === 0 ? (
            <div
              className="bg-white rounded-xl p-8 text-center shadow-md"
              style={{
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}
            >
              <FiDollarSign className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600 font-semibold mb-2">No earnings yet</p>
              <p className="text-sm text-gray-500">Your earnings will appear here</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredHistory.map((item, index) => (
                <div
                  key={index}
                  className="bg-white rounded-xl p-4 shadow-md"
                  style={{
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-gray-800">{item.serviceType || 'Service'}</p>
                      <p className="text-sm text-gray-600">{item.date}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold" style={{ color: themeColors.button }}>
                        ₹{item.amount.toLocaleString()}
                      </p>
                      {item.commission && (
                        <p className="text-xs text-gray-500">Commission: ₹{item.commission}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* View Wallet Button */}
        <div className="mt-6">
          <button
            onClick={() => navigate('/worker/wallet')}
            className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all active:scale-95"
            style={{
              background: themeColors.button,
              boxShadow: `0 4px 12px ${themeColors.button}40`,
            }}
          >
            View Wallet
            <FiArrowRight className="w-5 h-5" />
          </button>
        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default Earnings;

