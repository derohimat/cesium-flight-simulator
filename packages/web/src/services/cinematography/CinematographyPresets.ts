import type { Keyframe } from '../../react/features/studio/components/FlightTimeline';

export interface PresetOptions {
  centerLat: number;
  centerLon: number;
  baseAltitude: number;
  radius: number;
  durationSeconds?: number;
  keyframeCount?: number;
  revolutions?: number;
}

export interface ICinematographyPresets {
  generateOrbitKeyframes(options: PresetOptions): Keyframe[];
  generateFlyByKeyframes(options: PresetOptions): Keyframe[];
  generateSpiralRevealKeyframes(options: PresetOptions): Keyframe[];
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180.0;
}

export function toDegrees(radians: number): number {
  return (radians * 180.0) / Math.PI;
}

export function normalizeHeading(headingDeg: number): number {
  let h = headingDeg % 360;
  if (h < 0) h += 360;
  return h === 360 || h === 0 ? 0 : h;
}

/**
 * 360° Orbit Trajectory Generator.
 * Generates circular camera trajectory around the center coordinate at distance R * 1.8.
 * Heading continuously points toward center; pitch is tilted slightly downward (-15°).
 * Produces closed loop trajectory with monotonic timestamps.
 */
export function generateOrbitKeyframes(options: PresetOptions): Keyframe[] {
  const {
    centerLat,
    centerLon,
    baseAltitude,
    radius,
    durationSeconds = 15,
    keyframeCount = 16,
  } = options;

  const safeRadius = (!Number.isFinite(radius) || radius <= 0) ? 50.0 : radius;
  const effectiveRadius = Math.max(safeRadius * 1.8, 10.0);
  const altitude = baseAltitude + effectiveRadius * 0.4;
  const duration = (!Number.isFinite(durationSeconds) || durationSeconds <= 0) ? 15 : durationSeconds;
  const count = Math.max(2, keyframeCount);

  const metersPerDegreeLat = 111320.0;
  const cosLat = Math.max(Math.cos(toRadians(centerLat)), 1e-6);
  const metersPerDegreeLon = 111320.0 * cosLat;

  const keyframes: Keyframe[] = [];

  for (let i = 0; i < count; i++) {
    const fraction = i / (count - 1);
    const time = fraction * duration;
    const angleRad = fraction * 2.0 * Math.PI;

    // Offset in local ENU meters
    const eastMeters = effectiveRadius * Math.sin(angleRad);
    const northMeters = effectiveRadius * Math.cos(angleRad);

    const lat = centerLat + northMeters / metersPerDegreeLat;
    const lon = centerLon + eastMeters / metersPerDegreeLon;

    // Heading points inward toward center
    const heading = normalizeHeading(toDegrees(angleRad) + 180.0);
    const pitch = -15.0;

    keyframes.push({
      id: `kf-orbit-${i}`,
      time: Math.round(time * 100) / 100,
      lat,
      lon,
      altitude,
      heading,
      pitch,
      roll: 0.0,
      label: `Orbit ${(fraction * 360).toFixed(0)}°`,
    });
  }

  return keyframes;
}

/**
 * Cinematic Fly-by Trajectory Generator.
 * Generates linear/tangential approach, closest approach (R * 1.5 clearance), and departure.
 * Camera continuously tracks model center.
 */
