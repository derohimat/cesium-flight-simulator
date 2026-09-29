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
];

export function getMission(id: string): MissionDefinition | undefined {
  return MISSIONS.find((m) => m.id === id);
}
