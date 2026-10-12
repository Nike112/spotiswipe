# Spotiswipe: AWS architecture and review defence

## The assignment claim

This is a functional website simulating **Amazon Personalize** as the primary AWS service. DynamoDB and S3 simulations demonstrate how a recommendation feature fits into an application architecture. The meaningful enhancement is playlist optimization under a duration budget and artist cap, with computed baseline comparisons. Adding extra service names is not itself the enhancement.

For this review, services run as JavaScript adapters with browser IndexedDB persistence. No AWS account, cloud resource, ARN, IAM authorization or network backend is present. The final integration is a proposed architecture, not a completed deployment.

## Why this is a cloud use case

The product problem is repetitive music discovery and the work of assembling a varied playlist that fits a listening session. A swipe is an inexpensive preference signal; listening is an engagement signal. The product needs to retain those signals, convert histories into recommendations, assemble a usable mix and preserve its output.

In a production app, listeners expect the same history across devices and sessions. Browser-only storage cannot provide that. A managed recommendation service can own training and online serving; a keyed database can own application history and mix metadata; object storage can own recoverable exports and training datasets. These are distinct responsibilities. This project demonstrates their connections without claiming that a 16-track classroom dataset requires cloud ML.

### Service choices and tradeoffs

| Requirement                                             | Service            | Why it fits                                                                     | Alternatives / limits                                                                                                              |
| ------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Rank tracks for a listener using user-item interactions | Amazon Personalize | Managed recommendation lifecycle, event ingestion and online serving            | A local recommender is simpler for this tiny catalogue. Production relevance and cost must be measured.                            |
| Retrieve one listener’s events and saved mixes          | DynamoDB           | Key-value/document model aligns with known partition-based access patterns      | SQL is a sensible alternative when complex joins and ad hoc analysis dominate.                                                     |
| Retain downloadable snapshots and earlier versions      | S3                 | Key-addressed objects, versioning and retrieval independent of library metadata | JSON is small enough for other storage. Here S3 is chosen for the backup/version workflow, not because DynamoDB cannot store JSON. |

## What runs today

- **Client:** licensed audio previews, swipe UI, profiles and playlist studio.
- **Personalize adapter:** validated item/event datasets; background training; immutable solution snapshots; explicit campaign deployment; rankings; holdout evaluation; rollback.
- **DynamoDB adapter:** two logical tables backed by the app’s canonical arrays. PutItem/DeleteItem correspond to real local mutations. Query reads a user partition and sort-key prefix in descending sort-key order. No separate replica of the records is fabricated.
- **S3 adapter:** versioned JSON playlist objects, GET by latest/version, delete markers and recovery by writing an earlier body as a new version.
- **Persistence:** the complete session is serialized to IndexedDB.
- **Evidence:** explicit Personalize requests plus table/object operations appear in a bounded journal. Export review evidence records the actual local state and limitations.

The local hybrid formula is transparent application code; it is not an AWS recipe implementation. Personalize service names describe the lifecycle being simulated, not SDK compatibility.

## Three data paths to explain

### 1. Online feedback and recommendations

Today: Keep or Listen → write Interactions record → record local Personalize PutEvents → update local taste → compute ranked tracks from deployed model. Pass/Skip remains application feedback for exclusion; it is not sent as a positive event in the simulated Personalize journal.

Final target: browser → authenticated endpoint → DynamoDB write and Personalize event tracker PutEvents → GetRecommendations against campaign → enrich returned IDs with catalogue metadata → apply permitted content/exclusion rules → display music.

Important differences: AWS treats interactions as positive by default; a negative event name alone does not suppress a track. Train on appropriate positive event types and enforce exclusions with app filtering or a supported Personalize filter strategy. Local Undo can remove an event; it does not correspond to an AWS per-event Undo operation. Supported AWS recipes can adapt online to recent events, but the details are recipe-specific.

### 2. Offline training and deployment

Today: validated arrays → worker learns local model → save immutable model version → evaluate holdout → manually select deployed campaign version.

Final target: explicit export of historical interactions/item metadata → private S3 training location → schemas and datasets in custom Personalize dataset group → dataset import jobs → configured solution → solution version → campaign → runtime recommendations.

DynamoDB does **not** automatically become a Personalize dataset. Export/import orchestration must be implemented. User-Personalization-v2 is a candidate to evaluate for the final online recommendation use case; local “hybrid” and “popularity” are not AWS recipe identifiers. Real training is asynchronous, and campaign update behaviour is configurable.

AWS documents minimum training counts of 1,000 interactions and 25 users with at least two interactions each. The in-app readiness panel computes these two checks on the positive export. This is not a full AWS import validator, and synthetic histories do not establish real-world accuracy.

### 3. Playlist creation and backup

Today: ranked candidates → application optimizer → saved playlist table record → S3-like PutObject containing JSON. Repeating the backup creates a version. Delete creates a marker; earlier data remains retrievable by version. Recovery writes the old body as the new current version.

