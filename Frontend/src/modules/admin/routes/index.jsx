import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from '../components/layout/AdminLayout';
import AdminErrorBoundary from '../components/common/AdminErrorBoundary';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import useAppNotifications from '../../../hooks/useAppNotifications.jsx';

// Login page (not lazy loaded for faster initial access)
import Login from '../pages/login';

// Lazy load admin pages for code splitting
const Dashboard = lazy(() => import('../pages/Dashboard'));
const Settings = lazy(() => import('../pages/Settings'));
const LandingPageAdmin = lazy(() => import('../pages/LandingPageAdmin'));
const SupportMessages = lazy(() => import('../pages/SupportMessages'));
const Customization = lazy(() => import('../pages/Customization'));
const LegalPages = lazy(() => import('../pages/LegalPages'));
const UserCategories = lazy(() => import('../pages/UserCategories'));
const Users = lazy(() => import('../pages/Users'));
const Workers = lazy(() => import('../pages/Workers'));
const Bookings = lazy(() => import('../pages/Bookings'));
const BookingTracking = lazy(() => import('../pages/Bookings/Tracking'));
const BookingNotifications = lazy(() => import('../pages/Bookings/BookingNotifications'));
const Payments = lazy(() => import('../pages/Payments'));
const Reports = lazy(() => import('../pages/Reports'));
const Notifications = lazy(() => import('../pages/Notifications'));

const Scrap = lazy(() => import('../pages/Scrap'));
const Settlements = lazy(() => import('../pages/Settlements'));
const Reviews = lazy(() => import('../pages/Reviews'));
const BookingConfig = lazy(() => import('../pages/BookingConfig'));
const AddOns = lazy(() => import('../pages/AddOns'));
const Disputes = lazy(() => import('../pages/Disputes'));
const DisputeDetail = lazy(() => import('../pages/Disputes/DisputeDetail'));
const RecurringBookings = lazy(() => import('../pages/RecurringBookings'));
const Coupons = lazy(() => import('../pages/Coupons'));
const Zones = lazy(() => import('../pages/Zones'));
const LoginBanners = lazy(() => import('../pages/LoginBanners'));



// Loading fallback component
import LogoLoader from '../../../components/common/LogoLoader';

const LoadingFallback = () => (
  <LogoLoader />
);

const AdminRoutes = () => {
  // Enable global notifications for admin
  // Global notifications are now handled by SocketProvider at App level
  // useAppNotifications('admin');

  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        {/* Login route - outside of layout (public) */}
        <Route path="/login" element={<PublicRoute userType="admin"><Login /></PublicRoute>} />

        {/* Protected routes - inside layout */}
        <Route path="/" element={
          <ProtectedRoute userType="admin">
            <AdminErrorBoundary>
              <AdminLayout />
            </AdminErrorBoundary>
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="users/*" element={<Users />} />
          <Route path="workers/*" element={<Workers />} />
          <Route path="vendors/*" element={<Navigate to="/admin/workers" replace />} />
          <Route path="bookings" element={<Bookings />} />
          <Route path="bookings/tracking" element={<BookingTracking />} />
          <Route path="bookings/notifications" element={<BookingNotifications />} />
          <Route path="user-categories/*" element={<UserCategories />} />
          <Route path="payments/*" element={<Payments />} />
          <Route path="reports/*" element={<Reports />} />
          <Route path="notifications/*" element={<Notifications />} />
          <Route path="scrap" element={<Scrap />} />
          <Route path="reviews" element={<Reviews />} />
          <Route path="settlements/*" element={<Settlements />} />
          <Route path="settings/*" element={<Settings />} />
          <Route path="landing-page" element={<LandingPageAdmin />} />
          <Route path="login-banners" element={<LoginBanners />} />
          <Route path="customization" element={<Customization />} />
          <Route path="legal-pages" element={<LegalPages />} />
          <Route path="support-messages" element={<SupportMessages />} />
          <Route path="booking-config" element={<BookingConfig />} />
          <Route path="addons" element={<AddOns />} />
          <Route path="commission" element={<Navigate to="/admin/settings/commission" replace />} />
          <Route path="disputes" element={<Disputes />} />
          <Route path="disputes/:id" element={<DisputeDetail />} />
          <Route path="recurring-bookings" element={<RecurringBookings />} />
          <Route path="coupons" element={<Coupons />} />
          <Route path="zones" element={<Zones />} />
        </Route>
      </Routes>
    </Suspense>
  );
};

export default AdminRoutes;

