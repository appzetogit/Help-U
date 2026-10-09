import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import { configService } from '../services/configService';

const ConfigContext = createContext(null);

const STORAGE_KEY = 'app_public_config';

export const ConfigProvider = ({ children }) => {
  // Initialize with the last confirmed backend value (from cache) to avoid a flash
  // between page loads. When there is no cached value yet, DO NOT assume a feature
  // is enabled - feature flags must stay off until the backend explicitly confirms
  // them, otherwise a stale/missing cache would make an admin-disabled feature
  // reappear after every refresh.
  const [config, setConfig] = useState(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {
      console.warn('Failed to parse cached config:', e);
    }
    return null;
  });

  const [loading, setLoading] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const res = await configService.getSettings();
      if (res && res.success && res.settings) {
        setConfig(res.settings);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(res.settings));
        } catch (e) {
          // Ignore storage quota errors
        }
      }
    } catch (error) {
      console.error('Failed to fetch app configuration:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();

    // Listen to local update events across windows/tabs/components
    const handleLocalUpdate = () => {
      fetchConfig();
    };

    const handleStorage = (e) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue);
          setConfig(parsed);
        } catch (err) {}
      }
    };

    window.addEventListener('adminSettingsUpdated', handleLocalUpdate);
    window.addEventListener('systemConfigUpdated', handleLocalUpdate);
    window.addEventListener('storage', handleStorage);

    // Socket real-time synchronization
    let socket = null;
    try {
      const SOCKET_URL = import.meta.env.VITE_API_BASE_URL?.replace('/api', '') || 'http://localhost:5000';
      socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], withCredentials: true });
      const applyUpdate = (data) => {
        if (!data) return;
        setConfig(prev => {
          const updated = { ...prev, ...data };
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
          } catch (e) {}
          return updated;
        });
      };

      socket.on('system_config_updated', applyUpdate);
      // Customization toggles (maintenance mode, payment methods, booking types)
      socket.on('customization_toggles_updated', applyUpdate);
    } catch (e) {
      console.warn('Socket connection for config failed:', e);
    }

    return () => {
      window.removeEventListener('adminSettingsUpdated', handleLocalUpdate);
      window.removeEventListener('systemConfigUpdated', handleLocalUpdate);
      window.removeEventListener('storage', handleStorage);
      if (socket) {
        socket.disconnect();
      }
    };
  }, [fetchConfig]);

  // Provide quick convenience booleans.
  // isScrapEnabled fails CLOSED: until the backend value has actually been loaded
  // (config is not null), the feature stays hidden instead of defaulting to on.
  const isScrapEnabled = config != null && config.isScrapEnabled !== false;
  const isOnlinePaymentEnabled = config?.isOnlinePaymentEnabled !== false;
  const configLoaded = config != null;

  // Maintenance fails OPEN: it only shows once the backend has actually said the
  // flag is on. A missing or unreachable config must never lock users out.
  const isUnderMaintenance = config?.isUnderMaintenance === true;

  // Customization toggles. Each defaults to enabled so a config that has not
  // loaded yet never hides a feature that is in fact available.
  const isCashEnabled = config?.isCashEnabled !== false;
  const isWalletPaymentEnabled = config?.isWalletPaymentEnabled !== false;
  const isInstantBookingEnabled = config?.isInstantBookingEnabled !== false;
  const isScheduledBookingEnabled = config?.isScheduledBookingEnabled !== false;
  const isVendorRegistrationEnabled = config?.isVendorRegistrationEnabled !== false;

  const value = {
    config,
    isScrapEnabled,
    isOnlinePaymentEnabled,
    isUnderMaintenance,
    isCashEnabled,
    isWalletPaymentEnabled,
    isInstantBookingEnabled,
    isScheduledBookingEnabled,
    isVendorRegistrationEnabled,
    configLoaded,
    loading,
    refreshConfig: fetchConfig,
    setConfig: (newConfig) => {
      setConfig(prev => {
        const updated = { ...prev, ...newConfig };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        } catch (e) {}
        return updated;
      });
    }
  };

  return (
    <ConfigContext.Provider value={value}>
      {children}
    </ConfigContext.Provider>
  );
};

export const useConfig = () => {
  const context = useContext(ConfigContext);
  if (!context) {
    // Fallback safe defaults if used outside ConfigProvider - fail closed for
    // feature flags rather than assuming a disabled feature should be shown.
    return {
      config: null,
      isScrapEnabled: false,
      isOnlinePaymentEnabled: true,
      isUnderMaintenance: false,
      isCashEnabled: true,
      isWalletPaymentEnabled: true,
      isInstantBookingEnabled: true,
      isScheduledBookingEnabled: true,
      isVendorRegistrationEnabled: true,
      configLoaded: false,
      loading: false,
      refreshConfig: () => {},
      setConfig: () => {}
    };
  }
  return context;
};

export default ConfigContext;
