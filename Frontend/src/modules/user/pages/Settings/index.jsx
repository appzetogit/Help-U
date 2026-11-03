import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiArrowLeft, FiBell, FiMail, FiPhone, FiMessageCircle, FiShield, FiChevronRight, FiLogOut, FiTrash2, FiGlobe, FiCheck } from 'react-icons/fi';
import { FaWhatsapp } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import LogoutConfirm from '../../../../components/common/LogoutConfirm';
import { themeColors } from '../../../../theme';
import { userAuthService } from '../../../../services/authService';
import { registerFCMToken, removeFCMToken } from '../../../../services/pushNotificationService';
import PushStatusCard from '../../../../components/common/PushStatusCard';
import { useLanguage } from '../../../../context/LanguageContext';
import BottomNav from '../../components/layout/BottomNav';

const Settings = () => {
  const navigate = useNavigate();
  const { currentLanguage, setLanguage, supportedLanguages } = useLanguage();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // State for notification toggles
  const [notifications, setNotifications] = useState({
    push: true,
    email: true,
  });

  const handleLanguageSelect = async (code) => {
    const isDifferent = code !== currentLanguage;
    setLanguage(code);
    localStorage.setItem('app_language_manually_set', 'true');
    toast.success('App language updated');
    try {
      await userAuthService.updateProfile({
        settings: { language: code }
      });
    } catch (e) {
      // Local state and localStorage already updated
    }

    if (isDifferent && typeof window !== 'undefined' && window.google?.maps) {
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  // Load user settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await userAuthService.getProfile();
      if (response.success && response.user?.settings) {
        setNotifications(prev => ({
          ...prev,
          push: response.user.settings.notifications ?? true
        }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  const handleToggle = async (key) => {
    // Optimistic update
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));

    // Handle Push Toggle specifically
    if (key === 'push') {
      const newState = !notifications.push;
      const toastId = toast.loading(newState ? 'Enabling notifications...' : 'Disabling notifications...');

      try {
        if (newState) {
          // Enable
          const token = await registerFCMToken('user', true);
          if (!token) {
            toast.error('Failed to enable. Check permissions.', { id: toastId });
            // Revert state
            setNotifications(prev => ({ ...prev, push: false }));
            return;
          }
        } else {
          // Disable
          await removeFCMToken('user');
        }

        // Persist preference to backend
        await userAuthService.updateProfile({
          settings: { notifications: newState }
        });

        toast.success(newState ? 'Notifications enabled' : 'Notifications disabled', { id: toastId });

      } catch (error) {
        console.error('Error updating notification settings:', error);
        toast.error('Failed to update settings', { id: toastId });
        // Revert
        setNotifications(prev => ({ ...prev, push: !newState }));
      }
    }
  };

  const handlePrivacyClick = () => {
    // Navigate to privacy page (can be implemented later)
    // navigate('/privacy');
  };

  return (
    <div className="min-h-screen bg-white pb-20">
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
            <h1 className="text-xl font-bold text-black">Settings</h1>
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        {/* Order Related Messages Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-black mb-2">Order related messages</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            Order related messages can't be turned off as they are important for service experience.
          </p>
        </div>

        {/* Notifications & Reminders Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-black mb-4">Notifications & reminders</h2>

          <PushStatusCard userType="user" className="mb-3" />

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Push Notifications */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  <FiBell className="w-5 h-5" style={{ color: themeColors.button }} />
                </div>
                <span className="text-sm font-medium text-black">Push Notifications</span>
              </div>
              <button
                onClick={() => handleToggle('push')}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${notifications.push ? 'bg-green-700' : 'bg-gray-300'
                  }`}
                style={notifications.push ? { backgroundColor: '#15803d' } : {}}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${notifications.push ? 'translate-x-6' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>

            {/* Email */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                  <FiMail className="w-5 h-5" style={{ color: themeColors.button }} />
                </div>
                <span className="text-sm font-medium text-black">Email</span>
              </div>
              <button
                onClick={() => handleToggle('email')}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${notifications.email ? 'bg-green-700' : 'bg-gray-300'
                  }`}
                style={notifications.email ? { backgroundColor: '#15803d' } : {}}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 ${notifications.email ? 'translate-x-6' : 'translate-x-0'
                    }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* App Language Section */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FiGlobe className="w-5 h-5" style={{ color: themeColors.button }} />
            <h2 className="text-base font-bold text-black">App Language</h2>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100 shadow-xs">
            {supportedLanguages.map((lang) => {
              const active = currentLanguage === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageSelect(lang.code)}
                  className={`w-full p-4 flex items-center justify-between text-left transition-colors cursor-pointer ${
                    active ? 'bg-teal-50/40' : 'hover:bg-gray-50'
                  }`}
                >
                  <div>
                    <span className={`text-sm font-medium block ${active ? 'text-teal-900 font-bold' : 'text-gray-800'}`}>
                      {lang.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      {lang.native}
                    </span>
                  </div>
                  {active && (
                    <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center">
                      <FiCheck className="w-3.5 h-3.5" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Account Actions Section */}
        <div className="mb-6">
          <h2 className="text-base font-bold text-black mb-4">Account</h2>
          <div className="space-y-3">
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-red-50">
                <FiLogOut className="w-5 h-5 text-red-500" />
              </div>
              <span className="text-sm font-medium text-red-600">Log Out</span>
            </button>
            <LogoutConfirm
              isOpen={showLogoutConfirm}
              onClose={() => setShowLogoutConfirm(false)}
              onConfirm={async () => {
                try { await userAuthService.logout(); } catch { /* tokens are cleared below */ }
                navigate('/user/login', { replace: true });
                toast.success('Logged out successfully');
              }}
            />

            <button
              onClick={() => {
                if (window.confirm('Are you sure you want to delete your account? This action is irreversible.')) {
                  toast.loading('Processing deletion...');
                  // Add actual delete logic here or navigate to a dedicated page
                  setTimeout(() => {
                    toast.dismiss();
                    toast.error('Please contact support to delete account for security reasons.');
                  }, 1000);
                }
              }}
              className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 hover:bg-gray-50 active:scale-[0.98] transition-all"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-100">
                <FiTrash2 className="w-5 h-5 text-gray-500" />
              </div>
              <div className="text-left">
                <span className="text-sm font-medium text-gray-700 block">Delete Account</span>
                <span className="text-xs text-gray-500">Permanently remove your data</span>
              </div>
            </button>
          </div>
        </div>

        {/* Privacy & Data Section */}
        <div className="space-y-4 mb-6">
          <button
            onClick={handlePrivacyClick}
            className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:bg-gray-50 active:scale-[0.98] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(0, 166, 166, 0.1)' }}>
                <FiShield className="w-5 h-5" style={{ color: themeColors.button }} />
              </div>
              <span className="text-sm font-medium text-black">Privacy & data</span>
            </div>
            <FiChevronRight className="w-5 h-5 text-gray-400" />
          </button>

        </div>
      </main>

      {/* BottomNav hidden on this page */}
    </div>
  );
};

export default Settings;
