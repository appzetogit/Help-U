import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { acceptBooking, rejectBooking } from '../../services/bookingService';
import BookingAlertModal from '../../components/bookings/BookingAlertModal';
import { toast } from 'react-hot-toast';
import { useSocket } from '../../../../context/SocketContext'; // Import socket context

const BookingAlert = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const socket = useSocket(); // Use shared socket
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);

  const [maxSearchTime, setMaxSearchTime] = useState(5);

  useEffect(() => {
    const loadBooking = async () => {
      try {
        const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
        let foundBooking = pendingJobs.find(job => String(job.id || job._id) === String(id));

        if (!foundBooking) {
          // If not found in any local lists, it's likely already processed
          // Redirect to dashboard instead of showing fallback alert
          navigate('/worker/dashboard', { replace: true });
          return;
        }
        setBooking(foundBooking);

        // Also fetch config for accurate timer
        const { workerDashboardService } = await import('../../services/dashboardService');
        const response = await workerDashboardService.getDashboardStats();
        if (response.success && response.data.config) {
          setMaxSearchTime(response.data.config.maxSearchTime || 5);
        }
      } catch (error) {
        console.error('Error loading booking:', error);
        navigate('/worker/dashboard', { replace: true });
      } finally {
        setLoading(false);
      }
    };

    loadBooking();
  }, [id, navigate]);

  // Listen for booking_taken event specifically for this booking
  useEffect(() => {
    if (!socket) return;

    const handleBookingTaken = (data) => {
      if (String(data.bookingId) === String(id)) {
        toast.error('This booking was just accepted by another worker.', { icon: '⚡' });
        navigate('/worker/dashboard', { replace: true }); // Close modal immediately
      }
    };

    socket.on('booking_taken', handleBookingTaken);

    return () => {
      socket.off('booking_taken', handleBookingTaken);
    };
  }, [socket, id, navigate]);

  const handleAccept = async () => {
    try {
      await acceptBooking(id);

      // Update local storage states
      const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
      const updatedPending = pendingJobs.filter(job => job.id !== id);
      localStorage.setItem('workerPendingJobs', JSON.stringify(updatedPending));

      window.dispatchEvent(new Event('workerJobsUpdated'));
      toast.success('Booking accepted & assigned to you!');
      navigate('/worker/dashboard', { replace: true });
    } catch (error) {
      console.error('Error accepting:', error);
      toast.error('Failed to accept booking. It may have expired.');
      navigate('/worker/dashboard', { replace: true });
    }
  };

  const handleReject = async () => {
    try {
      await rejectBooking(id, 'Worker rejected');

      const pendingJobs = JSON.parse(localStorage.getItem('workerPendingJobs') || '[]');
      const updated = pendingJobs.filter(job => job.id !== id);
      localStorage.setItem('workerPendingJobs', JSON.stringify(updated));

      window.dispatchEvent(new Event('workerJobsUpdated'));
      navigate('/worker/dashboard', { replace: true });
    } catch (error) {
      console.error('Error rejecting:', error);
      navigate('/worker/dashboard', { replace: true });
    }
  };

  if (loading) return null;

  return (
    <BookingAlertModal
      isOpen={true}
      booking={booking}
      onAccept={handleAccept}
      onReject={handleReject}
      onMinimize={() => navigate('/worker/dashboard', { replace: true })}
      maxSearchTimeMins={maxSearchTime}
    />
  );
};

export default BookingAlert;



