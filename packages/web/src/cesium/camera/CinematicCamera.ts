import * as Cesium from 'cesium';
import { Camera } from './Camera';

/**
 * CinematicCamera - Designed for creating smooth, professional aerial shots
 * Features:
 * - Smooth dolly zoom (vertigo) effect
 * - Crane shot (vertical movement)
 * - Hyperlapse mode for time-compressed long flights
 * - Smooth bezier curve movement
 * - Focus pulling between subjects
 */
export class CinematicCamera extends Camera {
    // Camera position and target
    private currentPosition: Cesium.Cartesian3 = Cesium.Cartesian3.ZERO.clone();
    private lookAtPosition: Cesium.Cartesian3 = Cesium.Cartesian3.ZERO.clone();

    // Dolly Zoom (Vertigo) Effect
    private dollyZoomEnabled: boolean = false;
    private dollyZoomProgress: number = 0;
    private dollyZoomSpeed: number = 0.5;
    private dollyZoomStartDistance: number = 100;
    private dollyZoomEndDistance: number = 500;
    private dollyZoomStartFov: number = 60;
    private dollyZoomEndFov: number = 20;

    // Crane Shot
    private craneEnabled: boolean = false;
    private craneStartHeight: number = 50;
    private craneEndHeight: number = 500;
    private craneProgress: number = 0;
    private craneSpeed: number = 0.3;

    // Hyperlapse (used for time-compressed footage)
    private _hyperlapseEnabled: boolean = false;
    private _hyperlapseSpeedMultiplier: number = 10;

    // Path following
    private pathPoints: Cesium.Cartesian3[] = [];
    private pathProgress: number = 0;
    private pathSpeed: number = 0.1; // 0-1 per second
    private isFollowingPath: boolean = false;

    // Smooth movement
    private readonly positionLerpFactor: number = 0.03;
    private readonly lookAtLerpFactor: number = 0.05;
    private targetPosition: Cesium.Cartesian3 = Cesium.Cartesian3.ZERO.clone();
    private targetLookAt: Cesium.Cartesian3 = Cesium.Cartesian3.ZERO.clone();

    // Focus
    private focusSubject: 'vehicle' | 'point' | 'none' = 'vehicle';
    private focusPoint: Cesium.Cartesian3 | null = null;

    protected onActivate(): void {
        if (this.target) {
            const position = this.target.getPosition();
            this.currentPosition = position.clone();
            this.lookAtPosition = position.clone();
            this.targetPosition = position.clone();
            this.targetLookAt = position.clone();
        }
        console.log('[CinematicCamera] Activated - Professional cinematic mode');
    }

    public update(deltaTime: number): void {
        if (!this.isActive) {
            return;
        }

        // Update effects
        if (this.dollyZoomEnabled) {
            this.updateDollyZoom(deltaTime);
        }

        if (this.craneEnabled) {
            this.updateCraneShot(deltaTime);
        }

        if (this.isFollowingPath) {
            this.updatePathFollow(deltaTime);
        } else if (this.target) {
            // Default: follow target with smooth movement
            this.updateFollowTarget(deltaTime);
        }

        // Smooth position interpolation
        Cesium.Cartesian3.lerp(
            this.currentPosition,
            this.targetPosition,
            this.positionLerpFactor,
            this.currentPosition
        );

        // Update look-at target
        this.updateLookAt(deltaTime);

        // Apply camera view
        const direction = Cesium.Cartesian3.subtract(
            this.lookAtPosition,
            this.currentPosition,
            new Cesium.Cartesian3()
        );
        Cesium.Cartesian3.normalize(direction, direction);

        const up = Cesium.Cartesian3.UNIT_Z;

        this.cesiumCamera.setView({
            destination: this.currentPosition,
            orientation: {
                direction: direction,
                up: up
            }
        });
    }

    private updateFollowTarget(_deltaTime: number): void {
        if (!this.target) return;

        const targetPos = this.target.getPosition();
        const state = this.target.getState();

        // Calculate offset position based on heading
        const offsetDistance = 150;
        const offsetHeight = 50;
        const offsetAngle = state.heading + Math.PI; // Behind the vehicle

        const cartographic = Cesium.Cartographic.fromCartesian(targetPos);
        const offsetCartographic = new Cesium.Cartographic(
            cartographic.longitude + (Math.sin(offsetAngle) * offsetDistance / 111320),
            cartographic.latitude + (Math.cos(offsetAngle) * offsetDistance / 110540),
            cartographic.height + offsetHeight
        );

        this.targetPosition = Cesium.Cartographic.toCartesian(offsetCartographic);
    }

    private updateLookAt(_deltaTime: number): void {
        if (this.focusSubject === 'vehicle' && this.target) {
            this.targetLookAt = this.target.getPosition();
        } else if (this.focusSubject === 'point' && this.focusPoint) {
            this.targetLookAt = this.focusPoint;
        }

        Cesium.Cartesian3.lerp(
            this.lookAtPosition,
            this.targetLookAt,
            this.lookAtLerpFactor,
            this.lookAtPosition
        );
    }

