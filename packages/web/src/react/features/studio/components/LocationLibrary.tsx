import { useState, useEffect, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { PLACES, type Place } from '../../../../data/places';
import { sceneryStorage, parseCapturePackage, type AlephCaptureMetadata } from '../../../../services/aleph';
import { useOptionalGameBridge } from '../../../hooks/useGameBridge';
import type { ICustomSceneryManager } from '../../../../cesium/managers/CustomSceneryManager';
import { cinematographyPresets, type PresetOptions } from '../../../../services/cinematography';
import type { Keyframe } from './FlightTimeline';
import { getUserLocation } from '../../../../utils/geolocation';

export interface Location extends Place {
  customCapture?: AlephCaptureMetadata;
  isCustom?: boolean;
  isBundled?: boolean;
}

// Curated cinematic locations (shared with missions and landmark cards)
const PRESET_LOCATIONS: Location[] = PLACES;

interface LocationLibraryProps {
  onSelectLocation: (location: Location) => void;
  onAddWaypoint: (location: Location) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onCustomLocationDetail?: (capture: AlephCaptureMetadata) => void;
  customSceneryManager?: ICustomSceneryManager;
  onApplyCinematographyPreset?: (presetName: 'orbit' | 'flyby' | 'spiral', keyframes: Keyframe[]) => void;
  onClose?: () => void;
}

const CATEGORY_ICONS = {
  landmark: '🏛️',
  city: '🌆',
  nature: '🏔️',
  custom: '📍',
};

const CATEGORY_LABELS = {
  landmark: 'Landmarks',
  city: 'Cities',
  nature: 'Nature',
  custom: 'My Locations',
};

export function LocationLibrary({ 
  onSelectLocation, 
  onAddWaypoint,
  isCollapsed = false,
  onToggleCollapse,
  onCustomLocationDetail,
  customSceneryManager,
  onApplyCinematographyPreset,
  onClose,
}: LocationLibraryProps) {
  const optionalBridge = useOptionalGameBridge();
  const sceneryManager = customSceneryManager || (optionalBridge ? optionalBridge.getCustomSceneryManager() : undefined);

  const [selectedCategory, setSelectedCategory] = useState<Location['category'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Custom Aleph Scenery State
  const [customLocations, setCustomLocations] = useState<Location[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [selectedCustomId, setSelectedCustomId] = useState<string | null>(null);

  // Selected Capture & Inspector Drawer State
  const [selectedCapture, setSelectedCapture] = useState<AlephCaptureMetadata | null>(null);
  const [altitudeOffset, setAltitudeOffset] = useState<number>(0);
  const [heading, setHeading] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [isolationEnabled, setIsolationEnabled] = useState<boolean>(true);
  const [isInspectorExpanded, setIsInspectorExpanded] = useState<boolean>(true);
  const [isLocating, setIsLocating] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = ['all', 'landmark', 'city', 'nature', 'custom'] as const;

  const handleTeleportToUserLocation = async () => {
    setIsLocating(true);
    try {
      const loc = await getUserLocation(5000);
      const userLocItem: Location = {
        id: 'user-current-location',
        name: 'My Current Location',
        category: 'custom',
        lat: loc.lat,
        lon: loc.lng,
        altitude: 200,
        description: 'Real-world GPS position',
      };
      if (sceneryManager) {
        sceneryManager.unloadScenery();
      }
      setSelectedCustomId(null);
      setSelectedCapture(null);
      onSelectLocation(userLocItem);
    } catch (err) {
      console.warn('Failed to teleport to current location:', err);
    } finally {
      setIsLocating(false);
    }
  };

  const loadCaptures = useCallback(async () => {
    try {
      await sceneryStorage.init();
      const captures = await sceneryStorage.getAllCaptures();
      const locs: Location[] = captures.map((c) => ({
        id: c.id,
        name: c.name,
        category: 'custom' as const,
        lat: c.lat,
        lon: c.lon,
        altitude: c.baseAltitude + (c.altitudeOffset || 0) + Math.max(100, (c.radius || 50) * 1.5),
        description: c.description || `Aleph 3D Capture (${c.lat.toFixed(4)}, ${c.lon.toFixed(4)})`,
        fact: c.isBundled ? 'Bundled Roman Colosseum sample capture' : 'Custom Aleph 3D capture',
        thumbnail: c.thumbnailUrl || (c.isBundled ? '/samples/colosseum/thumbnail.jpg' : undefined),
        customCapture: c,
        isCustom: true,
        isBundled: c.isBundled
      }));
      setCustomLocations(locs);
    } catch (err) {
      console.error('Failed to load scenery captures:', err);
    }
  }, []);

  useEffect(() => {
    loadCaptures();
  }, [loadCaptures]);

  // Synchronize inspector controls whenever active capture selection changes
  useEffect(() => {
    if (selectedCapture) {
      setAltitudeOffset(selectedCapture.altitudeOffset ?? 0);
      setHeading(selectedCapture.heading ?? 0);
      setScale(selectedCapture.scale ?? 1.0);
      setIsolationEnabled(selectedCapture.isolationEnabled ?? true);
    }
  }, [selectedCapture?.id]);

  const updateCaptureInState = useCallback((id: string, updates: Partial<AlephCaptureMetadata>) => {
    setCustomLocations((prev) =>
      prev.map((loc) => {
        if (loc.id === id && loc.customCapture) {
          const updatedCapture: AlephCaptureMetadata = {
            ...loc.customCapture,
            ...updates,
          };
          return {
            ...loc,
            altitude: updatedCapture.baseAltitude + (updatedCapture.altitudeOffset || 0) + Math.max(100, (updatedCapture.radius || 50) * 1.5),
            customCapture: updatedCapture,
          };
        }
        return loc;
      })
    );
    setSelectedCapture((prev) => (prev && prev.id === id ? { ...prev, ...updates } : prev));
  }, []);

  const handleAltitudeChange = (newVal: number) => {
    setAltitudeOffset(newVal);
    if (sceneryManager) {
      sceneryManager.updateTransform(newVal, heading, scale);
    }
    if (selectedCapture) {
      updateCaptureInState(selectedCapture.id, { altitudeOffset: newVal });
      sceneryStorage.updateMetadata(selectedCapture.id, { altitudeOffset: newVal }).catch(console.error);
    }
  };

  const handleHeadingChange = (newVal: number) => {
    setHeading(newVal);
    if (sceneryManager) {
      sceneryManager.updateTransform(altitudeOffset, newVal, scale);
    }
    if (selectedCapture) {
      updateCaptureInState(selectedCapture.id, { heading: newVal });
      sceneryStorage.updateMetadata(selectedCapture.id, { heading: newVal }).catch(console.error);
    }
  };

  const handleScaleChange = (newVal: number) => {
    setScale(newVal);
    if (sceneryManager) {
      sceneryManager.updateTransform(altitudeOffset, heading, newVal);
    }
    if (selectedCapture) {
      updateCaptureInState(selectedCapture.id, { scale: newVal });
      sceneryStorage.updateMetadata(selectedCapture.id, { scale: newVal }).catch(console.error);
    }
  };

  const handleIsolationToggle = () => {
    const newVal = !isolationEnabled;
    setIsolationEnabled(newVal);
    if (sceneryManager) {
      sceneryManager.setIsolation(newVal);
    }
    if (selectedCapture) {
      updateCaptureInState(selectedCapture.id, { isolationEnabled: newVal });
      sceneryStorage.updateMetadata(selectedCapture.id, { isolationEnabled: newVal }).catch(console.error);
    }
  };

  const handleResetDefaults = () => {
    const defAlt = 0;
    const defHeading = 0;
    const defScale = 1.0;
    const defIsolation = true;

    setAltitudeOffset(defAlt);
    setHeading(defHeading);
    setScale(defScale);
    setIsolationEnabled(defIsolation);

    if (sceneryManager) {
      sceneryManager.updateTransform(defAlt, defHeading, defScale);
      sceneryManager.setIsolation(defIsolation);
    }

    if (selectedCapture) {
      const updates = { altitudeOffset: defAlt, heading: defHeading, scale: defScale, isolationEnabled: defIsolation };
      updateCaptureInState(selectedCapture.id, updates);
      sceneryStorage.updateMetadata(selectedCapture.id, updates).catch(console.error);
    }
  };

  const handleApplyPreset = (presetType: 'orbit' | 'flyby' | 'spiral') => {
    if (!selectedCapture) return;

    const baseAlt = selectedCapture.baseAltitude + (altitudeOffset ?? 0);
    const rad = (selectedCapture.radius && selectedCapture.radius > 0)
      ? selectedCapture.radius * (scale ?? 1.0)
      : 50.0;

    const options: PresetOptions = {
      centerLat: selectedCapture.lat,
      centerLon: selectedCapture.lon,
      baseAltitude: baseAlt,
      radius: rad,
      durationSeconds: presetType === 'orbit' ? 15 : presetType === 'flyby' ? 12 : 18,
    };

    let generatedKeyframes: Keyframe[] = [];
    if (presetType === 'orbit') {
      generatedKeyframes = cinematographyPresets.generateOrbitKeyframes(options);
    } else if (presetType === 'flyby') {
      generatedKeyframes = cinematographyPresets.generateFlyByKeyframes(options);
    } else if (presetType === 'spiral') {
      generatedKeyframes = cinematographyPresets.generateSpiralRevealKeyframes(options);
    }

    if (generatedKeyframes.length > 0) {
      const firstKf = generatedKeyframes[0];
      if (optionalBridge?.teleportTo) {
        optionalBridge.teleportTo(firstKf.lon, firstKf.lat, firstKf.altitude, firstKf.heading);
      }
      onSelectLocation({
        id: selectedCapture.id,
        name: selectedCapture.name,
        category: 'custom',
        lat: firstKf.lat,
        lon: firstKf.lon,
        altitude: firstKf.altitude,
        description: selectedCapture.description,
        thumbnail: selectedCapture.thumbnailUrl,
        customCapture: selectedCapture,
        isCustom: true,
        isBundled: selectedCapture.isBundled,
      });

      if (onApplyCinematographyPreset) {
        onApplyCinematographyPreset(presetType, generatedKeyframes);
      }
    }
  };

  const allLocations: Location[] = [...PRESET_LOCATIONS, ...customLocations];

  const filteredLocations = allLocations.filter(loc => {
    const matchesCategory = selectedCategory === 'all' || loc.category === selectedCategory;
    const matchesSearch = loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          loc.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFavorites = !showFavoritesOnly || favorites.has(loc.id);
    return matchesCategory && matchesSearch && matchesFavorites;
  });

  const toggleFavorite = (id: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(id)) {
      newFavorites.delete(id);
    } else {
      newFavorites.add(id);
    }
    setFavorites(newFavorites);
  };

  const handleFiles = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setIsImporting(true);
    setImportError(null);
    setImportSuccess(null);

    try {
      const parsed = await parseCapturePackage(files);
      await sceneryStorage.saveCapture(parsed.metadata, parsed.glbBlob);
      await loadCaptures();
      setSelectedCategory('custom');
      setSelectedCustomId(parsed.metadata.id);
      setSelectedCapture(parsed.metadata);
      setIsInspectorExpanded(true);

      const newLoc: Location = {
        id: parsed.metadata.id,
        name: parsed.metadata.name,
        category: 'custom',
        lat: parsed.metadata.lat,
        lon: parsed.metadata.lon,
        altitude: parsed.metadata.baseAltitude + Math.max(100, (parsed.metadata.radius || 50) * 1.5),
        description: parsed.metadata.description,
        thumbnail: parsed.metadata.thumbnailUrl,
        customCapture: parsed.metadata,
        isCustom: true
      };

      if (sceneryManager) {
        try {
          const modelUrl = await sceneryStorage.getModelUrl(parsed.metadata.id);
          if (modelUrl) {
            await sceneryManager.loadScenery(parsed.metadata, modelUrl);
          }
        } catch (err) {
          console.error('Error loading newly imported scenery:', err);
        }
      }

      onSelectLocation(newLoc);
      if (onCustomLocationDetail) {
        onCustomLocationDetail(parsed.metadata);
      }

      setImportSuccess(`Imported "${parsed.metadata.name}"!`);
      setTimeout(() => setImportSuccess(null), 4000);
    } catch (err) {
      setImportError((err as Error).message || 'Failed to import capture.');
      setTimeout(() => setImportError(null), 6000);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await handleFiles(e.target.files);
    }
  };

  const handleDeleteCustomLocation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await sceneryStorage.deleteCapture(id);
      await loadCaptures();
      if (selectedCustomId === id) {
        if (sceneryManager) {
          sceneryManager.unloadScenery();
        }
        setSelectedCustomId(null);
        setSelectedCapture(null);
      }
    } catch (err) {
      console.error('Failed to delete custom location:', err);
    }
  };

  const handleLocationClick = async (location: Location) => {
    if (location.isCustom && location.customCapture) {
      setSelectedCustomId(location.id);
      setSelectedCapture(location.customCapture);
      setIsInspectorExpanded(true);

      if (sceneryManager) {
        try {
          const modelUrl = await sceneryStorage.getModelUrl(location.customCapture.id);
          if (modelUrl) {
            await sceneryManager.loadScenery(location.customCapture, modelUrl);
          }
        } catch (err) {
          console.error('Error loading custom scenery:', err);
        }
      }

      if (onCustomLocationDetail) {
        onCustomLocationDetail(location.customCapture);
      }
    } else {
      setSelectedCustomId(null);
      setSelectedCapture(null);
      if (sceneryManager) {
        sceneryManager.unloadScenery();
      }
    }
    onSelectLocation(location);
  };

  if (isCollapsed) {
    return (
      <button
        onClick={onToggleCollapse}
        className="glass-panel p-3 hover:bg-white/10 transition-colors"
        title="Open Location Library"
      >
        <span className="text-xl">🌍</span>
      </button>
    );
  }

  return (
    <Panel title="📍 Location Library" onClose={onClose} className="w-80">
      <div 
        className="space-y-3"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search locations..."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pl-9 text-sm text-white placeholder:text-white/40 focus:outline-none focus:border-future-primary/50"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40">🔍</span>
        </div>

        {/* Quick Current Location Action */}
        <button
          onClick={handleTeleportToUserLocation}
          disabled={isLocating}
          className="w-full px-3 py-1.5 bg-future-primary/10 hover:bg-future-primary/20 border border-future-primary/30 rounded-lg text-xs font-medium text-future-primary hover:text-white transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <span className={isLocating ? 'animate-spin' : 'animate-pulse'}>
            {isLocating ? '⏳' : '📍'}
          </span>
          <span>{isLocating ? 'Acquiring GPS...' : 'Fly to My Current Location'}</span>
        </button>

        {/* Category Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
                selectedCategory === cat 
                  ? 'bg-future-primary text-white font-medium' 
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cat === 'all' ? '🌐 All' : `${CATEGORY_ICONS[cat]} ${CATEGORY_LABELS[cat]}`}
              {cat === 'custom' && customLocations.length > 0 && ` (${customLocations.length})`}
            </button>
          ))}
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
              showFavoritesOnly 
                ? 'bg-yellow-500 text-black font-medium' 
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            ⭐ Favorites
          </button>
        </div>

        {/* Aleph Drag-and-Drop Ingestion Card */}
        <div 
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-3 text-center transition-all cursor-pointer select-none ${
            isDragging 
              ? 'border-future-primary bg-future-primary/20 scale-[1.02]' 
              : 'border-white/20 hover:border-future-primary/60 bg-white/5 hover:bg-white/10'
          }`}
          title="Click to browse or drop an Aleph 3D capture package (.glb, .json, .zip)"
        >
          <div className="flex items-center justify-center gap-2">
            <span className="text-xl">{isImporting ? '⏳' : '📥'}</span>
            <div className="text-xs font-semibold text-white">
              {isImporting ? 'Ingesting Aleph 3D Capture...' : 'Import Aleph 3D Capture'}
            </div>
          </div>
          <div className="text-[10px] text-white/50 mt-1">
            Drop mesh.glb + metadata or click to browse
          </div>
          <input 
            ref={fileInputRef} 
            type="file" 
            accept=".glb,.gltf,.json,.zip" 
            multiple 
            className="hidden" 
            onChange={handleFileInputChange} 
          />
        </div>

        {/* Import Status Banners */}
        {importError && (
          <div className="p-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-xs flex items-start gap-2">
            <span>⚠️</span>
            <span className="flex-1">{importError}</span>
          </div>
        )}
        {importSuccess && (
          <div className="p-2 rounded-lg bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
            <span>✅</span>
            <span className="flex-1">{importSuccess}</span>
          </div>
        )}

        {/* Scenery Inspector Drawer */}
        {selectedCapture && (
          <div className="border border-future-primary/40 bg-future-primary/10 rounded-xl p-3 space-y-3 transition-all">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm">🛠️</span>
                <span className="text-xs font-semibold text-white truncate">
                  Scenery Inspector: {selectedCapture.name}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsInspectorExpanded(!isInspectorExpanded)}
                  className="text-xs text-white/60 hover:text-white px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10"
                  title={isInspectorExpanded ? 'Collapse Inspector' : 'Expand Inspector'}
                >
                  {isInspectorExpanded ? '▲' : '▼'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCustomId(null);
                    setSelectedCapture(null);
                  }}
                  className="text-xs text-white/40 hover:text-white/80 px-1 py-0.5 rounded"
                  title="Close Inspector"
                >
                  ✕
                </button>
              </div>
            </div>

            {isInspectorExpanded && (
              <div className="space-y-3 pt-1 border-t border-white/10 text-xs">
                {/* Altitude Offset slider */}
                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span>Altitude Offset</span>
                    <span className="font-mono text-future-primary font-medium">
                      {altitudeOffset >= 0 ? `+${altitudeOffset.toFixed(1)}m` : `${altitudeOffset.toFixed(1)}m`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-100"
                    max="100"
                    step="0.5"
                    value={altitudeOffset}
                    onChange={(e) => handleAltitudeChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-future-primary"
                    aria-label="Altitude Offset"
                  />
                  <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-0.5">
                    <span>-100m</span>
                    <span>0m</span>
                    <span>+100m</span>
                  </div>
                </div>

                {/* Heading Rotation slider */}
                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span>Heading Rotation</span>
                    <span className="font-mono text-future-primary font-medium">
                      {Math.round(heading)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={heading}
                    onChange={(e) => handleHeadingChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-future-primary"
                    aria-label="Heading Rotation"
                  />
                  <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-0.5">
                    <span>0° (N)</span>
                    <span>90° (E)</span>
                    <span>180° (S)</span>
                    <span>270° (W)</span>
                    <span>360°</span>
                  </div>
                </div>

                {/* Scaling slider */}
                <div>
                  <div className="flex justify-between text-white/70 mb-1">
                    <span>Scale</span>
                    <span className="font-mono text-future-primary font-medium">
                      {scale.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.05"
                    value={scale}
                    onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-future-primary"
                    aria-label="Scaling"
                  />
                  <div className="flex justify-between text-[10px] text-white/30 px-0.5 mt-0.5">
                    <span>0.1x</span>
                    <span>1.0x</span>
                    <span>5.0x</span>
                  </div>
                </div>

                {/* Scenery Isolation toggle */}
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <div className="font-medium text-white/90">Scenery Isolation</div>
                    <div className="text-[10px] text-white/40">Clip background tiles to prevent z-fighting</div>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isolationEnabled}
                    onClick={handleIsolationToggle}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      isolationEnabled
                        ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                        : 'bg-white/10 text-white/50 hover:bg-white/20'
                    }`}
                  >
                    {isolationEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* Cinematography Presets */}
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <div className="flex items-center justify-between text-xs text-white/80">
                    <span className="font-medium flex items-center gap-1.5">
                      <span>🎬</span>
                      <span>Cinematography Presets</span>
                    </span>
                    <span className="text-[10px] text-white/40">1-click camera moves</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleApplyPreset('orbit')}
                      className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white text-xs font-medium border border-white/10 hover:border-future-primary/40 transition-all flex flex-col items-center gap-1 group text-center"
                      title="360° circular camera orbit around model center"
                    >
                      <span className="text-base group-hover:scale-110 transition-transform">🎬</span>
                      <span className="font-semibold text-[11px] leading-tight">360° Orbit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset('flyby')}
                      className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/90 hover:text-white text-xs font-medium border border-white/10 hover:border-future-primary/40 transition-all flex flex-col items-center gap-1 group text-center"
                      title="Cinematic linear fly-by with tracking camera"
                    >
                      <span className="text-base group-hover:scale-110 transition-transform">✈️</span>
                      <span className="font-semibold text-[11px] leading-tight">Cinematic Fly-by</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyPreset('spiral')}
                      className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/90 hover:text-white text-xs font-medium border border-white/10 hover:border-future-primary/40 transition-all flex flex-col items-center gap-1 group text-center"
                      title="Ascending helical reveal expanding outward"
                    >
                      <span className="text-base group-hover:scale-110 transition-transform">🌀</span>
                      <span className="font-semibold text-[11px] leading-tight">Spiral Reveal</span>
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <button
                    type="button"
                    onClick={handleResetDefaults}
                    className="px-2.5 py-1 text-xs text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center gap-1"
                    title="Reset altitude offset, heading, scale, and isolation to defaults"
                  >
                    <span>↺</span>
                    <span>Reset Defaults</span>
                  </button>
                  <div className="text-[10px] text-white/40">
                    Auto-saved to storage
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Location List */}
        <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
          {filteredLocations.length === 0 ? (
            <div className="text-center py-8 text-white/40 text-sm">
              {selectedCategory === 'custom' 
                ? 'No custom captures yet. Drag and drop an Aleph mesh.glb here!'
                : 'No locations found'}
            </div>
          ) : (
            filteredLocations.map(location => (
              <div
                key={location.id}
                onClick={() => handleLocationClick(location)}
                className={`group flex items-center gap-2 p-2 rounded-lg transition-colors cursor-pointer ${
                  selectedCustomId === location.id
                    ? 'bg-future-primary/20 border border-future-primary/40'
                    : 'bg-white/5 hover:bg-white/10 border border-transparent'
                }`}
              >
                {/* Thumbnail / Icon */}
                {location.thumbnail ? (
                  <img
                    src={location.thumbnail}
                    alt={location.name}
                    className="w-8 h-8 rounded-lg object-cover border border-white/10 bg-black/40"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-future-primary/20 to-future-secondary/20 flex items-center justify-center text-lg flex-shrink-0">
                    {CATEGORY_ICONS[location.category]}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-medium text-white truncate">{location.name}</span>
                    {location.isBundled && (
                      <span className="px-1 py-0.2 text-[9px] font-bold bg-amber-500/30 text-amber-300 rounded border border-amber-500/40">
                        SAMPLE
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-white/50 truncate">{location.description}</div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(location.id);
                    }}
                    className="p-1.5 rounded hover:bg-white/10 transition-colors"
                    title="Toggle Favorite"
                  >
                    {favorites.has(location.id) ? '⭐' : '☆'}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddWaypoint(location);
                    }}
                    className="p-1.5 rounded hover:bg-white/10 transition-colors text-future-primary"
                    title="Add as Waypoint"
                  >
                    ➕
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleLocationClick(location);
                    }}
                    className="p-1.5 rounded hover:bg-white/10 transition-colors text-future-accent"
                    title="Teleport Here"
                  >
                    🚀
                  </button>
                  {location.isCustom && !location.isBundled && (
                    <button
                      onClick={(e) => handleDeleteCustomLocation(location.id, e)}
                      className="p-1.5 rounded hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
                      title="Delete Custom Location"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats */}
        <div className="text-xs text-white/40 text-center pt-2 border-t border-white/10">
          {filteredLocations.length} location{filteredLocations.length !== 1 ? 's' : ''} • {favorites.size} favorite{favorites.size !== 1 ? 's' : ''}
          {customLocations.length > 0 && ` • ${customLocations.length} custom`}
        </div>
      </div>
    </Panel>
  );
}
