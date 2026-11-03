import React, { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ensureIds, loadCatalog } from "./utils";
import HomePage from "./pages/HomePage";
import BrandsPage from "./pages/BrandsPage";
import ServiceManagementPage from "./pages/ServiceManagementPage";
import HomeSectionsManagerPage from "./pages/HomeSectionsManagerPage";

import { cityService } from "../../services/cityService";
import AdminErrorBoundary from "../../components/common/AdminErrorBoundary";

const CITY_KEY = 'adminCatalogCity';

const readAdmin = () => {
  try {
    return JSON.parse(sessionStorage.getItem('adminData') || localStorage.getItem('adminData') || '{}');
  } catch {
    return {};
  }
};

const UserCategories = () => {
  const [catalog, setCatalog] = useState(() => ensureIds(loadCatalog()));
  const [cities, setCities] = useState([]);

  // Who is looking decides the starting city:
  //  - super admin: the city they used last time, otherwise "All Cities" (empty = no city filter)
  //  - a city admin: their own city (the selector is hidden for them)
  const admin = readAdmin();
  const isAdminSuper = (admin.role || 'admin') === 'super_admin';
  const ownCityId = String(admin.cityId?._id || admin.cityId || '');
  const [selectedCity, setSelectedCity] = useState(() => {
    if (!isAdminSuper) return ownCityId;
    try { return localStorage.getItem(CITY_KEY) || ''; } catch { return ''; }
  });

  const changeCity = (cityId) => {
    setSelectedCity(cityId);
    try { localStorage.setItem(CITY_KEY, cityId); } catch { /* remembering is a nicety */ }
  };

  useEffect(() => {
    const handler = () => setCatalog(ensureIds(loadCatalog()));
    window.addEventListener("adminUserAppCatalogUpdated", handler);
    return () => window.removeEventListener("adminUserAppCatalogUpdated", handler);
  }, []);

  // Fetch cities once for the parent container
  useEffect(() => {
    const fetchCities = async () => {
      try {
        const response = await cityService.getAll();
        if (response.success) {
          const loadedCities = (response.cities || []).filter(city => city.isActive);
          setCities(loadedCities);

          const ids = loadedCities.map((c) => String(c._id || c.id));
          if (isAdminSuper) {
            // A remembered city that was deleted or switched off falls back to "All Cities"
            setSelectedCity((prev) => (prev && !ids.includes(String(prev)) ? '' : prev));
          } else if (!ownCityId || !ids.includes(ownCityId)) {
            // A city admin with no (valid) city of their own keeps the old behaviour: the default city
            const fallback = loadedCities.find((c) => c.isDefault) || loadedCities[0];
            if (fallback) setSelectedCity(fallback._id || fallback.id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch cities:', error);
      }
    };
    fetchCities();
  }, []);

  return (
    <div className="space-y-4">
      {/* Global City Filter Header - Visible only to Super Admin */}
      {isAdminSuper && (
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 p-4 rounded-xl shadow-lg flex items-center justify-between text-white border border-slate-700">
          <div>
            <h2 className="text-lg font-bold text-white">Parameters</h2>
            <p className="text-sm text-slate-300">Filter all catalog content by city</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-200">Selected City:</label>
            <select
              value={selectedCity}
              onChange={(e) => changeCity(e.target.value)}
              className="px-4 py-2 bg-slate-700 text-white border border-slate-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-500 min-w-[200px]"
            >
              {/* Empty = no city filter: every page below already treats it as "all cities" */}
              <option value="">All Cities</option>
              {cities.map(city => {
                const cityId = city._id || city.id;
                return <option key={cityId} value={cityId}>{city.name}</option>
              })}
            </select>
          </div>
        </div>
      )}

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
        <AdminErrorBoundary>
          <Routes>
            <Route index element={<Navigate to="service-management" replace />} />
            <Route path="home" element={<HomePage catalog={catalog} setCatalog={setCatalog} selectedCity={selectedCity} />} />
            <Route path="service-management" element={<ServiceManagementPage selectedCity={selectedCity} />} />
            <Route path="services" element={<Navigate to="service-management" replace />} />
            {/* The old stand-alone categories editor was replaced by the one inside Service Management */}
            <Route path="categories" element={<Navigate to="service-management" replace />} />
            <Route path="sections" element={<HomeSectionsManagerPage catalog={catalog} setCatalog={setCatalog} selectedCity={selectedCity} />} />
            <Route path="catalog" element={<ServiceManagementPage selectedCity={selectedCity} />} />
            <Route path="brands" element={<BrandsPage catalog={catalog} setCatalog={setCatalog} selectedCity={selectedCity} />} />
            {/* The worker price lists moved to Extras & Pricing */}
            <Route path="worker-services" element={<Navigate to="/admin/extras/repair-jobs" replace />} />
            <Route path="vendor-services" element={<Navigate to="/admin/extras/repair-jobs" replace />} />
            <Route path="worker-parts" element={<Navigate to="/admin/extras/parts" replace />} />
            <Route path="vendor-parts" element={<Navigate to="/admin/extras/parts" replace />} />
            <Route path="*" element={<Navigate to="home" replace />} />
          </Routes>
        </AdminErrorBoundary>
      </motion.div>
    </div>
  );
};

export default UserCategories;


