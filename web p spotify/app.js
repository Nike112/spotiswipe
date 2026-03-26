// --- CONFIG ------------------------------------------------------------------
// 1. Create a Spotify app at: https://developer.spotify.com/dashboard
// 2. Set the Redirect URI to the file you will open in the browser, e.g.
//    http://localhost:5500/index.html  (if using a simple static server)
// 3. Put your Client ID below.

const SPOTIFY_CLIENT_ID = "637e879a3cd74a6fa01c2df90a8311e9";

// PKCE helper functions for Authorization Code flow
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

async function generateCodeChallenge(codeVerifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Construct redirect URI properly - encode spaces and ensure it's a valid HTTP(S) URL
function getRedirectUri() {
  const origin = window.location.origin;
  let pathname = window.location.pathname;
  
  // Check if we're using file:// protocol (not allowed by Spotify)
  if (origin === 'null' || origin.startsWith('file://')) {
    console.error('Cannot use file:// protocol. Please use a local server (e.g., npx serve .)');
    return null;
  }
  
  // Normalize pathname - remove trailing slash if present (except for root)
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  
  // Build the full redirect URI
  // encodeURI properly encodes spaces and special characters in the path
  const fullUri = origin + encodeURI(pathname);
  
  // Validate it's a proper URL
  try {
    const testUrl = new URL(fullUri);
    if (!testUrl.protocol.startsWith('http')) {
      console.error('Redirect URI must use http:// or https:// protocol');
      return null;
    }
  } catch (e) {
    console.error('Invalid redirect URI format:', e);
    return null;
  }
  
  return fullUri;
}

const REDIRECT_URI = getRedirectUri();
const SPOTIFY_AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";

// We use the Implicit Grant flow: Spotify redirects back with an access_token
// in the URL hash fragment. This keeps everything frontend‑only.

const SCOPES = [
  // We only need read‑only public endpoints for recommendations + previews
  // so no sensitive scopes required.
].join(" ");

// --- SIMPLE STORAGE LAYER ----------------------------------------------------

const storage = {
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      /* ignore */
    }
  },
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) {
      /* ignore */
    }
  },
};

// --- AUTH HANDLING -----------------------------------------------------------

const TOKEN_KEY = "waveswipe_spotify_token";
const CODE_VERIFIER_KEY = "waveswipe_code_verifier";

