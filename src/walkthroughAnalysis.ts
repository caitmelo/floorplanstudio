import * as FileSystem from "expo-file-system/legacy";
import { ANALYSIS_TOKEN, ANALYSIS_URL } from "./analysis.config";
import { Condition, Confidence, WalkthroughDraft } from "./model";

type RawAnalysis = {
  draft: WalkthroughDraft;
  sourceVideoDeleted: boolean;
  reviewedRequired: boolean;
};

const categories = [
  "Walls & ceilings",
  "Flooring",
  "Doors & windows",
  "Fixtures & fittings",
  "Cleanliness",
] as const;
const conditions: Condition[] = ["good", "fair", "attention", "unreviewed", "na"];
const confidence: Confidence[] = ["low", "medium", "high"];

function assertDraft(value: unknown): WalkthroughDraft {
  const data = value as RawAnalysis;
  if (!data?.draft || !Array.isArray(data.draft.rooms))
    throw new Error("Analysis did not return an inspection draft.");
  if (!confidence.includes(data.draft.confidence))
    throw new Error("Analysis returned an invalid confidence level.");
  const rooms = data.draft.rooms.map((room) => {
    if (!room?.name || !Array.isArray(room.items))
      throw new Error("Analysis returned an invalid room.");
    const items = room.items.map((item) => {
      if (
        !categories.includes(item.category as (typeof categories)[number]) ||
        !conditions.includes(item.condition) ||
        !confidence.includes(item.confidence) ||
        !/^\d{1,2}:\d{2}$/.test(item.timestamp)
      )
        throw new Error("Analysis returned an invalid condition suggestion.");
      return item;
    });
    if (items.length !== categories.length)
      throw new Error("Analysis did not assess every room category.");
    return { ...room, items };
  });
  return { ...data.draft, rooms };
}

export async function analyzeWalkthrough(
  uri: string,
  input: {
    kind: "ingoing" | "outgoing";
    property: string;
    baseline: string;
  },
  onProgress?: (fraction: number) => void,
): Promise<WalkthroughDraft> {
  const task = FileSystem.createUploadTask(
    ANALYSIS_URL,
    uri,
    {
      httpMethod: "POST",
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: "walkthrough",
      mimeType: "video/quicktime",
      parameters: input,
      headers: { "x-roomrecord-token": ANALYSIS_TOKEN },
    },
    ({ totalBytesSent, totalBytesExpectedToSend }) => {
      if (totalBytesExpectedToSend > 0)
        onProgress?.(Math.min(1, totalBytesSent / totalBytesExpectedToSend));
    },
  );
  const result = await task.uploadAsync();
  if (!result) throw new Error("The walkthrough upload was cancelled.");
  let body: unknown;
  try {
    body = JSON.parse(result.body);
  } catch {
    throw new Error("The analysis service returned an unreadable response.");
  }
  if (result.status < 200 || result.status >= 300) {
    const message = (body as { error?: string })?.error;
    throw new Error(message || `Walkthrough analysis failed (${result.status}).`);
  }
  return assertDraft(body);
}
