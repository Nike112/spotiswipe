import test from "node:test";
import assert from "node:assert/strict";
import { ITEMS, SEED_EVENTS } from "../src/data.js";
import {
  train,
  recommend,
  optimize,
  evaluate,
  validateDataset,
} from "../src/engine.js";
test("trained listener profiles give different personalized rankings", () => {
  const m = train(ITEMS, SEED_EVENTS);
  const a = recommend(ITEMS, m, SEED_EVENTS, "demo-1", { discovery: 0 }),
    b = recommend(ITEMS, m, SEED_EVENTS, "demo-3", { discovery: 0 });
  assert.notDeepEqual(
    a.slice(0, 5).map((t) => t.id),
    b.slice(0, 5).map((t) => t.id),
  );
  assert.equal(a[0].genre, "Electronic");
  assert.equal(b[0].genre, "Jazz");
});
test("positive and negative feedback change an unseen genre candidate score", () => {
  const m = train(ITEMS, SEED_EVENTS),
    id = ITEMS[0].id,
    target = ITEMS[1].id;
  const ranked = (events) =>
    recommend(ITEMS, m, events, "you", { discovery: 0 }).find(
      (t) => t.id === target,
    ).score;
  assert.ok(
    ranked([
      ...SEED_EVENTS,
      { userId: "you", itemId: id, type: "LIKE", timestamp: 1 },
    ]) >
      ranked([
        ...SEED_EVENTS,
        { userId: "you", itemId: id, type: "SKIP", timestamp: 1 },
      ]),
  );
});
test("seen and explicit tracks excluded, all-seen produces empty feed", () => {
  const m = train(ITEMS, SEED_EVENTS);
  const r = recommend(ITEMS, m, SEED_EVENTS, "demo-1", { clean: true });
  assert.ok(
    r.every(
      (t) =>
        !t.explicit &&
        !SEED_EVENTS.some((e) => e.userId === "demo-1" && e.itemId === t.id),
    ),
  );
  assert.deepEqual(
    recommend(
      ITEMS,
      m,
      ITEMS.map((t) => ({ userId: "all", itemId: t.id, type: "LIKE" })),
      "all",
    ),
    [],
  );
});
test("playlist enforces duration, artist caps, uniqueness and deterministic results", () => {
  const ranked = recommend(
    ITEMS,
    train(ITEMS, SEED_EVENTS),
    SEED_EVENTS,
    "demo-1",
    { excludeSeen: false },
  );
  for (const minutes of [1, 10, 20, 45]) {
    const p = optimize(ranked, { minutes, maxPerArtist: 1 });
    assert.ok(p.metrics.seconds <= minutes * 60);
    assert.equal(new Set(p.tracks.map((t) => t.id)).size, p.tracks.length);
    assert.equal(p.metrics.artists, p.tracks.length);
    assert.deepEqual(p, optimize(ranked, { minutes, maxPerArtist: 1 }));
  }
  assert.equal(optimize([]).tracks.length, 0);
});
test("model version training changes learned co-occurrence", () => {
  const items = ITEMS.slice(0, 3);
  const events = [
    { userId: "x", itemId: items[0].id, type: "LIKE", timestamp: 1 },
    { userId: "x", itemId: items[1].id, type: "LIKE", timestamp: 2 },
  ];
  assert.equal(train(items, []).similarity[items[0].id], undefined);
  assert.equal(train(items, events, 2).similarity[items[0].id][items[1].id], 1);
});
test("invalid imports rejected before mutation", () => {
  assert.equal(
    validateDataset({ items: ITEMS, events: SEED_EVENTS }).items.length,
    72,
  );
  assert.throws(() =>
    validateDataset({ items: [ITEMS[0], ITEMS[0]], events: [] }),
  );
  assert.throws(() =>
    validateDataset({
      items: ITEMS,
      events: [{ userId: "x", itemId: "missing", type: "LIKE", timestamp: 0 }],
    }),
  );
  assert.throws(() =>
    validateDataset({
      items: [{ ...ITEMS[0], energy: 2 }, ITEMS[1]],
      events: [],
    }),
  );
});
test("chronological evaluation is bounded, repeatable and handles sparse data", () => {
  const result = evaluate(ITEMS, SEED_EVENTS);
  assert.equal(result.users, 30);
  assert.ok(result.hitRate >= 0 && result.hitRate <= 1);
  assert.deepEqual(result, evaluate(ITEMS, SEED_EVENTS));
  assert.equal(evaluate(ITEMS, []).hitRate, null);
});
test("imported keys cannot collide with Object prototype properties", () => {
  const items = [
    { ...ITEMS[0], id: "__proto__", genre: "constructor", artist: "toString" },
    {
      ...ITEMS[1],
      id: "constructor",
      genre: "constructor",
      artist: "toString",
    },
    { ...ITEMS[2], id: "other" },
  ];
  const events = [
    { userId: "__proto__", itemId: "__proto__", type: "LIKE", timestamp: 1 },
    { userId: "__proto__", itemId: "constructor", type: "LIKE", timestamp: 2 },
  ];
  const data = validateDataset({ items, events });
  const m = train(data.items, data.events);
  assert.equal(m.userCount, 1);
  assert.ok(
    recommend(items, m, events, "__proto__", { excludeSeen: false }).every(
      (t) => Number.isFinite(t.score),
    ),
  );
  const p = optimize(
    recommend(items, m, events, "__proto__", { excludeSeen: false }),
  );
  assert.equal(p.tracks.filter((t) => t.artist === "toString").length, 1);
  assert.equal({}.polluted, undefined);
});
test("discovery increases genre coverage for a strongly focused listener", () => {
  const ranked = recommend(
    ITEMS,
    train(ITEMS, SEED_EVENTS),
    SEED_EVENTS,
    "demo-1",
    { excludeSeen: false, discovery: 0 },
  );
  const focused = optimize(ranked, { discovery: 0 }),
    varied = optimize(ranked, { discovery: 0.8 });
  assert.ok(varied.metrics.genres > focused.metrics.genres);
});