async function buildSpotifyAuthUrl() {
  if (!REDIRECT_URI) {
    throw new Error("INVALID_REDIRECT_URI");
  }
  
  // Generate PKCE code verifier and challenge
  const codeVerifier = generateRandomString(128);
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  
  // Store code verifier for later token exchange
  storage.set(CODE_VERIFIER_KEY, codeVerifier);
  
  // Build params for Authorization Code flow with PKCE
  const params = new URLSearchParams();
  params.append("client_id", SPOTIFY_CLIENT_ID);
  params.append("response_type", "code"); // Changed from "token" to "code"
  params.append("redirect_uri", REDIRECT_URI);
  params.append("code_challenge_method", "S256");
  params.append("code_challenge", codeChallenge);
  if (SCOPES) {
    params.append("scope", SCOPES);
  }
  params.append("show_dialog", "true");
  
  const authUrl = `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
  
  // Log for debugging
  console.log("=== Spotify Auth Debug (PKCE) ===");
  console.log("Redirect URI:", REDIRECT_URI);
  console.log("Using Authorization Code flow with PKCE");
  console.log("Full auth URL:", authUrl);
  console.log("=========================");
  
  return authUrl;
}

async function exchangeCodeForToken(code) {
  const codeVerifier = storage.get(CODE_VERIFIER_KEY);
  if (!codeVerifier) {
    throw new Error("Code verifier not found. Please try logging in again.");
  }
  
  const response = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: SPOTIFY_CLIENT_ID,
      grant_type: "authorization_code",
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error("Token exchange failed:", response.status, errorText);
    throw new Error("TOKEN_EXCHANGE_FAILED");
  }
  
  const data = await response.json();
  storage.remove(CODE_VERIFIER_KEY); // Clean up after use
  
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
}

async function parseCodeFromUrl() {
  // Check query params (not hash) for Authorization Code flow
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const error = params.get("error");
  
  if (error) {
    const errorDescription = params.get("error_description") || "Unknown error";
    console.error("Spotify auth error:", error, errorDescription);
    
    // Clean query params from URL
    history.replaceState(
      "",
      document.title,
      window.location.pathname
    );
    
    // Show user-friendly error message
    let errorMsg = "❌ Spotify authentication failed!\n\n";
    errorMsg += "Error: " + error + "\n";
    errorMsg += "Details: " + decodeURIComponent(errorDescription) + "\n\n";
    
    if (error === "invalid_client") {
      errorMsg += "Your Client ID might be incorrect. Check app.js";
    } else if (error === "invalid_request" || error === "invalid_redirect_uri") {
      errorMsg += "Redirect URI mismatch!\n\n";
      errorMsg += "Current redirect URI: " + REDIRECT_URI + "\n\n";
      errorMsg += "Please:\n";
      errorMsg += "1. Copy the redirect URI above\n";
      errorMsg += "2. Go to https://developer.spotify.com/dashboard\n";
      errorMsg += "3. Open your app → Settings → Redirect URIs\n";
      errorMsg += "4. Add the exact redirect URI (it must match exactly)\n";
    }
    
    alert(errorMsg);
    return null;
  }
  
  if (!code) return null;
  
  // Clean query params from URL
  history.replaceState(
    "",
    document.title,
    window.location.pathname
  );
  
  // Exchange code for token
  try {
    const tokenData = await exchangeCodeForToken(code);
    return tokenData;
  } catch (e) {
    console.error("Failed to exchange code for token:", e);
    alert(
      "❌ Failed to complete authentication.\n\n" +
      "Please try logging in again."
    );
    return null;
  }
}

function getStoredToken() {
  const data = storage.get(TOKEN_KEY);
  if (!data) return null;
  if (!data.accessToken || !data.expiresAt) return null;
  if (Date.now() >= data.expiresAt) {
    storage.remove(TOKEN_KEY);
    return null;
  }
  return data;
}

function setStoredToken(tokenObj) {
  storage.set(TOKEN_KEY, tokenObj);
}

// --- SIMPLE API WRAPPER ------------------------------------------------------

async function spotifyRequest(path, params = {}, isRetry = false) {
  const tokenData = getStoredToken();
  if (!tokenData) {
    throw new Error("NO_TOKEN");
  }
  
  const cleanPath = path.startsWith("/") ? path : "/" + path;
  
  let url = "https://api.spotify.com/v1" + cleanPath;
  if (params && Object.keys(params).length) {
    const queryParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        queryParams.append(key, String(value));
      }
    });
    url += "?" + queryParams.toString();
  }

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${tokenData.accessToken}`,
    },
  });

  if (res.status === 401) {
    storage.remove(TOKEN_KEY);
    throw new Error("TOKEN_EXPIRED");
  }

  if (!res.ok) {
    const errorText = await res.text();
    let errorMessage = errorText;
    
    try {
      const errorData = JSON.parse(errorText);
      errorMessage = errorData.error?.message || errorData.error?.description || JSON.stringify(errorData);
    } catch {
      errorMessage = errorText || `HTTP ${res.status} ${res.statusText}`;
    }
    
    if (res.status === 429) {
      if (!isRetry) {
        const waitMs = 5000;
        console.warn("Rate limited. Retrying in 5s...");
        await new Promise((r) => setTimeout(r, waitMs));
        return spotifyRequest(cleanPath, params, true);
      }
      throw new Error("RATE_LIMITED: Too many requests. Wait a minute and try again.");
    }
    
    console.error("Spotify API error:", { status: res.status, path: cleanPath, error: errorMessage });
    throw new Error(`SPOTIFY_ERROR: ${res.status} - ${errorMessage}`);
  }

  return res.json();
}

// --- TASTE ENGINE ------------------------------------------------------------

const TASTE_KEY = "waveswipe_taste_v1";

const defaultTasteState = () => ({
  genreWeights: {}, // { genre: score }
  likedTrackIds: [],
  lastUpdated: Date.now(),
});

