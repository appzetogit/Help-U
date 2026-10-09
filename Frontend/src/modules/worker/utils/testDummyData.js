/**
 * Test Helper for Worker Dummy Data
 * 
 * Usage in Browser Console:
 * - window.initWorkerData() - Clear and reinitialize all data
 * - window.checkWorkerData() - Check what data exists
 * 
 * Note: Data automatically initializes when you visit /worker/dashboard
 * if localStorage is empty.
 */

// Make it available globally for testing
if (typeof window !== 'undefined') {
  // Clear and reinitialize all worker data
  window.initWorkerData = async () => {
    // Clear existing data
    localStorage.removeItem('workerProfile');
    localStorage.removeItem('workerStats');
    localStorage.removeItem('workerAcceptedBookings');
    localStorage.removeItem('workerPendingJobs');
    localStorage.removeItem('workerWallet');
    localStorage.removeItem('workerTransactions');
    localStorage.removeItem('vendorEarnings');
    localStorage.removeItem('workerEarningsHistory');
    localStorage.removeItem('workerNotifications');
    localStorage.removeItem('workerSettings');
    localStorage.removeItem('workerBankAccount');
    localStorage.removeItem('workerWithdrawals');

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 100));

    // Import and initialize
    const { initWorkerDummyData } = await import('./initDummyData');
    initWorkerDummyData();

    // Reload page after a delay
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Check worker data in localStorage
  window.checkWorkerData = () => {
    return {
      profile: localStorage.getItem('workerProfile'),
      stats: localStorage.getItem('workerStats'),
      bookings: localStorage.getItem('workerAcceptedBookings'),
      pending: localStorage.getItem('workerPendingJobs'),
      wallet: localStorage.getItem('workerWallet'),
      transactions: localStorage.getItem('workerTransactions'),
      earnings: localStorage.getItem('vendorEarnings'),
      notifications: localStorage.getItem('workerNotifications'),
    };
  };
}

