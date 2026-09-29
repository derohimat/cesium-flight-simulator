import { useEffect, useState } from 'react';
import { reverseGeocoder, type Address } from '../shared/services/reverseGeocode';

/**
 * Street address at (lat, lon), kept fresh as the position changes. Lookups are throttled
 * and cached by the shared geocoder, so passing a position that updates many times per
 * second is fine. Returns null until known, or when no Mapbox token is configured.
 */
export function useAddress(lat: number | null, lon: number | null): Address | null {
  const [address, setAddress] = useState<Address | null>(null);

  useEffect(() => {
    if (lat === null || lon === null || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
    let cancelled = false;
    reverseGeocoder.lookup(lat, lon).then((a) => {
      if (!cancelled) setAddress(a);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  return address;
}
