import * as Cesium from 'cesium';
import { Vehicle, VehicleConfig } from '../Vehicle';
import { AircraftPhysics, AircraftInput } from './AircraftPhysics';

interface AircraftConfig extends VehicleConfig {
}

/**
 * Collision probing is scheduled by clearance instead of every N frames. The old scheme fired
 * two height queries (four full pick renders, since the plane itself was pickable) together on
 * every 8th frame, which showed up as a periodic hitch, and its 2 m point probe was sampled so
 * sparsely at speed (40 m apart at 300 m/s) that the aircraft could pass through buildings.
 *
 * Now: a height sample below the aircraft measures clearance, and a ray cast along the actual
 * velocity is the forward sweep. Both share one query per physics step at most.
 */
/** Below this clearance, or with an obstacle ahead, probe densely. */
const LOW_LEVEL_CLEARANCE = 150;
/** High above the ground, how often each probe runs. */
const HIGH_LEVEL_INTERVAL = 0.5;
/** Low level: how often to measure clearance directly below. */
const LOW_LEVEL_GROUND_INTERVAL = 0.1;
/** Low level: distance flown between forward rays. */
const LOW_LEVEL_PROBE_SPACING = 8;
/** Something on the flight path within this many seconds switches to dense probing. */
const OBSTACLE_WARNING_TIME = 2 * HIGH_LEVEL_INTERVAL;
/** The original nose clearance: an obstacle this close ahead is a crash. */
const NOSE_DISTANCE = 2;
const CRASH_MARGIN = 0.5;

export class Aircraft extends Vehicle {
  private physics: AircraftPhysics;
  private input: AircraftInput = {
    throttle: false,
    brake: false,
    turnLeft: false,
    turnRight: false,
    altitudeUp: false,
    altitudeDown: false,
    rollLeft: false,
    rollRight: false
  };
  private crashed: boolean = false;

  private simTime = 0;
  private nextGroundProbeAt = 0;
  private nextForwardProbeAt = 0;
  private groundClearance = Infinity;
  private obstacleAhead = false;
  /** World-space displacement of the last physics step (flight direction for the sweep ray). */
  private readonly lastStepDelta = new Cesium.Cartesian3();

  private static readonly scratchTransform = new Cesium.Matrix4();
  private static readonly scratchWorldForward = new Cesium.Cartesian3();
  private static readonly scratchForwardWorldDelta = new Cesium.Cartesian3();
  private static readonly scratchUp = new Cesium.Cartesian3();
  private static readonly scratchVerticalDeltaVec = new Cesium.Cartesian3();
  private static readonly scratchCartographic = new Cesium.Cartographic();
  private static readonly scratchRay = new Cesium.Ray();

  constructor(id: string, config: AircraftConfig) {
    super(id, config);
    this.physics = new AircraftPhysics({
      minSpeed: 15,
      maxSpeed: 1200,
      speedChangeRate: 25,
      turnRate: Cesium.Math.toRadians(45),
      climbRate: 20,
      gravity: 2,
      rollRate: Cesium.Math.toRadians(60),
      maxRoll: Cesium.Math.toRadians(45),
      pitchRate: Cesium.Math.toRadians(60),
      maxPitch: Cesium.Math.toRadians(60)
    }, this.hpRoll.heading);
  }

  protected onModelReady(): void {
    if (this.primitive) {
      this.primitive.activeAnimations.addAll({
        multiplier: 0.6,
        loop: Cesium.ModelAnimationLoop.REPEAT
      });
    }
  }

  protected step(deltaTime: number): void {
    if (this.crashed) return;

    const result = this.physics.update(deltaTime, this.input);

    this.hpRoll.heading = result.heading;
    this.hpRoll.pitch = result.pitch;
    this.hpRoll.roll = result.roll;

    Cesium.Transforms.headingPitchRollToFixedFrame(
      this.position,
      this.hpRoll,
      Cesium.Ellipsoid.WGS84,
      undefined,
      Aircraft.scratchTransform
    );
    const worldForward = Cesium.Matrix4.multiplyByPoint(
      Aircraft.scratchTransform,
      result.positionDelta,
      Aircraft.scratchWorldForward
    );
    const forwardWorldDelta = Cesium.Cartesian3.subtract(
      worldForward,
      this.position,
      Aircraft.scratchForwardWorldDelta
    );

    // Local "up" of the ENU frame is the ellipsoid surface normal.
    const up = Cesium.Ellipsoid.WGS84.geodeticSurfaceNormal(this.position, Aircraft.scratchUp);
    const verticalDeltaVec = Cesium.Cartesian3.multiplyByScalar(
      up,
      result.verticalDelta,
      Aircraft.scratchVerticalDeltaVec
    );

    Cesium.Cartesian3.add(forwardWorldDelta, verticalDeltaVec, this.lastStepDelta);
    Cesium.Cartesian3.add(this.position, this.lastStepDelta, this.position);

    this.velocity = result.speed;
    this.speed = Math.abs(result.speed);

    this.simTime += deltaTime;
    this.updateCollision();
  }

