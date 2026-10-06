import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, SEED_EVENTS, createFixture } from "../src/data.js";
import {
  train,
  recommend,
  optimize,
  evaluate,
  validateDataset,
  safeUrl,
  decisions,
} from "../src/engine.js";
const event = (
  userId,
  itemId,
  type = "LIKE",
  timestamp = 1,
  id = `${userId}-${itemId}-${timestamp}`,
) => ({ id, userId, itemId, type, timestamp });
const fixtureItems = [
  {
    id: "a",
    title: "A",
    artist: "Artist A",
    genre: "Jazz",
    energy: 0.2,
    valence: 0.3,
    duration: 180,
    explicit: false,
  },
  {
    id: "b",
    title: "B",
    artist: "Artist A",
    genre: "Jazz",
    energy: 0.4,
    valence: 0.5,
    duration: 200,
    explicit: false,
  },
  {
    id: "c",
    title: "C",
    artist: "Artist B",
    genre: "Rock",
    energy: 0.9,
    valence: 0.7,
    duration: 160,
    explicit: true,
  },
  {
    id: "d",
    title: "D",
    artist: "Artist C",
    genre: "Ambient",
    energy: 0.1,
    valence: 0.2,
    duration: 150,
    explicit: false,
  },
];
test("real catalog has licensed playable recordings with independent objects", () => {
  const a = createFixture(),
    b = createFixture();
  assert.equal(ITEMS.length, 16);
  assert.equal(SEED_EVENTS.length, 1200);
  assert.ok(
    ITEMS.every((t) => t.previewUrl && t.sourceUrl && t.license === "CC0 1.0"),
  );
  a.events.push(event("x", ITEMS[0].id));
  a.items[0].title = "Mutated";
  assert.equal(b.events.length, 1200);
  assert.notEqual(b.items[0].title, "Mutated");
});
test("co-occurrence uses distinct users and cosine normalization", () => {
  const history = [
    event("u", "a"),
    event("u", "a", "REPLAY", 2),
    event("u", "b"),
    event("v", "a"),
  ];
  const model = train(fixtureItems, history);
  assert.equal(model.popularity.a, 2);
  assert.equal(model.popularity.b, 1);
  assert.equal(model.similarity.a.b, 1 / Math.sqrt(2));
  assert.equal(model.similarity.b.a, model.similarity.a.b);
  assert.equal(model.userCount, 2);
});
test("SKIP never enters positive co-occurrence training", () => {
  const m = train(fixtureItems, [event("u", "a", "SKIP"), event("u", "b")]);
  assert.equal(m.popularity.a, undefined);
  assert.equal(m.similarity.b.a, undefined);
});
test("different preferences produce different personalized ranking", () => {
  const model = train(fixtureItems, []);
  const jazz = recommend(fixtureItems, model, [], "you", {
      preferences: ["Jazz"],
      discovery: 0,
    }),
    rock = recommend(fixtureItems, model, [], "you", {
      preferences: ["Rock"],
      discovery: 0,
    });
  assert.equal(jazz[0].genre, "Jazz");
  assert.equal(rock[0].genre, "Rock");
});
test("cold start returns finite scores with no history", () => {
  const ranked = recommend(fixtureItems, train(fixtureItems, []), [], "new");
  assert.equal(ranked.length, 4);
  assert.ok(
    ranked.every(
      (t) => Number.isFinite(t.score) && t.score >= 0 && t.score <= 1,
    ),
  );
});
test("listen changes taste without removing a card; decisions remove it from discovery", () => {
  const model = train(fixtureItems, []);
  assert.ok(
    recommend(fixtureItems, model, [event("u", "a", "LISTEN")], "u").some(
      (t) => t.id === "a",
    ),
  );
  assert.ok(
    !recommend(fixtureItems, model, [event("u", "a")], "u").some(
      (t) => t.id === "a",
    ),
  );
});
test("clean and latest-rejection filters are enforced", () => {
  const history = [
    event("u", "a", "LIKE", 1),
    event("u", "a", "SKIP", 2),
    event("u", "b", "SKIP", 3),
    event("u", "b", "LIKE", 4),
  ];
  const ranked = recommend(
    fixtureItems,
    train(fixtureItems, []),
    history,
    "u",
    { excludeSeen: false, clean: true },
  );
  assert.ok(!ranked.some((t) => ["a", "c"].includes(t.id)));
  assert.ok(ranked.some((t) => t.id === "b"));
  assert.equal(decisions(history, "u").get("a"), "SKIP");
});
test("popularity recipe ignores preferences and novelty", () => {
  const model = train(
    fixtureItems,
    [event("u", "a"), event("v", "a"), event("v", "b")],
    1,
    "popularity",
  );
  const a = recommend(fixtureItems, model, [], "new", {
    preferences: ["Rock"],
    discovery: 1,
  });
  assert.equal(a[0].id, "a");
  assert.equal(a[0].score, 1);
  assert.equal(a[0].weights.popularity, 1);
});
test("empty, seen-only, and no-campaign states are explicit", () => {
  assert.deepEqual(
    recommend(
      fixtureItems,
      train(fixtureItems, []),
      fixtureItems.map((t) => event("u", t.id)),
      "u",
    ),
    [],
  );
  assert.throws(() => recommend(fixtureItems, null, [], "u"), /Deploy/);
  assert.throws(() =>
    recommend(fixtureItems, train(fixtureItems, []), [], "u", { discovery: 2 }),
  );
});
test("playlist honors hard constraints and deduplicates candidates", () => {
  const ranked = fixtureItems.map((t, i) => ({
    ...t,
    relevance: 1 - i * 0.1,
    novelty: i * 0.2,
  }));
  for (const minutes of [1, 5, 10, 30])
    for (const maxPerArtist of [1, 2]) {
      const p = optimize([...ranked, ranked[0]], {
        minutes,
        maxPerArtist,
        discovery: 0.5,
      });
      assert.ok(p.metrics.seconds <= minutes * 60);
      assert.equal(new Set(p.tracks.map((t) => t.id)).size, p.tracks.length);
      const artists = {};
      for (const t of p.tracks)
        artists[t.artist] = (artists[t.artist] || 0) + 1;
      assert.ok(Object.values(artists).every((n) => n <= maxPerArtist));
      assert.deepEqual(
        p,
        optimize([...ranked, ranked[0]], {
          minutes,
          maxPerArtist,
          discovery: 0.5,
        }),
      );
      assert.ok(p.constrainedMetrics.seconds <= minutes * 60);
    }
});
test("discovery chooses additional genres under the same constraints", () => {
  const candidates = fixtureItems.map((t, i) => ({
    ...t,
    relevance: [1, 0.95, 0.6, 0.5][i],
    novelty: t.genre === "Jazz" ? 0 : 1,
  }));
  const focused = optimize(candidates, {
      minutes: 7,
      maxPerArtist: 2,
      discovery: 0,
    }),
    varied = optimize(candidates, {
      minutes: 7,
      maxPerArtist: 2,
      discovery: 1,
    });
  assert.ok(varied.metrics.genres > focused.metrics.genres);
  assert.equal(varied.constrainedMetrics.genres, focused.metrics.genres);
});
test("invalid optimizer inputs rejected and short budget yields empty result", () => {
  assert.equal(optimize([]).tracks.length, 0);
  assert.throws(() => optimize([], { minutes: 0 }));
  assert.throws(() => optimize([], { maxPerArtist: 0 }));
  assert.throws(() => optimize([], { discovery: NaN }));
});
test("dataset validation rejects duplicate IDs, bad references and unsafe URLs", () => {
  assert.equal(
    validateDataset({ items: ITEMS, events: SEED_EVENTS }).events.length,
    1200,
  );
  assert.throws(() =>
    validateDataset({ items: [ITEMS[0], ITEMS[0]], events: [] }),
  );
  assert.throws(() =>
    validateDataset({ items: ITEMS, events: [event("x", "missing")] }),
  );
  assert.throws(() =>
    validateDataset({
      items: [{ ...ITEMS[0], previewUrl: "javascript:alert(1)" }, ITEMS[1]],
      events: [],
    }),
  );
  assert.throws(() =>
    validateDataset({
      items: ITEMS,
      events: [{ ...event("x", ITEMS[0].id), timestamp: Infinity }],
    }),
  );
  assert.throws(() =>
    validateDataset({
      items: ITEMS,
      events: [event("u", ITEMS[0].id), event("u", ITEMS[0].id)],
    }),
  );
});
test("URL normalization rejects credentials, protocols and local traversal", () => {
  assert.equal(safeUrl("https://user:pass@example.com/a.mp3"), "");
  assert.equal(safeUrl("assets/previews/../x.mp3", { local: true }), "");
  assert.equal(safeUrl("http://example.com/a.mp3"), "");
  assert.equal(
    safeUrl("https://example.com/a.mp3"),
    "https://example.com/a.mp3",
  );
});
test("prototype-like identifiers do not corrupt model structures", () => {
  const items = [
    {
      ...fixtureItems[0],
      id: "__proto__",
      genre: "constructor",
      artist: "toString",
    },
    {
      ...fixtureItems[1],
      id: "constructor",
      genre: "constructor",
      artist: "toString",
    },
    fixtureItems[2],
  ];
  const events = [
    event("__proto__", "__proto__"),
    event("__proto__", "constructor"),
  ];
  const data = validateDataset({ items, events }),
    m = train(data.items, data.events);
  assert.equal(m.userCount, 1);
  assert.ok(
    recommend(items, m, events, "__proto__", { excludeSeen: false }).every(
      (t) => Number.isFinite(t.score),
    ),
  );
});
test("evaluation is reproducible and reports both hit rate and discounted rank", () => {
  const result = evaluate(ITEMS, SEED_EVENTS, 5);
  assert.equal(result.users, 40);
  for (const key of ["hitRate", "popularityHitRate", "ndcg", "popularityNdcg"])
    assert.ok(result[key] >= 0 && result[key] <= 1);
  assert.deepEqual(result, evaluate(ITEMS, SEED_EVENTS, 5));
  assert.equal(evaluate(ITEMS, []).hitRate, null);
});
test("holdout removes repeated occurrences of the target from the evaluated user", () => {
  const history = [
    event("u", "d", "LIKE", 1),
    event("u", "a", "LIKE", 2),
    event("u", "b", "LIKE", 3),
    event("u", "c", "LIKE", 4),
    event("u", "d", "LIKE", 5),
  ];
  const result = evaluate(fixtureItems, history, 5);
  assert.equal(result.details[0].heldOut, "d");
  assert.equal(result.details[0].rank, 1);
  assert.equal(result.hitRate, 1);
});
