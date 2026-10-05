import { MOODS, createFixture } from "./data.js";
import {
  validateDataset,
  train,
  recommend,
  optimize,
  evaluate,
  WEIGHTS,
} from "./engine.js";
const $ = (id) => document.getElementById(id),
  KEY = "spotiswipe-personalize-v2";
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const time = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
let noticeTimer;
function notice(message) {
  $("notice").textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("notice").textContent = ""), 6500);
}
function fresh() {
  const data = createFixture();
  return {
    ...data,
    models: [train(data.items, data.events)],
    user: "you",
    mood: "balanced",
  };
}
let state = fresh(),
  recoveryMessage = "";
try {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    const loaded = JSON.parse(raw);
    const data = validateDataset(loaded);
    state = {
      ...fresh(),
      ...data,
      user: ["you", "demo-1", "demo-3", "demo-5"].includes(loaded.user)
        ? loaded.user
        : "you",
      mood: Object.hasOwn(MOODS, loaded.mood) ? loaded.mood : "balanced",
    };
    // Persist validated training snapshots, then reconstruct the model from their source data.
    if (Array.isArray(loaded.snapshots) && loaded.snapshots.length) {
      state.models = loaded.snapshots.slice(-8).map((s) => {
        const d = validateDataset({ items: state.items, events: s.events });
        const m = train(
          state.items,
          d.events,
          Number.isInteger(s.version) && s.version > 0 ? s.version : 1,
        );
        m.createdAt = Number.isFinite(s.createdAt) ? s.createdAt : Date.now();
        m.trainingEvents = d.events;
        return m;
      });
    } else state.models = [train(state.items, state.events)];
  }
} catch {
  recoveryMessage =
    "Saved data was unreadable. Loaded the synthetic demo instead.";
}
state.models.forEach(
  (m) => (m.trainingEvents ??= state.events.map((e) => ({ ...e }))),
);
let current = null,
  playlist = null,
  audioContext = null,
  soundTimer = null,
  view = "discover";
