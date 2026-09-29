export type MissionKind = 'sightseeing' | 'timeTrial';

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

export type Objective = ReachObjective | RingObjective;

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
  target: { lat: number; lon: number } | null;
  splits: number[];
}

export type MissionEvent =
  | { type: 'started'; missionId: string; title: string }
  | { type: 'objectiveCompleted'; missionId: string; index: number; name: string; placeId?: string; fact?: string; split: number; remaining: number }
  | { type: 'completed'; missionId: string; title: string; time: number; stars: number; splits: number[] }
  | { type: 'failed'; missionId: string; title: string; reason: 'crashed' | 'timeout' }
  | { type: 'aborted'; missionId: string };

export function starsFor(def: MissionDefinition, time: number): number {
  if (time <= def.par.gold) return 3;
  if (time <= def.par.silver) return 2;
  return 1;
}