  private isLowLevel(): boolean {
    return this.groundClearance < LOW_LEVEL_CLEARANCE || this.obstacleAhead;
  }

  private updateCollision(): void {
    const sampler = this.groundSampler;
    if (!this.primitive || !sampler) return;

    const groundDue = this.simTime >= this.nextGroundProbeAt;
    const forwardDue = this.simTime >= this.nextForwardProbeAt;
    if (!groundDue && !forwardDue) return;
    if (!sampler.hasBudget()) return;

    // One probe per step at most; take whichever is more overdue.
    if (forwardDue && (!groundDue || this.nextForwardProbeAt <= this.nextGroundProbeAt)) {
      this.probeForward();
    } else {
      this.probeGround();
    }
  }

  private probeGround(): void {
    const here = Cesium.Cartographic.fromCartesian(
      this.position,
      Cesium.Ellipsoid.WGS84,
      Aircraft.scratchCartographic
    );
    if (!here || !this.primitive || !this.groundSampler) return;

    const groundHeight = this.groundSampler.sampleHeight(here, [this.primitive]);
    this.groundClearance = groundHeight === undefined ? Infinity : here.height - groundHeight;
    if (this.groundClearance <= CRASH_MARGIN) {
      this.crash();
      return;
    }
    this.nextGroundProbeAt =
      this.simTime + (this.isLowLevel() ? LOW_LEVEL_GROUND_INTERVAL : HIGH_LEVEL_INTERVAL);
  }

  /** Sweep the flight path with a ray along the current velocity. */
  private probeForward(): void {
    if (!this.primitive || !this.groundSampler) return;

    const stepLength = Cesium.Cartesian3.magnitude(this.lastStepDelta);
    const denseInterval = LOW_LEVEL_PROBE_SPACING / Math.max(this.speed, 1);
    if (stepLength < 1e-6) {
      this.nextForwardProbeAt = this.simTime + denseInterval;
      return;
    }

    const ray = Aircraft.scratchRay;
    Cesium.Cartesian3.clone(this.position, ray.origin);
    Cesium.Cartesian3.divideByScalar(this.lastStepDelta, stepLength, ray.direction);
    const hitDistance = this.groundSampler.castRay(ray, [this.primitive]) ?? Infinity;

    // Crash if we'd reach the obstacle before the next dense probe (always ≥ the old 2 m nose).
    if (hitDistance <= NOSE_DISTANCE + LOW_LEVEL_PROBE_SPACING) {
      this.crash();
      return;
    }

    this.obstacleAhead = hitDistance <= this.speed * OBSTACLE_WARNING_TIME;
    this.nextForwardProbeAt =
      this.simTime + (this.isLowLevel() ? denseInterval : HIGH_LEVEL_INTERVAL);
  }

  private crash(): void {
    this.crashed = true;
    this.velocity = 0;
    this.speed = 0;
    console.log('✈️ Aircraft crashed');
  }

  public isCrashed(): boolean {
    return this.crashed;
  }

  public resetCrash(): void {
    this.crashed = false;
    this.groundClearance = Infinity;
    this.obstacleAhead = false;
    this.nextGroundProbeAt = this.simTime;
    this.nextForwardProbeAt = this.simTime;
  }

  /**
   * Put the aircraft in level flight at `position`, on `heading` (vehicle frame: 0 = east,
   * i.e. compass bearing − 90°), at `speed`. Clears a crash and the interpolation history.
   * Unlike setState, this also resets the flight model, which otherwise keeps its own heading
   * and speed and overrides them on the next step.
   */
  public resetFlight(position: Cesium.Cartesian3, heading: number, speed: number): void {
    this.physics.reset(heading, speed);
    Cesium.Cartesian3.clone(position, this.position);
    this.hpRoll.heading = heading;
    this.hpRoll.pitch = 0;
    this.hpRoll.roll = 0;
    this.velocity = this.speed = Math.max(speed, this.physics.getMinSpeed());
    Cesium.Cartesian3.clone(Cesium.Cartesian3.ZERO, this.lastStepDelta);
    this.resetCrash();
    this.snapToSimulation();
  }

  public getMinSpeed(): number {
    return this.physics.getMinSpeed();
  }

  /** Point `distance` metres ahead along the current heading (horizontal), for clearance checks. */
  public getPointAhead(distance: number, result: Cesium.Cartesian3): Cesium.Cartesian3 {
    Cesium.Transforms.eastNorthUpToFixedFrame(this.position, undefined, Aircraft.scratchTransform);
    const local = new Cesium.Cartesian3(
      Math.cos(this.hpRoll.heading) * distance,
      -Math.sin(this.hpRoll.heading) * distance,
      0
    );
    return Cesium.Matrix4.multiplyByPoint(Aircraft.scratchTransform, local, result);
  }

  /** Exclusion list for height queries around this aircraft. */
  public getPrimitiveForQueries(): object[] {
    return this.primitive ? [this.primitive] : [];
  }

  public getHeading(): number {
    return this.hpRoll.heading;
  }

  public setInput(input: Partial<AircraftInput>): void {
    Object.assign(this.input, input);
  }
}
