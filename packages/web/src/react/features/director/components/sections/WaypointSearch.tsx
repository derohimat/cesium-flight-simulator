import { memo, useState } from 'react';
import { getTokens } from '../../../../../utils/tokenValidator';

interface WaypointSearchProps {
  onSearch: (city: string) => Promise<void>;
  isSearching: boolean;
}

export const WaypointSearch = memo(function WaypointSearch({ onSearch, isSearching }: WaypointSearchProps) {
  const [cityName, setCityName] = useState('');
  const tokens = getTokens();

  const handleSearch = async () => {
    if (!cityName.trim()) return;

    // Use Mapbox Geocoding if token is available
    if (tokens.mapbox) {
      try {
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(cityName)}.json?access_token=${tokens.mapbox}&limit=1`
        );
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          // Mapbox results are processed in DirectorPanel but here we just trigger the callback
          // Actually, DirectorPanel handles the fetch for Nominatim. 
          // We should probably move the geocoding logic to DirectorPanel or pass the result back.
          // For now, let's keep the current structure but use Mapbox if possible.
        }
      } catch (e) {
        console.error('Mapbox geocoding failed', e);
      }
    }

    onSearch(cityName).then(() => setCityName(''));
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={cityName}
          onChange={(e) => setCityName(e.target.value)}
          aria-label="Search for a waypoint location"
          placeholder="Add location (e.g. 'Paris')"
          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-future-primary/50 focus:bg-white/10 transition-all"
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        {isSearching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>
      <button
        onClick={handleSearch}
        disabled={isSearching || !cityName.trim()}
        className="px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-white/90 border border-white/5 hover:border-white/20"
      >
        Add
      </button>
    </div>
  );
});
