import { useState } from 'react';
import { Panel } from '../../../shared/components/Panel';

type Resolution = '720p' | '1080p' | '4k';
type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5';
type ExportFormat = 'mp4' | 'webm' | 'gif';

interface ExportSettings {
  resolution: Resolution;
  aspectRatio: AspectRatio;
  format: ExportFormat;
  quality: number;
  fps: number;
  filename: string;
}

const RESOLUTION_SIZES = {
  '720p': { '16:9': '1280×720', '9:16': '720×1280', '1:1': '720×720', '4:5': '576×720' },
  '1080p': { '16:9': '1920×1080', '9:16': '1080×1920', '1:1': '1080×1080', '4:5': '864×1080' },
  '4k': { '16:9': '3840×2160', '9:16': '2160×3840', '1:1': '2160×2160', '4:5': '1728×2160' },
};

const ASPECT_RATIO_LABELS = {
  '16:9': { icon: '🖥️', label: 'Landscape', platform: 'YouTube, Desktop' },
  '9:16': { icon: '📱', label: 'Portrait', platform: 'TikTok, Reels, Shorts' },
  '1:1': { icon: '⬜', label: 'Square', platform: 'Instagram Feed' },
  '4:5': { icon: '📷', label: 'Portrait+', platform: 'Instagram, Pinterest' },
};

