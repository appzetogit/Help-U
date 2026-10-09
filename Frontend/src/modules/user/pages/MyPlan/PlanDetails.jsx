import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiCalendar, FiClock, FiCreditCard, FiInfo, FiShield, FiStar, FiZap, FiCheckCircle, FiGift } from 'react-icons/fi';
import { getPlans } from '../../services/planService';
import { userAuthService } from '../../../../services/authService';
import { toast } from 'react-hot-toast';
import LogoLoader from '../../../../components/common/LogoLoader';

const PlanDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [id]);

  const fetchData = async () => {
    try {
      const [plansRes, userRes] = await Promise.all([
        getPlans(),
        userAuthService.getProfile()
      ]);

      if (plansRes.success) {
        const found = plansRes.data.find(p => p._id === id);
        if (found) {
          setPlan(found);
        } else {
          toast.error('Plan not found');
          navigate('/user/my-plan');
        }
      }
      if (userRes.success) setUser(userRes.user);

    } catch (error) {
      console.error(error);
      toast.error('Could not load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LogoLoader />;
  if (!plan) return null;

  const currentPlan = user?.plans;
  const isCurrent = currentPlan?.isActive && currentPlan?.name === plan.name;
  const isUpgrade = currentPlan?.isActive && plan.price > (currentPlan?.price || 0);
  const isDowngradeOrSame = currentPlan?.isActive && plan.price <= (currentPlan?.price || 0) && !isCurrent;

  // Formatting date
  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  // Helper for card style icons/colors
  const getTheme = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('platinum')) return { color: 'text-slate-900', bg: 'bg-slate-900', light: 'bg-slate-50', gradient: 'from-slate-800 to-slate-900' };
    if (lower.includes('diamond')) return { color: 'text-indigo-600', bg: 'bg-indigo-600', light: 'bg-indigo-50', gradient: 'from-indigo-500 via-purple-500 to-pink-500' };
    if (lower.includes('gold')) return { color: 'text-amber-600', bg: 'bg-amber-600', light: 'bg-amber-50', gradient: 'from-amber-400 to-yellow-500' };
    if (lower.includes('silver')) return { color: 'text-gray-600', bg: 'bg-gray-600', light: 'bg-gray-50', gradient: 'from-gray-400 to-slate-500' };
    return { color: 'text-primary-600', bg: 'bg-primary-600', light: 'bg-primary-50', gradient: 'from-primary-500 to-primary-600' };
  };

  const theme = getTheme(plan.name);

  return (
    <div className="min-h-screen bg-white pb-20">
      {/* Dynamic Header Background */}
      <div className={`h-64 w-full bg-gradient-to-br ${theme.gradient} relative overflow-hidden`}>
        <div className="absolute top-0 left-0 w-full h-full opacity-10">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 0 L100 0 L100 100 Z" fill="white" />
          </svg>
        </div>

        {/* Back Button */}
        <div className="absolute top-6 left-4 z-20">
          <button
            onClick={() => navigate(-1)}
            className="p-2.5 bg-white/20 backdrop-blur-md rounded-full text-white hover:bg-white/30 transition-all"
          >
            <FiArrowLeft className="w-6 h-6" />
          </button>
        </div>

        {/* Plan Title in Header */}
        <div className="absolute bottom-10 left-6 text-white animate-slide-in-bottom">
          <div className="flex items-center gap-2 mb-2">
            <FiStar className="w-5 h-5 fill-yellow-400 text-yellow-400" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] opacity-80">Subscription Plan</span>
          </div>
          <h1 className="text-4xl font-black">{plan.name}</h1>
          {plan.tagline && (
             <div className="mt-2 flex items-center">
               <span className="bg-white/10 border border-white/20 text-white px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-[0.2em] shadow-sm">
                 {plan.tagline}
               </span>
             </div>
          )}
        </div>
      </div>

      <div className="px-6 -mt-8 relative z-10">
        {/* Main Info Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-8 mb-6">
          {plan.description && (
             <div className="mb-8 p-5 bg-slate-50 border-l-4 border-slate-900 rounded-2xl shadow-inner">
                <p className="text-sm font-bold text-slate-600 leading-relaxed italic">
                  "{plan.description}"
                </p>
             </div>
          )}
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="text-gray-500 text-sm font-medium mb-1">Total Pricing</p>
              <div className="flex items-baseline">
                <span className={`text-4xl font-black ${theme.color}`}>₹{plan.price}</span>
                <span className="text-gray-400 text-sm ml-1">/ {plan.duration || '1'} Months</span>
              </div>
            </div>
            {isCurrent && (
              <span className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 border border-emerald-100 shadow-sm animate-pulse-subtle">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                ACTIVE NOW
              </span>
            )}
          </div>

          <div className="space-y-6">
            <h3 className="font-bold text-gray-900 border-b border-gray-50 pb-3">Plan Benefits</h3>
          </div>
        </div>

        {/* Complimentary Benefits from Previous Plan Section */}
        {(() => {
          const planOrder = ['Silver', 'Gold', 'Platinum', 'Diamond'];
          const currentPlanName = plan.name || '';
          const currentBaseName = planOrder.find(p => currentPlanName.toLowerCase().includes(p.toLowerCase()));
          const currentIndex = currentBaseName ? planOrder.indexOf(currentBaseName) : -1;
          const previousPlan = currentIndex > 0 ? planOrder[currentIndex - 1] : null;

          if (!previousPlan) return null;

          return (
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-3xl p-8 mb-6 text-white shadow-lg shadow-orange-500/20 relative overflow-hidden group animate-fade-in">
              <div className="absolute right-0 top-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/20 transition-all duration-700"></div>
              
              <div className="flex items-center gap-4 mb-4 relative z-10">
                <div className="p-3 bg-white/20 backdrop-blur-md rounded-2xl border border-white/30">
                  <FiGift className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-black leading-tight uppercase tracking-wide">Extra Perks from Previous Tier</h3>
                  <p className="text-[11px] text-amber-50 font-black uppercase tracking-widest opacity-80 mt-1">Tier Booster Active</p>
                </div>
              </div>

              <div className="relative z-10 bg-white/10 backdrop-blur-sm rounded-2xl p-5 border border-white/20">
                <p className="text-sm font-medium leading-relaxed">
                  As a <span className="font-black underline decoration-2 underline-offset-4">{plan.name} Member</span>, you automatically enjoy 
                  <span className="font-black"> extra benefits</span> from the <span className="bg-white text-orange-600 px-2 py-0.5 rounded-md inline-block font-black mx-1">{previousPlan}</span> 
                  tier in addition to your premium services.
                </p>
                <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-tighter opacity-70">Legacy Support Included</span>
                  <div className="flex -space-x-2">
                    {[1,2,3].map(i => (
                      <div key={i} className="w-6 h-6 rounded-full border-2 border-orange-500 bg-white/20 flex items-center justify-center">
                        <FiCheck className="w-3 h-3" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Unlimited Categories Section */}
        {plan.freeCategories && plan.freeCategories.length > 0 && (
          <div className="bg-gradient-to-br from-primary-50 to-white rounded-3xl p-8 mb-6 border border-primary-100 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 bg-primary-100 text-primary-600 rounded-xl">
                <FiZap className="w-5 h-5 fill-primary-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-gray-900 leading-none">Unlimited Service Categories</h3>
                <p className="text-xs text-primary-600 font-bold uppercase tracking-wider mt-1">Full coverage on all services within these categories</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                {plan.freeCategories.map((cat, idx) => (
                  <span key={idx} className="bg-white border border-primary-100 text-primary-700 px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary-500 rounded-full"></div>
                    {cat.title}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-6 p-4 bg-white/50 rounded-2xl border border-dashed border-primary-200">
              <p className="text-[10px] text-gray-400 leading-relaxed font-medium">
                * All service types (Installation, Repair, Service) are 100% free for the categories listed above.
              </p>
            </div>
          </div>
        )}

        {/* 1. Plan Inclusive Benefits (Rose Section) */}
        {plan.freeServices && plan.freeServices.length > 0 && (
          <div className="bg-gradient-to-br from-rose-50 to-white rounded-3xl p-8 mb-6 border border-rose-100 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2.5 bg-rose-100 text-rose-600 rounded-2xl shadow-sm">
                <FiCheckCircle className="w-5 h-5 fill-rose-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 leading-none">{plan.name} Inclusive Benefits</h3>
                <p className="text-[10px] text-rose-600 font-bold uppercase tracking-widest mt-1.5 antialiased">Special benefits included with your tier</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {(() => {
                const groups = new Map();
                (plan.freeServices || []).forEach(svc => {
                  const cid = String(svc.categoryId?._id || svc.categoryId || 'unknown');
                  const tkey = (svc.title || '').trim().toLowerCase();
                  const key = `${cid}_${tkey}`;
                  if (!groups.has(key)) groups.set(key, svc);
                });
                return Array.from(groups.values()).map((svc, idx) => (
                  <div key={`free-${idx}`} className="group relative flex items-center justify-between p-5 bg-white border border-rose-100 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-black text-sm">
                        <FiCheck className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-black text-rose-500 bg-rose-50 px-2 py-0.5 rounded-md uppercase tracking-wider">{svc.categoryId?.title || 'Service'}</span>
                        </div>
                        <span className="text-slate-900 font-bold text-[15px]">{svc.title} (All Brands)</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-rose-400 text-[10px] font-black uppercase tracking-widest border border-rose-100 px-1.5 py-0.5 rounded text-glow-rose">Membership Exclusive</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-rose-500 uppercase tracking-[0.1em] bg-rose-50 px-3 py-1 rounded-full border border-rose-100">Free Benefit</span>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* 2. Complimentary Membership Perks (Emerald Section) */}
        {plan.bonusServices && plan.bonusServices.length > 0 && (
          <div className="bg-gradient-to-br from-emerald-50 to-white rounded-3xl p-8 mb-6 border border-emerald-100 shadow-sm animate-fade-in">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-2xl shadow-sm">
                <FiStar className="w-5 h-5 fill-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900 leading-none">Complimentary Membership Perks</h3>
                <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-widest mt-1.5 antialiased">Automatic benefits from previous tier inheritance</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {(() => {
                const groups = new Map();
                (plan.bonusServices || []).forEach(bs => {
                  const svc = bs.serviceId;
                  if (!svc) return;
                  const cid = String(bs.categoryId?._id || bs.categoryId || svc.categoryId?._id || svc.categoryId || 'unknown');
                  const tkey = (svc.title || '').trim().toLowerCase();
                  const key = `${cid}_${tkey}`;
                  if (!groups.has(key)) groups.set(key, bs);
                });
                
                return Array.from(groups.values()).map((bs, idx) => {
                  const svc = bs.serviceId;
                  const catTitle = bs.categoryId?.title || svc?.categoryId?.title || 'Service';
                  return (
                    <div key={`bonus-${idx}`} className="group relative flex items-center justify-between p-5 bg-white border border-emerald-100/50 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center font-black text-sm">
                          <FiStar className="w-5 h-5 fill-emerald-600" />
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-md uppercase tracking-wider">{catTitle}</span>
                          </div>
                          <span className="text-slate-900 font-bold text-[15px]">{svc.title} (All Brands)</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-emerald-400 text-[10px] font-black uppercase tracking-widest border border-emerald-100 px-1.5 py-0.5 rounded">Special Benefit</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.1em] bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">Free Access</span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            <div className="mt-8 p-5 bg-white/40 rounded-2xl border border-dashed border-emerald-200/60 backdrop-blur-sm shadow-inner">
              <div className="flex gap-3">
                <FiZap className="text-emerald-500 w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-[11px] text-emerald-800/60 leading-relaxed font-bold italic">
                  * Enjoy living at its best! These services are offered as a part of your {plan.name} Membership.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Status Card (Only if Current Plan) */}
        {isCurrent && (
          <div className="bg-slate-900 rounded-3xl p-8 mb-6 text-white shadow-2xl relative overflow-hidden group">
            {/* Background pattern */}
            <div className="absolute -right-10 -bottom-10 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <FiZap className="w-48 h-48" />
            </div>

            <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
              <FiShield className="text-emerald-400" />
              Active Subscription Details
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                  <FiCalendar className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-0.5">Expires On</p>
                  <p className="text-lg font-black">{formatDate(currentPlan.expiry)}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                  <FiCreditCard className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-0.5">Amount Paid</p>
                  <p className="text-lg font-black">₹{currentPlan.price}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                  <FiClock className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-0.5">Renewal</p>
                  <p className="text-lg font-black italic">Auto-renew OFF</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10">
                  <FiInfo className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white/50 text-xs font-bold uppercase tracking-wider mb-0.5">Status</p>
                  <p className="text-lg font-black text-emerald-400 uppercase tracking-widest">Active Member</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="fixed bottom-6 left-0 right-0 px-6 backdrop-blur-sm bg-white/30 py-4 border-t border-gray-100 sm:relative sm:border-0 sm:p-0 sm:bg-transparent sm:bottom-0">
          {!isCurrent && !isDowngradeOrSame ? (
            <button
              onClick={() => {
                navigate('/user/checkout', {
                  state: {
                    plan: {
                      id: plan._id,
                      name: plan.name,
                      price: plan.price,
                      description: plan.description || `${plan.duration || 'Monthly'} Plan`
                    },
                    isUpgrade
                  }
                });
              }}
              className={`w-full py-5 rounded-2xl font-black text-white shadow-2xl transition-all active:scale-95 flex items-center justify-center gap-2 group transform hover:-translate-y-1 ${theme.bg}`}
              style={{ boxShadow: `0 20px 25px -5px ${theme.bg}4D` }}
            >
              <FiZap className="fill-white group-hover:scale-125 transition-transform" />
              {isUpgrade ? 'Upgrade My Membership' : 'Subscribe Now'}
            </button>
          ) : isCurrent ? (
            <div className="bg-emerald-50 text-emerald-700 p-5 rounded-2xl border border-emerald-100 flex items-center justify-center gap-3 font-bold shadow-inner">
              <FiCheckCircle className="w-6 h-6" />
              You are currently enjoying this plan
            </div>
          ) : (
            <div className="bg-gray-100 text-gray-500 p-5 rounded-2xl border border-gray-200 flex items-center justify-center gap-3 font-bold italic">
              <FiInfo />
              Select a higher plan to upgrade
            </div>
          )}
        </div>

        {/* Extra Info */}
        <div className="mt-12 space-y-4">
          <div className="flex items-start gap-3 p-4 bg-orange-50/50 rounded-2xl border border-orange-100 select-none">
            <FiShield className="text-orange-500 w-5 h-5 mt-0.5" />
            <p className="text-xs text-orange-800 leading-relaxed font-medium">
              Payment is 100% secure. You can cancel your subscription at any time from your settings. Benefits are applied instantly after payment completion.
            </p>
          </div>
          <p className="text-center text-gray-300 text-[10px] uppercase font-bold tracking-widest pb-10">
            Help U Subscription • Secure & Trusted
          </p>
        </div>
      </div>
    </div>
  );
};

export default PlanDetails;
