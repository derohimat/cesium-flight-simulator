const CESIUM_TOKEN_KEY = 'cesium_ion_token';
const MAPBOX_TOKEN_KEY = 'mapbox_token';

export interface Tokens {
  cesium: string;
  mapbox: string;
}

export function getTokens(): Tokens {
  const envCesium = import.meta.env.VITE_CESIUM_TOKEN;
  const envMapbox = import.meta.env.VITE_MAPBOX_TOKEN;

  const localCesium = localStorage.getItem(CESIUM_TOKEN_KEY);
  const localMapbox = localStorage.getItem(MAPBOX_TOKEN_KEY);

  return {
    cesium: envCesium || localCesium || '',
    mapbox: envMapbox || localMapbox || '',
  };
}

export function hasValidTokens(): boolean {
  const tokens = getTokens();
  return tokens.cesium.length > 0;
}

export function saveTokens(cesium: string, mapbox?: string): void {
  localStorage.setItem(CESIUM_TOKEN_KEY, cesium);
  if (mapbox) {
    localStorage.setItem(MAPBOX_TOKEN_KEY, mapbox);
  }
}

export function clearTokens(): void {
  localStorage.removeItem(CESIUM_TOKEN_KEY);
  localStorage.removeItem(MAPBOX_TOKEN_KEY);
}