interface ExportPanelProps {
  onExport: (settings: ExportSettings) => void;
  onTakeScreenshot: () => void;
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function ExportPanel({
  onExport,
  onTakeScreenshot,
  isRecording,
  onStartRecording,
  onStopRecording,
}: ExportPanelProps) {
  const [settings, setSettings] = useState<ExportSettings>({
    resolution: '1080p',
    aspectRatio: '16:9',
    format: 'mp4',
    quality: 90,
    fps: 30,
    filename: 'skystudio_export',
  });

  const [showAdvanced, setShowAdvanced] = useState(false);

  const updateSettings = (updates: Partial<ExportSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
  };

  const currentSize = RESOLUTION_SIZES[settings.resolution][settings.aspectRatio];

  return (
    <Panel title="📤 Export Settings" className="w-80">
      <div className="space-y-4">
        {/* Quick Record Controls */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={`flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all ${
              isRecording 
                ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' 
                : 'bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white'
            }`}
          >
            {isRecording ? (
              <>
                <span className="w-3 h-3 bg-white rounded-sm" />
                Stop
              </>
            ) : (
              <>
                <span className="w-3 h-3 bg-white rounded-full" />
                Record
              </>
            )}
          </button>
          
          <button
            onClick={onTakeScreenshot}
            className="flex items-center justify-center gap-2 py-3 rounded-lg font-medium bg-gradient-to-r from-future-primary to-future-accent hover:opacity-90 text-white transition-all"
          >
            📷 Screenshot
          </button>
        </div>

        {/* Aspect Ratio Selector */}
        <div className="space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-wider">Aspect Ratio</label>
          <div className="grid grid-cols-4 gap-1">
            {(Object.keys(ASPECT_RATIO_LABELS) as AspectRatio[]).map(ratio => (
              <button
                key={ratio}
                onClick={() => updateSettings({ aspectRatio: ratio })}
                className={`relative flex flex-col items-center gap-1 py-2 px-1 rounded-lg transition-all ${
                  settings.aspectRatio === ratio 
                    ? 'bg-future-primary text-white ring-2 ring-future-primary ring-offset-2 ring-offset-black/50' 
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                <span className="text-lg">{ASPECT_RATIO_LABELS[ratio].icon}</span>
                <span className="text-[10px] font-medium">{ratio}</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-white/40 text-center">
            {ASPECT_RATIO_LABELS[settings.aspectRatio].platform}
          </p>
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-wider">Resolution</label>
          <div className="grid grid-cols-3 gap-2">
            {(['720p', '1080p', '4k'] as Resolution[]).map(res => (
              <button
                key={res}
                onClick={() => updateSettings({ resolution: res })}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  settings.resolution === res 
                    ? 'bg-future-primary text-white' 
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {res.toUpperCase()}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/40 text-center font-mono">{currentSize}</p>
        </div>

        {/* Format */}
        <div className="space-y-2">
          <label className="text-xs text-white/50 uppercase tracking-wider">Format</label>
          <div className="grid grid-cols-3 gap-2">
            {(['mp4', 'webm', 'gif'] as ExportFormat[]).map(format => (
              <button
                key={format}
                onClick={() => updateSettings({ format })}
                className={`py-2 rounded-lg text-sm font-medium uppercase transition-all ${
                  settings.format === format 
                    ? 'bg-future-secondary text-white' 
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {format}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Settings Toggle */}
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between py-2 px-3 bg-white/5 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          <span>Advanced Settings</span>
          <span className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`}>▼</span>
        </button>

        {/* Advanced Settings Panel */}
        {showAdvanced && (
          <div className="space-y-3 p-3 bg-white/5 rounded-lg border border-white/10">
            {/* Quality */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-white/60">Quality</span>
                <span className="text-white/80">{settings.quality}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="100"
                value={settings.quality}
                onChange={(e) => updateSettings({ quality: parseInt(e.target.value) })}
                className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* FPS */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-white/60">Frame Rate</span>
                <span className="text-white/80">{settings.fps} FPS</span>
              </div>
              <div className="flex gap-2">
                {[24, 30, 60].map(fps => (
                  <button
                    key={fps}
                    onClick={() => updateSettings({ fps })}
                    className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                      settings.fps === fps 
                        ? 'bg-future-accent text-white' 
                        : 'bg-white/10 text-white/60 hover:bg-white/20'
                    }`}
                  >
                    {fps}
                  </button>
                ))}
              </div>
            </div>

            {/* Filename */}
            <div className="space-y-1">
              <label className="text-xs text-white/60">Filename</label>
              <input
                type="text"
                value={settings.filename}
                onChange={(e) => updateSettings({ filename: e.target.value })}
                className="w-full bg-black/30 border border-white/10 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-future-primary"
              />
            </div>
          </div>
        )}

        {/* Export Button */}
        <button
          onClick={() => onExport(settings)}
          className="w-full py-3 rounded-lg font-medium bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white transition-all flex items-center justify-center gap-2"
        >
          <span>💾</span>
          Export Video
        </button>

        {/* Presets */}
        <div className="pt-2 border-t border-white/10">
          <p className="text-xs text-white/40 mb-2">Quick Presets</p>
          <div className="flex flex-wrap gap-1">
            <button
              onClick={() => updateSettings({ aspectRatio: '9:16', resolution: '1080p' })}
              className="px-2 py-1 text-xs bg-pink-500/20 text-pink-300 rounded hover:bg-pink-500/30 transition-colors"
            >
              TikTok
            </button>
            <button
              onClick={() => updateSettings({ aspectRatio: '16:9', resolution: '1080p' })}
              className="px-2 py-1 text-xs bg-red-500/20 text-red-300 rounded hover:bg-red-500/30 transition-colors"
            >
              YouTube
            </button>
            <button
              onClick={() => updateSettings({ aspectRatio: '1:1', resolution: '1080p' })}
              className="px-2 py-1 text-xs bg-purple-500/20 text-purple-300 rounded hover:bg-purple-500/30 transition-colors"
            >
              Instagram
            </button>
            <button
              onClick={() => updateSettings({ aspectRatio: '16:9', resolution: '4k' })}
              className="px-2 py-1 text-xs bg-blue-500/20 text-blue-300 rounded hover:bg-blue-500/30 transition-colors"
            >
              Cinema 4K
            </button>
          </div>
        </div>
      </div>
    </Panel>
  );
}

export type { ExportSettings };
