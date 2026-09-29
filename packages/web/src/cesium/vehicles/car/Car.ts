import * as Cesium from 'cesium';
import { Vehicle, VehicleConfig, VehicleState } from '../Vehicle';
import { CarPhysics, PhysicsConfig, PhysicsInput } from './CarPhysics';
import { TerrainClamping } from './TerrainClamping';

/**
 * Metres travelled per second per unit of `velocity`. The car used to move `velocity * 0.01`
 * metres per *rendered frame*, i.e. 0.6·velocity m/s at 60 fps and twice that at 120 fps.
 */
const DISTANCE_PER_VELOCITY_UNIT = 0.6;

export class Car extends Vehicle {
  private physics: CarPhysics;
  private terrainClamping: TerrainClamping;
  private speedVector: Cesium.Cartesian3 = new Cesium.Cartesian3();
  private roverMode: boolean = true;

  private collisionDetectionEnabled: boolean = false;
  private readonly PROBE_DISTANCE = 1.0;
  private readonly BOUNCE_DISTANCE = 0.3;
  private readonly HEIGHT_THRESHOLD = 1.0;

  private currentVehicleHeading: number = 0;
  private currentVehiclePitch: number = 0;
  private currentVehicleRoll: number = 0;
  private targetPitch: number = 0;
  private targetRoll: number = 0;

  private input: PhysicsInput = {
    throttle: false,
    brake: false,
    turnLeft: false,
    turnRight: false
  };

  private static readonly scratchTransform = new Cesium.Matrix4();
  private static readonly scratchLocalForward = new Cesium.Cartesian3();
  private static readonly scratchWorldForward = new Cesium.Cartesian3();
  private static readonly scratchBounceVector = new Cesium.Cartesian3();
  private static readonly scratchCarHPR = new Cesium.HeadingPitchRoll();
  private static readonly scratchProbe = new Cesium.Cartesian3();
  private static readonly scratchCartographic = new Cesium.Cartographic();
  private static readonly scratchProbeCartographic = new Cesium.Cartographic();

  constructor(id: string, config: VehicleConfig) {
    super(id, config);

    const physicsConfig: PhysicsConfig = {
      vehicleMass: 2400,
      engineForce: 80000,
      brakeForce: 120000,
      rollingResistance: 0.15,
      airDragCoefficient: 2.5,
      maxSpeed: 120,
      wheelbase: 8.0,
      maxSteeringAngle: Cesium.Math.toRadians(15)
    };

    this.physics = new CarPhysics(physicsConfig);
    this.terrainClamping = new TerrainClamping(0);
    this.currentVehicleHeading = this.hpRoll.heading;
    this.currentVehiclePitch = this.hpRoll.pitch;
    this.currentVehicleRoll = this.hpRoll.roll;
  }

  protected onModelReady(): void {
    if (this.primitive) {
      this.primitive.activeAnimations.addAll({
        multiplier: 0.5,
        loop: Cesium.ModelAnimationLoop.REPEAT,
      });
    }
  }

  protected step(deltaTime: number): void {
    // Probe before moving, like before, but only in the direction of travel, and only when a
    // query is left over after reserving one for ground contact.
    const hit = this.collisionDetectionEnabled ? this.checkCollision() : null;

    let physicsResult = this.physics.update(deltaTime, this.input);
    if (hit) {
      physicsResult = this.physics.applyCollision(hit === 'front' ? -this.BOUNCE_DISTANCE : this.BOUNCE_DISTANCE);
    }

    this.velocity = physicsResult.velocity;
    this.speed = physicsResult.speed;

    if (Math.abs(this.velocity) > 0.1) {
      this.currentVehicleHeading += physicsResult.turnRate * deltaTime;
      this.currentVehicleHeading = Cesium.Math.zeroToTwoPi(this.currentVehicleHeading);
    }

    this.currentVehiclePitch = Cesium.Math.lerp(this.currentVehiclePitch, this.targetPitch, 0.05);
    this.currentVehicleRoll = Cesium.Math.lerp(this.currentVehicleRoll, this.targetRoll, 0.05);

    this.hpRoll.heading = this.currentVehicleHeading;
    this.hpRoll.pitch = this.currentVehiclePitch;
    this.hpRoll.roll = this.currentVehicleRoll;

    const signedStep = this.velocity * DISTANCE_PER_VELOCITY_UNIT * deltaTime;
    
    Car.scratchCarHPR.heading = this.currentVehicleHeading;
    Car.scratchCarHPR.pitch = this.currentVehiclePitch;
    Car.scratchCarHPR.roll = this.currentVehicleRoll;
    
    const movementMatrix = Cesium.Transforms.headingPitchRollToFixedFrame(
      this.position,
      Car.scratchCarHPR,
      Cesium.Ellipsoid.WGS84,
      undefined,
      Car.scratchTransform
    );
    
    this.speedVector = Cesium.Cartesian3.multiplyByScalar(
      Cesium.Cartesian3.UNIT_X,
      signedStep,
      this.speedVector
    );

    this.position = Cesium.Matrix4.multiplyByPoint(
      movementMatrix,
      this.speedVector,
      this.position
    );

    if (typeof physicsResult.bounce === 'number' && physicsResult.bounce !== 0) {
      const worldForward = this.getWorldForward(Car.scratchWorldForward);
      const bounceVector = Cesium.Cartesian3.multiplyByScalar(
        worldForward, 
        physicsResult.bounce, 
        Car.scratchBounceVector
      );
      this.position = Cesium.Cartesian3.add(this.position, bounceVector, this.position);
    }

    if (this.roverMode && this.primitive && this.groundSampler) {
      this.terrainClamping.clampToGround(this.position, deltaTime, this.groundSampler, [this.primitive]);
    }
  }

