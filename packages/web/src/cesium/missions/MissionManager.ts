import * as Cesium from 'cesium';
import type { FixedUpdatable } from '../core/GameLoop';
import type { CesiumVehicleGame } from '../bootstrap/main';
import { Aircraft } from '../vehicles/aircraft/Aircraft';
import { getPlace } from '../../data/places';
import { getMission } from './missions';
import { MissionMarkers, type MarkerTarget } from './MissionMarkers';
import { TargetFrame, segmentHitsCylinder, segmentPassesRing, bearingDegrees, distanceMeters } from './geometry';
import { starsFor } from './types';
import type { MissionDefinition, MissionEvent, MissionSnapshot, MissionStatus, Objective } from './types';

interface ResolvedObjective {
  type: Objective['type'];
  name: string;
  placeId?: string;
  fact?: string;
  lat: number;
  lon: number;
  ground: number;
  radius: number;
  /** Reach: altitude band above ground. Ring: centre height above ground (minZ = maxZ). */
  minZ: number;
  maxZ: number;
  bearing: number;
  frame: TargetFrame;
}

const COUNTDOWN_SECONDS = 3;
const SCENERY_TIMEOUT_MS = 8000;
/** Default beacon ceiling for reach objectives without maxAgl. */
const DEFAULT_MAX_AGL = 1000;

/**
 * Runs one mission at a time on the fixed physics step: deterministic timing, and objectives
 * are tested against the segment flown each step so fast passes are never missed.
 */
export class MissionManager implements FixedUpdatable {
  private status: MissionStatus = 'idle';
  private def: MissionDefinition | null = null;
  private objectives: ResolvedObjective[] = [];
  private index = 0;
  private elapsed = 0;
  private countdown = 0;
  private splits: number[] = [];
  private runToken = 0;
  private markers: MissionMarkers | null = null;
  private listeners: Array<(event: MissionEvent) => void> = [];

  private readonly lastPosition = new Cesium.Cartesian3();
  private readonly currentPosition = new Cesium.Cartesian3();
  private readonly localA = new Cesium.Cartesian3();
  private readonly localB = new Cesium.Cartesian3();

  constructor(private game: CesiumVehicleGame) {}

  public onEvent(listener: (event: MissionEvent) => void): void {
    this.listeners.push(listener);
  }

