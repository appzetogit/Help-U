import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiUser, FiEdit2, FiMapPin, FiPhone, FiMail, FiBriefcase } from 'react-icons/fi';
import { workerAuthService } from '../../../../services/authService';
import { workerTheme as themeColors } from '../../../../theme';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';

const ProfileDetails = () => {
  const navigate = useNavigate();

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  const [profile, setProfile] = useState({
    name: '',
    businessName: '',
    phone: '',
    email: '',
    address: '',
    serviceCategory: '',
    profilePhoto: '',
  });

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
    const loadProfile = async () => {
      try {
        // Optimistic load from local storage
        const localWorkerData = JSON.parse(localStorage.getItem('workerData') || '{}');
        const workerProfile = JSON.parse(localStorage.getItem('workerProfile') || '{}');

        // Merge sources, preferring workerData (which might be fresher from other pages)
        const storedData = { ...workerProfile, ...localWorkerData };

        if (Object.keys(storedData).length > 0) {
          // Format address if object
          let addressString = storedData.address;
          if (typeof storedData.address === 'object' && storedData.address !== null) {
            if (storedData.address.fullAddress) {
              addressString = storedData.address.fullAddress;
            } else {
              addressString = `${storedData.address.addressLine1 || ''} ${storedData.address.addressLine2 || ''} ${storedData.address.city || ''} ${storedData.address.state || ''} ${storedData.address.pincode || ''}`.trim() || 'Not set';
            }
          }

          setProfile(prev => ({
            ...prev,
            name: storedData.name || 'Worker Name',
            businessName: storedData.businessName || null,
            phone: storedData.phone || '',
            email: storedData.email || '',
            address: addressString || 'Not set',
            serviceCategory: storedData.serviceCategory || storedData.service || '',
            profilePhoto: storedData.profilePhoto || ''
          }));
        }

        // Fetch fresh data from API
        const response = await workerAuthService.getProfile();
        if (response.success) {
          const apiData = response.worker;

          // Format address
          let formattedAddress = apiData.address;
          if (typeof apiData.address === 'object' && apiData.address !== null) {
            if (apiData.address.fullAddress) {
              formattedAddress = apiData.address.fullAddress;
            } else {
              formattedAddress = `${apiData.address.addressLine1 || ''} ${apiData.address.addressLine2 || ''} ${apiData.address.city || ''} ${apiData.address.state || ''} ${apiData.address.pincode || ''}`.trim() || 'Not set';
            }
          }

          const newProfile = {
            name: apiData.name,
            businessName: apiData.businessName,
            phone: apiData.phone,
            email: apiData.email,
            address: formattedAddress,
            serviceCategory: Array.isArray(apiData.service) ? apiData.service.join(', ') : (apiData.service || ''),
            profilePhoto: apiData.profilePhoto
          };

          setProfile(prev => ({ ...prev, ...newProfile }));

          // Update local storage
          localStorage.setItem('workerData', JSON.stringify(apiData));
          localStorage.setItem('workerProfile', JSON.stringify({ ...storedData, ...apiData }));
        }

      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
    window.addEventListener('workerProfileUpdated', loadProfile);

    return () => {
      window.removeEventListener('workerProfileUpdated', loadProfile);
    };
  }, []);

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Profile Details" />

      <main className="px-4 pt-4 pb-6">
        {/* Header with Edit Button */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-lg">Profile Information</h3>
          <button
            onClick={() => navigate('/worker/profile/edit')}
            className="p-2 rounded-lg hover:scale-105 transition-all flex items-center gap-1.5"
            style={{
              background: `linear-gradient(135deg, ${themeColors.button} 0%, ${themeColors.icon} 100%)`,
              color: '#FFFFFF',
              boxShadow: `0 2px 8px ${hexToRgba(themeColors.button, 0.3)}`,
            }}
          >
            <FiEdit2 className="w-4 h-4" />
            <span className="text-sm font-semibold">Edit</span>
          </button>
        </div>

        {/* Profile Info - Compact List */}
        <div className="space-y-4 mb-6">

          {/* Profile Photo Section */}
          <div className="flex justify-center mb-2">
            <div className="w-28 h-28 rounded-full p-1 bg-white shadow-lg relative">
              <div className="w-full h-full rounded-full overflow-hidden bg-gray-50 flex items-center justify-center border border-gray-100">
                {profile.profilePhoto ? (
                  <img
                    src={profile.profilePhoto}
                    alt={profile.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <FiUser className="w-10 h-10 text-gray-300" />
                )}
              </div>
              <div
                className="absolute bottom-1 right-1 w-8 h-8 rounded-full flex items-center justify-center border-2 border-white shadow-md text-white"
                style={{ background: themeColors.button }}
              >
                <FiUser className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Personal Info Group */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Personal Details</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiUser className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Full Name</p>
                  <p className="text-gray-900 font-bold text-sm truncate">{profile.name}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiBriefcase className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Business Name</p>
                  <p className="text-gray-900 font-bold text-sm truncate">{profile.businessName}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Info Group */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Contact Information</h4>
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiPhone className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Mobile Number</p>
                  <p className="text-gray-900 font-bold text-sm truncate">{profile.phone}</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiMail className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Email Address</p>
                  <p className="text-gray-900 font-bold text-sm truncate">{profile.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.icon}15` }}>
                  <FiMapPin className="w-5 h-5" style={{ color: themeColors.icon }} />
                </div>
                <div className="flex-1 min-w-0 pt-1">
                  <p className="text-xs text-gray-500 font-medium mb-0.5">Address</p>
                  <p className="text-gray-900 font-bold text-sm leading-relaxed">{profile.address}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Professional Info Group */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-4">Professional Profile</h4>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${themeColors.button}15` }}>
                <FiBriefcase className="w-5 h-5" style={{ color: themeColors.button }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 font-medium mb-1.5">Service Categories</p>
                <div className="flex flex-wrap gap-1.5">
                  {profile.serviceCategory && (Array.isArray(profile.serviceCategory) ? profile.serviceCategory : profile.serviceCategory.split(', ')).filter(Boolean).length > 0 ? (
                    (Array.isArray(profile.serviceCategory) ? profile.serviceCategory : profile.serviceCategory.split(', ')).filter(Boolean).map((cat, i) => (
                      <span key={i} className="inline-flex items-center px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-bold border border-teal-100">
                        {cat}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-400 text-sm italic">Not set</span>
                  )}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>

      <BottomNav />
    </div>
  );
};

export default ProfileDetails;

