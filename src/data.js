import { CATALOG } from "./catalog.js";
export const ITEMS = CATALOG;
export const GENRES = [...new Set(ITEMS.map((item) => item.genre))];
export const MOODS = {
  balanced: { label: "Anything", energy: null, valence: null },
  focus: { label: "Focus", energy: 0.2, valence: 0.45 },
  gym: { label: "Workout", energy: 0.9, valence: 0.7 },
  night: { label: "Late night", energy: 0.3, valence: 0.25 },
  drive: { label: "On the road", energy: 0.7, valence: 0.65 },
};
export function seedEvents(items = ITEMS) {
  const genres = [...new Set(items.map((t) => t.genre))],
    events = [];
  // Reproducible synthetic listeners, never represented as actual audience activity.
  let seed = 29017;
  const random = () =>
    (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let u = 0; u < 40; u++)
    for (let j = 0; j < 30; j++) {
      const favorite = u % genres.length;
      const g =
        random() < 0.75
          ? favorite
          : (favorite + 1 + Math.floor(random() * (genres.length - 1))) %
            genres.length;
      const pool = items.filter((t) => t.genre === genres[g]);
      const item = pool[Math.floor(random() * pool.length)];
      events.push({
        id: `seed-${u}-${j}`,
        userId: `demo-${u + 1}`,
        itemId: item.id,
        type: j % 7 === 0 ? "REPLAY" : "LIKE",
        timestamp: 1735689600 + u * 3600 + j * 60,
        source: "synthetic",
      });
    }
  return events;
}
export const SEED_EVENTS = seedEvents();
export function createFixture() {
  return {
    items: ITEMS.map((t) => ({ ...t })),
    events: SEED_EVENTS.map((e) => ({ ...e })),
  };
}
export const PROFILES = [
  { id: "you", name: "Your listening room", preferences: [] },
  { id: "demo-1", name: "Demo · Electronic", preferences: [] },
  { id: "demo-2", name: "Demo · Jazz", preferences: [] },
  { id: "demo-3", name: "Demo · Rock", preferences: [] },
  { id: "demo-4", name: "Demo · Ambient", preferences: [] },
];