function save() {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        ...state,
        models: undefined,
        snapshots: state.models.map((m) => ({
          version: m.version,
          createdAt: m.createdAt,
          events: m.trainingEvents,
        })),
      }),
    );
  } catch {
    notice(
      "Browser storage is unavailable or full. This session works, but changes may not survive a reload.",
    );
  }
}
function model() {
  return state.models.at(-1);
}
function ranking(options = {}) {
  return recommend(state.items, model(), state.events, state.user, {
    mood: MOODS[state.mood],
    ...options,
  });
}
function stopSound() {
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  clearTimeout(soundTimer);
  $("preview").innerHTML = "▶ <span>Demo sound</span>";
}
function renderCard() {
  stopSound();
  current = ranking()[0] || null;
  ["like", "skip", "preview"].forEach((id) => ($(id).disabled = !current));
  if (!current) {
    $("track-card").innerHTML =
      '<div class="empty"><h2>You’ve explored this catalog.</h2><p>Switch listeners, import a new dataset, or reset your swipes to start again.</p></div>';
    $("explanation").textContent = "No unseen candidates remain.";
    return;
  }
  const t = current,
    color = /^#[a-f0-9]{6}$/i.test(t.color) ? t.color : "#b0bea1";
  $("track-card").innerHTML =
    `<div class="art" style="--cover:${color}"><span class="art-index">SYNTHETIC RELEASE / ${esc(t.id.toUpperCase())}</span><div class="record"><div class="record-label">${esc(t.genre.slice(0, 2).toUpperCase())}</div></div><span class="art-caption">SIDE A / DISCOVERY</span></div><div class="track-top"><span>${esc(t.genre)} / ${t.novelty > 0.7 ? "NEW TERRITORY" : "TASTE MATCH"}</span><span>${time(t.duration)}</span></div><h2>${esc(t.title)}</h2><p class="artist">${esc(t.artist)}</p><div class="track-tags"><span>Energy ${Math.round(t.energy * 100)}%</span><span>Mood ${esc(MOODS[state.mood].label)}</span><span>${t.explicit ? "Explicit" : "Clean"}</span></div>`;
  $("explanation").innerHTML =
    `<p>${esc(t.reason)}.</p><p>Ranking score: ${t.score.toFixed(3)} (not a probability). Model v${model().version}.</p>${Object.entries(
      t.components,
    )
      .map(([k, v]) => `<p>${esc(k)}: ${v.toFixed(3)}</p>`)
      .join(
        "",
      )}<p>The discovery feed uses 20% novelty. Playlist discovery is adjustable separately.</p>`;
}
function renderTaste() {
  const own = state.events.filter((e) => e.userId === state.user),
    weights = Object.create(null);
  for (const e of own) {
    const t = state.items.find((t) => t.id === e.itemId);
    if (t) weights[t.genre] = (weights[t.genre] || 0) + WEIGHTS[e.type];
  }
  const genres = [...new Set(state.items.map((t) => t.genre))],
    max = Math.max(1, ...Object.values(weights).map(Math.abs));
  $("taste-bars").innerHTML = genres
    .map(
      (g) =>
        `<div class="bar-row"><div class="bar-label"><span>${esc(g)}</span><span>${(weights[g] || 0).toFixed(1)}</span></div><div class="bar"><div class="bar-fill" style="width:${Math.round((Math.abs(weights[g] || 0) / max) * 100)}%;background:${(weights[g] || 0) < 0 ? "#c48d86" : "#bed39d"}"></div></div></div>`,
    )
    .join("");
  $("session-stats").textContent =
    `${own.filter((e) => e.type === "LIKE").length} keeps · ${own.filter((e) => e.type === "SKIP").length} passes · ${own.filter((e) => e.type === "REPLAY").length} replays`;
}
function renderMoods() {
  $("moods").innerHTML = Object.entries(MOODS)
    .map(
      ([key, m]) =>
        `<button class="mood ${state.mood === key ? "active" : ""}" data-mood="${key}" aria-pressed="${state.mood === key}">${m.label}</button>`,
    )
    .join("");
}
function metric(value, label) {
  return `<div class="metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}
function renderLab() {
  const m = model();
  $("lab-stats").innerHTML =
    metric(state.items.length, "Catalog items") +
    metric(new Set(state.events.map((e) => e.userId)).size, "Listeners") +
    metric(state.events.length, "Interaction events") +
    metric(`v${m.version}`, "Active solution version");
  $("versions").innerHTML = [...state.models]
    .reverse()
    .map(
      (v) =>
        `<div class="log-row">v${v.version} · ${v.eventCount} source events · ${v.userCount} positive-history users<small>${new Date(v.createdAt).toLocaleString()} ${v === m ? "· active" : ""}</small></div>`,
    )
    .join("");
  $("events").innerHTML = [...state.events]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10)
    .map(
      (e) =>
        `<div class="log-row">${esc(e.type)} · ${esc(e.itemId)}<small>${esc(e.userId)} · ${new Date(e.timestamp * 1000).toLocaleString()}</small></div>`,
    )
    .join("");
  $("request-inspector").textContent = JSON.stringify(
    {
      operation: "GetRecommendations (local simulation)",
      request: {
        userId: state.user,
        solutionVersion: m.version,
        numResults: 5,
        context: { mood: state.mood },
      },
      response: ranking()
        .slice(0, 5)
        .map((t) => ({
          itemId: t.id,
          score: Number(t.score.toFixed(4)),
          reason: t.reason,
        })),
    },
    null,
    2,
  );
}
function invalidatePlaylist(
  message = "Profile or data changed. Build a new mix for the current listener.",
) {
  playlist = null;
  $("playlist-result").innerHTML = `<p class="empty">${esc(message)}</p>`;
}
function refresh() {
  renderMoods();
  renderCard();
  renderTaste();
  renderLab();
  $("user").value = state.user;
}
function record(type) {
  if (!current) return;
  state.events.push({
    userId: state.user,
    itemId: current.id,
    type,
    timestamp: Math.floor(Date.now() / 1000),
  });
  save();
  invalidatePlaylist();
  refresh();
}
function navigate(next) {
  if (!["discover", "playlist", "lab", "guide"].includes(next))
    next = "discover";
  view = next;
  stopSound();
  document
    .querySelectorAll(".view")
    .forEach((el) => (el.hidden = el.id !== next));
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === next);
    if (el.dataset.view === next) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  if (location.hash !== `#${next}`) history.replaceState(null, "", `#${next}`);
}
function download(filename, data) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function renderPlaylist() {
  const p = playlist;
  if (!p) return;
  const rows = [
    ["Duration", time(p.metrics.seconds), time(p.baselineMetrics.seconds)],
    ["Tracks", p.metrics.count, p.baselineMetrics.count],
    ["Unique artists", p.metrics.artists, p.baselineMetrics.artists],
    ["Unique genres", p.metrics.genres, p.baselineMetrics.genres],
    [
      "Mean relevance",
      p.metrics.meanRelevance.toFixed(3),
      p.baselineMetrics.meanRelevance.toFixed(3),
    ],
  ];
  $("playlist-result").innerHTML =
    `<div class="metrics">${metric(p.metrics.count, "Tracks")}${metric(time(p.metrics.seconds), "Total duration")}${metric(p.metrics.genres, "Genres")}${metric(p.metrics.artists, "Artists")}</div><h2>Your mix / ${esc(state.user)}</h2><p class="small">${p.metrics.count ? "A greedy constrained selection; diversity may trade off with relevance." : "No eligible tracks fit. Increase your duration budget or relax the filters."} Duration is a ceiling, not an exact target. Results use synthetic tracks.</p><div class="table-wrap"><table><caption>Optimized mix compared with relevance-only ranking under the same duration budget</caption><thead><tr><th>Measure</th><th>Optimized</th><th>Plain ranking</th></tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="small">Plain ranking uses the same clean-content and rejected-track filters, but has no artist cap or genre-coverage bonus. Scores are heuristic, not measured listener satisfaction.</p><button id="export-playlist" class="secondary">Download playlist JSON</button><ol class="playlist-tracks">${p.tracks.map((t, i) => `<li><span class="track-number">${String(i + 1).padStart(2, "0")}</span><div><strong>${esc(t.title)}</strong><p>${esc(t.artist)} · ${esc(t.genre)}</p><p>${esc(t.selectionReason)}</p></div><span class="duration">${time(t.duration)}</span></li>`).join("")}</ol>`;
  $("export-playlist").onclick = () =>
    download("spotiswipe-playlist.json", {
      listener: state.user,
      synthetic: true,
      modelVersion: model().version,
      settings: p.settings,
      tracks: p.tracks,
      metrics: p.metrics,
    });
}
$("playlist-form").onsubmit = (e) => {
  e.preventDefault();
  const rejected = new Set(
    state.events
      .filter((e) => e.userId === state.user && e.type === "SKIP")
      .map((e) => e.itemId),
  );
  const settings = {
    minutes: Number($("minutes").value),
    maxPerArtist: Number($("artist-limit").value),
    discovery: Number($("discovery").value) / 100,
    clean: $("clean").checked,
  };
  const ranked = ranking({
    excludeSeen: false,
    clean: settings.clean,
    discovery: 0,
  }).filter((t) => !rejected.has(t.id));
  playlist = { ...optimize(ranked, settings), settings };
  renderPlaylist();
  notice("Mix built. Compare the measured results below.");
};
$("discovery").oninput = () => {
  $("discovery-value").value = `${$("discovery").value}%`;
  if (playlist)
    invalidatePlaylist("Settings changed. Build again to apply them.");
};
["minutes", "artist-limit", "clean"].forEach(
  (id) =>
    ($(id).onchange = () => {
      if (playlist)
        invalidatePlaylist("Settings changed. Build again to apply them.");
    }),
);
$("like").onclick = () => record("LIKE");
$("skip").onclick = () => record("SKIP");
$("preview").onclick = async () => {
  if (!current) return;
  if (audioContext) {
    stopSound();
    return;
  }
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) throw Error("Audio not supported");
    audioContext = new Context();
    await audioContext.resume();
    const t = current,
      base = 130.81 + (state.items.findIndex((x) => x.id === t.id) % 12) * 9;
    for (let i = 0; i < 12; i++) {
      const start = audioContext.currentTime + i * 0.28;
      const oscillator = audioContext.createOscillator(),
        gain = audioContext.createGain();
      oscillator.type = t.energy > 0.6 ? "triangle" : "sine";
      oscillator.frequency.value = base * [1, 1.25, 1.5, 2][i % 4];
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.09, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.24);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.26);
    }
    $("preview").innerHTML = "■ <span>Stop sound</span>";
    soundTimer = setTimeout(() => {
      stopSound();
      if (current?.id === t.id) {
        state.events.push({
          userId: state.user,
          itemId: t.id,
          type: "REPLAY",
          timestamp: Math.floor(Date.now() / 1000),
        });
        save();
        renderTaste();
        renderLab();
        invalidatePlaylist();
        notice(
          "Demo listen recorded as REPLAY. Refreshing the feed uses this feedback.",
        );
      }
    }, 3500);
  } catch {
    stopSound();
    notice(
      "Audio playback is unavailable in this browser. Swiping still works.",
    );
  }
};
$("moods").onclick = (e) => {
  const key = e.target.closest("[data-mood]")?.dataset.mood;
  if (key) {
    state.mood = key;
    save();
    invalidatePlaylist();
    refresh();
  }
};
$("user").onchange = () => {
  state.user = $("user").value;
  save();
  invalidatePlaylist();
  refresh();
};
$("reset").onclick = () => {
  if (
    !confirm(
      "Remove all interactions for this listener? Other listeners and the trained model remain. Retrain to remove their influence from the model.",
    )
  )
    return;
  state.events = state.events.filter((e) => e.userId !== state.user);
  save();
  invalidatePlaylist();
  refresh();
  notice(
    "Listener events removed. Train a new version to update batch associations.",
  );
};
$("train").onclick = () => {
  const m = train(state.items, state.events, model().version + 1);
  m.trainingEvents = state.events.map((e) => ({ ...e }));
  state.models.push(m);
  state.models = state.models.slice(-8);
  save();
  invalidatePlaylist();
  $("evaluation").textContent = "";
  refresh();
  notice(`Solution v${m.version} trained locally from ${m.eventCount} events.`);
};
$("evaluate").onclick = () => {
  const result = evaluate(state.items, state.events);
  $("evaluation").textContent = result.users
    ? `Chronological holdout · ${result.users} eligible listeners · Hit rate @${result.k}: ${(result.hitRate * 100).toFixed(1)}% · Popularity baseline: ${(result.popularityHitRate * 100).toFixed(1)}%. Each listener’s latest positive item is removed from training, including repeated occurrences. Synthetic-data results do not establish real-world recommendation quality.`
    : "Not enough positive history. Evaluation needs at least three distinct positive items per eligible listener.";
};
$("export-data").onclick = () =>
  download("spotiswipe-dataset.json", {
    synthetic: true,
    items: state.items,
    events: state.events,
  });