let tasteState = storage.get(TASTE_KEY, defaultTasteState());

function saveTaste() {
  tasteState.lastUpdated = Date.now();
  storage.set(TASTE_KEY, tasteState);
}

function resetTaste() {
  tasteState = defaultTasteState();
  saveTaste();
}

function bumpGenre(genre, delta) {
  if (!genre) return;
  const current = tasteState.genreWeights[genre] || 0;
  const next = current + delta;
  tasteState.genreWeights[genre] = next;
}

function registerLike({ primaryGenre, trackId, strong = false }) {
  const base = strong ? 3 : 1.5;
  bumpGenre(primaryGenre, base);
  if (trackId && !tasteState.likedTrackIds.includes(trackId)) {
    tasteState.likedTrackIds.push(trackId);
  }
  saveTaste();
}

function registerSkip({ primaryGenre }) {
  bumpGenre(primaryGenre, -1.0);
  saveTaste();
}

function getTopGenres(limit = 5) {
  const entries = Object.entries(tasteState.genreWeights);
  if (!entries.length) return [];
  const sorted = entries.sort((a, b) => b[1] - a[1]).slice(0, limit);
  const maxVal = sorted[0][1] || 1;
  return sorted.map(([genre, score]) => ({
    genre,
    score,
    normalized: maxVal ? score / maxVal : 0,
  }));
}

// --- MOOD PRESETS ------------------------------------------------------------

// Very simple mapping of moods to Spotify recommendation seeds.
// These are generic and not hyper‑optimized, but work well for demo purposes.
const MOOD_PRESETS = {
  balanced: {
    name: "Balanced",
    explanation: "Mix of your strongest genres with a bit of exploration.",
  },
  gym: {
    name: "Gym",
    targetEnergy: 0.8,
    explanation: "High‑energy tracks tuned for workouts.",
  },
  night: {
    name: "Night",
    targetEnergy: 0.6,
    explanation: "Moody and atmospheric late‑night listening.",
  },
  sad: {
    name: "Sad",
    targetValence: 0.25,
    explanation: "Lower‑valence, introspective tracks.",
  },
  drive: {
    name: "Drive",
    targetEnergy: 0.7,
    explanation: "Driving‑friendly, rhythmic tracks.",
  },
  focus: {
    name: "Focus",
    targetInstrumentalness: 0.6,
    explanation: "More instrumental, background‑friendly tracks.",
  },
};

let currentMood = "balanced";

// --- DOM HOOKS ----------------------------------------------------------------

const loginBtn = document.getElementById("spotify-login-btn");
const redirectUriDisplay = document.getElementById("redirect-uri-display");
const moodChips = document.getElementById("mood-chips");
const cardEl = document.getElementById("track-card");
const btnLike = document.getElementById("btn-like");
const btnSkip = document.getElementById("btn-skip");
const btnReplay = document.getElementById("btn-replay");
const btnPlay = document.getElementById("btn-play");
const previewStatusEl = document.getElementById("preview-status");

// Audio element for preview playback
let audio = new Audio();
audio.preload = "none";

// Spotify embed player
let spotifyEmbedFrame = null;

let currentTrack = null;
let currentTrackMeta = null; // { primaryGenre, reason, exploration }

// --- RENDER HELPERS ----------------------------------------------------------

