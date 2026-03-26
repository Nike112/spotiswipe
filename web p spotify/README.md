# WaveSwipe – Tinder-style Spotify music discovery

WaveSwipe is a **single-user, swipe-based music discovery web app** that uses the **Spotify Web API** and 30-second previews.  
You swipe on tracks, the app adjusts per-genre scores, and your feed evolves over time.

> No social, no sharing – just you, your swipes, and a self-learning taste engine.

---

## Features

- **Swipe-style controls**
  - **Like (❤️)** → boosts the genre score
  - **Skip (✕)** → reduces that genre score, but never fully bans it
  - **Replay (↻)** → counts as a _stronger like_ for that song’s genre
- **Real Spotify previews**
  - Uses 30-second `preview_url` audio clips from the Spotify Web API
- **Mood modes**
  - Gym, Night, Sad, Drive, Focus, plus a Balanced default
  - Each mood applies different target audio features (energy, valence, etc.)
- **Smart exploration**
  - Small percentage of tracks are marked as “Exploration” so the feed doesn’t get stale
- **Taste evolution graph**
  - Per-genre score visualization that updates as you interact
- **“Why am I seeing this?”**
  - Explains mood, genre bias, exploration, and link to past likes

---

## 1. Create a Spotify app

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Create a new application.
3. Under **Settings → Redirect URIs**, add the URL where you’ll open the app:
   - For example, if you run a simple local server on port 5500:
     - `http://localhost:5500/index.html`
4. Save your changes and copy the **Client ID**.

---

## 2. Configure the frontend

Open `app.js` and set your client ID:

```js
const SPOTIFY_CLIENT_ID = "YOUR_SPOTIFY_CLIENT_ID_HERE";
```

Make sure the `REDIRECT_URI` matches one of the Redirect URIs you added in the Spotify dashboard:

```js
const REDIRECT_URI = window.location.origin + window.location.pathname;
```

If you serve `index.html` from `http://localhost:5500/index.html`, that is what Spotify must have configured.

---

## 3. Run the app locally

You only need a **static file server** – no backend logic is required.

Examples:

- With **VS Code Live Server** → right-click `index.html` → “Open with Live Server”.
- With `npx serve`:

```bash
npx serve .
```

Then open the URL it prints (e.g. `http://localhost:3000/index.html`) and make sure that same URL is in your Spotify app’s Redirect URIs.

---

## 4. How the taste engine works

- Each time a track is shown, its **primary genre** is inferred from the first artist’s genres.
- The app keeps a `genreWeights` object in `localStorage`:
  - **Like** → `+1.5` to that genre
  - **Replay** → `+3` to that genre
  - **Skip** → `-1` to that genre
- These weights:
  - Influence the **seed genres** and seed tracks for Spotify’s `/recommendations` endpoint.
  - Drive the **Taste evolution** graph and the explanation under “Why am I seeing this?”.
- A **small percentage** of tracks are forced “Exploration” so you occasionally get
  out-of-pattern music even if your profile is very skewed.

Taste and state are persisted per-browser via `localStorage`, and you can reset them with the **Reset** button in the right-hand panel.

---

## 5. Notes & limitations

- This project uses the **Implicit Grant flow** (`response_type=token`) entirely on the frontend for simplicity.
- Some Spotify tracks **do not have** a `preview_url`; the app prefers tracks with previews but will fall back if needed.
- The mood presets are intentionally simple – you can tweak them in `MOOD_PRESETS` inside `app.js`.

---

## 6. Next ideas

- Add simple swipe gestures (drag left/right on the card) on top of the buttons.
- Persist per-mood preferences separately.
- Add a “session history” side panel to revisit what you’ve liked/skipped.

