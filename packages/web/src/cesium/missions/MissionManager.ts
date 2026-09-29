import * as Cesium from 'cesium';
import type { FixedUpdatable } from '../core/GameLoop';
import type { CesiumVehicleGame } from '../bootstrap/main';
import { Aircraft, type TouchdownInfo } from '../vehicles/aircraft/Aircraft';
import { getPlace } from '../../data/places';
import { getMission } from './missions';
import { MissionMarkers, type MarkerTarget } from './MissionMarkers';
import { TargetFrame, segmentHitsCylinder, segmentPassesRing, bearingDegrees, distanceMeters } from './geometry';
import { starsFor, TOUCHDOWN_LIMITS } from './types';
import type { LandingReport, MissionDefinition, MissionEvent, MissionSnapshot, MissionStatus, Objective } from './types';

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
  /** Landing zones: size, and the threshold the approach aims at. */
  length?: number;
  width?: number;
  surface?: 'runway' | 'water';
  aim?: { lat: number; lon: number };
}

const COUNTDOWN_SECONDS = 3;
const SCENERY_TIMEOUT_MS = 8000;
/** Default beacon ceiling for reach objectives without maxAgl. */
const DEFAULT_MAX_AGL = 1000;
/** Auto-GCAS stands down within this distance of a landing zone (it would fight the landing). */
const GCAS_INHIBIT_RANGE = 6000;
/** Approach guidance: glide slope and threshold crossing height. */
const GLIDE_SLOPE = Math.tan(Cesium.Math.toRadians(3));
const THRESHOLD_HEIGHT = 15;

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
    this.game.getVehicleManager().cancelTeleport();

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
      length: o.length,
      width: o.width,
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
    this.disarmLanding();
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

    const current = this.objectives[this.index];
    if (current?.type === 'land') {
      const here = Cesium.Cartographic.fromCartesian(this.currentPosition);
      const d = distanceMeters(Cesium.Math.toDegrees(here.latitude), Cesium.Math.toDegrees(here.longitude), current.lat, current.lon);
      aircraft.setCollisionAssistInhibited(d < GCAS_INHIBIT_RANGE);
    }

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
    this.armLanding();
    this.emit({ type: 'started', missionId: this.def.id, title: this.def.title });
  }

  /** Landing objectives complete on touchdown (judged by the aircraft callback), not by path. */
  private armLanding(): void {
    const aircraft = this.activeAircraft();
    if (!aircraft) return;
    const o = this.objectives[this.index];
    aircraft.setTouchdownHandler(o?.type === 'land' ? (info) => this.judgeTouchdown(o, info) : null);
    if (o?.type !== 'land') aircraft.setCollisionAssistInhibited(false);
  }

  private disarmLanding(): void {
    const aircraft = this.activeAircraft();
    aircraft?.setTouchdownHandler(null);
    aircraft?.setCollisionAssistInhibited(false);
  }

  /**
   * Surface contact during a landing objective. Outside the zone it's an ordinary crash (false);
   * inside, within limits it's a landing (true), beyond them a hard landing.
   */
  private judgeTouchdown(o: ResolvedObjective, info: TouchdownInfo): boolean {
    if (this.status !== 'active') return false;
    const local = o.frame.toLocalPoint(info.position, this.localA);
    const b = Cesium.Math.toRadians(o.bearing);
    const along = local.x * Math.sin(b) + local.y * Math.cos(b);
    const across = local.x * Math.cos(b) - local.y * Math.sin(b);
    if (Math.abs(along) > o.length! / 2 || Math.abs(across) > o.width! / 2) return false;

    const L = TOUCHDOWN_LIMITS;
    const compass = Cesium.Math.toDegrees(info.heading) + 90;
    const headingError = Math.abs(((compass - o.bearing + 540) % 360) - 180);
    const problems = [
      info.sinkRate > L.maxSinkRate && `descending at ${info.sinkRate.toFixed(1)} m/s (limit ${L.maxSinkRate})`,
      info.speed > L.maxSpeed && `touching down at ${Math.round(info.speed)} m/s (limit ${L.maxSpeed})`,
      Math.abs(Cesium.Math.toDegrees(info.roll)) > L.maxRollDeg && 'with the wings not level',
      Cesium.Math.toDegrees(info.pitch) < L.minPitchDeg && 'nose-down (release ↓ just before touchdown)',
      headingError > L.maxHeadingErrorDeg && `${Math.round(headingError)}° off the landing direction`,
    ].filter((p): p is string => !!p);
    if (problems.length > 0) {
      this.fail('hardLanding', problems[0]);
      return false;
    }

    const sinkRate = Math.max(0, info.sinkRate);
    const report: LandingReport = {
      sinkRate,
      speed: info.speed,
      centerlineOffset: Math.abs(across),
      grade: sinkRate <= 1.5 ? 'Butter' : sinkRate <= 3 ? 'Smooth' : 'Firm',
    };
    this.completeObjective(report);
    return true;
  }

  private hit(o: ResolvedObjective): boolean {
    if (o.type === 'land') return false;
    o.frame.toLocalPoint(this.lastPosition, this.localA);
    o.frame.toLocalPoint(this.currentPosition, this.localB);
    return o.type === 'ring'
      ? segmentPassesRing(this.localA, this.localB, o.bearing, o.radius)
      : segmentHitsCylinder(this.localA, this.localB, o.radius, o.minZ, o.maxZ);
  }

  private completeObjective(landing?: LandingReport): void {
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
      this.disarmLanding();
      this.emit({
        type: 'completed',
        missionId: def.id,
        title: def.title,
        time: this.elapsed,
        stars: starsFor(def, this.elapsed, landing, o.width),
        splits: [...this.splits],
        landing,
      });
    } else {
      this.markers?.setCurrent(this.index);
      this.armLanding();
    }
  }

  private fail(reason: 'crashed' | 'timeout' | 'hardLanding', detail?: string): void {
    const def = this.def!;
    this.status = 'failed';
    this.markers?.clear();
    this.disarmLanding();
    this.emit({ type: 'failed', missionId: def.id, title: def.title, reason, detail });
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
      hint: null,
      target: o ? (o.aim ?? { lat: o.lat, lon: o.lon }) : null,
      splits: [...this.splits],
    };

    const aircraft = this.activeAircraft();
    if (o && aircraft) {
      const state = aircraft.getState();
      const here = Cesium.Cartographic.fromCartesian(state.position);
      const lat = Cesium.Math.toDegrees(here.latitude);
      const lon = Cesium.Math.toDegrees(here.longitude);
      const aim = o.aim ?? { lat: o.lat, lon: o.lon };
      snapshot.distance = distanceMeters(lat, lon, aim.lat, aim.lon);
      const compass = Cesium.Math.toDegrees(state.heading) + 90; // vehicle frame → compass
      snapshot.relativeBearing = ((bearingDegrees(lat, lon, aim.lat, aim.lon) - compass + 540) % 360) - 180;

      const above = here.height - o.ground;
      if (o.type === 'land') {
        this.landingGuidance(snapshot, o, above, compass, state);
        return snapshot;
      }
      const tolerance = o.type === 'ring' ? o.radius * 0.6 : 0;
      if (above < o.minZ - tolerance) snapshot.verticalCue = 'climb';
      else if (above > o.maxZ + tolerance) snapshot.verticalCue = 'descend';
    }
    return snapshot;
  }

  /** 3° glide path cue plus the most important thing to fix right now. */
  private landingGuidance(
    snapshot: MissionSnapshot,
    o: ResolvedObjective,
    above: number,
    compass: number,
    state: { speed: number; pitch: number; roll: number }
  ): void {
    const d = snapshot.distance;
    const onGlide = d * GLIDE_SLOPE + THRESHOLD_HEIGHT;
    if (d > 300) {
      if (above > onGlide * 1.3 + 20) snapshot.verticalCue = 'descend';
      else if (above < onGlide * 0.7 - 10) snapshot.verticalCue = 'climb';
    }
    if (d > 4000) return;

    const alignment = Math.abs(((compass - o.bearing + 540) % 360) - 180);
    const L = TOUCHDOWN_LIMITS;
    if (alignment > 20) snapshot.hint = o.surface === 'water' ? 'Turn to line up with the river' : 'Line up with the runway';
    else if (state.speed > L.maxSpeed) snapshot.hint = `Too fast — hold S to slow below ${L.maxSpeed} m/s`;
    else if (Math.abs(Cesium.Math.toDegrees(state.roll)) > 15) snapshot.hint = 'Level the wings';
    else if (above < 60 && Cesium.Math.toDegrees(state.pitch) < -8) snapshot.hint = 'Release ↓ to flare';
    else if (above < 60) snapshot.hint = 'Let it settle gently onto the surface';
  }

  // --- helpers ----------------------------------------------------------------------------

  private objectivePosition(o: Objective): { lat: number; lon: number } {
    if (o.type === 'ring' || o.type === 'land') return { lat: o.lat, lon: o.lon };
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
      if (o.type === 'land') {
        // Aim guidance at the near end of the zone (the threshold).
        const b = Cesium.Math.toRadians(o.bearing);
        const back = o.length / 2;
        const aim = {
          lat: lat - (Math.cos(b) * back) / 110540,
          lon: lon - (Math.sin(b) * back) / (111320 * Math.cos(Cesium.Math.toRadians(lat))),
        };
        return {
          type: 'land', name: o.name, fact: o.fact, lat, lon, ground, radius: o.width / 2,
          minZ: 0, maxZ: 0, bearing: o.bearing, length: o.length, width: o.width, surface: o.surface, aim,
          frame: new TargetFrame(lon, lat, ground),
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
