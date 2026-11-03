import React, { lazy, Suspense, useEffect } from 'react';
import { prefetchWhenIdle } from '../../../utils/prefetchRoutes';
import { Routes, Route, useLocation } from 'react-router-dom';
import PageTransition from '../components/common/PageTransition';
import BottomNav from '../components/layout/BottomNav';
import ErrorBoundary from '../components/common/ErrorBoundary';
import ProtectedRoute from '../../../components/auth/ProtectedRoute';
import PublicRoute from '../../../components/auth/PublicRoute';
import useAppNotifications from '../../../hooks/useAppNotifications.jsx';

// Lazy load wrapper with error handling
const lazyLoad = (importFunc) => {
  return lazy(() => {
    return Promise.resolve(importFunc()).catch((error) => {
      console.error('User Module - Lazy Load Error:', error);
      // Failed to load user page
      // Return a fallback component wrapped in a Promise
      return Promise.resolve({
        default: () => (
          <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
            <div className="text-center p-8 bg-white rounded-3xl shadow-xl max-w-lg w-full border border-red-100">
              <div className="text-5xl mb-4">🚫</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">Failed to load page</h2>
              <p className="text-gray-600 mb-6">Something went wrong while loading this section.</p>
              
              <div className="bg-red-50 p-4 rounded-xl text-left border border-red-100 mb-6 max-h-40 overflow-auto">
                <p className="text-xs font-mono text-red-600 underline mb-2">Error Details:</p>
                <code className="text-xs text-red-700 whitespace-pre-wrap">
                  {error?.message || 'Unknown loading error'}
                </code>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => window.location.reload()}
                  className="px-6 py-3 rounded-xl text-white font-bold transition-all duration-300 hover:opacity-90 active:scale-95 shadow-lg shadow-teal-500/20"
                  style={{ backgroundColor: '#00a6a6' }}
                >
                  Refresh Page
                </button>
                <button
                  onClick={() => window.history.back()}
                  className="px-6 py-2 text-gray-400 hover:text-gray-600 font-medium transition-colors"
                >
                  Go Back
                </button>
              </div>
            </div>
          </div>
        ),
      });
    });
  });
};

// Lazy load all user pages for code splitting with error handling
const Home = lazyLoad(() => import('../pages/Home'));
const Rewards = lazyLoad(() => import('../pages/Rewards'));
const Account = lazyLoad(() => import('../pages/Account'));
const Native = lazyLoad(() => import('../pages/Native'));
const Cart = lazyLoad(() => import('../pages/Cart'));
const Category = lazyLoad(() => import('../pages/Category'));
const SeeAll = lazyLoad(() => import('../pages/SeeAll'));
const Services = lazyLoad(() => import('../pages/Services'));
const Checkout = lazyLoad(() => import('../pages/Checkout'));
const MyBookings = lazyLoad(() => import('../pages/MyBookings'));
const BookingDetails = lazyLoad(() => import('../pages/BookingDetails'));
const BookingTrack = lazyLoad(() => import('../pages/BookingTrack'));
const BookingConfirmation = lazyLoad(() => import('../pages/BookingConfirmation'));
const Settings = lazyLoad(() => import('../pages/Settings'));
const ManagePaymentMethods = lazyLoad(() => import('../pages/ManagePaymentMethods'));
const ManageAddresses = lazyLoad(() => import('../pages/ManageAddresses'));
const Wallet = lazyLoad(() => import('../pages/Wallet'));
const MyRating = lazyLoad(() => import('../pages/MyRating'));
const AboutHelpU = lazyLoad(() => import('../pages/AboutHelpU'));
const UpdateProfile = lazyLoad(() => import('../pages/UpdateProfile'));
const Login = lazyLoad(() => import('../pages/login'));
const Signup = lazyLoad(() => import('../pages/signup'));
const Scrap = lazyLoad(() => import('../pages/Scrap'));
const AddScrap = lazyLoad(() => import('../pages/Scrap/AddScrap'));
const Notifications = lazyLoad(() => import('../pages/Notifications'));
const HelpSupport = lazyLoad(() => import('../pages/HelpSupport'));
const CancellationPolicy = lazyLoad(() => import('../pages/CancellationPolicy'));
const Terms = lazyLoad(() => import('../pages/Terms'));
const PrivacyPolicy = lazyLoad(() => import('../pages/PrivacyPolicy'));
const Faq = lazyLoad(() => import('../pages/Faq'));
const MyDisputes = lazyLoad(() => import('../pages/Disputes'));
const DisputeDetail = lazyLoad(() => import('../pages/Disputes/DisputeDetail'));
const RecurringBookings = lazyLoad(() => import('../pages/RecurringBookings'));

