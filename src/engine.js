export const WEIGHTS = Object.freeze({
  LIKE: 1,
  REPLAY: 1.5,
  LISTEN: 0.25,
  SKIP: -0.65,
});
export const RECIPES = Object.freeze({
  hybrid: "Hybrid personalization",
  popularity: "Popularity baseline",
});
const clamp = (x) => Math.max(0, Math.min(1, x));
const dict = () => Object.create(null);
const string = (s, max = 160) =>
  typeof s === "string" && s.trim().length > 0 && s.length <= max;
export function safeUrl(value, { local = false } = {}) {
  if (!value) return "";
  if (local && /^assets\/previews\/[a-zA-Z0-9_-]+\.mp3$/.test(value))
    return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
export function validateDataset(data) {
  if (!data || !Array.isArray(data.items) || !Array.isArray(data.events))
    throw Error("Expected JSON with items and events arrays.");
  if (
    data.items.length < 2 ||
    data.items.length > 250 ||
    data.events.length > 10000
  )
    throw Error("Use 2–250 tracks and at most 10,000 events.");
  const ids = new Set();
  for (const t of data.items) {
    if (!t || !string(t.id, 100) || ids.has(t.id))
      throw Error(
        "Track IDs must be unique, nonempty strings of up to 100 characters.",
      );
    ids.add(t.id);
    for (const key of ["title", "artist", "genre"])
      if (!string(t[key]))
        throw Error(`Each track needs a ${key} of up to 160 characters.`);
    for (const key of ["energy", "valence"])
      if (!Number.isFinite(t[key]) || t[key] < 0 || t[key] > 1)
        throw Error(`${key} must be between 0 and 1.`);
    if (
      !Number.isInteger(t.duration) ||
      t.duration < 1 ||
      t.duration > 3600 ||
      typeof t.explicit !== "boolean"
    )
      throw Error(
        "Duration must be 1–3,600 seconds and explicit must be a boolean.",
      );
    for (const key of ["previewUrl", "sourceUrl", "downloadUrl", "licenseUrl"])
      if (t[key] && !safeUrl(t[key], { local: key === "previewUrl" }))
        throw Error(
          `${key} must be a safe HTTPS URL${key === "previewUrl" ? " or a bundled preview path" : ""}.`,
        );
  }
  const eventIds = new Set();
  const events = data.events.map((e, i) => {
    if (
      !e ||
      !ids.has(e.itemId) ||
      !string(e.userId, 100) ||
      !Object.hasOwn(WEIGHTS, e.type) ||
      !Number.isSafeInteger(e.timestamp) ||
      e.timestamp < 0 ||
      e.timestamp > 8640000000000
    )
      throw Error(
        "Events require userId, an existing itemId, LIKE/REPLAY/LISTEN/SKIP, and an integer Unix timestamp.",
      );
    const id = string(e.id, 100) ? e.id : `import-${i}`;
    if (eventIds.has(id)) throw Error("Event IDs must be unique.");
    eventIds.add(id);
    return {
      id,
      userId: e.userId,
      itemId: e.itemId,
      type: e.type,
      timestamp: e.timestamp,
      source: e.source === "synthetic" ? "synthetic" : "listener",
    };
  });
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
          : "#9ebdb2",
      previewUrl: safeUrl(t.previewUrl, { local: true }),
      sourceUrl: safeUrl(t.sourceUrl),
      downloadUrl: safeUrl(t.downloadUrl),
      licenseUrl: safeUrl(t.licenseUrl),
      license: string(t.license, 80) ? t.license : "User supplied",
      previewSeconds: Number.isFinite(t.previewSeconds)
        ? Math.min(60, Math.max(1, t.previewSeconds))
        : 30,
      description: string(t.description, 300)
        ? t.description
        : "Imported recording. Features provided by the dataset author.",
    })),
    events,
  };
}
export function train(items, events, version = 1, recipe = "hybrid") {
  if (!Object.hasOwn(RECIPES, recipe)) throw Error("Unknown recipe.");
  const users = dict(),
    popularity = dict(),
    similarity = dict(),
    ids = new Set(items.map((t) => t.id));
  for (const e of events) {
    if (!ids.has(e.itemId) || !(WEIGHTS[e.type] > 0)) continue;
    users[e.userId] ??= dict();
    users[e.userId][e.itemId] = true;
  }
  for (const profile of Object.values(users)) {
    const keys = Object.keys(profile);
    for (const a of keys) {
      popularity[a] = (popularity[a] || 0) + 1;
      if (recipe === "hybrid") {
        similarity[a] ??= dict();
        for (const b of keys)
          if (a !== b) similarity[a][b] = (similarity[a][b] || 0) + 1;
      }
    }
  }
  for (const [a, neighbors] of Object.entries(similarity))
    for (const b of Object.keys(neighbors))
      neighbors[b] /= Math.sqrt(popularity[a] * popularity[b]);
  return {
    version,
    recipe,
    status: "ACTIVE",
    createdAt: Date.now(),
    eventCount: events.length,
    userCount: Object.keys(users).length,
    popularity,
    similarity,
  };
}
export function decisions(events, userId) {
  const result = new Map();
  for (const e of events)
    if (e.userId === userId && (e.type === "LIKE" || e.type === "SKIP"))
      result.set(e.itemId, e.type);
  return result;
}
export function tasteProfile(items, events, userId, preferences = []) {
  const byId = new Map(items.map((t) => [t.id, t])),
    genres = dict(),
    positive = dict(),
    seen = new Set();
  for (const g of preferences) genres[g] = 1;
  for (const e of events) {
    if (e.userId !== userId) continue;
    const t = byId.get(e.itemId);
    if (!t) continue;
    if (e.type === "LIKE" || e.type === "SKIP") seen.add(t.id);
    genres[t.genre] = (genres[t.genre] || 0) + WEIGHTS[e.type];
    if (WEIGHTS[e.type] > 0)
      positive[t.id] = Math.min(3, (positive[t.id] || 0) + WEIGHTS[e.type]);
  }
  const latest = decisions(events, userId);
  for (const [id, decision] of latest)
    if (decision === "SKIP") delete positive[id];
  return { genres, positive, seen, decisions: latest };
}
export function recommend(
  items,
  model,
  events,
  userId,
  {
    mood = {},
    excludeSeen = true,
    clean = false,
    discovery = 0.15,
    preferences = [],
    excludeRejected = true,
  } = {},
) {
  if (!model)
    throw Error(
      "Deploy a trained solution version before requesting recommendations.",
    );
  if (!Number.isFinite(discovery) || discovery < 0 || discovery > 1)
    throw Error("Discovery must be between 0 and 1.");
  const profile = tasteProfile(items, events, userId, preferences),
    { genres, positive, seen } = profile;
  const hasProfile =
      preferences.length > 0 || events.some((e) => e.userId === userId),
    maxGenre = Math.max(1, ...Object.values(genres)),
    maxPop = Math.max(1, ...Object.values(model.popularity));
  const posWeight = Math.max(
    1,
    Object.values(positive).reduce((a, b) => a + b, 0),
  );
  return items
    .filter(
      (t) =>
        (!excludeSeen || !seen.has(t.id)) &&
        (!excludeRejected || profile.decisions.get(t.id) !== "SKIP") &&
        (!clean || !t.explicit),
    )
    .map((t) => {
      const affinity = hasProfile
        ? clamp(0.5 + (genres[t.genre] || 0) / (2 * maxGenre))
        : 0.5;
      const collaborative =
        Object.entries(positive).reduce(
          (sum, [id, w]) =>
            sum + (id === t.id ? 1 : model.similarity[id]?.[t.id] || 0) * w,
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
      const weights =
        model.recipe === "popularity"
          ? { affinity: 0, collaborative: 0, popularity: 1, moodFit: 0 }
          : hasProfile
            ? {
                affinity: 0.42,
                collaborative: 0.32,
                popularity: 0.1,
                moodFit: 0.16,
              }
            : {
                affinity: 0,
                collaborative: 0,
                popularity: 0.75,
                moodFit: 0.25,
              };
      const components = { affinity, collaborative, popularity, moodFit };
      const relevance = Object.entries(weights).reduce(
        (sum, [key, w]) => sum + components[key] * w,
        0,
      );
      const score =
        model.recipe === "popularity"
          ? relevance
          : (1 - discovery) * relevance + discovery * novelty;
      const reason =
        model.recipe === "popularity"
          ? "Popular among the seeded demo listeners"
          : !hasProfile
            ? "A starting point from the demo listener histories"
            : (genres[t.genre] || 0) > 0
              ? `Connects with your ${t.genre.toLowerCase()} preferences`
              : "A little outside your usual listening";
      return {
        ...t,
        score,
        relevance,
        novelty,
        components,
        weights,
        reason,
        modelVersion: model.version,
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
export function playlistMetrics(tracks) {
  return {
    count: tracks.length,
    seconds: tracks.reduce((s, t) => s + t.duration, 0),
    artists: new Set(tracks.map((t) => t.artist)).size,
    genres: new Set(tracks.map((t) => t.genre)).size,
    meanRelevance: tracks.length
      ? tracks.reduce((s, t) => s + t.relevance, 0) / tracks.length
      : 0,
  };
}
export function optimize(
  ranked,
  { minutes = 15, maxPerArtist = 2, discovery = 0.4 } = {},
) {
  if (
    !Number.isFinite(minutes) ||
    minutes < 1 ||
    minutes > 180 ||
    !Number.isInteger(maxPerArtist) ||
    maxPerArtist < 1 ||
    maxPerArtist > 10 ||
    !Number.isFinite(discovery) ||
    discovery < 0 ||
    discovery > 1
  )
    throw Error("Invalid playlist constraints.");
  const unique = [...new Map(ranked.map((t) => [t.id, t])).values()],
    pool = [...unique],
    selected = [],
    counts = dict(),
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
        ? "Taste match within your limits"
        : "Adds a new genre to your mix",
    });
    seconds += t.duration;
    counts[t.artist] = (counts[t.artist] || 0) + 1;
    genres.add(t.genre);
    pool.splice(
      pool.findIndex((x) => x.id === t.id),
      1,
    );
  }
  // Both baselines keep the same duration budget. The constrained one isolates the discovery objective.
  function baseline(cap) {
    let total = 0;
    const result = [],
      used = dict();
    for (const t of [...unique].sort(
      (a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id),
    ))
      if (
        total + t.duration <= minutes * 60 &&
        (!cap || (used[t.artist] || 0) < maxPerArtist)
      ) {
        result.push(t);
        total += t.duration;
        used[t.artist] = (used[t.artist] || 0) + 1;
      }
    return result;
  }
  const plain = baseline(false),
    constrained = baseline(true);
  return {
    tracks: selected,
    baseline: plain,
    constrainedBaseline: constrained,
    metrics: playlistMetrics(selected),
    baselineMetrics: playlistMetrics(plain),
    constrainedMetrics: playlistMetrics(constrained),
    remainingSeconds: minutes * 60 - seconds,
  };
}
export function evaluate(items, events, k = 5, recipe = "hybrid") {
  if (!Number.isInteger(k) || k < 1 || k > 50)
    throw Error("k must be an integer from 1 to 50.");
  const groups = dict();
  for (const e of events)
    if (WEIGHTS[e.type] > 0) {
      groups[e.userId] ??= [];
      groups[e.userId].push(e);
    }
  const holdout = [],
    training = [];
  for (const [user, list] of Object.entries(groups)) {
    list.sort((a, b) => a.timestamp - b.timestamp);
    if (new Set(list.map((e) => e.itemId)).size < 3) {
      training.push(...events.filter((e) => e.userId === user));
      continue;
    }
    const last = list.at(-1);
    holdout.push(last);
    training.push(
      ...events.filter(
        (e) =>
          e.userId === user &&
          e.timestamp < last.timestamp &&
          e.itemId !== last.itemId,
      ),
    );
  }
  if (!holdout.length)
    return {
      users: 0,
      hitRate: null,
      popularityHitRate: null,
      ndcg: null,
      popularityNdcg: null,
      k,
      recipe,
    };
  const model = train(items, training, 1, recipe),
    baselineModel = train(items, training, 1, "popularity");
  let hits = 0,
    baseHits = 0,
    ndcg = 0,
    baseNdcg = 0;
  const details = [];
  for (const e of holdout) {
    const ranks = recommend(items, model, training, e.userId, {
        discovery: 0,
      }).slice(0, k),
      base = recommend(items, baselineModel, training, e.userId, {
        discovery: 0,
      }).slice(0, k);
    const position = ranks.findIndex((t) => t.id === e.itemId),
      basePosition = base.findIndex((t) => t.id === e.itemId);
    if (position >= 0) {
      hits++;
      ndcg += 1 / Math.log2(position + 2);
    }
    if (basePosition >= 0) {
      baseHits++;
      baseNdcg += 1 / Math.log2(basePosition + 2);
    }
    details.push({
      userId: e.userId,
      heldOut: e.itemId,
      rank: position < 0 ? null : position + 1,
      baselineRank: basePosition < 0 ? null : basePosition + 1,
    });
  }
  return {
    users: holdout.length,
    hitRate: hits / holdout.length,
    popularityHitRate: baseHits / holdout.length,
    ndcg: ndcg / holdout.length,
    popularityNdcg: baseNdcg / holdout.length,
    k,
    recipe,
    details,
  };
}
