import * as Cesium from 'cesium';
import { Camera } from './Camera';

/**
 * FPVCamera - First Person View camera that simulates a drone pilot's perspective
 * Features:
 * - Cockpit/nose-mounted view
 * - Dynamic gimbal tilt control
 * - Smooth head tracking
 * - Configurable FOV for immersive feel
 */
export class FPVCamera extends Camera {
    // Camera offset from vehicle center (simulates nose-mounted camera)
    private cameraOffset = new Cesium.Cartesian3(0, 2, 0.5); // Forward by 2m, up by 0.5m

    // Gimbal control
    private gimbalPitch: number = 0; // Degrees
    private targetGimbalPitch: number = 0;
    private gimbalYaw: number = 0;
    private targetGimbalYaw: number = 0;

    // Gimbal limits
    private readonly minGimbalPitch: number = -90; // Look straight down
    private readonly maxGimbalPitch: number = 30; // Slight look up
    private readonly maxGimbalYaw: number = 45; // Side-to-side

    // Gimbal smoothing
    private readonly gimbalLerpFactor: number = 0.05;

    // FOV settings
    private readonly standardFov: number = 90;
    private readonly wideFov: number = 120;
    private currentFov: number = 90;

    // Shake effect for immersion
    private shakeAmount: number = 0;
    private shakeDecay: number = 0.95;

    // Input state
    private gimbalInput = {
        pitchUp: false,
        pitchDown: false,
        yawLeft: false,
        yawRight: false,
        centerGimbal: false,
        wideFov: false
    };

    protected onActivate(): void {
        // Set initial gimbal position
        this.gimbalPitch = 0;
        this.gimbalYaw = 0;
        this.targetGimbalPitch = 0;
        this.targetGimbalYaw = 0;
        this.currentFov = this.standardFov;

        // Apply FOV
        const currentFrustum = this.cesiumCamera.frustum as Cesium.PerspectiveFrustum;
        this.cesiumCamera.frustum = new Cesium.PerspectiveFrustum({
            fov: Cesium.Math.toRadians(this.currentFov),
            aspectRatio: currentFrustum.aspectRatio || 1.7777,
            near: 1.0,
            far: 5000000.0
        });

        console.log('[FPVCamera] Activated - First Person Drone View');
    }

    protected onDeactivate(): void {
        // Reset FOV to default
        const currentFrustum = this.cesiumCamera.frustum as Cesium.PerspectiveFrustum;
        this.cesiumCamera.frustum = new Cesium.PerspectiveFrustum({
            fov: Cesium.Math.toRadians(60),
            aspectRatio: currentFrustum.aspectRatio || 1.7777,
            near: 1.0,
            far: 5000000.0
        });
    }