function msToTimeLabel(ms) {
  const totalSec = Math.round(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function updatePreviewStatus() {
  // No-op when using embed
}

function renderTasteGraph() {}

function renderWhyThis(meta) {
  return;
  if (!meta) {
    whyThisEl.textContent =
      "Start swiping and we’ll tell you why each track shows up — mood, genres, exploration, and more.";
    return;
  }
  const reasons = [];

  if (meta.moodName) {
    reasons.push(`You’re in **${meta.moodName} mode**.`);
  }
  if (meta.primaryGenre) {
    const weight = tasteState.genreWeights[meta.primaryGenre] || 0;
    if (weight > 0.5) {
      reasons.push(
        `You’ve been **liking a lot of ${meta.primaryGenre}**, so we’re leaning into that.`
      );
    } else if (weight < -0.5) {
      reasons.push(
        `You’ve often **skipped ${meta.primaryGenre}**, but we still resurface it sometimes so tastes can evolve.`
      );
    } else {
      reasons.push(
        `We’re nudging **${meta.primaryGenre}** into the mix to see how it feels.`
      );
    }
  }
  if (meta.exploration) {
    reasons.push(
      "This one is part of a **small exploration batch** so things don’t get boring."
    );
  }
  if (meta.fromLikedTrack) {
    reasons.push(
      "It’s also **sonically close to tracks you’ve hearted before**."
    );
  }
  if (!reasons.length) {
    reasons.push(
      "This track sits near the center of what Spotify thinks you might like based on your recent actions."
    );
  }

  // Very lightweight Markdown bold parsing for **text**
  const html = reasons
    .map((r) =>
      r.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\.$/, ".")
    )
    .join(" ");

  whyThisEl.innerHTML = html;
}

function renderTrackCard(track, meta) {
  cardEl.classList.remove("track-card-empty");
  cardEl.innerHTML = "";

  const header = document.createElement("div");
  header.className = "track-header";

  const pill = document.createElement("div");
  pill.className = "pill" + (meta.exploration ? " pill-explore" : "");
  const dot = document.createElement("span");
  dot.className = "pill-dot";
  const label = document.createElement("span");
  label.textContent = meta.exploration ? "Exploration track" : "Core taste";
  pill.appendChild(dot);
  pill.appendChild(label);

  const rightMeta = document.createElement("div");
  rightMeta.className = "track-meta";
  const moodLabel = document.createElement("div");
  moodLabel.className = "track-mood-label";
  moodLabel.textContent = "MODE";
  const moodValue = document.createElement("div");
  moodValue.className = "track-mood-value";
  moodValue.textContent = MOOD_PRESETS[currentMood]?.name || "Balanced";
  rightMeta.appendChild(moodLabel);
  rightMeta.appendChild(moodValue);

  header.appendChild(pill);
  header.appendChild(rightMeta);

  const body = document.createElement("div");
  body.className = "track-body";

  const coverWrap = document.createElement("div");
  coverWrap.className = "cover-wrap";
  const img = document.createElement("img");
  img.className = "cover-img";
  img.src = track.album?.images?.[0]?.url || "";
  img.alt = track.name || "Album art";
  coverWrap.appendChild(img);

  const overlay = document.createElement("div");
  overlay.className = "cover-overlay";
  const overlayIcon = document.createElement("div");
  overlayIcon.className = "cover-overlay-icon";
  overlayIcon.textContent = "▶";
  overlay.appendChild(overlayIcon);
  coverWrap.appendChild(overlay);

  const info = document.createElement("div");
  info.className = "track-info";

  const title = document.createElement("div");
  title.className = "track-title";
  title.textContent = track.name;
  const artist = document.createElement("div");
  artist.className = "track-artist";
  artist.textContent = track.artists
    .map((a) => a.name)
    .filter(Boolean)
    .join(", ");

  const extra = document.createElement("div");
  extra.className = "track-extra";

  if (meta.primaryGenre) {
    const genreTag = document.createElement("span");
    genreTag.className = "tag tag-genre";
    genreTag.textContent = meta.primaryGenre;
    extra.appendChild(genreTag);
  }

  if (typeof meta.energy === "number") {
    const energyTag = document.createElement("span");
    energyTag.className = "tag tag-energy";
    energyTag.textContent =
      meta.energy > 0.7 ? "High energy" : meta.energy < 0.35 ? "Chill" : "Mid";
    extra.appendChild(energyTag);
  }

  const copy = document.createElement("div");
  copy.className = "track-copy";
  copy.textContent =
    "Swipe right if this feels like you, swipe left if it doesn’t. We’ll quietly reroute the stream either way.";

  info.appendChild(title);
  info.appendChild(artist);
  info.appendChild(extra);
  info.appendChild(copy);

  body.appendChild(coverWrap);
  body.appendChild(info);

  const footer = document.createElement("div");
  footer.className = "track-footer";

  const badge = document.createElement("div");
  badge.className = "badge-small";
  const bdDot = document.createElement("span");
  bdDot.className = "badge-dot";
  const bdLabel = document.createElement("span");
  bdLabel.textContent = "Self‑learning feed";
  badge.appendChild(bdDot);
  badge.appendChild(bdLabel);

  const score = document.createElement("div");
  score.className = "track-score";
  if (meta.primaryGenre) {
    const val = tasteState.genreWeights[meta.primaryGenre] || 0;
    score.textContent = `${meta.primaryGenre} score: ${val.toFixed(1)}`;
  } else {
    score.textContent = "We’re still calibrating your profile.";
  }

  footer.appendChild(badge);
  footer.appendChild(score);

  cardEl.appendChild(header);
  cardEl.appendChild(body);
  cardEl.appendChild(footer);
}

// --- TRACK FETCHING LOGIC ----------------------------------------------------

// Minimal cache of artistId -> genres[]
const artistGenreCache = {};

async function fetchArtistGenres(artistId) {
  if (!artistId) return [];
  if (artistGenreCache[artistId]) return artistGenreCache[artistId];
  try {
    const data = await spotifyRequest(`/artists/${encodeURIComponent(artistId)}`);
    const genres = Array.isArray(data.genres) ? data.genres : [];
    artistGenreCache[artistId] = genres;
    return genres;
  } catch (e) {
    console.warn("Failed to load artist genres", e);
    artistGenreCache[artistId] = [];
    return [];
  }
}

function pickPrimaryGenre(genres) {
  if (!Array.isArray(genres) || !genres.length) return null;
  // Prefer genres we already know something about, else first item
  const known = genres.filter((g) => tasteState.genreWeights[g] != null);
  if (known.length) return known[0];
  return genres[0];
}

function randomChoice(list) {
  if (!list.length) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx];
}

