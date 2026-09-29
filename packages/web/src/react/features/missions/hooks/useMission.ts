import { useEffect, useState } from 'react';
import { useGameBridge } from '../../../hooks/useGameBridge';
import type { MissionSnapshot } from '../../../../cesium/missions/types';

/** Live mission state (10 Hz while a mission runs, plus every mission event). */
export function useMission(): MissionSnapshot {
  const bridge = useGameBridge();
  const [state, setState] = useState<MissionSnapshot>(() => bridge.getMissionState());

  useEffect(() => bridge.on('missionState', setState), [bridge]);

  return state;
}

// --- Personal bests (per browser) -----------------------------------------------------------

export interface MissionRecord {
  bestTime: number;
  stars: number;
}

const RECORDS_KEY = 'skystudio.missionRecords.v1';

export function loadRecords(): Record<string, MissionRecord> {
  try {
    return JSON.parse(localStorage.getItem(RECORDS_KEY) ?? '{}') as Record<string, MissionRecord>;
  } catch {
    return {};
  }
}

/** Store a finish; returns true if it's a new best time. */
export function saveRecord(missionId: string, time: number, stars: number): boolean {
  const records = loadRecords();
  const previous = records[missionId];
  const isBest = !previous || time < previous.bestTime;
  records[missionId] = {
    bestTime: isBest ? time : previous.bestTime,
    stars: Math.max(stars, previous?.stars ?? 0),
  };
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
  } catch {
    // Storage unavailable (private mode): bests just aren't kept.
  }
  return isBest;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}
