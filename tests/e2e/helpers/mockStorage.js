/**
 * Mock & Reference Implementation of ISceneryStorage adhering to PROJECT.md
 * with dual object stores: 'captures' (metadata) and 'models' (binary blobs).
 * Includes fault injection for Tier 2 boundary and quota testing.
 */

export class MockSceneryStorage {
  constructor() {
    this.captures = new Map(); // id -> AlephCaptureMetadata
    this.models = new Map();   // id -> Buffer | Blob
    this.objectUrls = new Map(); // id -> string
    this.isInitialized = false;
    this.quotaExceeded = false;
    this.simulateError = null;
  }

  async init() {
    if (this.simulateError) {
      throw new Error(this.simulateError);
    }
    this.isInitialized = true;
  }

  setQuotaExceeded(exceeded) {
    this.quotaExceeded = Boolean(exceeded);
  }

  setSimulateError(errorMessage) {
    this.simulateError = errorMessage;
  }

  async saveCapture(metadata, glbData) {
    if (!this.isInitialized) {
      await this.init();
    }
    if (this.quotaExceeded) {
      const err = new Error('The quota has been exceeded.');
      err.name = 'QuotaExceededError';
      throw err;
    }
    if (this.simulateError) {
      throw new Error(this.simulateError);
    }
    if (!metadata || !metadata.id) {
      throw new Error('Invalid capture metadata: missing id');
    }
    const byteLen = glbData?.byteLength ?? glbData?.length ?? glbData?.size ?? 0;
    if (!glbData || byteLen === 0) {
      throw new Error('Invalid GLB data: buffer cannot be empty');
    }

    const captureToSave = {
      ...metadata,
      importedAt: metadata.importedAt || Date.now(),
      isolationEnabled: metadata.isolationEnabled ?? true,
      altitudeOffset: metadata.altitudeOffset ?? 0,
      heading: metadata.heading ?? 0,
      scale: metadata.scale ?? 1.0,
    };

    this.captures.set(metadata.id, captureToSave);
    this.models.set(metadata.id, glbData);

    return metadata.id;
  }

  async getAllCaptures() {
    if (!this.isInitialized) await this.init();
    const list = Array.from(this.captures.values());
    // Sort descending by importedAt
    return list.sort((a, b) => (b.importedAt || 0) - (a.importedAt || 0));
  }

  async getCaptureMetadata(id) {
    if (!this.isInitialized) await this.init();
    return this.captures.get(id) || null;
  }

  async getModelBlob(id) {
    if (!this.isInitialized) await this.init();
    return this.models.get(id) || null;
  }

  async getModelUrl(id) {
    if (!this.isInitialized) await this.init();
    if (!this.models.has(id)) return null;
    if (!this.objectUrls.has(id)) {
      this.objectUrls.set(id, `blob:cesium-sim/${id}`);
    }
    return this.objectUrls.get(id);
  }

  async updateMetadata(id, updates) {
    if (!this.isInitialized) await this.init();
    const existing = this.captures.get(id);
    if (!existing) {
      throw new Error(`Capture with id '${id}' not found`);
    }
    const updated = {
      ...existing,
      ...updates,
      id, // id cannot be changed
    };
    this.captures.set(id, updated);
  }

  async deleteCapture(id) {
    if (!this.isInitialized) await this.init();
    this.captures.delete(id);
    this.models.delete(id);
    if (this.objectUrls.has(id)) {
      this.objectUrls.delete(id);
    }
  }

  clear() {
    this.captures.clear();
    this.models.clear();
    this.objectUrls.clear();
    this.isInitialized = false;
    this.quotaExceeded = false;
    this.simulateError = null;
  }
}