// Valid Spotify genre seeds (from Spotify API docs)
const VALID_SPOTIFY_GENRES = [
  "acoustic", "afrobeat", "alt-rock", "alternative", "ambient", "anime",
  "black-metal", "bluegrass", "blues", "bossanova", "brazil", "breakbeat",
  "british", "cantopop", "chicago-house", "children", "chill", "classical",
  "club", "comedy", "country", "dance", "dancehall", "death-metal",
  "deep-house", "detroit-techno", "disco", "disney", "drum-and-bass",
  "dub", "dubstep", "edm", "electro", "electronic", "emo", "folk",
  "forro", "french", "funk", "garage", "german", "gospel", "goth",
  "grindcore", "groove", "grunge", "guitar", "happy", "hard-rock",
  "hardcore", "hardstyle", "heavy-metal", "hip-hop", "holidays", "honky-tonk",
  "house", "idm", "indian", "indie", "indie-pop", "industrial", "iranian",
  "j-dance", "j-idol", "j-pop", "j-rock", "jazz", "k-pop", "kids",
  "latin", "latino", "malay", "mandopop", "metal", "metal-misc", "metalcore",
  "minimal-techno", "movies", "mpb", "new-age", "new-release", "opera",
  "pagode", "party", "philippines-opm", "piano", "pop", "pop-film",
  "post-dubstep", "power-pop", "progressive-house", "psych-rock", "punk",
  "punk-rock", "r-n-b", "rainy-day", "reggae", "reggaeton", "road-trip",
  "rock", "rock-n-roll", "rockabilly", "romance", "sad", "salsa", "samba",
  "sertanejo", "show-tunes", "singer-songwriter", "ska", "sleep", "songwriter",
  "soul", "soundtracks", "spanish", "study", "summer", "swedish", "synth-pop",
  "tango", "techno", "trance", "trip-hop", "turkish", "work-out", "world-music"
];

function getValidGenres(genres) {
  return genres
    .map(g => g.toLowerCase().replace(/\s+/g, "-"))
    .filter(g => VALID_SPOTIFY_GENRES.includes(g))
    .slice(0, 5);
}

// Cache tracks to reduce API calls (1 fetch = 10 tracks)
let trackCache = [];

