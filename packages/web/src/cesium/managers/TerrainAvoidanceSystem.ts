import * as Cesium from 'cesium';

/**
 * TerrainAvoidanceSystem - Automatic collision avoidance for content creation mode
 * 
 * Features:
 * - Real-time terrain height sampling
 * - Predictive obstacle detection
 * - Smooth altitude adjustments
 * - Speed-based safety margins
 * - Auto altitude for best view
 */

// Altitude preset types for different shot styles
export type AltitudePreset = 'auto' | 'drone_closeup' | 'cinematic' | 'aerial' | 'satellite';

export interface AutoAltitudeResult {
  altitude: number;
  terrainHeight: number;
  recommendedAltitude: number;
  sceneType: 'flat' | 'hilly' | 'mountainous' | 'urban' | 'coastal';
  confidence: number; // 0-1 how confident we are in this recommendation
}

export class TerrainAvoidanceSystem {
  private viewer: Cesium.Viewer;

  // Safety margins
  private readonly MINIMUM_SAFE_HEIGHT = 50; // meters above terrain
  private readonly LOOKAHEAD_DISTANCE = 200; // meters to look ahead
  private readonly SAFETY_BUFFER = 30; // additional buffer for buildings

  // Speed limits for content creation (cinematic quality)
  public static readonly MIN_SPEED = 20; // m/s - not too slow (boring footage)
  public static readonly MAX_SPEED = 150; // m/s - not too fast (hard to follow)
  public static readonly DEFAULT_SPEED = 60; // m/s - optimal for most shots
  public static readonly SLOW_SPEED = 30; // m/s - for detailed shots
  public static readonly FAST_SPEED = 100; // m/s - for dynamic shots

  // Altitude presets for different shot types
  public static readonly ALTITUDE_PRESETS: Record<AltitudePreset, { min: number; max: number; description: string }> = {
    auto: { min: 100, max: 500, description: 'Automatically calculated' },
    drone_closeup: { min: 30, max: 100, description: 'Close detail shots' },
    cinematic: { min: 100, max: 300, description: 'Standard cinematic' },
    aerial: { min: 300, max: 800, description: 'Wide aerial views' },
    satellite: { min: 800, max: 2000, description: 'High-altitude overview' },
  };

  constructor(viewer: Cesium.Viewer) {
    this.viewer = viewer;
  }

  /**
   * Calculate the optimal altitude for the best cinematic view of a location
   * Analyzes terrain features to determine the ideal viewing height
   */
  public calculateAutoAltitude(lng: number, lat: number, radius: number = 1000): AutoAltitudeResult {
    // Sample terrain in a grid around the target location
    const sampleRadius = radius; // meters
    const samplePoints = 16; // points around the center
    const terrainHeights: number[] = [];

    // Get center terrain height
    const centerHeight = this.getTerrainHeight(lng, lat);
    terrainHeights.push(centerHeight);

    // Sample in a circle around the target
    for (let i = 0; i < samplePoints; i++) {
      const angle = (i / samplePoints) * Math.PI * 2;
      const dLat = (sampleRadius * Math.cos(angle)) / 111320;
      const dLng = (sampleRadius * Math.sin(angle)) / (111320 * Math.cos(Cesium.Math.toRadians(lat)));

      const sampleLng = lng + dLng;
      const sampleLat = lat + dLat;

      terrainHeights.push(this.getTerrainHeight(sampleLng, sampleLat));
    }

    // Analyze terrain characteristics
    const minHeight = Math.min(...terrainHeights);
    const maxHeight = Math.max(...terrainHeights);
    const avgHeight = terrainHeights.reduce((a, b) => a + b, 0) / terrainHeights.length;
    const terrainVariation = maxHeight - minHeight;

    // Determine scene type based on terrain variation
    let sceneType: AutoAltitudeResult['sceneType'];
    if (terrainVariation < 20) {
      sceneType = 'flat';
    } else if (terrainVariation < 100) {
      sceneType = 'hilly';
    } else if (terrainVariation < 500) {
      sceneType = 'urban'; // Likely has buildings
    } else {
      sceneType = 'mountainous';
    }

    // Check if coastal (water nearby - very low terrain)
    if (minHeight < 5 && avgHeight < 50) {
      sceneType = 'coastal';
    }

    // Calculate optimal altitude based on scene type
    let recommendedAltitude: number;
    let confidence: number;

    switch (sceneType) {
      case 'flat':
        // Flat terrain - moderate altitude for context
        recommendedAltitude = Math.max(100, avgHeight + 150);
        confidence = 0.9;
        break;

      case 'hilly':
        // Rolling hills - higher to see the terrain features
        recommendedAltitude = maxHeight + 100 + (terrainVariation * 0.5);
        confidence = 0.85;
        break;

      case 'urban': {
        // Urban area with buildings - estimate building heights
        // Assume buildings are ~50-100m above terrain variation
        const estimatedBuildingHeight = Math.min(terrainVariation, 200);
        recommendedAltitude = maxHeight + estimatedBuildingHeight + 100;
        confidence = 0.7; // Less confident in urban areas
        break;
      }

      case 'mountainous':
        // Mountains - need to be well above peaks
        recommendedAltitude = maxHeight + 200 + (terrainVariation * 0.3);
        confidence = 0.8;
        break;

      case 'coastal':
        // Coastal - low altitude for dramatic water shots
        recommendedAltitude = Math.max(80, avgHeight + 100);
        confidence = 0.85;
        break;

      default:
        recommendedAltitude = avgHeight + 200;
        confidence = 0.6;
    }

    // Clamp to reasonable cinematic range
    recommendedAltitude = Math.max(80, Math.min(1500, recommendedAltitude));

    return {
      altitude: recommendedAltitude,
      terrainHeight: centerHeight,
      recommendedAltitude,
      sceneType,
      confidence
    };
  }

