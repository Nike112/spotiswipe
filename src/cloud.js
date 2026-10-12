// Local educational adapters. No AWS SDK, credentials or remote resources.
export const BUCKET = "spotiswipe-playlist-backups-local";
export function cloudState(input) {
  return {
    objects: Array.isArray(input?.objects)
      ? input.objects
          .filter(
            (o) =>
              o &&
              typeof o.key === "string" &&
              o.key.length <= 300 &&
              typeof o.versionId === "string" &&
              Number.isFinite(o.at) &&
              (o.deleteMarker === true ||
                (typeof o.body === "string" && o.body.length <= 100000)),
          )
          .slice(0, 200)
      : [],
    operations: Array.isArray(input?.operations)
      ? input.operations
          .filter(
            (o) =>
              o &&
              typeof o.service === "string" &&
              typeof o.operation === "string" &&
              Number.isFinite(o.at),
          )
          .slice(0, 40)
      : [],
  };
}
export function record(state, service, operation, request, response) {
  state.cloud ||= cloudState();
  state.cloud.operations.unshift({
    id: crypto.randomUUID(),
    at: Date.now(),
    service,
    operation,
    request: structuredClone(request),
    response: structuredClone(
      response?.Items
        ? {
            ...response,
            Items: response.Items.slice(0, 12),
            previewOnly: response.Count > 12,
          }
        : response,
    ),
  });
  state.cloud.operations = state.cloud.operations.slice(0, 40);
  return response;
}
export function tableRows(state, table) {
  if (table === "Interactions")
    return state.events.map((e) => ({
      PK: `USER#${e.userId}`,
      SK: `EVENT#${String(e.timestamp).padStart(12, "0")}#${e.id}`,
      ...e,
    }));
  if (table === "Playlists")
    return state.playlists.map((p) => ({
      PK: `USER#${p.userId}`,
      SK: `PLAYLIST#${p.id}`,
      ...p,
    }));
  throw Error("Unknown local table.");
}
export function queryTable(state, table, userId, prefix = "", log = true) {
  const PK = `USER#${userId}`;
  const rows = tableRows(state, table)
    .filter((r) => r.PK === PK && r.SK.startsWith(prefix))
    .sort((a, b) => (a.SK < b.SK ? 1 : a.SK > b.SK ? -1 : 0));
  const result = { Count: rows.length, Items: rows };
  if (log)
    record(
      state,
      "DynamoDB",
      "Query",
      {
        TableName: table,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
        ExpressionAttributeValues: { ":pk": PK, ":prefix": prefix },
        ScanIndexForward: false,
      },
      result,
    );
  return result;
}
export function writeRecord(state, table, value) {
  return record(
    state,
    "DynamoDB",
    "PutItem",
    {
      TableName: table,
      Item: tableRows(state, table).find((r) => r.id === value.id),
    },
    { stored: true },
  );
}
export function deleteRecord(state, table, value) {
  const SK =
    table === "Playlists"
      ? `PLAYLIST#${value.id}`
      : `EVENT#${String(value.timestamp).padStart(12, "0")}#${value.id}`;
  record(
    state,
    "DynamoDB",
    "DeleteItem",
    { TableName: table, Key: { PK: `USER#${value.userId}`, SK } },
    { deleted: true },
  );
}
export function putObject(state, key, body) {
  state.cloud ||= cloudState();
  if (
    typeof key !== "string" ||
    !key ||
    key.length > 300 ||
    typeof body !== "string" ||
    body.length > 100000
  )
    throw Error("Invalid local object (maximum 100 KB of text).");
  if (state.cloud.objects.length >= 200)
    throw Error(
      "Backup limit reached (200 versions). Export your work before resetting the dataset.",
    );
  const object = {
    key,
    versionId: crypto.randomUUID(),
    at: Date.now(),
    body,
    size: new TextEncoder().encode(body).length,
    deleteMarker: false,
  };
  state.cloud.objects.unshift(object);
  record(
    state,
    "S3",
    "PutObject",
    {
      Bucket: BUCKET,
      Key: key,
      ContentType: "application/json",
      bytes: object.size,
    },
    { VersionId: object.versionId },
  );
  return object;
}
export function archivePlaylist(state, p) {
  return putObject(
    state,
    `listeners/${encodeURIComponent(p.userId)}/playlists/${encodeURIComponent(p.id)}.json`,
    JSON.stringify({ format: "spotiswipe-playlist-v1", playlist: p }, null, 2),
  );
}
export function getObject(state, key, versionId, log = true) {
  const o = state.cloud.objects.find(
    (o) => o.key === key && (!versionId || o.versionId === versionId),
  );
  if (!o || o.deleteMarker)
    throw Error(
      "NoSuchKey: object absent or latest version is a delete marker. Choose an earlier version to recover it.",
    );
  if (log)
    record(
      state,
      "S3",
      "GetObject",
      {
        Bucket: BUCKET,
        Key: key,
        ...(versionId ? { VersionId: versionId } : {}),
      },
      { VersionId: o.versionId, bytes: o.size },
    );
  return o;
}
export function deleteObject(state, key) {
  getObject(state, key, undefined, false);
  if (state.cloud.objects.length >= 200)
    throw Error("Backup version limit reached.");
  const o = {
    key,
    versionId: crypto.randomUUID(),
    at: Date.now(),
    deleteMarker: true,
    size: 0,
  };
  state.cloud.objects.unshift(o);
  record(
    state,
    "S3",
    "DeleteObject",
    { Bucket: BUCKET, Key: key },
    { VersionId: o.versionId, DeleteMarker: true },
  );
  return o;
}
export function restoreObject(state, key, versionId) {
  return putObject(state, key, getObject(state, key, versionId).body);
}
