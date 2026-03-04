import { useState } from 'react';
import { saveTokens } from '../../utils/tokenValidator';

interface TokenSetupProps {
  onComplete: () => void;
}

export function TokenSetup({ onComplete }: TokenSetupProps) {
  const [cesiumToken, setCesiumToken] = useState('');
  const [mapboxToken, setMapboxToken] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!cesiumToken.trim()) {
      setError('Cesium token is required');
      return;
    }

    saveTokens(cesiumToken.trim(), mapboxToken.trim());
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-900 flex items-center justify-center p-4 z-[9999]">
      <div className="max-w-2xl w-full glass-panel p-8 space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white">🚀 Setup Required</h1>
          <p className="text-white/60">
            Please provide your API tokens to continue
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cesium Token */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-white/90">
                Cesium Ion Access Token
              </label>
              <a
                href="https://ion.cesium.com/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Get token →
              </a>
            </div>
            <input
              type="text"
              value={cesiumToken}
              onChange={(e) => setCesiumToken(e.target.value)}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg 
                       text-white placeholder:text-white/30
                       focus:outline-none focus:border-blue-400/50 focus:bg-white/10
                       transition-all duration-200 font-mono text-sm"
            />
          </div>

          {/* Mapbox Token */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-white/90">
                Mapbox Access Token (Optional)
              </label>
              <a
                href="https://account.mapbox.com/access-tokens/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
              >
                Get token →
              </a>
            </div>
            <input
              type="text"
              value={mapboxToken}
              onChange={(e) => setMapboxToken(e.target.value)}
              placeholder="pk.eyJ1Ijo..."
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg 
                       text-white placeholder:text-white/30
                       focus:outline-none focus:border-blue-400/50 focus:bg-white/10
                       transition-all duration-200 font-mono text-sm"
            />
            <p className="text-[10px] text-white/40 italic">
              * Required for the 2D mini-map feature
            </p>
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <button
            type="submit"
            className="w-full px-6 py-3 bg-blue-500 hover:bg-blue-600 
                     text-white font-medium rounded-lg
                     transition-all duration-200 transform hover:scale-[1.02]
                     active:scale-[0.98]"
          >
            Save & Continue
          </button>

          <div className="text-xs text-white/40 text-center space-y-2">
            <p>💡 Tip: For permanent setup, add tokens to your .env file:</p>
            <div className="bg-black/40 p-2 rounded border border-white/5 font-mono text-[10px] text-white/50 space-y-1">
              <code>VITE_CESIUM_TOKEN=your_token_here</code>
              <code className="block">VITE_MAPBOX_TOKEN=your_token_here</code>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}