// Loading fallback component
import LogoLoader from '../../../components/common/LogoLoader';
import HomeSkeleton from '../pages/Home/components/HomeSkeleton';
import PageHeader from '../components/layout/PageHeader';

// Fills exactly the visible area (the page wrapper pads the nav height when the nav shows),
// so the logo is dead-centre and the page can't scroll while loading.
// Pages that open with the shared page header: show that header (with its real title) right away,
// so it doesn't pop in only after the page's code has downloaded.
const HEADER_TITLES = {
  '/user/my-bookings': 'My Bookings',
  '/user/cart': 'Your Cart',
  '/user/account': 'Account',
  '/user/scrap': 'Sell Scrap',
  '/user/services': 'All services'
};

const LoadingFallback = ({ withNav, isHome, pathname }) => {
  const headerTitle = HEADER_TITLES[pathname?.replace(/\/$/, '')];
  const height = withNav ? 'h-[calc(100dvh-var(--bottom-nav-height,96px)-1rem)]' : 'h-dvh';

  if (isHome) {
    return <div className={`overflow-hidden ${height}`}><HomeSkeleton /></div>;
  }
  return (
    <div className={`overflow-hidden flex flex-col ${height}`}>
      {headerTitle && <PageHeader title={headerTitle} />}
      <div className="flex-1 flex items-center justify-center">
        <LogoLoader inline size="w-20 h-20" />
      </div>
    </div>
  );
};

// Import Live Booking Card
import LiveBookingCard from '../components/booking/LiveBookingCard';

// Pages reachable from the bottom nav and common flows. Their code is fetched in the
// background after start-up so switching pages never waits on a download.
const PRELOAD_PAGES = [
  () => import('../pages/Home'),
  () => import('../pages/MyBookings'),
  () => import('../pages/Cart'),
  () => import('../pages/Account'),
  () => import('../pages/Scrap'),
  () => import('../pages/Checkout'),
  () => import('../pages/BookingDetails'),
  () => import('../pages/Notifications'),
];

const preloadPages = () => {
  const run = () => PRELOAD_PAGES.forEach((load) => load().catch(() => { /* loaded on demand instead */ }));
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 1500);
  }
};