  /**
   * Calculate auto altitude for a flight path (multiple waypoints)
   * Returns the optimal altitude considering all waypoints
   */
  public calculateAutoAltitudeForPath(waypoints: { lat: number; lon: number }[]): number {
    if (waypoints.length === 0) return 200; // Default

    let maxRecommended = 0;
    let totalRecommended = 0;

    for (const wp of waypoints) {
      const result = this.calculateAutoAltitude(wp.lon, wp.lat, 500);
      maxRecommended = Math.max(maxRecommended, result.recommendedAltitude);
      totalRecommended += result.recommendedAltitude;
    }

    // Use a weighted average that leans toward the higher altitude for safety
    const avgRecommended = totalRecommended / waypoints.length;
    const weightedAltitude = avgRecommended * 0.4 + maxRecommended * 0.6;

    return Math.round(weightedAltitude);
  }

  /**
   * Get altitude for a specific preset
   */
  public getPresetAltitude(preset: AltitudePreset, lng: number, lat: number): number {
    const terrainHeight = this.getTerrainHeight(lng, lat);
    const presetConfig = TerrainAvoidanceSystem.ALTITUDE_PRESETS[preset];

    if (preset === 'auto') {
      return this.calculateAutoAltitude(lng, lat).recommendedAltitude;
    }

    // Calculate altitude based on preset range
    const midAltitude = (presetConfig.min + presetConfig.max) / 2;
    return terrainHeight + midAltitude;
  }

  /**
   * Get all available altitude presets with current values for a location
   */
  public getAltitudePresets(lng: number, lat: number): { preset: AltitudePreset; altitude: number; description: string }[] {
    const terrainHeight = this.getTerrainHeight(lng, lat);
    const autoResult = this.calculateAutoAltitude(lng, lat);

    return [
      {
        preset: 'auto',
        altitude: Math.round(autoResult.recommendedAltitude),
        description: `Auto (${autoResult.sceneType})`
      },
      {
        preset: 'drone_closeup',
        altitude: Math.round(terrainHeight + 60),
        description: 'Drone Close-up'
      },
      {
        preset: 'cinematic',
        altitude: Math.round(terrainHeight + 200),
        description: 'Cinematic'
      },
      {
        preset: 'aerial',
        altitude: Math.round(terrainHeight + 500),
        description: 'Aerial'
      },
      {
        preset: 'satellite',
        altitude: Math.round(terrainHeight + 1200),
        description: 'Satellite'
      },
    ];
  }

