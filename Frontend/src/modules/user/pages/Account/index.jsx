import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { userAuthService } from '../../../../services/authService';
import LogoutConfirm from '../../../../components/common/LogoutConfirm';
import { useConfig } from '../../../../context/ConfigContext';
import { motion } from 'framer-motion';
import useBookingConfig from '../../../../hooks/useBookingConfig';
import {
  FiRepeat,
  FiAlertOctagon,
  FiEdit3,
  FiClipboard,
  FiHeadphones,
  FiFileText,
  FiStar,
  FiMapPin,
  FiSettings,
  FiChevronRight,
  FiShoppingBag,
  FiLogOut,
  FiGift,
  FiShield,
  FiHelpCircle,
  FiInfo,
  FiGlobe
} from 'react-icons/fi';
import { MdAccountBalanceWallet } from 'react-icons/md';
import PageHeader from '../../components/layout/PageHeader';
import { useLanguage } from '../../../../context/LanguageContext';
import LanguageSelectorModal from '../../../../components/common/LanguageSelectorModal';

const toProfile = (user = {}) => ({
  name: user.name || 'Verified Customer',
  phone: user.phone || '',
  email: user.email || '',
  isPhoneVerified: user.isPhoneVerified || false,
  isEmailVerified: user.isEmailVerified || false,
  profilePhoto: user.profilePhoto || '',
  walletBalance: user.wallet?.balance ?? 0
});

