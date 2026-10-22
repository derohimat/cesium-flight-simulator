/**
 * Type definitions for Aleph 3D Captures and local persistence.
 */

export interface AlephCaptureMetadata {
  id: string;
  name: string;
  lat: number;
  lon: number;
  baseAltitude: number;
  altitudeOffset: number;
  heading: number;
  scale: number;
  radius: number;
  bounds?: [number, number, number, number]; // [minLat, minLon, maxLat, maxLon] or [south, west, north, east]
  thumbnailUrl?: string;
  importedAt: number;
  isBundled?: boolean;
  isolationEnabled: boolean;
  description?: string;
}

export interface AlephGlbExtras {
  latitude?: number;
  longitude?: number;
  base?: number;
  radius?: number;
  bounds?: [number, number, number, number];
  frame?: string;
  [key: string]: unknown;
}

export interface ParsedAlephCapture {
  metadata: AlephCaptureMetadata;
  glbBlob: Blob;
  thumbnailBlob?: Blob;
}

export interface ISceneryStorage {
  init(): Promise<void>;
  saveCapture(metadata: AlephCaptureMetadata, glbBlob: Blob): Promise<string>;
  getAllCaptures(): Promise<AlephCaptureMetadata[]>;
  getCaptureMetadata(id: string): Promise<AlephCaptureMetadata | null>;
  getModelBlob(id: string): Promise<Blob | null>;
  getModelUrl(id: string): Promise<string | null>;
  updateMetadata(id: string, updates: Partial<AlephCaptureMetadata>): Promise<void>;
  deleteCapture(id: string): Promise<void>;
}

export interface StorageQuotaInfo {
  availableMB: number;
  usedMB: number;
  percent: number;
}
