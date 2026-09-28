import * as Cesium from 'cesium';
import type { CesiumVehicleGame } from '../bootstrap/main';
import type { GameMode } from '../bridge/types';

export class ModeManager {
  private currentMode: GameMode = 'play';
  private cameraSpeed: number = 200; // Default speed
  private removeTickListener: (() => void) | undefined;

  constructor(
    private game: CesiumVehicleGame
  ) {}

  public onModeChanged(from: GameMode, to: GameMode): void {
    console.log(`🔄 Mode transition: ${from} → ${to}`);
    this.currentMode = to;
    
    if (to === 'builder') {
      this.enterBuilderMode();
    } else if (to === 'play') {
      this.exitBuilderMode();
    }
  }

  public setCameraSpeed(speed: number): void {
    this.cameraSpeed = speed;
    console.log(`📷 Camera speed set to ${speed} m/s`);
  }

  private enterBuilderMode(): void {
    console.log('🏗️ Entering builder mode...');
    
    const scene = this.game.getScene();
    const vehicleManager = this.game.getVehicleManager();
    const cameraManager = this.game.getCameraManager();
    const placementController = this.game.getPlacementController();
    
    // Disable vehicle physics
    const vehicle = vehicleManager.getActiveVehicle();
    if (vehicle) {
      (vehicle as any).physicsEnabled = false;
    }
    
    // Disable our custom cameras FIRST
    const activeCamera = cameraManager.getActiveCamera();
    if (activeCamera) {
      activeCamera.deactivate();
    }
    
    // Position camera behind and above the vehicle/cursor spawn point
    const startPosition = vehicle ? vehicle.getPosition() : scene.camera.positionWC;
    const cartographic = Cesium.Cartographic.fromCartesian(startPosition);
    
    // Position camera 100m behind and 50m above
    const cameraCartographic = new Cesium.Cartographic(
      cartographic.longitude,
      cartographic.latitude - Cesium.Math.toRadians(0.001), // ~100m south
      cartographic.height + 50
    );
    const cameraPosition = Cesium.Cartographic.toCartesian(cameraCartographic);
    
    // Point camera at the spawn position
    const heading = 0; // North
    const pitch = Cesium.Math.toRadians(-20); // Looking down slightly
    
    scene.camera.setView({
      destination: cameraPosition,
      orientation: {
        heading: heading,
        pitch: pitch,
        roll: 0
      }
    });
    
    // Enable Cesium's built-in free camera controls but DISABLE translation (we handle it)
    scene.enableDefaultCameraControls(true);
    
    const viewer = this.game.getScene().viewer;
    const ssc = viewer.scene.screenSpaceCameraController;
    ssc.enableTranslate = false;
    ssc.enableZoom = true;
    ssc.enableRotate = true;
    ssc.enableTilt = true;
    ssc.enableLook = true;

    // Start Custom Camera Update Loop
    this.removeTickListener = viewer.clock.onTick.addEventListener(() => {
      this.updateBuilderCamera();
    });

    // Enable object placement at vehicle position
    placementController.enable(startPosition);
    
    console.log('✅ Builder mode active - Camera unlocked, WASD to move cursor, Space to spawn');
  }

  private updateBuilderCamera(): void {
    const input = this.game.getInputManager();
    const camera = this.game.getScene().camera;
    const dt = 1.0 / 60.0; // Approximation, or get from clock? 
    // Better to use actual frame time if possible, but viewer.clock.onTick doesn't pass dt directly easily always. 
    // Let's assume 60fps or use simple multiplier.

    const moveAmount = this.cameraSpeed * dt;

    // WASD Handling (Mapped to Throttle/Brake/TurnLeft/TurnRight)
    if (input.isPressed('throttle')) { // W
      camera.moveForward(moveAmount);
    }
    if (input.isPressed('brake')) { // S
      camera.moveBackward(moveAmount);
    }
    if (input.isPressed('turnLeft')) { // A
      camera.moveLeft(moveAmount);
    }
    if (input.isPressed('turnRight')) { // D
      camera.moveRight(moveAmount);
    }

    // Vertical Movement (Q/E or Arrows)
    // InputManager maps Q->rollLeft, E->rollRight. 
    // Builder Mode: Q = Down, E = Up? Or Shift/Space?
    // Let's check InputManager again.
    // Q=rollLeft, E=rollRight.
    // ArrowUp=altitudeUp, ArrowDown=altitudeDown.

    if (input.isPressed('rollRight')) { // E -> Up
      camera.moveUp(moveAmount);
    }
    if (input.isPressed('rollLeft')) { // Q -> Down
      camera.moveDown(moveAmount);
    }

    // Also support Arrows for altitude if desired, or leave them for rotation? 
    // InputManager maps arrows to altitudeUp/Down (Up/Down) and turnLeft/Right (Left/Right).
    if (input.isPressed('altitudeUp')) {
      camera.moveUp(moveAmount);
    }
    if (input.isPressed('altitudeDown')) {
      camera.moveDown(moveAmount);
    }
  }

  private exitBuilderMode(): void {
    console.log('🎮 Exiting builder mode...');
    
    if (this.removeTickListener) {
      this.removeTickListener();
      this.removeTickListener = undefined;
    }

    const scene = this.game.getScene();
    const vehicleManager = this.game.getVehicleManager();
    const cameraManager = this.game.getCameraManager();
    const placementController = this.game.getPlacementController();
    
    // Disable object placement
    placementController.disable();
    
    // Re-enable vehicle physics
    const vehicle = vehicleManager.getActiveVehicle();
    if (vehicle) {
      (vehicle as any).physicsEnabled = true;
    }
    
    // Disable Cesium's default camera controls completely
    scene.enableDefaultCameraControls(false);
    
    // Restore default SSC settings just in case
    const viewer = this.game.getScene().viewer;
    const ssc = viewer.scene.screenSpaceCameraController;
    ssc.enableTranslate = true;

    // Re-enable our custom follow camera
    cameraManager.setActiveCamera('follow');
    
    console.log('✅ Play mode active - follow camera enabled');
  }

  public getCurrentMode(): GameMode {
    return this.currentMode;
  }
}
