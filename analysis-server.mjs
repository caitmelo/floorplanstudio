import "dotenv/config";
import cors from "cors";
import express from "express";
import multer from "multer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const execFileAsync = promisify(execFile);
const port = Number(process.env.PORT || 8787);
const token = process.env.ANALYSIS_TOKEN;
if (!token) throw new Error("ANALYSIS_TOKEN is required.");

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: true, methods: ["POST", "GET"] }));
app.get("/health", (_req, res) =>
  res.json({ ok: true, service: "roomrecord-walkthrough-analysis" }),
);

let activeAnalysis = false;
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 500 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, done) => {
    if (!/^video\/(mp4|quicktime|mpeg|webm|3gpp)$/i.test(file.mimetype)) {
      return done(new Error("Upload a MOV, MP4, MPEG, WebM or 3GPP video."));
    }
    done(null, true);
  },
});

const CONDITIONS = ["good", "fair", "attention", "unreviewed", "na"];
const CATEGORIES = [
  "Walls & ceilings",
  "Flooring",
  "Doors & windows",
  "Fixtures & fittings",
  "Cleanliness",
];

function strictPrompt({ kind, property, baseline }) {
  return `You are a cautious rental-property inspection assistant. Review this ONE continuous property walkthrough video and produce a DRAFT ${kind.toUpperCase()} inspection—not a final legal finding. You must never infer a condition that is not visibly supported by the recording.

PROPERTY: ${property || "Not supplied"}
INSPECTION TYPE: ${kind}
${baseline ? `BASELINE FOR OUTGOING COMPARISON (use only as a reference; report only clearly visible differences):\n${baseline}\n` : ""}

Tasks:
1. Segment the walk-through into rooms/spaces in visit order. Use conservative names (for example "Kitchen", "Bedroom — unclear") if identification is uncertain.
2. For EACH observed room, assess these five categories exactly: ${CATEGORIES.join(", ")}.
3. Use condition "attention" only for an objectively visible issue (damage, marked wear, missing/broken fixture, clearly poor cleanliness), and describe exactly what and where. Never say it was caused by a tenant.
4. Use "good" only where the category is clearly visible and appears sound. Use "fair" for visible minor wear. Use "unreviewed" when a category is not sufficiently visible. Use "na" only when the category is clearly absent.
5. For outgoing inspections, do not label a change unless it is visible in this video AND meaningful against the baseline text. If a comparison cannot be made, say so in the note.
6. Give a video timestamp in MM:SS for every observation. Use the clearest moment that visually supports the note, because RoomRecord will extract a still image at that timestamp for the room report. Confidence must be low, medium, or high. Explain coverage limitations in plain language.

Return ONLY valid JSON, with no markdown and no text before or after it, matching this exact shape:
{
  "summary": "string",
  "confidence": "low|medium|high",
  "coverageWarnings": ["string"],
  "rooms": [
    {
      "name": "string",
      "order": 1,
      "confidence": "low|medium|high",
      "walkthroughEvidence": "string",
      "items": [
        {
          "category": "Walls & ceilings|Flooring|Doors & windows|Fixtures & fittings|Cleanliness",
          "condition": "good|fair|attention|unreviewed|na",
          "note": "string",
          "timestamp": "MM:SS",
          "confidence": "low|medium|high"
        }
      ]
    }
  ]
}
Do not include a room unless it is visible. Do not omit categories from a room: use unreviewed when needed.`;
}

function extractJson(text) {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] || text).trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf("{");
    const last = candidate.lastIndexOf("}");
    if (first >= 0 && last > first) return JSON.parse(candidate.slice(first, last + 1));
    throw new Error("The analysis service returned an unreadable draft.");
  }
}

function validConfidence(value) {
  return ["low", "medium", "high"].includes(value) ? value : "low";
}
function validTimestamp(value) {
  return /^\d{1,2}:\d{2}$/.test(String(value || "")) ? String(value) : "00:00";
}
function draftOrThrow(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.rooms)) {
    throw new Error("The analysis did not include a room draft.");
  }
  const rooms = raw.rooms
    .slice(0, 30)
    .map((room, index) => {
      const seen = new Map(
        (Array.isArray(room.items) ? room.items : [])
          .filter((item) => CATEGORIES.includes(item?.category))
          .map((item) => [item.category, item]),
      );
      return {
        name: String(room.name || `Space ${index + 1}`).slice(0, 80),
        order: Number.isFinite(room.order) ? Number(room.order) : index + 1,
        confidence: validConfidence(room.confidence),
        walkthroughEvidence: String(room.walkthroughEvidence || "Room observed in walkthrough.").slice(0, 600),
        items: CATEGORIES.map((category) => {
          const item = seen.get(category) || {};
          return {
            category,
            condition: CONDITIONS.includes(item.condition) ? item.condition : "unreviewed",
            note: String(item.note || "Not sufficiently visible in the walkthrough.").slice(0, 900),
            timestamp: validTimestamp(item.timestamp),
            confidence: validConfidence(item.confidence),
          };
        }),
      };
    })
    .filter((room) => room.name.trim());
  if (!rooms.length) throw new Error("No rooms could be confidently identified in this walkthrough.");
  return {
    summary: String(raw.summary || "AI walkthrough draft ready for review.").slice(0, 1500),
    confidence: validConfidence(raw.confidence),
    coverageWarnings: Array.isArray(raw.coverageWarnings)
      ? raw.coverageWarnings.slice(0, 12).map((warning) => String(warning).slice(0, 300))
      : ["Review every room and item before signing or exporting."],
    rooms: rooms.sort((a, b) => a.order - b.order),
  };
}

