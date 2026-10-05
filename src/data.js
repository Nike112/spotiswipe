// All names, features, users and events are generated fixtures, not Spotify content.
export const GENRES = [
  "Electronic",
  "Indie",
  "Jazz",
  "Hip-hop",
  "Ambient",
  "Rock",
];
const names = [
  "Afterglow",
  "Small Hours",
  "Satellite",
  "Paper Planes",
  "Side Streets",
  "Slow Motion",
  "Blue Room",
  "First Light",
  "Soft Landing",
  "Open Water",
  "Night Bus",
  "Wildflowers",
];
export const ITEMS = GENRES.flatMap((genre, g) =>
  names.map((name, i) => ({
    id: `g${g}-t${i}`,
    title: `${name} ${["I", "II", "III", "IV", "V", "VI"][g]}`,
    artist: `${["Signal Club", "June Arcade", "Velvet Trio", "Northline", "Stillwater", "Static Garden"][g]} ${1 + (i % 4)}`,
    genre,
    energy: Math.min(
      0.95,
      Math.max(
        0.08,
        [0.8, 0.5, 0.35, 0.7, 0.15, 0.85][g] + ((i % 5) - 2) * 0.045,
      ),
    ),
    valence: Math.min(0.95, 0.2 + (i % 7) * 0.1),
    duration: 140 + ((i * 23 + g * 17) % 150),
    explicit: g === 3 && i % 4 === 0,
    color: ["#cfa579", "#b0bea1", "#d9b66e", "#c48d86", "#95b4bb", "#b1a0c2"][
      g
    ],
  })),
);
export function seedEvents(items = ITEMS) {
  const out = [];
  const byGenre = GENRES.map((g) => items.filter((t) => t.genre === g));
  for (let u = 0; u < 30; u++) {
    const fav = u % 6,
      secondary = (fav + 1) % 6;
    for (let j = 0; j < 14; j++) {
      const pool = byGenre[j < 10 ? fav : secondary];
      if (!pool.length) continue;
      const t = pool[(u * 3 + j * 5) % pool.length];
      out.push({
        userId: `demo-${u + 1}`,
        itemId: t.id,
        type: j % 5 === 0 ? "REPLAY" : "LIKE",
        timestamp: 1700000000 + u * 100 + j,
      });
    }
  }
  return out;
}
export const SEED_EVENTS = seedEvents();
export const MOODS = {
  balanced: { label: "Anything", energy: null, valence: null },
  focus: { label: "Focus", energy: 0.2, valence: 0.5 },
  gym: { label: "Workout", energy: 0.85, valence: 0.7 },
  night: { label: "Late night", energy: 0.35, valence: 0.3 },
  drive: { label: "On the road", energy: 0.65, valence: 0.65 },
};

export function createFixture() {
  return {
    items: ITEMS.map((item) => ({ ...item })),
    events: SEED_EVENTS.map((event) => ({ ...event })),
  };
}