async function getNextTrack() {
  const moodConfig = MOOD_PRESETS[currentMood] || MOOD_PRESETS.balanced;
  
  // Serve from cache first - no API call
  if (trackCache.length > 0) {
    const track = trackCache.pop();
    return {
      track,
      meta: { primaryGenre: null, exploration: true, moodName: moodConfig.name, fromLikedTrack: false },
    };
  }
  
  // Cache empty - fetch 10 tracks at once; try multiple search terms if one returns empty
  const searchTerms = ["pop", "rock", "indie", "electronic", "jazz", "Blinding Lights", "Levitating", "dance", "R&B", "hip hop", "acoustic"];
  const shuffled = [...searchTerms].sort(() => Math.random() - 0.5);
  
  for (const q of shuffled) {
    try {
      const searchData = await spotifyRequest("/search", { q, type: "track", limit: 10, market: "US" });
      const tracks = searchData.tracks?.items || [];
      if (tracks.length === 0) continue;
      
      const track = randomChoice(tracks);
      trackCache = tracks.filter((t) => t.id !== track.id);
      
      return {
        track,
        meta: { primaryGenre: null, exploration: true, moodName: moodConfig.name, fromLikedTrack: false },
      };
    } catch (e) {
      if (e.message?.includes("429") || e.message?.includes("RATE_LIMITED")) {
        throw new Error("RATE_LIMITED: Spotify rate limit. Wait 30s and try again.");
      }
      if (e.message?.includes("NO_TRACKS")) continue;
      throw e;
    }
  }
  
  throw new Error("NO_TRACKS");
}

async function showNextTrack() {
  setButtonsEnabled(false);
  
  // Stop any existing playback
  if (audio) {
    audio.pause();
    audio.src = "";
  }
  if (spotifyEmbedFrame) {
    spotifyEmbedFrame.remove();
    spotifyEmbedFrame = null;
  }
  
  try {
    const { track, meta } = await getNextTrack();
    currentTrack = track;
    currentTrackMeta = meta;
    
    renderTrackCard(track, meta);
    
    // Add Spotify embed for playback
    const embedUrl = `https://open.spotify.com/embed/track/${track.id}?utm_source=generator&theme=0`;
    spotifyEmbedFrame = document.createElement("iframe");
      spotifyEmbedFrame.src = embedUrl;
      spotifyEmbedFrame.width = "100%";
      spotifyEmbedFrame.height = "152";
      spotifyEmbedFrame.frameBorder = "0";
      spotifyEmbedFrame.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
      spotifyEmbedFrame.loading = "lazy";
      
      const embedWrap = document.createElement("div");
      embedWrap.className = "track-embed-wrap";
      embedWrap.appendChild(spotifyEmbedFrame);
      
      setTimeout(() => {
        const cardBody = cardEl.querySelector(".track-body");
        if (cardBody && embedWrap) {
          cardBody.appendChild(embedWrap);
        }
      }, 50);
    
    
    btnLike.disabled = false;
    btnSkip.disabled = false;
    btnReplay.disabled = false;
  } catch (e) {
    console.error(e);
    cardEl.classList.add("track-card-empty");
    const title = e.message?.includes("RATE_LIMITED") ? "Too many requests" : "We hit a quiet patch";
    const msg = e.message?.includes("RATE_LIMITED") ? "Wait 30-60 seconds, then try again." : "Try again in a moment.";
    cardEl.innerHTML = '<div class="empty-state"><h2>' + title + '</h2><p>' + msg + '</p></div>';
    setButtonsEnabled(true);
  }
}

function setButtonsEnabled(enabled) {
  btnLike.disabled = !enabled;
  btnSkip.disabled = !enabled;
  btnReplay.disabled = !enabled;
}

// --- EVENT WIRING ------------------------------------------------------------

