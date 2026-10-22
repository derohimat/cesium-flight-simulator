import type { AlephCaptureMetadata, ISceneryStorage, StorageQuotaInfo } from './types';

const DB_NAME = 'AlephSceneryDB';
const DB_VERSION = 1;
const STORE_CAPTURES = 'captures';
const STORE_MODELS = 'models';

export const BUNDLED_SAMPLE_ID = 'colosseum-sample';

export class SceneryStorageService implements ISceneryStorage {
  private db: IDBDatabase | null = null;
  private activeObjectUrls: Map<string, string> = new Map(); // id -> objectUrl

  private async openDb(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB is not supported in this environment.');
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_CAPTURES)) {
          const captureStore = db.createObjectStore(STORE_CAPTURES, { keyPath: 'id' });
          captureStore.createIndex('by_importedAt', 'importedAt', { unique: false });
          captureStore.createIndex('by_name', 'name', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_MODELS)) {
          db.createObjectStore(STORE_MODELS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB (${DB_NAME}): ${request.error?.message}`));
      };
    });
  }

  public async init(): Promise<void> {
    try {
      await this.openDb();
      await this.seedBundledSampleIfMissing();
    } catch (err) {
      console.warn('SceneryStorage init warning:', err);
    }
  }

  private async seedBundledSampleIfMissing(): Promise<void> {
    try {
      const existing = await this.getCaptureMetadata(BUNDLED_SAMPLE_ID);
      if (existing) return;

      // In browser environment, fetch bundled sample from /samples/colosseum/
      if (typeof window !== 'undefined' && typeof window.fetch === 'function') {
        const metaRes = await fetch('/samples/colosseum/metadata.json');
        if (!metaRes.ok) return;
        const meta = await metaRes.json();

        const glbRes = await fetch('/samples/colosseum/mesh.glb');
        if (!glbRes.ok) return;
        const glbBlob = await glbRes.blob();

        const captureMetadata: AlephCaptureMetadata = {
          id: BUNDLED_SAMPLE_ID,
          name: meta.name || 'Roman Colosseum (Aleph 3D)',
          lat: meta.lat ?? 41.89021,
          lon: meta.lon ?? 12.49223,
          baseAltitude: meta.baseAltitude ?? meta.baseElevation ?? 24.0,
          altitudeOffset: meta.altitudeOffset ?? 0,
          heading: meta.heading ?? 0,
          scale: meta.scale ?? 1.0,
          radius: meta.radius ?? meta.boundingRadius ?? 95.0,
          bounds: meta.bounds ?? [41.889, 12.491, 41.891, 12.493],
          thumbnailUrl: meta.thumbnail ?? '/samples/colosseum/thumbnail.jpg',
          importedAt: Date.now(),
          isBundled: true,
          isolationEnabled: meta.isolationEnabled ?? true,
          description: meta.description || 'Bundled sample photogrammetric 3D capture of the Roman Colosseum'
        };

        await this.saveCapture(captureMetadata, glbBlob);
      }
    } catch (err) {
      console.warn('Could not auto-seed bundled sample:', err);
    }
  }

  public async saveCapture(metadata: AlephCaptureMetadata, glbBlob: Blob): Promise<string> {
    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CAPTURES, STORE_MODELS], 'readwrite');
      const captureStore = tx.objectStore(STORE_CAPTURES);
      const modelStore = tx.objectStore(STORE_MODELS);

      captureStore.put(metadata);
      modelStore.put({ id: metadata.id, blob: glbBlob, updatedAt: Date.now() });

      tx.oncomplete = () => {
        resolve(metadata.id);
      };

      tx.onerror = () => {
        reject(new Error(`Failed to save capture (${metadata.id}): ${tx.error?.message}`));
      };

      tx.onabort = () => {
        reject(new Error(`Transaction aborted while saving capture (${metadata.id}): ${tx.error?.message}`));
      };
    });
  }

  public async getAllCaptures(): Promise<AlephCaptureMetadata[]> {
    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CAPTURES, 'readonly');
      const store = tx.objectStore(STORE_CAPTURES);
      const request = store.getAll();

      request.onsuccess = () => {
        const records: AlephCaptureMetadata[] = request.result || [];
        // Sort by importedAt descending (newest first, bundled at top)
        records.sort((a, b) => (b.isBundled ? 1 : 0) - (a.isBundled ? 1 : 0) || b.importedAt - a.importedAt);
        resolve(records);
      };

      request.onerror = () => {
        reject(new Error(`Failed to query captures: ${request.error?.message}`));
      };
    });
  }

  public async getCaptureMetadata(id: string): Promise<AlephCaptureMetadata | null> {
    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CAPTURES, 'readonly');
      const store = tx.objectStore(STORE_CAPTURES);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = () => {
        reject(new Error(`Failed to get capture metadata (${id}): ${request.error?.message}`));
      };
    });
  }

  public async getModelBlob(id: string): Promise<Blob | null> {
    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_MODELS, 'readonly');
      const store = tx.objectStore(STORE_MODELS);
      const request = store.get(id);

      request.onsuccess = () => {
        if (request.result && request.result.blob) {
          resolve(request.result.blob);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        reject(new Error(`Failed to get model blob (${id}): ${request.error?.message}`));
      };
    });
  }

  public async getModelUrl(id: string): Promise<string | null> {
    // Return cached active object URL if one already exists for this id
    if (this.activeObjectUrls.has(id)) {
      return this.activeObjectUrls.get(id)!;
    }

    const blob = await this.getModelBlob(id);
    if (!blob) return null;

    const url = URL.createObjectURL(blob);
    this.activeObjectUrls.set(id, url);
    return url;
  }

  public revokeModelUrl(id: string): void {
    const existing = this.activeObjectUrls.get(id);
    if (existing) {
      URL.revokeObjectURL(existing);
      this.activeObjectUrls.delete(id);
    }
  }

  public async updateMetadata(id: string, updates: Partial<AlephCaptureMetadata>): Promise<void> {
    const db = await this.openDb();
    const existing = await this.getCaptureMetadata(id);
    if (!existing) {
      throw new Error(`Capture metadata with id ${id} not found.`);
    }

    const updated: AlephCaptureMetadata = {
      ...existing,
      ...updates,
      id // Ensure id is never mutated
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CAPTURES, 'readwrite');
      const store = tx.objectStore(STORE_CAPTURES);
      store.put(updated);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to update metadata (${id}): ${tx.error?.message}`));
    });
  }

  public async deleteCapture(id: string): Promise<void> {
    this.revokeModelUrl(id);
    const db = await this.openDb();

    return new Promise((resolve, reject) => {
      const tx = db.transaction([STORE_CAPTURES, STORE_MODELS], 'readwrite');
      tx.objectStore(STORE_CAPTURES).delete(id);
      tx.objectStore(STORE_MODELS).delete(id);

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to delete capture (${id}): ${tx.error?.message}`));
    });
  }

  public async checkStorageQuota(): Promise<StorageQuotaInfo> {
    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
      try {
        const { quota = 0, usage = 0 } = await navigator.storage.estimate();
        return {
          availableMB: Math.max(0, Math.round((quota - usage) / (1024 * 1024))),
          usedMB: Math.round(usage / (1024 * 1024)),
          percent: quota > 0 ? Math.round((usage / quota) * 100) : 0
        };
      } catch (err) {
        console.warn('Storage estimate error:', err);
      }
    }
    return { availableMB: 1024, usedMB: 0, percent: 0 };
  }
}

export const sceneryStorage = new SceneryStorageService();
