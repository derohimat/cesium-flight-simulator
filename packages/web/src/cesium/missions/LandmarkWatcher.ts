import { PLACES, type Place } from '../../data/places';
import { distanceMeters } from './geometry';

const NEARBY_METERS = 1500;
const REANNOUNCE_MS = 10 * 60 * 1000;

export interface LandmarkNearby {
  id: string;
  name: string;
  description?: string;
  fact: string;
  distance: number;
}

/**
 * "What am I flying past?" Announces catalogued places that have a fact when the aircraft
 * comes within 1.5 km, at most once per place every 10 minutes.
 */
export class LandmarkWatcher {
  private lastAnnounced = new Map<string, number>();
  private readonly candidates: (Place & { fact: string })[] = PLACES.filter(
    (p): p is Place & { fact: string } => !!p.fact
  );

  /** The nearest landmark worth announcing at this position, if any. */
  public check(lat: number, lon: number, now: number): LandmarkNearby | null {
    let best: LandmarkNearby | null = null;
    for (const place of this.candidates) {
      const distance = distanceMeters(lat, lon, place.lat, place.lon);
      if (distance > NEARBY_METERS || (best && distance >= best.distance)) continue;
      const last = this.lastAnnounced.get(place.id);
      if (last !== undefined && now - last < REANNOUNCE_MS) continue;
      best = { id: place.id, name: place.name, description: place.description, fact: place.fact, distance };
    }
    if (best) this.lastAnnounced.set(best.id, now);
    return best;
  }

  /** Mark a place as just shown (e.g. by a mission objective card). */
  public markShown(id: string, now: number): void {
    this.lastAnnounced.set(id, now);
  }
}
