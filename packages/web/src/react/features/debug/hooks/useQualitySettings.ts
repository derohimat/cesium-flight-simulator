import { useState, useEffect, useCallback } from 'react';
import { useGameMethod } from '../../../hooks/useGameMethod';
import type { QualityConfig } from '../../../../cesium/core/Scene';

export function useQualitySettings() {
  const {
    getQualitySettings,
    updateQualitySettings,
    applyQualityPreset,
    getPerformanceStats,
    setAdaptiveQuality,
  } = useGameMethod();
  const [config, setConfig] = useState<QualityConfig>(getQualitySettings());
  const [adaptive, setAdaptiveState] = useState(() => getPerformanceStats().adaptive);

  // The governor changes MSAA/resolution on its own, so keep polling while the panel is open.
  useEffect(() => {
    const interval = setInterval(() => {
      setConfig(getQualitySettings());
      setAdaptiveState(getPerformanceStats().adaptive);
    }, 500);
    return () => clearInterval(interval);
  }, [getQualitySettings, getPerformanceStats]);

  const updateSetting = <K extends keyof QualityConfig>(key: K, value: QualityConfig[K]) => {
    const newConfig = { [key]: value };
    updateQualitySettings(newConfig);
    setConfig(prev => ({ ...prev, ...newConfig }));
    if (key === 'msaaSamples' || key === 'resolutionScale') {
      setAdaptiveState(false);
    }
  };

  const applyPreset = (preset: 'performance' | 'balanced' | 'quality' | 'ultra') => {
    applyQualityPreset(preset);
    setTimeout(() => setConfig(getQualitySettings()), 100);
  };

  const setAdaptive = useCallback((enabled: boolean) => {
    setAdaptiveQuality(enabled);
    setAdaptiveState(enabled);
    setConfig(getQualitySettings());
  }, [setAdaptiveQuality, getQualitySettings]);

  return {
    config,
    adaptive,
    setAdaptive,
    updateSetting,
    applyPreset,
  };
}
