# Spotiswipe · Amazon Personalize Simulation

BCSE355L / Cloud Architecture Design / Digital Assignment 3

A swipe-based discovery website that **simulates the custom recommendation workflow of Amazon Personalize**, using a fully synthetic music catalog. Its additional enhancement is a playlist optimizer that balances preference and variety under duration and artist constraints.

## Problem statement

Listeners need a quick way to express preferences and discover unfamiliar music without receiving repetitive playlists. Spotiswipe records explicit feedback, ranks unseen tracks for each listener, and assembles a mix under practical constraints. This is an educational prototype; it has not been validated with real listeners.

## Run and verify

Requires Node.js 20 or newer. No npm dependencies, AWS account, Spotify credentials or build step are required.

```sh
npm start
# Open http://127.0.0.1:4173
npm test
npm run check
```

The root `index.html` is the assignment application. The existing Spotify app is preserved in `web p spotify/`; it is a separate legacy application with unverified current Spotify API compatibility. Its data is never imported into the simulator.

## Working features

- Like/pass buttons, pointer swipes, keyboard shortcuts, and generated demo sound.
- 72 synthetic tracks across six genres; 420 synthetic interactions from 30 listeners.
- Fresh-listener cold start and seeded demo profiles with distinct histories.
- Trained item-to-item cosine co-occurrence associations, supplemented by live genre feedback and mood matching.
- Catalog and interaction dataset validation, JSON import/export and persistent browser storage.
- Explicit solution-version training, source-event snapshots, and latest-version serving.
- Score explanations, recent events, and inspectable simulated recommendation requests.
- Chronological held-out hit-rate evaluation against a popularity baseline.
- Playlist generation with duration ceiling, artist cap, explicit-content exclusion and rejected-track exclusion.
- Adjustable discovery preference, measured baseline comparison, and playlist JSON export.

## AWS service mapping

| Amazon Personalize concept         | Local implementation                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| Items / item interactions datasets | Validated item metadata and timestamped listener events                             |
| Dataset import                     | JSON import with schema validation and safe field normalization                     |
| Custom solution / solution version | `train()` creates a versioned co-occurrence model                                   |
| Campaign / recommendation serving  | Latest local model supplies `recommend()`; no real campaign resource is provisioned |
| `PutEvents`                        | LIKE and REPLAY event collection; SKIP is our application-specific negative signal  |
| `GetRecommendations`               | User-specific ordered candidates, heuristic scores and explanations                 |
| Filtering                          | Exclude previously seen feed items; clean content and rejected tracks for playlists |

These are conceptual analogues, **not wire-compatible AWS APIs**. The JSON importer is simpler than AWS's production schema/import flow. The local algorithm does not reproduce AWS recipes, managed deployment, scalability or all timing semantics. See [architecture](docs/architecture.md).

## Enhancement

Playlist selection is distinct from the recommendation service. The optimizer uses greedy selection:

`utility = (1 − discovery) × relevance + discovery × (0.5 × novelty + 0.5 × new-genre bonus)`

A candidate is eligible only if it fits the remaining duration budget and does not exceed the artist cap. There are no repeated track IDs. Explicit tracks and all tracks rejected by the current listener are excluded before optimization. The baseline ranks by relevance and uses the same duration and content filters, but no artist cap or genre bonus. Metrics expose the variety/relevance tradeoff honestly. This is a heuristic, not a global mathematical optimum.

## Data and playback

All fixture titles, artists, item features, users and histories are generated examples. The optional demo sound is synthesized by Web Audio and is **not an audio recording of the displayed track**. There are no Spotify API calls in the assignment application.

Spotify prohibits ingestion of its content into ML/AI models; do not import Spotify content into this simulator. Bring only synthetic or appropriately licensed data. Browser storage can be cleared and is not a cross-device cloud database. No listening data leaves the browser.

## Evaluation

For each eligible listener with at least three distinct positive items, hold out their latest positive item, remove every occurrence of it from that listener's training history, rebuild a model, and check whether it appears in the top 10 unseen candidates. Compare against a popularity-only ranking. Report actual results, including worse results. Seeded data is deliberately structured and cannot establish real-world effectiveness.

## Rubric and demonstration

See [rubric mapping](docs/rubric.md), [demo and viva guide](docs/demo.md), and [deployment checklist](docs/deployment.md).

The website and source are prepared for faculty review. **Faculty approval, a published deployment URL and Google Form submission remain external steps.** Do not claim those steps are complete until they are actually done.

## Source layout

- `src/data.js` — generated catalog, events and moods.
- `src/engine.js` — validation, training, ranking, optimization and evaluation.
- `src/app.js` — interface, persistence, imports/exports and interaction handling.
- `tests/engine.test.js` — meaningful behavior and edge-case tests.
- `scripts/serve.mjs` — local development server.
- `docs/` — architecture, rubric, demo and deployment handoff.
- `web p spotify/` — original Spotify application preserved for reference.

## References

- [Amazon Personalize workflow](https://docs.aws.amazon.com/personalize/latest/dg/how-it-works.html)
- [Interaction datasets](https://docs.aws.amazon.com/personalize/latest/dg/interactions-datasets.html)
- [Recording real-time events](https://docs.aws.amazon.com/personalize/latest/dg/recording-item-interaction-events.html)
- [Recommendation filters](https://docs.aws.amazon.com/personalize/latest/dg/filter.html)
- [Spotify developer policy](https://developer.spotify.com/policy)