export function generateFlyByKeyframes(options: PresetOptions): Keyframe[] {
  const {
    centerLat,
    centerLon,
    baseAltitude,
    radius,
    durationSeconds = 12,
    keyframeCount = 9,
  } = options;

  const safeRadius = (!Number.isFinite(radius) || radius <= 0) ? 50.0 : radius;
  const effectiveRadius = Math.max(safeRadius, 10.0);
  const flightDistance = effectiveRadius * 4.0;
  const lateralOffset = effectiveRadius * 1.5;
  const altitude = baseAltitude + effectiveRadius * 0.6;
  const duration = (!Number.isFinite(durationSeconds) || durationSeconds <= 0) ? 12 : durationSeconds;
  const count = Math.max(2, keyframeCount);

  const metersPerDegreeLat = 111320.0;
  const cosLat = Math.max(Math.cos(toRadians(centerLat)), 1e-6);
  const metersPerDegreeLon = 111320.0 * cosLat;

  const keyframes: Keyframe[] = [];

  for (let i = 0; i < count; i++) {
    const fraction = i / (count - 1);
    const time = fraction * duration;

    // Forward coordinate along flight path: -flightDistance/2 to +flightDistance/2
    const forwardMeters = (fraction - 0.5) * flightDistance;
    const eastMeters = forwardMeters;
    const northMeters = lateralOffset;

    const lat = centerLat + northMeters / metersPerDegreeLat;
    const lon = centerLon + eastMeters / metersPerDegreeLon;

    // Bearing from camera (eastMeters, northMeters) to model center (0, 0)
    const bearingRad = Math.atan2(-eastMeters, -northMeters);
    const heading = normalizeHeading(toDegrees(bearingRad));

    keyframes.push({
      id: `kf-flyby-${i}`,
      time: Math.round(time * 100) / 100,
      lat,
      lon,
      altitude,
      heading,
      pitch: -12.0,
      roll: 0.0,
      label: `Fly-by ${(fraction * 100).toFixed(0)}%`,
    });
  }

  return keyframes;
}

/**
 * Spiral Reveal Trajectory Generator.
 * Generates an ascending helical trajectory starting close and low, climbing upward and outward.
 * Pitch tilts progressively downward as camera ascends.
 */
export function generateSpiralRevealKeyframes(options: PresetOptions): Keyframe[] {
  const {
    centerLat,
    centerLon,
    baseAltitude,
    radius,
    durationSeconds = 18,
    keyframeCount = 16,
    revolutions = 1.5,
  } = options;

  const safeRadius = (!Number.isFinite(radius) || radius <= 0) ? 50.0 : radius;
  const effectiveRadius = Math.max(safeRadius, 10.0);
  const startRadius = effectiveRadius * 1.2;
  const endRadius = effectiveRadius * 3.0;
  const startAlt = baseAltitude + effectiveRadius * 0.2;
  const endAlt = baseAltitude + effectiveRadius * 2.0;
  const duration = (!Number.isFinite(durationSeconds) || durationSeconds <= 0) ? 18 : durationSeconds;
  const count = Math.max(2, keyframeCount);
  const revs = (!Number.isFinite(revolutions) || revolutions <= 0) ? 1.5 : revolutions;

  const metersPerDegreeLat = 111320.0;
  const cosLat = Math.max(Math.cos(toRadians(centerLat)), 1e-6);
  const metersPerDegreeLon = 111320.0 * cosLat;

  const keyframes: Keyframe[] = [];

  for (let i = 0; i < count; i++) {
    const fraction = i / (count - 1);
    const time = fraction * duration;

    const currentRadius = startRadius + (endRadius - startRadius) * fraction;
    const currentAlt = startAlt + (endAlt - startAlt) * fraction;
    const angleRad = fraction * (revs * 2.0 * Math.PI);

    const eastMeters = currentRadius * Math.sin(angleRad);
    const northMeters = currentRadius * Math.cos(angleRad);

    const lat = centerLat + northMeters / metersPerDegreeLat;
    const lon = centerLon + eastMeters / metersPerDegreeLon;

    const heading = normalizeHeading(toDegrees(angleRad) + 180.0);
    const rawPitch = -10.0 - 25.0 * fraction;
    const pitch = Math.max(-85.0, Math.min(0.0, rawPitch));

    keyframes.push({
      id: `kf-spiral-${i}`,
      time: Math.round(time * 100) / 100,
      lat,
      lon,
      altitude: currentAlt,
      heading,
      pitch,
      roll: 0.0,
      label: `Spiral ${(fraction * 100).toFixed(0)}%`,
    });
  }

  return keyframes;
}

export class CinematographyPresets implements ICinematographyPresets {
  public generateOrbitKeyframes(options: PresetOptions): Keyframe[] {
    return generateOrbitKeyframes(options);
  }

  public generateFlyByKeyframes(options: PresetOptions): Keyframe[] {
    return generateFlyByKeyframes(options);
  }

  public generateSpiralRevealKeyframes(options: PresetOptions): Keyframe[] {
    return generateSpiralRevealKeyframes(options);
  }
}

export const cinematographyPresets = new CinematographyPresets();