function attachEventHandlers() {
  loginBtn.addEventListener("click", async () => {
    if (!SPOTIFY_CLIENT_ID || SPOTIFY_CLIENT_ID === "YOUR_SPOTIFY_CLIENT_ID_HERE") {
      alert(
        "Please set your Spotify Client ID in app.js before trying to connect."
      );
      return;
    }
    
    if (!REDIRECT_URI) {
      alert(
        "❌ Invalid URL detected!\n\n" +
        "You're opening this file via file:// protocol, which Spotify doesn't allow.\n\n" +
        "Please use a local web server instead:\n" +
        "• VS Code: Right-click index.html → 'Open with Live Server'\n" +
        "• Terminal: Run 'npx serve .' then open the URL it shows\n\n" +
        "Then make sure that same URL is added to your Spotify app's Redirect URIs."
      );
      return;
    }
    
    try {
      const authUrl = await buildSpotifyAuthUrl();
      
      // Show confirmation with details
      const confirmMsg = 
        "About to redirect to Spotify...\n\n" +
        "Redirect URI: " + REDIRECT_URI + "\n\n" +
        "Make sure this EXACT URL is in your Spotify app's Redirect URIs.\n\n" +
        "Click OK to continue, or Cancel to check your settings.";
      
      if (!confirm(confirmMsg)) {
        console.log("User cancelled. Check redirect URI:", REDIRECT_URI);
        return;
      }
      
      console.log("Redirecting to Spotify auth...");
      console.log("Full auth URL:", authUrl);
      window.location.href = authUrl;
    } catch (error) {
      console.error("Failed to build auth URL:", error);
      alert(
        "❌ Failed to build authentication URL.\n\n" +
        "Error: " + error.message + "\n\n" +
        "Please check:\n" +
        "1. You're using a web server (not file://)\n" +
        "2. Your redirect URI matches what's in Spotify dashboard\n" +
        "3. The redirect URI is: " + REDIRECT_URI + "\n\n" +
        "Check the browser console for more details."
      );
    }
  });

  moodChips.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mood]");
    if (!btn) return;
    const mood = btn.getAttribute("data-mood");
    if (!MOOD_PRESETS[mood]) return;
    currentMood = mood;
    [...moodChips.querySelectorAll(".chip")].forEach((chip) =>
      chip.classList.toggle(
        "chip-active",
        chip.getAttribute("data-mood") === mood
      )
    );
    if (getStoredToken()) {
      showNextTrack();
    }
  });

  btnLike.addEventListener("click", () => {
    if (!currentTrack) return;
    registerLike({
      primaryGenre: currentTrackMeta?.primaryGenre,
      trackId: currentTrack.id,
      strong: false,
    });
    showNextTrack();
  });

  btnSkip.addEventListener("click", () => {
    if (!currentTrack) return;
    registerSkip({
      primaryGenre: currentTrackMeta?.primaryGenre,
    });
    showNextTrack();
  });

  btnReplay.addEventListener("click", () => {
    if (!currentTrack) return;
    registerLike({
      primaryGenre: currentTrackMeta?.primaryGenre,
      trackId: currentTrack.id,
      strong: true, // replay = stronger like
    });
  });

}

// --- INITIALIZATION ----------------------------------------------------------