Final target: backend obtains recommendations → optimizer enforces time/artist limits → persist metadata to DynamoDB and complete snapshot to a private versioned S3 bucket. Download through an authorized backend or short-lived presigned URL. Do not confuse playlist backups with training datasets; use separate buckets or prefixes and permissions.

DynamoDB and S3 writes are not a cross-service atomic transaction. If one succeeds and the other fails, track backup status and retry/reconcile. A durable outbox or queue can similarly support reliable event delivery. These are final-integration requirements, not simulated distributed guarantees.

## Planned integration contract

These endpoints are a design proposal; no HTTP API is implemented yet.

| Endpoint                    | Backend responsibility                                                                | AWS operation                                                    |
| --------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| POST /interactions          | Derive authenticated user, validate item/type, deduplicate/reconcile event            | DynamoDB PutItem; positive events → Personalize Events PutEvents |
| GET /recommendations        | Use authorized user and deployed campaign; enrich/filter results                      | Personalize Runtime GetRecommendations                           |
| GET /playlists              | Query only the authenticated listener’s partition                                     | DynamoDB Query                                                   |
| POST /playlists             | Optimize/validate constraints, save metadata and snapshot; reconcile partial failures | DynamoDB PutItem; S3 PutObject                                   |
| GET /playlists/:id/versions | Authorize ownership, inspect backups                                                  | S3 ListObjectVersions with appropriate filtering                 |
| GET /playlists/:id/export   | Authorize ownership, retrieve selected version                                        | S3 GetObject or authorized presigned URL                         |
| POST /admin/train           | Restricted admin workflow, import/validate data and start training                    | Personalize dataset import and CreateSolutionVersion             |
| POST /admin/campaign        | Restricted admin action; select a successful solution version                         | Personalize CreateCampaign / UpdateCampaign                      |

Use an authenticated API Gateway/Lambda backend or equivalent server implementation. Lambda and API Gateway are **planned**, not additional implemented simulations. Browser clients must not receive AWS secret access keys. Profile switching currently demonstrates partitions; it is not user authentication.

## What to show for the rubric

**Understanding (2):** Explain why each service fits its access pattern, differentiate dataset/solution version/campaign, show the architecture and acknowledge boundaries.

**Core simulation (3):** Train/deploy/rollback and inspect requests. Compare two listeners under one campaign. Demonstrate a real swipe becoming a table record and a saved mix becoming a versioned object.

**Enhancement (2):** Recommendation ranking alone does not guarantee a good playlist. Show duration and per-artist constraints plus discovery/coverage objective. Compare actual outcomes to relevance-only ranking under the same constraints. Do not claim a global optimum or universal quality improvement.

**UI/UX (1):** Real previews and a usable listening flow; service inspection in Cloud lab.

**Deployment/GitHub (1):** Repository, CI, static build and publishing workflow exist. Public deployment and final submission remain pending approval. “Deploy campaign” changes the local recommendation model; it does not publish the website.

**Demonstration (1):** Present one coherent journey, explain its cloud operations, and answer why this architecture is justified. Faculty decides the marks.

## Best live experiment

Compare demo listeners with different genre histories using the same hybrid campaign and mood. Show computed rankings and both requests. Then train a popularity version, deploy it and repeat. The popularity algorithm intentionally ignores user taste, so the rankings should match under this controlled comparison. Roll back to hybrid. This demonstrates what personalization contributes while keeping the model and input controls explicit. Results are computed, not scripted differences.

## Questions you should be ready to answer

- **Where is AWS actually running?** Nowhere in this review: local simulations implement selected workflows. Real AWS integration is pending.
- **Why not just use the Spotify API?** Spotify is a music provider, not the simulated recommendation infrastructure. This demo uses independently licensed recordings; the original implementation is preserved separately.
- **Does AWS train directly from the database?** Not automatically. The planned export/import pipeline prepares data for Personalize datasets; live events enter through the event tracker.
- **Is the optimizer an AWS service?** No. It is the application enhancement using the recommender’s output.
- **Can DynamoDB partitions replace login security?** No. The final backend must derive/authorize user identity and prevent access to other partitions.
- **Why not say this scales to millions?** This local demo supplies no load or distributed-system evidence. Managed services provide capabilities we would configure and test during integration.
- **What consumes cloud cost later?** Model training/serving, API/compute requests, database reads/writes, object storage/versions and transfer. No cost estimate is asserted without a concrete configuration and current pricing.

## Official documentation

- [Personalize custom resource workflow](https://docs.aws.amazon.com/personalize/latest/dg/create-custom-resources.html)
- [Interaction data and negative event semantics](https://docs.aws.amazon.com/personalize/latest/dg/interactions-datasets.html)
- [Real-time event influence](https://docs.aws.amazon.com/personalize/latest/dg/recording-events.html)
- [Campaign deployment](https://docs.aws.amazon.com/personalize/latest/dg/campaigns.html)
- [DynamoDB access-pattern design](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/bp-general-nosql-design.html)
- [DynamoDB Query](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Query.html)
- [S3 versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Versioning.html)