  private emit(event: MissionEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  public getStatus(): MissionStatus {
    return this.status;
  }

  /** Mission in progress (crashes belong to the mission, not the free-flight crash screen). */
  public isRunning(): boolean {
    return this.status === 'preparing' || this.status === 'countdown' || this.status === 'active';
  }

  public async start(missionId: string): Promise<void> {
    const def = getMission(missionId);
    if (!def) throw new Error(`Unknown mission: ${missionId}`);

    this.abort(false);
    const token = ++this.runToken;
    this.def = def;
    this.status = 'preparing';
    this.index = 0;
    this.elapsed = 0;
    this.splits = [];
    this.stopAutopilot();

    // Real ground heights for the start and every target, in one batched request.
    const points = def.objectives.map((o) => this.objectivePosition(o));
    const heights = this.game.getTerrainHeights();
    await heights.prefetch([{ lng: def.start.lon, lat: def.start.lat }, ...points.map((p) => ({ lng: p.lon, lat: p.lat }))]);
    if (token !== this.runToken) return;

    const groundAt = (lon: number, lat: number) => heights.get(lon, lat) ?? 0;
    this.objectives = this.resolveObjectives(def, groundAt);

    const startBearing =
      def.start.bearing ?? bearingDegrees(def.start.lat, def.start.lon, this.objectives[0].lat, this.objectives[0].lon);
    const startPosition = Cesium.Cartesian3.fromDegrees(
      def.start.lon,
      def.start.lat,
      groundAt(def.start.lon, def.start.lat) + def.start.agl
    );
    const heading = Cesium.Math.toRadians(startBearing - 90); // vehicle frame: 0 = east

    const aircraft = await this.ensureAircraft(startPosition, heading);
    if (token !== this.runToken) return;
    if (!aircraft) {
      console.error('Mission start failed: no aircraft');
      this.status = 'idle';
      return;
    }

    aircraft.resetFlight(startPosition, heading, def.start.speed);
    aircraft.physicsEnabled = false; // hold position through scenery load and countdown
    const cameras = this.game.getCameraManager();
    cameras.resume();
    cameras.setActiveCamera(cameras.getActiveCameraType()); // snap behind the aircraft

    this.getMarkers().show(this.objectives.map((o): MarkerTarget => ({
      type: o.type,
      lat: o.lat,
      lon: o.lon,
      ground: o.ground,
      radius: o.radius,
      height: o.type === 'ring' ? o.minZ : o.maxZ,
      bearing: o.bearing,
    })));

    await this.game.getScene().waitForTiles(SCENERY_TIMEOUT_MS);
    if (token !== this.runToken) return;

    this.countdown = COUNTDOWN_SECONDS;
    this.status = 'countdown';
  }

  /** Stop the current mission (no-op if idle). */
  public abort(notify = true): void {
    const wasRunning = this.status !== 'idle';
    const id = this.def?.id;
    this.runToken++;
    this.status = 'idle';
    this.markers?.clear();
    const aircraft = this.activeAircraft();
    if (aircraft) aircraft.physicsEnabled = true;
    if (wasRunning && notify && id) this.emit({ type: 'aborted', missionId: id });
  }

  /** Close the result screen. */
  public dismiss(): void {
    if (this.status === 'completed' || this.status === 'failed') {
      this.status = 'idle';
      this.def = null;
    }
  }

  public fixedUpdate(dt: number): void {
    if (this.status === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 0) this.beginRun();
      return;
    }
    if (this.status !== 'active' || !this.def) return;

    const aircraft = this.activeAircraft();
    if (!aircraft) {
      this.abort();
      return;
    }
    if (aircraft.isCrashed()) {
      this.fail('crashed');
      return;
    }

    this.elapsed += dt;
    aircraft.getSimulationPosition(this.currentPosition);

    // Several objectives can be cleared in one step (e.g. two close gates at high speed).
    while (this.index < this.objectives.length && this.hit(this.objectives[this.index])) {
      this.completeObjective();
      if (this.status !== 'active') return;
    }
    Cesium.Cartesian3.clone(this.currentPosition, this.lastPosition);

    if (this.def.timeLimit && this.elapsed > this.def.timeLimit) {
      this.fail('timeout');
    }
  }

  public interpolate(): void {
    // Nothing to present per frame; the HUD reads snapshots.
  }

  private beginRun(): void {
    const aircraft = this.activeAircraft();
    if (!aircraft || !this.def) {
      this.abort();
      return;
    }
    aircraft.physicsEnabled = true;
    aircraft.getSimulationPosition(this.lastPosition);
    this.elapsed = 0;
    this.status = 'active';
    this.emit({ type: 'started', missionId: this.def.id, title: this.def.title });
  }

  private hit(o: ResolvedObjective): boolean {
    o.frame.toLocalPoint(this.lastPosition, this.localA);
    o.frame.toLocalPoint(this.currentPosition, this.localB);
    return o.type === 'ring'
      ? segmentPassesRing(this.localA, this.localB, o.bearing, o.radius)
      : segmentHitsCylinder(this.localA, this.localB, o.radius, o.minZ, o.maxZ);
  }

  private completeObjective(): void {
    const def = this.def!;
    const o = this.objectives[this.index];
    this.splits.push(this.elapsed);
    this.index++;
    this.emit({
      type: 'objectiveCompleted',
      missionId: def.id,
      index: this.index - 1,
      name: o.name,
      placeId: o.placeId,
      fact: o.fact,
      split: this.elapsed,
      remaining: this.objectives.length - this.index,
    });

    if (this.index >= this.objectives.length) {
      this.status = 'completed';
      this.markers?.clear();
      this.emit({
        type: 'completed',
        missionId: def.id,
        title: def.title,
        time: this.elapsed,
        stars: starsFor(def, this.elapsed),
        splits: [...this.splits],
      });
    } else {
      this.markers?.setCurrent(this.index);
    }
  }

  private fail(reason: 'crashed' | 'timeout'): void {
    const def = this.def!;
    this.status = 'failed';
    this.markers?.clear();
    this.emit({ type: 'failed', missionId: def.id, title: def.title, reason });
  }