  /**
   * Get the terrain height at a given position
   */
  public getTerrainHeight(lng: number, lat: number): number {
    const cartographic = Cesium.Cartographic.fromDegrees(lng, lat);
    const height = this.viewer.scene.globe.getHeight(cartographic);
    return height || 0;
  }

  /**
   * Get the terrain height at a Cartesian3 position
   */
  public getTerrainHeightAtPosition(position: Cesium.Cartesian3): number {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const height = this.viewer.scene.globe.getHeight(cartographic);
    return height || 0;
  }

  /**
   * Calculate safe altitude for a given position, considering terrain
   */
  public calculateSafeAltitude(
    lng: number,
    lat: number,
    desiredAltitude: number,
    extraMargin: number = 0
  ): number {
    const terrainHeight = this.getTerrainHeight(lng, lat);
    const minimumAlt = terrainHeight + this.MINIMUM_SAFE_HEIGHT + this.SAFETY_BUFFER + extraMargin;
    return Math.max(desiredAltitude, minimumAlt);
  }

  /**
   * Calculate safe altitude along a path with lookahead
   * This checks terrain height along the flight direction
   */
  public calculateSafeAltitudeWithLookahead(
    currentLng: number,
    currentLat: number,
    headingDegrees: number,
    desiredAltitude: number,
    speed: number
  ): number {
    // Calculate lookahead distance based on speed
    const lookahead = Math.min(this.LOOKAHEAD_DISTANCE, speed * 3); // 3 seconds ahead

    // Sample points along the path
    const samplePoints = 5;
    let maxTerrainHeight = this.getTerrainHeight(currentLng, currentLat);

    const headingRad = Cesium.Math.toRadians(headingDegrees);

    for (let i = 1; i <= samplePoints; i++) {
      const distance = (lookahead / samplePoints) * i;

      // Calculate offset in meters
      const dLat = (distance * Math.cos(headingRad)) / 111320; // degrees
      const dLng = (distance * Math.sin(headingRad)) / (111320 * Math.cos(Cesium.Math.toRadians(currentLat)));

      const sampleLng = currentLng + dLng;
      const sampleLat = currentLat + dLat;

      const terrainHeight = this.getTerrainHeight(sampleLng, sampleLat);
      maxTerrainHeight = Math.max(maxTerrainHeight, terrainHeight);
    }

    // Add safety margin
    const minimumAlt = maxTerrainHeight + this.MINIMUM_SAFE_HEIGHT + this.SAFETY_BUFFER;

    return Math.max(desiredAltitude, minimumAlt);
  }

  /**
   * Adjust a flight path to avoid terrain collisions
   * Returns the adjusted path with safe altitudes
   */
  public adjustPathForTerrainAvoidance(
    waypoints: { lat: number; lon: number }[],
    baseAltitude: number
  ): { lat: number; lon: number; altitude: number }[] {
    const adjustedPath: { lat: number; lon: number; altitude: number }[] = [];

    for (let i = 0; i < waypoints.length; i++) {
      const wp = waypoints[i];

      // Get heading to next waypoint (or from previous if last)
      let heading = 0;
      if (i < waypoints.length - 1) {
        const next = waypoints[i + 1];
        heading = this.calculateHeading(wp.lat, wp.lon, next.lat, next.lon);
      } else if (i > 0) {
        const prev = waypoints[i - 1];
        heading = this.calculateHeading(prev.lat, prev.lon, wp.lat, wp.lon);
      }

      // Calculate safe altitude with lookahead
      const safeAltitude = this.calculateSafeAltitudeWithLookahead(
        wp.lon,
        wp.lat,
        heading,
        baseAltitude,
        TerrainAvoidanceSystem.DEFAULT_SPEED
      );

      adjustedPath.push({
        lat: wp.lat,
        lon: wp.lon,
        altitude: safeAltitude
      });
    }

    // Smooth the altitude transitions
    return this.smoothAltitudeTransitions(adjustedPath);
  }

  /**
   * Calculate heading between two points in degrees
   */
  private calculateHeading(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const dLon = Cesium.Math.toRadians(lon2 - lon1);
    const lat1Rad = Cesium.Math.toRadians(lat1);
    const lat2Rad = Cesium.Math.toRadians(lat2);

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
      Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    return Cesium.Math.toDegrees(Math.atan2(y, x));
  }

