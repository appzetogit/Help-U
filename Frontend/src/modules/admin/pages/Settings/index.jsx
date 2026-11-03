import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSettings, FiGrid, FiDollarSign, FiSave, FiUser, FiMail, FiTrash2, FiPlus, FiUsers, FiShield, FiFileText, FiMapPin, FiPhone, FiHeadphones, FiMessageCircle, FiEdit, FiLock, FiUnlock, FiX, FiCheckCircle, FiGlobe, FiCheck, FiCompass, FiClock, FiActivity, FiSearch, FiRefreshCw, FiSmartphone, FiMonitor, FiAlertCircle, FiEye, FiSliders } from 'react-icons/fi';
import { getSettings, updateSettings, updateAdminProfile, getAdminProfile, getAllAdmins, createAdmin, deleteAdmin, updateAdminDetails, toggleAdminStatus, getAdminLoginHistory, getAdminAuditLogs } from '../../services/settingsService';
import { ALL_AVAILABLE_LANGUAGES } from '../../../../context/LanguageContext';
import { cityService } from '../../services/cityService';
import { publicCatalogService } from '../../../../services/catalogService';
import CityManagement from '../Cities';
import { toast } from 'react-hot-toast';
import ModalLock from '../../../../components/common/ModalLock';

const AVAILABLE_PERMISSIONS = [
  { key: 'dashboard', label: 'Dashboard', desc: 'KPI cards & overview metrics' },
  { key: 'users', label: 'Users', desc: 'Customers, wallets & referrals' },
  { key: 'workers', label: 'Workers', desc: 'Verification, approval & ledger' },
  { key: 'bookings', label: 'Bookings', desc: 'Live jobs, assignment & tracking' },
  { key: 'disputes', label: 'Disputes', desc: 'User & worker dispute resolutions' },
  { key: 'recurring-bookings', label: 'Recurring Bookings', desc: 'Scheduled recurring subscriptions' },
  { key: 'scrap', label: 'Scrap Items', desc: 'Scrap requests & verification' },
  { key: 'payments', label: 'Payments', desc: 'User & worker payments, platform revenue' },
  { key: 'settlements', label: 'Settlements', desc: 'Worker withdrawals & payouts' },
  { key: 'commission', label: 'Commission', desc: 'Worker commission rules & tiers' },
  { key: 'user-categories', label: 'User Catalog', desc: 'Categories, brands & user services' },
  { key: 'worker-services', label: 'Worker Services', desc: 'Worker-side service catalog' },
  { key: 'worker-parts', label: 'Worker Parts', desc: 'Spare parts inventory & pricing' },
  { key: 'addons', label: 'Add-ons', desc: 'Extra service add-on items' },
  { key: 'reports', label: 'Reports', desc: 'GMV, AOV & advanced business analytics' },
  { key: 'reviews', label: 'Reviews', desc: 'Ratings & customer feedback' },
  { key: 'coupons', label: 'Coupons', desc: 'Discount vouchers & promo rules' },
  { key: 'settings', label: 'Settings', desc: 'System configuration & admin staff' },
  { key: 'data-export', label: 'Data Export', desc: 'Download customer & worker data (Excel/PDF); also needs Users / Workers' },
  { key: 'customization', label: 'Customization', desc: 'Hero banners & home content' },
  { key: 'booking-config', label: 'Booking Config', desc: 'Search radius, waves & ranking' }
];

