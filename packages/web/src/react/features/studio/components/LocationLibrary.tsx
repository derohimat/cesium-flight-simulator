import { useState } from 'react';
import { Panel } from '../../../shared/components/Panel';
import { PLACES, type Place } from '../../../../data/places';

type Location = Place;

// Curated cinematic locations (shared with missions and landmark cards)
const PRESET_LOCATIONS: Location[] = PLACES;

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