  /**
   * Smooth altitude transitions to avoid jerky movements
   */
  private smoothAltitudeTransitions(
    path: { lat: number; lon: number; altitude: number }[]
  ): { lat: number; lon: number; altitude: number }[] {
    if (path.length < 3) return path;

    const smoothed = [...path];

    // Apply simple smoothing (weighted average with neighbors)
    for (let i = 1; i < path.length - 1; i++) {
      const prevAlt = path[i - 1].altitude;
      const currAlt = path[i].altitude;
      const nextAlt = path[i + 1].altitude;

      // Weight current point more heavily
      smoothed[i] = {
        ...path[i],
        altitude: (prevAlt * 0.25 + currAlt * 0.5 + nextAlt * 0.25)
      };

      // Ensure we don't go below terrain after smoothing
      const terrainHeight = this.getTerrainHeight(path[i].lon, path[i].lat);
      const minAlt = terrainHeight + this.MINIMUM_SAFE_HEIGHT + this.SAFETY_BUFFER;
      smoothed[i].altitude = Math.max(smoothed[i].altitude, minAlt);
    }

    return smoothed;
  }

  /**
   * Clamp speed to content-creation-friendly range
   */
  public clampSpeed(speed: number): number {
    return Math.max(
      TerrainAvoidanceSystem.MIN_SPEED,
      Math.min(TerrainAvoidanceSystem.MAX_SPEED, speed)
    );
  }

  /**
   * Get recommended speed based on altitude (higher = can go faster)
   */
  public getRecommendedSpeed(altitude: number): number {
    if (altitude < 100) {
      return TerrainAvoidanceSystem.SLOW_SPEED; // Low altitude - go slow
    } else if (altitude < 300) {
      return TerrainAvoidanceSystem.DEFAULT_SPEED; // Medium - default speed
    } else {
      return TerrainAvoidanceSystem.FAST_SPEED; // High altitude - can go faster
    }
  }

  /**
   * Calculate dynamic speed based on terrain complexity ahead
   */
  public calculateDynamicSpeed(
    lng: number,
    lat: number,
    heading: number,
    currentAltitude: number
  ): number {
    // Sample terrain variations ahead
    const lookahead = 500; // meters
    const samplePoints = 10;
    const headingRad = Cesium.Math.toRadians(heading);

    let altitudeVariation = 0;
    let prevHeight = this.getTerrainHeight(lng, lat);

    for (let i = 1; i <= samplePoints; i++) {
      const distance = (lookahead / samplePoints) * i;

      const dLat = (distance * Math.cos(headingRad)) / 111320;
      const dLng = (distance * Math.sin(headingRad)) / (111320 * Math.cos(Cesium.Math.toRadians(lat)));

      const sampleHeight = this.getTerrainHeight(lng + dLng, lat + dLat);
      altitudeVariation += Math.abs(sampleHeight - prevHeight);
      prevHeight = sampleHeight;
    }

    // High terrain variation = slow down
    // Low terrain variation = can go faster
    const avgVariation = altitudeVariation / samplePoints;

    if (avgVariation > 50) {
      // Very complex terrain - go slow
      return TerrainAvoidanceSystem.SLOW_SPEED;
    } else if (avgVariation > 20) {
      // Moderate complexity
      return TerrainAvoidanceSystem.DEFAULT_SPEED;
    } else {
      // Flat terrain - can go faster
      return Math.min(
        TerrainAvoidanceSystem.FAST_SPEED,
        this.getRecommendedSpeed(currentAltitude)
      );
    }
  }

  /**
   * Check if a position is safe (above terrain)
   */
  public isPositionSafe(position: Cesium.Cartesian3): boolean {
    const cartographic = Cesium.Cartographic.fromCartesian(position);
    const terrainHeight = this.viewer.scene.globe.getHeight(cartographic) || 0;
    const currentHeight = cartographic.height;

    return currentHeight > terrainHeight + this.MINIMUM_SAFE_HEIGHT;
  }

  /**
   * Get the minimum safe altitude at current position
   */
  public getMinimumSafeAltitude(lng: number, lat: number): number {
    const terrainHeight = this.getTerrainHeight(lng, lat);
    return terrainHeight + this.MINIMUM_SAFE_HEIGHT + this.SAFETY_BUFFER;
  }
}
