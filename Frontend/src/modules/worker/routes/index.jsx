import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import PageTransition from '../components/common/PageTransition';
import BottomNav from '../components/layout/BottomNav';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import CashLimitModal from '../components/common/CashLimitModal'; // Import
import GlobalBookingAlert from '../components/common/GlobalBookingAlert';
// import useAppNotifications from '../../../hooks/useAppNotifications.jsx'; // Handled globally

// Lazy load wrapper with error handling (same as user app)
const lazyLoad = (importFunc) => {
  return lazy(() => {
    return Promise.resolve(importFunc()).catch((error) => {
      console.error('Failed to load worker page:', error);
      // Return a fallback component wrapped in a Promise
      return Promise.resolve({
        default: () => (
          <div className="flex items-center justify-center min-h-screen bg-white">
            <div className="text-center p-6">
              <h2 className="text-xl font-bold text-gray-800 mb-2">Failed to load page</h2>
              <p className="text-gray-600 mb-4">Please refresh the page or try again later.</p>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-3 rounded-xl text-white font-semibold transition-all duration-300 hover:opacity-90"
                style={{ backgroundColor: '#347989' }}
              >
                Refresh Page
              </button>
            </div>
          </div>
        ),
      });
    });
  });
};

// Lazy load worker pages for code splitting
const Login = lazyLoad(() => import('../pages/login'));
const Signup = lazyLoad(() => import('../pages/signup'));
const Dashboard = lazyLoad(() => import('../pages/Dashboard'));
const BookingAlert = lazyLoad(() => import('../pages/BookingAlert'));
const BookingAlerts = lazyLoad(() => import('../pages/BookingAlerts'));
const BookingDetails = lazyLoad(() => import('../pages/BookingDetails'));
const BookingTimeline = lazyLoad(() => import('../pages/BookingTimeline'));
const ActiveJobs = lazyLoad(() => import('../pages/ActiveJobs'));
const Earnings = lazyLoad(() => import('../pages/Earnings'));
const Wallet = lazyLoad(() => import('../pages/Wallet'));
const WithdrawalRequest = lazyLoad(() => import('../pages/WithdrawalRequest'));
const Profile = lazyLoad(() => import('../pages/Profile'));
const ProfileDetails = lazyLoad(() => import('../pages/Profile/ProfileDetails'));
const EditProfile = lazyLoad(() => import('../pages/Profile/EditProfile'));
const BankDetails = lazyLoad(() => import('../pages/BankDetails'));
const BookingMap = lazyLoad(() => import('../pages/BookingMap'));
const Settings = lazyLoad(() => import('../pages/Settings'));
const AddressManagement = lazyLoad(() => import('../pages/AddressManagement'));
const Notifications = lazyLoad(() => import('../pages/Notifications'));
const SettlementRequest = lazyLoad(() => import('../pages/Wallet/SettlementRequest'));
const SettlementHistory = lazyLoad(() => import('../pages/Wallet/SettlementHistory'));
const MyRatings = lazyLoad(() => import('../pages/MyRatings'));
const AboutHelpU = lazyLoad(() => import('../pages/AboutHelpU'));
const BillingPage = lazyLoad(() => import('../pages/BillingPage'));
const ReferEarn = lazyLoad(() => import('../pages/ReferEarn'));

// Loading fallback component
import LogoLoader from '../../../components/common/LogoLoader';

const LoadingFallback = () => (
  <LogoLoader />
);

const WorkerRoutes = () => {
  const location = useLocation();

  // Check if current route should hide bottom nav (auth routes or map)
  // Check if current route should hide bottom nav (auth routes or map or booking alert)
  const shouldHideBottomNav = location.pathname === '/worker/login' ||
    location.pathname === '/worker/signup' ||
    location.pathname === '/worker/login' ||
    location.pathname === '/worker/signup' ||
    location.pathname.endsWith('/map') ||
    location.pathname.includes('/booking-alert/');

  const shouldShowBottomNav = !shouldHideBottomNav;

  return (
    <ErrorBoundary>
      {/* Main content area - leaves space for bottom nav when needed */}
      <div className={shouldShowBottomNav ? "pb-24" : ""}>
        <Suspense fallback={<LoadingFallback />}>
          <PageTransition>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<PublicRoute userType="worker"><Login /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute userType="worker"><Signup /></PublicRoute>} />

              {/* Protected routes (auth required) */}
              <Route path="/" element={<ProtectedRoute userType="worker"><Navigate to="dashboard" replace /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute userType="worker"><Dashboard /></ProtectedRoute>} />
              <Route path="/booking-alerts" element={<ProtectedRoute userType="worker"><BookingAlerts /></ProtectedRoute>} />
              <Route path="/booking-alert/:id" element={<ProtectedRoute userType="worker"><BookingAlert /></ProtectedRoute>} />
              <Route path="/booking/:id" element={<ProtectedRoute userType="worker"><BookingDetails /></ProtectedRoute>} />
              <Route path="/booking/:id/map" element={<ProtectedRoute userType="worker"><BookingMap /></ProtectedRoute>} />
              <Route path="/booking/:id/billing" element={<ProtectedRoute userType="worker"><BillingPage /></ProtectedRoute>} />
              <Route path="/booking/:id/timeline" element={<ProtectedRoute userType="worker"><BookingTimeline /></ProtectedRoute>} />
              <Route path="/jobs" element={<ProtectedRoute userType="worker"><ActiveJobs /></ProtectedRoute>} />
              <Route path="/earnings" element={<ProtectedRoute userType="worker"><Earnings /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute userType="worker"><Wallet /></ProtectedRoute>} />
              <Route path="/wallet/withdraw" element={<ProtectedRoute userType="worker"><WithdrawalRequest /></ProtectedRoute>} />
              <Route path="/wallet/settle" element={<ProtectedRoute userType="worker"><SettlementRequest /></ProtectedRoute>} />
              <Route path="/wallet/settlements" element={<ProtectedRoute userType="worker"><SettlementHistory /></ProtectedRoute>} />
              <Route path="/refer-earn" element={<ProtectedRoute userType="worker"><ReferEarn /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute userType="worker"><Profile /></ProtectedRoute>} />
              <Route path="/profile/details" element={<ProtectedRoute userType="worker"><ProfileDetails /></ProtectedRoute>} />
              <Route path="/profile/edit" element={<ProtectedRoute userType="worker"><EditProfile /></ProtectedRoute>} />
              <Route path="/bank-details" element={<ProtectedRoute userType="worker"><BankDetails /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute userType="worker"><Settings /></ProtectedRoute>} />
              <Route path="/address-management" element={<ProtectedRoute userType="worker"><AddressManagement /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute userType="worker"><Notifications /></ProtectedRoute>} />
              <Route path="/my-ratings" element={<ProtectedRoute userType="worker"><MyRatings /></ProtectedRoute>} />
              <Route path="/about-helpu" element={<ProtectedRoute userType="worker"><AboutHelpU /></ProtectedRoute>} />
            </Routes>
          </PageTransition>
        </Suspense>
      </div>

      {/* BottomNav is OUTSIDE Suspense so it persists during page loads */}
      {shouldShowBottomNav && <BottomNav />}

      {/* Global Alert for Cash Limit */}
      {!shouldHideBottomNav && <CashLimitModal />}

      {/* Global New Booking Alert Modal */}
      {!shouldHideBottomNav && <GlobalBookingAlert />}
    </ErrorBoundary>
  );
};

export default WorkerRoutes;
