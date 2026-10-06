# Verification record

Verified locally on 6 October 2026.

## Automated checks

- `npm test`: **29 passing tests** covering personalized ranking, cold start, feedback, filters, cosine co-occurrence, holdout evaluation, constrained playlist optimization, import validation, unsafe URLs and unusual identifiers, model snapshots, event deduplication, explicit deployment/rollback, retention, serialization, audio engagement accounting and HTTP audio ranges.
- `npm run check`: syntax checks pass for application, worker, service worker, development scripts and tests.
- `npm run build`: produces the static `dist/` package and verifies all 16 bundled previews exist.
- `git diff --check`: no whitespace errors.

The playback regression test confirms seeking from 2 to 20 seconds does not manufacture a LISTEN event. Actual accumulated playback triggers it once.

## Browser checks performed locally

- The completed app loads without Spotify login or API credentials.
- Real bundled music plays; the player advances and records a LISTEN event.
- Keep advances the recommendation and updates the library; undo restores the previous decision.
- Mix generation shows duration, artist/genre coverage and relevance comparisons. Saving a named mix persists across reload.
- Training v2 leaves v1 serving until explicit deployment.
- Evaluation displays Hit Rate@5 and NDCG@5 against a popularity baseline, with dataset limitations.
- Deploying v2 and rolling back to v1 both work; a reload preserves v1 as the selected campaign and retains both versions.
- With the isolated test server stopped, the previously cached app reloads and a bundled audio preview starts successfully.
- Mobile discovery was visually checked at 390 × 844, and the desktop discovery page was inspected and captured after the final build.

The starter synthetic evaluation produced 82.5% Hit Rate@5 and 0.755 NDCG@5, compared with 57.5% and 0.354 for popularity. These are reproducible demonstration results on a small synthetic-history dataset, not evidence of real-world recommendation quality.

## Limits of verification

- The final v3 dataset import transaction is covered by automated tests; the final file-picker UI was not separately repeated in browser QA.
- Published hosting is pending faculty-approval confirmation. GitHub Pages workflow execution and public URL verification remain to be done.
- Google Form submission and faculty demonstration remain student steps.
- Legacy Spotify API integration is preserved but unverified and excluded from the build.
- No actual AWS resources, AWS billing or proprietary Personalize model training were exercised.
- Cross-browser/device and screen-reader testing is not comprehensive. Browser playback state is verified; human audio-quality evaluation is not claimed.
