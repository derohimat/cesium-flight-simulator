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
        this.terrainAvoidance = new TerrainAvoidanceSystem();
        console.log('🛡️ Terrain Avoidance System initialized');
    }

    /** The vehicle cameras re-aim every frame; take the view while the autopilot flies it. */
    private takeCamera(): void {
        this.game.getCameraManager().suspend();
    }

    private releaseCameraIfIdle(): void {
        if (!this.isActive()) {
            this.game.getCameraManager().resume();
        }
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
        this.takeCamera();

        const viewer = this.game.getScene().viewer;
        const camera = viewer.camera;

        // Apply speed limits for content creation
        let speed = options.speed || TerrainAvoidanceSystem.DEFAULT_SPEED;
        const terrain = this.contentCreationMode ? this.terrainAvoidance : null;
        if (terrain) {
            speed = terrain.clampSpeed(speed);
        }

        const baseAltitude = options.altitude || 200;

        console.log(`✈️ Starting Autopilot Flight (Speed: ${speed}m/s, Base Alt: ${baseAltitude}m)...`);

        try {
            const start = Cesium.Cartographic.fromCartesian(camera.positionWC);
            const startLon = Cesium.Math.toDegrees(start.longitude);
            const startLat = Cesium.Math.toDegrees(start.latitude);

            // Plan every leg up front against real terrain (one batched height request), so
            // the flight never pauses between legs to wait for heights.
            const legs = terrain
                ? await terrain.withHeights(() =>
                    terrain.adjustPathForTerrainAvoidance(waypoints, baseAltitude).map((point, i, path) => {
                        const from = i === 0 ? { lon: startLon, lat: startLat, altitude: start.height } : path[i - 1];
                        const heading = bearingDegrees(from.lat, from.lon, point.lat, point.lon);
                        return {
                            ...point,
                            altitude: terrain.calculateSafeAltitude(point.lon, point.lat, point.altitude),
                            heading,
                            // Terrain along this leg can only slow the flight down. It used to
                            // replace the requested speed outright (a 150 m/s request flew at
                            // 60), and was sampled at the camera along the camera's heading,
                            // which never changes during a flight.
                            speed: Math.min(speed, terrain.calculateDynamicSpeed(from.lon, from.lat, heading, from.altitude)),
                        };
                    }))
                : waypoints.map((wp, i, path) => {
                    const from = i === 0 ? { lon: startLon, lat: startLat } : path[i - 1];
                    return {
                        ...wp,
                        altitude: baseAltitude,
                        heading: bearingDegrees(from.lat, from.lon, wp.lat, wp.lon),
                        speed,
                    };
                });
            if (terrain) console.log('🛡️ Path adjusted for terrain avoidance');

            for (const leg of legs) {
                if (!this.isFlying) break; // cancelled
                const destination = Cesium.Cartesian3.fromDegrees(leg.lon, leg.lat, leg.altitude);
                await this.flyToPointWithAvoidance(camera, destination, leg.speed, Cesium.Math.toRadians(leg.heading));
            }
        } finally {
            this.isFlying = false;
            this.game.getInputManager().setInputLocked(false);
            this.releaseCameraIfIdle();
            console.log('✅ Autopilot Flight Complete');
        }
    }

    private flyToPointWithAvoidance(
        camera: Cesium.Camera,
        destination: Cesium.Cartesian3,
        speed: number,
        heading: number
    ): Promise<void> {
        return new Promise((resolve) => {
            const distance = Cesium.Cartesian3.distance(camera.positionWC, destination);
            const duration = Math.max(3, distance / speed);

            camera.flyTo({
                destination: destination,
                orientation: {
                    // Face along the leg (it used to keep the starting heading, so the
                    // camera slid sideways or backwards along most paths).
                    heading,
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

    private orbitListener: Cesium.Event.RemoveCallback | undefined;
    private isOrbiting: boolean = false;

    public startOrbit(centerCoordinate: Cesium.Cartographic, radius: number, speed: number, onComplete?: () => void) {
        if (this.isOrbiting) this.stopOrbit();
        if (this.isLocked) this.stopLock();

        this.isOrbiting = true;
        this.game.getInputManager().setInputLocked(true);
        this.takeCamera();

        const viewer = this.game.getScene().viewer;
        const camera = viewer.camera;
        const centerCartesian = Cesium.Cartographic.toCartesian(centerCoordinate);
        const transform = Cesium.Transforms.eastNorthUpToFixedFrame(centerCartesian);

        // Initial setup
        let currentHeading = camera.heading;
        const pitch = Cesium.Math.toRadians(-30);
        const range = radius;

        const offset = new Cesium.HeadingPitchRange(currentHeading, pitch, range);

        // Apply initial transform
        camera.lookAtTransform(transform, offset);

        let totalRotation = 0;
        let lastTick = performance.now();

        // Subscribe to tick
        this.orbitListener = viewer.clock.onTick.addEventListener(() => {
            if (!this.isOrbiting) return;

            // `speed` is degrees per 1/60 s. It used to be applied per tick, so orbits ran 2.4×
            // faster on a 144 Hz display than at 60 Hz (and at half speed when frame-paced).
            const now = performance.now();
            const dt = Math.min((now - lastTick) / 1000, 0.25); // same jump guard as GameLoop
            lastTick = now;
            const rotationStep = speed * dt * 60;
            currentHeading += Cesium.Math.toRadians(rotationStep);
            totalRotation += Math.abs(rotationStep);

            offset.heading = currentHeading;
            camera.lookAtTransform(transform, offset);

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
            this.releaseCameraIfIdle();

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
        this.takeCamera();
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
            this.releaseCameraIfIdle();
            console.log('⏹️ Stopped Target Lock Flight');
        }
    }

    public showGuideLine(target: Cesium.Cartographic): void {
        const viewer = this.game.getScene().viewer;
        this.hideGuideLine(); // Clear existing

        // `target` is in radians; it used to go through fromDegrees, which drew the line to a
        // point near 0°N 0°E instead of the target.
        const targetPos = Cesium.Cartographic.toCartesian(target);
        const positions = [new Cesium.Cartesian3(), targetPos];
        this.guideLineEntity = viewer.entities.add({
            polyline: {
                positions: new Cesium.CallbackProperty(() => {
                    // World position: `camera.position` is relative to the chase camera's frame.
                    Cesium.Cartesian3.clone(viewer.camera.positionWC, positions[0]);
                    return positions;
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

/** Initial great-circle bearing from point 1 to point 2, degrees clockwise from north. */
function bearingDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = Cesium.Math.toRadians(lon2 - lon1);
    const lat1Rad = Cesium.Math.toRadians(lat1);
    const lat2Rad = Cesium.Math.toRadians(lat2);
    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    return Cesium.Math.toDegrees(Math.atan2(y, x));
}
