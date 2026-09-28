import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { getTokens } from '../../../../utils/tokenValidator';
import { useCameraPosition } from '../../../hooks/useCameraPosition';
import { cn } from '../../../shared/utils/cn';

export interface MiniMapProps {
  className?: string;
}

export function MiniMap({ className }: MiniMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  const cameraPosition = useCameraPosition();
  const [isReady, setIsReady] = useState(false);
  const tokens = getTokens();

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || map.current || !tokens.mapbox) return;

    mapboxgl.accessToken = tokens.mapbox;

    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: 'mapbox://styles/mapbox/satellite-v9',
      center: [parseFloat(cameraPosition.longitude), parseFloat(cameraPosition.latitude)],
      zoom: 13,
      interactive: false,
      attributionControl: false
    });

    // Create marker for the aircraft
    const el = document.createElement('div');
    el.className = 'w-6 h-6 flex items-center justify-center transform -rotate-45';
    el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" class="w-full h-full text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)] filter">
      <path d="M21 16V14.5L13 9.5V3.5C13 2.67 12.33 2 11.5 2C10.67 2 10 2.67 10 3.5V9.5L2 14.5V16L10 13.5V19L8 20.5V22L11.5 21L15 22V20.5L13 19V13.5L21 16Z" fill="currentColor" stroke="white" stroke-width="1"/>
    </svg>`;

    marker.current = new mapboxgl.Marker(el)
      .setLngLat([parseFloat(cameraPosition.longitude), parseFloat(cameraPosition.latitude)])
      .addTo(map.current);

    map.current.on('load', () => {
      setIsReady(true);
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  }, [tokens.mapbox]);

  // Update Map Position and Orientation
  useEffect(() => {
    if (!map.current || !isReady) return;

    const lng = parseFloat(cameraPosition.longitude);
    const lat = parseFloat(cameraPosition.latitude);
    const heading = parseFloat(cameraPosition.heading);

    map.current.setCenter([lng, lat]);
    
    if (marker.current) {
      marker.current.setLngLat([lng, lat]);
      marker.current.setRotation(heading);
    }

    // Adjust zoom based on altitude
    const alt = parseFloat(cameraPosition.altitude);
    const targetZoom = Math.max(10, Math.min(16, 17 - (alt / 1000)));
    map.current.setZoom(targetZoom);
    
    // Rotate map with aircraft heading
    map.current.setBearing(heading);

  }, [cameraPosition, isReady]);

  if (!tokens.mapbox) return null;

  return (
    <div className={cn(
      "relative w-48 h-48 rounded-full border-2 border-white/10 overflow-hidden shadow-2xl glass-panel",
      className
    )}>
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Compass / Orientation Indicator */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-black/60 backdrop-blur-md rounded-full border border-white/10 text-[8px] font-bold text-white/80 tracking-widest uppercase">
        {Math.round(parseFloat(cameraPosition.heading))}°
      </div>

      {/* Crosshair Overlay */}
      <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-full" />
      <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white/5" />
      <div className="absolute left-1/2 top-0 w-[1px] h-full bg-white/5" />
    </div>
  );
}