const UserRoutes = () => {
  const location = useLocation();

  // Pre-load the pages reachable from the bottom nav and the booking flow
  useEffect(() => {
    prefetchWhenIdle([
      () => import('../pages/Home'),
      () => import('../pages/MyBookings'),
      () => import('../pages/Cart'),
      () => import('../pages/Account'),
      () => import('../pages/Category'),
      () => import('../pages/Services'),
      () => import('../pages/Checkout'),
      () => import('../pages/BookingDetails')
    ]);
  }, []);

  useEffect(() => {
    preloadPages();
  }, []);

  // Enable global notifications for user
  // Global notifications are now handled by SocketProvider at App level
  // useAppNotifications('user');

  // Pages where BottomNav should be shown
  // Every page listed here gets the shared BottomNav (pages must not render their own)
  const bottomNavPages = ['/user', '/user/', '/user/my-bookings', '/user/scrap', '/user/cart', '/user/account', '/user/notifications', '/user/native'];
  const shouldShowBottomNav = bottomNavPages.includes(location.pathname);

  // Check if we hide the live booking card (e.g. if we are on the specific booking details or track page)
  const isBookingDetailsPage = location.pathname.match(/^\/user\/booking\/[a-zA-Z0-9]+(\/track)?$/);
  const isBookingConfirmationPage = location.pathname.includes('/booking-confirmation');


  // Check if we are on public pages where we shouldn't fetch bookings or mount live booking cards
  const publicPaths = ['/login', '/signup', '/terms', '/privacy-policy', '/faq', '/cancellation-policy', '/help-support', '/about-helpu'];
  const isPublicPage = publicPaths.some((p) => location.pathname.includes(p));

  return (
    <ErrorBoundary>
      {/* Main content area - leaves space for bottom nav when needed */}
      <div className={`w-full max-w-full overflow-x-clip min-w-0 ${shouldShowBottomNav ? "with-user-nav pb-[calc(var(--bottom-nav-height,96px)+1rem)]" : ""}`}>
        <Suspense fallback={<LoadingFallback withNav={shouldShowBottomNav} isHome={location.pathname === '/user' || location.pathname === '/user/'} pathname={location.pathname} />}>
          <PageTransition>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<PublicRoute userType="user"><Login /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute userType="user"><Signup /></PublicRoute>} />

              {/* Protected routes (auth required) */}
              <Route path="/" element={<ProtectedRoute userType="user"><Home /></ProtectedRoute>} />
              <Route path="/category/:idOrSlug" element={<ProtectedRoute userType="user"><Category /></ProtectedRoute>} />
              {/* An appliance under its parent, e.g. /user/category/ac/air-conditioner */}
              <Route path="/category/:parentSlug/:idOrSlug" element={<ProtectedRoute userType="user"><Category /></ProtectedRoute>} />
              <Route path="/see-all/:sectionKey" element={<ProtectedRoute userType="user"><SeeAll /></ProtectedRoute>} />
              <Route path="/services" element={<ProtectedRoute userType="user"><Services /></ProtectedRoute>} />
              <Route path="/native" element={<ProtectedRoute userType="user"><Native /></ProtectedRoute>} />

              <Route path="/rewards" element={<ProtectedRoute userType="user"><Rewards /></ProtectedRoute>} />
              <Route path="/account" element={<ProtectedRoute userType="user"><Account /></ProtectedRoute>} />
              <Route path="/cart" element={<ProtectedRoute userType="user"><Cart /></ProtectedRoute>} />
              <Route path="/checkout" element={<ProtectedRoute userType="user"><Checkout /></ProtectedRoute>} />
              <Route path="/my-bookings" element={<ProtectedRoute userType="user"><MyBookings /></ProtectedRoute>} />
              <Route path="/booking/:id" element={<ProtectedRoute userType="user"><BookingDetails /></ProtectedRoute>} />
              <Route path="/booking/:id/track" element={<ProtectedRoute userType="user"><BookingTrack /></ProtectedRoute>} />
              <Route path="/booking-confirmation/:id" element={<ProtectedRoute userType="user"><BookingConfirmation /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute userType="user"><Settings /></ProtectedRoute>} />
              <Route path="/manage-payment-methods" element={<ProtectedRoute userType="user"><ManagePaymentMethods /></ProtectedRoute>} />
              <Route path="/manage-addresses" element={<ProtectedRoute userType="user"><ManageAddresses /></ProtectedRoute>} />
              <Route path="/wallet" element={<ProtectedRoute userType="user"><Wallet /></ProtectedRoute>} />

              <Route path="/my-rating" element={<ProtectedRoute userType="user"><MyRating /></ProtectedRoute>} />
              <Route path="/about-helpu" element={<AboutHelpU />} />
              <Route path="/update-profile" element={<ProtectedRoute userType="user"><UpdateProfile /></ProtectedRoute>} />
              <Route path="/scrap" element={<ProtectedRoute userType="user"><Scrap /></ProtectedRoute>} />
              <Route path="/scrap/add" element={<ProtectedRoute userType="user"><AddScrap /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute userType="user"><Notifications /></ProtectedRoute>} />
              <Route path="/help-support" element={<HelpSupport />} />
              <Route path="/cancellation-policy" element={<CancellationPolicy />} />
              {/* Public — must be reachable before login (e.g. linked from signup) */}
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/disputes" element={<ProtectedRoute userType="user"><MyDisputes /></ProtectedRoute>} />
              <Route path="/disputes/:id" element={<ProtectedRoute userType="user"><DisputeDetail /></ProtectedRoute>} />
              <Route path="/recurring-bookings" element={<ProtectedRoute userType="user"><RecurringBookings /></ProtectedRoute>} />
            </Routes>
          </PageTransition>
        </Suspense>
      </div>

      {/* These components are OUTSIDE Suspense so they persist during page loads */}
      {!isBookingDetailsPage && !isBookingConfirmationPage && !isPublicPage && <LiveBookingCard hasBottomNav={shouldShowBottomNav} />}
      {shouldShowBottomNav && <BottomNav />}
    </ErrorBoundary>
  );
};

export default UserRoutes;

