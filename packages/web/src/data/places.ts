/**
 * Shared place catalogue: the Studio location library, mission objectives and the
 * "landmark nearby" cards all read from here.
 *
 * `altitude` is a good camera height (metres) for viewing the place from above. Coordinates for
 * the smaller Gothenburg landmarks are approximate; mission targets use generous radii.
 */
export type PlaceCategory = 'landmark' | 'city' | 'nature' | 'custom';

export interface Place {
  id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lon: number;
  altitude: number;
  /** Where it is, e.g. "Paris, France". */
  description?: string;
  /** One-line fact shown on the landmark card when you fly by. */
  fact?: string;
  thumbnail?: string;
}

export const PLACES: Place[] = [
  // Landmarks
  { id: 'eiffel', name: 'Eiffel Tower', category: 'landmark', lat: 48.8584, lon: 2.2945, altitude: 400, description: 'Paris, France', fact: 'Completed in 1889 for the World’s Fair, it is about 330 m tall.' },
  { id: 'colosseum', name: 'Colosseum', category: 'landmark', lat: 41.8902, lon: 12.4922, altitude: 300, description: 'Rome, Italy', fact: 'Completed in 80 AD, it is the largest amphitheatre ever built.' },
  { id: 'taj', name: 'Taj Mahal', category: 'landmark', lat: 27.1751, lon: 78.0421, altitude: 250, description: 'Agra, India', fact: 'Commissioned in 1632 by the Mughal emperor Shah Jahan.' },
  { id: 'sydney', name: 'Sydney Opera House', category: 'landmark', lat: -33.8568, lon: 151.2153, altitude: 300, description: 'Sydney, Australia', fact: 'Opened in 1973; its shell roofs were designed by Jørn Utzon.' },
  { id: 'statue', name: 'Statue of Liberty', category: 'landmark', lat: 40.6892, lon: -74.0445, altitude: 200, description: 'New York, USA', fact: 'A gift from France, dedicated in 1886.' },
  { id: 'pyramid', name: 'Great Pyramid', category: 'landmark', lat: 29.9792, lon: 31.1342, altitude: 300, description: 'Giza, Egypt', fact: 'Built around 2560 BC; the tallest human-made structure for nearly 4,000 years.' },
  { id: 'burj', name: 'Burj Khalifa', category: 'landmark', lat: 25.1972, lon: 55.2744, altitude: 1000, description: 'Dubai, UAE', fact: 'At 828 m, the world’s tallest building since 2010.' },
  { id: 'christ', name: 'Christ the Redeemer', category: 'landmark', lat: -22.9519, lon: -43.2105, altitude: 500, description: 'Rio de Janeiro, Brazil', fact: 'Completed in 1931 atop the Corcovado mountain.' },
  { id: 'onewtc', name: 'One World Trade Center', category: 'landmark', lat: 40.7127, lon: -74.0134, altitude: 700, description: 'New York, USA', fact: 'Opened in 2014; its 1,776 ft (541 m) height references the year of US independence.' },
  { id: 'empirestate', name: 'Empire State Building', category: 'landmark', lat: 40.7484, lon: -73.9857, altitude: 600, description: 'New York, USA', fact: 'Completed in 1931, it was the world’s tallest building for nearly 40 years.' },

  // Cities
  { id: 'manhattan', name: 'Manhattan Skyline', category: 'city', lat: 40.7580, lon: -73.9855, altitude: 600, description: 'New York, USA' },
  { id: 'centralpark', name: 'Central Park', category: 'city', lat: 40.7812, lon: -73.9665, altitude: 400, description: 'New York, USA', fact: 'An 843-acre park designed by Olmsted and Vaux, opened in 1858.' },
  { id: 'tokyo', name: 'Tokyo Tower', category: 'city', lat: 35.6586, lon: 139.7454, altitude: 500, description: 'Tokyo, Japan' },
  { id: 'london', name: 'Tower Bridge', category: 'city', lat: 51.5055, lon: -0.0754, altitude: 250, description: 'London, UK', fact: 'A combined bascule and suspension bridge, opened in 1894.' },
  { id: 'hongkong', name: 'Victoria Harbour', category: 'city', lat: 22.2855, lon: 114.1577, altitude: 500, description: 'Hong Kong' },
  { id: 'singapore', name: 'Marina Bay', category: 'city', lat: 1.2838, lon: 103.8606, altitude: 350, description: 'Singapore' },
  { id: 'dubai', name: 'Dubai Marina', category: 'city', lat: 25.0805, lon: 55.1403, altitude: 400, description: 'Dubai, UAE' },

  // Gothenburg (the default spawn area)
  { id: 'gbg-utkiken', name: 'Göteborgs-Utkiken', category: 'landmark', lat: 57.7119, lon: 11.9661, altitude: 250, description: 'Gothenburg, Sweden', fact: 'Nicknamed “the Lipstick”, this 86 m tower from 1989 has a viewing deck on top.' },
  { id: 'gbg-masthugget', name: 'Masthugget Church', category: 'landmark', lat: 57.6992, lon: 11.9411, altitude: 250, description: 'Gothenburg, Sweden', fact: 'Completed in 1914, its tower is a landmark seen from all over the harbour.' },
  { id: 'gbg-alvsborg', name: 'Älvsborg Bridge', category: 'landmark', lat: 57.6900, lon: 11.9000, altitude: 300, description: 'Gothenburg, Sweden', fact: 'Opened in 1966, this suspension bridge spans the Göta älv near the harbour mouth.' },
  { id: 'gbg-liseberg', name: 'Liseberg', category: 'landmark', lat: 57.6953, lon: 11.9919, altitude: 250, description: 'Gothenburg, Sweden', fact: 'Opened in 1923 for the city’s 300th anniversary; one of Scandinavia’s largest amusement parks.' },

  // Nature
  { id: 'grandcanyon', name: 'Grand Canyon', category: 'nature', lat: 36.0544, lon: -112.1401, altitude: 2500, description: 'Arizona, USA', fact: 'Up to about 1.8 km deep, carved by the Colorado River.' },
  { id: 'everest', name: 'Mount Everest', category: 'nature', lat: 27.9881, lon: 86.9250, altitude: 10000, description: 'Nepal/Tibet', fact: 'At 8,849 m, the highest mountain above sea level.' },
  { id: 'niagara', name: 'Niagara Falls', category: 'nature', lat: 43.0962, lon: -79.0377, altitude: 300, description: 'USA/Canada' },
  { id: 'aurora', name: 'Northern Iceland', category: 'nature', lat: 65.6835, lon: -18.0878, altitude: 500, description: 'Iceland' },
  { id: 'amazon', name: 'Amazon River', category: 'nature', lat: -3.4653, lon: -62.2159, altitude: 300, description: 'Brazil' },
  { id: 'matterhorn', name: 'Matterhorn', category: 'nature', lat: 45.9763, lon: 7.6586, altitude: 5000, description: 'Switzerland', fact: 'A 4,478 m pyramid-shaped peak on the Swiss–Italian border.' },
  { id: 'uluru', name: 'Uluru', category: 'nature', lat: -25.3444, lon: 131.0369, altitude: 500, description: 'Australia' },
  { id: 'fuji', name: 'Mount Fuji', category: 'nature', lat: 35.3606, lon: 138.7274, altitude: 4500, description: 'Japan', fact: 'Japan’s highest peak at 3,776 m, an active stratovolcano.' },
];

const PLACES_BY_ID = new Map(PLACES.map((p) => [p.id, p]));

export function getPlace(id: string): Place | undefined {
  return PLACES_BY_ID.get(id);
}