    public update(deltaTime: number): void {
        if (!this.isActive || !this.target) {
            return;
        }

        // Process gimbal input
        this.processGimbalInput(deltaTime);

        // Get vehicle state
        const targetPosition = this.target.getPosition();
        const state = this.target.getState();

        // Create vehicle orientation matrix
        const vehicleHeading = state.heading;
        const vehiclePitch = state.pitch;
        const vehicleRoll = state.roll;

        // Create ENU (East-North-Up) to fixed frame transform at vehicle position
        const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(targetPosition);

        // Create vehicle rotation from heading, pitch, roll
        const hpr = new Cesium.HeadingPitchRoll(
            vehicleHeading,
            vehiclePitch,
            vehicleRoll
        );
        const vehicleRotation = Cesium.Matrix3.fromHeadingPitchRoll(hpr);

        // Combine transformations
        const rotationMatrix4 = Cesium.Matrix4.fromRotationTranslation(vehicleRotation, Cesium.Cartesian3.ZERO);
        const fullTransform = Cesium.Matrix4.multiply(enuTransform, rotationMatrix4, new Cesium.Matrix4());

        // Transform camera offset to world space
        const worldOffset = Cesium.Matrix4.multiplyByPoint(fullTransform, this.cameraOffset, new Cesium.Cartesian3());
        const cameraPosition = Cesium.Cartesian3.add(
            targetPosition,
            Cesium.Cartesian3.subtract(worldOffset, targetPosition, new Cesium.Cartesian3()),
            new Cesium.Cartesian3()
        );

        // Apply shake effect
        if (this.shakeAmount > 0.01) {
            const shakeX = (Math.random() - 0.5) * this.shakeAmount;
            const shakeY = (Math.random() - 0.5) * this.shakeAmount;
            const shakeZ = (Math.random() - 0.5) * this.shakeAmount * 0.5;

            const shakeOffset = Cesium.Matrix4.multiplyByPointAsVector(
                enuTransform,
                new Cesium.Cartesian3(shakeX, shakeY, shakeZ),
                new Cesium.Cartesian3()
            );

            Cesium.Cartesian3.add(cameraPosition, shakeOffset, cameraPosition);
            this.shakeAmount *= this.shakeDecay;
        }

        // Smooth gimbal interpolation
        this.gimbalPitch = Cesium.Math.lerp(this.gimbalPitch, this.targetGimbalPitch, this.gimbalLerpFactor);
        this.gimbalYaw = Cesium.Math.lerp(this.gimbalYaw, this.targetGimbalYaw, this.gimbalLerpFactor);

        // Calculate look direction with gimbal offset
        const gimbalHpr = new Cesium.HeadingPitchRoll(
            vehicleHeading + Cesium.Math.toRadians(this.gimbalYaw),
            vehiclePitch + Cesium.Math.toRadians(this.gimbalPitch),
            vehicleRoll * 0.3 // Reduced roll for stability
        );

        // Set camera view
        this.cesiumCamera.setView({
            destination: cameraPosition,
            orientation: gimbalHpr
        });

        // Update FOV if wide mode
        const targetFov = this.gimbalInput.wideFov ? this.wideFov : this.standardFov;
        if (Math.abs(this.currentFov - targetFov) > 0.5) {
            this.currentFov = Cesium.Math.lerp(this.currentFov, targetFov, 0.1);
            const currentFrustum = this.cesiumCamera.frustum as Cesium.PerspectiveFrustum;
            this.cesiumCamera.frustum = new Cesium.PerspectiveFrustum({
                fov: Cesium.Math.toRadians(this.currentFov),
                aspectRatio: currentFrustum.aspectRatio || 1.7777,
                near: 1.0,
                far: 5000000.0
            });
        }
    }

    private processGimbalInput(deltaTime: number): void {
        const gimbalSpeed = 60; // degrees per second

        if (this.gimbalInput.pitchUp) {
            this.targetGimbalPitch = Math.min(
                this.targetGimbalPitch + gimbalSpeed * deltaTime,
                this.maxGimbalPitch
            );
        }
        if (this.gimbalInput.pitchDown) {
            this.targetGimbalPitch = Math.max(
                this.targetGimbalPitch - gimbalSpeed * deltaTime,
                this.minGimbalPitch
            );
        }
        if (this.gimbalInput.yawLeft) {
            this.targetGimbalYaw = Math.min(
                this.targetGimbalYaw + gimbalSpeed * deltaTime,
                this.maxGimbalYaw
            );
        }
        if (this.gimbalInput.yawRight) {
            this.targetGimbalYaw = Math.max(
                this.targetGimbalYaw - gimbalSpeed * deltaTime,
                -this.maxGimbalYaw
            );
        }
        if (this.gimbalInput.centerGimbal) {
            this.targetGimbalPitch = 0;
            this.targetGimbalYaw = 0;
        }
    }

    // Public methods for gimbal control
    public setGimbalInput(input: Partial<typeof this.gimbalInput>): void {
        Object.assign(this.gimbalInput, input);
    }

    public setGimbalPitch(pitch: number): void {
        this.targetGimbalPitch = Cesium.Math.clamp(pitch, this.minGimbalPitch, this.maxGimbalPitch);
    }

    public setGimbalYaw(yaw: number): void {
        this.targetGimbalYaw = Cesium.Math.clamp(yaw, -this.maxGimbalYaw, this.maxGimbalYaw);
    }

    public getGimbalPitch(): number {
        return this.gimbalPitch;
    }

    public getGimbalYaw(): number {
        return this.gimbalYaw;
    }

    public addShake(amount: number): void {
        this.shakeAmount = Math.min(this.shakeAmount + amount, 5);
    }

    public setCameraOffset(forward: number, up: number): void {
        this.cameraOffset = new Cesium.Cartesian3(0, forward, up);
    }

    public setWideFov(enabled: boolean): void {
        this.gimbalInput.wideFov = enabled;
    }

    public getCurrentFov(): number {
        return this.currentFov;
    }
}