  /** Horizontal unit vector along the current heading. */
  private getWorldForward(result: Cesium.Cartesian3): Cesium.Cartesian3 {
    Cesium.Transforms.eastNorthUpToFixedFrame(this.position, undefined, Car.scratchTransform);
    Car.scratchLocalForward.x = Math.cos(this.currentVehicleHeading);
    Car.scratchLocalForward.y = -Math.sin(this.currentVehicleHeading);
    Car.scratchLocalForward.z = 0;
    Cesium.Matrix4.multiplyByPointAsVector(Car.scratchTransform, Car.scratchLocalForward, result);
    return Cesium.Cartesian3.normalize(result, result);
  }

  private checkCollision(): 'front' | 'back' | null {
    const sampler = this.groundSampler;
    if (!sampler || !this.primitive || Math.abs(this.velocity) <= 0.1) return null;
    if (sampler.remainingBudget() < 2) return null;

    const direction = this.velocity > 0 ? 1 : -1;
    const worldForward = this.getWorldForward(Car.scratchWorldForward);
    Cesium.Cartesian3.multiplyByScalar(worldForward, direction * this.PROBE_DISTANCE, Car.scratchProbe);
    Cesium.Cartesian3.add(this.position, Car.scratchProbe, Car.scratchProbe);

    const probe = Cesium.Cartographic.fromCartesian(Car.scratchProbe, Cesium.Ellipsoid.WGS84, Car.scratchProbeCartographic);
    const here = Cesium.Cartographic.fromCartesian(this.position, Cesium.Ellipsoid.WGS84, Car.scratchCartographic);
    if (!probe || !here) return null;

    const obstacleHeight = sampler.sampleHeight(probe, [this.primitive]);
    if (obstacleHeight !== undefined && obstacleHeight > here.height + this.HEIGHT_THRESHOLD) {
      return direction > 0 ? 'front' : 'back';
    }
    return null;
  }

  public setState(state: VehicleState): void {
    super.setState(state);
    this.currentVehicleHeading = state.heading;
    this.currentVehiclePitch = state.pitch;
    this.currentVehicleRoll = state.roll;
    this.terrainClamping.reset();
  }

  public setInput(input: Partial<PhysicsInput>): void {
    Object.assign(this.input, input);
  }

  public setPitchRollInput(pitchDelta: number, rollDelta: number): void {
    const maxPitchRate = Cesium.Math.toRadians(0.8);
    const maxRollRate = Cesium.Math.toRadians(2.5);
    
    this.targetPitch += pitchDelta * maxPitchRate;
    this.targetRoll += rollDelta * maxRollRate;
  }

  public setRoverMode(enabled: boolean): void {
    this.roverMode = enabled;
  }

  public getRoverMode(): boolean {
    return this.roverMode;
  }

  public setCollisionDetection(enabled: boolean): void {
    this.collisionDetectionEnabled = enabled;
  }

  public getCollisionDetection(): boolean {
    return this.collisionDetectionEnabled;
  }

  public toggleCollisionDetection(): void {
    this.setCollisionDetection(!this.collisionDetectionEnabled);
  }
}

