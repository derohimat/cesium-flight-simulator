import * as Cesium from 'cesium';

/**
 * Swept hit tests for mission targets. Positions are tested as the segment flown during one
 * physics step, not as points: at 300 m/s the aircraft moves 5 m per step, so a point test
 * can skip straight through a gate.
 *
 * Every target owns a local east-north-up frame (x east, y north, z up, metres) at its anchor;
 * segments are transformed into it once per step.
 */
export class TargetFrame {
  private readonly toLocal: Cesium.Matrix4;
  public readonly anchor: Cesium.Cartesian3;

  constructor(lon: number, lat: number, height: number) {
    this.anchor = Cesium.Cartesian3.fromDegrees(lon, lat, height);
    const toWorld = Cesium.Transforms.eastNorthUpToFixedFrame(this.anchor);
    this.toLocal = Cesium.Matrix4.inverseTransformation(toWorld, new Cesium.Matrix4());
  }

  public toLocalPoint(world: Cesium.Cartesian3, result: Cesium.Cartesian3): Cesium.Cartesian3 {
    return Cesium.Matrix4.multiplyByPoint(this.toLocal, world, result);
  }
}

/**
 * Does the segment a→b (local frame, anchor on the ground) pass through a vertical cylinder of
 * `radius` around the anchor while between `minZ` and `maxZ` metres up?
 */
export function segmentHitsCylinder(
  a: Cesium.Cartesian3,
  b: Cesium.Cartesian3,
  radius: number,
  minZ: number,
  maxZ: number
): boolean {
  // Clip the segment to the altitude band: parameter range [t0, t1] where minZ ≤ z ≤ maxZ.
  let t0 = 0;
  let t1 = 1;
  const dz = b.z - a.z;
  if (Math.abs(dz) < 1e-9) {
    if (a.z < minZ || a.z > maxZ) return false;
  } else {
    const tMin = (minZ - a.z) / dz;
    const tMax = (maxZ - a.z) / dz;
    t0 = Math.max(t0, Math.min(tMin, tMax));
    t1 = Math.min(t1, Math.max(tMin, tMax));
    if (t0 > t1) return false;
  }

  // Closest approach of the clipped segment to the axis, in the horizontal plane.
  const px = a.x + (b.x - a.x) * t0;
  const py = a.y + (b.y - a.y) * t0;
  const qx = a.x + (b.x - a.x) * t1;
  const qy = a.y + (b.y - a.y) * t1;
  const ex = qx - px;
  const ey = qy - py;
  const lenSq = ex * ex + ey * ey;
  const t = lenSq > 1e-12 ? Math.min(1, Math.max(0, -(px * ex + py * ey) / lenSq)) : 0;
  const cx = px + ex * t;
  const cy = py + ey * t;
  return cx * cx + cy * cy <= radius * radius;
}

/**
 * Does the segment a→b (local frame, anchor at the ring centre) cross the ring's plane in the
 * direction of travel `bearingDeg` (clockwise from north), within `radius` of the centre?
 * Crossing backwards doesn't count.
 */
export function segmentPassesRing(
  a: Cesium.Cartesian3,
  b: Cesium.Cartesian3,
  bearingDeg: number,
  radius: number
): boolean {
  const bearing = Cesium.Math.toRadians(bearingDeg);
  const nx = Math.sin(bearing); // east component of the ring normal
  const ny = Math.cos(bearing); // north component
  const da = a.x * nx + a.y * ny;
  const db = b.x * nx + b.y * ny;
  if (!(da < 0 && db >= 0)) return false;

  const t = -da / (db - da);
  const px = a.x + (b.x - a.x) * t;
  const py = a.y + (b.y - a.y) * t;
  const pz = a.z + (b.z - a.z) * t;
  // Distance from the centre within the ring plane (the normal component is ~0 here).
  return px * px + py * py + pz * pz <= radius * radius;
}

/** Initial great-circle bearing from point 1 to point 2, degrees clockwise from north. */
export function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLon = Cesium.Math.toRadians(lon2 - lon1);
  const p1 = Cesium.Math.toRadians(lat1);
  const p2 = Cesium.Math.toRadians(lat2);
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return (Cesium.Math.toDegrees(Math.atan2(y, x)) + 360) % 360;
}

/** Great-circle distance in metres (haversine; plenty accurate for mission distances). */
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8;
  const dLat = Cesium.Math.toRadians(lat2 - lat1);
  const dLon = Cesium.Math.toRadians(lon2 - lon1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(Cesium.Math.toRadians(lat1)) * Math.cos(Cesium.Math.toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}
