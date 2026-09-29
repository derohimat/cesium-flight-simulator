import { getTokens } from '../../../utils/tokenValidator';

export interface Address {
  /** Full label, e.g. "Kungsgatan 12, 411 19 Göteborg, Sweden". */
  full: string;
  /** Compact label for HUDs, e.g. "Kungsgatan 12, Göteborg". */
  short: string;
}

/** Re-query only after moving this far from the last lookup. */
const MIN_MOVE_METERS = 300;
/** And no more often than this. */
const MIN_INTERVAL_MS = 4000;
const CACHE_DECIMALS = 3; // ≈ 100 m cells
const MAX_CACHE = 500;

type MapboxFeature = { place_name: string; text: string; address?: string; place_type: string[] };
type Fetcher = (url: string) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const x = (lon2 - lon1) * rad * Math.cos(((lat1 + lat2) / 2) * rad);
  const y = (lat2 - lat1) * rad;
  return Math.sqrt(x * x + y * y) * 6371008.8;
}

/** Build labels from Mapbox's response: features run most → least specific. */
export function parseMapboxReverse(body: unknown): Address | null {
  const features = (body as { features?: MapboxFeature[] })?.features;
  if (!features?.length) return null;
  const top = features[0];
  const street = top.place_type.includes('address') && top.address ? `${top.text} ${top.address}` : top.text;
  const place = features.find((f) => f.place_type.includes('place') || f.place_type.includes('locality'));
  const country = features.find((f) => f.place_type.includes('country'));
  const locality = place && place !== top ? place.text : country && country !== top ? country.text : null;
  return {
    full: top.place_name,
    short: locality ? `${street}, ${locality}` : street,
  };
}

/**
 * Throttled, cached reverse geocoding ("what address is below me?") via Mapbox, the same
 * service the app already uses for search. Callers can ask every frame; it only hits the
 * network after meaningful movement, at most every few seconds, one request at a time.
 */
export class ReverseGeocoder {
  private cache = new Map<string, Address | null>();
  private last: { lat: number; lon: number; at: number } | null = null;
  private inFlight = false;
  private current: Address | null = null;

  constructor(
    private token: () => string = () => getTokens().mapbox,
    private fetcher: Fetcher = (url) => fetch(url),
    private now: () => number = () => Date.now()
  ) {}

  public isAvailable(): boolean {
    return !!this.token();
  }

  /** Latest known address near (lat, lon); starts a lookup when due. */
  public async lookup(lat: number, lon: number): Promise<Address | null> {
    const key = `${lat.toFixed(CACHE_DECIMALS)},${lon.toFixed(CACHE_DECIMALS)}`;
    if (this.cache.has(key)) {
      this.current = this.cache.get(key) ?? null;
      return this.current;
    }
    if (!this.isAvailable() || this.inFlight) return this.current;

    const t = this.now();
    if (this.last) {
      const moved = distanceMeters(this.last.lat, this.last.lon, lat, lon);
      if (moved < MIN_MOVE_METERS || t - this.last.at < MIN_INTERVAL_MS) return this.current;
    }

    this.inFlight = true;
    this.last = { lat, lon, at: t };
    try {
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon.toFixed(5)},${lat.toFixed(5)}.json` +
        `?access_token=${encodeURIComponent(this.token())}`;
      const response = await this.fetcher(url);
      const address = response.ok ? parseMapboxReverse(await response.json()) : null;
      if (this.cache.size >= MAX_CACHE) this.cache.clear();
      this.cache.set(key, address);
      this.current = address;
    } catch {
      // Offline or blocked: keep showing the last known address.
    } finally {
      this.inFlight = false;
    }
    return this.current;
  }
}

/** One shared instance so every panel shares the cache and the rate limit. */
export const reverseGeocoder = new ReverseGeocoder();
