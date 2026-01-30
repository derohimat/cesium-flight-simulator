import * as Cesium from 'cesium';
import { CesiumVehicleGame } from '../bootstrap/main';
import { TerrainAvoidanceSystem } from './TerrainAvoidanceSystem';

export class AutopilotManager {
    private game: CesiumVehicleGame;
    private isFlying: boolean = false;
    private guideLineEntity?: Cesium.Entity;
    private terrainAvoidance: TerrainAvoidanceSystem | null = null;

    // Content creation mode settings
    private contentCreationMode: boolean = true; // Always on for safety

    constructor(game: CesiumVehicleGame) {
        this.game = game;
    }

    /**
     * Initialize terrain avoidance system (call after viewer is ready)
     */
    public initTerrainAvoidance(): void {
        const viewer = this.game.getScene().viewer;
        this.terrainAvoidance = new TerrainAvoidanceSystem(viewer);
        console.log('🛡️ Terrain Avoidance System initialized');
    }

    /**
     * Get the terrain avoidance system
     */
    public getTerrainAvoidance(): TerrainAvoidanceSystem | null {
        return this.terrainAvoidance;
    }

    /**
     * Set content creation mode (enables/disables safety features)
     */
    public setContentCreationMode(enabled: boolean): void {
        this.contentCreationMode = enabled;
        console.log(`🎬 Content Creation Mode: ${enabled ? 'ON' : 'OFF'}`);
    }

    public async flyPath(waypoints: { lat: number; lon: number }[], options: { speed?: number; altitude?: number } = {}) {
        if (this.isFlying || waypoints.length === 0) return;

        this.isFlying = true;
        this.game.getInputManager().setInputLocked(true);

        const viewer = this.game.getScene().viewer;
        const camera = viewer.camera;

        // Apply speed limits for content creation
        let speed = options.speed || TerrainAvoidanceSystem.DEFAULT_SPEED;
        if (this.contentCreationMode && this.terrainAvoidance) {
            speed = this.terrainAvoidance.clampSpeed(speed);
        }

        const baseAltitude = options.altitude || 200;

        console.log(`✈️ Starting Autopilot Flight (Speed: ${speed}m/s, Base Alt: ${baseAltitude}m)...`);

        try {
            // Adjust path for terrain avoidance if enabled
            let adjustedWaypoints: { lat: number; lon: number; altitude: number }[];

            if (this.contentCreationMode && this.terrainAvoidance) {
                adjustedWaypoints = this.terrainAvoidance.adjustPathForTerrainAvoidance(
                    waypoints,
                    baseAltitude
                );
                console.log('🛡️ Path adjusted for terrain avoidance');
            } else {
                // Simple path without avoidance
                adjustedWaypoints = waypoints.map(wp => {
                    const terrainHeight = viewer.scene.globe.getHeight(
                        Cesium.Cartographic.fromDegrees(wp.lon, wp.lat)
                    ) || 0;
                    return {
                        lat: wp.lat,
                        lon: wp.lon,
                        altitude: terrainHeight + baseAltitude
                    };
                });
            }

            for (const point of adjustedWaypoints) {
                // Dynamic speed adjustment based on terrain ahead
                let pointSpeed = speed;
                if (this.contentCreationMode && this.terrainAvoidance) {
                    const cameraCart = Cesium.Cartographic.fromCartesian(camera.position);
                    pointSpeed = this.terrainAvoidance.calculateDynamicSpeed(
                        Cesium.Math.toDegrees(cameraCart.longitude),
                        Cesium.Math.toDegrees(cameraCart.latitude),
                        Cesium.Math.toDegrees(camera.heading),
                        cameraCart.height
                    );
                }

                const destination = Cesium.Cartesian3.fromDegrees(
                    point.lon,
                    point.lat,
                    point.altitude
                );

                await this.flyToPointWithAvoidance(camera, destination, pointSpeed, viewer);
            }
        } finally {
            this.isFlying = false;
            this.game.getInputManager().setInputLocked(false);
            console.log('✅ Autopilot Flight Complete');
        }
    }

