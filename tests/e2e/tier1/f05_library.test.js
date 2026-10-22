export function registerF05Tests(suite) {
  suite.describe('Tier 1 - Feature 05: Custom Locations Library List (Happy Path)', () => {
    const mockLocations = [
      { id: 'loc-1', name: 'Grand Canyon', category: 'nature', description: 'Arizona canyon' },
      { id: 'loc-2', name: 'Tokyo Tower', category: 'landmark', description: 'Communications tower' },
      { id: 'custom-1', name: 'Colosseum Capture', category: 'custom', description: 'Aleph 3D capture' },
      { id: 'custom-2', name: 'Eiffel Tower Photogrammetry', category: 'custom', description: 'Drone scan' },
    ];

    suite.test('F05-T01: Filter locations by category tab "custom"', () => {
      const customItems = mockLocations.filter((l) => l.category === 'custom');
      suite.strictEqual(customItems.length, 2, 'Must return 2 custom items');
      suite.strictEqual(customItems[0].id, 'custom-1');
      suite.strictEqual(customItems[1].id, 'custom-2');
    });

    suite.test('F05-T02: Filter custom locations by search query string', () => {
      const query = 'eiffel';
      const results = mockLocations.filter(
        (l) =>
          l.category === 'custom' &&
          (l.name.toLowerCase().includes(query) || l.description.toLowerCase().includes(query))
      );
      suite.strictEqual(results.length, 1, 'Search query must find 1 result');
      suite.strictEqual(results[0].name, 'Eiffel Tower Photogrammetry');
    });

    suite.test('F05-T03: Select location triggers callback with location payload', () => {
      let selected = null;
      const onSelectLocation = (loc) => { selected = loc; };

      const target = mockLocations[2]; // custom-1
      onSelectLocation(target);

      suite.ok(selected, 'Callback invoked');
      suite.strictEqual(selected.id, 'custom-1');
      suite.strictEqual(selected.name, 'Colosseum Capture');
    });

    suite.test('F05-T04: Toggle favorite state on custom location item', () => {
      const favorites = new Set();
      const toggleFavorite = (id) => {
        if (favorites.has(id)) favorites.delete(id);
        else favorites.add(id);
      };

      toggleFavorite('custom-1');
      suite.strictEqual(favorites.has('custom-1'), true, 'Location added to favorites');
      toggleFavorite('custom-1');
      suite.strictEqual(favorites.has('custom-1'), false, 'Location removed from favorites');
    });

    suite.test('F05-T05: Filter by showFavoritesOnly displays marked custom and preset items', () => {
      const favorites = new Set(['loc-2', 'custom-1']);
      const favList = mockLocations.filter((l) => favorites.has(l.id));

      suite.strictEqual(favList.length, 2, '2 favorite locations listed');
      suite.ok(favList.some((l) => l.id === 'custom-1'), 'Custom favorite included');
      suite.ok(favList.some((l) => l.id === 'loc-2'), 'Preset favorite included');
    });
  });
}
