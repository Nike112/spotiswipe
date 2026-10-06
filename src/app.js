import { icon, coverPath } from "./visuals.js";
import { MOODS } from "./data.js";
import {
  WEIGHTS,
  RECIPES,
  validateDataset,
  tasteProfile,
  optimize,
} from "./engine.js";
import {
  createState,
  hydrate,
  activeModel,
  serve,
  putEvent,
  undoSwipe,
  finishTraining,
  deploy,
  importDataset,
  savePlaylist,
  likedItems,
  audit,
} from "./service.js";
import { loadSession, persistSession } from "./storage.js";
import { PreviewPlayer } from "./player.js";
const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const time = (seconds) => {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const percent = (value) =>
  Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : "—";
let state = createState(),
  current = null,
  mix = null,
  view = "discover",
  noticeTimer,
  swiping = false,
  worker = null,
  job = null,
  selectedSaved = null,
  playbackUser = null;
const player = new PreviewPlayer({
  onChange: renderPlayer,
  onError: notice,
  onListen: (track) => {
    if (track && playbackUser === state.user) {
      try {
        putEvent(state, { itemId: track.id, type: "LISTEN" });
        save();
        renderTaste();
        renderLab();
      } catch (error) {
        notice(error.message);
      }
    }
  },
});
function notice(message) {
  $("notice").textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($("notice").textContent = ""), 6000);
}
async function save() {
  try {
    await persistSession(state);
    $("persistence-warning").hidden = true;
  } catch {
    $("persistence-warning").textContent =
      "Your browser could not save this session. Keep this tab open and export your datasets before closing it.";
    $("persistence-warning").hidden = false;
  }
}
const profile = () => state.profiles.find((p) => p.id === state.user);
const item = (id) => state.items.find((t) => t.id === id);
function rank(options = {}) {
  return serve(state, {
    mood: MOODS[state.mood],
    clean: state.clean,
    discovery: state.feedDiscovery,
    ...options,
  });
}
function fetchFeed(forceId) {
  if (!activeModel(state)) {
    current = null;
    return;
  }
  const result = rank();
  current = forceId
    ? result.find((t) => t.id === forceId) || result[0]
    : result[0] || null;
  audit(
    state,
    "GetRecommendations",
    `${state.user} · campaign v${state.campaign.version} · ${result.length} candidates`,
  );
}
function renderProfiles() {
  $("user").innerHTML = state.profiles
    .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
    .join("");
  $("user").value = state.user;
  $("profile-trigger").textContent =
    profile()?.name === "Your listening room"
      ? "Your room"
      : profile()?.name || "Listener";
  $("profile-note").textContent = state.user.startsWith("demo-")
    ? "This demo profile includes synthetic listening history."
    : "Your taste and saved mixes stay on this device.";
}
function renderMoods() {
  $("moods").innerHTML = Object.entries(MOODS)
    .map(
      ([id, m]) =>
        `<button class="mood ${id === state.mood ? "active" : ""}" data-mood="${id}" aria-pressed="${id === state.mood}">${m.label}</button>`,
    )
    .join("");
}
function art(t) {
  return `<div class="art"><img src="${coverPath(t)}" alt="" width="640" height="640" draggable="false"><span class="sleeve-label">SPOTISWIPE SELECTS</span><span class="swipe-stamp keep-stamp" aria-hidden="true">KEEP</span><span class="swipe-stamp pass-stamp" aria-hidden="true">PASS</span></div>`;
}
function renderCollection() {
  const genres = [...new Set(state.items.map((t) => t.genre))];
  $("genre-collection").innerHTML = genres
    .map((g) => {
      const t = state.items.find((t) => t.genre === g);
      return `<button class="genre-tile" data-explore="${esc(g)}"><img src="${coverPath(t)}" alt="" width="120" height="120" loading="lazy"><span><strong>${esc(g)}</strong><small>${state.items.filter((t) => t.genre === g).length} tracks to explore</small></span>${icon("arrow-up")}</button>`;
    })
    .join("");
  $("catalog-note").textContent =
    `${state.items.length} tracks. Endless curiosity.`;
}
function renderCard() {
  ["like", "skip", "preview"].forEach(
    (id) =>
      ($(id).disabled = !current || (id === "preview" && !current.previewUrl)),
  );
  $("undo").disabled = !state.undo || state.undo.userId !== state.user;
  $("feed-position").textContent =
    `${activeModel(state) ? rank().length : 0} discoveries left`;
  if (!current) {
    $("track-card").innerHTML = activeModel(state)
      ? '<div class="empty"><span class="empty-icon">◌</span><h2>You’ve heard this side.</h2><p>You’ve explored every eligible track in this small catalog. Your keeps are waiting in the library.</p><a href="#library" class="secondary">Visit your library ↗</a><button id="restart-feed" class="text-button">Start a new discovery round</button></div>'
      : '<div class="empty"><h2>Your new dataset is ready.</h2><p>Train a solution version and deploy it in Personalize lab to start receiving recommendations.</p><a href="#lab" class="primary">Open Personalize lab ↗</a></div>';
    $("explanation").textContent =
      "No recommendation is currently being served.";
    renderPlayer();
    return;
  }
  const t = current;
  $("track-card").innerHTML =
    `${art(t)}<div class="track-copy"><div class="track-top"><span class="genre-label">${esc(t.genre)}</span><span>${time(t.duration)}</span></div><div class="track-identity"><span class="recommendation-label">${t.novelty > 0.7 ? "A new direction" : "In your orbit"}</span><h2>${esc(t.title)}</h2><p class="artist">${esc(t.artist)}</p></div><p class="track-reason">${esc(t.reason)}.</p><div class="track-tags"><span>${t.energy > 0.65 ? "High energy" : t.energy < 0.3 ? "Low energy" : "Easy pace"}</span><span>${t.explicit ? "Explicit" : "Clean"}</span></div><div class="track-credit"><span>${icon("headphones")}${t.previewUrl ? "30-second preview" : "No preview available"}</span>${t.sourceUrl ? `<a href="${esc(t.sourceUrl)}" target="_blank" rel="noreferrer">Artist & full recording ${icon("arrow-up")}</a>` : ""}</div></div>`;
  $("explanation").innerHTML =
    `<p>${esc(t.reason)}.</p><p>Serving v${t.modelVersion} · ${esc(RECIPES[activeModel(state).recipe])}. Rank score ${t.score.toFixed(3)}.</p><table><thead><tr><th>Signal</th><th>Value</th><th>Weight</th></tr></thead><tbody>${Object.entries(
      t.components,
    )
      .map(
        ([key, value]) =>
          `<tr><td>${{ affinity: "Your genre taste", collaborative: "Similar listeners", popularity: "Popularity", moodFit: "Mood match" }[key]}</td><td>${value.toFixed(2)}</td><td>${Math.round(t.weights[key] * 100)}%</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table><p>Relevance ${t.relevance.toFixed(3)} · novelty ${t.novelty.toFixed(3)}. ${activeModel(state).recipe === "popularity" ? "This baseline uses popularity only." : `Final score blends relevance with ${Math.round(state.feedDiscovery * 100)}% novelty.`} Scores are not probabilities. Mood descriptors are curated.</p>`;
  renderPlayer();
}
function renderTaste() {
  const own = state.events.filter((e) => e.userId === state.user),
    taste = tasteProfile(
      state.items,
      state.events,
      state.user,
      profile()?.preferences || [],
    ),
    max = Math.max(1, ...Object.values(taste.genres).map(Math.abs));
  const genres = [...new Set(state.items.map((t) => t.genre))];
  $("genre-picks").innerHTML = genres
    .map(
      (g) =>
        `<button class="genre-pick ${(profile()?.preferences || []).includes(g) ? "active" : ""}" data-genre="${esc(g)}" aria-pressed="${(profile()?.preferences || []).includes(g)}">${esc(g)}</button>`,
    )
    .join("");
  $("taste-bars").innerHTML = genres
    .map(
      (g) =>
        `<div class="bar-row"><div class="bar-label"><span>${esc(g)}</span><span>${(taste.genres[g] || 0).toFixed(1)}</span></div><div class="bar"><div class="bar-fill" style="transform:scaleX(${Math.abs(taste.genres[g] || 0) / max});background:${(taste.genres[g] || 0) < 0 ? "var(--danger)" : "var(--green)"}"></div></div></div>`,
    )
    .join("");
  $("session-stats").innerHTML =
    `<span><b>${likedItems(state).length}</b> kept</span><span><b>${own.filter((e) => e.type === "SKIP").length}</b> passed</span><span><b>${own.filter((e) => e.type === "LISTEN").length}</b> listens</span>`;
  $("library-count").textContent = likedItems(state).length;
  $("feed-discovery").value = Math.round(state.feedDiscovery * 100);
  $("feed-value").value = `${Math.round(state.feedDiscovery * 100)}%`;
  $("feed-clean").checked = state.clean;
}
function metric(value, label) {
  return `<div class="metric"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`;
}
function renderLab() {
  const deployed = activeModel(state);
  $("lab-stats").innerHTML =
    metric(state.items.length, "Catalog tracks") +
    metric(
      state.events.filter((e) => e.source === "synthetic").length,
      "Synthetic seed events",
    ) +
    metric(
      state.events.filter((e) => e.source !== "synthetic").length,
      "Listener events",
    ) +
    metric(deployed ? `v${deployed.version}` : "—", "Campaign version");
  $("campaign-status").textContent = deployed ? "ACTIVE" : "NOT DEPLOYED";
  $("campaign-detail").textContent = deployed
    ? `spotiswipe-discovery → solution v${deployed.version} · ${RECIPES[deployed.recipe]}`
    : "No active campaign. Train a version below, then choose Deploy.";
  $("versions").innerHTML = state.models.length
    ? `<table><caption>Training creates a version; Deploy changes the serving campaign.</caption><thead><tr><th>Version / recipe</th><th>Training data</th><th>Status</th><th>Actions</th></tr></thead><tbody>${[
        ...state.models,
      ]
        .reverse()
        .map(
          (m) =>
            `<tr><td>v${m.version} · ${esc(RECIPES[m.recipe])}<br><span class="small">${new Date(m.createdAt).toLocaleString()}</span></td><td>${m.eventCount} events<br>${m.userCount} listeners</td><td>${m.version === deployed?.version ? "Serving" : "Ready"}${m.evaluation ? `<br><span class="small">HR@5 ${percent(m.evaluation.hitRate)}</span>` : ""}</td><td><button class="secondary" data-evaluate="${m.version}" ${job ? "disabled" : ""}>Evaluate</button><button class="secondary" data-deploy="${m.version}" ${m.version === deployed?.version || job ? "disabled" : ""}>${m.version < (deployed?.version || 0) ? "Roll back" : "Deploy"}</button></td></tr>`,
        )
        .join("")}</tbody></table>`
    : '<p class="empty">No solution versions yet. Choose a recipe and train your first model.</p>';
  $("dataset-table").innerHTML =
    `<table><thead><tr><th>ITEM_ID</th><th>Title / artist</th><th>GENRE</th><th>Duration</th></tr></thead><tbody>${state.items
      .slice(0, 30)
      .map(
        (t) =>
          `<tr><td>${esc(t.id)}</td><td>${esc(t.title)}<br><span class="small">${esc(t.artist)}</span></td><td>${esc(t.genre)}</td><td>${time(t.duration)}</td></tr>`,
      )
      .join(
        "",
      )}</tbody></table>${state.items.length > 30 ? '<p class="small">Showing the first 30 items. Export the dataset for all records.</p>' : ""}`;
  $("events").innerHTML =
    [...state.events]
      .reverse()
      .slice(0, 8)
      .map(
        (e) =>
          `<div class="log-row">${esc(e.type)} · ${esc(item(e.itemId)?.title || e.itemId)}<small>${esc(e.userId)} · ${esc(e.source)} · ${new Date(e.timestamp * 1000).toLocaleTimeString()}</small></div>`,
      )
      .join("") ||
    '<p class="small">New listens and swipes will appear here.</p>';
  $("operation-log").innerHTML =
    state.audit
      .slice(0, 8)
      .map(
        (a) =>
          `<div class="log-row">${esc(a.operation)}<small>${esc(a.detail)}<br>${new Date(a.at).toLocaleTimeString()}</small></div>`,
      )
      .join("") ||
    '<p class="small">Train, deploy or request recommendations to inspect operations.</p>';
  $("train").disabled = !!job;
  $("recipe").disabled = !!job;
  $("import-data").disabled = !!job;
  $("restore-data").disabled = !!job;
  $("cancel-job").hidden = !job;
  refreshInspector(false);
}
function refreshInspector(log = true) {
  let tracks = [];
  if (activeModel(state)) {
    tracks = rank().slice(0, 5);
    if (log)
      audit(
        state,
        "GetRecommendations",
        `${state.user} · campaign v${state.campaign.version} · top 5`,
      );
  }
  $("request-inspector").textContent = JSON.stringify(
    {
      simulation: true,
      operation: "GetRecommendations",
      request: {
        campaign: state.campaign?.name || null,
        solutionVersion: state.campaign?.version || null,
        userId: state.user,
        numResults: 5,
        context: { mood: state.mood },
        filter: { clean: state.clean, excludeSeen: true },
      },
      response: {
        itemList: tracks.map((t) => ({
          itemId: t.id,
          score: Number(t.score.toFixed(4)),
          reason: t.reason,
        })),
      },
    },
    null,
    2,
  );
  if (log) {
    save();
    renderLab();
  }
}
function rows(tracks, { remove = false, reasons = false } = {}) {
  return `<ol class="track-list">${tracks.map((t, i) => `<li><span class="track-number">${String(i + 1).padStart(2, "0")}</span><button class="row-play" data-play="${esc(t.id)}" aria-label="Play preview of ${esc(t.title)}" ${!t.previewUrl ? "disabled" : ""}><img src="${coverPath(t)}" alt="" width="48" height="48" loading="lazy">${icon("play")}</button><div class="track-info"><strong>${esc(t.title)}</strong><p>${esc(t.artist)} <span class="row-genre">· ${esc(t.genre)}</span></p>${reasons ? `<p class="selection-reason">${esc(t.selectionReason || "")}</p>` : ""}</div><span class="duration">${time(t.duration)}</span>${t.sourceUrl ? `<a class="row-link" href="${esc(t.sourceUrl)}" target="_blank" rel="noreferrer" aria-label="Full recording of ${esc(t.title)}">${icon("arrow-up")}</a>` : ""}${remove ? `<button class="row-remove" data-unlike="${esc(t.id)}" aria-label="Remove ${esc(t.title)} from likes">${icon("heart")}</button>` : ""}</li>`).join("")}</ol>`;
}
function renderLibrary() {
  const saved = state.playlists.filter((p) => p.userId === state.user);
  $("saved-count").textContent = `${saved.length} saved on this device`;
  $("saved-playlists").innerHTML = saved.length
    ? `<div class="saved-grid">${saved
        .map(
          (p) =>
            `<article class="saved-mix"><div class="mix-mosaic" aria-hidden="true">${p.trackIds
              .slice(0, 4)
              .map(
                (id) =>
                  `<img src="${coverPath(item(id))}" alt="" width="120" height="120" loading="lazy">`,
              )
              .join(
                "",
              )}</div><div class="saved-mix-copy"><h3>${esc(p.name)}</h3><p>${p.trackIds.length} tracks · ${time(p.metrics?.seconds || p.trackIds.reduce((s, id) => s + (item(id)?.duration || 0), 0))} · model v${p.version}</p><div class="mix-actions"><button class="primary" data-play-mix="${esc(p.id)}">${icon("play")} Play previews</button><button class="secondary" data-open-mix="${esc(p.id)}">Open mix</button></div><button class="row-remove" data-delete-mix="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">${icon("close")}</button></div></article>`,
        )
        .join("")}</div>`
    : '<div class="library-empty"><span class="empty-record" aria-hidden="true"></span><div><h2>Your first mix belongs here.</h2><p>Collect a few discoveries, then make something worth coming back to.</p><a href="#playlist" class="secondary">Create your first mix ↗</a></div></div>';
  const query = $("library-search").value.trim().toLowerCase();
  const liked = likedItems(state).filter((t) =>
    `${t.title} ${t.artist}`.toLowerCase().includes(query),
  );
  $("liked-tracks").innerHTML = liked.length
    ? rows(liked, { remove: true })
    : `<p class="empty">${query ? "No liked tracks match that search." : "Keep a track in Discover and you’ll find it here."}</p>`;
  $("history").innerHTML =
    [...state.events]
      .reverse()
      .filter((e) => e.userId === state.user)
      .slice(0, 20)
      .map(
        (e) =>
          `<div class="log-row">${esc(e.type)} · ${esc(item(e.itemId)?.title || e.itemId)}<small>${new Date(e.timestamp * 1000).toLocaleString()} · ${esc(e.source)}</small></div>`,
      )
      .join("") ||
    '<p class="small">Your listening history starts with the first preview or swipe.</p>';
  renderSavedDetail();
}
function renderSavedDetail() {
  const p = state.playlists.find(
    (p) => p.id === selectedSaved && p.userId === state.user,
  );
  if (!p) {
    $("saved-detail").innerHTML = "";
    return;
  }
  $("saved-detail").innerHTML =
    `<div class="panel-heading"><h2>${esc(p.name)}</h2><button class="text-button" id="close-saved">Close</button></div><div class="mix-actions"><button class="primary" data-play-mix="${esc(p.id)}">${icon("play")} Play previews</button><button class="secondary" data-export-mix="${esc(p.id)}">Export JSON</button><button class="secondary" data-m3u-mix="${esc(p.id)}">Export preview M3U</button></div>${rows(p.trackIds.map(item).filter(Boolean))}`;
}
function invalidateMix(
  message = "Your taste has changed. Build a fresh mix with your latest picks.",
) {
  mix = null;
  $("playlist-result").innerHTML =
    `<div class="mix-empty"><div class="sleeve-stack" aria-hidden="true"><span></span><span></span><span><b>YOUR<br>NEXT<br>MIX.</b><i>VOL. 01 / SPOTISWIPE</i></span></div><h2>Your next mix is waiting.</h2><p>${esc(message)}</p></div>`;
}
function renderMix() {
  if (!mix) return;
  const p = mix;
  const compareRows = [
    [
      "Full-track duration",
      time(p.metrics.seconds),
      time(p.constrainedMetrics.seconds),
      time(p.baselineMetrics.seconds),
    ],
    [
      "Tracks",
      p.metrics.count,
      p.constrainedMetrics.count,
      p.baselineMetrics.count,
    ],
    [
      "Artists",
      p.metrics.artists,
      p.constrainedMetrics.artists,
      p.baselineMetrics.artists,
    ],
    [
      "Genres",
      p.metrics.genres,
      p.constrainedMetrics.genres,
      p.baselineMetrics.genres,
    ],
    [
      "Mean relevance",
      p.metrics.meanRelevance.toFixed(3),
      p.constrainedMetrics.meanRelevance.toFixed(3),
      p.baselineMetrics.meanRelevance.toFixed(3),
    ],
  ];
  $("playlist-result").innerHTML =
    `<div class="metrics">${metric(p.metrics.count, "Tracks")}${metric(time(p.metrics.seconds), "Full-track duration")}${metric(p.metrics.genres, "Genres")}${metric(p.metrics.artists, "Artists")}</div>${p.tracks.length ? `<div class="panel-heading"><h2>${state.mood === "balanced" ? "Your discovery mix" : `Your ${esc(MOODS[state.mood].label.toLowerCase())} mix`}</h2><button id="play-built-mix" class="primary">${icon("play")} Play previews</button></div><p class="small">${time(p.remainingSeconds)} left in your budget. Budgets use full recordings; playback uses 30-second excerpts.</p><div class="save-mix"><label for="mix-name">Give it a name<input id="mix-name" maxlength="80" value="${esc(MOODS[state.mood].label === "Anything" ? "A little more discovery" : MOODS[state.mood].label + " mix")}"></label><button id="save-mix" class="primary">Save to library</button><button id="export-built-mix" class="secondary">Export JSON</button></div>${rows(p.tracks, { reasons: true })}` : '<div class="empty"><h2>No tracks fit these constraints.</h2><p>Try a longer duration, a higher artist limit, or fewer content filters.</p></div>'}<details class="comparison-details"><summary>How this improves on plain ranking</summary><div class="table-wrap"><table><caption>Same eligible tracks and duration budget. The constrained baseline also uses your artist limit.</caption><thead><tr><th>Measure</th><th>Discovery mix</th><th>Same constraints,<br>relevance only</th><th>Plain ranking</th></tr></thead><tbody>${compareRows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="small">Variety can trade off with relevance. Results are computed, not guaranteed improvements. Greedy selection respects the limits but does not promise the global optimum.</p></details>`;
}
function renderCredits() {
  $("credits").innerHTML = state.items
    .map(
      (t) =>
        `<div class="credit-row"><strong>${esc(t.title)}</strong> — ${esc(t.artist)}<br>${esc(t.license)} · ${t.sourceUrl ? `<a href="${esc(t.sourceUrl)}" target="_blank" rel="noreferrer">Original recording</a>` : "User-provided track"}${t.licenseUrl ? ` · <a href="${esc(t.licenseUrl)}" target="_blank" rel="noreferrer">License</a>` : ""}</div>`,
    )
    .join("");
}
function renderAll({ newCard = false, forceId } = {}) {
  renderProfiles();
  renderMoods();
  if (newCard) fetchFeed(forceId);
  renderCard();
  renderTaste();
  renderLab();
  renderLibrary();
  renderCredits();
  renderCollection();
}
function renderPlayer() {
  const playing = player?.track;
  document.querySelectorAll("[data-play]").forEach((button) => {
    const active = playing?.id === button.dataset.play && !player.audio.paused;
    if (button.dataset.playing === String(active)) return;
    button.dataset.playing = String(active);
    const title = item(button.dataset.play)?.title || "track";
    button.setAttribute(
      "aria-label",
      `${active ? "Pause" : "Play"} preview of ${title}`,
    );
    const glyph = button.querySelector(".icon");
    if (glyph) glyph.outerHTML = icon(active ? "pause" : "play");
  });
  $("player").hidden = false;
  $("player").classList.toggle("is-idle", !playing);
  document.body.classList.toggle(
    "is-playing",
    !!playing && !player.audio.paused,
  );
  for (const id of ["player-toggle", "player-close", "seek"])
    $(id).disabled = !playing;
  if (!playing) {
    $("player-title").textContent = "The next good thing is a play away.";
    $("player-artist").textContent =
      "Pick a track. Press play. Follow your ears.";
    $("player-cover").innerHTML = icon("headphones");
    $("player-cover").removeAttribute("data-track");
    $("player-toggle").innerHTML = icon("play");
    $("player-toggle").setAttribute("aria-label", "Play preview");
    $("player-time").textContent = "0:00 / 0:30";
    $("seek").value = 0;
    $("seek").style.setProperty("--progress", "0%");
    $("player-prev").disabled = true;
    $("player-next").disabled = true;
    $("preview").innerHTML = icon("play") + "<span>Listen</span>";
    $("preview").setAttribute("aria-label", "Play recommended preview");
    return;
  }
  $("player-title").textContent = playing.title;
  $("player-artist").textContent = playing.artist;
  if ($("player-cover").dataset.track !== playing.id) {
    $("player-cover").innerHTML =
      `<img src="${coverPath(playing)}" alt="" width="48" height="48">`;
    $("player-cover").dataset.track = playing.id;
  }
  $("player-toggle").innerHTML = icon(player.audio.paused ? "play" : "pause");
  $("player-toggle").setAttribute(
    "aria-label",
    player.audio.paused ? "Play preview" : "Pause preview",
  );
  const duration = Number.isFinite(player.audio.duration)
    ? player.audio.duration
    : 30;
  $("player-time").textContent =
    `${time(player.audio.currentTime)} / ${time(duration)}`;
  $("seek").max = duration;
  $("seek").value = player.audio.currentTime || 0;
  $("seek").style.setProperty(
    "--progress",
    `${((player.audio.currentTime || 0) / duration) * 100}%`,
  );
  $("player-prev").disabled =
    player.index === 0 && player.audio.currentTime < 3;
  $("player-next").disabled = player.index >= player.queue.length - 1;
  const isCurrent = playing.id === current?.id && !player.audio.paused;
  $("preview").innerHTML =
    icon(isCurrent ? "pause" : "play") +
    `<span>${isCurrent ? "Pause" : "Listen"}</span>`;
  $("preview").setAttribute(
    "aria-label",
    isCurrent ? "Pause recommended preview" : "Play recommended preview",
  );
}
function playTrack(track) {
  playbackUser = state.user;
  player.queue = [track];
  player.index = 0;
  player.play(track);
}
function playTracks(tracks) {
  playbackUser = state.user;
  player.playQueue(tracks);
}
async function swipe(type) {
  if (!current || swiping) return;
  swiping = true;
  const id = current.id;
  try {
    putEvent(state, { itemId: id, type });
    if (player.track?.id === id) player.stop();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    $("track-card").classList.add(
      type === "LIKE" ? "leaving-right" : "leaving-left",
    );
    if (!reduced) await new Promise((resolve) => setTimeout(resolve, 155));
    invalidateMix();
    renderAll({ newCard: true });
    $("track-card").classList.remove("leaving-right", "leaving-left");
    $("track-card").classList.add("entering");
    setTimeout(() => $("track-card").classList.remove("entering"), 220);
    save();
    notice(
      type === "LIKE"
        ? "Kept in your library."
        : "Passed. We’ll adjust your next picks.",
    );
  } catch (error) {
    notice(error.message);
  } finally {
    swiping = false;
  }
}
function navigate(next) {
  if (!["discover", "playlist", "library", "lab", "guide"].includes(next))
    next = "discover";
  view = next;
  $("page-label").textContent = {
    discover: "Discover",
    playlist: "Mix studio",
    library: "Your library",
    lab: "Personalize lab",
    guide: "Project guide",
  }[next];
  document.title = `${$("page-label").textContent} — Spotiswipe`;
  $("listener-menu").open = false;
  document
    .querySelectorAll(".view")
    .forEach((el) => (el.hidden = el.id !== next));
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === next);
    if (el.dataset.view === next) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  if (next === "library") renderLibrary();
  if (next === "lab") renderLab();
}
function download(filename, text, type = "application/json") {
  const url = URL.createObjectURL(
    new Blob(
      [typeof text === "string" ? text : JSON.stringify(text, null, 2)],
      { type },
    ),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportMix(p) {
  download("spotiswipe-mix.json", {
    name: p.name || $("mix-name")?.value || "Discovery mix",
    createdAt: p.createdAt || Date.now(),
    listener: state.user,
    modelVersion: p.version || state.campaign?.version,
    settings: p.settings,
    metrics: p.metrics,
    tracks: p.tracks || p.trackIds.map(item).filter(Boolean),
  });
}
function exportM3U(p) {
  const tracks = p.trackIds.map(item).filter((t) => t?.previewUrl);
  const clean = (s) => String(s).replace(/[\r\n]/g, " ");
  const text =
    "#EXTM3U\n#PLAYLIST:" +
    clean(p.name) +
    " (previews)\n" +
    tracks
      .map(
        (t) =>
          `#EXTINF:${t.previewSeconds || 30},${clean(t.artist)} - ${clean(t.title)} (preview)\n${new URL(t.previewUrl, location.href).href}`,
      )
      .join("\n");
  download("spotiswipe-previews.m3u", text, "audio/x-mpegurl");
  notice(
    "Exported preview URLs. They remain accessible while this hosting address is available.",
  );
}
function runJob(type, { version, recipe, events = state.events } = {}) {
  if (job) {
    notice("Wait for the current job or cancel it.");
    return;
  }
  const captured = structuredClone(events),
    revision = state.revision;
  job = { type, version, recipe, start: performance.now() };
  $("job-status").textContent =
    type === "train"
      ? `Training v${version} on ${captured.length} events…`
      : `Evaluating v${version} with held-out interactions…`;
  renderLab();
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), {
      type: "module",
    });
    worker.onmessage = ({ data }) => {
      if (!job) return;
      const elapsed = performance.now() - job.start;
      worker.terminate();
      worker = null;
      job = null;
      try {
        if (!data.ok) throw Error(data.error);
        if (type === "train") {
          finishTraining(state, data.result, captured, revision);
          $("job-status").textContent =
            `v${version} is ready · ${elapsed.toFixed(0)} ms locally. Evaluate it, then deploy when ready.`;
          notice(`v${version} trained. The serving campaign has not changed.`);
        } else {
          const model = state.models.find((m) => m.version === version);
          if (!model || state.revision !== revision)
            throw Error("The dataset changed during evaluation.");
          model.evaluation = data.result;
          audit(
            state,
            "GetSolutionMetrics",
            `v${version} · ${data.result.users} held-out users`,
          );
          renderEvaluation(data.result, version);
          $("job-status").textContent =
            `Evaluation complete in ${elapsed.toFixed(0)} ms locally.`;
        }
        save();
        renderLab();
      } catch (error) {
        $("job-status").textContent = error.message;
        notice(error.message);
        renderLab();
      }
    };
    worker.onerror = () => {
      worker?.terminate();
      worker = null;
      job = null;
      $("job-status").textContent =
        "The background job failed. Your existing campaign is still available.";
      renderLab();
    };
    worker.postMessage({
      type,
      items: state.items,
      events: captured,
      version,
      recipe,
      k: 5,
    });
  } catch (error) {
    job = null;
    worker = null;
    $("job-status").textContent = `Could not start worker: ${error.message}`;
    renderLab();
  }
}
function renderEvaluation(result, version) {
  $("evaluation").innerHTML = result.users
    ? `<h2>Solution v${version} · held-out evaluation</h2><div class="metrics">${metric(result.users, "Eligible listeners")}${metric(percent(result.hitRate), "Hit rate @5")}${metric(result.ndcg.toFixed(3), "NDCG @5")}</div><p>Popularity baseline: ${percent(result.popularityHitRate)} hit rate · ${result.popularityNdcg.toFixed(3)} NDCG.</p><p class="small">Each listener’s final positive item and its earlier repetitions are removed from that listener’s training history. Events at or after that holdout time are excluded for that listener. This is per-user holdout, not a single global time split. The catalog is small and seed histories are synthetic; these metrics do not establish real-world effectiveness.</p>`
    : '<h2>More listening history is needed.</h2><p class="small">Each evaluated listener needs at least three distinct positive items. Add interactions, train again, and evaluate the new version.</p>';
}
$("like").onclick = () => swipe("LIKE");
$("skip").onclick = () => swipe("SKIP");
$("preview").onclick = () => {
  if (current) playTrack(current);
};
$("undo").onclick = () => {
  const id = undoSwipe(state);
  if (id) {
    player.stop();
    invalidateMix();
    renderAll({ newCard: true, forceId: id });
    save();
    notice(
      "Last swipe undone. Trained versions keep their original snapshots.",
    );
  }
};
$("moods").onclick = (e) => {
  const id = e.target.closest("[data-mood]")?.dataset.mood;
  if (id) {
    state.mood = id;
    invalidateMix();
    renderAll({ newCard: true });
    save();
  }
};
$("genre-picks").onclick = (e) => {
  const genre = e.target.closest("[data-genre]")?.dataset.genre;
  if (!genre) return;
  const p = profile();
  p.preferences = p.preferences.includes(genre)
    ? p.preferences.filter((g) => g !== genre)
    : [...p.preferences, genre];
  invalidateMix();
  renderAll({ newCard: true });
  save();
};
$("feed-discovery").oninput = () => {
  $("feed-value").value = `${$("feed-discovery").value}%`;
};
$("feed-discovery").onchange = () => {
  state.feedDiscovery = Number($("feed-discovery").value) / 100;
  renderAll({ newCard: true });
  save();
};
$("feed-clean").onchange = () => {
  state.clean = $("feed-clean").checked;
  renderAll({ newCard: true });
  save();
};
$("user").onchange = () => {
  player.stop();
  state.user = $("user").value;
  selectedSaved = null;
  invalidateMix();
  renderAll({ newCard: true });
  save();
};
$("profile-form").onsubmit = (e) => {
  e.preventDefault();
  if (state.profiles.length >= 20) {
    notice("The local session supports 20 profiles.");
    return;
  }
  const name = $("profile-name").value.trim();
  if (!name) {
    notice("Enter a listener name.");
    return;
  }
  const id = `listener-${crypto.randomUUID()}`;
  state.profiles.push({ id, name, preferences: [] });
  state.user = id;
  player.stop();
  $("profile-name").value = "";
  $("profile-form").closest("details").open = false;
  invalidateMix();
  renderAll({ newCard: true });
  save();
  $("listener-menu").open = false;
  $("listener-menu").querySelector("summary").focus();
  notice("Your new listening room is ready.");
};
$("reset-listener").onclick = () => {
  if (
    !confirm(
      "Reset this listener’s events and genre preferences? Saved mixes stay in the library. Trained models retain their snapshots until you train a new version.",
    )
  )
    return;
  state.events = state.events.filter((e) => e.userId !== state.user);
  profile().preferences = [];
  state.undo = null;
  player.stop();
  invalidateMix();
  renderAll({ newCard: true });
  save();
};
$("playlist-form").onsubmit = (e) => {
  e.preventDefault();
  try {
    const settings = {
      minutes: Number($("minutes").value),
      maxPerArtist: Number($("artist-limit").value),
      discovery: Number($("discovery").value) / 100,
      clean: $("clean").checked,
      mood: state.mood,
    };
    mix = {
      ...optimize(
        rank({ excludeSeen: false, clean: settings.clean, discovery: 0 }),
        settings,
      ),
      settings,
    };
    renderMix();
  } catch (error) {
    notice(error.message);
  }
};
$("discovery").oninput = () => {
  $("discovery-value").value = `${$("discovery").value}%`;
};
for (const id of ["minutes", "artist-limit", "discovery", "clean"])
  $(id).onchange = () => {
    if (mix) invalidateMix("Settings changed. Build a new mix to apply them.");
  };