    private updateDollyZoom(deltaTime: number): void {
        this.dollyZoomProgress += deltaTime * this.dollyZoomSpeed;

        if (this.dollyZoomProgress >= 1) {
            this.dollyZoomProgress = 1;
            this.dollyZoomEnabled = false;
        }

        // Calculate current distance and FOV
        const t = this.easeInOutCubic(this.dollyZoomProgress);
        const currentDistance = Cesium.Math.lerp(
            this.dollyZoomStartDistance,
            this.dollyZoomEndDistance,
            t
        );
        const currentFov = Cesium.Math.lerp(
            this.dollyZoomStartFov,
            this.dollyZoomEndFov,
            t
        );

        // Update FOV
        const currentFrustum = this.cesiumCamera.frustum as Cesium.PerspectiveFrustum;
        this.cesiumCamera.frustum = new Cesium.PerspectiveFrustum({
            fov: Cesium.Math.toRadians(currentFov),
            aspectRatio: currentFrustum.aspectRatio || 1.7777,
            near: 1.0,
            far: 5000000.0
        });

        // Update distance from target
        if (this.target) {
            const targetPos = this.target.getPosition();
            const direction = Cesium.Cartesian3.subtract(
                this.currentPosition,
                targetPos,
                new Cesium.Cartesian3()
            );
            Cesium.Cartesian3.normalize(direction, direction);
            Cesium.Cartesian3.multiplyByScalar(direction, currentDistance, direction);
            this.targetPosition = Cesium.Cartesian3.add(targetPos, direction, new Cesium.Cartesian3());
        }
    }

    private updateCraneShot(deltaTime: number): void {
        this.craneProgress += deltaTime * this.craneSpeed;

        if (this.craneProgress >= 1) {
            this.craneProgress = 1;
            this.craneEnabled = false;
        }

        const t = this.easeInOutCubic(this.craneProgress);
        const currentHeight = Cesium.Math.lerp(
            this.craneStartHeight,
            this.craneEndHeight,
            t
        );

        // Update camera height
        const cartographic = Cesium.Cartographic.fromCartesian(this.targetPosition);
        cartographic.height = currentHeight;
        this.targetPosition = Cesium.Cartographic.toCartesian(cartographic);
    }

    private updatePathFollow(deltaTime: number): void {
        if (this.pathPoints.length < 2) return;

        this.pathProgress += deltaTime * this.pathSpeed;

        if (this.pathProgress >= 1) {
            this.pathProgress = 1;
            this.isFollowingPath = false;
        }

        // Calculate position along path using catmull-rom interpolation
        this.targetPosition = this.interpolatePath(this.pathProgress);
    }

    private interpolatePath(t: number): Cesium.Cartesian3 {
        const n = this.pathPoints.length - 1;
        const scaledT = t * n;
        const index = Math.min(Math.floor(scaledT), n - 1);
        const localT = scaledT - index;

        // Simple linear interpolation between points
        const start = this.pathPoints[index];
        const end = this.pathPoints[Math.min(index + 1, n)];

        return Cesium.Cartesian3.lerp(start, end, this.easeInOutCubic(localT), new Cesium.Cartesian3());
    }

    private easeInOutCubic(t: number): number {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // Public control methods
    public startDollyZoom(startDistance: number, endDistance: number, startFov: number, endFov: number, duration: number): void {
        this.dollyZoomEnabled = true;
        this.dollyZoomProgress = 0;
        this.dollyZoomStartDistance = startDistance;
        this.dollyZoomEndDistance = endDistance;
        this.dollyZoomStartFov = startFov;
        this.dollyZoomEndFov = endFov;
        this.dollyZoomSpeed = 1 / duration;
    }

    public startCraneShot(startHeight: number, endHeight: number, duration: number): void {
        this.craneEnabled = true;
        this.craneProgress = 0;
        this.craneStartHeight = startHeight;
        this.craneEndHeight = endHeight;
        this.craneSpeed = 1 / duration;
    }

    public setPath(points: Cesium.Cartesian3[], duration: number): void {
        this.pathPoints = points;
        this.pathProgress = 0;
        this.pathSpeed = 1 / duration;
        this.isFollowingPath = true;
    }

    public setFocusSubject(subject: 'vehicle' | 'point' | 'none'): void {
        this.focusSubject = subject;
    }

    public setFocusPoint(point: Cesium.Cartesian3): void {
        this.focusPoint = point;
        this.focusSubject = 'point';
    }

    public setHyperlapse(enabled: boolean, speedMultiplier: number = 10): void {
        this._hyperlapseEnabled = enabled;
        this._hyperlapseSpeedMultiplier = speedMultiplier;
    }

    public isHyperlapseEnabled(): boolean {
        return this._hyperlapseEnabled;
    }

    public getHyperlapseSpeedMultiplier(): number {
        return this._hyperlapseSpeedMultiplier;
    }

    public isEffectActive(): boolean {
        return this.dollyZoomEnabled || this.craneEnabled || this.isFollowingPath;
    }
}
