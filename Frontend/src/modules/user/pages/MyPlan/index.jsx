import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheck, FiStar, FiCheckCircle, FiShield, FiZap, FiGift } from 'react-icons/fi';
import { getPlans } from '../../services/planService';
import { userAuthService } from '../../../../services/authService';
import { toast } from 'react-hot-toast';

const MyPlan = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Helper to determine card styling based on plan name
  const getCardStyle = (name) => {
    const lower = name.toLowerCase();

    if (lower.includes('platinum')) {
      return {
        container: 'bg-slate-900 border-slate-700 text-white',
        badge: 'bg-emerald-500 text-white',
        includes: 'text-slate-400',
        check: 'text-emerald-400',
        price: 'text-white',
        button: 'bg-white text-slate-900 hover:bg-slate-100'
      };
    }
    if (lower.includes('diamond')) {
      return {
        container: 'bg-indigo-50 border-indigo-100 text-indigo-900',
        badge: 'bg-emerald-500 text-white',
        includes: 'text-indigo-600',
        check: 'text-indigo-500',
        price: 'text-indigo-900',
        button: 'bg-indigo-600 text-white hover:bg-indigo-700'
      }
    }
    if (lower.includes('gold')) {
      return {
        container: 'bg-[#FEF9C3] border-yellow-200 text-[#854D0E]',
        badge: 'bg-[#22C55E] text-white',
        includes: 'text-[#854D0E] opacity-70',
        check: 'text-[#854D0E]',
        price: 'text-[#854D0E]',
        button: 'bg-[#854D0E] text-white hover:bg-amber-900'
      };
    }
    if (lower.includes('silver')) {
      return {
        container: 'bg-[#F1F5F9] border-slate-200 text-slate-800',
        badge: 'bg-[#22C55E] text-white',
        includes: 'text-slate-500',
        check: 'text-slate-400',
        price: 'text-slate-900',
        button: 'bg-slate-800 text-white hover:bg-slate-900'
      };
    }

    // Default
    return {
      container: 'bg-white border-gray-200 text-gray-800',
      badge: 'bg-emerald-500 text-white',
      includes: 'text-gray-500',
      check: 'text-primary-500',
      price: 'text-gray-900',
      button: 'bg-primary-600 text-white hover:bg-primary-700'
    };
  };

  const getPreviousPlanNote = (name) => {
    const lower = name.toLowerCase();
    if (lower.includes('platinum')) return 'Everything in Diamond & More';
    if (lower.includes('diamond')) return 'Everything in Gold & More';
    if (lower.includes('gold')) return 'Everything in Silver & More';
    return null;
  };

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [plansRes, userRes] = await Promise.all([
        getPlans(),
        userAuthService.getProfile()
      ]);

      if (plansRes.success) setPlans(plansRes.data);
      if (userRes.success) setUser(userRes.user);

    } catch (error) {
      console.error(error);
      toast.error('Could not load data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="px-4 py-4 flex items-center gap-3 max-w-7xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <FiArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Subscription Plans</h1>
        </div>
      </header>

      <main className="px-4 py-12 max-w-7xl mx-auto">
        <div className="mb-12 bg-white/40 backdrop-blur-sm p-8 rounded-[2.5rem] border border-white shadow-sm">
          <h2 className="text-4xl font-black text-slate-900 mb-3 tracking-tight">Pick Your Membership</h2>
          <p className="text-slate-500 font-bold text-lg max-w-2xl leading-relaxed">
            Choose a plan that fits your home. Higher plans automatically include benefits from the tiers below them.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center p-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-8">
            {plans.map((plan) => {
              const style = getCardStyle(plan.name || '');
              const currentPlan = user?.plans;
              const isCurrent = currentPlan?.isActive && currentPlan?.name === plan.name;

              const userPlanPrice = currentPlan?.price || 0;
              const isUpgrade = currentPlan?.isActive && plan.price > userPlanPrice;
              const isDowngradeOrSame = currentPlan?.isActive && plan.price <= userPlanPrice && !isCurrent;
              const isDisabled = isCurrent || isDowngradeOrSame;

              let buttonText = `Select ${plan.name}`;
              if (isCurrent) buttonText = 'Current Plan';
              else if (isUpgrade) buttonText = 'Upgrade';

              return (
                <div
                  key={plan._id}
                  onClick={() => navigate(`/user/my-plan/${plan._id}`)}
                  className={`relative cursor-pointer rounded-3xl border shadow-sm transition-all flex flex-col overflow-hidden ${style.container}`}
                >
                  <div className="p-8 pb-8 flex-1 relative">
                    {/* Top Row: Name and Status */}
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex flex-col">
                        <h3 className="text-3xl font-black tracking-tight">{plan.name}</h3>
                        {plan.tagline && (
                          <div className={`mt-2 flex items-center`}>
                             <span className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.15em] shadow-sm border ${
                               plan.name.toLowerCase().includes('platinum') 
                               ? 'bg-white/10 border-white/20 text-white' 
                               : 'bg-primary-50 border-primary-100 text-primary-600'
                             }`}>
                               {plan.tagline}
                             </span>
                          </div>
                        )}
                      </div>
                      {isCurrent && (
                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${style.badge}`}>
                          Active
                        </span>
                      )}
                    </div>

                    {/* Price and Duration */}
                    <div className="flex items-baseline mb-8">
                      <span className={`text-4xl font-black ${style.price}`}>₹{plan.price}</span>
                      <span className="text-sm font-bold opacity-40 ml-2">/ {plan.duration || '1'} Months</span>
                    </div>

                    {/* Benefits Section */}
                    <div className="space-y-6">
                      <ul className="space-y-3.5">
                        {(plan.freeCategories || []).map((cat, idx) => (
                          <li key={`cat-${idx}`} className="flex items-start gap-3">
                            <FiZap className="w-4 h-4 mt-1 shrink-0 text-amber-500 fill-amber-500" />
                            <span className="text-[14px] font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">Free {cat.title || cat.name}</span>
                          </li>
                        ))}
                        {((() => {
                          const groups = new Map();
                          (plan.freeServices || []).forEach(svc => {
                            const cid = String(svc.categoryId?._id || svc.categoryId || 'unknown');
                            const tkey = (svc.title || '').trim().toLowerCase();
                            const key = `${cid}_${tkey}`;
                            if (!groups.has(key)) groups.set(key, svc);
                          });
                          
                          return Array.from(groups.values()).map((svc, idx) => {
                            const catTitle = svc.categoryId?.title || 'Service';
                            return (
                              <li key={`svc-${idx}`} className="flex items-start gap-3">
                                <FiZap className="w-4 h-4 mt-1 shrink-0 text-amber-500 fill-amber-500" />
                                <div className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black uppercase text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">{catTitle}</span>
                                    <span className="text-[14px] font-extrabold text-rose-600">Free {svc.title || svc.name}</span>
                                  </div>
                                </div>
                              </li>
                            );
                          });
                        })())}
                        
                        {(() => {
                          const planOrder = ['Silver', 'Gold', 'Platinum', 'Diamond'];
                          const currentName = plan.name || '';
                          const baseName = planOrder.find(p => currentName.toLowerCase().includes(p.toLowerCase()));
                          const currentIndex = baseName ? planOrder.indexOf(baseName) : -1;
                          const prevName = currentIndex > 0 ? planOrder[currentIndex - 1] : null;

                          if (!prevName) return null;

                          return (
                            <div className="mt-6 mb-2 p-3 bg-white/40 rounded-xl border border-dashed border-current opacity-80 flex items-center gap-2">
                              <FiGift className="w-4 h-4" />
                              <p className="text-[10px] font-black uppercase tracking-wider">
                                Benefits from <span className="underline decoration-2">{prevName}</span> Tier Included
                              </p>
                            </div>
                          );
                        })()}

                        {/* Grouped Previous Tier Benefit Display */}
                        {(() => {
                          const groups = new Map();
                          (plan.bonusServices || []).forEach(bs => {
                            const svc = bs.serviceId;
                            if (!svc) return;
                            const cid = String(bs.categoryId?._id || bs.categoryId || svc.categoryId?._id || svc.categoryId || 'unknown');
                            const tkey = (svc.title || '').trim().toLowerCase();
                            const key = `${cid}_${tkey}`;
                            if (!groups.has(key)) {
                              groups.set(key, bs);
                            }
                          });
                          
                          return Array.from(groups.values()).map((bs, idx) => {
                            const svc = bs.serviceId;
                            if (!svc) return null;
                            const catTitle = bs.categoryId?.title || svc.categoryId?.title || 'Service';
                            
                            return (
                              <li key={idx} className="flex items-start gap-3 p-3 bg-amber-50/70 rounded-xl border border-amber-100 shadow-sm">
                                <div className="mt-1 w-5 h-5 bg-amber-100 text-amber-600 rounded-lg flex items-center justify-center shrink-0">
                                  <FiStar className="w-3 h-3 fill-amber-600" />
                                </div>
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-[10px] font-black uppercase text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">{catTitle}</span>
                                    <span className="text-[13px] font-extrabold text-amber-800">Free {svc.title}</span>
                                  </div>
                                  <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#854D0E] opacity-50 ml-1">Inherited from previous plan</span>
                                </div>
                              </li>
                            );
                          });
                        })()}
                      </ul>
                    </div>
                  </div>

                  {/* Action Button */}
                  <div className="px-8 pb-8 mt-auto">
                    {plan.description && (
                      <div className={`mb-8 p-4 rounded-2xl border-l-[4px] shadow-sm flex items-start gap-4 transition-all duration-300 transform group-hover:scale-[1.02] ${
                        plan.name.toLowerCase().includes('platinum') 
                          ? 'bg-white/5 border-emerald-400' 
                          : 'bg-white/60 border-primary-500 backdrop-blur-md'
                      }`}>
                         <p className={`text-[12px] font-bold leading-relaxed ${
                            plan.name.toLowerCase().includes('platinum') 
                              ? 'text-slate-300' 
                              : 'text-slate-600'
                         }`}>
                           {plan.description}
                         </p>
                      </div>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/user/my-plan/${plan._id}`);
                      }}
                      className={`w-full py-4 px-6 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg transition-all active:scale-95 transform hover:translate-y-[-2px] ${style.button} ${isDisabled && !isCurrent ? 'opacity-50 grayscale cursor-not-allowed' : ''}`}
                    >
                      {buttonText}
                    </button>
                    {isCurrent && (
                       <p className="text-center text-[10px] font-bold uppercase tracking-widest opacity-30 mt-3">Membership In Good Standing</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {plans.length === 0 && !loading && (
          <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-gray-200 shadow-inner">
            <FiStar className="h-12 w-12 text-gray-200 mx-auto mb-4" />
            <p className="text-gray-400 font-bold">No subscription plans found at this time.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default MyPlan;
