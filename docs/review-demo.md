# Review demo: local AWS simulations

Run `npm start` from the project folder and open http://127.0.0.1:4173. Use Chrome, Edge or another modern browser. Everything runs locally; no AWS credentials, SDK calls, accounts or cloud charges are involved. Keep this tab open during the review. Browser storage can be cleared, so export important datasets/backups first.

## Opening explanation (30 seconds)

“Spotiswipe solves repetitive music discovery and the difficulty of making a varied playlist that fits a listener’s available time. For this review I implemented local simulations of Amazon Personalize, DynamoDB and S3. The website operates on real licensed recordings and labelled synthetic training histories. My own swipes and listens create real local records. Final cloud integration is a later phase.”

## Start with the cloud architecture (2 minutes)

Open Cloud lab and explain the “cloud architecture case.” Show why Personalize is the primary service, the current vs planned architecture, resource lifecycle, and rubric evidence. Use [the full AWS review defence](aws-review.md) for integration contracts and viva answers. Then run the same-campaign listener comparison. For a controlled contrast, deploy a popularity version and repeat; it ignores listener taste, so the ranked lists should match. Roll back to hybrid.

## Demonstration (5–7 minutes)

1. **Discover:** preview a track, Keep one and Pass another. Each action records an interaction. Undo removes the latest swipe. Listening for 10 actual seconds records LISTEN; seeking does not fake engagement.
2. **Cloud lab → DynamoDB:** Run Query on Interactions. Explain `PK = USER#you` and the timestamp/event-ID sort key. Inspect the returned records and request JSON. Use the profile menu to switch listeners and show a different partition. Starter profiles have synthetic histories; a new profile starts empty. The profile menu simulates switching listeners, not authentication.
3. **Cloud lab → Personalize:** train a solution version, evaluate it, then Deploy. Explain that training creates a version and deploying selects which version serves recommendations. Show rollback. Evaluation uses a synthetic holdout, not proof of real-world accuracy.
4. **Mix studio:** build a 15-minute playlist with an artist cap and discovery setting. Show the actual durations, genre/artist variety and baseline comparison. This constraint-aware optimizer is the main enhancement beyond recommendation ranking.
5. **Save to library:** name and save the mix. This writes a Playlists record and automatically creates a JSON backup object.
6. **Cloud lab → S3:** select the mix and Create another backup version. Show version history and distinct IDs. Delete object: the latest state becomes a delete marker. Get latest now reports NoSuchKey. Recover an earlier version as latest, then Get latest object to download and inspect the JSON. Previous versions remain available.
7. **Refresh:** show the saved mix and backup versions remain. Expand Service request journal to inspect actual operations and responses.

## What is simulated accurately within scope?

- DynamoDB: two logical tables backed by canonical app data, composite keys, partition-scoped Query with sort-key prefix and descending ordering, actual PutItem/DeleteItem action records.
- S3: one local bucket, key-addressed JSON objects, unique versions, GetObject by version or latest, delete markers, copying an earlier version into a new current version, downloadable backup bodies.
- Personalize: datasets, interaction capture, explicit solution-version/campaign lifecycle, recommendations, evaluation and rollback. The local hybrid algorithm is transparent; it does not reproduce AWS’s proprietary model.
- All resources persist together through IndexedDB. Schema-3 sessions created before this update migrate with empty S3 backups; existing saved mixes can be backed up manually.

## Boundaries and honest answers

These are educational adapters, not AWS emulators or SDK-compatible services. DynamoDB capacity, distributed replication, IAM, concurrency, wire-format AttributeValues and consistency are not reproduced. S3 durability, encryption, signed URLs and access control are not reproduced. Local resource IDs are not real ARNs. Profiles provide demo separation, not security. The journal retains 40 operations and previews at most 12 query items. Backups retain up to 200 versions. Replacing/restoring the dataset resets local resources.

## Final cloud integration path

Keep these product flows. Replace local adapters with authenticated backend endpoints: DynamoDB for interactions and saved-mix metadata, S3 with bucket versioning for playlist JSON, Personalize datasets/event tracker/solution/campaign for ranking. Browser clients must not receive AWS secret keys. Add authentication, authorization, validation, budgets and failure handling with the actual cloud deployment. Local scores and synthetic evaluation numbers will not carry over as AWS model results.

## Official references

- DynamoDB keys and tables: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CoreComponents.html
- DynamoDB Query: https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html
- S3 versioning: https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html
- S3 delete markers: https://docs.aws.amazon.com/AmazonS3/latest/userguide/DeletingObjectVersions.html
- Personalize custom resources: https://docs.aws.amazon.com/personalize/latest/dg/create-custom-resources.html
