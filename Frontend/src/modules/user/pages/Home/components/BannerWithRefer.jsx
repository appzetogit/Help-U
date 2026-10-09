import React from 'react';
import winterBanner from '../../../../../assets/images/pages/Home/Banner/Winter-banner.png';

const BannerWithRefer = ({ imageUrl, onBannerClick, onReferClick }) => {
  return (
    <div className="mb-6">
      {/* Main Banner */}
      <div className="mb-4 px-4 cursor-pointer" onClick={onBannerClick}>
        <div
          className="relative w-full aspect-[16/8.5] sm:aspect-[21/9] rounded-2xl sm:rounded-3xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.06)] border border-black/[0.04] bg-slate-100 transition-all duration-300 hover:scale-[1.01] active:scale-[0.98]"
        >
          <img
            src={imageUrl || winterBanner}
            alt="Promotion Banner"
            className="w-full h-full object-cover object-center"
          />
        </div>
      </div>

      {/* Refer & Earn Section */}
      <div
        className="rounded-2xl overflow-hidden shadow-lg mx-4"
        style={{
          background: 'linear-gradient(135deg, rgba(0, 166, 166, 0.08) 0%, rgba(41, 173, 129, 0.08) 100%)',
          border: '2px solid rgba(0, 166, 166, 0.2)'
        }}
      >
        <div className="p-4 flex items-center justify-between">
          <div className="flex-1">
            <h3
              className="text-lg font-bold mb-1 text-black"
            >
              Refer and get free services
            </h3>
            <p className="text-sm font-medium text-black">
              Invite and get ₹100*
            </p>
          </div>

          {/* Gift Boxes Illustration */}
          <div className="flex items-center gap-1 ml-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center transform rotate-12 shadow-md"
              style={{
                backgroundColor: 'rgba(0, 166, 166, 0.12)',
                border: '2px solid rgba(0, 166, 166, 0.2)'
              }}
            >
              <span className="text-2xl">🎁</span>
            </div>
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center transform -rotate-6 -ml-2 shadow-md"
              style={{
                backgroundColor: 'rgba(41, 173, 129, 0.12)',
                border: '2px solid rgba(41, 173, 129, 0.2)'
              }}
            >
              <span className="text-xl">🎁</span>
            </div>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center transform rotate-12 -ml-2 shadow-md"
              style={{
                backgroundColor: 'rgba(251, 251, 0, 0.2)',
                border: '2px solid rgba(251, 251, 0, 0.3)'
              }}
            >
              <span className="text-lg">🎁</span>
            </div>
          </div>
        </div>
        <button
          onClick={onReferClick}
          className="w-full text-white font-bold py-3.5 active:scale-98 transition-all rounded-b-2xl shadow-lg hover:shadow-xl"
          style={{
            backgroundColor: '#00a6a6',
            boxShadow: '0 4px 6px -1px rgba(0, 166, 166, 0.3), 0 2px 4px -1px rgba(0, 166, 166, 0.2)'
          }}
          onMouseEnter={(e) => {
            e.target.style.backgroundColor = '#008a8a';
            e.target.style.transform = 'scale(0.98)';
            e.target.style.boxShadow = '0 6px 12px -2px rgba(0, 166, 166, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.target.style.backgroundColor = '#00a6a6';
            e.target.style.transform = 'scale(1)';
            e.target.style.boxShadow = '0 4px 6px -1px rgba(0, 166, 166, 0.3), 0 2px 4px -1px rgba(0, 166, 166, 0.2)';
          }}
        >
          Refer Now
        </button>
      </div>
    </div>
  );
};

export default BannerWithRefer;

