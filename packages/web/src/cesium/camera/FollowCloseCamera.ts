import * as Cesium from 'cesium';
import { ChaseCamera } from './ChaseCamera';

export class FollowCloseCamera extends ChaseCamera {
  constructor(cesiumCamera: Cesium.Camera) {
    super(cesiumCamera, {
      distance: 5, // Right behind the bumper
      initialPitch: Cesium.Math.toRadians(5),
      pitchOffset: Cesium.Math.toRadians(-10), // More horizon view
      followRate: 0.08, // More responsive for close following
      rollFollow: 0.7, // Aircraft: 70% of actual roll for a more immersive feel
      turnBanking: 1.2, // More dramatic banking
      baseFov: Cesium.Math.toRadians(70), // Wider for close view
      maxFov: Cesium.Math.toRadians(110),
      fovSpeed: 70, // Kicks in very early
      fovCurve: 3, // Cubic for an even more dramatic ramp
      fovRate: 0.1,
    });
  }
}
