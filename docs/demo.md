# Faculty demo and viva guide

## Opening — 20 seconds

“Spotiswipe helps listeners discover unfamiliar music and avoid repetitive playlists. I selected Amazon Personalize because it learns from interactions and serves personalized recommendations. I simulate its dataset, solution-version, evaluation and campaign workflow locally. The extra feature optimizes a playlist for variety, duration and artist repetition.”

## Demo — approximately five minutes

1. **Real product:** In Discover, play a 30-second recording. Pick a genre and keep/pass tracks. Undo one swipe. Show likes in Your library.
2. **Personalization:** Switch between demo listeners. The histories are synthetic, but the recommendation calculations are real. Explain the “Why this track?” breakdown.
3. **Train:** Open Personalize lab. Show the item catalog and timestamped interaction records. Select Popularity baseline and train v2. Point out that the campaign still serves hybrid v1.
4. **Evaluate:** Evaluate hybrid v1. Explain the measured Hit Rate@5 and NDCG@5, the popularity baseline, and why synthetic histories cannot prove real-world quality.
5. **Deploy:** Deploy v2. Show the campaign version and operation log. Roll back to v1 to restore personalized serving. Reload to show the choice persists.
6. **Enhancement:** In Mix studio, choose 10 minutes and an artist cap. Build a mix at 0% discovery, then 80%. Read the actual genre/artist/duration/relevance comparisons. More diversity is not guaranteed for every profile or dataset.
7. **Persistence:** Name and save the mix. Open it in Your library and play the preview queue. Reload and show that it is still saved.
8. **Optional import:** Use a separate test browser/origin if you need to preserve your work. Import `datasets/starter.json`; show that import leaves no active campaign. Train and deploy before returning to Discover.

## What to know for questions

**Why this service?** Recommendation is the central problem. Amazon Personalize's workflow maps directly to interaction data, model training and user-specific ranking. Merely hosting the app on AWS would not demonstrate the service.

**Are you using AWS?** The assignment app simulates Amazon Personalize locally. There is no AWS account, bill, real campaign ARN or claim of AWS-managed infrastructure.

**What is the trained model?** Item-to-item cosine co-occurrence across distinct positive-user histories, plus popularity. Genre preference and mood matching are live scoring inputs. See the formulas in `architecture.md`.

**What is a solution version versus a campaign?** A version is the trained model snapshot. A campaign selects the version used to serve recommendations. Training does not automatically replace the manually selected serving version in this simulation.

**How do swipes change recommendations?** A LIKE raises genre preference and positive-item weight; a SKIP lowers genre preference and filters that track. Live scoring changes immediately. The batch association matrix changes only after training and deployment.

**Why real music but synthetic users?** We have licensed recordings, but no real audience dataset. Generated histories make the model demonstrable without misrepresenting activity or using restricted Spotify content. New local interactions are separately labelled.

**What is the enhancement?** A playlist is optimized as a set with novelty and genre coverage, subject to duration and artist constraints. Basic personalized ranking is core functionality, not the extra feature.

**Is the playlist optimal?** It uses deterministic greedy selection and guarantees its hard constraints. It does not guarantee a global optimum or that diversity always increases.

**Why two baselines?** Plain ranking shows the overall change. The baseline with identical artist and duration limits helps isolate the novelty/coverage objective.

**What do the metrics mean?** Hit Rate@5 measures whether the held-out item appears among five recommendations. NDCG@5 rewards ranking it nearer the top. They describe this test dataset, not actual listener satisfaction.

**Why is playback 30 seconds while a mix says 10 minutes?** The budget uses measured full-recording durations. The embedded player plays previews; source links lead to complete recordings.

**Where is data stored?** IndexedDB on this browser and origin. There is no authenticated multi-user backend or cross-device sync. “Listener profiles” are separate local contexts.

**Can it work offline?** After a successful initial cache installation, the app and bundled previews work without the server. Remote source pages and user-imported external previews still require connectivity.

## Before submission

Run tests, demonstrate to faculty, obtain approval, publish the static site, verify the public URL in a fresh browser, and submit the actual URL and GitHub repository through the assignment form. Do not claim publication solely because a local campaign is deployed.
