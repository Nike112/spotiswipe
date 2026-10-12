import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  activeModel,
  putEvent,
  undoSwipe,
  finishTraining,
  deploy,
  importDataset,
  savePlaylist,
  hydrate,
  likedItems,
  serve,
} from "../src/service.js";
import { train, optimize } from "../src/engine.js";
test("training does not change the campaign until deployment; rollback works", () => {
  const s = createState(),
    model = train(s.items, s.events, 2, "popularity");
  finishTraining(s, model, s.events, s.revision);
  assert.equal(activeModel(s).version, 1);
  deploy(s, 2);
  assert.equal(activeModel(s).recipe, "popularity");
  deploy(s, 1);
  assert.equal(activeModel(s).version, 1);
  assert.throws(() => deploy(s, 99));
});
test("stale background jobs cannot be installed after dataset replacement", () => {
  const s = createState(),
    m = train(s.items, s.events, 2);
  assert.throws(
    () => finishTraining(s, m, s.events, s.revision + 1),
    /changed/,
  );
  assert.equal(s.models.length, 1);
});
test("event IDs prevent duplicate delivery and undo is listener-scoped", () => {
  const s = createState(),
    id = s.items[0].id;
  putEvent(s, { itemId: id, type: "LIKE", id: "request-1" });
  assert.equal(
    putEvent(s, { itemId: id, type: "LIKE", id: "request-1" }),
    false,
  );
  assert.equal(likedItems(s).length, 1);
  s.user = "demo-1";
  assert.equal(undoSwipe(s), null);
  s.user = "you";
  assert.equal(undoSwipe(s), id);
  assert.equal(likedItems(s).length, 0);
});
test("trained snapshot never grows when new events arrive", () => {
  const s = createState();
  putEvent(s, { itemId: s.items[0].id, type: "LIKE" });
  assert.equal(s.events.length, 1201);
  assert.equal(s.models[0].trainingEvents.length, 1200);
});
test("dataset import is transactional and requires retrain/deploy", () => {
  const s = createState();
  assert.throws(() => importDataset(s, { items: [], events: [] }));
  assert.equal(s.items.length, 16);
  const imported = importDataset(s, { items: s.items, events: [] });
  assert.equal(imported.models.length, 0);
  assert.equal(imported.campaign, null);
  assert.throws(() => serve(imported));
  const m = train(imported.items, imported.events, 1);
  finishTraining(imported, m, imported.events, imported.revision);
  deploy(imported, 1);
  assert.equal(serve(imported).length, 16);
});
test("saved mixes survive serialization and keep listener ownership", () => {
  const s = createState(),
    mix = optimize(serve(s, { excludeSeen: false }));
  const saved = savePlaylist(s, {
    ...mix,
    name: "Morning mix",
    settings: { minutes: 15 },
  });
  const restored = hydrate(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.playlists[0].name, "Morning mix");
  assert.equal(restored.playlists[0].userId, "you");
  assert.deepEqual(restored.playlists[0].trackIds, saved.trackIds);
  assert.deepEqual(
    serve(restored).map((t) => t.score),
    serve(s).map((t) => t.score),
  );
});
test("snapshot restoration preserves manually deployed older versions", () => {
  const s = createState();
  finishTraining(
    s,
    train(s.items, s.events, 2, "popularity"),
    s.events,
    s.revision,
  );
  const restored = hydrate(JSON.parse(JSON.stringify(s)));
  assert.equal(restored.models.length, 2);
  assert.equal(activeModel(restored).version, 1);
  assert.equal(restored.models[1].recipe, "popularity");
});
test("retention never deletes the deployed model", () => {
  const s = createState();
  for (let version = 2; version < 12; version++)
    finishTraining(s, train(s.items, s.events, version), s.events, s.revision);
  assert.equal(s.models.length, 8);
  assert.equal(activeModel(s).version, 1);
  assert.equal(s.models.at(-1).version, 11);
});
test("invalid restored states fail explicitly", () => {
  assert.throws(() => hydrate({}));
  const s = createState();
  s.models[0].trainingEvents = [{ bad: true }];
  assert.throws(() => hydrate(s));
});
test("no preview event is represented as replay automatically", () => {
  const s = createState();
  putEvent(s, { itemId: s.items[0].id, type: "LISTEN" });
  assert.equal(s.events.at(-1).type, "LISTEN");
  assert.equal(s.events.at(-1).source, "listener");
  assert.equal(likedItems(s).length, 0);
});
