# Faculty demonstration and viva

## Opening explanation

“Spotiswipe addresses repetitive music discovery by letting listeners express preferences with swipes. I selected Amazon Personalize because its role is to learn from interaction data and provide personalized recommendations. I simulate its custom recommendation workflow locally with a transparent item-association model. The additional feature builds diverse playlists under duration and artist constraints.”

## Demo — approximately four minutes

1. Open the root website. Point out that the catalog is synthetic and needs no Spotify login.
2. Choose Electronic, then Jazz, under Listening as. Show that the first ranked track and taste bars change with the listener.
3. Choose You. Keep two tracks and pass one. Explain that feedback changes live genre affinity; it does not magically retrain the batch model.
4. Open Personalize lab. Show user/item/timestamp/type events and the simulated request response. Train a new solution version; show the new version and event count.
5. Open Playlist studio. Build a 20-minute mix with one track per artist and 40% discovery. Show the total duration and comparison table.
6. Set discovery to 0%, rebuild, then increase it and rebuild. Explain any actual change in genre coverage and relevance. Do not promise variety will always improve.
7. Download playlist JSON. Explain why it is a data export rather than a real Spotify playlist in this simulation.
8. Run held-out evaluation. Read the actual rates and explain that synthetic users make it a demonstration, not proof of real recommendation quality.

## Likely questions

**Why Amazon Personalize?** It provides the interaction-data, trained-model and recommendation workflow that the app needs. Hosting a website on AWS alone would not simulate a recommendation service.

**What did you train?** Item-to-item associations from positive co-occurrence across users, plus popularity. Current-user genre feedback and mood matching are separate live inputs.

**How is this different from AWS?** AWS uses managed proprietary recipes and scalable infrastructure. This is a small interpretable local simulation of the workflow, not AWS's implementation or API-compatible SDK.

**What is the enhancement?** Playlist-level selection balances predicted relevance, novelty and new-genre coverage while enforcing artist and duration constraints. Basic personalized ranking is core functionality, not the enhancement.

**What happens for a new user?** The app starts with popularity and mood matching, then adapts its live profile after interactions.

**Why not train on Spotify tracks?** Spotify's developer policy prohibits using its content in ML/AI models. This model uses synthetic fixtures. The existing Spotify app is separate.

**Is the optimizer actually optimal?** It is greedy and deterministic. It respects constraints but does not guarantee the globally best playlist.

**Where is data stored?** Browser localStorage. It survives reloads on the same origin/browser, but is not a shared cloud database. Changing the hosting origin starts a separate profile.

**How do you evaluate it?** Hold out the latest positive item per eligible user, remove that user's repeated occurrences of the held-out item, train on the remaining histories, and measure top-10 hits against popularity.

## Before demonstrating

- Run `npm test` and `npm run check`.
- Use a browser with local storage available and sound enabled if demonstrating generated tones.
- Know how to explain the score weights in `docs/architecture.md`.
- Review the code rather than memorizing an unsupported claim.