$("import-data").onchange = async () => {
  const file = $("import-data").files[0];
  if (!file) return;
  try {
    if (file.size > 5 * 1024 * 1024)
      throw Error("File exceeds the 5 MB limit.");
    const data = validateDataset(JSON.parse(await file.text()));
    if (
      !confirm(
        "Replace the current dataset and solution history? Import only synthetic data or data you have permission to train on. Do not import Spotify content.",
      )
    )
      return;
    const m = train(data.items, data.events);
    m.trainingEvents = data.events.map((e) => ({ ...e }));
    state = { ...state, ...data, models: [m] };
    save();
    invalidatePlaylist();
    $("evaluation").textContent = "";
    refresh();
    notice("Dataset validated, imported, and trained.");
  } catch (e) {
    notice(`Import failed: ${e.message}`);
  } finally {
    $("import-data").value = "";
  }
};
$("restore-data").onclick = () => {
  if (
    !confirm(
      "Restore the synthetic catalog and listener histories? This removes your imported data and swipes.",
    )
  )
    return;
  state = fresh();
  state.models[0].trainingEvents = state.events.map((e) => ({ ...e }));
  save();
  invalidatePlaylist();
  $("evaluation").textContent = "";
  refresh();
  notice("Synthetic fixture restored.");
};
document
  .querySelectorAll("[data-view]")
  .forEach((el) => (el.onclick = () => navigate(el.dataset.view)));
window.addEventListener("hashchange", () => navigate(location.hash.slice(1)));
window.addEventListener("keydown", (e) => {
  if (
    view !== "discover" ||
    /INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|A/.test(
      document.activeElement.tagName,
    ) ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey
  )
    return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    record("LIKE");
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    record("SKIP");
  } else if (e.code === "Space") {
    e.preventDefault();
    $("preview").click();
  }
});
let drag = null;
$("track-card").addEventListener("pointerdown", (e) => {
  if (e.isPrimary) drag = { x: e.clientX, y: e.clientY };
});
$("track-card").addEventListener("pointerup", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  drag = null;
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5)
    record(dx > 0 ? "LIKE" : "SKIP");
});
$("track-card").addEventListener("pointercancel", () => (drag = null));
refresh();
navigate(location.hash.slice(1) || "discover");
if (recoveryMessage) notice(recoveryMessage);
