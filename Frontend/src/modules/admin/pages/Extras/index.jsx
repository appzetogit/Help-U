import React, { useMemo } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { FiLayers } from 'react-icons/fi';
import AddOns from '../AddOns';
import WorkerServicesPage from '../UserCategories/pages/WorkerServicesPage';
import WorkerPartsPage from '../UserCategories/pages/WorkerPartsPage';
import { PageHeader } from '../../components/adminUi';
import { EXTRAS_TABS, canAccessItem, readAdminUser } from '../../utils/adminNav';

/**
 * The three price lists for things added on top of the main service, in one place. They differ in who adds
 * the item and when, so each tab says so:
 *   Checkout add-ons   the customer ticks them at checkout, before the visit
 *   Bill: repair jobs  the professional adds them to the final bill for work found on site
 *   Bill: parts        the professional adds spare parts to the final bill
 */
const PAGES = {
  addons: <AddOns />,
  'repair-jobs': <div className="p-4 sm:p-6"><WorkerServicesPage /></div>,
  parts: <div className="p-4 sm:p-6"><WorkerPartsPage /></div>
};

const Extras = () => {
  // Each tab keeps the permission its page always had, so a sub-admin sees only the tabs they were granted.
  const tabs = useMemo(() => {
    const admin = readAdminUser();
    return EXTRAS_TABS.filter((t) => canAccessItem({ route: t.legacyRoute, allowedRoles: ['super_admin', 'admin'] }, admin));
  }, []);

  if (tabs.length === 0) return <div className="p-6 text-sm text-gray-500">You do not have access to this section.</div>;

  return (
    <div>
      <div className="px-4 pt-4 sm:px-6 sm:pt-6">
        <PageHeader
          icon={FiLayers}
          title="Extras & Pricing"
          description="Price lists for things added on top of the main service. Pick the one that matches who adds it and when."
        />
        <div className="grid gap-2 sm:grid-cols-3">
          {tabs.map((t) => (
            <NavLink
              key={t.key}
              to={`/admin/extras/${t.key}`}
              className={({ isActive }) => `rounded-xl border px-4 py-3 transition-colors ${
                isActive ? 'border-[#163B66] bg-[#163B66] text-white shadow-sm' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {({ isActive }) => (
                <>
                  <span className="block text-sm font-bold">{t.label}</span>
                  <span className={`mt-0.5 block text-xs ${isActive ? 'text-white/80' : 'text-gray-500'}`}>{t.hint}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </div>

      <Routes>
        <Route index element={<Navigate to={tabs[0].key} replace />} />
        {tabs.map((t) => <Route key={t.key} path={t.key} element={PAGES[t.key]} />)}
        <Route path="*" element={<Navigate to={tabs[0].key} replace />} />
      </Routes>
    </div>
  );
};

export default Extras;