    private flyToPointWithAvoidance(
        camera: Cesium.Camera,
        destination: Cesium.Cartesian3,
        speed: number,
        _viewer?: Cesium.Viewer // Optional, kept for API compatibility
    ): Promise<void> {
        return new Promise((resolve) => {
            const currentPos = camera.position;
            const distance = Cesium.Cartesian3.distance(currentPos, destination);
            const duration = Math.max(3, distance / speed);

            // Check if destination is safe
            if (this.contentCreationMode && this.terrainAvoidance) {
                const destCart = Cesium.Cartographic.fromCartesian(destination);
                const safeAlt = this.terrainAvoidance.calculateSafeAltitude(
                    Cesium.Math.toDegrees(destCart.longitude),
                    Cesium.Math.toDegrees(destCart.latitude),
                    destCart.height
                );

                if (safeAlt > destCart.height) {
                    // Adjust destination altitude for safety
                    destination = Cesium.Cartesian3.fromDegrees(
                        Cesium.Math.toDegrees(destCart.longitude),
                        Cesium.Math.toDegrees(destCart.latitude),
                        safeAlt
                    );
                    console.log(`⚠️ Altitude adjusted to ${safeAlt.toFixed(0)}m for safety`);
                }
            }

            camera.flyTo({
                destination: destination,
                orientation: {
                    heading: camera.heading,
                    pitch: Cesium.Math.toRadians(-20),
                    roll: 0.0,
                },
                duration: duration,
                easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
                complete: () => resolve(),
                cancel: () => {
                    this.isFlying = false;
                    resolve();
                }
            });
        });
    }

    // Legacy method for backward compatibility
    private _flyToPoint(camera: Cesium.Camera, destination: Cesium.Cartesian3, speed: number): Promise<void> {
        return this.flyToPointWithAvoidance(camera, destination, speed);
    }

    private orbitListener: Cesium.Event.RemoveCallback | undefined;
    private isOrbiting: boolean = false;

    public startOrbit(centerCoordinate: Cesium.Cartographic, radius: number, speed: number, onComplete?: () => void) {
        if (this.isOrbiting) this.stopOrbit();
        if (this.isLocked) this.stopLock();

        this.isOrbiting = true;
        this.game.getInputManager().setInputLocked(true);

        const viewer = this.game.getScene().viewer;
        const camera = viewer.camera;
        const centerCartesian = Cesium.Cartographic.toCartesian(centerCoordinate);
        const transform = Cesium.Transforms.eastNorthUpToFixedFrame(centerCartesian);

        // Initial setup
        let currentHeading = camera.heading;
        const pitch = Cesium.Math.toRadians(-30);
        const range = radius;

        // Apply initial transform
        camera.lookAtTransform(transform, new Cesium.HeadingPitchRange(currentHeading, pitch, range));

        let totalRotation = 0;

        // Subscribe to tick
        this.orbitListener = viewer.clock.onTick.addEventListener(() => {
            if (!this.isOrbiting) return;

            const rotationStep = speed; // degrees per tick
            // Increment heading based on speed 
            currentHeading += Cesium.Math.toRadians(rotationStep);
            totalRotation += Math.abs(rotationStep);

            camera.lookAtTransform(transform, new Cesium.HeadingPitchRange(currentHeading, pitch, range));

            if (totalRotation >= 360) {
                this.stopOrbit();
                if (onComplete) onComplete();
            }
        });

        console.log('🔄 Started Drone Orbit');
    }

