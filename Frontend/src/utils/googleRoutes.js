/**
 * Route calculation via the Google Routes API with DirectionsService fallback.
 *
 * Primary: Google Routes API (Directions v2)
 * Fallback: Legacy google.maps.DirectionsService (if available)
 *
 * Decodes the polyline into LatLng points using google.maps.geometry.encoding
 * or a built-in pure JS polyline decoder if the library is not yet initialized.
 */

const ROUTES_ENDPOINT = 'https://routes.googleapis.com/directions/v2:computeRoutes';

/**
 * Pure JS polyline decoder (Google polyline algorithm)
 */
export const decodePolyline = (encoded) => {
  if (!encoded) return [];
  const points = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
};

const toLatLngLiteral = (point) => ({
  latitude: typeof point.lat === 'function' ? point.lat() : Number(point.lat),
  longitude: typeof point.lng === 'function' ? point.lng() : Number(point.lng)
});

/**
 * @param {{lat:number, lng:number}} origin
 * @param {{lat:number, lng:number}} destination
 * @returns {Promise<{distanceMeters:number, durationSeconds:number, path:Array}>}
 * @throws {Error} when the route cannot be calculated
 */
export const computeRoute = async (origin, destination) => {
  if (!origin || !destination) {
    throw new Error('Origin and destination are required');
  }

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  // 1. Try Google Routes API v2
  if (apiKey) {
    try {
      const response = await fetch(ROUTES_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
        },
        body: JSON.stringify({
          origin: { location: { latLng: toLatLngLiteral(origin) } },
          destination: { location: { latLng: toLatLngLiteral(destination) } },
          travelMode: 'DRIVE',
          routingPreference: 'TRAFFIC_AWARE'
        })
      });

      if (response.ok) {
        const data = await response.json();
        const route = data.routes?.[0];
        if (route) {
          const encoded = route.polyline?.encodedPolyline;
          let path = [];
          if (encoded) {
            if (window.google?.maps?.geometry?.encoding?.decodePath) {
              path = window.google.maps.geometry.encoding.decodePath(encoded);
            } else {
              path = decodePolyline(encoded);
            }
          }

          // Parse duration string e.g. "120s" or number
          const durationSec = typeof route.duration === 'string'
            ? parseInt(route.duration.replace('s', ''), 10) || 0
            : Number(route.duration) || 0;

          return {
            distanceMeters: route.distanceMeters || 0,
            durationSeconds: durationSec,
            path
          };
        }
      }
    } catch (err) {
      console.warn('[computeRoute] Routes API request failed, trying DirectionsService fallback...', err);
    }
  }

  // 2. Fallback to window.google.maps.DirectionsService
  if (window.google?.maps?.DirectionsService) {
    return new Promise((resolve, reject) => {
      try {
        const directionsService = new window.google.maps.DirectionsService();
        const originLatLng = new window.google.maps.LatLng(
          typeof origin.lat === 'function' ? origin.lat() : origin.lat,
          typeof origin.lng === 'function' ? origin.lng() : origin.lng
        );
        const destLatLng = new window.google.maps.LatLng(
          typeof destination.lat === 'function' ? destination.lat() : destination.lat,
          typeof destination.lng === 'function' ? destination.lng() : destination.lng
        );

        directionsService.route(
          {
            origin: originLatLng,
            destination: destLatLng,
            travelMode: window.google.maps.TravelMode.DRIVING
          },
          (result, status) => {
            if (status === window.google.maps.DirectionsStatus.OK && result?.routes?.[0]) {
              const leg = result.routes[0].legs[0];
              resolve({
                distanceMeters: leg.distance?.value || 0,
                durationSeconds: leg.duration?.value || 0,
                path: result.routes[0].overview_path || []
              });
            } else {
              reject(new Error(status || 'NO_ROUTE'));
            }
          }
        );
      } catch (directionsErr) {
        reject(directionsErr);
      }
    });
  }

  throw new Error('NO_ROUTE');
};

/** Formats metres the same way the legacy DirectionsService did. */
export const formatDistance = (meters) => {
  if (!meters || isNaN(meters)) return '';
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
};

/** Formats seconds the same way the legacy DirectionsService did. */
export const formatDuration = (seconds) => {
  if (!seconds || isNaN(seconds)) return '';
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;
};