const AdminSettings = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [settings, setSettings] = useState({
  });

  const [financialSettings, setFinancialSettings] = useState({
    visitedCharges: 0,
    serviceGstPercentage: 18,
    partsGstPercentage: 18,
    servicePayoutPercentage: 90,
    partsPayoutPercentage: 100,
    vendorCashLimit: 10000,
    cancellationPenalty: 49,
    tdsPercentage: 1,
    platformFeePercentage: 1,
    maxSearchTime: 5,
    waveDuration: 60,
    searchRadius: 10,
    isScrapEnabled: true
  });

  // Billing Configuration State
  const [billingSettings, setBillingSettings] = useState({
    companyName: 'TodayMyDream',
    companyGSTIN: '',
    companyPAN: '',
    companyAddress: '',
    companyCity: '',
    companyState: '',
    companyPincode: '',
    companyPhone: '',
    companyEmail: '',
    invoicePrefix: 'INV',
    sacCode: '998599'
  });
  const [billingLoading, setBillingLoading] = useState(false);

  // Support Settings State
  const [supportSettings, setSupportSettings] = useState({
    supportEmail: '',
    supportPhone: '',
    supportWhatsapp: ''
  });
  const [supportLoading, setSupportLoading] = useState(false);

  // Map API & Language Settings State
  const [mapAndLanguageSettings, setMapAndLanguageSettings] = useState({
    googleMapsApiKey: '',
    googleMapsLanguage: 'auto',
    mapRegion: 'IN',
    defaultAppLanguage: 'en',
    supportedLanguages: ['en', 'hi'],
    autoDetectLanguageFromMap: false
  });
  const [mapLanguageLoading, setMapLanguageLoading] = useState(false);

  const [profile, setProfile] = useState(() => {
    try {
      const stored = JSON.parse(sessionStorage.getItem('adminData') || localStorage.getItem('adminData') || '{}');
      return {
        id: stored.id || stored._id || '',
        _id: stored._id || stored.id || '',
        name: stored.name || '',
        email: stored.email || '',
        role: stored.role || 'admin',
        assignedCity: stored.cityName || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    } catch {
      return {
        id: '',
        _id: '',
        name: '',
        email: '',
        role: 'admin',
        assignedCity: '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      };
    }
  });

  // Admin Management State
  const [admins, setAdmins] = useState([]);
  const [cities, setCities] = useState([]); // State for cities
  const [showAddAdmin, setShowAddAdmin] = useState(false);
  const [newAdmin, setNewAdmin] = useState({ name: '', email: '', password: '', role: 'sub_admin', permissions: [] });
  const [adminLoading, setAdminLoading] = useState(false);

  // Super Admin Tabs: 'admins' | 'logins' | 'audits'
  const [adminTab, setAdminTab] = useState('admins');

  // Login History State
  const [loginLogs, setLoginLogs] = useState([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginSearch, setLoginSearch] = useState('');
  const [loginStatusFilter, setLoginStatusFilter] = useState('all');
  const [selectedAdminForLogins, setSelectedAdminForLogins] = useState(null);

  // Administrative Audit State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('all');
  const [selectedDiff, setSelectedDiff] = useState(null);

  const togglePermission = (key) => {
    setNewAdmin(prev => {
      const current = Array.isArray(prev.permissions) ? prev.permissions : [];
      const updated = current.includes(key)
        ? current.filter(k => k !== key)
        : [...current, key];
      return { ...prev, permissions: updated };
    });
  };

  const selectAllPermissions = () => {
    setNewAdmin(prev => ({
      ...prev,
      permissions: AVAILABLE_PERMISSIONS.map(p => p.key)
    }));
  };

  const clearAllPermissions = () => {
    setNewAdmin(prev => ({ ...prev, permissions: [] }));
  };

  const [loading, setLoading] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [activeView, setActiveView] = useState('main'); // 'main', 'profile', 'financial', 'system', 'admins'

  const isSuperAdmin = profile.role === 'super_admin';

  // Sync activeView with route path
  useEffect(() => {
    const path = location.pathname;
    if (path.includes('/settings/system')) {
      setActiveView('system');
    } else if (path.includes('/settings/map-language') || path.includes('/settings/map')) {
      setActiveView('map-language');
    } else if (path.includes('/settings/financial') || path.includes('/settings/service-config')) {
      setActiveView('financial');
    } else if (path.includes('/settings/profile') || path.includes('/settings/general')) {
      setActiveView('profile');
    } else if (path.includes('/settings/admins')) {
      setActiveView('admins');
    } else if (path.includes('/settings/cities')) {
      setActiveView('cities');
    } else if (path === '/admin/settings' || path === '/admin/settings/') {
      setActiveView('main');
    }
  }, [location.pathname]);

  const changeView = (view) => {
    setActiveView(view);
    if (view === 'main') {
      navigate('/admin/settings');
    } else {
      navigate(`/admin/settings/${view}`);
    }
  };

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const res = await getAdminProfile();
        if (res.success && res.data) {
          setProfile(prev => ({
            ...prev,
            id: res.data.id || res.data._id || prev.id,
            _id: res.data._id || res.data.id || prev._id,
            email: res.data.email,
            name: res.data.name || 'Admin',
            role: res.data.role || 'admin',
            assignedCity: res.data.cityName || res.data.cityId?.name || ''
          }));
          const adminData = JSON.parse(localStorage.getItem('adminData') || '{}');
          const newData = { ...adminData, ...res.data };
          localStorage.setItem('adminData', JSON.stringify(newData));
        }
      } catch (error) {
        console.error('Error loading admin profile:', error);
      }
    };

    const loadSettings = () => {
      try {
        const adminSettings = JSON.parse(localStorage.getItem('adminSettings') || '{}');
        if (Object.keys(adminSettings).length > 0) {
          setSettings(prev => ({ ...prev, ...adminSettings }));
        }
      } catch (error) {
        console.error('Error loading admin settings:', error);
      }
    };

    const loadFinancialSettings = async () => {
      try {
        const res = await getSettings();
        if (res.success && res.settings) {
          setFinancialSettings({
            visitedCharges: res.settings.visitedCharges || 0,
            serviceGstPercentage: res.settings.serviceGstPercentage ?? 18,
            partsGstPercentage: res.settings.partsGstPercentage ?? 18,
            servicePayoutPercentage: res.settings.servicePayoutPercentage ?? 90,
            partsPayoutPercentage: res.settings.partsPayoutPercentage ?? 100,
            tdsPercentage: res.settings.tdsPercentage || 1,
            platformFeePercentage: res.settings.platformFeePercentage || 1,
            vendorCashLimit: res.settings.vendorCashLimit || 10000,
            cancellationPenalty: res.settings.cancellationPenalty !== undefined ? res.settings.cancellationPenalty : 49,
            searchRadius: res.settings.searchRadius || 10,
            isScrapEnabled: res.settings.isScrapEnabled !== undefined ? res.settings.isScrapEnabled : true
          });
          // Load billing settings
          setBillingSettings({
            companyName: res.settings.companyName || 'TodayMyDream',
            companyGSTIN: res.settings.companyGSTIN || '',
            companyPAN: res.settings.companyPAN || '',
            companyAddress: res.settings.companyAddress || '',
            companyCity: res.settings.companyCity || '',
            companyState: res.settings.companyState || '',
            companyPincode: res.settings.companyPincode || '',
            companyPhone: res.settings.companyPhone || '',
            companyEmail: res.settings.companyEmail || '',
            invoicePrefix: res.settings.invoicePrefix || 'INV',
            sacCode: res.settings.sacCode || '998599'
          });
          // Load support settings
          setSupportSettings({
            supportEmail: res.settings.supportEmail || '',
            supportPhone: res.settings.supportPhone || '',
            supportWhatsapp: res.settings.supportWhatsapp || ''
          });
          // Load Map API & Language settings
          setMapAndLanguageSettings({
            googleMapsApiKey: res.settings.googleMapsApiKey || '',
            googleMapsLanguage: res.settings.googleMapsLanguage || 'auto',
            mapRegion: res.settings.mapRegion || 'IN',
            defaultAppLanguage: res.settings.defaultAppLanguage || 'en',
            supportedLanguages: Array.isArray(res.settings.supportedLanguages) && res.settings.supportedLanguages.length > 0
              ? res.settings.supportedLanguages
              : ['en', 'hi'],
            autoDetectLanguageFromMap: Boolean(res.settings.autoDetectLanguageFromMap)
          });
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadProfile();
    loadSettings();
    loadFinancialSettings();

    const handleSync = () => loadFinancialSettings();
    window.addEventListener('systemConfigUpdated', handleSync);
    window.addEventListener('adminSettingsUpdated', handleSync);
    return () => {
      window.removeEventListener('systemConfigUpdated', handleSync);
      window.removeEventListener('adminSettingsUpdated', handleSync);
    };
  }, []);

  const loadAdmins = async () => {
    try {
      console.log('Fetching admins list...');
      const res = await getAllAdmins();
      console.log('Admins fetched:', res);
      if (res.success) {
        setAdmins(res.data || []);
      }
    } catch (error) {
      console.error('Error loading admins:', error);
    }
  };

  // Fetch cities for dropdown
  const loadCities = async () => {
    try {
      const res = await cityService.getAll();
      if (res.success) {
        setCities(res.cities || []);
      }
    } catch (error) {
      console.error('Error loading cities:', error);
    }
  };

  const loadLoginHistory = async (targetAdminId = selectedAdminForLogins?._id, searchVal = loginSearch, statusVal = loginStatusFilter) => {
    if (!isSuperAdmin) return;
    setLoginLoading(true);
    try {
      const params = {};
      if (targetAdminId) params.adminId = targetAdminId;
      if (statusVal && statusVal !== 'all') params.status = statusVal;
      if (searchVal && searchVal.trim()) params.search = searchVal.trim();
      const res = await getAdminLoginHistory(params);
      if (res.success) {
        setLoginLogs(res.items || []);
      }
    } catch (err) {
      console.error('Error fetching login history:', err);
    } finally {
      setLoginLoading(false);
    }
  };

  const loadAuditLogs = async (moduleVal = auditModuleFilter, searchVal = auditSearch) => {
    if (!isSuperAdmin) return;
    setAuditLoading(true);
    try {
      const params = {};
      if (moduleVal && moduleVal !== 'all') params.module = moduleVal;
      if (searchVal && searchVal.trim()) params.search = searchVal.trim();
      const res = await getAdminAuditLogs(params);
      if (res.success) {
        setAuditLogs(res.items || []);
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setAuditLoading(false);
    }
  };

  const handleViewAdminLogins = (admin) => {
    setSelectedAdminForLogins(admin);
    setAdminTab('logins');
    loadLoginHistory(admin._id, '', 'all');
  };

  // Load admins and cities when entering admin view
  useEffect(() => {
    if (isSuperAdmin && (activeView === 'admins' || admins.length === 0)) {
      loadAdmins();
      loadCities(); // Fetch cities as well
    }
  }, [isSuperAdmin, activeView]);

  // Load login history or audit logs when switching tabs
  useEffect(() => {
    if (isSuperAdmin && activeView === 'admins') {
      if (adminTab === 'logins') {
        loadLoginHistory(selectedAdminForLogins?._id, loginSearch, loginStatusFilter);
      } else if (adminTab === 'audits') {
        loadAuditLogs(auditModuleFilter, auditSearch);
      }
    }
  }, [isSuperAdmin, activeView, adminTab, loginStatusFilter, auditModuleFilter]);

  const handleToggle = (key) => {
    const updated = { ...settings, [key]: !settings[key] };
    setSettings(updated);
    localStorage.setItem('adminSettings', JSON.stringify(updated));
    window.dispatchEvent(new Event('adminSettingsUpdated'));
  };

  const handleFinancialChange = (e) => {
    const { name, value } = e.target;
    setFinancialSettings(prev => ({
      ...prev,
      [name]: Number(value)
    }));
  };

  const handleToggleScrap = async () => {
    const currentEnabled = financialSettings.isScrapEnabled !== false;
    const nextVal = !currentEnabled;
    setFinancialSettings(prev => ({ ...prev, isScrapEnabled: nextVal }));
    try {
      await updateSettings({ isScrapEnabled: nextVal });
      try {
        const currentConfig = JSON.parse(localStorage.getItem('app_public_config') || '{}');
        localStorage.setItem('app_public_config', JSON.stringify({ ...currentConfig, isScrapEnabled: nextVal }));
      } catch (e) {}
      publicCatalogService.invalidateCache();
      toast.success(nextVal ? 'Scrap selling feature turned ON' : 'Scrap selling feature turned OFF');
      window.dispatchEvent(new Event('systemConfigUpdated'));
      window.dispatchEvent(new Event('adminSettingsUpdated'));
    } catch (err) {
      console.error('Failed to update scrap feature state:', err);
      setFinancialSettings(prev => ({ ...prev, isScrapEnabled: currentEnabled }));
      toast.error('Failed to update scrap feature state');
    }
  };

  const handleProfileChange = (e) => {
    const { name, value } = e.target;
    setProfile(prev => ({ ...prev, [name]: value }));
  };

  const handleFinancialSave = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Not sent from here: the cancellation fee (Booking Configuration) and the scrap switch (saved the
      // moment it is toggled), so a stale copy loaded with this page can never overwrite a change made
      // elsewhere. The online-payments switch lives only on the Customization page.
      // Fields edited elsewhere are never sent from here, so a stale copy of this page cannot overwrite them:
      // cancellation fees and the search radius / search time / wave timer live in Booking Configuration.
      const { cancellationPenalty, isScrapEnabled, searchRadius, maxSearchTime, waveDuration, ...financialPayload } = financialSettings; // eslint-disable-line no-unused-vars
      await updateSettings(financialPayload);
      toast.success('Financial settings updated');
    } catch (error) {
      toast.error('Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  // Handle billing settings change
  const handleBillingChange = (e) => {
    const { name, value } = e.target;
    // Auto-uppercase for specific fields
    const upperFields = ['companyGSTIN', 'companyPAN', 'invoicePrefix'];
    const newValue = upperFields.includes(name) ? value.toUpperCase() : value;
    setBillingSettings(prev => ({ ...prev, [name]: newValue }));
  };

  const validateBilling = () => {
    const {
      companyName, companyGSTIN, companyPAN, companyAddress,
      companyCity, companyState, companyPincode,
      companyPhone, companyEmail, invoicePrefix, sacCode
    } = billingSettings;

    if (!companyName?.trim()) return "Company Name is required";

    const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    if (companyGSTIN?.trim() && !gstRegex.test(companyGSTIN.trim())) {
      return "Invalid GSTIN format (e.g., 27ABCDE1234F1Z5)";
    }

    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    if (companyPAN?.trim() && !panRegex.test(companyPAN.trim())) {
      return "Invalid PAN format (e.g., ABCDE1234F)";
    }

    if (!companyAddress?.trim()) return "Address is required";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!companyEmail || !emailRegex.test(companyEmail)) return "Invalid Email Address";

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!companyPhone || !phoneRegex.test(companyPhone)) return "Invalid Phone Number (must be 10 digits)";

    if (!companyCity?.trim()) return "City is required";
    if (!companyState?.trim()) return "State is required";

    const pincodeRegex = /^[1-9][0-9]{5}$/;
    if (!companyPincode || !pincodeRegex.test(companyPincode)) return "Invalid Pincode (must be 6 digits)";

    if (!invoicePrefix?.trim()) return "Invoice Prefix is required";

    const sacRegex = /^\d{6}$/;
    if (!sacCode || !sacRegex.test(sacCode)) return "Invalid SAC Code (must be 6 digits)";

    return null;
  };

  // Save billing settings
  const handleBillingSave = async (e) => {
    e.preventDefault();

    const error = validateBilling();
    if (error) return toast.error(error);

    setBillingLoading(true);
    try {
      await updateSettings(billingSettings);
      toast.success('Billing settings updated');
    } catch (error) {
      toast.error('Failed to update billing settings');
    } finally {
      setBillingLoading(false);
    }
  };

  // Handle support settings change
  const handleSupportChange = (e) => {
    const { name, value } = e.target;
    setSupportSettings(prev => ({ ...prev, [name]: value }));
  };

  // Save support settings
  const handleSupportSave = async (e) => {
    e.preventDefault();
    setSupportLoading(true);
    try {
      await updateSettings(supportSettings);
      toast.success('Support settings updated');
    } catch (error) {
      toast.error('Failed to update support settings');
    } finally {
      setSupportLoading(false);
    }
  };

  // Save Map API & Language settings
  const handleMapAndLanguageSave = async (e) => {
    if (e) e.preventDefault();
    setMapLanguageLoading(true);
    try {
      const res = await updateSettings({
        defaultAppLanguage: mapAndLanguageSettings.defaultAppLanguage,
        supportedLanguages: mapAndLanguageSettings.supportedLanguages,
        autoDetectLanguageFromMap: mapAndLanguageSettings.autoDetectLanguageFromMap
      });
      if (res.success) {
        toast.success('Map API & Language settings saved successfully!');
        window.dispatchEvent(new Event('adminSettingsUpdated'));
        window.dispatchEvent(new Event('systemConfigUpdated'));
      } else {
        toast.error(res.message || 'Failed to update settings');
      }
    } catch (error) {
      console.error('Error saving map and language settings:', error);
      toast.error(error?.response?.data?.message || 'Failed to update settings');
    } finally {
      setMapLanguageLoading(false);
    }
  };

  // Toggle supported language
  const toggleSupportedLanguage = (code) => {
    setMapAndLanguageSettings(prev => {
      const current = Array.isArray(prev.supportedLanguages) ? prev.supportedLanguages : ['en'];
      let updated;
      if (current.includes(code)) {
        if (current.length <= 1) {
          toast.error('At least one language must remain supported');
          return prev;
        }
        updated = current.filter(c => c !== code);
        let newDefault = prev.defaultAppLanguage;
        if (newDefault === code) {
          newDefault = updated[0];
        }
        return { ...prev, supportedLanguages: updated, defaultAppLanguage: newDefault };
      } else {
        updated = [...current, code];
        return { ...prev, supportedLanguages: updated };
      }
    });
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (profile.newPassword && profile.newPassword !== profile.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    if (profile.newPassword && !profile.currentPassword) {
      return toast.error('Current password required');
    }

    setProfileLoading(true);
    try {
      const updateData = { email: profile.email };
      if (profile.newPassword) {
        updateData.currentPassword = profile.currentPassword;
        updateData.newPassword = profile.newPassword;
      } else if (profile.currentPassword) {
        updateData.currentPassword = profile.currentPassword;
      }

      await updateAdminProfile(updateData);
      const adminData = JSON.parse(localStorage.getItem('adminUser') || '{}');
      adminData.email = profile.email;
      localStorage.setItem('adminUser', JSON.stringify(adminData));

      toast.success('Profile updated');
      setProfile(prev => ({ ...prev, currentPassword: '', newPassword: '', confirmPassword: '' }));
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleCreateAdmin = async (e) => {
    e.preventDefault();
    const isEdit = !!newAdmin.id;
    const isSuper = newAdmin.role === 'super_admin';

    if (!newAdmin.name?.trim() || !newAdmin.email?.trim()) {
      return toast.error(`${isSuper ? 'Super Admin' : 'Admin'} Name and Email are required`);
    }
    if (!isEdit && !newAdmin.password?.trim()) {
      return toast.error('Password is required for new admin');
    }

    setAdminLoading(true);
    try {
      const payload = {
        name: newAdmin.name.trim(),
        email: newAdmin.email.trim(),
        role: newAdmin.role || 'sub_admin',
        permissions: isSuper ? ['*'] : (Array.isArray(newAdmin.permissions) ? newAdmin.permissions : [])
      };
      if (newAdmin.password?.trim()) {
        payload.password = newAdmin.password.trim();
      }

      if (isEdit) {
        await updateAdminDetails(newAdmin.id, payload);
        toast.success(isSuper ? 'Super Admin details updated successfully' : 'Sub-Admin access updated successfully');

        // If editing current logged-in admin, sync local profile state & storage
        const currentAdminId = profile.id || profile._id;
        if (newAdmin.id === currentAdminId || newAdmin.email.toLowerCase() === (profile.email || '').toLowerCase()) {
          setProfile(prev => ({
            ...prev,
            name: payload.name,
            email: payload.email
          }));
          try {
            const adminData = JSON.parse(localStorage.getItem('adminData') || sessionStorage.getItem('adminData') || '{}');
            const updated = { ...adminData, name: payload.name, email: payload.email };
            localStorage.setItem('adminData', JSON.stringify(updated));
            sessionStorage.setItem('adminData', JSON.stringify(updated));
          } catch (e) {
            console.error('Failed to sync updated admin storage', e);
          }
        }
      } else {
        await createAdmin(payload);
        toast.success('Sub-Admin created successfully');
      }
      setNewAdmin({ name: '', email: '', password: '', role: 'sub_admin', permissions: [] });
      setShowAddAdmin(false);
      loadAdmins();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Operation failed');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleEditClick = (admin) => {
    setNewAdmin({
      id: admin._id,
      name: admin.name || '',
      email: admin.email || '',
      role: admin.role || 'sub_admin',
      permissions: Array.isArray(admin.permissions) ? admin.permissions : [],
      password: ''
    });
    setShowAddAdmin(true);
  };

  const handleBlockAdmin = async (id, currentStatus) => {
    const action = currentStatus ? 'block' : 'unblock';
    if (!window.confirm(`Are you sure you want to ${action} this admin?`)) return;

    try {
      await toggleAdminStatus(id);
      toast.success(`Admin ${action}ed`);
      loadAdmins();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDeleteAdmin = async (id, name) => {
    const currentId = profile.id || profile._id;
    if (id && currentId && String(id) === String(currentId)) {
      toast.error('You cannot delete your own account');
      return;
    }
    if (!window.confirm(`Delete admin "${name}"? This cannot be undone.`)) return;
    try {
      await deleteAdmin(id);
      toast.success('Admin deleted');
      loadAdmins();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete');
    }
  };

  const [serviceMode, setServiceMode] = useState('multi');
  useEffect(() => {
    const config = JSON.parse(localStorage.getItem('adminServiceConfig') || '{}');
    setServiceMode(config.mode || 'multi');
  }, []);

  // Render Function for Main Settings Menu
  const renderMainMenu = () => (
    <div className="space-y-6">
      {/* Quick Feature Controls Top Card */}
      <div className="bg-gradient-to-r from-emerald-50 via-white to-blue-50 border border-emerald-200/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-4 border-b border-emerald-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center text-sm">
                <FiTrash2 />
              </span>
              Scrap Feature & Platform Controls
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Instantly toggle live user-facing features across User App and website
            </p>
          </div>
          <button
            onClick={() => changeView('system')}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-100/70 hover:bg-emerald-200/70 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 w-fit"
          >
            Full System Settings →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Scrap Toggle Card */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-gray-900">Scrap Selling Feature</span>
                <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full border ${
                  financialSettings.isScrapEnabled !== false
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : 'bg-red-100 text-red-800 border-red-200'
                }`}>
                  {financialSettings.isScrapEnabled !== false ? 'ON' : 'OFF'}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                {financialSettings.isScrapEnabled !== false
                  ? 'Active on Home banner, Bottom Nav, & Selling flow'
                  : 'Completely hidden from User App with 0 space'}
              </p>
            </div>

            <button
              type="button"
              onClick={handleToggleScrap}
              className={`relative w-13 h-7 rounded-full transition-all duration-300 shrink-0 ${
                financialSettings.isScrapEnabled !== false ? 'bg-green-600' : 'bg-gray-300'
              }`}
            >
              <div
                className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${
                  financialSettings.isScrapEnabled !== false ? 'translate-x-6' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Profile Settings Card */}
        <div onClick={() => changeView('profile')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-100 transition-colors">
            <FiUser className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Profile Settings</h3>
          <p className="text-sm text-gray-500">Manage your personal account details and password</p>
        </div>

        {/* Financial Settings Card - Super Admin Only */}
        {isSuperAdmin && (
          <div onClick={() => changeView('financial')}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
            <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-100 transition-colors">
              <FiDollarSign className="w-6 h-6 text-green-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Financial Info</h3>
            <p className="text-sm text-gray-500">Configure charges, commissions, and billing details</p>
          </div>
        )}

        {/* System Settings Card - Accessible to all admins */}
        <div onClick={() => changeView('system')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-purple-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-100 transition-colors">
            <FiSettings className="w-6 h-6 text-purple-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">System & Support</h3>
          <p className="text-sm text-gray-500">Manage feature toggles, scrap service, and help contact info</p>
        </div>

        {/* Map API & Language Card - Accessible to all admins */}
        <div onClick={() => changeView('map-language')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-sky-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-sky-100 transition-colors">
            <FiGlobe className="w-6 h-6 text-sky-600" />
          </div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-bold text-gray-800">Map API & Language</h3>
            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-sky-100 text-sky-800 uppercase">
              {mapAndLanguageSettings.defaultAppLanguage}
            </span>
          </div>
          <p className="text-sm text-gray-500">Google Maps API key, dynamic map localization, and app language settings</p>
        </div>

        {/* City Management Card - Super Admin Only */}
        {isSuperAdmin && (
          <div onClick={() => changeView('cities')}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
            <div className="w-12 h-12 bg-teal-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-teal-100 transition-colors">
              <FiMapPin className="w-6 h-6 text-teal-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">City Management</h3>
            <p className="text-sm text-gray-500">Manage operational cities and default location</p>
          </div>
        )}

        {/* Admin Management Card - Super Admin Only */}
        {isSuperAdmin && (
          <div onClick={() => changeView('admins')}
            className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
            <div className="w-12 h-12 bg-amber-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-amber-100 transition-colors">
              <FiUsers className="w-6 h-6 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-2">Manage Admins</h3>
            <p className="text-sm text-gray-500">Add, remove, and view all system administrators</p>
          </div>
        )}

        {/* Booking Configuration Card: service radius, rescheduling, slots, cancellation, assignment */}
        <div onClick={() => navigate('/admin/booking-config')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-teal-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-teal-100 transition-colors">
            <FiSettings className="w-6 h-6 text-teal-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Booking Configuration</h3>
          <p className="text-sm text-gray-500">Partner service radius, rescheduling rules, time slots, cancellation fees and partner assignment</p>
        </div>

        {/* Partner Registration Fields Card */}
        <div onClick={() => navigate('/admin/workers/registration-fields')}
          className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer group">
          <div className="w-12 h-12 bg-teal-50 rounded-lg flex items-center justify-center mb-4 group-hover:bg-teal-100 transition-colors">
            <FiSliders className="w-6 h-6 text-teal-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Partner Registration Fields</h3>
          <p className="text-sm text-gray-500">Configure dynamic text boxes and document upload requirements for partner onboarding</p>
        </div>
      </div>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">

      {/* Header / Breadcrumb */}
      {activeView !== 'main' && (
        <button onClick={() => changeView('main')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-800 mb-4 transition-colors">
          <span className="text-lg">←</span> Back to Settings
        </button>
      )}

      {activeView === 'main' && renderMainMenu()}

      <AnimatePresence mode="wait">

        {/* Profile View */}
        {activeView === 'profile' && (
          <motion.div key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
            <div className="max-w-2xl mx-auto bg-white rounded-xl p-8 shadow-sm border border-gray-100">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-2xl">
                  {profile.name ? profile.name.charAt(0).toUpperCase() : <FiUser />}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{profile.name || 'Admin'}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <p className="text-sm text-gray-500 flex items-center gap-1">
                      {isSuperAdmin && <FiShield className="text-amber-500" />}
                      {isSuperAdmin ? 'Super Admin' : 'Admin'} • {profile.email}
                    </p>
                    {profile.role !== 'super_admin' ? (
                      <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-lg border border-teal-100 flex items-center gap-1">
                        <FiMapPin className="w-2.5 h-2.5" />
                        {profile.assignedCity || 'Restricted Access'}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-100">
                        Global Access
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <form onSubmit={handleProfileUpdate} className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                  <input type="email" name="email" value={profile.email} onChange={handleProfileChange} required
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>

                <div className="pt-6 border-t border-gray-100 space-y-4">
                  <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Change Password</h3>
                  <div className="space-y-4">
                    <input type="password" name="currentPassword" value={profile.currentPassword} onChange={handleProfileChange}
                      placeholder="Current Password"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <input type="password" name="newPassword" value={profile.newPassword} onChange={handleProfileChange}
                        placeholder="New Password"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                      <input type="password" name="confirmPassword" value={profile.confirmPassword} onChange={handleProfileChange}
                        placeholder="Confirm New Password"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6">
                  <button type="submit" disabled={profileLoading}
                    className="px-8 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 flex items-center gap-2 disabled:opacity-70 shadow-lg shadow-blue-200 transition-all">
                    {profileLoading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-5 h-5" />}
                    Update Profile
                  </button>
                </div>
              </form>
            </div>
          </motion.div >
        )}

        {/* Financial View */}
        {
          activeView === 'financial' && (
            <motion.div key="financial" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* General Financial Settings */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <FiDollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">Financial Configuration</h2>
                </div>

                <form onSubmit={handleFinancialSave} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Visiting Charge / Convenience Fee (₹)</label>
                      <input type="number" name="visitedCharges" value={financialSettings.visitedCharges} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">Visiting charge applied to bookings and displayed on the Cancellation Policy page once the professional arrives (e.g. ₹149)</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Worker Cash Limit (₹)</label>
                      <input type="number" name="vendorCashLimit" value={financialSettings.vendorCashLimit} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Service GST (%)</label>
                      <input type="number" name="serviceGstPercentage" value={financialSettings.serviceGstPercentage} onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">GST rate applied to services and used on user checkout</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Parts GST (%)</label>
                      <input type="number" name="partsGstPercentage" value={financialSettings.partsGstPercentage} onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">GST rate applied to parts &amp; materials</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Service Payout (%)</label>
                      <input type="number" name="servicePayoutPercentage" value={financialSettings.servicePayoutPercentage} onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">Worker keeps this % of service charges</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Parts Payout (%)</label>
                      <input type="number" name="partsPayoutPercentage" value={financialSettings.partsPayoutPercentage} onChange={handleFinancialChange}
                        min="0" max="100"
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">Worker keeps this % of parts charges</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">TDS Percentage (%)</label>
                      <input type="number" name="tdsPercentage" value={financialSettings.tdsPercentage} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Platform Fee (%)</label>
                      <input type="number" name="platformFeePercentage" value={financialSettings.platformFeePercentage} onChange={handleFinancialChange}
                        className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-green-500 transition-all" />
                      <p className="text-[10px] text-gray-400 mt-1">Fee charged on worker withdrawals</p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 uppercase mb-1.5">Cancellation fees</label>
                      <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
                        Set in <a href="/admin/booking-config" className="font-semibold text-sky-700 underline">Booking Configuration &rsaquo; Cancellation Policy</a>, together with the free-cancellation time.
                      </p>
                    </div>
                    <div className="pt-4 border-t border-gray-100 md:col-span-2">
                      <h4 className="text-xs font-bold text-gray-700 uppercase mb-3">Booking Timing & Waves</h4>
                      <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-600">
                        Search radius, search time limit and the wave timer are set in{' '}
                        <a href="/admin/booking-config#dispatch" className="font-semibold text-sky-700 underline">Booking Configuration &rsaquo; Finding professionals</a>,
                        together with the zone / distance switch, so everything that decides who gets a booking is in one place.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={loading}
                      className="px-6 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-green-200">
                      {loading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>

              {/* Billing Information - Super Admin Only */}
              {isSuperAdmin && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <FiFileText className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-gray-800">Billing & Company Details</h2>
                      <p className="text-xs text-gray-500">For invoices and tax documents</p>
                    </div>
                  </div>

                  <form onSubmit={handleBillingSave} className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Company Name</label>
                      <input type="text" name="companyName" value={billingSettings.companyName} onChange={handleBillingChange}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          GSTIN <span className="text-gray-400 font-normal">(Optional)</span>
                        </label>
                        <input
                          type="text"
                          name="companyGSTIN"
                          value={billingSettings.companyGSTIN}
                          onChange={handleBillingChange}
                          placeholder="Optional (e.g. 27ABCDE1234F1Z5)"
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500 uppercase placeholder:normal-case placeholder:text-gray-400"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">PAN</label>
                        <input type="text" name="companyPAN" value={billingSettings.companyPAN} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500 uppercase" />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Full Address</label>
                      <textarea name="companyAddress" value={billingSettings.companyAddress} onChange={handleBillingChange} rows="2"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500 resize-none" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Company Email</label>
                        <input type="email" name="companyEmail" value={billingSettings.companyEmail} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Company Phone</label>
                        <input type="text" name="companyPhone" value={billingSettings.companyPhone} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">City</label>
                        <input type="text" name="companyCity" value={billingSettings.companyCity} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">State</label>
                        <input type="text" name="companyState" value={billingSettings.companyState} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Pincode</label>
                        <input type="text" name="companyPincode" value={billingSettings.companyPincode} onChange={handleBillingChange}
                          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                      </div>
                    </div>

                    <div className="pt-4 border-t border-gray-100">
                      <h4 className="text-xs font-bold text-gray-700 mb-3">Invoice Settings</h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">Prefix</label>
                          <input type="text" name="invoicePrefix" value={billingSettings.invoicePrefix} onChange={handleBillingChange}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500 uppercase" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">SAC Code</label>
                          <input type="text" name="sacCode" value={billingSettings.sacCode} onChange={handleBillingChange}
                            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:border-indigo-500" />
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button type="submit" disabled={billingLoading}
                        className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-60">
                        {billingLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
                        Update Billing
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </motion.div>
          )
        }

        {/* System & Support View */}
        {
          activeView === 'system' && (
            <motion.div key="system" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* System Settings */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <FiSettings className="w-5 h-5 text-gray-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">System Preferences</h2>
                </div>

                <div className="space-y-4">

                  {/* Scrap Feature Toggle */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-800">Scrap Selling Feature</p>
                        <span className={`px-2 py-0.5 text-[10px] font-black uppercase tracking-wider rounded-full border ${
                          financialSettings.isScrapEnabled !== false
                            ? 'bg-green-100 text-green-800 border-green-200'
                            : 'bg-red-100 text-red-800 border-red-200'
                        }`}>
                          {financialSettings.isScrapEnabled !== false ? 'ON' : 'OFF'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Turn ON/OFF Scrap Selling banner, navigation, and service access in User App
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleScrap}
                      className={`relative w-12 h-7 rounded-full transition-all duration-300 shrink-0 ${
                        financialSettings.isScrapEnabled !== false ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <div
                        className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-transform duration-300 ${
                          financialSettings.isScrapEnabled !== false ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                </div>
              </div>

              {/* Support Settings */}
              <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 h-fit">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <FiHeadphones className="w-5 h-5 text-blue-600" />
                  </div>
                  <h2 className="text-lg font-bold text-gray-800">Contact & Support</h2>
                </div>

                <form onSubmit={handleSupportSave} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Support Email</label>
                    <div className="relative">
                      <FiMail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input type="email" name="supportEmail" value={supportSettings.supportEmail} onChange={handleSupportChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Support Phone</label>
                    <div className="relative">
                      <FiPhone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input type="tel" name="supportPhone" value={supportSettings.supportPhone} onChange={handleSupportChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">WhatsApp Support</label>
                    <div className="relative">
                      <FiMessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input type="tel" name="supportWhatsapp" value={supportSettings.supportWhatsapp} onChange={handleSupportChange}
                        className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500 transition-all" />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={supportLoading}
                      className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-blue-200">
                      {supportLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <FiSave className="w-4 h-4" />}
                      Save Details
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          )
        }

        {/* Map API & App Language View */}
        {
          activeView === 'map-language' && (
            <motion.div key="map-language" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}
              className="space-y-8 max-w-5xl mx-auto">

              {/* Header Card */}
              <div className="bg-gradient-to-r from-sky-600 via-indigo-600 to-blue-700 rounded-2xl p-6 sm:p-8 text-white shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="p-2.5 bg-white/20 backdrop-blur-md rounded-xl text-white">
                      <FiGlobe className="w-6 h-6" />
                    </span>
                    <h1 className="text-2xl font-black">App Language</h1>
                  </div>
                  <p className="text-sky-100 text-sm max-w-2xl leading-relaxed">
                    Configure the default platform language, location-based language detection, and the active languages across User and Partner apps.
                  </p>
                </div>
                <div className="absolute -right-8 -bottom-8 w-44 h-44 bg-white/10 rounded-full blur-2xl pointer-events-none" />
              </div>

              <form onSubmit={handleMapAndLanguageSave} className="space-y-6">

                {/* Section 2: Platform Language Settings */}
                <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center gap-3 pb-4 mb-6 border-b border-gray-100">
                    <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
                      <FiGlobe className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-bold text-gray-900">App Language & Localization</h2>
                      <p className="text-xs text-gray-500">Configure default language and location-based language detection</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                          Default App Language
                        </label>
                        <select
                          value={mapAndLanguageSettings.defaultAppLanguage}
                          onChange={(e) => setMapAndLanguageSettings(prev => ({ ...prev, defaultAppLanguage: e.target.value }))}
                          className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500 transition-all cursor-pointer font-medium"
                        >
                          {ALL_AVAILABLE_LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>
                              {lang.name} ({lang.native})
                            </option>
                          ))}
                        </select>
                        <p className="text-[11px] text-gray-400 mt-1">Default language for new visitors and customers</p>
                      </div>

                      {/* Map-based auto-detection toggle */}
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                        <div className="pr-3">
                          <p className="text-xs font-bold text-gray-900">Auto-Detect from Map Location</p>
                          <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
                            Use Map API geocoding on GPS to detect state and suggest native regional language
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMapAndLanguageSettings(prev => ({ ...prev, autoDetectLanguageFromMap: !prev.autoDetectLanguageFromMap }))}
                          className={`relative w-12 h-6 rounded-full transition-colors duration-200 shrink-0 cursor-pointer ${
                            mapAndLanguageSettings.autoDetectLanguageFromMap ? 'bg-indigo-600' : 'bg-gray-300'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform duration-200 shadow-sm ${
                              mapAndLanguageSettings.autoDetectLanguageFromMap ? 'translate-x-6' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Supported Languages Checklist */}
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block">
                            Active Supported Languages ({mapAndLanguageSettings.supportedLanguages.length})
                          </label>
                          <p className="text-xs text-gray-400">Select which languages are available for users and partners in their app settings</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {ALL_AVAILABLE_LANGUAGES.map((lang) => {
                          const isChecked = mapAndLanguageSettings.supportedLanguages.includes(lang.code);
                          const isDefault = mapAndLanguageSettings.defaultAppLanguage === lang.code;

                          return (
                            <div
                              key={lang.code}
                              onClick={() => toggleSupportedLanguage(lang.code)}
                              className={`p-3.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between select-none ${
                                isChecked
                                  ? 'bg-indigo-50/70 border-indigo-200 text-indigo-900 shadow-xs'
                                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 opacity-60'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-bold truncate">{lang.name}</p>
                                  {isDefault && (
                                    <span className="px-1.5 py-0.2 text-[9px] font-black uppercase rounded bg-indigo-600 text-white">
                                      Default
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-500 font-medium">{lang.native}</p>
                              </div>
                              <div className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                                isChecked
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'border-gray-300 bg-white'
                              }`}>
                                {isChecked && <FiCheck className="w-3.5 h-3.5" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Bar */}
                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-gray-500">
                    Changes take effect across User and Partner apps instantly.
                  </p>
                  <button
                    type="submit"
                    disabled={mapLanguageLoading}
                    className="px-7 py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-indigo-100 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    {mapLanguageLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FiSave className="w-4 h-4" />
                    )}
                    Save Configuration
                  </button>
                </div>
              </form>
            </motion.div>
          )
        }

        {/* City Management View */}
        {
          activeView === 'cities' && (
            <motion.div key="cities" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <CityManagement />
            </motion.div>
          )
        }

        {/* Admin Management View - Super Admin Only */}
        {
          activeView === 'admins' && isSuperAdmin && (
            <motion.div key="admins" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.2 }}>
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                      {adminTab === 'admins' && <FiUsers className="w-5 h-5 text-amber-600" />}
                      {adminTab === 'logins' && <FiClock className="w-5 h-5 text-amber-600" />}
                      {adminTab === 'audits' && <FiShield className="w-5 h-5 text-amber-600" />}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-800">
                        {adminTab === 'admins' && 'Admin Management'}
                        {adminTab === 'logins' && 'Login History & Security Sessions'}
                        {adminTab === 'audits' && 'System Audit Trail'}
                      </h2>
                      <p className="text-sm text-gray-500">
                        {adminTab === 'admins' && `Total ${admins.length} administrators found`}
                        {adminTab === 'logins' && 'Track administrator login activities, IP addresses, and authentication statuses'}
                        {adminTab === 'audits' && 'Forensic log of settings changes, account edits, and critical actions'}
                      </p>
                    </div>
                  </div>
                  {adminTab === 'admins' ? (
                    <button onClick={() => { setNewAdmin({ name: '', email: '', password: '', role: 'sub_admin', permissions: [] }); setShowAddAdmin(!showAddAdmin); }}
                      className={`px-4 sm:px-5 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-lg transition-all w-full sm:w-auto ${showAddAdmin ? 'bg-gray-100 text-gray-600' : 'bg-amber-600 text-white hover:bg-amber-700 shadow-amber-100'}`}>
                      {showAddAdmin ? <FiX className="w-4 h-4" /> : <FiPlus className="w-4 h-4" />}
                      {showAddAdmin ? 'Cancel' : 'Add New Sub-Admin'}
                    </button>
                  ) : adminTab === 'logins' ? (
                    <button onClick={() => loadLoginHistory(selectedAdminForLogins?._id, loginSearch, loginStatusFilter)}
                      disabled={loginLoading}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer">
                      <FiRefreshCw className={`w-4 h-4 ${loginLoading ? 'animate-spin text-amber-600' : ''}`} />
                      Refresh Logins
                    </button>
                  ) : (
                    <button onClick={() => loadAuditLogs(auditModuleFilter, auditSearch)}
                      disabled={auditLoading}
                      className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-all cursor-pointer">
                      <FiRefreshCw className={`w-4 h-4 ${auditLoading ? 'animate-spin text-amber-600' : ''}`} />
                      Refresh Audit Logs
                    </button>
                  )}
                </div>

                {/* Super Admin Navigation Tabs */}
                <div className="flex items-center gap-2 px-4 sm:px-6 pt-3 pb-3 border-b border-gray-100 bg-gray-50/70 overflow-x-auto">
                  <button
                    onClick={() => { setAdminTab('admins'); setSelectedAdminForLogins(null); }}
                    className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                      adminTab === 'admins'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <FiUsers className="w-4 h-4" />
                    Administrators ({admins.length})
                  </button>

                  <button
                    onClick={() => { setAdminTab('logins'); setSelectedAdminForLogins(null); }}
                    className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                      adminTab === 'logins'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <FiClock className="w-4 h-4" />
                    Login History & Sessions
                  </button>

                  <button
                    onClick={() => { setAdminTab('audits'); }}
                    className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                      adminTab === 'audits'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-white text-gray-600 hover:text-gray-900 border border-gray-200 hover:bg-gray-100'
                    }`}
                  >
                    <FiShield className="w-4 h-4" />
                    System Audit Trail
                  </button>
                </div>

                {/* Sub-Views: Administrators | Login History | System Audit */}
                {adminTab === 'admins' && (
                  <>
                    {/* Add/Edit Sub-Admin Form */}
                    <AnimatePresence>
                      {showAddAdmin && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-b border-gray-100 bg-gradient-to-b from-amber-50/60 to-white">
                      <form onSubmit={handleCreateAdmin} className="p-4 sm:p-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-5 border-b border-amber-200/60">
                          <div>
                            <h3 className="text-base font-bold text-gray-800 flex items-center gap-2">
                              <span className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center text-xs font-bold">
                                {newAdmin.id ? <FiEdit /> : <FiPlus />}
                              </span>
                              {newAdmin.id
                                ? (newAdmin.role === 'super_admin' ? 'Edit Super Admin Details' : 'Edit Sub-Admin & Access Rights')
                                : 'Create New Sub-Admin'}
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                              {newAdmin.role === 'super_admin'
                                ? 'Super Admin name, login email and password update karein'
                                : 'Sub-admin ka name, login email aur password dalein, aur niche select karein ki use panel me kya kya access dena hai'}
                            </p>
                          </div>
                          {newAdmin.id && (
                            <span className="text-xs bg-amber-100 text-amber-800 font-bold px-3 py-1 rounded-full w-fit">
                              {newAdmin.role === 'super_admin' ? 'Super Admin Account' : 'Editing Account'}
                            </span>
                          )}
                        </div>

                        {/* 3 Main Inputs: Admin Name, Email, Password */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                              {newAdmin.role === 'super_admin' ? 'Super Admin Name' : 'Admin Name'} <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <FiUser className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                              <input
                                type="text"
                                placeholder={newAdmin.role === 'super_admin' ? "Super Admin Name" : "Sub-Admin Name"}
                                value={newAdmin.name}
                                onChange={e => setNewAdmin(p => ({ ...p, name: e.target.value }))}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all font-medium text-gray-800"
                                required
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                              Email Address (Login ID) <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                              <input
                                type="email"
                                placeholder="admin@help-u.in"
                                value={newAdmin.email}
                                onChange={e => setNewAdmin(p => ({ ...p, email: e.target.value }))}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all font-medium text-gray-800"
                                required
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1.5">
                              Password {newAdmin.id ? <span className="text-gray-400 font-normal">(Leave blank to keep current)</span> : <span className="text-red-500">*</span>}
                            </label>
                            <div className="relative">
                              <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                              <input
                                type="password"
                                placeholder={newAdmin.id ? "Leave blank to keep existing" : "Set login password"}
                                value={newAdmin.password}
                                onChange={e => setNewAdmin(p => ({ ...p, password: e.target.value }))}
                                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-200 transition-all font-medium text-gray-800"
                                required={!newAdmin.id}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Granular Module Rights / Permissions Checkboxes */}
                        {newAdmin.role === 'super_admin' ? (
                          <div className="mt-6 p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3">
                            <FiShield className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div>
                              <h4 className="text-sm font-bold text-amber-900">⭐ Full System Access (Super Admin)</h4>
                              <p className="text-xs text-amber-700 mt-0.5">
                                Super Administrators have unrestricted master privileges across all platform modules, system configurations, financial controls, and administrator management.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-6 pt-5 border-t border-amber-200/60">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                              <div>
                                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                                  <FiShield className="text-amber-600" /> Kya Kya Access Dena Hai (Select Permissions)
                                </h4>
                                <p className="text-xs text-gray-500 mt-0.5">
                                  Jo jo modules select karenge, login karne par sub-admin ko panel me sirf vahi sections show honge
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-amber-800 bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md">
                                  {newAdmin.permissions?.length || 0} / {AVAILABLE_PERMISSIONS.length} Modules Selected
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    selectAllPermissions();
                                  }}
                                  className="px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer"
                                >
                                  Select All
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    clearAllPermissions();
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors cursor-pointer"
                                >
                                  Clear All
                                </button>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                              {AVAILABLE_PERMISSIONS.map(p => {
                                const isChecked = (newAdmin.permissions || []).includes(p.key);
                                return (
                                  <button
                                    type="button"
                                    key={p.key}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      togglePermission(p.key);
                                    }}
                                    className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-left text-xs cursor-pointer select-none transition-all ${
                                      isChecked
                                        ? 'bg-amber-500 text-white border-amber-600 shadow-sm font-semibold ring-2 ring-amber-300 ring-offset-1'
                                        : 'bg-white text-gray-700 border-gray-200 hover:border-amber-400 hover:bg-amber-50/40'
                                    }`}
                                  >
                                    <div className={`w-4 h-4 rounded mt-0.5 flex items-center justify-center shrink-0 border transition-all ${
                                      isChecked ? 'bg-white text-amber-600 border-white' : 'border-gray-300 bg-gray-50'
                                    }`}>
                                      {isChecked ? <FiCheckCircle className="w-3.5 h-3.5" /> : null}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                      <span className="leading-tight font-medium">
                                        {p.label}
                                      </span>
                                      <span className={`text-[10px] mt-0.5 leading-tight ${isChecked ? 'text-amber-100' : 'text-gray-400'}`}>
                                        {p.desc}
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-amber-200/60">
                          <button
                            type="button"
                            onClick={() => { setShowAddAdmin(false); setNewAdmin({ name: '', email: '', password: '', role: 'sub_admin', permissions: [] }); }}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={adminLoading}
                            className="px-6 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-60 font-semibold text-sm shadow-md shadow-amber-200 transition-all flex items-center gap-2"
                          >
                            {adminLoading ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              newAdmin.id
                                ? (newAdmin.role === 'super_admin' ? 'Save & Update Super Admin' : 'Save & Update Access Rights')
                                : 'Create Sub-Admin with Selected Access'
                            )}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Mobile Cards View (Visible on small screens) */}
                <div className="block md:hidden divide-y divide-gray-100">
                  {admins.map((admin) => {
                    const currentAdminId = profile.id || profile._id;
                    const isCurrentAdmin = (admin._id && currentAdminId && String(admin._id) === String(currentAdminId)) ||
                                          (admin.email && profile.email && admin.email.toLowerCase() === profile.email.toLowerCase());
                    const isPrimarySuperAdmin = admin.email === 'admin@admin.com';

                    return (
                      <div key={admin._id} className="p-4 space-y-3 bg-white">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 flex items-center justify-center font-bold text-amber-800 shadow-sm shrink-0">
                              {admin.name?.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-gray-900 text-sm truncate flex items-center gap-1.5">
                                {admin.name}
                                {isCurrentAdmin && (
                                  <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">YOU</span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 truncate">{admin.email}</p>
                              {admin.lastLogin && (
                                <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                  <FiClock className="w-3 h-3 text-amber-500" />
                                  Last login: {new Date(admin.lastLogin).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </p>
                              )}
                            </div>
                          </div>

                          <span className={`px-2 py-0.5 text-[11px] font-bold rounded-full border shrink-0 ${
                            admin.role === 'super_admin'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-purple-50 text-purple-700 border-purple-200'
                          }`}>
                            {admin.role === 'super_admin' ? '⭐ Super Admin' : '🛡️ Sub-Admin'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
                          <span className="font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                            {admin.role === 'super_admin'
                              ? 'Full Access'
                              : `${admin.permissions?.length || 0} module access`}
                          </span>
                          <span className={`flex items-center gap-1 font-semibold ${admin.isActive !== false ? 'text-green-600' : 'text-red-500'}`}>
                            <span className={`w-2 h-2 rounded-full ${admin.isActive !== false ? 'bg-green-500' : 'bg-red-500'}`}></span>
                            {admin.isActive !== false ? 'Active' : 'Blocked'}
                          </span>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-50">
                          {isCurrentAdmin ? (
                            <span className="px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                              ⭐ You (Current Account)
                            </span>
                          ) : <div />}

                          <div className="flex items-center gap-2 ml-auto">
                            <button
                              onClick={() => handleViewAdminLogins(admin)}
                              className="px-2.5 py-1.5 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors flex items-center gap-1"
                              title={`View ${admin.name}'s Login History`}
                            >
                              <FiClock className="w-3.5 h-3.5" /> Logins
                            </button>
                            <button
                              onClick={() => handleEditClick(admin)}
                              className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
                              title={isCurrentAdmin ? "Edit Your Account Details" : "Edit Access Rights"}
                            >
                              <FiEdit className="w-3.5 h-3.5" /> {isCurrentAdmin ? 'Edit Profile' : 'Edit Access'}
                            </button>
                            {!isCurrentAdmin && !isPrimarySuperAdmin && (
                              <>
                                <button
                                  onClick={() => handleBlockAdmin(admin._id, admin.isActive !== false)}
                                  className={`p-1.5 rounded-lg transition-colors ${admin.isActive !== false ? 'text-amber-600 bg-amber-50' : 'text-green-600 bg-green-50'}`}
                                  title={admin.isActive !== false ? "Block Admin" : "Unblock Admin"}
                                >
                                  {admin.isActive !== false ? <FiLock className="w-4 h-4" /> : <FiUnlock className="w-4 h-4" />}
                                </button>
                                <button
                                  onClick={() => handleDeleteAdmin(admin._id, admin.name)}
                                  className="p-1.5 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                  title="Delete Admin"
                                >
                                  <FiTrash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Admins Table List (Visible on desktop screens) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-100">
                        <th className="px-6 py-4 font-semibold">Administrator</th>
                        <th className="px-6 py-4 font-semibold">Assigned Access Rights</th>
                        <th className="px-6 py-4 font-semibold">Status</th>
                        <th className="px-6 py-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {admins.map((admin) => {
                        const currentAdminId = profile.id || profile._id;
                        const isCurrentAdmin = (admin._id && currentAdminId && String(admin._id) === String(currentAdminId)) ||
                                              (admin.email && profile.email && admin.email.toLowerCase() === profile.email.toLowerCase());
                        const isPrimarySuperAdmin = admin.email === 'admin@admin.com';

                        return (
                          <tr key={admin._id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center font-bold text-gray-600 shadow-sm border border-white">
                                  {admin.name?.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                                    {admin.name}
                                    {isCurrentAdmin && (
                                      <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded">YOU</span>
                                    )}
                                  </p>
                                  <p className="text-xs text-gray-500">{admin.email}</p>
                                  {admin.lastLogin && (
                                    <p className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                                      <FiClock className="w-3 h-3 text-amber-500" />
                                      Last login: {new Date(admin.lastLogin).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-col gap-1 items-start">
                                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                                  admin.role === 'super_admin'
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-purple-50 text-purple-700 border-purple-200'
                                }`}>
                                  {admin.role === 'super_admin'
                                    ? '⭐ Super Admin (Full Access)'
                                    : '🛡️ Sub-Admin'}
                                </span>
                                {admin.role !== 'super_admin' && (
                                  <span className="text-[11px] text-gray-600 font-medium">
                                    {admin.permissions?.length > 0
                                      ? `${admin.permissions.length} module access rights assigned`
                                      : 'No custom modules (Restricted)'}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={`flex items-center gap-1.5 text-xs font-medium ${admin.isActive !== false ? 'text-green-600' : 'text-red-500'}`}>
                                <span className={`w-2 h-2 rounded-full ${admin.isActive !== false ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                {admin.isActive !== false ? 'Active' : 'Blocked'}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                {isCurrentAdmin && (
                                  <span className="px-2.5 py-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                                    ⭐ Logged-in
                                  </span>
                                )}

                                <button onClick={() => handleViewAdminLogins(admin)}
                                  className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-all"
                                  title={`View ${admin.name}'s Login History`}>
                                  <FiClock className="w-4 h-4" />
                                </button>

                                <button onClick={() => handleEditClick(admin)}
                                  className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
                                  title={isCurrentAdmin ? "Edit Your Account Details & Password" : "Edit Access Rights"}>
                                  <FiEdit className="w-4 h-4" />
                                </button>

                                {!isCurrentAdmin && !isPrimarySuperAdmin && (
                                  <>
                                    <button onClick={() => handleBlockAdmin(admin._id, admin.isActive !== false)}
                                      className={`p-2 text-gray-400 rounded-lg transition-all ${admin.isActive !== false ? 'hover:text-amber-600 hover:bg-amber-50' : 'hover:text-green-600 hover:bg-green-50'
                                        }`}
                                      title={admin.isActive !== false ? "Block Admin" : "Unblock Admin"}>
                                      {admin.isActive !== false ? <FiLock className="w-4 h-4" /> : <FiUnlock className="w-4 h-4" />}
                                    </button>

                                    <button onClick={() => handleDeleteAdmin(admin._id, admin.name)}
                                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                      title="Delete Admin">
                                      <FiTrash2 className="w-4 h-4" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                      {admins.length === 0 && (
                        <tr>
                          <td colSpan="5" className="px-6 py-12 text-center text-gray-400">
                            <FiUsers className="w-12 h-12 mx-auto mb-3 opacity-20" />
                            <p>No administrators found</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Login History & Sessions View */}
            {adminTab === 'logins' && (
              <div className="p-4 sm:p-6 space-y-4">
                {/* Filter Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="relative flex-1 min-w-[200px]">
                      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Search by name, email, IP or browser..."
                        value={loginSearch}
                        onChange={(e) => setLoginSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadLoginHistory(selectedAdminForLogins?._id, loginSearch, loginStatusFilter)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-amber-500 font-medium text-gray-800"
                      />
                    </div>
                    <button
                      onClick={() => loadLoginHistory(selectedAdminForLogins?._id, loginSearch, loginStatusFilter)}
                      className="px-3 py-2 bg-white border border-gray-200 hover:border-amber-500 rounded-lg text-xs font-semibold text-gray-700 transition-colors cursor-pointer"
                    >
                      Search
                    </button>

                    <select
                      value={loginStatusFilter}
                      onChange={(e) => setLoginStatusFilter(e.target.value)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 outline-none cursor-pointer"
                    >
                      <option value="all">All Statuses</option>
                      <option value="success">Success Only</option>
                      <option value="failed">Failed Attempts Only</option>
                    </select>
                  </div>

                  {selectedAdminForLogins && (
                    <div className="flex items-center gap-2 bg-amber-100 text-amber-900 px-3 py-1.5 rounded-lg text-xs font-semibold">
                      <span>Filtered: {selectedAdminForLogins.name} ({selectedAdminForLogins.email})</span>
                      <button
                        onClick={() => { setSelectedAdminForLogins(null); loadLoginHistory(null, loginSearch, loginStatusFilter); }}
                        className="text-amber-700 hover:text-amber-950 font-bold ml-1 cursor-pointer"
                        title="Clear filter"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>

                {loginLoading ? (
                  <div className="py-16 text-center text-gray-400">
                    <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm font-medium">Loading login history...</p>
                  </div>
                ) : loginLogs.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <FiClock className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No login attempts recorded yet</p>
                    <p className="text-xs text-gray-400 mt-1">Every admin login attempt (success and failure) will appear here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-100">
                          <th className="px-5 py-3.5 font-semibold">Administrator</th>
                          <th className="px-5 py-3.5 font-semibold">Status & Result</th>
                          <th className="px-5 py-3.5 font-semibold">Device & Browser</th>
                          <th className="px-5 py-3.5 font-semibold">IP Address</th>
                          <th className="px-5 py-3.5 font-semibold text-right">Login Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-xs">
                        {loginLogs.map((log) => (
                          <tr key={log._id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 text-amber-800 flex items-center justify-center font-bold text-xs shrink-0">
                                  {log.name?.charAt(0)?.toUpperCase() || 'A'}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
                                    {log.name || 'Unknown Admin'}
                                    {log.role === 'super_admin' && (
                                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-1.5 py-0.2 rounded-full">
                                        Super Admin
                                      </span>
                                    )}
                                  </p>
                                  <p className="text-xs text-gray-500">{log.email}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              {log.status === 'success' ? (
                                <span className="inline-flex items-center gap-1 font-semibold text-green-700 bg-green-50 border border-green-200 px-2.5 py-0.5 rounded-full">
                                  <FiCheckCircle className="w-3.5 h-3.5 text-green-600" /> Success
                                </span>
                              ) : (
                                <div>
                                  <span className="inline-flex items-center gap-1 font-semibold text-red-700 bg-red-50 border border-red-200 px-2.5 py-0.5 rounded-full">
                                    <FiAlertCircle className="w-3.5 h-3.5 text-red-600" /> Failed
                                  </span>
                                  {log.failureReason && (
                                    <p className="text-[11px] text-red-500 mt-0.5">{log.failureReason}</p>
                                  )}
                                </div>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                {log.device === 'Mobile' ? (
                                  <FiSmartphone className="w-4 h-4 text-purple-600 shrink-0" />
                                ) : (
                                  <FiMonitor className="w-4 h-4 text-blue-600 shrink-0" />
                                )}
                                <div>
                                  <p className="font-medium text-gray-800">{log.browser || 'Unknown'} on {log.os || 'Unknown'}</p>
                                  <span className="text-[10px] text-gray-400 capitalize">{log.device || 'Desktop'} device</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <code className="text-[11px] font-mono bg-gray-100 text-gray-700 px-2 py-1 rounded border border-gray-200">
                                {log.ip || 'N/A'}
                              </code>
                            </td>
                            <td className="px-5 py-3.5 text-right font-medium text-gray-600">
                              {new Date(log.createdAt).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* System Audit Trail View */}
            {adminTab === 'audits' && (
              <div className="p-4 sm:p-6 space-y-4">
                {/* Filter Toolbar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <div className="relative flex-1 min-w-[200px]">
                      <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text"
                        placeholder="Search actions, admins or description..."
                        value={auditSearch}
                        onChange={(e) => setAuditSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && loadAuditLogs(auditModuleFilter, auditSearch)}
                        className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs outline-none focus:border-amber-500 font-medium text-gray-800"
                      />
                    </div>
                    <button
                      onClick={() => loadAuditLogs(auditModuleFilter, auditSearch)}
                      className="px-3 py-2 bg-white border border-gray-200 hover:border-amber-500 rounded-lg text-xs font-semibold text-gray-700 transition-colors cursor-pointer"
                    >
                      Search
                    </button>

                    <select
                      value={auditModuleFilter}
                      onChange={(e) => setAuditModuleFilter(e.target.value)}
                      className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-700 outline-none cursor-pointer"
                    >
                      <option value="all">All Modules</option>
                      <option value="admin_management">Admin Management</option>
                      <option value="settings">Platform Settings</option>
                      <option value="financial">Financial</option>
                    </select>
                  </div>
                </div>

                {auditLoading ? (
                  <div className="py-16 text-center text-gray-400">
                    <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm font-medium">Loading audit trail...</p>
                  </div>
                ) : auditLogs.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <FiShield className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">No audit events recorded yet</p>
                    <p className="text-xs text-gray-400 mt-1">Actions performed on admins, settings, and permissions will be logged here</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-100">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wider border-b border-gray-100">
                          <th className="px-5 py-3.5 font-semibold">Timestamp</th>
                          <th className="px-5 py-3.5 font-semibold">Admin (Actor)</th>
                          <th className="px-5 py-3.5 font-semibold">Module & Action</th>
                          <th className="px-5 py-3.5 font-semibold">Description</th>
                          <th className="px-5 py-3.5 font-semibold text-right">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 text-xs">
                        {auditLogs.map((log) => (
                          <tr key={log._id} className="hover:bg-gray-50/60 transition-colors">
                            <td className="px-5 py-3.5 whitespace-nowrap font-medium text-gray-500">
                              {new Date(log.createdAt).toLocaleString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center font-bold text-[10px] shrink-0">
                                  {log.adminName?.charAt(0)?.toUpperCase() || 'A'}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800">{log.adminName || 'Admin'}</p>
                                  <p className="text-[11px] text-gray-400">{log.adminEmail}</p>
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[11px] uppercase tracking-wide">
                                  {log.module}
                                </span>
                                <span className="font-semibold text-gray-700 bg-gray-100 px-2 py-0.5 rounded text-[11px]">
                                  {log.action}
                                </span>
                              </div>
                            </td>
                            <td className="px-5 py-3.5 font-medium text-gray-800 max-w-md">
                              {log.description}
                            </td>
                            <td className="px-5 py-3.5 text-right whitespace-nowrap">
                              {(log.before || log.after) ? (
                                <button
                                  onClick={() => setSelectedDiff(log)}
                                  className="px-2.5 py-1 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg inline-flex items-center gap-1 transition-colors cursor-pointer"
                                >
                                  <FiEye className="w-3.5 h-3.5" /> View Diff
                                </button>
                              ) : (
                                <span className="text-gray-400 text-[11px]">No changes</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Diff Inspector Modal */}
          {selectedDiff && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <ModalLock />
              <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden border border-gray-100">
                <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                  <div>
                    <h3 className="font-bold text-gray-800 text-base flex items-center gap-2">
                      <FiShield className="text-amber-600" /> Audit Event Details
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {selectedDiff.description}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedDiff(null)}
                    className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <FiX className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
                  <div className="grid grid-cols-2 gap-3 text-xs bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div>
                      <span className="text-gray-400 font-medium">Performed By:</span>
                      <p className="font-bold text-gray-800 mt-0.5">{selectedDiff.adminName} ({selectedDiff.adminEmail})</p>
                    </div>
                    <div>
                      <span className="text-gray-400 font-medium">Timestamp & IP:</span>
                      <p className="font-bold text-gray-800 mt-0.5">
                        {new Date(selectedDiff.createdAt).toLocaleString('en-IN')} • <span className="font-mono">{selectedDiff.ip || 'N/A'}</span>
                      </p>
                    </div>
                  </div>

                  {selectedDiff.before && (
                    <div>
                      <span className="text-xs font-bold text-red-600 uppercase tracking-wider block mb-1">
                        Previous State (Before)
                      </span>
                      <pre className="p-3 bg-red-50/70 border border-red-200 rounded-lg text-xs text-red-900 overflow-x-auto font-mono">
                        {JSON.stringify(selectedDiff.before, null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedDiff.after && (
                    <div>
                      <span className="text-xs font-bold text-green-600 uppercase tracking-wider block mb-1">
                        Updated State (After)
                      </span>
                      <pre className="p-3 bg-green-50/70 border border-green-200 rounded-lg text-xs text-green-900 overflow-x-auto font-mono">
                        {JSON.stringify(selectedDiff.after, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 flex justify-end bg-gray-50/50">
                  <button
                    onClick={() => setSelectedDiff(null)}
                    className="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white rounded-lg text-sm font-medium transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )
    }
      </AnimatePresence >
    </motion.div >
  );
};
export default AdminSettings;