    public stopOrbit() {
        if (this.orbitListener) {
            this.orbitListener();
            this.orbitListener = undefined;
        }

        if (this.isOrbiting) {
            this.isOrbiting = false;
            this.game.getInputManager().setInputLocked(false);

            // Release camera from local frame
            const viewer = this.game.getScene().viewer;
            viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);

            console.log('⏹️ Stopped Drone Orbit');
        }
    }

    private lockListener: Cesium.Event.RemoveCallback | undefined;
    private isLocked: boolean = false;

    public flyPathWithTargetLock(path: Cesium.Cartographic[], target: Cesium.Cartographic, options: { speed?: number; duration?: number } = {}) {
        if (this.isLocked || path.length < 2) return;
        if (this.isOrbiting) this.stopOrbit();
        if (this.isFlying) this.isFlying = false; // Override normal flight if any

        this.isLocked = true;
        this.game.getInputManager().setInputLocked(true);
        console.log('🎯 Starting Target Lock Flight');

        const viewer = this.game.getScene().viewer;
        const camera = viewer.camera;

        // Create Spline
        const cartesianPath = path.map(p => Cesium.Cartographic.toCartesian(p));

        // Calculate Total Duration
        let totalDuration = options.duration || 20;

        // If speed is provided, it overrides duration (roughly)
        if (options.speed && options.speed > 0) {
            // Calculate total path length
            let totalLength = 0;
            for (let i = 0; i < cartesianPath.length - 1; i++) {
                totalLength += Cesium.Cartesian3.distance(cartesianPath[i], cartesianPath[i + 1]);
            }
            totalDuration = totalLength / options.speed;
        }

        // Time points (normalized 0 to 1 would be easier, then scale by duration)
        // Or specific times. Let's do equally spaced for simplicity of this demo.
        const times = cartesianPath.map((_, i) => i / (cartesianPath.length - 1) * totalDuration);

        const spline = new Cesium.CatmullRomSpline({
            times: times,
            points: cartesianPath
        });

        const targetPos = Cesium.Cartographic.toCartesian(target);
        const startTime = viewer.clock.currentTime.clone();

        this.lockListener = viewer.clock.onTick.addEventListener((clock) => {
            if (!this.isLocked) return;

            const now = clock.currentTime;
            const elapsed = Cesium.JulianDate.secondsDifference(now, startTime);

            if (elapsed >= totalDuration) {
                this.stopLock();
                return;
            }

            // Sample Position
            const currentPos = spline.evaluate(elapsed);

            // Set Camera Position
            camera.position = currentPos;

            // Look at Target
            // We need to calculate direction vector
            const direction = Cesium.Cartesian3.subtract(targetPos, currentPos, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(direction, direction);

            // We also need an Up vector. 
            // Standard approach: Use the globe's surface normal as a rough 'up', or EastNorthUp frame.
            // Cesium's camera.direction = ... automatically adjusts right/up if we don't supply them, 
            // but explicitly setting view is more robust.
            // camera.setView can take position and target? No. 
            // Let's use lookAt? No, lookAt locks the camera to the target frame often.

            // Easiest robust way for a free camera:
            camera.direction = direction;
            // Recalculate up/right to maintain horizon if possible, or just let Cesium handle it.
            // For a "drone", we usually want 'up' to be away from earth center.
            const right = Cesium.Cartesian3.cross(direction, camera.position, new Cesium.Cartesian3()); // Rough approximation using position vector as up-ish
            // Actually, position (which is from center of earth) is 'up'. 
            // Cross(direction, up) = right.
            camera.right = Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.normalize(camera.position, new Cesium.Cartesian3()), right);
            Cesium.Cartesian3.normalize(camera.right, camera.right);

            camera.up = Cesium.Cartesian3.cross(camera.right, direction, new Cesium.Cartesian3());
            Cesium.Cartesian3.normalize(camera.up, camera.up);
        });
    }

    public stopLock() {
        if (this.lockListener) {
            this.lockListener();
            this.lockListener = undefined;
        }
        if (this.isLocked) {
            this.isLocked = false;
            this.game.getInputManager().setInputLocked(false);
            console.log('⏹️ Stopped Target Lock Flight');
        }
    }

    public showGuideLine(target: Cesium.Cartographic): void {
        const viewer = this.game.getScene().viewer;
        this.hideGuideLine(); // Clear existing

        this.guideLineEntity = viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    const cameraPos = viewer.camera.position;
                    const targetPos = Cesium.Cartesian3.fromDegrees(target.longitude, target.latitude, target.height);
                    return [cameraPos, targetPos];
                }, false),
                width: 2,
                material: Cesium.Color.YELLOW.withAlpha(0.6),
                depthFailMaterial: new Cesium.PolylineDashMaterialProperty({
                    color: Cesium.Color.YELLOW.withAlpha(0.4),
                }),
            }
        });
    }

    public hideGuideLine(): void {
        if (this.guideLineEntity) {
            const viewer = this.game.getScene().viewer;
            viewer.entities.remove(this.guideLineEntity);
            this.guideLineEntity = undefined;
        }
    }

    public isActive(): boolean {
        return this.isFlying || this.isOrbiting || this.isLocked;
    }
}
