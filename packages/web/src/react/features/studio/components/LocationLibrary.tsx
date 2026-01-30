import { useState } from 'react';
import { Panel } from '../../../shared/components/Panel';

interface Location {
  id: string;
  name: string;
  category: 'landmark' | 'city' | 'nature' | 'custom';
  lat: number;
  lon: number;
  altitude: number;
  thumbnail?: string;
  description?: string;
}

// Curated cinematic locations
const PRESET_LOCATIONS: Location[] = [
  // Landmarks
  { id: 'eiffel', name: 'Eiffel Tower', category: 'landmark', lat: 48.8584, lon: 2.2945, altitude: 400, description: 'Paris, France' },
  { id: 'colosseum', name: 'Colosseum', category: 'landmark', lat: 41.8902, lon: 12.4922, altitude: 300, description: 'Rome, Italy' },
  { id: 'taj', name: 'Taj Mahal', category: 'landmark', lat: 27.1751, lon: 78.0421, altitude: 250, description: 'Agra, India' },
  { id: 'sydney', name: 'Sydney Opera House', category: 'landmark', lat: -33.8568, lon: 151.2153, altitude: 300, description: 'Sydney, Australia' },
  { id: 'statue', name: 'Statue of Liberty', category: 'landmark', lat: 40.6892, lon: -74.0445, altitude: 200, description: 'New York, USA' },
  { id: 'pyramid', name: 'Great Pyramid', category: 'landmark', lat: 29.9792, lon: 31.1342, altitude: 300, description: 'Giza, Egypt' },
  { id: 'burj', name: 'Burj Khalifa', category: 'landmark', lat: 25.1972, lon: 55.2744, altitude: 1000, description: 'Dubai, UAE' },
  { id: 'christ', name: 'Christ the Redeemer', category: 'landmark', lat: -22.9519, lon: -43.2105, altitude: 500, description: 'Rio de Janeiro, Brazil' },
  
  // Cities
  { id: 'manhattan', name: 'Manhattan Skyline', category: 'city', lat: 40.7580, lon: -73.9855, altitude: 600, description: 'New York, USA' },
  { id: 'tokyo', name: 'Tokyo Tower', category: 'city', lat: 35.6586, lon: 139.7454, altitude: 500, description: 'Tokyo, Japan' },
  { id: 'london', name: 'Tower Bridge', category: 'city', lat: 51.5055, lon: -0.0754, altitude: 250, description: 'London, UK' },
  { id: 'hongkong', name: 'Victoria Harbour', category: 'city', lat: 22.2855, lon: 114.1577, altitude: 500, description: 'Hong Kong' },
  { id: 'singapore', name: 'Marina Bay', category: 'city', lat: 1.2838, lon: 103.8606, altitude: 350, description: 'Singapore' },
  { id: 'dubai', name: 'Dubai Marina', category: 'city', lat: 25.0805, lon: 55.1403, altitude: 400, description: 'Dubai, UAE' },
  
  // Nature
  { id: 'grandcanyon', name: 'Grand Canyon', category: 'nature', lat: 36.0544, lon: -112.1401, altitude: 2500, description: 'Arizona, USA' },
  { id: 'everest', name: 'Mount Everest', category: 'nature', lat: 27.9881, lon: 86.9250, altitude: 10000, description: 'Nepal/Tibet' },
  { id: 'niagara', name: 'Niagara Falls', category: 'nature', lat: 43.0962, lon: -79.0377, altitude: 300, description: 'USA/Canada' },
  { id: 'aurora', name: 'Northern Iceland', category: 'nature', lat: 65.6835, lon: -18.0878, altitude: 500, description: 'Iceland' },
  { id: 'amazon', name: 'Amazon River', category: 'nature', lat: -3.4653, lon: -62.2159, altitude: 300, description: 'Brazil' },
  { id: 'matterhorn', name: 'Matterhorn', category: 'nature', lat: 45.9763, lon: 7.6586, altitude: 5000, description: 'Switzerland' },
  { id: 'uluru', name: 'Uluru', category: 'nature', lat: -25.3444, lon: 131.0369, altitude: 500, description: 'Australia' },
  { id: 'fuji', name: 'Mount Fuji', category: 'nature', lat: 35.3606, lon: 138.7274, altitude: 4500, description: 'Japan' },
];

interface LocationLibraryProps {
  onSelectLocation: (location: Location) => void;
  onAddWaypoint: (location: Location) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
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
  onToggleCollapse 
}: LocationLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState<Location['category'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  const categories = ['all', 'landmark', 'city', 'nature'] as const;

  const filteredLocations = PRESET_LOCATIONS.filter(loc => {
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
    <Panel title="📍 Location Library" className="w-80">
      <div className="space-y-3">
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

        {/* Category Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
                selectedCategory === cat 
                  ? 'bg-future-primary text-white' 
                  : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {cat === 'all' ? '🌐 All' : `${CATEGORY_ICONS[cat]} ${CATEGORY_LABELS[cat]}`}
            </button>
          ))}
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`px-3 py-1.5 text-xs rounded-lg whitespace-nowrap transition-colors ${
              showFavoritesOnly 
                ? 'bg-yellow-500 text-black' 
                : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            ⭐ Favorites
          </button>
        </div>

        {/* Location List */}
        <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
          {filteredLocations.length === 0 ? (
            <div className="text-center py-8 text-white/40 text-sm">
              No locations found
            </div>
          ) : (
            filteredLocations.map(location => (
              <div
                key={location.id}
                className="group flex items-center gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                {/* Icon */}
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-future-primary/20 to-future-secondary/20 flex items-center justify-center text-lg">
                  {CATEGORY_ICONS[location.category]}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0" onClick={() => onSelectLocation(location)}>
                  <div className="text-sm font-medium text-white truncate">{location.name}</div>
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
                      onSelectLocation(location);
                    }}
                    className="p-1.5 rounded hover:bg-white/10 transition-colors text-future-accent"
                    title="Teleport Here"
                  >
                    🚀
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Stats */}
        <div className="text-xs text-white/40 text-center pt-2 border-t border-white/10">
          {filteredLocations.length} location{filteredLocations.length !== 1 ? 's' : ''} • {favorites.size} favorite{favorites.size !== 1 ? 's' : ''}
        </div>
      </div>
    </Panel>
  );
}

export type { Location };
