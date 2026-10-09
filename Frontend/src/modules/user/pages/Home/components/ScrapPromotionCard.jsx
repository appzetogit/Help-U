import React from 'react';
import { motion } from 'framer-motion';
import { FiArrowRight, FiRefreshCw, FiTrendingUp } from 'react-icons/fi';
import { themeColors } from '../../../../../theme';

const ScrapPromotionCard = ({ onClick }) => {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.98 }}
      className="mx-4 overflow-hidden rounded-3xl relative cursor-pointer group shadow-xl"
      onClick={onClick}
    >
      {/* Background with Brand Mesh Gradient */}
      <div 
        className="absolute inset-0 z-0 transition-transform duration-700 group-hover:scale-110"
        style={{
          background: `linear-gradient(135deg, ${themeColors.brand.teal} 0%, #1a4d5e 100%)`
        }}
      />
      
      {/* Animated Decorative Circle */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-20 -mt-20 blur-3xl animate-pulse" />
      <div className="absolute bottom-0 left-0 w-40 h-40 bg-teal-400/20 rounded-full -ml-20 -mb-20 blur-2xl transition-all duration-500 group-hover:bg-teal-400/30" />

      <div className="relative z-10 p-6 lg:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex-1 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-bold uppercase tracking-wider mb-4 border border-white/10">
            <FiRefreshCw className="animate-spin-slow" />
            <span>Eco-Friendly Service</span>
          </div>
          
          <h2 className="text-2xl lg:text-3xl font-black text-white mb-2 leading-tight">
            Turn Your <span className="text-teal-300">Scrap</span> into <br className="hidden md:block" />
            Instant <span className="text-amber-400">Cash</span>
          </h2>
          
          <p className="text-teal-50/80 text-sm lg:text-base font-medium max-w-md mb-6 mx-auto md:mx-0">
            Get the best price for your scrap with easy doorstep pickup.
          </p>

          <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
            <button
              className="px-6 py-3 bg-white rounded-xl font-bold shadow-lg hover:shadow-white/20 transition-all flex items-center gap-2 group/btn"
              style={{ color: themeColors.brand.teal }}
            >
              Sell Scrap Now
              <FiArrowRight className="transition-transform group-hover/btn:translate-x-1" />
            </button>
            <div className="flex items-center gap-2 text-white/90 text-sm font-semibold">
              <div className="w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center">
                <FiTrendingUp className="text-amber-400" />
              </div>
              Best Market Rates
            </div>
          </div>
        </div>

        {/* Visual Element */}
        <div className="relative hidden sm:block">
          <div className="absolute inset-0 bg-white/5 blur-3xl rounded-full scale-110" />
          <div className="w-32 h-32 lg:w-40 lg:h-40 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center relative overflow-hidden group-hover:rotate-3 transition-transform duration-500">
             <div className="text-6xl lg:text-7xl drop-shadow-2xl">♻️</div>
             {/* Floating mini elements */}
             <div className="absolute top-2 left-2 animate-bounce-slow text-2xl">💰</div>
             <div className="absolute bottom-4 right-2 animate-bounce-slower text-2xl">📦</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ScrapPromotionCard;