function timestampSeconds(timestamp) {
  const [minutes, seconds] = String(timestamp).split(":").map(Number);
  return Math.max(0, (minutes || 0) * 60 + (seconds || 0));
}

async function stillAt(videoPath, timestamp, workspace) {
  const name = `evidence-${timestamp.replace(/:/g, "-")}-${Math.random().toString(36).slice(2)}.jpg`;
  const destination = path.join(workspace, name);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-ss",
      String(timestampSeconds(timestamp)),
      "-i",
      videoPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=480:-2",
      "-q:v",
      "5",
      "-y",
      destination,
    ],
    { timeout: 60_000 },
  );
  const data = await readFile(destination);
  if (data.byteLength > 350_000) return undefined;
  return `data:image/jpeg;base64,${data.toString("base64")}`;
}

async function attachWalkthroughStills(draft, videoPath, workspace) {
  for (const room of draft.rooms) {
    const timestamps = [...new Set(room.items.map((item) => item.timestamp))]
      .filter((timestamp) => /^\d{1,2}:\d{2}$/.test(timestamp))
      .slice(0, 2);
    const stills = [];
    for (const timestamp of timestamps) {
      try {
        const dataUri = await stillAt(videoPath, timestamp, workspace);
        if (dataUri) stills.push({ timestamp, dataUri });
      } catch (error) {
        console.warn(`Could not extract walkthrough still at ${timestamp}`, error);
      }
    }
    room.stills = stills;
  }
  return draft;
}

async function analyzeVideo(videoPath, context, workspace) {
  const { stdout, stderr } = await execFileAsync(
    "manus-analyze-video",
    [videoPath, strictPrompt(context)],
    { cwd: "/home/ubuntu", maxBuffer: 8 * 1024 * 1024, timeout: 15 * 60 * 1000 },
  );
  const output = `${stdout}\n${stderr}`;
  const analysisPath = output.match(/Full analysis result saved to:\s*(.+\.md)/i)?.[1]?.trim();
  const analysis = analysisPath && existsSync(analysisPath) ? await readFile(analysisPath, "utf8") : output;
  try {
    return attachWalkthroughStills(draftOrThrow(extractJson(analysis)), videoPath, workspace);
  } finally {
    if (analysisPath) await rm(analysisPath, { force: true });
  }
}

app.post("/v1/walkthrough-analysis", upload.single("walkthrough"), async (req, res) => {
  if (req.header("x-roomrecord-token") !== token) {
    return res.status(401).json({ error: "This private analysis session is not authorized." });
  }
  if (activeAnalysis) {
    return res.status(429).json({ error: "Another walkthrough is being analyzed. Please wait and try again." });
  }
  if (!req.file) return res.status(400).json({ error: "A walkthrough video is required." });

  activeAnalysis = true;
  const workspace = await mkdtemp(path.join(os.tmpdir(), "roomrecord-analysis-"));
  const extension = path.extname(req.file.originalname || "") || ".mov";
  const stableVideo = path.join(workspace, `walkthrough${extension}`);
  try {
    await (await import("node:fs/promises")).rename(req.file.path, stableVideo);
    const kind = req.body.kind === "outgoing" ? "outgoing" : "ingoing";
    const draft = await analyzeVideo(stableVideo, {
      kind,
      property: String(req.body.property || ""),
      baseline: String(req.body.baseline || ""),
    }, workspace);
    res.json({ draft, sourceVideoDeleted: true, reviewedRequired: true });
  } catch (error) {
    console.error("Walkthrough analysis failed", error);
    res.status(422).json({ error: error instanceof Error ? error.message : "Walkthrough analysis failed." });
  } finally {
    activeAnalysis = false;
    await rm(workspace, { recursive: true, force: true });
    if (req.file?.path) await rm(req.file.path, { force: true });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "The walkthrough is too large. Keep it under 500 MB." });
  }
  res.status(400).json({ error: error instanceof Error ? error.message : "Upload failed." });
});

app.listen(port, "0.0.0.0", () =>
  console.log(`RoomRecord analysis service listening on ${port}`),
);
