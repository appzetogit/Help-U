import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

const ZoneContext = createContext();

export const useZone = () => useContext(ZoneContext);

export const ZoneProvider = ({ children }) => {
  const [currentZone, setCurrentZone] = useState(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneError, setZoneError] = useState(null);
  const [isOutOfZone, setIsOutOfZone] = useState(false);
  const [userCoords, setUserCoords] = useState(null);
  // Admin-edited content of the "outside our service area" page, and who to contact
  const [outOfZonePage, setOutOfZonePage] = useState(null);
  const [outOfZoneSupport, setOutOfZoneSupport] = useState(null);
  const lastLookupRef = useRef(null);

  const detectZone = useCallback(async (lat, lng) => {
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;

    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    if (lastLookupRef.current === key) return;
    lastLookupRef.current = key;

    try {
      setZoneLoading(true);
      setZoneError(null);
      setUserCoords({ lat, lng });

      const res = await api.get(`/public/zones/lookup?lat=${lat}&lng=${lng}`);

      if (res.data?.success) {
        if (res.data.zone) {
          setCurrentZone(res.data.zone);
          setIsOutOfZone(false);
          try { localStorage.setItem('detectedZoneId', res.data.zone.id || res.data.zone._id); } catch {}
        } else {
          setCurrentZone(null);
          // Only out of area when zones actually exist; no zones configured = no gating
          const outOfArea = res.data.zonesConfigured !== false;
          setIsOutOfZone(outOfArea);
          if (outOfArea) {
            if (res.data.outOfZonePage) setOutOfZonePage(res.data.outOfZonePage);
            // Support contact details come with the page endpoint
            api.get('/public/zones/out-of-zone-page').then((r) => {
              if (r.data?.success) {
                setOutOfZonePage(r.data.outOfZonePage);
                setOutOfZoneSupport(r.data.support || null);
              }
            }).catch(() => {});
          }
          try { localStorage.removeItem('detectedZoneId'); } catch {}
        }
      }
    } catch (err) {
      console.error('Zone detection failed:', err);
      setZoneError('Could not detect your zone');
      setCurrentZone(null);
      setIsOutOfZone(false);
    } finally {
      setZoneLoading(false);
    }
  }, []);

  const detectFromBrowser = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => detectZone(pos.coords.latitude, pos.coords.longitude),
      () => {},
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, [detectZone]);

  useEffect(() => {
    // 1. Check for previously saved coordinates for instant zone resolution
    try {
      const cached = localStorage.getItem('userCoords');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
          detectZone(parsed.lat, parsed.lng);
          return;
        }
      }
    } catch {}

    // 2. Otherwise detect from browser geolocation
    detectFromBrowser();
  }, [detectZone, detectFromBrowser]);

  const clearZone = useCallback(() => {
    setCurrentZone(null);
    setIsOutOfZone(false);
    setUserCoords(null);
    lastLookupRef.current = null;
    try { localStorage.removeItem('detectedZoneId'); } catch {}
  }, []);

  const zoneId = currentZone?.id || currentZone?._id || null;

  const value = {
    currentZone,
    zoneId,
    zoneLoading,
    zoneError,
    isOutOfZone,
    outOfZonePage,
    outOfZoneSupport,
    // The backend refused a booking as outside every zone (the app's own check can lag behind)
    markOutOfZone: (page) => {
      setIsOutOfZone(true);
      if (page) setOutOfZonePage(page);
    },
    userCoords,
    detectZone,
    detectFromBrowser,
    clearZone,
    allowedCategories: currentZone?.allowedCategories || [],
  };

  return (
    <ZoneContext.Provider value={value}>
      {children}
    </ZoneContext.Provider>
  );
};
