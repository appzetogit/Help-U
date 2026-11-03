import React, { useEffect } from 'react'; // Updated index to .jsx
import { BrowserRouter } from 'react-router-dom';
import ScrollManager from './components/common/ScrollManager';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import ToastLimiter from './components/common/ToastLimiter';
import AppRoutes from './routes';
import { SocketProvider } from './context/SocketContext';
import { ConfigProvider } from './context/ConfigContext';
import { LanguageProvider } from './context/LanguageContext';
import { CartProvider } from './context/CartContext';
import { CityProvider } from './context/CityContext';
import { ZoneProvider } from './context/ZoneContext';
import { initializePushNotifications, setupForegroundNotificationHandler } from './services/pushNotificationService';
import { installKeyboardWatcher } from './utils/keyboardWatcher';
import { LocationPermissionChecker, MaintenanceGate } from './components/common';

function App() {
  // Initialize push notifications on app load
  // Hide bottom bars while the on-screen keyboard is up, so they do not ride on top of the form
  useEffect(() => installKeyboardWatcher(), []);

  useEffect(() => {
    initializePushNotifications();

    // Setup foreground notification handler
    setupForegroundNotificationHandler((payload) => {
      // console.log('📬 Notification received:', payload);

      // Dispatch update events for listening components to refresh UI
      window.dispatchEvent(new Event('workerJobsUpdated'));
      window.dispatchEvent(new Event('workerStatsUpdated'));
      window.dispatchEvent(new Event('userBookingsUpdated'));

      // Also dispatch generic one if needed
      window.dispatchEvent(new Event('appNotificationReceived'));

      // REDUNDANT: We now have a rich SwipeableNotification in SocketContext.jsx 
      // which handles all internal socket notifications (emitted by Backend along with Push).
      // Showing a toast here results in "double alerts" for the user.
      /*
      toast(payload.notification?.body || 'New notification', {
        icon: '🔔',
        duration: 2000,
      });
      */
    });
  }, []);

  return (
    <BrowserRouter>
      <ScrollManager />
      <SocketProvider>
        <ConfigProvider>
          <LanguageProvider>
            <CityProvider>
              <ZoneProvider>
              <CartProvider>
                <div className="App w-full max-w-full overflow-x-clip min-h-screen relative">
                  <MaintenanceGate>
                    <AppRoutes />
                    <LocationPermissionChecker />
                  </MaintenanceGate>
                <ToastLimiter limit={1} />
                <Toaster
                  position="top-center"
                  reverseOrder={false}
                  containerStyle={{ zIndex: 100000 }} // above modals (z-[9999]/[1000]) so messages are never hidden behind them
                  toastOptions={{
                    duration: 2000, // Global default (reduced from 3000)
                    style: {
                      background: '#333',
                      color: '#fff',
                      borderRadius: '10px',
                      padding: '12px 20px',
                    },
                    success: {
                      duration: 1000, // 1 second as requested
                      style: {
                        background: '#10B981',
                      },
                    },
                    error: {
                      duration: 2000, // Reduced from 4000
                      style: {
                        background: '#EF4444',
                      },
                    },
                  }}
                />
              </div>
            </CartProvider>
              </ZoneProvider>
          </CityProvider>
          </LanguageProvider>
      </ConfigProvider>
    </SocketProvider>
  </BrowserRouter>
);
}

export default App;
