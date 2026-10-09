import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db } from '../../../../firebase';
import { ref, onValue, off } from 'firebase/database';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GoogleMap, useJsApiLoader, OverlayView, PolylineF } from '@react-google-maps/api';
import { FiArrowLeft, FiNavigation, FiMapPin, FiCrosshair, FiPhone, FiUser, FiStar, FiShield, FiKey, FiCheckCircle, FiLoader, FiDollarSign, FiMaximize, FiMinimize, FiClock } from 'react-icons/fi';
import { bookingService } from '../../../../services/bookingService';
import { paymentService } from '../../../../services/paymentService';
import { toast } from 'react-hot-toast';
import { useAppNotifications } from '../../../../hooks/useAppNotifications';
import LogoLoader from '../../../../components/common/LogoLoader';
import PaymentVerificationModal from '../../components/booking/PaymentVerificationModal';
import { computeRoute, formatDistance, formatDuration } from '../../../../utils/googleRoutes';


const toAssetUrl = (url) => {
  if (!url) return '';
  const clean = url.replace('/api/upload', '/upload');
  if (clean.startsWith('http')) return clean;
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/api$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
};

// Zomato-like Premium Map Style (Silver/Clean)
const mapStyles = [
  { "elementType": "geometry", "stylers": [{ "color": "#f5f5f5" }] },
  { "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] },
  { "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "elementType": "labels.text.stroke", "stylers": [{ "color": "#f5f5f5" }] },
  { "featureType": "administrative.land_parcel", "elementType": "labels.text.fill", "stylers": [{ "color": "#bdbdbd" }] },
  { "featureType": "poi", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "poi", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "poi.park", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "road", "elementType": "geometry", "stylers": [{ "color": "#ffffff" }] },
  { "featureType": "road.arterial", "elementType": "labels.text.fill", "stylers": [{ "color": "#757575" }] },
  { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "color": "#dadada" }] },
  { "featureType": "road.highway", "elementType": "labels.text.fill", "stylers": [{ "color": "#616161" }] },
  { "featureType": "road.local", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] },
  { "featureType": "transit.line", "elementType": "geometry", "stylers": [{ "color": "#e5e5e5" }] },
  { "featureType": "transit.station", "elementType": "geometry", "stylers": [{ "color": "#eeeeee" }] },
  { "featureType": "water", "elementType": "geometry", "stylers": [{ "color": "#c9c9c9" }] },
  { "featureType": "water", "elementType": "labels.text.fill", "stylers": [{ "color": "#9e9e9e" }] }
];

const defaultCenter = { lat: 20.5937, lng: 78.9629 };
const libraries = ['places', 'geometry'];

