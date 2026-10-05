export const WEIGHTS = { LIKE: 1, REPLAY: 2, SKIP: -0.7 };
const clamp = (x) => Math.max(0, Math.min(1, x));
export function validateDataset(data) {
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.events))
    throw Error("Expected an object with items and events arrays.");
  if (
    data.items.length < 2 ||
    data.items.length > 1000 ||
    data.events.length > 20000
  )
    throw Error("Use 2–1,000 items and at most 20,000 events.");
  const ids = new Set();
  for (const t of data.items) {
    if (
      !t ||
      typeof t.id !== "string" ||
      !t.id ||
      t.id.length > 100 ||
      ids.has(t.id)
    )
      throw Error(
        "Item IDs must be unique, nonempty strings (up to 100 characters).",
      );
    ids.add(t.id);
    for (const key of ["title", "artist", "genre"])
      if (typeof t[key] !== "string" || !t[key].trim() || t[key].length > 160)
        throw Error(`Each item needs a ${key} (up to 160 characters).`);
    for (const key of ["energy", "valence"])
      if (!Number.isFinite(t[key]) || t[key] < 0 || t[key] > 1)
        throw Error(`${key} must be a number from 0 to 1.`);
    if (
      !Number.isInteger(t.duration) ||
      t.duration < 1 ||
      t.duration > 3600 ||
      typeof t.explicit !== "boolean"
    )
      throw Error(
        "Duration must be 1–3,600 seconds and explicit must be a boolean.",
      );
  }
  for (const e of data.events)
    if (
      !e ||
      !ids.has(e.itemId) ||
      typeof e.userId !== "string" ||
      !e.userId.trim() ||
      e.userId.length > 100 ||
      !Object.hasOwn(WEIGHTS, e.type) ||
      !Number.isFinite(e.timestamp) ||
      e.timestamp < 0
    )
      throw Error(
        "Events need an existing itemId, userId, LIKE/REPLAY/SKIP type and nonnegative Unix timestamp.",
      );
  // Strip unexpected fields and supplied styling; never use imported HTML or CSS.
  return {
    items: data.items.map((t) => ({
      id: t.id,
      title: t.title,
      artist: t.artist,
      genre: t.genre,
      energy: t.energy,
      valence: t.valence,
      duration: t.duration,
      explicit: t.explicit,
      color:
        typeof t.color === "string" && /^#[a-f0-9]{6}$/i.test(t.color)
          ? t.color
          : "#b0bea1",
    })),
    events: data.events.map((e) => ({
      userId: e.userId,
      itemId: e.itemId,
      type: e.type,
      timestamp: e.timestamp,
    })),
  };
}
export function train(items, events, version = 1) {
  const ids = new Set(items.map((t) => t.id)),
    users = Object.create(null),
    popularity = Object.create(null),
    similarity = Object.create(null);
  for (const e of events) {
    if (!ids.has(e.itemId) || WEIGHTS[e.type] <= 0) continue;
    users[e.userId] ??= Object.create(null);
    users[e.userId][e.itemId] = Math.max(
      users[e.userId][e.itemId] || 0,
      WEIGHTS[e.type],
    );
  }
  for (const profile of Object.values(users)) {
    const keys = Object.keys(profile);
    for (const a of keys) {
      popularity[a] = (popularity[a] || 0) + 1;
      similarity[a] ??= Object.create(null);
      for (const b of keys)
        if (a !== b) similarity[a][b] = (similarity[a][b] || 0) + 1;
    }
  }
  for (const [a, neighbors] of Object.entries(similarity))
    for (const b of Object.keys(neighbors))
      neighbors[b] /= Math.sqrt(popularity[a] * popularity[b]);
  return {
    version,
    createdAt: Date.now(),
    eventCount: events.length,
    userCount: Object.keys(users).length,
    popularity,
    similarity,
  };
}
export function recommend(
  items,
  model,
  events,
  userId,
  { mood = {}, excludeSeen = true, clean = false, discovery = 0.2 } = {},
) {
  const own = events.filter((e) => e.userId === userId),
    byId = new Map(items.map((t) => [t.id, t]));
  const seen = new Set(own.map((e) => e.itemId)),
    genres = Object.create(null),
    positive = Object.create(null);
  for (const e of own) {
    const t = byId.get(e.itemId);
    if (!t) continue;
    genres[t.genre] = (genres[t.genre] || 0) + WEIGHTS[e.type];
    if (WEIGHTS[e.type] > 0)
      positive[t.id] = (positive[t.id] || 0) + WEIGHTS[e.type];
  }
  const maxGenre = Math.max(1, ...Object.values(genres)),
    maxPop = Math.max(1, ...Object.values(model.popularity));
  const posWeight = Math.max(
    1,
    Object.values(positive).reduce((a, b) => a + b, 0),
  );
  return items
    .filter((t) => (!excludeSeen || !seen.has(t.id)) && (!clean || !t.explicit))
    .map((t) => {
      const affinity = own.length
        ? clamp(0.5 + (genres[t.genre] || 0) / (2 * maxGenre))
        : 0.5;
      const collaborative =
        Object.entries(positive).reduce(
          (sum, [id, w]) => sum + (model.similarity[id]?.[t.id] || 0) * w,
          0,
        ) / posWeight;
      const popularity = (model.popularity[t.id] || 0) / maxPop;
      const moodFit =
        mood.energy == null
          ? 0.5
          : clamp(
              1 -
                (Math.abs(t.energy - mood.energy) +
                  Math.abs(t.valence - mood.valence)) /
                  2,
            );
      const novelty = 1 - clamp((genres[t.genre] || 0) / maxGenre);
      const relevance = own.length
        ? 0.45 * affinity +
          0.35 * collaborative +
          0.1 * popularity +
          0.1 * moodFit
        : 0.7 * popularity + 0.3 * moodFit;
      const score = (1 - discovery) * relevance + discovery * novelty;
      return {
        ...t,
        score,
        relevance,
        novelty,
        components: { affinity, collaborative, popularity, moodFit },
        reason: !own.length
          ? "Popular in the synthetic listener dataset"
          : (genres[t.genre] || 0) > 0
            ? `Your positive ${t.genre} interactions raise this track’s rank`
            : "A discovery outside your strongest genres",
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
export function playlistMetrics(tracks) {
  const artists = new Set(tracks.map((t) => t.artist)),
    genres = new Set(tracks.map((t) => t.genre));
  return {
    count: tracks.length,
    seconds: tracks.reduce((s, t) => s + t.duration, 0),
    artists: artists.size,
    genres: genres.size,
    meanRelevance: tracks.length
      ? tracks.reduce((s, t) => s + t.relevance, 0) / tracks.length
      : 0,
  };
}
export function optimize(
  ranked,
  { minutes = 20, maxPerArtist = 1, discovery = 0.4 } = {},
) {
  if (
    !Number.isFinite(minutes) ||
    minutes <= 0 ||
    !Number.isInteger(maxPerArtist) ||
    maxPerArtist < 1
  )
    throw Error("Invalid playlist constraints.");
  const selected = [],
    pool = [...ranked],
    counts = Object.create(null),
    genres = new Set();
  let seconds = 0;
  while (pool.length) {
    const eligible = pool.filter(
      (t) =>
        seconds + t.duration <= minutes * 60 &&
        (counts[t.artist] || 0) < maxPerArtist,
    );
    if (!eligible.length) break;
    const value = (t) =>
      (1 - discovery) * t.relevance +
      discovery * (0.5 * t.novelty + 0.5 * (genres.has(t.genre) ? 0 : 1));
    eligible.sort((a, b) => value(b) - value(a) || a.id.localeCompare(b.id));
    const t = eligible[0];
    selected.push({
      ...t,
      selectionReason: genres.has(t.genre)
        ? "Taste match within duration and artist limits"
        : "Adds a genre while respecting duration and artist limits",
    });
    seconds += t.duration;
    counts[t.artist] = (counts[t.artist] || 0) + 1;
    genres.add(t.genre);
    pool.splice(
      pool.findIndex((x) => x.id === t.id),
      1,
    );
  }
  const baseline = [];
  let baseSeconds = 0;
  for (const t of [...ranked].sort(
    (a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id),
  ))
    if (baseSeconds + t.duration <= minutes * 60) {
      baseline.push(t);
      baseSeconds += t.duration;
    }
  return {
    tracks: selected,
    baseline,
    metrics: playlistMetrics(selected),
    baselineMetrics: playlistMetrics(baseline),
  };
}
export function evaluate(items, events, k = 10) {
  const groups = Object.create(null);
  for (const e of events)
    if (WEIGHTS[e.type] > 0) {
      groups[e.userId] ??= [];
      groups[e.userId].push(e);
    }
  const holdout = [],
    training = [];
  for (const list of Object.values(groups)) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    if (new Set(list.map((e) => e.itemId)).size < 3) {
      training.push(...list);
      continue;
    }
    const last = list.at(-1);
    holdout.push(last);
    training.push(...list.filter((e) => e.itemId !== last.itemId));
  }
  if (!holdout.length)
    return { users: 0, hitRate: null, popularityHitRate: null, k };
  const model = train(items, training);
  let hits = 0,
    baseHits = 0;
  for (const e of holdout) {
    const own = training.filter((x) => x.userId === e.userId),
      seen = new Set(own.map((x) => x.itemId));
    const recommendations = recommend(items, model, training, e.userId, {
      discovery: 0,
    }).slice(0, k);
    if (recommendations.some((t) => t.id === e.itemId)) hits++;
    const baseline = items
      .filter((t) => !seen.has(t.id))
      .sort(
        (a, b) =>
          (model.popularity[b.id] || 0) - (model.popularity[a.id] || 0) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, k);
    if (baseline.some((t) => t.id === e.itemId)) baseHits++;
  }
  return {
    users: holdout.length,
    hitRate: hits / holdout.length,
    popularityHitRate: baseHits / holdout.length,
    k,
  };
}
