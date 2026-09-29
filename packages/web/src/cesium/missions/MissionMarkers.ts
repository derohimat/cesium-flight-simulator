import * as Cesium from 'cesium';
import type { GroundSampler } from '../core/GroundSampler';

export interface MarkerTarget {
  type: 'reach' | 'ring';
  lat: number;
  lon: number;
  /** Ground height at the target (ellipsoidal metres). */
  ground: number;
  radius: number;
  /** Reach: top of the beacon above ground. Ring: centre above ground. */
  height: number;
  /** Ring: direction of travel, degrees clockwise from north. */
  bearing: number;
}

const CURRENT_RING = Cesium.Color.fromCssColorString('#38bdf8');
const CURRENT_BEACON = Cesium.Color.fromCssColorString('#facc15');
const UPCOMING = Cesium.Color.WHITE.withAlpha(0.35);
const RING_SEGMENTS = 48;
const BEACON_MAX_HEIGHT = 1200;

/**
 * Gates and beacons for the active mission, as one glowing PolylineCollection: a single
 * primitive, cheap to draw, and hidden from ground/ray queries so gates never read as terrain.
 */
export class MissionMarkers {
  private collection = new Cesium.PolylineCollection();
  private lines: Cesium.Polyline[][] = [];
  private targets: MarkerTarget[] = [];

  constructor(private scene: Cesium.Scene, private sampler: GroundSampler) {
    this.scene.primitives.add(this.collection);
    this.sampler.hideDuringQueries(this.collection);
  }

  public show(targets: MarkerTarget[]): void {
    this.clear();
    this.targets = targets;
    this.lines = targets.map((t) => (t.type === 'ring' ? this.addRing(t) : this.addBeacon(t)));
    this.setCurrent(0);
  }

  /** Highlight objective `index`; hide completed ones, dim upcoming ones. */
  public setCurrent(index: number): void {
    this.lines.forEach((polylines, i) => {
      const target = this.targets[i];
      for (const line of polylines) {
        line.show = i >= index;
        if (i < index) continue;
        const current = i === index;
        line.width = current ? 10 : 6;
        line.material.uniforms.color = current
          ? target.type === 'ring' ? CURRENT_RING : CURRENT_BEACON
          : UPCOMING;
      }
    });
  }

  public clear(): void {
    this.collection.removeAll();
    this.lines = [];
    this.targets = [];
  }

  public destroy(): void {
    this.sampler.stopHidingDuringQueries(this.collection);
    this.scene.primitives.remove(this.collection);
  }

  private glow(): Cesium.Material {
    return Cesium.Material.fromType(Cesium.Material.PolylineGlowType, {
      color: UPCOMING,
      glowPower: 0.25,
    });
  }

  /** Vertical circle facing the direction of travel. */
  private addRing(t: MarkerTarget): Cesium.Polyline[] {
    const center = Cesium.Cartesian3.fromDegrees(t.lon, t.lat, t.ground + t.height);
    return [this.collection.add({ positions: this.circle(center, t.radius, t.bearing, true), width: 6, material: this.glow() })];
  }

  /** Vertical light beam plus a horizontal circle showing the catch radius. */
  private addBeacon(t: MarkerTarget): Cesium.Polyline[] {
    const top = Math.min(t.height, BEACON_MAX_HEIGHT);
    const beam = this.collection.add({
      positions: [
        Cesium.Cartesian3.fromDegrees(t.lon, t.lat, t.ground),
        Cesium.Cartesian3.fromDegrees(t.lon, t.lat, t.ground + top),
      ],
      width: 6,
      material: this.glow(),
    });
    const ringHeight = Math.min(150, top);
    const center = Cesium.Cartesian3.fromDegrees(t.lon, t.lat, t.ground + ringHeight);
    const zone = this.collection.add({ positions: this.circle(center, t.radius, 0, false), width: 6, material: this.glow() });
    return [beam, zone];
  }

  private circle(center: Cesium.Cartesian3, radius: number, bearingDeg: number, vertical: boolean): Cesium.Cartesian3[] {
    const toWorld = Cesium.Transforms.eastNorthUpToFixedFrame(center);
    const b = Cesium.Math.toRadians(bearingDeg);
    // Vertical rings lie in the plane spanned by "right of travel" and up.
    const right = new Cesium.Cartesian3(Math.cos(b), -Math.sin(b), 0);
    const positions: Cesium.Cartesian3[] = [];
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const a = (i / RING_SEGMENTS) * Math.PI * 2;
      const local = vertical
        ? new Cesium.Cartesian3(right.x * Math.cos(a) * radius, right.y * Math.cos(a) * radius, Math.sin(a) * radius)
        : new Cesium.Cartesian3(Math.cos(a) * radius, Math.sin(a) * radius, 0);
      positions.push(Cesium.Matrix4.multiplyByPoint(toWorld, local, new Cesium.Cartesian3()));
    }
    return positions;
  }
}
