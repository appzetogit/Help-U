import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiCheck, FiX, FiDollarSign, FiChevronRight } from 'react-icons/fi';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';
import workerWalletService from '../../../../services/workerWalletService';
import { toast } from 'react-hot-toast';

const SettlementHistory = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [settlements, setSettlements] = useState([]);
  const [filter, setFilter] = useState('all');

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
    loadSettlements();
  }, [filter]);

  const loadSettlements = async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? { status: filter } : {};
      const res = await workerWalletService.getSettlements(params);
      if (res.success) {
        setSettlements(res.data || []);
      }
    } catch (error) {
      toast.error('Failed to load settlements');
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending':
        return <FiClock className="w-5 h-5 text-orange-500" />;
      case 'approved':
        return <FiCheck className="w-5 h-5 text-green-500" />;
      case 'rejected':
        return <FiX className="w-5 h-5 text-red-500" />;
      default:
        return <FiDollarSign className="w-5 h-5 text-gray-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200' };
      case 'approved':
        return { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200' };
      case 'rejected':
        return { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' };
      default:
        return { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' };
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen pb-24" style={{ background: themeColors.backgroundGradient }}>
      <Header
        title="Settlement History"
        showBack={true}
        onBack={() => navigate('/worker/wallet')}
      />

      <main className="px-4 py-6">
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide">
          {[
            { id: 'all', label: 'All' },
            { id: 'pending', label: 'Pending' },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Rejected' },
          ].map(option => (
            <button
              key={option.id}
              onClick={() => setFilter(option.id)}
              className={`px-4 py-2 rounded-full font-semibold text-sm whitespace-nowrap transition-all ${filter === option.id
                ? 'text-white'
                : 'bg-white text-gray-700'
                }`}
              style={
                filter === option.id
                  ? {
                    background: themeColors.button,
                    boxShadow: `0 2px 8px ${themeColors.button}40`,
                  }
                  : {
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  }
              }
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Settlements List */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${themeColors.button} transparent ${themeColors.button} ${themeColors.button}` }}></div>
          </div>
        ) : settlements.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center shadow-md">
            <FiDollarSign className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-600 font-semibold mb-2">No settlements found</p>
            <p className="text-sm text-gray-500">Your settlement history will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {settlements.map((settlement) => {
              const statusColors = getStatusColor(settlement.status);
              return (
                <div
                  key={settlement._id}
                  className={`bg-white rounded-2xl p-4 shadow-md border-l-4`}
                  style={{
                    borderLeftColor: settlement.status === 'pending' ? '#F97316' :
                      settlement.status === 'approved' ? '#10B981' : '#EF4444'
                  }}
                >
                  <div className="flex items-start gap-3">
                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${statusColors.bg}`}>
                      {getStatusIcon(settlement.status)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-bold text-gray-900">₹{settlement.amount.toLocaleString()}</p>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${statusColors.bg} ${statusColors.text}`}>
                          {settlement.status.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-xs text-gray-600 mb-1">
                        Via {settlement.paymentMethod === 'upi' ? 'UPI' : 'Bank Transfer'}
                        {settlement.paymentReference && ` • Ref: ${settlement.paymentReference}`}
                      </p>

                      <p className="text-xs text-gray-400">{formatDate(settlement.createdAt)}</p>

                      {settlement.status === 'rejected' && settlement.rejectionReason && (
                        <div className="mt-2 p-2 bg-red-50 rounded-lg">
                          <p className="text-xs text-red-600">
                            <strong>Reason:</strong> {settlement.rejectionReason}
                          </p>
                        </div>
                      )}

                      {settlement.adminNotes && (
                        <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-600">
                            <strong>Admin Note:</strong> {settlement.adminNotes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
};

export default SettlementHistory;
