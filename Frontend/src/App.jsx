import React, { useEffect } from 'react'; // Updated index to .jsx
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import AppRoutes from './routes';
import { SocketProvider } from './context/SocketContext';
import { ConfigProvider } from './context/ConfigContext';
import { CartProvider } from './context/CartContext';
import { CityProvider } from './context/CityContext';
import { initializePushNotifications, setupForegroundNotificationHandler } from './services/pushNotificationService';
import { LocationPermissionChecker, MaintenanceGate } from './components/common';

function App() {
  // Initialize push notifications on app load
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
      <SocketProvider>
        <ConfigProvider>
          <CityProvider>
            <CartProvider>
              <div className="App">
                <MaintenanceGate>
                  <AppRoutes />
                  <LocationPermissionChecker />
                </MaintenanceGate>
              <Toaster
                position="top-center"
                reverseOrder={false}
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
        </CityProvider>
      </ConfigProvider>
    </SocketProvider>
  </BrowserRouter>
);
}

export default App;