const readStoredUser = () => {
  try {
    const stored = localStorage.getItem('userData');
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

// Format phone number for display
const formatPhoneNumber = (phone) => {
  if (!phone) return '';
  if (phone.startsWith('+91')) return phone;
  if (phone.length === 10) return `+91 ${phone}`;
  return phone;
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0 }
};

// One row of a grouped menu list
const MenuRow = ({ icon, label, subtitle, onClick }) => {
  const Icon = icon;
  return (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer"
  >
    <span className="w-9 h-9 rounded-full bg-canvas flex items-center justify-center text-ink shrink-0">
      <Icon className="w-[18px] h-[18px]" />
    </span>
    <span className="flex-1 text-[15px] font-medium text-ink flex items-center justify-between">
      <span>{label}</span>
      {subtitle && <span className="text-xs font-semibold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full mr-1">{subtitle}</span>}
    </span>
    <FiChevronRight className="w-5 h-5 text-gray-300 shrink-0" />
  </button>
  );
};

const MenuGroup = ({ title, items }) => {
  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;
  return (
    <motion.section variants={itemVariants} className="mb-5">
      <h3 className="text-[12px] font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">{title}</h3>
      <div className="bg-white rounded-[20px] border border-gray-100 overflow-hidden divide-y divide-gray-100">
        {visible.map(item => <MenuRow key={item.label} {...item} />)}
      </div>
    </motion.section>
  );
};

const AccountSkeleton = () => (
  <div className="px-4 pt-4 max-w-2xl mx-auto animate-pulse">
    <div className="bg-white rounded-[24px] border border-gray-100 p-4 flex items-center gap-4">
      <div className="w-16 h-16 rounded-full bg-gray-100" />
      <div className="flex-1 space-y-2">
        <div className="h-5 w-32 bg-gray-100 rounded" />
        <div className="h-3.5 w-28 bg-gray-100 rounded" />
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 mt-4">
      <div className="h-[108px] bg-white rounded-[20px] border border-gray-100" />
      <div className="h-[108px] bg-white rounded-[20px] border border-gray-100" />
    </div>
    <div className="mt-6 h-40 bg-white rounded-[20px] border border-gray-100" />
  </div>
);

const Account = () => {
  const navigate = useNavigate();
  const { isScrapEnabled } = useConfig();
  const { currentLanguage, supportedLanguages, t } = useLanguage();
  const bookingConfig = useBookingConfig();
  const [userProfile, setUserProfile] = useState(() => toProfile(readStoredUser() || {}));
  const [isLoading, setIsLoading] = useState(() => !readStoredUser());
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  const activeLang = supportedLanguages.find(l => l.code === currentLanguage);

  // Show cached profile immediately, then refresh from the API
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await userAuthService.getProfile();
        if (response.success && response.user) {
          setUserProfile(toProfile(response.user));
        }
      } catch {
        // Keep the cached profile if the API fails
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const getInitials = () => {
    if (userProfile.name && userProfile.name !== 'Verified Customer') {
      const names = userProfile.name.trim().split(/\s+/);
      return (names.length >= 2 ? names[0][0] + names[1][0] : names[0][0]).toUpperCase();
    }
    if (userProfile.phone) return userProfile.phone.slice(-2);
    return 'VC';
  };

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const handleLogout = async () => {
    try {
      await userAuthService.logout();
    } catch {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userData');
    }
    toast.success('Logged out successfully');
    navigate('/user/login', { replace: true });
  };

  const balance = userProfile.walletBalance || 0;

  return (
    <div className="min-h-screen pb-28 bg-canvas">
      <PageHeader title={t('account', 'Account')} />

      {isLoading ? (
        <AccountSkeleton />
      ) : (
        <motion.main
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
          className="px-4 pt-4 max-w-2xl mx-auto"
        >
          {/* Profile */}
          <motion.button
            type="button"
            variants={itemVariants}
            onClick={() => navigate('/user/update-profile')}
            className="w-full bg-white rounded-[24px] border border-gray-100 p-4 flex items-center gap-4 text-left hover:border-accent/25 transition-colors"
          >
            <div className="relative shrink-0">
              {userProfile.profilePhoto ? (
                <img
                  src={userProfile.profilePhoto}
                  alt={userProfile.name}
                  className="w-16 h-16 rounded-full object-cover"
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-accent text-white text-[22px] font-bold flex items-center justify-center">
                  {getInitials()}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white border border-gray-100 flex items-center justify-center text-accent">
                <FiEdit3 className="w-3 h-3" />
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[18px] font-bold text-ink truncate">{userProfile.name}</h2>
              <p className="text-[14px] text-gray-500 truncate">
                {userProfile.phone ? formatPhoneNumber(userProfile.phone) : 'No phone linked'}
              </p>
              {userProfile.email && <p className="text-[13px] text-gray-400 truncate">{userProfile.email}</p>}
            </div>
            <span className="shrink-0 inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent">
              {t('edit', 'Edit')} <FiChevronRight className="w-4 h-4" />
            </span>
          </motion.button>

          {/* Wallet + Refer */}
          <motion.div variants={itemVariants} className="mt-4 mb-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => navigate('/user/wallet')}
              className="bg-white rounded-[20px] border border-gray-100 p-4 text-left hover:border-accent/25 transition-colors"
            >
              <span className="w-10 h-10 rounded-full bg-accent-soft flex items-center justify-center text-accent">
                <MdAccountBalanceWallet className="w-5 h-5" />
              </span>
              <p className="mt-3 text-[12px] text-gray-500">{t('wallet_balance', 'Wallet balance')}</p>
              <p className={`text-[18px] font-bold leading-tight ${balance < 0 ? 'text-red-600' : 'text-ink'}`}>
                {balance < 0 ? '-' : ''}₹{Math.abs(balance).toLocaleString('en-IN')}
              </p>
              {balance < 0 && <p className="text-[11px] text-red-500">Penalty due</p>}
            </button>
            <button
              type="button"
              onClick={() => navigate('/user/rewards')}
              className="rounded-[20px] border border-accent/15 p-4 text-left hover:border-accent/35 transition-colors"
              style={{ background: 'linear-gradient(135deg, #E9F6F1 0%, #D9EFE6 100%)' }}
            >
              <span className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-accent">
                <FiGift className="w-5 h-5" />
              </span>
              <p className="mt-3 text-[12px] text-gray-600">{t('refer_and_earn', 'Refer & earn')}</p>
              <p className="text-[15px] font-bold text-ink leading-tight">{t('invite_friends', 'Invite friends')}</p>
            </button>
          </motion.div>

          <MenuGroup
            title={t('activity', 'Activity')}
            items={[
              { icon: FiClipboard, label: t('my_bookings', 'My Bookings'), onClick: () => navigate('/user/my-bookings') },
              { icon: FiStar, label: t('my_ratings', 'My Ratings'), onClick: () => navigate('/user/my-rating') },
              bookingConfig.isRecurringEnabled && { icon: FiRepeat, label: t('recurring_bookings', 'Recurring Bookings'), onClick: () => navigate('/user/recurring-bookings') },
              bookingConfig.isDisputeEnabled && { icon: FiAlertOctagon, label: t('my_disputes', 'My Disputes'), onClick: () => navigate('/user/disputes') },
            ]}
          />

          <MenuGroup
            title={t('shopping', 'Shopping')}
            items={[
              isScrapEnabled && { icon: FiShoppingBag, label: t('scrap_deals', 'Scrap Deals'), onClick: () => navigate('/user/scrap') },
            ]}
          />

          <MenuGroup
            title={t('preferences', 'Preferences')}
            items={[
              {
                icon: FiGlobe,
                label: t('language', 'Language'),
                subtitle: activeLang ? `${activeLang.name} (${activeLang.native})` : 'English',
                onClick: () => setIsLanguageModalOpen(true)
              },
              { icon: FiMapPin, label: t('manage_addresses', 'Manage Addresses'), onClick: () => navigate('/user/manage-addresses') },
              { icon: FiSettings, label: t('settings', 'Settings'), onClick: () => navigate('/user/settings') },
            ]}
          />

          <MenuGroup
            title={t('support_and_more', 'Support & more')}
            items={[
              { icon: FiHeadphones, label: t('help_support', 'Help & Support'), onClick: () => navigate('/user/help-support') },
              { icon: FiHelpCircle, label: t('faq', 'FAQ'), onClick: () => navigate('/user/faq') },
              { icon: FiFileText, label: t('cancellation_policy', 'Cancellation Policy'), onClick: () => navigate('/user/cancellation-policy') },
              { icon: FiFileText, label: t('terms_conditions', 'Terms & Conditions'), onClick: () => navigate('/user/terms') },
              { icon: FiShield, label: t('privacy_policy', 'Privacy Policy'), onClick: () => navigate('/user/privacy-policy') },
              { icon: FiInfo, label: t('about_helpu', 'About Help U'), onClick: () => navigate('/user/about-helpu') },
            ]}
          />

          <motion.div variants={itemVariants}>
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full h-12 rounded-full border border-red-200 bg-white text-red-600 text-[15px] font-semibold hover:bg-red-50 active:scale-[0.99] transition-all inline-flex items-center justify-center gap-2"
            >
              <FiLogOut className="w-[18px] h-[18px]" />
              {t('log_out', 'Log out')}
            </button>
            <LogoutConfirm isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={handleLogout} />
            <p className="text-center text-[12px] text-gray-400 mt-4 pb-6">Version 7.6.27 R547</p>
          </motion.div>
        </motion.main>
      )}

      <LanguageSelectorModal
        isOpen={isLanguageModalOpen}
        onClose={() => setIsLanguageModalOpen(false)}
      />
    </div>
  );
};

export default Account;