$("library-search").oninput = renderLibrary;
$("train").onclick = () =>
  runJob("train", {
    version: Math.max(0, ...state.models.map((m) => m.version)) + 1,
    recipe: $("recipe").value,
  });
$("cancel-job").onclick = () => {
  worker?.terminate();
  worker = null;
  job = null;
  $("job-status").textContent =
    "Job cancelled. Existing models and the campaign are unchanged.";
  renderLab();
};
$("refresh-inspector").onclick = () => refreshInspector();
$("export-data").onclick = () =>
  download("spotiswipe-dataset.json", {
    schema: "spotiswipe-dataset-v3",
    provenance:
      "Real CC0 recordings; synthetic seed histories and local listener events. Curated features.",
    items: state.items,
    events: state.events,
  });
$("export-csv").onclick = () => {
  const quote = (s) => '"' + String(s).replace(/"/g, '""') + '"';
  const positive = state.events.filter((e) => WEIGHTS[e.type] > 0);
  download(
    "item-interactions.csv",
    "USER_ID,ITEM_ID,TIMESTAMP,EVENT_TYPE\n" +
      positive
        .map((e) =>
          [e.userId, e.itemId, e.timestamp, e.type].map(quote).join(","),
        )
        .join("\n"),
    "text/csv",
  );
  notice(
    "Exported positive events in AWS column format. SKIP is an application-level negative signal and is excluded.",
  );
};
$("import-data").onchange = async () => {
  const file = $("import-data").files[0];
  if (!file) return;
  try {
    if (job) throw Error("Finish or cancel the current job first.");
    if (file.size > 5 * 1024 * 1024) throw Error("The file exceeds 5 MB.");
    const input = JSON.parse(await file.text());
    validateDataset(input);
    if (
      !confirm(
        "Replace the local catalog, events, saved playlists and trained versions? Export your data first if needed. Import only data you have permission to use.",
      )
    )
      return;
    player.stop();
    state = importDataset(state, input);
    selectedSaved = null;
    invalidateMix(
      "Train and deploy your imported dataset before building a mix.",
    );
    $("evaluation").innerHTML = "";
    renderAll({ newCard: true });
    await save();
    notice(
      "Dataset validated and imported. Train a solution version, then deploy it.",
    );
  } catch (error) {
    notice(`Import failed: ${error.message}`);
  } finally {
    $("import-data").value = "";
  }
};
$("restore-data").onclick = () => {
  if (job) return;
  if (
    !confirm(
      "Restore the starter catalog and demo histories? This replaces local profiles, swipes, saved mixes and models.",
    )
  )
    return;
  player.stop();
  state = createState();
  selectedSaved = null;
  invalidateMix("The starter catalog is ready.");
  $("evaluation").innerHTML = "";
  renderAll({ newCard: true });
  save();
  notice("Starter dataset restored.");
};
$("player-toggle").onclick = () => {
  if (player.track) player.play(player.track);
};
$("player-prev").onclick = () => player.previous();
$("player-next").onclick = () => player.next();
$("player-close").onclick = () => player.stop();
$("seek").oninput = () => player.seek(Number($("seek").value));
document.addEventListener("click", (e) => {
  const target = e.target.closest("button");
  if (!target) return;
  try {
    if (target.dataset.explore) {
      const genre = target.dataset.explore,
        p = profile();
      if (!p.preferences.includes(genre)) p.preferences.push(genre);
      invalidateMix();
      const next = rank().find((t) => t.genre === genre);
      renderAll({ newCard: true, forceId: next?.id });
      save();
      $("track-card").scrollIntoView({
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
        block: "center",
      });
      notice(
        next
          ? `${genre} added to your taste. Here’s a new find.`
          : `${genre} added to your taste. You’ve explored its eligible tracks.`,
      );
    }

    if (target.dataset.play) {
      const t = item(target.dataset.play);
      if (t) playTrack(t);
    }
    if (target.dataset.unlike) {
      state.events = state.events.filter(
        (ev) =>
          !(
            ev.userId === state.user &&
            ev.itemId === target.dataset.unlike &&
            (ev.type === "LIKE" || ev.type === "REPLAY")
          ),
      );
      state.undo = null;
      invalidateMix();
      renderAll({ newCard: true });
      save();
      notice("Removed from your liked tracks.");
    }
    if (target.dataset.openMix) {
      selectedSaved = target.dataset.openMix;
      renderSavedDetail();
      $("saved-detail").scrollIntoView({
        behavior: "instant",
        block: "nearest",
      });
    }
    if (target.dataset.playMix) {
      const p = state.playlists.find((p) => p.id === target.dataset.playMix);
      if (p) playTracks(p.trackIds.map(item).filter(Boolean));
    }
    if (target.dataset.exportMix) {
      const p = state.playlists.find((p) => p.id === target.dataset.exportMix);
      if (p) exportMix(p);
    }
    if (target.dataset.m3uMix) {
      const p = state.playlists.find((p) => p.id === target.dataset.m3uMix);
      if (p) exportM3U(p);
    }
    if (target.dataset.deleteMix) {
      const p = state.playlists.find((p) => p.id === target.dataset.deleteMix);
      if (
        p &&
        confirm(
          `Delete the saved mix “${p.name}”? Your liked tracks stay in the library.`,
        )
      ) {
        state.playlists = state.playlists.filter((x) => x.id !== p.id);
        renderLibrary();
        save();
      }
    }
    if (target.dataset.deploy && !job) {
      deploy(state, Number(target.dataset.deploy));
      invalidateMix();
      renderAll({ newCard: true });
      save();
      notice(`Campaign now serves v${state.campaign.version}.`);
    }
    if (target.dataset.evaluate && !job) {
      const m = state.models.find(
        (m) => m.version === Number(target.dataset.evaluate),
      );
      if (m)
        runJob("evaluate", {
          version: m.version,
          recipe: m.recipe,
          events: m.trainingEvents,
        });
    }
    if (target.id === "play-built-mix" && mix) playTracks(mix.tracks);
    if (target.id === "save-mix" && mix) {
      const p = savePlaylist(state, { ...mix, name: $("mix-name").value });
      selectedSaved = p.id;
      save();
      renderLibrary();
      notice(`“${p.name}” saved to your library.`);
    }
    if (target.id === "export-built-mix" && mix) exportMix(mix);
    if (target.id === "close-saved") {
      selectedSaved = null;
      renderSavedDetail();
    }
    if (target.id === "restart-feed") {
      // Clear decisions only; keep positive listening signals and saved mixes.
      if (
        !confirm(
          "Start another discovery round? This clears this listener’s keep/pass decisions; saved mixes and listen events remain.",
        )
      )
        return;
      state.events = state.events.filter(
        (ev) => ev.userId !== state.user || !["LIKE", "SKIP"].includes(ev.type),
      );
      state.undo = null;
      renderAll({ newCard: true });
      save();
    }
  } catch (error) {
    notice(error.message);
  }
});
document.querySelector(".skip-link").onclick = (e) => {
  e.preventDefault();
  $("main").focus();
  $("main").scrollIntoView({ block: "start" });
};
window.addEventListener("hashchange", () => {
  navigate(location.hash.slice(1));
  window.scrollTo({ top: 0, behavior: "instant" });
  $("main").focus({ preventScroll: true });
});
window.addEventListener("keydown", (e) => {
  if (
    view !== "discover" ||
    /INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|A/.test(
      document.activeElement.tagName,
    ) ||
    e.ctrlKey ||
    e.metaKey ||
    e.altKey ||
    e.repeat
  )
    return;
  if (e.key === "ArrowRight") {
    e.preventDefault();
    swipe("LIKE");
  } else if (e.key === "ArrowLeft") {
    e.preventDefault();
    swipe("SKIP");
  } else if (e.code === "Space") {
    e.preventDefault();
    if (current) playTrack(current);
  }
});
let drag = null;
function clearDrag() {
  drag = null;
  $("track-card").classList.remove("dragging");
  for (const prop of [
    "--drag-x",
    "--drag-angle",
    "--keep-opacity",
    "--pass-opacity",
  ])
    $("track-card").style.removeProperty(prop);
}
$("track-card").addEventListener("pointerdown", (e) => {
  if (e.isPrimary && !e.target.closest("a,button") && current) {
    drag = { x: e.clientX, y: e.clientY };
    $("track-card").setPointerCapture(e.pointerId);
  }
});
$("track-card").addEventListener("pointermove", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 20) {
    clearDrag();
    return;
  }
  if (Math.abs(dx) < 8) return;
  $("track-card").classList.add("dragging");
  $("track-card").style.setProperty(
    "--drag-x",
    `${Math.max(-110, Math.min(110, dx))}px`,
  );
  $("track-card").style.setProperty("--drag-angle", `${dx / 30}deg`);
  $("track-card").style.setProperty(
    "--keep-opacity",
    Math.min(1, Math.max(0, dx / 90)),
  );
  $("track-card").style.setProperty(
    "--pass-opacity",
    Math.min(1, Math.max(0, -dx / 90)),
  );
});
$("track-card").addEventListener("pointerup", (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x,
    dy = e.clientY - drag.y;
  clearDrag();
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5)
    swipe(dx > 0 ? "LIKE" : "SKIP");
});
$("track-card").addEventListener("pointercancel", clearDrag);
for (const volumeId of ["volume", "mobile-volume"])
  $(volumeId).oninput = () => {
    const value = Number($(volumeId).value);
    player.audio.volume = value / 100;
    $("volume").value = value;
    $("mobile-volume").value = value;
  };
document.addEventListener("click", (e) => {
  if (!$("listener-menu").contains(e.target)) $("listener-menu").open = false;
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && $("listener-menu").open) {
    $("listener-menu").open = false;
    $("listener-menu").querySelector("summary").focus();
  }
});
function connection() {
  $("connection").textContent = navigator.onLine
    ? "On your device"
    : "Offline listening";
}
window.addEventListener("online", connection);
window.addEventListener("offline", connection);
async function boot() {
  try {
    const saved = await loadSession();
    if (saved) state = hydrate(saved);
  } catch (error) {
    $("persistence-warning").textContent =
      `Could not restore saved data: ${error.message}. The starter catalog is available; export your current work before closing if storage is unavailable.`;
    $("persistence-warning").hidden = false;
  }
  $("boot").hidden = true;
  renderAll({ newCard: true });
  navigate(location.hash.slice(1) || "discover");
  connection();
  if ("serviceWorker" in navigator)
    navigator.serviceWorker.register("./sw.js").catch(() => {});
}
boot();
