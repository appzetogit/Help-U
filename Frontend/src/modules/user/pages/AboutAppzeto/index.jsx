import React from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiCheckCircle, FiUsers, FiShield, FiClock, FiAward, FiHeart } from 'react-icons/fi';
import { themeColors } from '../../../../theme';

const AboutAppzeto = () => {
  const navigate = useNavigate();

  const features = [
    {
      icon: <FiUsers className="w-6 h-6" style={{ color: themeColors.button }} />,
      title: 'Expert Service Providers',
      description: 'Verified and trained professionals for all your service needs'
    },
    {
      icon: <FiShield className="w-6 h-6" style={{ color: themeColors.button }} />,
      title: 'Safe & Secure',
      description: 'Your safety and security is our top priority'
    },
    {
      icon: <FiClock className="w-6 h-6" style={{ color: themeColors.button }} />,
      title: 'On-Time Service',
      description: 'Punctual service delivery at your convenience'
    },
    {
      icon: <FiAward className="w-6 h-6" style={{ color: themeColors.button }} />,
      title: 'Quality Assured',
      description: 'High-quality service with satisfaction guarantee'
    }
  ];

  const services = [
    'Home Repairs & Maintenance',
    'Electrical Services',
    'Plumbing Solutions',
    'Salon & Spa Services',
    'Cleaning Services',
    'AC & Appliance Repair',
    'Massage Services',
    'And many more...'
  ];

  const values = [
    'Customer-first approach',
    'Transparent pricing',
    'Professional service',
    '100% satisfaction guarantee',
    '24/7 customer support'
  ];

  return (
    <div className="min-h-screen bg-white pb-4">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-30">
        <div className="px-4 pt-4 pb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <FiArrowLeft className="w-5 h-5 text-black" />
            </button>
            <h1 className="text-xl font-bold text-black">About Appzeto</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-6">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <div className="w-24 h-24 mx-auto mb-4 rounded-full flex items-center justify-center" 
            style={{ 
              background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.icon} 100%)`,
              boxShadow: '0 4px 20px rgba(0, 166, 166, 0.3)'
            }}>
            <span className="text-4xl font-bold text-white">A</span>
          </div>
          <h2 className="text-2xl font-bold text-black mb-2">Welcome to Appzeto</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Your trusted partner for all home and personal care services
          </p>
        </div>

        {/* What We Provide Section */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-black mb-4">What We Provide</h3>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <p className="text-sm text-gray-700 mb-4 leading-relaxed">
              Appzeto is a comprehensive service platform that connects you with verified, 
              professional service providers for all your home and personal care needs. 
              We offer a wide range of services to make your life easier and more convenient.
            </p>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-black mb-2">Our Services Include:</p>
              <div className="grid grid-cols-1 gap-2">
                {services.map((service, index) => (
                  <div key={index} className="flex items-start gap-2">
                    <FiCheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                    <span className="text-sm text-gray-700">{service}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Key Features */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-black mb-4">Why Choose Appzeto</h3>
          <div className="grid grid-cols-2 gap-4">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
              >
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3" 
                  style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  {feature.icon}
                </div>
                <h4 className="text-sm font-bold text-black mb-1">{feature.title}</h4>
                <p className="text-xs text-gray-600 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* How We Deal Section */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-black mb-4">How We Deal</h3>
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl border border-blue-200 p-5">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" 
                  style={{ backgroundColor: themeColors.button }}>
                  <span className="text-white text-sm font-bold">1</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-black mb-1">Easy Booking</h4>
                  <p className="text-xs text-gray-700">Book services in just a few taps. Select your preferred time slot and we'll handle the rest.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" 
                  style={{ backgroundColor: themeColors.button }}>
                  <span className="text-white text-sm font-bold">2</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-black mb-1">Verified Professionals</h4>
                  <p className="text-xs text-gray-700">All our service providers are background verified, trained, and certified professionals.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" 
                  style={{ backgroundColor: themeColors.button }}>
                  <span className="text-white text-sm font-bold">3</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-black mb-1">Quality Assurance</h4>
                  <p className="text-xs text-gray-700">We ensure high-quality service delivery with our Appzeto Cover Promise for your peace of mind.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" 
                  style={{ backgroundColor: themeColors.button }}>
                  <span className="text-white text-sm font-bold">4</span>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-black mb-1">Customer Support</h4>
                  <p className="text-xs text-gray-700">Our dedicated support team is available 24/7 to assist you with any queries or concerns.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Our Values */}
        <div className="mb-8">
          <h3 className="text-xl font-bold text-black mb-4">Our Core Values</h3>
          <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
            <div className="space-y-3">
              {values.map((value, index) => (
                <div key={index} className="flex items-center gap-3">
                  <FiHeart className="w-5 h-5" style={{ color: themeColors.button }} />
                  <span className="text-sm text-gray-700">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Contact Section */}
        <div className="mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="text-lg font-bold text-black mb-3">Get in Touch</h3>
            <p className="text-sm text-gray-700 mb-4">
              Have questions or feedback? We'd love to hear from you!
            </p>
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Email:</span> support@appzeto.com
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Phone:</span> +91 1800-XXX-XXXX
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default AboutAppzeto;