  public getSnapshot(): MissionSnapshot {
    const def = this.def;
    const o = this.status === 'active' || this.status === 'countdown' ? this.objectives[this.index] : undefined;
    const snapshot: MissionSnapshot = {
      status: this.status,
      missionId: def?.id ?? null,
      title: def?.title ?? '',
      kind: def?.kind ?? null,
      countdown: Math.max(0, this.countdown),
      elapsed: this.elapsed,
      timeLimit: def?.timeLimit ?? null,
      objectiveIndex: this.index,
      objectiveCount: this.objectives.length,
      objectiveType: o?.type ?? null,
      objectiveName: o?.name ?? '',
      distance: 0,
      relativeBearing: 0,
      verticalCue: null,
      target: o ? { lat: o.lat, lon: o.lon } : null,
      splits: [...this.splits],
    };

    const aircraft = this.activeAircraft();
    if (o && aircraft) {
      const state = aircraft.getState();
      const here = Cesium.Cartographic.fromCartesian(state.position);
      const lat = Cesium.Math.toDegrees(here.latitude);
      const lon = Cesium.Math.toDegrees(here.longitude);
      snapshot.distance = distanceMeters(lat, lon, o.lat, o.lon);
      const compass = Cesium.Math.toDegrees(state.heading) + 90; // vehicle frame → compass
      snapshot.relativeBearing = ((bearingDegrees(lat, lon, o.lat, o.lon) - compass + 540) % 360) - 180;

      const above = here.height - o.ground;
      const tolerance = o.type === 'ring' ? o.radius * 0.6 : 0;
      if (above < o.minZ - tolerance) snapshot.verticalCue = 'climb';
      else if (above > o.maxZ + tolerance) snapshot.verticalCue = 'descend';
    }
    return snapshot;
  }

  // --- helpers ----------------------------------------------------------------------------

  private objectivePosition(o: Objective): { lat: number; lon: number } {
    if (o.type === 'ring') return { lat: o.lat, lon: o.lon };
    const place = o.placeId ? getPlace(o.placeId) : undefined;
    const lat = o.lat ?? place?.lat;
    const lon = o.lon ?? place?.lon;
    if (lat === undefined || lon === undefined) throw new Error(`Objective has no position: ${o.placeId ?? o.name}`);
    return { lat, lon };
  }

  private resolveObjectives(def: MissionDefinition, groundAt: (lon: number, lat: number) => number): ResolvedObjective[] {
    let previous = { lat: def.start.lat, lon: def.start.lon };
    return def.objectives.map((o, i) => {
      const { lat, lon } = this.objectivePosition(o);
      const ground = groundAt(lon, lat);
      const bearing = o.type === 'ring' ? o.bearing ?? bearingDegrees(previous.lat, previous.lon, lat, lon) : 0;
      previous = { lat, lon };

      if (o.type === 'ring') {
        return {
          type: 'ring', name: `Gate ${i + 1}`, lat, lon, ground, radius: o.radius,
          minZ: o.agl, maxZ: o.agl, bearing,
          frame: new TargetFrame(lon, lat, ground + o.agl),
        };
      }
      const place = o.placeId ? getPlace(o.placeId) : undefined;
      return {
        type: 'reach', name: o.name ?? place?.name ?? `Waypoint ${i + 1}`, placeId: o.placeId, fact: o.fact ?? place?.fact,
        lat, lon, ground, radius: o.radius,
        minZ: o.minAgl ?? -50, maxZ: o.maxAgl ?? DEFAULT_MAX_AGL, bearing,
        frame: new TargetFrame(lon, lat, ground),
      };
    });
  }

  private activeAircraft(): Aircraft | null {
    const vehicle = this.game.getVehicleManager().getActiveVehicle();
    return vehicle instanceof Aircraft && vehicle.isModelReady() ? vehicle : null;
  }

  /** Missions are aircraft-only for now: switch vehicles if needed and wait for the model. */
  private async ensureAircraft(position: Cesium.Cartesian3, heading: number): Promise<Aircraft | null> {
    const existing = this.activeAircraft();
    if (existing) return existing;
    await this.game.getVehicleManager().spawnAircraft('aircraft', position, heading);
    for (let i = 0; i < 150; i++) {
      const aircraft = this.activeAircraft();
      if (aircraft) return aircraft;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  }

  private stopAutopilot(): void {
    const autopilot = this.game.getAutopilotManager();
    autopilot.stopOrbit();
    autopilot.stopLock();
    this.game.getScene().camera.cancelFlight();
  }

  private getMarkers(): MissionMarkers {
    this.markers ??= new MissionMarkers(this.game.getScene().scene, this.game.getGroundSampler());
    return this.markers;
  }
}
