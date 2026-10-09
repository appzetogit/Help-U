import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Import module routes
import UserRoutes from '../modules/user/routes';
import WorkerRoutes from '../modules/worker/routes';
import AdminRoutes from '../modules/admin/routes';

import LandingPage from '../modules/landing/pages/LandingPage';

const AppRoutes = () => {
  return (
    <Routes>
      {/* Landing Page */}
      <Route path="/Home" element={<LandingPage />} />

      {/* Redirect Root Slash to User App */}
      <Route path="/" element={<Navigate to="/user" replace />} />

      {/* User Routes */}
      <Route path="/user/*" element={<UserRoutes />} />

      {/* Worker Routes */}
      <Route path="/worker/*" element={<WorkerRoutes />} />

      {/* Legacy /worker Redirect to /worker */}
      <Route path="/vendor/*" element={<Navigate to="/worker" replace />} />


      {/* Admin Routes */}
      <Route path="/admin/*" element={<AdminRoutes />} />
    </Routes>
  );
};

export default AppRoutes;