async function initialize() {
  attachEventHandlers();

  // Check if redirect URI is valid
  if (!REDIRECT_URI) {
    console.warn("⚠️ Invalid redirect URI detected. Make sure you're using a web server, not file://");
    loginBtn.textContent = "⚠️ Use a web server (not file://)";
    loginBtn.disabled = true;
    if (redirectUriDisplay) {
      redirectUriDisplay.textContent = "Please use a web server (e.g., npx serve .)";
      redirectUriDisplay.style.display = "block";
    }
    return;
  }

  // Show redirect URI for easy copying
  if (redirectUriDisplay) {
    redirectUriDisplay.innerHTML = `
      <div style="margin-bottom: 4px; font-size: 0.7rem;">Add this EXACT URL to Spotify:</div>
      <code id="redirect-uri-code" style="background: rgba(15,23,42,0.8); padding: 4px 8px; border-radius: 4px; cursor: pointer; user-select: all; display: block; font-size: 0.75rem; border: 1px solid rgba(148,163,184,0.3);" onclick="navigator.clipboard.writeText('${REDIRECT_URI}').then(() => alert('Copied to clipboard!'))">${REDIRECT_URI}</code>
      <div style="margin-top: 4px; font-size: 0.65rem; color: var(--text-soft);">(Click to copy)</div>
    `;
    redirectUriDisplay.style.display = "block";
  }

  // 1. If we just came back from Spotify, parse the code from query params and exchange for token
  const tokenData = await parseCodeFromUrl();
  if (tokenData) {
    setStoredToken(tokenData);
    // Hide redirect URI display after successful auth
    if (redirectUriDisplay) {
      redirectUriDisplay.style.display = "none";
    }
  }

  // 2. Check if we already have a valid token in storage
  const stored = getStoredToken();
  if (stored) {
    loginBtn.textContent = "Spotify connected";
    loginBtn.classList.remove("btn-primary");
    loginBtn.classList.add("btn-ghost");
    setButtonsEnabled(true);
    if (redirectUriDisplay) {
      redirectUriDisplay.style.display = "none";
    }
    showNextTrack();
  } else {
    setButtonsEnabled(false);
    // Log the redirect URI for debugging
    console.log("=== IMPORTANT: Add this Redirect URI to Spotify ===");
    console.log("Current URL:", window.location.href);
    console.log("Origin:", window.location.origin);
    console.log("Pathname:", window.location.pathname);
    console.log("Redirect URI:", REDIRECT_URI);
    console.log("");
    console.log("Alternative formats to try if above doesn't work:");
    console.log("1. With trailing slash:", REDIRECT_URI + "/");
    console.log("2. Without filename (if pathname ends with index.html):", window.location.origin + window.location.pathname.replace(/\/index\.html$/, "/"));
    console.log("");
    console.log("Steps:");
    console.log("1. Go to https://developer.spotify.com/dashboard");
    console.log("2. Open your app → Settings → Redirect URIs");
    console.log("3. Click 'Add' and paste the redirect URI above");
    console.log("4. Make sure it matches EXACTLY (including http/https, port, path)");
    console.log("5. If still not working, try the alternative formats above");
    console.log("==================================================");
    
    // Also show in the display
    if (redirectUriDisplay) {
      const alt1 = REDIRECT_URI + "/";
      const alt2 = window.location.origin + window.location.pathname.replace(/\/index\.html$/, "/");
      redirectUriDisplay.innerHTML = `
        <div style="margin-bottom: 6px; font-size: 0.7rem; font-weight: 600;">Add ONE of these URLs to Spotify:</div>
        <div style="margin-bottom: 4px;">
          <div style="font-size: 0.65rem; color: var(--text-soft); margin-bottom: 2px;">Primary (try this first):</div>
          <code id="redirect-uri-code" style="background: rgba(15,23,42,0.8); padding: 4px 8px; border-radius: 4px; cursor: pointer; user-select: all; display: block; font-size: 0.7rem; border: 1px solid rgba(148,163,184,0.3);" onclick="navigator.clipboard.writeText('${REDIRECT_URI}').then(() => alert('Copied!'))">${REDIRECT_URI}</code>
        </div>
        ${alt1 !== REDIRECT_URI ? `
        <div style="margin-bottom: 4px;">
          <div style="font-size: 0.65rem; color: var(--text-soft); margin-bottom: 2px;">Alternative 1 (with trailing slash):</div>
          <code style="background: rgba(15,23,42,0.8); padding: 4px 8px; border-radius: 4px; cursor: pointer; user-select: all; display: block; font-size: 0.7rem; border: 1px solid rgba(148,163,184,0.3);" onclick="navigator.clipboard.writeText('${alt1}').then(() => alert('Copied!'))">${alt1}</code>
        </div>
        ` : ''}
        ${alt2 !== REDIRECT_URI && alt2 !== alt1 ? `
        <div style="margin-bottom: 4px;">
          <div style="font-size: 0.65rem; color: var(--text-soft); margin-bottom: 2px;">Alternative 2 (without filename):</div>
          <code style="background: rgba(15,23,42,0.8); padding: 4px 8px; border-radius: 4px; cursor: pointer; user-select: all; display: block; font-size: 0.7rem; border: 1px solid rgba(148,163,184,0.3);" onclick="navigator.clipboard.writeText('${alt2}').then(() => alert('Copied!'))">${alt2}</code>
        </div>
        ` : ''}
        <div style="margin-top: 6px; font-size: 0.65rem; color: var(--text-soft);">(Click any URL to copy)</div>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", initialize);

