import * as Cesium from 'cesium';
import { ChaseCamera } from './ChaseCamera';

export class FollowCamera extends ChaseCamera {
  constructor(cesiumCamera: Cesium.Camera) {
    super(cesiumCamera, {
      distance: 25,
      initialPitch: Cesium.Math.toRadians(-15),
      pitchOffset: Cesium.Math.toRadians(-10), // Look over vehicle
      followRate: 0.04, // Cinematic, lazy follow
      rollFollow: 0.5, // Aircraft: bank with 50% of actual roll
      turnBanking: 2 * 0.3,
      baseFov: Cesium.Math.toRadians(60),
      maxFov: Cesium.Math.toRadians(100),
      fovSpeed: 80,
      fovCurve: 2,
      fovRate: 0.08,
    });
  }
}
