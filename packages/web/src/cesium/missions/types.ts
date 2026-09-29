export type MissionKind = 'sightseeing' | 'timeTrial' | 'landing';

/** Fly into a vertical cylinder around a place. Heights are metres above the ground there. */
export interface ReachObjective {
  type: 'reach';
  /** Catalogue place (supplies name, position and fact) — or give name/lat/lon directly. */
  placeId?: string;
  name?: string;
  lat?: number;
  lon?: number;
  radius: number;
  minAgl?: number;
  maxAgl?: number;
  fact?: string;
}

/** Fly through a vertical gate, in the direction you approach it. */
export interface RingObjective {
  type: 'ring';
  lat: number;
  lon: number;
  /** Gate centre height above the ground. */
  agl: number;
  radius: number;
  /** Direction of travel through the gate; defaults to the bearing from the previous point. */
  bearing?: number;
}

/**
 * Touch down inside a marked zone (runway or water), flying `bearing`. Contact with the surface
 * here is judged as a landing instead of a crash.
 */
export interface LandObjective {
  type: 'land';
  name: string;
  /** Centre of the touchdown zone. */
  lat: number;
  lon: number;
  /** Landing direction, degrees clockwise from north. */
  bearing: number;
  /** Zone size in metres (along / across the landing direction). */
  length: number;
  width: number;
  surface: 'runway' | 'water';
  fact?: string;
}

export type Objective = ReachObjective | RingObjective | LandObjective;

/** Touchdown limits: exceed any and it's a hard landing. */
export const TOUCHDOWN_LIMITS = {
  maxSinkRate: 6, // m/s
  maxSpeed: 80, // m/s
  maxRollDeg: 20,
  minPitchDeg: -12,
  maxHeadingErrorDeg: 30,
};

export interface LandingReport {
  sinkRate: number;
  speed: number;
  /** Distance from the centreline, metres. */
  centerlineOffset: number;
  grade: 'Butter' | 'Smooth' | 'Firm';
}

export interface MissionDefinition {
  id: string;
  title: string;
  kind: MissionKind;
  region: string;
  summary: string;
  briefing: string;
  start: {
    lat: number;
    lon: number;
    agl: number;
    /** Compass heading at the start; defaults to facing the first objective. */
    bearing?: number;
    /** Initial airspeed, m/s. */
    speed: number;
  };
  objectives: Objective[];
  /** Seconds; failing to finish in time fails the mission. */
  timeLimit?: number;
  /** Finish within `gold` seconds for 3 stars, `silver` for 2; any finish earns 1. */
  par: { gold: number; silver: number };
  /** How stars are earned: by time (default) or by the quality of the final landing. */
  scoring?: 'time' | 'landing';
}

export type MissionStatus = 'idle' | 'preparing' | 'countdown' | 'active' | 'completed' | 'failed';

export interface MissionSnapshot {
  status: MissionStatus;
  missionId: string | null;
  title: string;
  kind: MissionKind | null;
  /** Seconds left in the countdown (status 'countdown'). */
  countdown: number;
  elapsed: number;
  timeLimit: number | null;
  objectiveIndex: number;
  objectiveCount: number;
  objectiveType: Objective['type'] | null;
  objectiveName: string;
  /** Horizontal distance to the current objective, metres. */
  distance: number;
  /** Target direction relative to the aircraft's nose, degrees (-180..180, + = right). */
  relativeBearing: number;
  verticalCue: 'climb' | 'descend' | null;
  /** Coaching for the current objective (e.g. landing approach), or null. */
  hint: string | null;
  target: { lat: number; lon: number } | null;
  splits: number[];
}

export type MissionEvent =
  | { type: 'started'; missionId: string; title: string }
  | { type: 'objectiveCompleted'; missionId: string; index: number; name: string; placeId?: string; fact?: string; split: number; remaining: number }
  | { type: 'completed'; missionId: string; title: string; time: number; stars: number; splits: number[]; landing?: LandingReport }
  | { type: 'failed'; missionId: string; title: string; reason: 'crashed' | 'timeout' | 'hardLanding'; detail?: string }
  | { type: 'aborted'; missionId: string };

export function starsFor(def: MissionDefinition, time: number, landing?: LandingReport, zoneWidth = 0): number {
  if (def.scoring === 'landing' && landing) {
    if (landing.grade === 'Butter' && landing.centerlineOffset <= zoneWidth / 4) return 3;
    return landing.grade === 'Firm' ? 1 : 2;
  }
  if (time <= def.par.gold) return 3;
  if (time <= def.par.silver) return 2;
  return 1;
}
