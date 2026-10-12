import test from "node:test";
import assert from "node:assert/strict";
import {
  createState,
  putEvent,
  undoSwipe,
  savePlaylist,
  hydrate,
} from "../src/service.js";
import {
  queryTable,
  getObject,
  deleteObject,
  restoreObject,
  archivePlaylist,
  tableRows,
} from "../src/cloud.js";
function playlist(s) {
  return savePlaylist(s, {
    name: "Review mix",
    tracks: s.items.slice(0, 3),
    settings: { minutes: 15 },
    metrics: { duration: 400 },
  });
}
test("DynamoDB queries isolate partitions, order sort keys and reflect real writes and undo", () => {
  const s = createState();
  putEvent(s, {
    itemId: s.items[0].id,
    type: "LIKE",
    id: "first",
    timestamp: 100,
  });
  putEvent(s, {
    itemId: s.items[1].id,
    type: "SKIP",
    id: "second",
    timestamp: 200,
  });
  const r = queryTable(s, "Interactions", "you", "EVENT#");
  assert.deepEqual(
    r.Items.map((e) => e.id),
    ["second", "first"],
  );
  assert.equal(queryTable(s, "Interactions", "unknown").Count, 0);
  assert.equal(
    s.cloud.operations.find((o) => o.operation === "PutItem").request.Item.PK,
    "USER#you",
  );
  undoSwipe(s);
  assert.equal(queryTable(s, "Interactions", "you").Count, 1);
  assert.equal(
    s.cloud.operations.some((o) => o.operation === "DeleteItem"),
    true,
  );
});
test("saved playlists write table records and real versioned JSON backups", () => {
  const s = createState(),
    p = playlist(s),
    first = s.cloud.objects[0];
  assert.equal(tableRows(s, "Playlists")[0].id, p.id);
  assert.deepEqual(
    JSON.parse(getObject(s, first.key).body).playlist.trackIds,
    p.trackIds,
  );
  archivePlaylist(s, p);
  assert.equal(s.cloud.objects.length, 2);
  assert.notEqual(s.cloud.objects[0].versionId, first.versionId);
  deleteObject(s, first.key);
  assert.throws(() => getObject(s, first.key), /NoSuchKey/);
  assert.equal(getObject(s, first.key, first.versionId).body, first.body);
  restoreObject(s, first.key, first.versionId);
  assert.equal(getObject(s, first.key).body, first.body);
  assert.equal(s.cloud.objects.length, 4);
  s.playlists = [];
  assert.equal(getObject(s, first.key).body, first.body);
});
test("cloud resources survive hydration and legacy sessions migrate with empty backups", () => {
  const s = createState();
  playlist(s);
  const key = s.cloud.objects[0].key;
  const restored = hydrate(JSON.parse(JSON.stringify(s)));
  assert.equal(getObject(restored, key).body, s.cloud.objects[0].body);
  assert.equal(restored.cloud.objects.length, 1);
  delete s.cloud;
  assert.equal(hydrate(s).cloud.objects.length, 0);
});
test("backup limit fails before changing a saved playlist table and journals stay bounded", () => {
  const s = createState();
  playlist(s);
  s.cloud.objects = Array.from({ length: 200 }, () => s.cloud.objects[0]);
  assert.throws(() => playlist(s), /limit/);
  assert.equal(s.playlists.length, 1);
  for (let i = 0; i < 50; i++) queryTable(s, "Interactions", "seed-1");
  assert.equal(s.cloud.operations.length, 40);
  assert.ok(
    s.cloud.operations.every(
      (o) => !o.response.Items || o.response.Items.length <= 12,
    ),
  );
});

test("Personalize journal captures positive events and deployment without treating SKIP as a positive signal", async () => {
  const { deploy } = await import("../src/service.js");
  const s = createState();
  putEvent(s, { itemId: s.items[0].id, type: "SKIP" });
  assert.equal(
    s.cloud.operations.filter((o) => o.service === "Personalize").length,
    0,
  );
  putEvent(s, { itemId: s.items[1].id, type: "LIKE" });
  assert.equal(
    s.cloud.operations.find((o) => o.service === "Personalize").request
      .eventList[0].eventType,
    "LIKE",
  );
  deploy(s, 1);
  assert.equal(s.cloud.operations[0].operation, "UpdateCampaign");
});
test("same-campaign comparison is computed without changing active user or fabricating differences", async () => {
  const { compareListeners, reviewEvidence } = await import(
    "../src/cloud-proof.js"
  );
  const { train } = await import("../src/engine.js");
  const s = createState(),
    user = s.user;
  const comparison = compareListeners(s, "demo-1", "demo-2");
  assert.equal(s.user, user);
  assert.equal(comparison.results.length, 2);
  assert.equal(
    comparison.results[0].request.solutionVersion,
    comparison.results[1].request.solutionVersion,
  );
  assert.equal(
    s.cloud.operations.filter((o) => o.operation === "GetRecommendations")
      .length,
    2,
  );
  s.models = [train(s.items, s.events, 1, "popularity")];
  const popular = compareListeners(s, "demo-1", "demo-2");
  assert.deepEqual(
    popular.results[0].response.itemList.map((t) => t.itemId),
    popular.results[1].response.itemList.map((t) => t.itemId),
  );
  assert.equal(reviewEvidence(s).awsResourcesCreated, 0);
  assert.throws(() => compareListeners(s, "you", "you"), /different/);
});
