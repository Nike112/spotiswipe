# Deployment handoff

The application is ready for static hosting. No account secrets, build step or backend are needed.

## Local review

Run `npm start`, open `http://127.0.0.1:4173`, and demonstrate the root application to faculty. The original app is in `web p spotify/`; do not submit that nested path as the Personalize project.

## After faculty approval: GitHub Pages

1. Merge the reviewed assignment branch into the branch you want to publish.
2. In the repository Settings → Pages, select Deploy from a branch.
3. Select your publication branch and `/ (root)`, then Save.
4. Wait for GitHub's Pages deployment to succeed. Follow the actual URL displayed in Settings.
5. Check Discover, profile switching, swipes, Playlist studio, model training, export and mobile layout at that URL. Assets use relative paths and support repository-subdirectory hosting.
6. Record the actual URL below and submit it with the repository link through the faculty's form.

For this repository, the anticipated Pages URL is `https://nike112.github.io/spotiswipe/`; it is **not confirmed live by this document**.

`.nojekyll` prevents Jekyll processing. The CI workflow runs engine tests and syntax checks; it does not publish automatically. This avoids deploying before the assignment's faculty-approval step.

## Submission record

- Faculty approval: pending
- Verified deployment URL: pending
- Repository: https://github.com/Nike112/spotiswipe
- Google Form submission: pending

Use the form link in your assignment handout. Submission is a separate student action; do not mark it complete merely because the source is pushed.
