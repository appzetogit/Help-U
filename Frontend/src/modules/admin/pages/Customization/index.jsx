import React, { useState, useEffect, useCallback } from 'react';
import {
  getCustomizationToggles,
  updateCustomizationToggles
} from '../../services/settingsService';
import { cityService } from '../../services/cityService';
import {
  FiSettings,
  FiAlertTriangle,
  FiCreditCard,
  FiUsers,
  FiCalendar,
  FiMapPin,
  FiLoader
} from 'react-icons/fi';
import { toast } from 'react-hot-toast';

/**
 * Customization Settings
 *
 * Global feature toggles. Each switch writes immediately and optimistically;
 * if the server rejects the change (for example, the last payment method being
 * turned off) the switch rolls back and the reason is surfaced as a toast.
 */

const SECTIONS = [
  {
    title: 'System',
    icon: FiAlertTriangle,
    toggles: [
      {
        key: 'isUnderMaintenance',
        label: 'Under Maintenance',
        description:
          'When ON, the user and partner apps show a maintenance screen. The admin panel stays available so you can turn this back off.',
        danger: true
      },
      {
        key: 'useDefaultLocation',
        label: 'Default Location Mode',
        description:
          'Skips the device location prompt and uses the default city below for every user. Useful for testing and single-city launches.',
        needsCity: true
      }
    ]
  },
  {
    title: 'Payments',
    icon: FiCreditCard,
    toggles: [
      {
        key: 'isCashEnabled',
        label: 'Cash Payment',
        description: 'Master switch for cash on service across the platform.'
      },
      {
        key: 'isWalletPaymentEnabled',
        label: 'Wallet Payment',
        description: 'Controls whether wallet balance can be used at checkout.'
      },
      {
        key: 'isOnlinePaymentEnabled',
        label: 'Online Payment',
        description: 'Controls Razorpay online payment visibility at checkout.'
      }
    ]
  },
  {
    title: 'Bookings',
    icon: FiCalendar,
    toggles: [
      {
        key: 'isInstantBookingEnabled',
        label: 'Instant Booking',
        description: 'When OFF, customers can only schedule bookings for later.'
      },
      {
        key: 'isScheduledBookingEnabled',
        label: 'Scheduled Booking',
        description: 'When OFF, customers can only book instantly.'
      }
    ]
  },
  {
    title: 'Registration',
    icon: FiUsers,
    toggles: [
      {
        key: 'isVendorRegistrationEnabled',
        label: 'Partner Registration',
        description:
          'When OFF, new partner sign-ups are refused. Existing partners are unaffected.'
      }
    ]
  }
];

const Toggle = ({ checked, onChange, disabled, danger }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors
      focus:outline-none focus:ring-2 focus:ring-offset-2
      ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
      ${
        checked
          ? danger
            ? 'bg-red-500 focus:ring-red-400'
            : 'bg-green-500 focus:ring-green-400'
          : 'bg-gray-300 focus:ring-gray-400'
      }`}
  >
    <span
      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform
        ${checked ? 'translate-x-6' : 'translate-x-1'}`}
    />
  </button>
);

const Customization = () => {
  const [toggles, setToggles] = useState(null);
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [toggleRes, cityRes] = await Promise.all([
        getCustomizationToggles(),
        cityService.getAll().catch(() => null)
      ]);

      if (toggleRes?.success) {
        setToggles(toggleRes.toggles);
      } else {
        toast.error('Could not load customization settings');
      }

      const cityList = cityRes?.cities || cityRes?.data || [];
      setCities(Array.isArray(cityList) ? cityList : []);
    } catch (error) {
      console.error('Failed to load customization settings:', error);
      toast.error(
        error?.response?.data?.message || 'Could not load customization settings'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const persist = async (patch, previous) => {
    const key = Object.keys(patch)[0];
    setSaving(key);
    try {
      const res = await updateCustomizationToggles(patch);
      if (res?.success) {
        setToggles(res.toggles);
        toast.success('Settings updated');
      } else {
        setToggles(previous);
        toast.error(res?.message || 'Update failed');
      }
    } catch (error) {
      // Roll back so the switch never shows a state the server did not accept.
      setToggles(previous);
      toast.error(error?.response?.data?.message || 'Update failed');
    } finally {
      setSaving(null);
    }
  };

  const handleToggle = (key, value) => {
    const previous = toggles;
    setToggles((prev) => ({ ...prev, [key]: value }));
    persist({ [key]: value }, previous);
  };

  const handleCityChange = (cityId) => {
    const previous = toggles;
    setToggles((prev) => ({ ...prev, defaultCityId: cityId || null }));
    persist({ defaultCityId: cityId || null }, previous);
  };

  const handleMessageBlur = (value) => {
    if (value === toggles.maintenanceMessage) return;
    const previous = toggles;
    persist({ maintenanceMessage: value }, previous);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <FiLoader className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!toggles) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Could not load customization settings.
          <button
            onClick={loadData}
            className="ml-3 rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <FiSettings className="text-gray-600" />
          Customization Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Control global feature toggles for the platform. Changes apply immediately.
        </p>
      </div>

      {toggles.isUnderMaintenance && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <FiAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <strong>Maintenance mode is ON.</strong> Customers and partners cannot use
            the apps right now. Only this admin panel remains available.
          </div>
        </div>
      )}

      <div className="space-y-6">
        {SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          return (
            <div
              key={section.title}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
            >
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                <SectionIcon className="h-4 w-4" />
                {section.title}
              </h2>

              <div className="grid gap-4 sm:grid-cols-2">
                {section.toggles.map((item) => (
                  <div
                    key={item.key}
                    className="rounded-lg border border-gray-200 bg-gray-50/60 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-gray-900">
                          {item.label}
                        </h3>
                        <p className="mt-1 text-xs leading-relaxed text-gray-500">
                          {item.description}
                        </p>
                      </div>
                      <Toggle
                        checked={Boolean(toggles[item.key])}
                        danger={item.danger}
                        disabled={saving === item.key}
                        onChange={(v) => handleToggle(item.key, v)}
                      />
                    </div>

                    {item.needsCity && toggles.useDefaultLocation && (
                      <div className="mt-3 border-t border-gray-200 pt-3">
                        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-700">
                          <FiMapPin className="h-3.5 w-3.5" />
                          Default city
                        </label>
                        <select
                          value={toggles.defaultCityId || ''}
                          onChange={(e) => handleCityChange(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm
                            focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                        >
                          <option value="">Select a city…</option>
                          {cities.map((city) => (
                            <option key={city._id} value={city._id}>
                              {city.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {item.key === 'isUnderMaintenance' && toggles.isUnderMaintenance && (
                      <div className="mt-3 border-t border-gray-200 pt-3">
                        <label className="mb-1 block text-xs font-medium text-gray-700">
                          Message shown to users
                        </label>
                        <textarea
                          rows={2}
                          defaultValue={toggles.maintenanceMessage || ''}
                          onBlur={(e) => handleMessageBlur(e.target.value)}
                          className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm
                            focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Customization;
