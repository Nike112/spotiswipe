import { createFixture, PROFILES } from "./data.js";
import {
  validateDataset,
  train,
  recommend,
  RECIPES,
  WEIGHTS,
  decisions,
} from "./engine.js";
export const SCHEMA = 3;
export function audit(state, operation, detail) {
  state.audit.unshift({ at: Date.now(), operation, detail });
  state.audit = state.audit.slice(0, 60);
}
export function createState() {
  const data = createFixture(),
    model = train(data.items, data.events);
  model.trainingEvents = data.events.map((e) => ({ ...e }));
  return {
    schema: SCHEMA,
    ...data,
    profiles: PROFILES.map((p) => ({ ...p, preferences: [] })),
    user: "you",
    mood: "balanced",
    feedDiscovery: 0.15,
    clean: false,
    models: [model],
    campaign: {
      name: "spotiswipe-discovery",
      version: 1,
      status: "ACTIVE",
      updatedAt: Date.now(),
    },
    playlists: [],
    audit: [],
    revision: 1,
    undo: null,
  };
}
export function activeModel(state) {
  return (
    state.models.find((m) => m.version === state.campaign?.version) || null
  );
}
export function serve(state, options = {}) {
  const profile = state.profiles.find((p) => p.id === state.user);
  return recommend(state.items, activeModel(state), state.events, state.user, {
    preferences: profile?.preferences || [],
    ...options,
  });
}
export function putEvent(
  state,
  {
    itemId,
    type,
    id = crypto.randomUUID(),
    timestamp = Math.floor(Date.now() / 1000),
  },
) {
  if (
    !state.items.some((t) => t.id === itemId) ||
    !Object.hasOwn(WEIGHTS, type)
  )
    throw Error("Invalid interaction event.");
  if (state.events.length >= 10000)
    throw Error(
      "The local dataset reached 10,000 events. Export your data, then start a new session.",
    );
  if (state.events.some((e) => e.id === id)) return false;
  state.events.push({
    id,
    userId: state.user,
    itemId,
    type,
    timestamp,
    source: "listener",
  });
  if (type === "LIKE" || type === "SKIP")
    state.undo = { id, userId: state.user, itemId };
  audit(state, "PutEvents", `${state.user} · ${type} · ${itemId}`);
  return true;
}
export function undoSwipe(state) {
  if (!state.undo || state.undo.userId !== state.user) return null;
  const event = state.events.find((e) => e.id === state.undo.id);
  state.events = state.events.filter((e) => e.id !== state.undo.id);
  state.undo = null;
  if (event) audit(state, "UndoInteraction", `${event.type} · ${event.itemId}`);
  return event?.itemId || null;
}
export function finishTraining(state, model, trainingEvents, revision) {
  if (revision !== state.revision)
    throw Error(
      "The dataset changed during training. Train again on the current data.",
    );
  if (state.models.some((m) => m.version === model.version))
    throw Error("This model version already exists.");
  model.trainingEvents = trainingEvents.map((e) => ({ ...e }));
  state.models.push(model);
  if (state.models.length > 8) {
    const remove = state.models.findIndex(
      (m) => m.version !== state.campaign?.version,
    );
    state.models.splice(remove, 1);
  }
  audit(
    state,
    "CreateSolutionVersion",
    `v${model.version} · ${RECIPES[model.recipe]} · ${model.eventCount} source events`,
  );
}
export function deploy(state, version) {
  const model = state.models.find(
    (m) => m.version === version && m.status === "ACTIVE",
  );
  if (!model) throw Error("Only a completed solution version can be deployed.");
  state.campaign = {
    name: "spotiswipe-discovery",
    version,
    status: "ACTIVE",
    updatedAt: Date.now(),
  };
  audit(state, "UpdateCampaign", `Serving solution v${version}`);
}
export function importDataset(state, input) {
  const data = validateDataset(input);
  const replacement = createState();
  replacement.items = data.items;
  replacement.events = data.events;
  replacement.models = [];
  replacement.campaign = null;
  replacement.revision = state.revision + 1;
  replacement.profiles = [
    { id: "you", name: "Your listening room", preferences: [] },
    ...[...new Set(data.events.map((e) => e.userId))]
      .filter((id) => id !== "you")
      .slice(0, 19)
      .map((id) => ({ id, name: `Imported · ${id}`, preferences: [] })),
  ];
  audit(
    replacement,
    "CreateDatasetImportJob",
    `${data.items.length} items · ${data.events.length} events · validated. Train and deploy to serve.`,
  );
  return replacement;
}
export function savePlaylist(
  state,
  { name, tracks, settings, metrics, baselineMetrics, constrainedMetrics },
) {
  if (!tracks.length) throw Error("Build a nonempty mix before saving it.");
  if (state.playlists.length >= 50)
    throw Error(
      "The library holds 50 playlists. Remove one before saving another.",
    );
  const cleaned = String(name).trim().slice(0, 80);
  if (!cleaned) throw Error("Give your playlist a name.");
  const playlist = {
    id: crypto.randomUUID(),
    name: cleaned,
    userId: state.user,
    createdAt: Date.now(),
    version: state.campaign?.version,
    settings,
    trackIds: tracks.map((t) => t.id),
    metrics,
    baselineMetrics,
    constrainedMetrics,
  };
  state.playlists.unshift(playlist);
  audit(state, "SavePlaylist", `${cleaned} · ${tracks.length} tracks`);
  return playlist;
}
export function likedItems(state) {
  const liked = decisions(state.events, state.user);
  return state.items.filter((t) => liked.get(t.id) === "LIKE");
}
export function hydrate(input) {
  if (!input || input.schema !== SCHEMA)
    throw Error("Saved data uses an unsupported format.");
  const data = validateDataset(input);
  if (
    !Array.isArray(input.models) ||
    input.models.length > 8 ||
    !Array.isArray(input.profiles) ||
    !input.profiles.length ||
    input.profiles.length > 20
  )
    throw Error("Saved session is malformed.");
  const profiles = input.profiles.map((p) => {
    if (
      typeof p.id !== "string" ||
      !p.id ||
      p.id.length > 100 ||
      typeof p.name !== "string" ||
      p.name.length > 100
    )
      throw Error("Saved profile is malformed.");
    return {
      id: p.id,
      name: p.name,
      preferences: Array.isArray(p.preferences)
        ? p.preferences.filter((g) => data.items.some((t) => t.genre === g))
        : [],
    };
  });
  const versions = new Set();
  const models = input.models.map((m) => {
    if (
      !Number.isInteger(m.version) ||
      m.version < 1 ||
      versions.has(m.version) ||
      !Object.hasOwn(RECIPES, m.recipe)
    )
      throw Error("Saved model is malformed.");
    versions.add(m.version);
    const training = validateDataset({
      items: data.items,
      events: m.trainingEvents,
    }).events;
    const result = train(data.items, training, m.version, m.recipe);
    result.createdAt = Number.isFinite(m.createdAt) ? m.createdAt : Date.now();
    result.trainingEvents = training;
    if (m.evaluation && Number.isFinite(m.evaluation.hitRate))
      result.evaluation = m.evaluation;
    return result;
  });
  const ids = new Set(data.items.map((t) => t.id));
  const playlists = Array.isArray(input.playlists)
    ? input.playlists
        .filter(
          (p) =>
            p &&
            typeof p.id === "string" &&
            typeof p.name === "string" &&
            p.name.length <= 80 &&
            profiles.some((u) => u.id === p.userId) &&
            Array.isArray(p.trackIds) &&
            p.trackIds.length <= 250 &&
            p.trackIds.every((id) => ids.has(id)),
        )
        .slice(0, 50)
    : [];
  return {
    schema: SCHEMA,
    ...data,
    profiles,
    user: profiles.some((p) => p.id === input.user)
      ? input.user
      : profiles[0].id,
    mood: ["balanced", "focus", "gym", "night", "drive"].includes(input.mood)
      ? input.mood
      : "balanced",
    feedDiscovery: Number.isFinite(input.feedDiscovery)
      ? Math.max(0, Math.min(1, input.feedDiscovery))
      : 0.15,
    clean: input.clean === true,
    models,
    campaign:
      input.campaign && versions.has(input.campaign.version)
        ? {
            name: "spotiswipe-discovery",
            version: input.campaign.version,
            status: "ACTIVE",
            updatedAt: input.campaign.updatedAt,
          }
        : null,
    playlists,
    audit: Array.isArray(input.audit)
      ? input.audit
          .filter(
            (a) =>
              a &&
              typeof a.operation === "string" &&
              typeof a.detail === "string" &&
              Number.isFinite(a.at),
          )
          .slice(0, 60)
      : [],
    revision: Number.isInteger(input.revision) ? input.revision : 1,
    undo: null,
  };
}
