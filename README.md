# Spotiswipe — Find your next good listen

A working independent-music discovery application and an **Amazon Personalize educational simulation** for BCSE355L Digital Assignment 3.

Listen to real music, keep or pass tracks, and build a varied mix that fits your time. Inspect and operate the recommendation workflow in Personalize lab.

## Run, test and build

Node.js 20+ is required for the development tools. The browser app has no runtime dependencies, API keys, AWS charges or Spotify login requirement.

```sh
npm start        # http://127.0.0.1:4173
npm test         # algorithm, service lifecycle and HTTP tests
npm run check    # syntax checks across all application/test scripts
npm run build    # deployable website in dist/
```

## What works

- **Music discovery:** 16 real CC0 recordings across Electronic, Jazz, Rock and Ambient, with bundled 30-second excerpts, full-recording source links and artist credits.
- **Personal taste:** genre preferences, mood, discovery control, like/pass buttons, pointer swipes, keyboard controls, undo and clean-content filtering.
- **Listening:** play/pause, seek, previous/next and continuous preview queues. A preview heard for 10 seconds records a LISTEN event once per playback. It is never falsely labelled a replay.
- **Library:** liked tracks, search, local listener profiles, saved mixes, listening history and JSON/M3U export.
- **Service simulation:** validated datasets, background model training, version history, held-out evaluation, explicit campaign deployment, rollback, recommendation request inspection and operation logs.
- **Enhancement:** a discovery-balanced playlist optimizer with duration and artist limits, plus comparisons against plain ranking and a baseline under the same constraints.
- **Persistence:** IndexedDB stores profiles, events, trained snapshots, deployed version and saved playlists. The service worker caches the app and starter previews after a successful initial visit.

## Problem statement

Listeners need a quick way to express their preferences and discover unfamiliar music without ending up with repetitive playlists. Spotiswipe turns explicit feedback into ranked discovery, then creates a varied playlist under a time budget and artist-repetition limit.

The catalog is deliberately small and instrumental. It demonstrates a complete product flow; this is not a replacement for Spotify's catalog, accounts or playback service.

## AWS service selected: Amazon Personalize

Amazon Personalize is a managed recommendation service. Its custom workflow imports datasets, trains solution versions, evaluates models, deploys a campaign and serves recommendations using interaction feedback. Spotiswipe simulates that workflow with a transparent local algorithm.

| Personalize concept            | Working implementation                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Items and interaction datasets | Real CC0 track metadata, 1,200 synthetic seed events from 40 demo listeners, and actual local listener events |
| Dataset import                 | Schema and reference validation; invalid input leaves the session intact                                      |
| Solution / recipe              | Hybrid personalization or a popularity baseline                                                               |
| Solution version               | Trained, versioned model with immutable source-event snapshot                                                 |
| Evaluation                     | Per-user last-positive-item holdout; Hit Rate@5 and NDCG@5 versus popularity                                  |
| Campaign                       | Explicitly deploy an existing ready version; training alone does not change serving                           |
| Rollback                       | Deploy an older retained version and preserve it across reloads                                               |
| `PutEvents` analogue           | Timestamped LIKE, LISTEN and REPLAY records; SKIP is our application-level negative signal                    |
| `GetRecommendations` analogue  | Ranked unseen candidates for the current listener, context and filters                                        |

This is a **service simulation, not a live AWS deployment or a wire-compatible AWS SDK**. The model is item-to-item cosine co-occurrence plus live preference signals, not Amazon's proprietary recipes. Model training occurs in a Web Worker; serving is a local function call. We do not claim to reproduce AWS's cloud infrastructure, autoscaling, schedules or exact event semantics.

## The additional enhancement

Mix studio selects a playlist as a set, rather than simply taking the highest-ranked tracks. A greedy objective balances relevance, unfamiliar genres and new-genre coverage while enforcing:

- Full-track duration at or below the selected budget.
- At most the selected number of tracks per artist.
- No duplicate tracks or currently rejected tracks.
- Optional explicit-content exclusion.

The UI reports actual duration, artists, genres and mean relevance for the discovery mix, a relevance-only baseline with identical constraints, and plain relevance ranking. Increased diversity can reduce relevance; the app shows the tradeoff and does not claim a global optimum.

## Real music and data provenance

Recordings are CC0 releases sourced from their authors' OpenGameArt pages. All 16 excerpts are bundled (about 5.8 MB total), so ordinary app use does not depend on a third-party audio API. Original audio is trimmed to 30 seconds, encoded at 96 kbps and given short fades. Full-track durations are measured from source files; genre, energy and valence are manually curated descriptors. Artwork is an original collection of geometric SVG sleeves.

See [music credits](docs/music-credits.md) and the machine-readable [source manifest](assets/music-sources.json), including original URLs and SHA-256 hashes. Demo histories are synthetic and labelled as such. New interactions are labelled `listener`.

Spotify content is not used for training. The original project remains in `web p spotify/` for reference; its current Spotify compatibility is unverified and it is excluded from the production build.

## Data import and exports

`datasets/starter.json` is a complete valid import example. Limits are 2–250 tracks, 10,000 events and 5 MB. Importing replaces local profiles, events, mixes and models after confirmation. The new dataset must be trained and deployed before it serves recommendations.

`datasets/items.csv`, `datasets/interactions.csv` and their schema examples illustrate the corresponding AWS data layout. The UI's CSV export excludes SKIP. These examples are not a claim that a real AWS import has been performed.

Playlist JSON includes source links and metadata. Preview M3U contains absolute URLs to the 30-second excerpts; it requires the hosting address to remain available. It does not create a playlist in Spotify.

## Documentation and assignment handoff

- [Interface redesign and verification](docs/design-notes.md)
- [Architecture and algorithms](docs/architecture.md)
- [Rubric mapping](docs/rubric.md)
- [Faculty demo and viva answers](docs/demo.md)
- [Deployment](docs/deployment.md)
- [Verification](docs/verification.md)
- [Music credits](docs/music-credits.md)

The assignment requires faculty approval before publishing. The deployable package and manual GitHub Pages workflow are provided. Record the actual published URL and submit the form after approval; those steps are not implied by passing tests.

## Source layout

```text
src/catalog.js    Real CC0 catalog and source metadata
src/data.js       Reproducible seed histories, profiles and moods
src/engine.js     Validation, training, ranking, evaluation and optimization
src/service.js    Dataset, event, solution-version and campaign lifecycle
src/storage.js    Serialized IndexedDB persistence
src/worker.js     Background training and evaluation
src/player.js     Audio playback and preview queue
src/app.js        Views and user interaction
assets/previews/  Bundled licensed audio excerpts
scripts/         Development server, checks and static build
tests/          Behavioral and HTTP tests
datasets/       Import example and AWS-style CSV/schema examples
docs/           Architecture, rubric, demo, credits and deployment
```

## References

- [Amazon Personalize custom resource workflow](https://docs.aws.amazon.com/personalize/latest/dg/create-custom-resources.html)
- [Deploying solution versions with campaigns](https://docs.aws.amazon.com/personalize/latest/dg/campaigns.html)
- [Interaction datasets](https://docs.aws.amazon.com/personalize/latest/dg/interactions-datasets.html)
- [Real-time interaction events](https://docs.aws.amazon.com/personalize/latest/dg/recording-item-interaction-events.html)
- [CC0 public-domain dedication](https://creativecommons.org/publicdomain/zero/1.0/)
