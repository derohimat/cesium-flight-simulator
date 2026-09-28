import * as Cesium from 'cesium';
import { Camera } from '../camera/Camera';
import { FollowCamera } from '../camera/FollowCamera';
import { FollowCloseCamera } from '../camera/FollowCloseCamera';
import { FPVCamera } from '../camera/FPVCamera';
import { CinematicCamera } from '../camera/CinematicCamera';
import { Vehicle } from '../vehicles/Vehicle';
import { Updatable } from '../core/GameLoop';
import { InputManager } from '../input/InputManager';

export type CameraType = 'follow' | 'followClose' | 'fpv' | 'cinematic';

// Camera metadata for UI display
export const CAMERA_INFO: Record<CameraType, { name: string; icon: string; description: string }> = {
  follow: { name: 'Follow', icon: '🎥', description: 'Chase camera from behind' },
  followClose: { name: 'Close-Up', icon: '📹', description: 'Close chase camera' },
  fpv: { name: 'FPV Drone', icon: '🚁', description: 'First-person drone view' },
  cinematic: { name: 'Cinematic', icon: '🎬', description: 'Professional cinematic shots' },
};

export class CameraManager implements Updatable {
  private cameras: Map<CameraType, Camera> = new Map();
  private activeCamera: Camera | null = null;
  private activeCameraType: CameraType = 'follow';
  private suspended = false;
  private cesiumCamera: Cesium.Camera;

  constructor(cesiumCamera: Cesium.Camera) {
    this.cesiumCamera = cesiumCamera;
    this.initializeCameras();
  }

  private initializeCameras(): void {
    // Create camera instances
    const followCamera = new FollowCamera(this.cesiumCamera);
    const followCloseCamera = new FollowCloseCamera(this.cesiumCamera);
    const fpvCamera = new FPVCamera(this.cesiumCamera);
    const cinematicCamera = new CinematicCamera(this.cesiumCamera);

    this.cameras.set('follow', followCamera);
    this.cameras.set('followClose', followCloseCamera);
    this.cameras.set('fpv', fpvCamera);
    this.cameras.set('cinematic', cinematicCamera);

    // Set default active camera
    this.setActiveCamera('follow');
  }

  public setActiveCamera(cameraType: CameraType): void {
    // Deactivate current camera
    if (this.activeCamera) {
      this.activeCamera.deactivate();
    }

    // Activate new camera
    const newCamera = this.cameras.get(cameraType);
    if (newCamera) {
      this.activeCamera = newCamera;
      this.activeCameraType = cameraType;
      this.activeCamera.activate();
      console.log(`Switched to ${CAMERA_INFO[cameraType].name} camera`);
    }
  }

  public getActiveCamera(): Camera | null {
    return this.activeCamera;
  }

  public getActiveCameraType(): CameraType {
    return this.activeCameraType;
  }

  public getCameraInfo(): { name: string; icon: string; description: string } {
    return CAMERA_INFO[this.activeCameraType];
  }

  public getAllCameraTypes(): CameraType[] {
    return ['follow', 'followClose', 'fpv', 'cinematic'];
  }

  public switchCamera(): void {
    const cameraTypes = this.getAllCameraTypes();
    const currentIndex = cameraTypes.indexOf(this.activeCameraType);
    const nextIndex = (currentIndex + 1) % cameraTypes.length;
    this.setActiveCamera(cameraTypes[nextIndex]);
  }

  public setTarget(vehicle: Vehicle | null): void {
    // Set target for all cameras
    for (const camera of this.cameras.values()) {
      camera.setTarget(vehicle);
    }
  }

  public update(deltaTime: number): void {
    // Only update the active camera, and only while nothing else (autopilot) owns the view.
    if (this.activeCamera && !this.suspended) {
      this.activeCamera.update(deltaTime);
    }
  }

  /**
   * Hand the Cesium camera to something else (autopilot flights, orbits, target lock).
   * Vehicle cameras run in preUpdate, after camera flights and clock ticks have moved the
   * view, so without this they re-aim at the vehicle every frame and the flight never shows.
   */
  public suspend(): void {
    if (this.suspended) return;
    this.suspended = true;
    // Chase cameras leave the camera in the vehicle's local frame (lookAt). Return to world
    // coordinates, keeping the current view, so flights start from exactly what's on screen.
    this.cesiumCamera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }

  public resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    // Re-activate so the camera re-initialises from the vehicle instead of easing from stale state.
    this.setActiveCamera(this.activeCameraType);
  }

  public isSuspended(): boolean {
    return this.suspended;
  }

  // Camera-specific getters
  public getFollowCamera(): FollowCamera | null {
    return this.cameras.get('follow') as FollowCamera || null;
  }

  public getFollowCloseCamera(): FollowCloseCamera | null {
    return this.cameras.get('followClose') as FollowCloseCamera || null;
  }

  public getFPVCamera(): FPVCamera | null {
    return this.cameras.get('fpv') as FPVCamera || null;
  }

  public getCinematicCamera(): CinematicCamera | null {
    return this.cameras.get('cinematic') as CinematicCamera || null;
  }

  public setupInputHandling(inputManager: InputManager): void {
    inputManager.onInput('switchCamera', (pressed) => {
      if (pressed) this.switchCamera();
    });
  }

  public destroy(): void {
    if (this.activeCamera) {
      this.activeCamera.deactivate();
    }
    this.cameras.clear();
    this.activeCamera = null;
  }
}
