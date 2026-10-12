# Deployment handoff

The website is ready for static hosting. No account secrets, backend, paid plan, npm install or AWS account are needed. Build with Node.js 20+.

## Local faculty review

Run `npm start`, open `http://127.0.0.1:4173`, and follow [the five-minute demo](demo.md). The original Spotify app is preserved in `web p spotify/`; the assignment application is at the repository root.

## After faculty approval: GitHub Pages

1. Review and merge the assignment pull request into the default branch.
2. In repository Settings → Pages → Build and deployment, select **GitHub Actions**.
3. In Actions, select **Publish Spotiswipe after faculty approval** → Run workflow, and choose the reviewed branch.
4. The workflow runs all tests, syntax checks and `npm run build`, then publishes only `dist/`. Source documentation and the legacy app are excluded from the website.
5. Follow the actual URL returned by the deployment job. Verify previews, keep/pass, saved mixes, training, campaign deployment and rollback at that address. Check on a phone as well.
6. Submit that verified URL and the repository link through the faculty's form.

The expected repository Pages address is `https://nike112.github.io/spotiswipe/`; this document does **not** confirm it is live. All app and preview paths are relative and support repository-subdirectory hosting.

The publishing workflow is manual. Pushes and pull requests run verification only. This respects the handout's instruction to publish after faculty approval. The lab's **Deploy** button only changes the local recommendation campaign; it never publishes a website or creates AWS resources.

## Other static hosts

Run `npm run build` and upload the contents of `dist/` to an HTTPS static host. Use its normal static-file handling; no SPA rewrite is needed because navigation uses hash routes. Serve JavaScript as JavaScript and MP3 files as `audio/mpeg`. HTTPS (or localhost) is required for the service worker and secure browser APIs.

The app caches the starter audio after its first successful online visit. Browser storage is per origin/device; data from localhost will not transfer automatically to the deployed site. Export datasets before moving if needed. Exports do not contain profiles or saved mixes; those remain device-local.

## Submission record

- Faculty approval: pending confirmation
- Verified deployment URL: pending
- Repository: https://github.com/Nike112/spotiswipe
- Google Form submission: pending

Use the exact form link in the assignment handout. Do not submit the localhost address.
