export type Condition = "unreviewed" | "good" | "fair" | "attention" | "na";
export type Confidence = "low" | "medium" | "high";
export type Point = { x: number; y: number };
export type Surface = {
  id: string;
  kind: "wall" | "door" | "window" | "opening";
  a: Point;
  b: Point;
  length: number;
  confidence: string;
};
export type FloorPlan = {
  surfaces: Surface[];
  capturedAt: string;
  jsonPath: string;
  usdzPath?: string;
  exportWarning?: string;
  labels?: { roomId: string; name: string; position: Point }[];
  roomCount?: number;
};
export type Evidence = {
  id: string;
  kind: "photo" | "panorama";
  path: string;
  capturedAt: string;
  caption: string;
  source?: "walkthrough" | "manual";
  timestamp?: string;
  coverage?: number;
  sourceDirectory?: string;
  qualityFlags?: string[];
  width?: number;
  height?: number;
};
export type CheckItem = {
  id: string;
  name: string;
  condition: Condition;
  note: string;
  aiSuggestion?: {
    source: "walkthrough-ai";
    timestamp: string;
    confidence: Confidence;
    reviewed: boolean;
    evidenceId?: string;
  };
};
export type Room = {
  id: string;
  name: string;
  items: CheckItem[];
  evidence: Evidence[];
  walkthroughEvidence?: string;
  confidence?: Confidence;
  plan?: FloorPlan;
};
export type Signature = {
  name: string;
  role: "Inspector" | "Tenant";
  paths: string[];
  signedAt: string;
};
export type Walkthrough = {
  id: string;
  path: string;
  capturedAt: string;
  durationSeconds: number;
  coverage?: number;
  status?: "captured" | "analyzing" | "analyzed" | "failed";
  analyzedAt?: string;
  error?: string;
};
export type WalkthroughDraft = {
  summary: string;
  confidence: Confidence;
  coverageWarnings: string[];
  rooms: {
    name: string;
    order: number;
    confidence: Confidence;
    walkthroughEvidence: string;
    stills?: { timestamp: string; dataUri: string }[];
    items: {
      category: CheckItem["name"];
      condition: Condition;
      note: string;
      timestamp: string;
      confidence: Confidence;
    }[];
  }[];
};
export type AnalysisRecord = {
  source: "walkthrough-ai";
  analyzedAt: string;
  summary: string;
  confidence: Confidence;
  coverageWarnings: string[];
  reviewRequired: true;
};
export type Inspection = {
  id: string;
  kind: "ingoing" | "outgoing";
  createdAt: string;
  finalizedAt?: string;
  baselineId?: string;
  rooms: Room[];
  signatures: Signature[];
  walkthroughs?: Walkthrough[];
  analysis?: AnalysisRecord;
  propertyPlan?: FloorPlan;
};
export type PropertyScan = {
  plan: FloorPlan;
  rooms: { roomId: string; plan: FloorPlan }[];
};
export function applyPropertyScan(inspection: Inspection, result: PropertyScan) {
  if (inspection.finalizedAt) throw new Error("This inspection is finalized.");
  const ids = result.rooms.map((r) => r.roomId);
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    ids.some((id) => !inspection.rooms.some((r) => r.id === id))
  )
    throw new Error(
      "Scan returned unknown or duplicate rooms. Existing plans were retained.",
    );
  for (const plan of [result.plan, ...result.rooms.map((r) => r.plan)]) {
    if (
      !plan.surfaces.length ||
      plan.surfaces.some(
        (s) =>
          ![s.a.x, s.a.y, s.b.x, s.b.y, s.length].every(Number.isFinite) ||
          s.length <= 0,
      )
    )
      throw new Error("Scan contains invalid geometry. Existing plans were retained.");
  }
  inspection.propertyPlan = result.plan;
  result.rooms.forEach(({ roomId, plan }) => {
    inspection.rooms.find((r) => r.id === roomId)!.plan = plan;
  });
  inspection.signatures = [];
}
export type Property = {
  id: string;
  address: string;
  suburb: string;
  inspections: Inspection[];
};
export type Database = { version: 1; properties: Property[] };
export const CONDITIONS: Condition[] = [
  "unreviewed",
  "good",
  "fair",
  "attention",
  "na",
];
export const CONDITION_LABEL: Record<Condition, string> = {
  unreviewed: "Not reviewed",
  good: "Good",
  fair: "Fair",
  attention: "Attention",
  na: "N/A",
};
export const uid = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const checklist = [
  "Walls & ceilings",
  "Flooring",
  "Doors & windows",
  "Fixtures & fittings",
  "Cleanliness",
] as const;
export const newRoom = (name: string): Room => ({
  id: uid(),
  name,
  evidence: [],
  items: checklist.map((name) => ({ id: uid(), name, condition: "unreviewed", note: "" })),
});
export function newInspection(
  kind: Inspection["kind"],
  baseline?: Inspection,
): Inspection {
  return {
    id: uid(),
    kind,
    createdAt: new Date().toISOString(),
    signatures: [],
    walkthroughs: [],
    baselineId: baseline?.id,
    rooms: baseline
      ? baseline.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          evidence: [],
          items: r.items.map((i) => ({
            ...i,
            condition: "unreviewed",
            note: "",
            aiSuggestion: undefined,
          })),
        }))
      : ["Living room", "Kitchen", "Bedroom", "Bathroom"].map(newRoom),
  };
}
function normalizedName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function roomForDraft(
  draft: WalkthroughDraft["rooms"][number],
  existing?: Room,
): Room {
  const previousByName = new Map(existing?.items.map((item) => [item.name, item]));
  const walkthroughEvidence = (existing?.evidence ?? []).filter(
    (item) => item.source !== "walkthrough",
  );
  const stills = (draft.stills ?? []).map((still) => ({
    id: uid(),
    kind: "photo" as const,
    path: still.dataUri,
    capturedAt: new Date().toISOString(),
    caption: `Walkthrough evidence · ${still.timestamp}`,
    source: "walkthrough" as const,
    timestamp: still.timestamp,
  }));
  return {
    id: existing?.id ?? uid(),
    name: draft.name,
    evidence: [...stills, ...walkthroughEvidence],
    walkthroughEvidence: draft.walkthroughEvidence,
    confidence: draft.confidence,
    plan: existing?.plan,
    items: checklist.map((category) => {
      const suggestion = draft.items.find((item) => item.category === category);
      const previous = previousByName.get(category);
      return {
        id: previous?.id ?? uid(),
        name: category,
        condition: suggestion?.condition ?? "unreviewed",
        note: suggestion?.note ?? "Not sufficiently visible in the walkthrough.",
        aiSuggestion: suggestion
          ? {
              source: "walkthrough-ai" as const,
              timestamp: suggestion.timestamp,
              confidence: suggestion.confidence,
              reviewed: false,
              evidenceId: stills.find((still) => still.timestamp === suggestion.timestamp)?.id,
            }
          : undefined,
      };
    }),
  };
}
export function applyWalkthroughDraft(inspection: Inspection, draft: WalkthroughDraft) {
  if (inspection.finalizedAt) throw new Error("This finalized inspection is locked.");
  if (!draft.rooms.length)
    throw new Error("The walkthrough analysis did not identify any rooms.");
  const existing = [...inspection.rooms];
  const matched = new Set<string>();
  const rooms = draft.rooms
    .sort((a, b) => a.order - b.order)
    .map((room) => {
      const target = normalizedName(room.name);
      const match = existing.find((candidate) => {
        if (matched.has(candidate.id)) return false;
        const name = normalizedName(candidate.name);
        return name === target || name.includes(target) || target.includes(name);
      });
      if (match) matched.add(match.id);
      return roomForDraft(room, match);
    });
  if (inspection.kind === "outgoing") {
    for (const untouched of existing.filter((room) => !matched.has(room.id))) {
      rooms.push({
        ...untouched,
        items: untouched.items.map((item) => ({
          ...item,
          condition: "unreviewed",
          note: "This room was not identified in the walkthrough. Review manually.",
          aiSuggestion: {
            source: "walkthrough-ai",
            timestamp: "00:00",
            confidence: "low",
            reviewed: false,
          },
        })),
      });
    }
  }
  inspection.rooms = rooms;
  inspection.signatures = [];
  inspection.analysis = {
    source: "walkthrough-ai",
    analyzedAt: new Date().toISOString(),
    summary: draft.summary,
    confidence: draft.confidence,
    coverageWarnings: draft.coverageWarnings,
    reviewRequired: true,
  };
}
export function progress(i: Inspection) {
  const items = i.rooms.flatMap((r) => r.items);
  const done = items.filter((x) => x.condition !== "unreviewed").length;
  return {
    done,
    total: items.length,
    percent: items.length ? Math.round((done / items.length) * 100) : 0,
    issues: items.filter((x) => x.condition === "attention").length,
  };
}
export function finalizationProblem(i: Inspection): string | undefined {
  if (!i.rooms.length || !progress(i).total)
    return "Add at least one room with condition items.";
  if (progress(i).done !== progress(i).total)
    return "Review every condition item before finalizing.";
  if (
    i.rooms
      .flatMap((room) => room.items)
      .some((item) => item.aiSuggestion && !item.aiSuggestion.reviewed)
  )
    return "Review and confirm every AI-suggested condition before finalizing.";
  if (!i.signatures.some((s) => s.role === "Inspector"))
    return "Add the inspector’s signature before finalizing.";
}
export function compare(i: Inspection, baseline?: Inspection) {
  return i.rooms.flatMap((room) =>
    room.items.map((item) => {
      const before = baseline?.rooms
        .find((r) => r.id === room.id)
        ?.items.find((x) => x.id === item.id);
      return {
        room: room.name,
        item: item.name,
        before,
        after: item,
        changed:
          !!before &&
          before.condition !== item.condition &&
          item.condition !== "unreviewed",
      };
    }),
  );
}
export const emptyDatabase = (): Database => ({ version: 1, properties: [] });
export function demoDatabase(): Database {
  const entry = newInspection("ingoing");
  entry.createdAt = "2026-01-15T10:00:00.000Z";
  entry.rooms.forEach((r) =>
    r.items.forEach((i) => {
      i.condition = "good";
    }),
  );
  entry.finalizedAt = entry.createdAt;
  entry.signatures = [
    {
      name: "Demo inspector",
      role: "Inspector",
      paths: ["M 10 65 Q 40 10 55 60 T 110 60 T 165 50"],
      signedAt: entry.createdAt,
    },
  ];
  const exit = newInspection("outgoing", entry);
  exit.rooms[0].items.forEach((i) => {
    i.condition = "good";
  });
  exit.rooms[0].items[0].condition = "attention";
  exit.rooms[0].items[0].note =
    "Example only: scuff beside the doorway. Add close-up evidence before reporting.";
  exit.rooms[1].items.forEach((i) => {
    i.condition = "good";
  });
  return {
    version: 1,
    properties: [
      {
        id: uid(),
        address: "24 Brunswick Street",
        suburb: "Fitzroy VIC · DEMO DATA",
        inspections: [exit, entry],
      },
    ],
  };
}
export function validateDatabase(value: unknown): Database {
  const db = value as Database;
  if (db?.version !== 1 || !Array.isArray(db.properties))
    throw new Error("Unsupported inspection data. Existing data was not overwritten.");
  for (const p of db.properties) {
    if (!p.id || typeof p.address !== "string" || !Array.isArray(p.inspections))
      throw new Error("Invalid property record.");
    for (const i of p.inspections) {
      if (
        !i.id ||
        !["ingoing", "outgoing"].includes(i.kind) ||
        !Array.isArray(i.rooms) ||
        !Array.isArray(i.signatures) ||
        (i.walkthroughs !== undefined && !Array.isArray(i.walkthroughs))
      )
        throw new Error("Invalid inspection record.");
      for (const r of i.rooms) {
        if (!r.id || !Array.isArray(r.items) || !Array.isArray(r.evidence))
          throw new Error("Invalid room record.");
        if (r.items.some((x) => !CONDITIONS.includes(x.condition)))
          throw new Error("Invalid condition record.");
      }
    }
  }
  return db;
}
