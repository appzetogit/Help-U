import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiUsers, FiShield, FiClock, FiAward, FiHeart, FiGlobe, FiSmile, FiSmartphone } from 'react-icons/fi';
import { motion } from 'framer-motion';
import Logo from '../../../../components/common/Logo';

const AboutHelpU = () => {
  const navigate = useNavigate();

  // Container animation variants
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.6,
        ease: [0.25, 0.1, 0.25, 1]
      }
    }
  };

  // Gradient Definition for re-use in inline styles
  const helpUGradient = 'linear-gradient(135deg, #347989 0%, #BB5F36 100%)';
  const helpUTextGradient = {
    background: helpUGradient,
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  const features = [
    {
      icon: FiUsers,
      title: 'Expert Providers',
      description: 'Verified professionals for all your needs'
    },
    {
      icon: FiShield,
      title: 'Safe & Secure',
      description: 'Your safety is our top priority'
    },
    {
      icon: FiClock,
      title: 'On-Time Service',
      description: 'Punctual delivery at your convenience'
    },
    {
      icon: FiAward,
      title: 'Quality Assured',
      description: 'Service with 100% satisfaction guarantee'
    }
  ];

  const stats = [
    { number: '10K+', label: 'Happy Customers' },
    { number: '500+', label: 'Service Partners' },
    { number: '4.8', label: 'App Rating' },
  ];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="min-h-screen bg-gray-50 pb-10"
    >
      {/* SVG Gradient Definition */}
      <svg width="0" height="0" className="absolute">
        <linearGradient id="helpu-about-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#347989" />
          <stop offset="50%" stopColor="#D68F35" />
          <stop offset="100%" stopColor="#BB5F36" />
        </linearGradient>
      </svg>

      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md shadow-sm sticky top-0 z-30 border-b border-gray-100">
        <div className="px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors active:scale-95"
          >
            <FiArrowLeft className="w-5 h-5 text-gray-700" />
          </button>
          <span className="text-xl font-bold" style={helpUTextGradient}>About Help U</span>
        </div>
      </header>

      <main className="px-5 py-6 space-y-8">
        {/* Hero Section */}
        <motion.div variants={itemVariants} className="text-center">
          <div className="relative w-28 h-28 mx-auto mb-6">
            {/* Spinning Border */}
            <div
              className="absolute inset-[-3px] rounded-full opacity-70"
              style={{
                background: 'conic-gradient(from 0deg, #347989, #D68F35, #BB5F36, #347989)',
                animation: 'spin 4s linear infinite',
              }}
            />
            {/* White Background */}
            <div className="absolute inset-0 bg-white rounded-full shadow-lg flex items-center justify-center">
              <Logo className="w-16 h-16 object-contain" />
            </div>
          </div>

          <h1 className="text-3xl font-extrabold text-gray-900 mb-2">
            Welcome to <span style={helpUTextGradient}>Help U</span>
          </h1>
          <p className="text-gray-500 max-w-xs mx-auto leading-relaxed">
            Your trusted partner for premium home and personal care services.
          </p>
        </motion.div>

        {/* Stats Row */}
        <motion.div variants={itemVariants} className="flex justify-between bg-white rounded-2xl p-6 shadow-sm border border-gray-100 divide-x divide-gray-100">
          {stats.map((stat, idx) => (
            <div key={idx} className="flex-1 text-center px-2">
              <div className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#347989] to-[#BB5F36]">
                {stat.number}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-gray-400 font-medium mt-1">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Mission Statement */}
        <motion.div variants={itemVariants}>
          <div className="bg-gradient-to-br from-[#347989]/5 to-[#BB5F36]/5 rounded-2xl p-6 border border-[#347989]/10 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <FiGlobe className="w-24 h-24" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-3">Our Mission</h3>
            <p className="text-sm text-gray-600 leading-relaxed relative z-10">
              Help U is dedicated to revolutionizing how you experience home services. We connect you with top-tier professionals to deliver safe, reliable, and high-quality services right at your doorstep. We believe in making life simpler, one service at a time.
            </p>
          </div>
        </motion.div>

        {/* Why Choose Us Grid */}
        <motion.div variants={itemVariants}>
          <h3 className="text-lg font-bold text-gray-800 mb-4 px-1">Why Choose Help U?</h3>
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:shadow-md transition-shadow group"
              >
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300"
                  style={{ background: 'linear-gradient(135deg, rgba(52, 121, 137, 0.1), rgba(187, 95, 54, 0.1))' }}>
                  <feature.icon className="w-5 h-5" style={{ stroke: 'url(#helpu-about-gradient)' }} />
                </div>
                <h4 className="text-sm font-bold text-gray-800 mb-1">{feature.title}</h4>
                <p className="text-xs text-gray-500 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </motion.div>

        {/* How It Works */}
        <motion.div variants={itemVariants}>
          <h3 className="text-lg font-bold text-gray-800 mb-4 px-1">How We Work</h3>
          <div className="bg-white rounded-2xl p-1 shadow-sm border border-gray-100">
            {[
              { title: 'Book Details', desc: 'Select service & schedule time', icon: FiSmartphone },
              { title: 'Get Matched', desc: 'We assign a top-rated pro', icon: FiUsers },
              { title: 'Relax', desc: 'Enjoy high-quality service', icon: FiSmile },
            ].map((step, i) => (
              <div key={i} className="flex items-center p-4 border-b last:border-0 border-gray-50 relative">
                <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 mr-4 shadow-sm text-white font-bold text-lg relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-[#347989] to-[#BB5F36]" />
                  <span className="relative z-10">{i + 1}</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-800">{step.title}</h4>
                  <p className="text-xs text-gray-500">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Footer Info */}
        <motion.div variants={itemVariants} className="text-center pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-400 mb-1">Designed & Developed by</p>
          <span className="text-sm font-bold tracking-wide" style={helpUTextGradient}>Help U Team</span>
          <p className="text-[10px] text-gray-300 mt-4">v7.6.27 • Made with ❤️ in India</p>
        </motion.div>
      </main>

      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </motion.div>
  );
};

export default AboutHelpU;
