import { useState } from 'react';
import type { QualityConfig } from '../../../../cesium/core/Scene';

interface QualitySectionProps {
  title: string;
  config: QualityConfig;
  onUpdateSetting: <K extends keyof QualityConfig>(key: K, value: QualityConfig[K]) => void;
  children: React.ReactNode;
}

function CollapsibleSection({ title, children }: QualitySectionProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-t border-white/10">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between py-2 px-1 hover:bg-white/5 transition-colors"
      >
        <span className="text-[11px] text-white/70 uppercase tracking-wider font-medium">{title}</span>
        <span className="text-white/50 text-xs">{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && <div className="pb-3 space-y-3">{children}</div>}
    </div>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  suffix?: string;
}

function Slider({ label, value, min, max, step, onChange, suffix = '' }: SliderProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-white/80">{label}</span>
        <span className="text-xs text-white font-mono font-semibold">
          {value.toFixed(step < 1 ? 1 : 0)}{suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 
                   [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full 
                   [&::-webkit-slider-thumb]:bg-white/80 [&::-webkit-slider-thumb]:cursor-pointer
                   hover:[&::-webkit-slider-thumb]:bg-white"
      />
    </div>
  );
}

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  description?: string;
}

function Toggle({ label, value, onChange, description }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <div className="text-xs text-white/80">{label}</div>
        {description && <div className="text-[10px] text-white/50 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors
                   ${value ? 'bg-blue-500/80' : 'bg-white/10'}`}
      >
        <span
          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform
                     ${value ? 'translate-x-5' : 'translate-x-1'}`}
        />
      </button>
    </div>
  );
}

interface QualityControlsProps {
  config: QualityConfig;
  adaptive: boolean;
  onAdaptiveChange: (enabled: boolean) => void;
  onUpdateSetting: <K extends keyof QualityConfig>(key: K, value: QualityConfig[K]) => void;
}

const MSAA_OPTIONS = [1, 2, 4, 8];

export function QualityControls({ config, adaptive, onAdaptiveChange, onUpdateSetting }: QualityControlsProps) {
  return (
    <div className="space-y-1">
      <div className="pb-3">
        <Toggle
          label="Adaptive quality"
          value={adaptive}
          onChange={onAdaptiveChange}
          description="Trades MSAA, resolution and tile detail for a steady frame rate; locks to half refresh on 120 Hz+ displays when needed"
        />
      </div>

      <CollapsibleSection title="Antialiasing" config={config} onUpdateSetting={onUpdateSetting}>
        <Toggle
          label="FXAA"
          value={config.fxaaEnabled}
          onChange={(v) => onUpdateSetting('fxaaEnabled', v)}
          description="Post-process edge smoothing"
        />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-white/80">MSAA</span>
            {adaptive && <span className="text-[10px] text-white/40">auto</span>}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {MSAA_OPTIONS.map((samples) => (
              <button
                key={samples}
                onClick={() => onUpdateSetting('msaaSamples', samples)}
                className={`py-1 rounded text-[11px] font-mono transition-colors ${
                  config.msaaSamples === samples
                    ? 'bg-blue-500/70 text-white'
                    : 'bg-white/5 text-white/60 hover:bg-white/10'
                }`}
              >
                {samples === 1 ? 'Off' : `${samples}×`}
              </button>
            ))}
          </div>
        </div>
        <Slider
          label="Resolution"
          value={config.resolutionScale * 100}
          min={50}
          max={100}
          step={5}
          onChange={(v) => onUpdateSetting('resolutionScale', v / 100)}
          suffix="%"
        />
        <div className="text-[10px] text-white/50">
          Changing MSAA or resolution switches adaptive quality off.
        </div>
      </CollapsibleSection>

      <CollapsibleSection title="Terrain Detail" config={config} onUpdateSetting={onUpdateSetting}>
        <Slider
          label="Screen Space Error"
          value={config.maximumScreenSpaceError}
          min={2}
          max={48}
          step={1}
          onChange={(v) => onUpdateSetting('maximumScreenSpaceError', v)}
        />
        <div className="text-[10px] text-white/60">
          Lower = more detail, slower. 8 = car, 24 = aircraft
        </div>
        
        <Slider
          label="Dynamic SSE Factor"
          value={config.dynamicScreenSpaceErrorFactor}
          min={8}
          max={48}
          step={1}
          onChange={(v) => onUpdateSetting('dynamicScreenSpaceErrorFactor', v)}
        />
        
        <Toggle
          label="Dynamic SSE"
          value={config.dynamicScreenSpaceError}
          onChange={(v) => onUpdateSetting('dynamicScreenSpaceError', v)}
          description="Reduce quality at distance"
        />
        
        <Toggle
          label="Skip LOD"
          value={config.skipLevelOfDetail}
          onChange={(v) => onUpdateSetting('skipLevelOfDetail', v)}
          description="Skip intermediate detail levels"
        />
      </CollapsibleSection>

      <CollapsibleSection title="Post-Processing" config={config} onUpdateSetting={onUpdateSetting}>
        <Toggle
          label="Bloom"
          value={config.bloomEnabled}
          onChange={(v) => onUpdateSetting('bloomEnabled', v)}
          description="Glow effect on bright areas"
        />
        
        <Toggle
          label="HDR"
          value={config.hdr}
          onChange={(v) => onUpdateSetting('hdr', v)}
          description="High Dynamic Range rendering"
        />
        
        <Slider
          label="Exposure"
          value={config.exposure}
          min={0.5}
          max={3.0}
          step={0.1}
          onChange={(v) => onUpdateSetting('exposure', v)}
        />
      </CollapsibleSection>
    </div>
  );
}

