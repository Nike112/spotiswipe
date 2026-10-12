import {
  BUCKET,
  queryTable,
  archivePlaylist,
  getObject,
  deleteObject,
  restoreObject,
} from "./cloud.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let table = "Interactions",
  prefix = "",
  selected = "",
  showVersions = false,
  result = null;
export function mountCloudLab(root, state, { save, notice, download }) {
  if (result && result.request.ExpressionAttributeValues[":pk"] !== `USER#${state.user}`) result = null;
  const objects = state.cloud.objects;
  const keys = [...new Set(objects.map((o) => o.key))];
  if (!keys.includes(selected)) selected = keys[0] || "";
  const versions = objects.filter((o) => o.key === selected),
    latest = versions[0];
  const rows = queryTable(state, table, state.user, prefix, false);
  root.innerHTML = `<nav class="cloud-map" aria-label="Service workflow"><a href="#discover"><small>01 · CAPTURE</small><strong>Swipe & listen</strong><span>Your real feedback</span></a><a href="#dynamo-resource"><small>02 · STORE</small><strong>DynamoDB</strong><span>${state.events.length} interactions · ${state.playlists.length} mixes</span></a><a href="#personalize-workflow"><small>03 · RECOMMEND</small><strong>Personalize</strong><span>Campaign ${state.campaign ? `v${state.campaign.version}` : "not deployed"}</span></a><a href="#s3-resource"><small>04 · PROTECT</small><strong>S3</strong><span>${keys.length} objects · ${objects.length} versions</span></a></nav>
  <p class="small cloud-boundary">SIMULATION MODE · Browser IndexedDB persists these local adapters. No AWS network calls. Seed histories are labelled synthetic; operations below come from actions you perform.</p>
  <details class="lab-panel" id="dynamo-resource" open><summary>Amazon DynamoDB · listener data</summary><p>Keep each listener’s history and saved mixes together using a partition key. A sort key separates individual records. Swiping writes an interaction; Undo deletes it; saving a mix writes a playlist.</p><div class="lab-controls"><label>Table<select id="cloud-table"><option ${table === "Interactions" ? "selected" : ""}>Interactions</option><option ${table === "Playlists" ? "selected" : ""}>Playlists</option></select></label><label>Partition key<input value="${esc(`USER#${state.user}`)}" readonly aria-label="Current listener partition key"></label><label>Sort key begins with<input id="cloud-prefix" placeholder="EVENT# or PLAYLIST#" value="${esc(prefix)}" maxlength="120"></label><button id="cloud-query" class="primary">Run Query</button></div><p class="small">${rows.Count} records for this listener. Showing the first 12, newest sort key first. Change listener using the profile menu. This models key-based reads and writes; throughput, replication, IAM and consistency are outside this simulation.</p><div class="table-wrap"><table><thead><tr><th>Partition key</th><th>Sort key</th><th>Record</th><th>Origin</th></tr></thead><tbody>${
    rows.Items.slice(0, 12)
      .map(
        (r) =>
          `<tr><td>${esc(r.PK)}</td><td class="cloud-key">${esc(r.SK)}</td><td>${esc(r.type ? `${r.type} · ${state.items.find((t) => t.id === r.itemId)?.title || r.itemId}` : r.name)}</td><td>${esc(r.source || "Saved mix")}</td></tr>`,
      )
      .join("") ||
    '<tr><td colspan="4">No records yet. Keep a track or save a mix to create one.</td></tr>'
  }</tbody></table></div>${result ? `<details open><summary>Last Query request / response</summary><pre>${esc(JSON.stringify(result, null, 2))}</pre></details>` : ""}</details>
  <details class="lab-panel" id="s3-resource" open><summary>Amazon S3 · versioned playlist backups</summary><p>Every saved mix creates a JSON object automatically. Back up the same mix again to create another version. Deleting an object adds a delete marker; recovering an older version copies it into a new current version.</p><p class="small">Bucket: <strong>${BUCKET}</strong> · Versioning enabled locally · ${objects.reduce((s, o) => s + (o.size || 0), 0).toLocaleString()} stored bytes · 200-version limit</p><div class="lab-controls"><label>Saved mix<select id="cloud-playlist">${state.playlists.map((p) => `<option value="${esc(p.id)}">${esc(p.name)} · ${esc(p.userId)}</option>`).join("") || '<option value="">Save a mix in Mix studio first</option>'}</select></label><button id="cloud-backup" class="secondary" ${state.playlists.length ? "" : "disabled"}>Create another backup version</button><button id="cloud-export" class="text-button" ${objects.length ? "" : "disabled"}>Export all backups</button></div><label>Object key<select id="cloud-object">${keys.map((key) => `<option ${selected === key ? "selected" : ""} value="${esc(key)}">${esc(key)}</option>`).join("") || '<option value="">No backups yet</option>'}</select></label>${latest ? `<div class="cloud-object-status"><span class="status-pill">${latest.deleteMarker ? "DELETED · RECOVERABLE" : "AVAILABLE"}</span><button id="cloud-get" class="secondary">Get latest object</button><button id="cloud-delete" class="text-button" ${latest.deleteMarker ? "disabled" : ""}>Delete object</button></div><label class="checkbox"><input id="cloud-versions" type="checkbox" ${showVersions ? "checked" : ""}> Show version history</label>${showVersions ? `<div class="table-wrap"><table><thead><tr><th>Version ID</th><th>State / time</th><th>Size</th><th>Actions</th></tr></thead><tbody>${versions.map((o, i) => `<tr><td class="cloud-key">${esc(o.versionId)}</td><td>${o.deleteMarker ? "Delete marker" : i === 0 ? "Current" : "Previous"}<br><small>${new Date(o.at).toLocaleString()}</small></td><td>${o.size || 0} B</td><td>${!o.deleteMarker ? `<button class="secondary" data-object-download="${esc(o.versionId)}">Download</button><button class="secondary" data-object-restore="${esc(o.versionId)}">Recover as latest</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}` : '<p class="empty">Build a mix → Save to library → return here to inspect its backup.</p>'}<p class="small">Backups survive deleting a mix from the library. Dataset replacement resets all local resources. No public bucket, signed URL, durability guarantee, encryption service or AWS storage is created.</p></details>
  <details class="lab-panel"><summary>Service request journal · ${state.cloud.operations.length} retained operations</summary><p class="small">Actual local actions only. Requests use readable JSON, not the full AWS wire protocol. Most recent 40 retained; query response previews show at most 12 items.</p>${
    state.cloud.operations
      .slice(0, 12)
      .map(
        (o) =>
          `<details><summary>${esc(o.service)} · ${esc(o.operation)} · ${new Date(o.at).toLocaleTimeString()}</summary><pre>${esc(JSON.stringify({ request: o.request, response: o.response?.Items ? { ...o.response, Items: o.response.Items.slice(0, 12), previewOnly: o.response.Count > 12 } : o.response }, null, 2))}</pre></details>`,
      )
      .join("") || "<p>Keep a track or save a mix to begin.</p>"
  }</details>`;
  const refresh = () => mountCloudLab(root, state, { save, notice, download });
  root.onchange = (e) => {
    if (e.target.id === "cloud-table") {
      table = e.target.value;
      result = null;
      refresh();
    }
    if (e.target.id === "cloud-object") {
      selected = e.target.value;
      refresh();
    }
    if (e.target.id === "cloud-versions") {
      showVersions = e.target.checked;
      refresh();
    }
  };
  root.onclick = (e) => {
    const link = e.target.closest(".cloud-map a");
    if (link && link.getAttribute("href") !== "#discover") {
      e.preventDefault();
      const target = document.querySelector(link.getAttribute("href"));
      if (target instanceof HTMLDetailsElement) target.open = true;
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.id === "cloud-query") {
        prefix = root.querySelector("#cloud-prefix").value;
        const response = queryTable(state, table, state.user, prefix);
        result = {
          request: state.cloud.operations[0].request,
          response: {
            ...response,
            Items: response.Items.slice(0, 12),
            previewOnly: response.Count > 12,
          },
        };
        notice(`Query returned ${response.Count} records for ${state.user}.`);
      }
      if (b.id === "cloud-backup") {
        const p = state.playlists.find(
          (p) => p.id === root.querySelector("#cloud-playlist").value,
        );
        if (!p) throw Error("Choose a saved mix first.");
        selected = archivePlaylist(state, p).key;
        showVersions = true;
        notice("New object version created. Earlier versions retained.");
      }
      if (b.id === "cloud-export")
        download(
          "spotiswipe-backups.json",
          JSON.stringify({ bucket: BUCKET, objects }, null, 2),
        );
      if (b.id === "cloud-get" || b.dataset.objectDownload) {
        const o = getObject(state, selected, b.dataset.objectDownload);
        download("playlist-backup.json", o.body);
        notice("Retrieved playlist JSON from local S3 simulation.");
      }
      if (b.id === "cloud-delete") {
        deleteObject(state, selected);
        showVersions = true;
        notice(
          "Delete marker created. Earlier versions are still recoverable.",
        );
      }
      if (b.dataset.objectRestore) {
        restoreObject(state, selected, b.dataset.objectRestore);
        notice(
          "Recovered backup as a new current version. Get latest object to verify it.",
        );
      }
      refresh();
      save();
    } catch (error) {
      notice(error.message);
    }
  };
}
