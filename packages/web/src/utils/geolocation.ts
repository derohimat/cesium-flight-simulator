export interface UserCoordinates {
  lng: number;
  lat: number;
  accuracy?: number;
}

export const DEFAULT_FALLBACK_LOCATION: UserCoordinates = {
  lng: 11.9746,
  lat: 57.7089,
};

const GEOLOCATION_STORAGE_KEY = 'cesium_last_known_user_location';

/**
 * Returns the synchronously cached user coordinates from a previous session, if available.
 */
export function getCachedUserLocation(): UserCoordinates | null {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null;
  }
  try {
    const raw = localStorage.getItem(GEOLOCATION_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to read cached user location:', err);
  }
  return null;
}

/**
 * Query user's current GPS location via HTML5 Geolocation API.
 * Uses cached location or default fallback if permission is denied, unavailable, or times out.
 */
export async function getUserLocation(timeoutMs: number = 4000): Promise<UserCoordinates> {
  const cached = getCachedUserLocation();

  if (typeof window === 'undefined' || !navigator.geolocation) {
    return cached || DEFAULT_FALLBACK_LOCATION;
  }

  return new Promise<UserCoordinates>((resolve) => {
    let resolved = false;

    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        console.log('⏱️ Geolocation request timed out, using fallback/cached location');
        resolve(cached || DEFAULT_FALLBACK_LOCATION);
      }
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          const coords: UserCoordinates = {
            lng: pos.coords.longitude,
            lat: pos.coords.latitude,
            accuracy: pos.coords.accuracy,
          };
          console.log(
            `📍 Acquired user current location: lat=${coords.lat.toFixed(4)}, lon=${coords.lng.toFixed(4)} (±${Math.round(
              coords.accuracy ?? 0
            )}m)`
          );
          try {
            localStorage.setItem(GEOLOCATION_STORAGE_KEY, JSON.stringify(coords));
          } catch {
            // Ignore quota or storage errors
          }
          resolve(coords);
        }
      },
      (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          console.warn(
            `⚠️ Geolocation unavailable or denied (${error.code}: ${error.message}), falling back to ${
              cached ? 'cached' : 'default'
            } location`
          );
          resolve(cached || DEFAULT_FALLBACK_LOCATION);
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 300000, // Accept cached positions up to 5 minutes old
      }
    );
  });
}
