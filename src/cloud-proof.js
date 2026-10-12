import { serve, activeModel } from "./service.js";
import { MOODS } from "./data.js";
import { record } from "./cloud.js";
export function compareListeners(state, first, second) {
  if (!activeModel(state))
    throw Error("Train and deploy a campaign before comparing listeners.");
  if (first === second) throw Error("Choose two different listeners.");
  const results = [first, second].map((userId) => {
    if (!state.profiles.some((p) => p.id === userId))
      throw Error("Unknown listener.");
    const tracks = serve(
      { ...state, user: userId },
      {
        mood: MOODS[state.mood],
        clean: state.clean,
        excludeSeen: false,
        discovery: 0,
      },
    ).slice(0, 5);
    const request = {
      campaign: state.campaign.name,
      solutionVersion: state.campaign.version,
      userId,
      numResults: 5,
      context: { mood: state.mood },
      simulationOptions: { excludeSeen: false, discovery: 0 },
    };
    const response = {
      itemList: tracks.map((t) => ({
        itemId: t.id,
        title: t.title,
        genre: t.genre,
        score: Number(t.score.toFixed(4)),
        reason: t.reason,
      })),
      simulation: true,
    };
    record(state, "Personalize", "GetRecommendations", request, response);
    return { userId, request, response };
  });
  const ids = new Set(results[0].response.itemList.map((t) => t.itemId));
  return {
    at: Date.now(),
    campaignVersion: state.campaign.version,
    results,
    overlap: results[1].response.itemList.filter((t) => ids.has(t.itemId))
      .length,
  };
}
export function reviewEvidence(state) {
  return {
    format: "spotiswipe-aws-review-v1",
    generatedAt: new Date().toISOString(),
    mode: "LOCAL_SIMULATION",
    awsResourcesCreated: 0,
    primaryService: "Amazon Personalize",
    supportingServices: ["Amazon DynamoDB", "Amazon S3"],
    currentState: {
      catalogItems: state.items.length,
      syntheticEvents: state.events.filter((e) => e.source === "synthetic")
        .length,
      listenerEvents: state.events.filter((e) => e.source !== "synthetic")
        .length,
      models: state.models.map((m) => ({
        version: m.version,
        recipe: m.recipe,
        inputEvents: m.eventCount,
        evaluation: m.evaluation || null,
      })),
      campaign: state.campaign,
      savedPlaylists: state.playlists.length,
      backupVersions: state.cloud.objects.length,
    },
    operationJournal: state.cloud.operations,
    limitations: [
      "No AWS SDK or credentials; browser IndexedDB persistence",
      "Local hybrid algorithm is not an AWS recipe",
      "Profile switching is not authentication",
      "No distributed durability, IAM, throughput or availability simulation",
      "Synthetic evaluation is not production accuracy",
    ],
    finalIntegration:
      "Authenticated backend endpoints must replace local adapters. Real resources and deployment remain pending.",
  };
}