const BookingTrack = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [coords, setCoords] = useState(null);
  const [map, setMap] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null); // Rider Location
  const [distance, setDistance] = useState('');
  const [duration, setDuration] = useState('');
  const [routePath, setRoutePath] = useState([]);
  const [isAutoCenter, setIsAutoCenter] = useState(true);
  const [isNavigationMode, setIsNavigationMode] = useState(false);

  const [paying, setPaying] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  const handleOnlinePayment = async () => {
    if (paying) return;
    const paymentType = booking.advancePayment?.status === 'requested' ? 'advance' : 'final';

    // If a Razorpay order already exists for this booking, reuse it
    const existingOrderId = paymentType === 'advance'
      ? booking.advancePayment?.razorpayOrderId
      : booking.razorpayOrderId;

    if (existingOrderId) {
      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: Math.round(((paymentType === 'advance'
          ? booking.advancePayment?.requestedAmount
          : (booking.userPayableAmount || booking.finalAmount)) || 0) * 100),
        currency: 'INR',
        order_id: existingOrderId,
        name: 'Appzeto',
        description: `${paymentType === 'advance' ? 'Advance' : 'Final'} payment for ${booking.serviceName}`,
        handler: async function (response) {
          toast.loading('Verifying payment...');
          const verifyResponse = await paymentService.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
          toast.dismiss();
          if (verifyResponse.success) {
            toast.success('Payment successful!');
            navigate(`/user/booking/${booking._id || booking.id}`);
          } else {
            toast.error('Payment verification failed');
          }
          setPaying(false);
        },
        modal: {
          ondismiss: function () {
            setPaying(false);
          }
        },
        prefill: { name: 'User', contact: '' },
        theme: { color: "#0F766E" }
      };
      setPaying(true);
      const razorpay = new window.Razorpay(options);
      razorpay.open();
      return;
    }

    try {
      setPaying(true);
      toast.loading('Creating payment order...');
      const orderResponse = await paymentService.createOrder(booking._id || booking.id, paymentType);
      toast.dismiss();

      if (!orderResponse.success) {
        toast.error(orderResponse.message || 'Failed to create payment order');
        setPaying(false);
        return;
      }

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID,
        amount: orderResponse.data.amount * 100,
        currency: orderResponse.data.currency || 'INR',
        order_id: orderResponse.data.orderId,
        name: 'Appzeto',
        description: `${paymentType === 'advance' ? 'Advance' : 'Final'} payment for ${booking.serviceName}`,
        handler: async function (response) {
          toast.loading('Verifying payment...');
          const verifyResponse = await paymentService.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature
          });
          toast.dismiss();

          if (verifyResponse.success) {
            toast.success('Payment successful!');
            navigate(`/user/booking/${booking._id || booking.id}`);
          } else {
            toast.error('Payment verification failed');
          }
          setPaying(false);
        },
        modal: {
          onhighlight: function () { },
          ondismiss: function () {
            setPaying(false);
          }
        },
        prefill: {
          name: 'User',
          contact: ''
        },
        theme: {
          color: "#0F766E"
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to process payment');
      setPaying(false);
    }
  };

  const handlePayAtHome = async () => {
    try {
      toast.loading('Confirming request...');
      const response = await paymentService.confirmPayAtHome(booking._id || booking.id);
      toast.dismiss();

      if (response.success) {
        toast.success('Booking confirmed!');
        navigate(`/user/booking/${booking._id || booking.id}`);
      } else {
        toast.error(response.message || 'Failed to confirm booking');
      }
    } catch (error) {
      toast.dismiss();
      toast.error('Failed to process request');
    }
  };

  // Track if initial location was set from socket
  const locationFromSocketRef = useRef(false);

  // Main function to fetch booking data - accessible to all effects
  const refreshBooking = React.useCallback(async (isFirstLoad = false) => {
    try {
      const response = await bookingService.getById(id);
      if (response.success) {
        setBooking(response.data);

        // Geocoding and Initial Location Logic
        // Only run this complex logic on first load or if coords/location are missing
        if (isFirstLoad || !coords) {
          const geocoder = new window.google.maps.Geocoder();
          const bAddr = response.data.address || {};

          // 1. Destination
          if (bAddr.lat && bAddr.lng) {
            setCoords({ lat: parseFloat(bAddr.lat), lng: parseFloat(bAddr.lng) });
          } else {
            const addressStr = typeof bAddr === 'string' ? bAddr : `${bAddr.addressLine1 || ''}, ${bAddr.city || ''}, ${bAddr.state || ''} ${bAddr.pincode || ''}`;
            if (addressStr && addressStr.replaceAll(',', '').trim() && !addressStr.toLowerCase().includes('current location')) {
              geocoder.geocode({ address: addressStr }, (results, status) => {
                if (status === 'OK' && results[0]) {
                  setCoords(results[0].geometry.location.toJSON());
                }
              });
            }
          }

          // 2. Source (Provider Location) - ONLY on first load if no socket location received yet
          if (isFirstLoad && !locationFromSocketRef.current) {
            const provider = response.data.assignedTo || response.data.vendorId || {};
            if (provider.location && provider.location.lat && provider.location.lng) {
              setCurrentLocation({ lat: parseFloat(provider.location.lat), lng: parseFloat(provider.location.lng) });
            } else if (response.data.vendorId && provider.address && provider.address.lat && provider.address.lng) {
              // Fallback to worker address
              setCurrentLocation({ lat: parseFloat(provider.address.lat), lng: parseFloat(provider.address.lng) });
            } else {
              // Reset if no location found to avoid wrong location display
              setCurrentLocation(null);
            }
          }
        }
      }
    } catch (error) {
      // Error fetching booking
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  }, [id, coords]);

  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: apiKey,
    libraries
  });

  // Initial Load and Polling
  useEffect(() => {
    if (isLoaded) {
      refreshBooking(true);
      const intervalId = setInterval(() => refreshBooking(false), 10000); // Poll every 10s
      return () => clearInterval(intervalId);
    }
  }, [isLoaded, refreshBooking]);

  const socket = useAppNotifications('user');

  // Socket Listener
  useEffect(() => {
    if (socket && id) {
      socket.emit('join_tracking', id);

      const handleLocationUpdate = (data) => {
        if (data.lat && data.lng) {
          // Mark that we've received location from socket - don't let booking refresh override
          locationFromSocketRef.current = true;
          setCurrentLocation({ lat: parseFloat(data.lat), lng: parseFloat(data.lng) });
          // Use heading from socket if available (more accurate)
          if (data.heading !== undefined && data.heading !== null) {
            setHeading(parseFloat(data.heading));
          }
        }
      };

      const handleBookingUpdate = (data) => {
        if (data.bookingId === id || data.relatedId === id || data.data?.bookingId === id) {
          const mergedBooking = {
            ...(booking || {}),
            ...(data.data || data)
          };

          setBooking(prev => {
            if (!prev) return prev;
            return { ...prev, ...(data.data || data) };
          });

          if (mergedBooking.advancePayment?.status === 'paid') {
            setShowPaymentModal(false);
          } else if (data.advancePayment?.status === 'requested') {
            setShowPaymentModal(true);
            toast.success('Advance payment requested!');
          } else if (data.qrPaymentInitiated) {
            setShowPaymentModal(true);
            toast.success('Professional has initiated payment!');
          } else if (data.customerConfirmationOTP) {
            setShowPaymentModal(true);
            toast.success('Professional has requested payment!');
          }
          refreshBooking(false);
        }
      };

      socket.on('live_location_update', handleLocationUpdate);
      socket.on('booking_updated', handleBookingUpdate);
      socket.on('notification', handleBookingUpdate);

      return () => {
        socket.off('live_location_update', handleLocationUpdate);
        socket.off('booking_updated', handleBookingUpdate);
        socket.off('notification', handleBookingUpdate);
      };
    }
  }, [socket, id]);

  useEffect(() => {
    if (booking?.advancePayment?.status === 'paid') {
      setShowPaymentModal(false);
    }
  }, [booking?.advancePayment?.status]);

  // Firebase Realtime Tracking Listener
  useEffect(() => {
    if (!db || !id) return;

    const trackingRef = ref(db, `trackings/${id}`);
    
    const unsubscribe = onValue(trackingRef, (snapshot) => {
      const data = snapshot.val();
      if (data && data.lat && data.lng) {
        // Firebase is now the primary source for real-time smoothness
        locationFromSocketRef.current = true;
        setCurrentLocation({ 
          lat: parseFloat(data.lat), 
          lng: parseFloat(data.lng) 
        });
        
        if (data.heading !== undefined && data.heading !== null) {
          setHeading(parseFloat(data.heading));
        }
      }
    });

    return () => unsubscribe();
  }, [id]);

  // Animated location for smooth marker movement
  const [animatedLocation, setAnimatedLocation] = useState(null);
  const targetLocationRef = useRef(null);
  const animatedLocationRef = useRef(null);
  const animationFrameRef = useRef(null);

  // Smooth interpolation for marker movement
  useEffect(() => {
    if (!currentLocation) return;

    // Store target location
    targetLocationRef.current = currentLocation;

    // If no animated location yet, set it directly
    if (!animatedLocationRef.current) {
      animatedLocationRef.current = currentLocation;
      setAnimatedLocation(currentLocation);
      return;
    }

    // Animation function using refs to avoid stale closures
    const animateToTarget = () => {
      const target = targetLocationRef.current;
      const current = animatedLocationRef.current;

      if (!target || !current) return;

      // Calculate distance to target
      const latDiff = target.lat - current.lat;
      const lngDiff = target.lng - current.lng;
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

      // If close enough, snap to target
      if (distance < 0.00001) {
        animatedLocationRef.current = target;
        setAnimatedLocation(target);
        return;
      }

      // Lerp factor - lower = smoother but slower
      const lerpFactor = 0.1;

      const newLat = current.lat + latDiff * lerpFactor;
      const newLng = current.lng + lngDiff * lerpFactor;
      const newLocation = { lat: newLat, lng: newLng };

      animatedLocationRef.current = newLocation;
      setAnimatedLocation(newLocation);

      // Continue animation
      animationFrameRef.current = requestAnimationFrame(animateToTarget);
    };

    // Cancel previous animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    // Start new animation
    animationFrameRef.current = requestAnimationFrame(animateToTarget);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [currentLocation]);

  const [heading, setHeading] = useState(0);
  const prevLocationRef = useRef(null);
  const lastRouteOriginRef = useRef(null);

  // Calculate Heading based on movement (Direction Sense)
  useEffect(() => {
    if (isLoaded && currentLocation && window.google) {
      if (prevLocationRef.current) {
        const start = new window.google.maps.LatLng(prevLocationRef.current);
        const end = new window.google.maps.LatLng(currentLocation);
        const distanceMoved = window.google.maps.geometry.spherical.computeDistanceBetween(start, end);

        // Update heading only if movement is significant (> 2 meters) to prevent jitter
        if (distanceMoved > 2) {
          const newHeading = window.google.maps.geometry.spherical.computeHeading(start, end);
          setHeading(newHeading);
        }
      } else if (coords) {
        // Initial heading towards destination
        const start = new window.google.maps.LatLng(currentLocation);
        const end = new window.google.maps.LatLng(coords);
        setHeading(window.google.maps.geometry.spherical.computeHeading(start, end));
      }
      prevLocationRef.current = currentLocation;
    }
  }, [currentLocation, isLoaded, coords]);

  // DISABLED: Auto heading/tilt sync causes map fluctuation
  // The heading is now displayed on the marker only, not on the map itself
  // useEffect(() => {
  //   if (map && currentLocation && heading && isAutoCenter) {
  //     map.setHeading(heading);
  //     map.setTilt(45);
  //   }
  // }, [map, heading, isAutoCenter, currentLocation]);

  // Simulate Rider Location (Since we don't have real rider GPS stream yet for User App)
  // Ideally this would come from a websocket or Firebase subscription
  // Fallback: Set initial position to allow route calculation
  /* 
  // Simulation Removed: Waiting for Real Backend Location Updates
  // Ideally, use a WebSocket or periodic fetch here to update `currentLocation`
  // with the real rider's GPS coordinates.
  */

  // Calculate Route ONCE on initial load only
  const initialBoundsSetRef = useRef(false);
  const directionsCalculatedRef = useRef(false);

  const fullRoutePathRef = useRef([]);

  useEffect(() => {
    // Only calculate directions ONCE when we have all required data
    if (isLoaded && currentLocation && coords && map && !directionsCalculatedRef.current) {
      directionsCalculatedRef.current = true; // Prevent recalculation

      computeRoute(currentLocation, coords)
        .then(({ distanceMeters, durationSeconds, path }) => {
          setDistance(formatDistance(distanceMeters));
          setDuration(formatDuration(durationSeconds));

          // Store full path and set initial state
          fullRoutePathRef.current = path;
          setRoutePath(path);

          // Center on rider
          map.setCenter(currentLocation);
          map.setZoom(15);
        })
        .catch((error) => {
          console.error('[BookingTrack] Route calculation failed:', error);
          directionsCalculatedRef.current = false;
        });
    }
  }, [isLoaded, coords, map, currentLocation]);

  // Update distance, ETA, and Clear Traveled Path as rider moves
  useEffect(() => {
    if (isLoaded && currentLocation && coords && window.google && directionsCalculatedRef.current) {
      // 1. Calculate straight-line distance & ETA
      const riderPoint = new window.google.maps.LatLng(currentLocation);
      const destPoint = new window.google.maps.LatLng(coords);
      const distanceMeters = window.google.maps.geometry.spherical.computeDistanceBetween(riderPoint, destPoint);

      // Convert to km
      const distanceKm = distanceMeters / 1000;

      // Format distance
      if (distanceKm < 1) {
        setDistance(`${Math.round(distanceMeters)} m`);
      } else {
        setDistance(`${distanceKm.toFixed(1)} km`);
      }

      // Estimate time (assuming average speed of 30 km/h in city)
      const avgSpeedKmh = 30;
      const timeHours = distanceKm / avgSpeedKmh;
      const timeMinutes = Math.round(timeHours * 60);

      if (timeMinutes < 1) {
        setDuration('< 1 min');
      } else if (timeMinutes < 60) {
        setDuration(`${timeMinutes} min`);
      } else {
        const hours = Math.floor(timeMinutes / 60);
        const mins = timeMinutes % 60;
        setDuration(`${hours} hr ${mins} min`);
      }

      // 2. Clear Traveled Path Visualization
      if (fullRoutePathRef.current && fullRoutePathRef.current.length > 0) {
        // Find the closest point on the original path to the current rider location
        let closestIndex = -1;
        let minDist = Infinity;

        // Optimization: Only check a reasonable window if path is huge, but full check is safer for loops
        fullRoutePathRef.current.forEach((p, idx) => {
          const d = window.google.maps.geometry.spherical.computeDistanceBetween(riderPoint, p);
          if (d < minDist) {
            minDist = d;
            closestIndex = idx;
          }
        });

        // If we found a close point, update the path to start from CURRENT location, 
        // then continue from the NEXT point in the original path.
        if (closestIndex !== -1) {
          // We splice the array to remove points "behind"
          // We start drawing from the current rider position explicitly to avoid a gap
          const remaining = fullRoutePathRef.current.slice(closestIndex + 1);
          setRoutePath([currentLocation, ...remaining]);
        }
      }
    }
  }, [currentLocation, coords, isLoaded]);

  const mapOptions = useMemo(() => ({
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeId: 'roadmap',
    gestureHandling: 'greedy',
    rotateControl: true,
    tiltControl: true,
    isFractionalZoomEnabled: true,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    mapId: '8e0a97af9386fefc',
  }), []);

  // Memoize Map Markers to prevent flickering/blinking
  const destinationMarker = useMemo(() => coords && (
    <OverlayView
      position={coords}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div className="relative -translate-x-1/2 -translate-y-[90%] pointer-events-none flex flex-col items-center">
        <FiMapPin className="w-10 h-10 text-red-600 drop-shadow-xl fill-red-600 stroke-white stroke-[1.5px]" />
        <div className="w-3 h-1 bg-black/20 rounded-full blur-[2px] mt-[-2px]"></div>
      </div>
    </OverlayView>
  ), [coords]);

  const riderMarker = useMemo(() => animatedLocation && (
    <OverlayView
      position={animatedLocation}
      mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
    >
      <div
        style={{
          position: 'absolute',
          transform: 'translate(-50%, -50%)',
          cursor: 'pointer'
        }}
        className="pointer-events-none"
      >
        <div
          className="relative z-20 w-16 h-16"
          style={{
            transform: `rotate(${heading}deg)`,
            transition: 'transform 0.3s ease-out'
          }}
        >
          <img
            src="/MapRider.png"
            alt="Rider"
            className="w-full h-full object-contain drop-shadow-xl rounded-full"
          />
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-24 h-24 bg-teal-500/30 rounded-full animate-ping z-10 pointer-events-none"></div>
        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-12 h-3 bg-black/20 blur-sm rounded-full z-0"></div>
      </div>
    </OverlayView>
  ), [animatedLocation, heading]);

  if (!isLoaded || loading || !booking) return <LogoLoader />;

  // Determine active provider based on priority: Assigned -> Worker
  const provider = booking?.assignedTo || booking?.vendorId || {};

  return (
    <div className="h-screen flex flex-col relative bg-white overflow-hidden">
      {/* Top Floating Header */}
      {/* Top Floating Header - Always Visible */}
      <div className="absolute top-4 left-4 right-4 z-20 flex justify-between items-start pointer-events-none">
        <button
          onClick={() => navigate(`/user/booking/${id}`)}
          className="pointer-events-auto bg-white/90 backdrop-blur-md p-3 rounded-full shadow-lg text-gray-700 hover:bg-white transition-all active:scale-95"
        >
          <FiArrowLeft className="w-6 h-6" />
        </button>
      </div>

      {/* Full Screen Stats Card */}
      <AnimatePresence>
        {isFullScreen && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-6 left-0 right-0 z-10 flex justify-center pointer-events-none"
          >
            <div className="pointer-events-auto bg-white/95 backdrop-blur-xl px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-6 border border-white/20 ring-1 ring-black/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-teal-50 flex items-center justify-center">
                  <FiMapPin className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Remaining</p>
                  <p className="text-sm font-black text-gray-800">{distance}</p>
                </div>
              </div>

              <div className="w-px h-8 bg-gray-100"></div>

              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center">
                  <FiClock className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">ETA</p>
                  <p className="text-sm font-black text-gray-800">{duration}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 w-full h-full">
        <GoogleMap
          mapContainerStyle={{ width: '100%', height: '100%' }}
          defaultCenter={defaultCenter}
          defaultZoom={14}
          onLoad={map => setMap(map)}
          onDragStart={() => setIsAutoCenter(false)}
          onZoomChanged={() => {
            // Only disable if it's a programmatic zoom check is complicated, 
            // but usually we want to stop auto-centering if user zooms.
            // However, fitBounds triggers zoom changed. So we check user interaction.
          }}
          options={mapOptions}
          onHeadingChanged={() => {
            if (map && isAutoCenter) {
              const h = map.getHeading();
              if (Math.abs(h - heading) > 10) {
                // User manually rotated more than 10 degrees
                setIsAutoCenter(false);
              }
            }
          }}
          onTiltChanged={() => {
            if (map && isAutoCenter) {
              const t = map.getTilt();
              if (t !== 45 && t !== 0) {
                setIsAutoCenter(false);
              }
            }
          }}
        >
          {currentLocation ? (
            <>
              {routePath && routePath.length > 0 && (
                <PolylineF
                  path={routePath}
                  options={{
                    strokeColor: "#0F766E",
                    strokeWeight: 8,
                    strokeOpacity: 1,
                    zIndex: 50
                  }}
                />
              )}
              {riderMarker}
            </>
          ) : (
            // Fallback when rider location is not yet available
            <OverlayView
              position={coords || defaultCenter}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            >
              <div className="absolute top-0 left-0 -translate-x-1/2 -translate-y-1/2 w-64 flex flex-col items-center">
                <div className="bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-teal-100 flex items-center gap-3 animate-bounce-slow">
                  <div className="w-3 h-3 bg-teal-500 rounded-full animate-ping"></div>
                  <span className="text-xs font-bold text-gray-700">Waiting for rider location...</span>
                </div>
              </div>
            </OverlayView>
          )}

          {destinationMarker}
        </GoogleMap>



        {/* Full Screen Toggle */}
        <button
          onClick={() => setIsFullScreen(!isFullScreen)}
          className="absolute top-24 right-4 p-4 rounded-full shadow-2xl transition-all active:scale-90 z-20 bg-white text-gray-700 hover:bg-gray-50"
          style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
        >
          {isFullScreen ? <FiMinimize className="w-6 h-6" /> : <FiMaximize className="w-6 h-6" />}
        </button>

        {/* Recenter Button */}
        <button
          onClick={() => {
            setIsAutoCenter(true);
            if (map && currentLocation) {
              map.panTo(currentLocation);
              map.setZoom(16);
            }
          }}
          className={`absolute top-40 right-4 p-4 rounded-full shadow-2xl transition-all active:scale-90 z-20 ${isAutoCenter ? 'bg-teal-600 text-white animate-pulse' : 'bg-white text-gray-700'}`}
          style={{ boxShadow: '0 8px 30px rgba(0,0,0,0.2)' }}
        >
          <FiCrosshair className="w-6 h-6" />
        </button>

        {/* Recenter Button */}

      </div>

      {/* Bottom Status Card */}
      <div className={`absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(0,0,0,0.12)] z-20 p-6 pb-8 transition-transform duration-300 ${isFullScreen ? 'translate-y-full' : ''}`}>
        <div className="w-12 h-1.5 bg-gray-200 rounded-full mx-auto mb-6"></div>

        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm font-medium text-teal-600 mb-1 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse"></span>
              {duration ? `Arriving in ${duration}` : 'Calculating time...'}
            </p>
            <h2 className="text-2xl font-black text-gray-900 tracking-tight">On the way</h2>
          </div>
          {distance && (
            <div className="text-right">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-wider">Distance</p>
              <p className="text-xl font-bold text-gray-800">
                {distance}
              </p>
            </div>
          )}
        </div>

        {/* Address Info */}
        <div className="bg-gray-50 rounded-2xl p-4 flex items-start gap-4 mb-4 border border-gray-100">
          <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-md text-teal-600 border border-gray-100 shrink-0">
            <FiMapPin className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 mb-0.5">Your Location</h3>
            <p className="text-sm text-gray-500 line-clamp-2 leading-relaxed">
              {(() => {
                const addr = booking?.address;
                if (!addr) return 'Loading destination...';
                if (typeof addr === 'string') return addr;
                return `${addr.addressLine1 || ''}, ${addr.city || ''} ${addr.pincode || ''}`;
              })()}
            </p>
          </div>
        </div>

        {/* Arrival OTP - New Premium Display */}
        {(booking?.visitOtp || booking?.arrivalOTP) && ['confirmed', 'assigned', 'journey_started'].includes(booking?.status?.toLowerCase()) && (
          <div className="mb-3 relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 p-3 shadow-lg">
            <div className="absolute top-0 right-0 w-20 h-20 bg-white/10 rounded-full -translate-y-10 translate-x-10 blur-xl"></div>
            <div className="relative z-10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 shrink-0">
                  <FiKey className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-blue-100 uppercase tracking-wider">Start Code</p>
                  <p className="text-2xl font-black text-white tracking-[0.2em] leading-none mt-0.5">
                    {booking?.visitOtp || booking?.arrivalOTP}
                  </p>
                </div>
              </div>

              <div className="bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 flex flex-col items-center justify-center min-w-[100px]">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.5)] mb-1"></div>
                <p className="text-[9px] text-blue-50 font-medium text-center leading-tight">Waiting for<br />arrival</p>
              </div>
            </div>
          </div>
        )}

        {/* Professional Arrived Notification */}
        {booking?.status?.toLowerCase() === 'visited' && !(booking.arrivalOTP || booking.visitOtp) && (
          <div className="mb-4 relative overflow-hidden rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-700 p-4 shadow-lg flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 shrink-0">
              <FiCheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">Professional Arrived</h3>
              <p className="text-[10px] text-teal-50">Expert is starting the work now.</p>
            </div>
          </div>
        )}

        {/* Waiting for Worker to initiate Payment */}
        {!booking?.customerConfirmationOTP && booking?.status?.toLowerCase() === 'work_done' && !booking?.cashCollected && (
          <div className="bg-white rounded-2xl p-4 shadow-lg border border-teal-100 mb-4 flex items-center gap-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-20 h-20 bg-teal-50 rounded-full -translate-y-10 translate-x-10 blur-2xl"></div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center shrink-0 border border-teal-100">
              <FiLoader className="w-5 h-5 text-teal-600 animate-spin" />
            </div>
            <div className="relative z-10">
              <h3 className="font-bold text-gray-900 text-sm">Finalizing Bill</h3>
              <p className="text-[10px] text-gray-500">Professional is finalizing payment details. Please wait...</p>
            </div>
          </div>
        )}

        {/* Final Payment Card - Show when work is done AND bill is finalized (OTP exists) */}
        {(booking?.customerConfirmationOTP || booking?.paymentStatus === 'success') && booking?.status?.toLowerCase() === 'work_done' && !booking?.cashCollected && (
          <div
            onClick={() => setShowPaymentModal(true)}
            className={`mb-4 relative overflow-hidden rounded-2xl p-5 shadow-lg cursor-pointer active:scale-[0.98] transition-all ${booking?.paymentStatus === 'success'
              ? 'bg-gradient-to-br from-green-500 via-green-600 to-emerald-700'
              : 'bg-gradient-to-br from-orange-500 via-orange-600 to-red-600'
              }`}>
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-16 translate-x-16 blur-2xl"></div>
            <div className="relative z-10 flex flex-col items-center">
              <div className="flex items-center gap-3 w-full mb-5">
                <div className="w-10 h-10 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
                  {booking?.paymentStatus === 'success' ? (
                    <FiCheckCircle className="w-5 h-5 text-white" />
                  ) : (
                    <FiDollarSign className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest">
                    {booking?.paymentStatus === 'success' ? 'Payment Received' : 'Final Payment'}
                  </p>
                  <p className="text-white text-xs font-medium">
                    {booking?.paymentStatus === 'success' ? 'Verified Successfully' : `Service amount: ₹${(booking?.finalAmount || 0).toLocaleString()}`}
                  </p>
                </div>
              </div>

              {booking?.paymentStatus !== 'success' ? (
                <>
                  <button
                    onClick={handleOnlinePayment}
                    className="w-full py-4 bg-white text-orange-600 rounded-xl font-black text-sm shadow-xl hover:bg-orange-50 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <FiDollarSign className="w-4 h-4" />
                    Pay Online Now
                  </button>

                  <div className="mt-6 flex flex-col items-center w-full">
                    <p className="text-[9px] font-black text-white/60 uppercase tracking-[0.3em] mb-3">Payment Verification OTP</p>
                    <div className="flex justify-center gap-2.5">
                      {String(booking?.customerConfirmationOTP || booking?.paymentOtp || '0000').split('').map((digit, idx) => (
                        <div
                          key={idx}
                          className="w-10 h-12 bg-white/15 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20 shadow-md"
                        >
                          <span className="text-xl font-black text-white">{digit}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-4 text-[9px] text-white/70 text-center font-medium bg-black/10 px-4 py-1.5 rounded-full">
                      Share with professional to confirm cash payment
                    </p>
                  </div>
                </>
              ) : (
                <div className="w-full py-4 bg-white/10 backdrop-blur-md text-white rounded-xl font-bold text-sm border border-white/20 flex items-center justify-center gap-2">
                  <FiCheckCircle className="w-4 h-4 text-green-200" />
                  Booking Completed
                </div>
              )}

              {booking?.paymentStatus !== 'success' && (
                <p className="mt-4 text-[10px] text-white/70 text-center font-medium">
                  Professional will mark as completed after cash collection.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Agent Info */}
        {(provider?._id || provider?.id) && (
          <div className="bg-gray-50 rounded-2xl p-4 flex items-center gap-4 mb-4 border border-gray-100">
            <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center border-2 border-white shadow-md overflow-hidden relative shrink-0">
              {(provider.profileImage || provider.profilePhoto) ? (
                <>
                  <img
                    src={toAssetUrl(provider.profileImage || provider.profilePhoto)}
                    alt="Agent"
                    className="w-full h-full object-cover"
                    onError={(e) => { e.target.style.display = 'none'; e.target.parentElement.querySelector('.fallback-icon').style.display = 'block'; }}
                  />
                  <FiUser className="w-7 h-7 text-gray-400 fallback-icon hidden absolute" />
                </>
              ) : (
                <FiUser className="w-7 h-7 text-gray-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-gray-900 line-clamp-1 text-lg">
                {provider.name || 'Service Partner'}
              </h3>
              <div className="flex items-center gap-1 text-yellow-500">
                <FiStar className="w-3.5 h-3.5 fill-current" />
                <span className="text-sm font-bold text-gray-700">4.8</span>
                <span className="text-xs text-gray-400">• Verified Professional</span>
              </div>
            </div>

            {/* Call Button */}
            {provider.phone && (
              <a
                href={`tel:${provider.phone}`}
                className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center active:scale-90 transition-transform shadow-sm"
              >
                <FiPhone className="w-5 h-5" />
              </a>
            )}
          </div>
        )}
      </div>


      <PaymentVerificationModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        booking={booking}
        onPayOnline={handleOnlinePayment}
      />
    </div>
  );
};

export default BookingTrack;
