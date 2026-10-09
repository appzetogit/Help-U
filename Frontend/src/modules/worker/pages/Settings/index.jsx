import React, { useState, useEffect, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiBell, FiVolume2, FiGlobe, FiInfo, FiLogOut, FiTrash2, FiMapPin } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { workerTheme as themeColors } from '../../../../theme';
import { workerAuthService } from '../../../../services/authService';
import { registerFCMToken, removeFCMToken } from '../../../../services/pushNotificationService';
import Header from '../../components/layout/Header';
import BottomNav from '../../components/layout/BottomNav';

const Settings = () => {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    notifications: true,
    soundAlerts: true,
    language: 'en',
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
    const loadSettings = () => {
      try {
        const savedSettings = JSON.parse(localStorage.getItem('workerSettings') || '{}');
        if (Object.keys(savedSettings).length > 0) {
          setSettings(prev => ({ ...prev, ...savedSettings }));
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  const handleToggle = async (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    localStorage.setItem('workerSettings', JSON.stringify(updated));

    // Handle FCM Token registration/removal if notifications toggled
    if (key === 'notifications') {
      if (updated.notifications) {
        // Turning ON
        try {
          await registerFCMToken('worker', true);
          toast.success('Notifications enabled');
        } catch (error) {
          console.error('Error enabling notifications:', error);
          toast.error('Failed to enable notifications');
          // Revert toggle if failed? For now, we keep UI in sync with intent.
        }
      } else {
        // Turning OFF
        try {
          await removeFCMToken('worker');
          toast.success('Notifications disabled');
        } catch (error) {
          console.error('Error disabling notifications:', error);
        }
      }
    }
  };

  const handleLanguageChange = (lang) => {
    const updated = { ...settings, language: lang };
    setSettings(updated);
    localStorage.setItem('workerSettings', JSON.stringify(updated));
  };

  const handleLogout = async () => {
    try {
      await workerAuthService.logout();
      toast.success('Logged out successfully');
      navigate('/worker/login');
    } catch (error) {
      // Even if API call fails, clear local storage
      localStorage.removeItem('workerAccessToken');
      localStorage.removeItem('workerRefreshToken');
      localStorage.removeItem('workerData');
      toast.success('Logged out successfully');
      navigate('/worker/login');
    }
  };

  const handleDeleteAccount = () => {
    if (window.confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      // Clear all worker data
      localStorage.removeItem('workerProfile');
      localStorage.removeItem('workerSettings');
      localStorage.removeItem('workerAcceptedBookings');
      localStorage.removeItem('workerWallet');
      localStorage.removeItem('workerTransactions');
      // Navigate to home
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen pb-20" style={{ background: themeColors.backgroundGradient }}>
      <Header title="Settings" />

      <main className="px-4 py-6">
        {/* Notification Settings */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3 className="font-bold text-gray-800 mb-4">Notifications</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FiBell className="w-5 h-5" style={{ color: themeColors.icon }} />
                <div>
                  <p className="font-semibold text-gray-800">Push Notifications</p>
                  <p className="text-sm text-gray-600">Receive booking alerts</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('notifications')}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.notifications ? 'bg-green-500' : 'bg-gray-300'
                  }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.notifications ? 'transform translate-x-6' : ''
                    }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FiVolume2 className="w-5 h-5" style={{ color: themeColors.icon }} />
                <div>
                  <p className="font-semibold text-gray-800">Sound Alerts</p>
                  <p className="text-sm text-gray-600">Play sound for new bookings</p>
                </div>
              </div>
              <button
                onClick={() => handleToggle('soundAlerts')}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.soundAlerts ? 'bg-green-500' : 'bg-gray-300'
                  }`}
              >
                <span
                  className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${settings.soundAlerts ? 'transform translate-x-6' : ''
                    }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Address Management */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md cursor-pointer hover:shadow-lg transition-shadow"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
          onClick={() => navigate('/worker/address-management')}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <FiMapPin className="w-5 h-5" style={{ color: themeColors.icon }} />
              <div>
                <p className="font-semibold text-gray-800">Manage Address</p>
                <p className="text-sm text-gray-600">Set your business location</p>
              </div>
            </div>
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        {/* Language Settings */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <FiGlobe className="w-5 h-5" style={{ color: themeColors.icon }} />
            <h3 className="font-bold text-gray-800">Language</h3>
          </div>

          <div className="space-y-2">
            {[
              { code: 'en', name: 'English' },
              { code: 'hi', name: 'हिंदी' },
            ].map((lang) => (
              <button
                key={lang.code}
                onClick={() => handleLanguageChange(lang.code)}
                className={`w-full py-3 px-4 rounded-lg text-left transition-all ${settings.language === lang.code
                  ? 'text-white'
                  : 'bg-gray-50 text-gray-700'
                  }`}
                style={
                  settings.language === lang.code
                    ? {
                      background: themeColors.button,
                      boxShadow: `0 2px 8px ${themeColors.button}40`,
                    }
                    : {}
                }
              >
                {lang.name}
              </button>
            ))}
          </div>
        </div>

        {/* About */}
        <div
          className="bg-white rounded-xl p-4 mb-6 shadow-md"
          style={{
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <FiInfo className="w-5 h-5" style={{ color: themeColors.icon }} />
            <h3 className="font-bold text-gray-800">About</h3>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-gray-600">App Version: 1.0.0</p>
            <p className="text-sm text-gray-600">Worker App</p>
          </div>
        </div>

        {/* Logout */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleLogout();
          }}
          className="w-full py-4 rounded-xl font-semibold text-white mb-4 flex items-center justify-center gap-2 transition-all active:scale-95"
          style={{
            background: themeColors.button,
            boxShadow: `0 4px 12px ${themeColors.button}40`,
            cursor: 'pointer'
          }}
        >
          <FiLogOut className="w-5 h-5" />
          Logout
        </button>

        {/* Delete Account */}
        <button
          onClick={handleDeleteAccount}
          className="w-full py-4 rounded-xl font-semibold text-red-600 border-2 border-red-600 transition-all active:scale-95"
        >
          <div className="flex items-center justify-center gap-2">
            <FiTrash2 className="w-5 h-5" />
            Delete Account
          </div>
        </button>
      </main>

      <BottomNav />
    </div>
  );
};

export default Settings;

