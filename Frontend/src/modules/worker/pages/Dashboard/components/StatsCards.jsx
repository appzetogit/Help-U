import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiClock, FiBriefcase, FiCheckCircle, FiStar, FiCalendar, FiTrendingUp } from 'react-icons/fi';
import { FaWallet } from 'react-icons/fa';

const StatsCards = memo(({ stats = {} }) => {
  const navigate = useNavigate();

  const totalEarnings = stats.totalEarnings || stats.totalRevenue || 0;
  const monthlyEarnings = stats.monthlyEarnings || Math.round(totalEarnings * 0.4);
  const completedServices = stats.completedServices ?? stats.completedJobs ?? 0;
  const pendingServices = stats.pendingServices ?? ((stats.pendingAlerts || 0) + (stats.activeJobs || 0));
  const avgRating = stats.averageRating || stats.rating || 5.0;

  const topCards = [
    {
      title: "Total Earnings",
      value: `₹${Number(totalEarnings).toLocaleString()}`,
      subtext: "Lifetime Revenue",
      icon: FaWallet,
      gradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
      textColor: 'text-amber-400',
      onClick: () => navigate('/worker/wallet')
    },
    {
      title: "Monthly Earnings",
      value: `₹${Number(monthlyEarnings).toLocaleString()}`,
      subtext: "This Month",
      icon: FiCalendar,
      gradient: 'linear-gradient(135deg, #0A3641 0%, #155E75 100%)',
      textColor: 'text-emerald-400',
      onClick: () => navigate('/worker/wallet')
    }
  ];

  const subCards = [
    {
      title: "Average Rating",
      value: `${Number(avgRating).toFixed(1)} ★`,
      icon: FiStar,
      color: "text-amber-500",
      bg: "bg-amber-50",
      border: "border-amber-100",
      onClick: () => navigate('/worker/ratings')
    },
    {
      title: "Completed",
      value: completedServices,
      icon: FiCheckCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-100",
      onClick: () => navigate('/worker/jobs?tab=completed')
    },
    {
      title: "Pending",
      value: pendingServices,
      icon: FiClock,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-100",
      onClick: () => navigate('/worker/booking-alerts')
    }
  ];

  return (
    <div className="px-4 pt-4 space-y-3">
      {/* Top Main Cards: Total & Monthly Earnings */}
      <div className="grid grid-cols-2 gap-3">
        {topCards.map((card, idx) => {
          const IconComp = card.icon;
          return (
            <div
              key={idx}
              onClick={card.onClick}
              className="rounded-2xl p-4 relative overflow-hidden cursor-pointer active:scale-95 transition-all shadow-sm hover:shadow-md"
              style={{ background: card.gradient }}
            >
              <div
                className="absolute top-0 right-0 w-24 h-24 rounded-full opacity-10"
                style={{
                  background: 'radial-gradient(circle, #fff 0%, transparent 70%)',
                  transform: 'translate(20px, -20px)',
                }}
              />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-300 uppercase tracking-wider">
                    {card.title}
                  </span>
                  <div className="p-2 rounded-lg bg-white/10 backdrop-blur-md">
                    <IconComp className={`w-4 h-4 ${card.textColor}`} />
                  </div>
                </div>
                <div className="text-xl sm:text-2xl font-black text-white tracking-tight">
                  {card.value}
                </div>
                <div className="text-[10px] text-gray-400 font-medium mt-0.5">
                  {card.subtext}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Sub Analytics Cards: Rating, Completed, Pending */}
      <div className="grid grid-cols-3 gap-2.5">
        {subCards.map((card, idx) => {
          const IconComp = card.icon;
          return (
            <div
              key={idx}
              onClick={card.onClick}
              className={`rounded-xl p-3 border ${card.border} ${card.bg} cursor-pointer active:scale-95 transition-all shadow-xs hover:shadow-sm flex flex-col justify-between`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-gray-600 uppercase tracking-tight">
                  {card.title}
                </span>
                <IconComp className={`w-3.5 h-3.5 ${card.color}`} />
              </div>
              <div className={`text-lg font-black mt-1.5 ${card.color}`}>
                {card.value}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

StatsCards.displayName = 'WorkerStatsCards';

export default StatsCards;
