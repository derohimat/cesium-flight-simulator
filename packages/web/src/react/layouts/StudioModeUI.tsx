import { useState } from 'react';
import { DirectorPanel } from '../features/director/components/DirectorPanel';
import { CameraControls } from '../features/camera/components/CameraControls';
import { LocationLibrary } from '../features/studio/components/LocationLibrary';
import { ExportPanel } from '../features/studio/components/ExportPanel';
import { useGameMethod } from '../hooks/useGameMethod';
import type { Location } from '../features/studio/components/LocationLibrary';

export function StudioModeUI() {
  const [activePanel, setActivePanel] = useState<'director' | 'locations' | 'export'>('director');
  const [isRecording, setIsRecording] = useState(false);
  const { 
    teleportTo, 
    startRecording, 
    stopRecording 
  } = useGameMethod();

  // Handle location selection - teleport to location
  const handleSelectLocation = (location: Location) => {
    teleportTo(location.lon, location.lat, location.altitude);
  };

  // Handle adding waypoint from location
  const handleAddWaypoint = (_location: Location) => {
    // TODO: Integrate with director panel waypoints
    console.log('Add waypoint:', _location);
  };

  // Export handlers
  const handleExport = (settings: Parameters<typeof console.log>[0]) => {
    console.log('Export with settings:', settings);
    // TODO: Implement export functionality
  };

  const handleTakeScreenshot = () => {
    // TODO: Implement screenshot
    console.log('Taking screenshot...');
  };

  const handleStartRecording = () => {
    startRecording();
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    stopRecording();
    setIsRecording(false);
  };

  return (
    <>
      {/* Top Bar */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 pointer-events-auto">
        <div className="glass-panel px-2 py-1 flex items-center gap-1">
          <PanelTab 
            icon="🎬" 
            label="Director" 
            isActive={activePanel === 'director'} 
            onClick={() => setActivePanel('director')} 
          />
          <PanelTab 
            icon="📍" 
            label="Locations" 
            isActive={activePanel === 'locations'} 
            onClick={() => setActivePanel('locations')} 
          />
          <PanelTab 
            icon="📤" 
            label="Export" 
            isActive={activePanel === 'export'} 
            onClick={() => setActivePanel('export')} 
          />
        </div>
      </div>

      {/* Camera Controls - Top Right */}
      <div className="fixed top-4 right-4 z-50 pointer-events-auto">
        <CameraControls />
      </div>

      {/* Active Panel - Left Side */}
      <div className="fixed top-20 left-4 z-50 pointer-events-auto max-h-[calc(100vh-140px)] overflow-y-auto">
        {activePanel === 'director' && <DirectorPanel />}
        {activePanel === 'locations' && (
          <LocationLibrary 
            onSelectLocation={handleSelectLocation}
            onAddWaypoint={handleAddWaypoint}
          />
        )}
        {activePanel === 'export' && (
          <ExportPanel 
            onExport={handleExport}
            onTakeScreenshot={handleTakeScreenshot}
            isRecording={isRecording}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
          />
        )}
      </div>

      {/* Recording Indicator */}
      {isRecording && (
        <div className="fixed top-4 left-4 z-[60] pointer-events-none">
          <div className="flex items-center gap-2 bg-red-600/90 px-4 py-2 rounded-full animate-pulse">
            <span className="w-3 h-3 bg-white rounded-full" />
            <span className="text-sm font-medium text-white">Recording</span>
          </div>
        </div>
      )}

      {/* Keyboard Shortcuts Hint - Bottom Right */}
      <div className="fixed bottom-4 left-4 z-40 pointer-events-none">
        <div className="glass-panel px-4 py-2 text-xs text-white/50 space-y-1">
          <div className="flex items-center gap-3">
            <span><kbd className="px-1 bg-white/10 rounded">C</kbd> Camera</span>
            <span><kbd className="px-1 bg-white/10 rounded">M</kbd> Mode</span>
            <span><kbd className="px-1 bg-white/10 rounded">R</kbd> Restart</span>
          </div>
        </div>
      </div>

      {/* Branding - Bottom Center */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 pointer-events-none">
        <div className="text-xs text-white/30 flex items-center gap-2">
          <span>🎬</span>
          <span className="font-semibold">SkyStudio</span>
          <span>• Content Creation Platform</span>
        </div>
      </div>
    </>
  );
}

// Panel Tab Component
interface PanelTabProps {
  icon: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function PanelTab({ icon, label, isActive, onClick }: PanelTabProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
        isActive 
          ? 'bg-future-primary text-white' 
          : 'text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      <span className="text-lg">{icon}</span>
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
