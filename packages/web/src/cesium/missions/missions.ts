import type { MissionDefinition } from './types';

/**
 * Built-in missions. Gate and target heights are metres above the ground (resolved against
 * real terrain when the mission starts), so they sit correctly wherever the terrain is.
 */
export const MISSIONS: MissionDefinition[] = [
  {
    id: 'gbg-highlights',
    title: 'Gothenburg Highlights',
    kind: 'sightseeing',
    region: 'Gothenburg, Sweden',
    summary: 'A relaxed tour of four city landmarks.',
    briefing:
      'Fly over four of Gothenburg’s best-known sights, in order. Follow the arrow at the top of the screen and fly into each beacon. There’s no time limit, but quicker tours earn more stars.',
    start: { lat: 57.7089, lon: 11.9746, agl: 200, speed: 60 },
    objectives: [
      { type: 'reach', placeId: 'gbg-utkiken', radius: 300, maxAgl: 1000 },
      { type: 'reach', placeId: 'gbg-masthugget', radius: 300, maxAgl: 1000 },
      { type: 'reach', placeId: 'gbg-alvsborg', radius: 300, maxAgl: 1000 },
      { type: 'reach', placeId: 'gbg-liseberg', radius: 300, maxAgl: 1000 },
    ],
    par: { gold: 150, silver: 240 },
  },
  {
    id: 'gbg-river-gates',
    title: 'Göta Älv Gate Run',
    kind: 'timeTrial',
    region: 'Gothenburg, Sweden',
    summary: 'Six gates down the river to the Älvsborg Bridge.',
    briefing:
      'Race west along the Göta älv through six gates, finishing at the Älvsborg Bridge. Gates only count flown in order and in the direction of the course. Hold W for more speed; A/D to turn, arrow keys to climb and descend.',
    start: { lat: 57.7085, lon: 11.9760, agl: 110, speed: 80 },
    objectives: [
      { type: 'ring', lat: 57.7075, lon: 11.9600, agl: 90, radius: 50 },
      { type: 'ring', lat: 57.7035, lon: 11.9480, agl: 90, radius: 50 },
      { type: 'ring', lat: 57.7000, lon: 11.9330, agl: 90, radius: 50 },
      { type: 'ring', lat: 57.6975, lon: 11.9180, agl: 90, radius: 50 },
      { type: 'ring', lat: 57.6930, lon: 11.9070, agl: 90, radius: 50 },
      { type: 'ring', lat: 57.6900, lon: 11.9000, agl: 90, radius: 50 },
    ],
    timeLimit: 150,
    par: { gold: 50, silver: 75 },
  },
  {
    id: 'nyc-skyline-dash',
    title: 'Manhattan Skyline Dash',
    kind: 'timeTrial',
    region: 'New York, USA',
    summary: 'Liberty to Central Park past the tallest towers.',
    briefing:
      'Start over the Upper Bay and race past the Statue of Liberty, One World Trade Center and the Empire State Building to Central Park. Fly into each beacon — above or beside the towers, not through them.',
    start: { lat: 40.6700, lon: -74.0480, agl: 250, speed: 100 },
    objectives: [
      { type: 'reach', placeId: 'statue', radius: 250, maxAgl: 400 },
      { type: 'reach', placeId: 'onewtc', radius: 300, maxAgl: 900 },
      { type: 'reach', placeId: 'empirestate', radius: 300, maxAgl: 900 },
      { type: 'reach', placeId: 'centralpark', radius: 400, maxAgl: 700 },
    ],
    timeLimit: 240,
    par: { gold: 75, silver: 110 },
  },
  {
    id: 'gbg-landvetter-arrival',
    title: 'Landvetter Arrival',
    kind: 'landing',
    region: 'Gothenburg, Sweden',
    summary: 'Fly the final approach and land on runway 03.',
    briefing:
      'You’re 10 km out on final for Göteborg Landvetter. Follow the approach lights down the 3° glide path, keep below 80 m/s, level the wings and release ↓ just before touchdown. A gentle, centred touchdown earns 3 stars. After landing, hold W to take off again.',
    start: { lat: 57.5858, lon: 12.1935, agl: 520, bearing: 31, speed: 70 },
    objectives: [
      {
        type: 'land',
        name: 'Runway 03',
        lat: 57.6633,
        lon: 12.2800,
        bearing: 31,
        length: 2000,
        width: 120,
        surface: 'runway',
        fact: 'Sweden’s second-busiest airport, opened in 1977.',
      },
    ],
    par: { gold: 240, silver: 360 },
    scoring: 'landing',
  },
  {
    id: 'nyc-hudson-landing',
    title: 'Hudson River Landing',
    kind: 'landing',
    region: 'New York, USA',
    summary: 'Set down on the Hudson beside Midtown.',
    briefing:
      'From the George Washington Bridge, follow the Hudson downriver and set down on the water beside Midtown Manhattan. Treat the river like a runway: line up with it, keep the wings level and touch down as gently as you can.',
    start: { lat: 40.8517, lon: -73.9527, agl: 400, bearing: 206, speed: 70 },
    objectives: [
      {
        type: 'land',
        name: 'Hudson River',
        lat: 40.7695,
        lon: -74.0046,
        bearing: 206,
        length: 2500,
        width: 500,
        surface: 'water',
        fact: 'On 15 January 2009, US Airways Flight 1549 ditched here — all 155 people aboard survived.',
      },
    ],
    par: { gold: 240, silver: 360 },
    scoring: 'landing',
  },
];

export function getMission(id: string): MissionDefinition | undefined {
  return MISSIONS.find((m) => m.id === id);
}
