import React from 'react';
import { themeColors } from '../../../../../theme';

const ReferEarnSection = ({ onReferClick }) => {
  return (
    <div
      className="rounded-2xl overflow-hidden shadow-lg mx-4 mt-2 bg-white"
      style={{
        background: `linear-gradient(135deg, ${themeColors.brand.teal}14 0%, ${themeColors.brand.yellow}14 100%)`,
        border: `2px solid ${themeColors.brand.teal}33`
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
              backgroundColor: `${themeColors.brand.teal}1F`,
              border: `2px solid ${themeColors.brand.teal}33`
            }}
          >
            <span className="text-2xl">🎁</span>
          </div>
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center transform -rotate-6 -ml-2 shadow-md"
            style={{
              backgroundColor: `${themeColors.brand.yellow}1F`,
              border: `2px solid ${themeColors.brand.yellow}33`
            }}
          >
            <span className="text-xl">🎁</span>
          </div>
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center transform rotate-12 -ml-2 shadow-md"
            style={{
              backgroundColor: `${themeColors.brand.orange}1F`,
              border: `2px solid ${themeColors.brand.orange}33`
            }}
          >
            <span className="text-lg">🎁</span>
          </div>
        </div>
      </div>
      <button
        onClick={onReferClick}
        className="w-full text-white font-bold py-3.5 active:scale-98 transition-all rounded-b-xl shadow-lg hover:shadow-xl"
        style={{
          backgroundColor: themeColors.button,
          boxShadow: `0 4px 6px -1px ${themeColors.brand.teal}4D, 0 2px 4px -1px ${themeColors.brand.teal}33`
        }}
        onMouseEnter={(e) => {
          e.target.style.backgroundColor = themeColors.brand.teal;
          e.target.style.transform = 'scale(0.98)';
          e.target.style.boxShadow = `0 6px 12px -2px ${themeColors.brand.teal}66`;
        }}
        onMouseLeave={(e) => {
          e.target.style.backgroundColor = themeColors.button;
          e.target.style.transform = 'scale(1)';
          e.target.style.boxShadow = `0 4px 6px -1px ${themeColors.brand.teal}4D, 0 2px 4px -1px ${themeColors.brand.teal}33`;
        }}
      >
        Refer Now
      </button>
    </div>
  );
};

export default ReferEarnSection;
