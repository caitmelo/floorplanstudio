import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions } from "expo-camera";
import {
  Button,
  C,
  Card,
  Field,
  Icon,
  SectionTitle,
  styles as s,
  Tag,
} from "./ui";
import {
  compare,
  applyPropertyScan,
  applyWalkthroughDraft,
  Condition,
  CONDITION_LABEL,
  Database,
  demoDatabase,
  emptyDatabase,
  Evidence,
  finalizationProblem,
  Inspection,
  newInspection,
  newRoom,
  progress,
  Property,
  Room,
  Signature,
  uid,
} from "./model";
import {
  fileURI,
  loadDatabase,
  retainPhoto,
  retainVideo,
  saveDatabase,
} from "./storage";
import { captureModule, nativeReady } from "./native";
import { exportFloorPlan, exportReport } from "./report";
import { planSVG } from "./geometry";
import FloorPlanView from "./FloorPlanView";
import * as Sharing from "expo-sharing";
import { File } from "expo-file-system";
import SignaturePad from "./SignaturePad";
import ExpoPanorama, { PanoramaViewer } from "./panorama/ExpoPanorama";
import LevelWalkthrough from "./LevelWalkthrough";
import { analyzeWalkthrough } from "./walkthroughAnalysis";

type Tab = "Overview" | "Rooms" | "Plan" | "Compare" | "Report";
type Sheet =
  | "panorama"
  | "walkthrough"
  | "originals"
  | "viewer"
  | "property"
  | "inspection"
  | "room"
  | "item"
  | "signature"
  | "photo"
  | "evidence"
  | "rename"
  | null;
export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}
function Main() {
  const [db, setDB] = useState<Database>(emptyDatabase()),
    ref = useRef(db),
    queue = useRef(Promise.resolve());
  const [loaded, setLoaded] = useState(false),
    [loadError, setLoadError] = useState(""),
    [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(""),
    [notice, setNotice] = useState("");
  const [propertyId, setPropertyId] = useState<string>(),
    [inspectionId, setInspectionId] = useState<string>(),
    [roomId, setRoomId] = useState<string>();
  const [tab, setTab] = useState<Tab>("Overview"),
    [sheet, setSheet] = useState<Sheet>(null);
  const [name, setName] = useState(""),
    [detail, setDetail] = useState(""),
    [condition, setCondition] = useState<Condition>("good"),
    [itemId, setItemId] = useState<string>();
  const [role, setRole] = useState<Signature["role"]>("Inspector"),
    [signature, setSignature] = useState<string[]>([]),
    [kind, setKind] = useState<Inspection["kind"]>("ingoing");
  const [evidence, setEvidence] = useState<Evidence>(),
    [permission, requestPermission] = useCameraPermissions();
  const [originals, setOriginals] = useState<string[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState<number>();
  const camera = useRef<CameraView>(null),
    [cameraReady, setCameraReady] = useState(false),
    busyRef = useRef(false);
  useEffect(() => {
    loadDatabase()
      .then((d) => {
        ref.current = d;
        setDB(d);
        setLoaded(true);
      })
      .catch((e) => setLoadError(String(e.message)));
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  const property = db.properties.find((p) => p.id === propertyId),
    inspection = property?.inspections.find((i) => i.id === inspectionId),
    room = inspection?.rooms.find((r) => r.id === roomId);
  const baseline = property?.inspections.find(
      (i) => i.id === inspection?.baselineId,
    ),
    locked = !!inspection?.finalizedAt,
    stats = inspection ? progress(inspection) : undefined;
  function commit(change: (d: Database) => void) {
    setSaving(true);
    const pending = queue.current.then(async () => {
      const next = JSON.parse(JSON.stringify(ref.current)) as Database;
      change(next);
      await saveDatabase(next);
      ref.current = next;
      setDB(next);
    });
    queue.current = pending.catch(() => {});
    return pending.finally(() => setSaving(false));
  }
  async function work(title: string, action: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(title);
    try {
      await action();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : String(e));
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  }
  function editInspection(change: (i: Inspection) => void) {
    return commit((d) => {
      const i = d.properties
        .find((p) => p.id === propertyId)
        ?.inspections.find((i) => i.id === inspectionId);
      if (!i || i.finalizedAt)
        throw new Error("This finalized inspection is locked.");
      i.signatures = [];
      change(i);
    });
  }
  function editRoom(change: (r: Room) => void) {
    return editInspection((i) => {
      const r = i.rooms.find((r) => r.id === roomId);
      if (!r) throw new Error("Room not found.");
      change(r);
    });
  }
  function closeSheet() {
    if (busy) return;
    if (sheet === "panorama" || sheet === "walkthrough") {
      Alert.alert(
        sheet === "panorama" ? "Leave panorama capture?" : "Leave level walkthrough?",
        sheet === "panorama"
          ? "A panorama is attached to the room only after you tap Save panorama to this room."
          : "The walkthrough is attached to the inspection only after you tap Complete level & attach.",
        [
          { text: "Keep capturing", style: "cancel" },
          {
            text: "Leave",
            style: "destructive",
            onPress: () => setSheet(null),
          },
        ],
      );
    } else setSheet(null);
  }
  function openSheet(next: Sheet) {
    setName("");
    setDetail("");
    setSignature([]);
    setSheet(next);
  }
  function selectInspection(p: Property, i: Inspection) {
    setPropertyId(p.id);
    setInspectionId(i.id);
    setRoomId(undefined);
    setTab("Overview");
  }
  function back() {
    if (roomId) setRoomId(undefined);
    else {
      setPropertyId(undefined);
      setInspectionId(undefined);
    }
  }
  async function createProperty() {
    const p: Property = {
      id: uid(),
      address: name.trim(),
      suburb: detail.trim(),
      inspections: [newInspection("ingoing")],
    };
    if (!p.address) throw new Error("Enter a property address.");
    await commit((d) => {
      d.properties.unshift(p);
    });
    setSheet(null);
    selectInspection(p, p.inspections[0]);
  }
  async function createInspection() {
    if (!property) return;
    const base = [...property.inspections]
      .filter((i) => i.kind === "ingoing" && i.finalizedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (kind === "outgoing" && !base)
      throw new Error(
        "Finalize an ingoing inspection first to establish the comparison baseline.",
      );
    const i = newInspection(kind, kind === "outgoing" ? base : undefined);
    await commit((d) => {
      d.properties.find((p) => p.id === property.id)!.inspections.unshift(i);
    });
    setSheet(null);
    selectInspection(property, i);
  }
  async function scan(mode: "plan" | "panorama") {
    if (mode === "panorama" && !captureModule) {
      if (Platform.OS !== "ios")
        throw new Error(
          "Open RoomRecord in Expo Go on your iPhone for 360° capture.",
        );
      setSheet("panorama");
      return;
    }
    if (!captureModule || !nativeReady())
      throw new Error(
        "LiDAR is not available in Expo Go. You can capture 360° panoramas, detail photos and inspection reports here.",
      );
    if (mode === "plan") {
      const plan = await captureModule.scanRoom();
      await editRoom((r) => {
        r.plan = plan;
      });
      setNotice("Room plan saved on this phone.");
    } else {
      const result = await captureModule.capturePanorama();
      await editRoom((r) => {
        r.evidence.push({
          ...result,
          id: uid(),
          kind: "panorama",
          caption: "Room panorama",
        });
      });
      setNotice("Panorama saved. Open it to review coverage and seams.");
    }
  }
  async function scanProperty() {
    if (!inspection || !captureModule || !nativeReady())
      throw new Error(
        "Whole-property scanning needs the installed iPhone build.",
      );
    const result = await captureModule.scanProperty(
      inspection.rooms.map(({ id, name }) => ({ id, name })),
    );
    await editInspection((i) => applyPropertyScan(i, result));
    setTab("Plan");
    setNotice(`Floor plan saved from ${result.rooms.length} room scans.`);
  }
  async function openCamera() {
    const p = permission?.granted ? permission : await requestPermission();
    if (!p.granted)
      throw new Error(
        "Camera access is required. Enable it in your device settings.",
      );
    setCameraReady(false);
    setDetail("");
    setSheet("photo");
  }
  async function takePhoto() {
    if (!cameraReady) return;
    const photo = await camera.current?.takePictureAsync({ quality: 0.9 });
    if (!photo) throw new Error("Photo capture failed. Please try again.");
    const path = await retainPhoto(photo.uri);
    await editRoom((r) => {
      r.evidence.push({
        id: uid(),
        kind: "photo",
        path,
        caption: detail.trim(),
        capturedAt: new Date().toISOString(),
      });
    });
    setSheet(null);
    setNotice("Photo saved.");
  }
  async function saveWalkthrough(capture: {
    uri: string;
    capturedAt: string;
    durationSeconds: number;
  }) {
    const path = await retainVideo(capture.uri);
    const walkthroughId = uid();
    await editInspection((i) => {
      i.walkthroughs = [
        ...(i.walkthroughs ?? []),
        {
          id: walkthroughId,
          path,
          capturedAt: capture.capturedAt,
          durationSeconds: capture.durationSeconds,
          status: "analyzing",
        },
      ];
    });
    if (!inspection || !property) return;
    setAnalysisProgress(0);
    const baselineText = baseline
      ? baseline.rooms
          .map(
            (room) =>
              `${room.name}: ${room.items
                .map(
                  (item) =>
                    `${item.name}=${CONDITION_LABEL[item.condition]}${item.note ? ` (${item.note})` : ""}`,
                )
                .join("; ")}`,
          )
          .join("\n")
      : "";
    try {
      const draft = await analyzeWalkthrough(
        fileURI(path),
        {
          kind: inspection.kind,
          property: `${property.address}${property.suburb ? `, ${property.suburb}` : ""}`,
          baseline: baselineText,
        },
        setAnalysisProgress,
      );
      await editInspection((i) => {
        applyWalkthroughDraft(i, draft);
        const walkthrough = i.walkthroughs?.find((item) => item.id === walkthroughId);
        if (walkthrough) {
          walkthrough.status = "analyzed";
          walkthrough.analyzedAt = new Date().toISOString();
          walkthrough.error = undefined;
        }
      });
      setSheet(null);
      setNotice("AI draft created. Review each suggested condition before signing.");
    } catch (error) {
      await editInspection((i) => {
        const walkthrough = i.walkthroughs?.find((item) => item.id === walkthroughId);
        if (walkthrough) {
          walkthrough.status = "failed";
          walkthrough.error = error instanceof Error ? error.message : String(error);
        }
      });
      throw error;
    } finally {
      setAnalysisProgress(undefined);
    }
  }
  async function addSignature() {
    if (!name.trim() || !signature.length)
      throw new Error("Enter your name and draw a signature.");
    await commit((d) => {
      const i = d.properties
        .find((p) => p.id === propertyId)
        ?.inspections.find((i) => i.id === inspectionId);
      if (!i || i.finalizedAt) throw new Error("This inspection is locked.");
      i.signatures = [
        ...i.signatures.filter((s) => s.role !== role),
        {
          name: name.trim(),
          role,
          paths: signature,
          signedAt: new Date().toISOString(),
        },
      ];
    });
    setSheet(null);
  }
  async function finalize() {
    if (!inspection) return;
    const problem = finalizationProblem(inspection);
    if (problem) throw new Error(problem);
    const yes =
      Platform.OS === "web"
        ? window.confirm(
            "Finalize this inspection? Its records will become read-only.",
          )
        : await new Promise<boolean>((resolve) =>
            Alert.alert(
              "Finalize inspection?",
              "Its records will become read-only. Export the report to retain a copy outside this phone.",
              [
                {
                  text: "Cancel",
                  style: "cancel",
                  onPress: () => resolve(false),
                },
                { text: "Finalize", onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) },
            ),
          );
    if (!yes) return;
    await commit((d) => {
      const i = d.properties
        .find((p) => p.id === propertyId)!
        .inspections.find((i) => i.id === inspectionId)!;
      const err = finalizationProblem(i);
      if (err) throw new Error(err);
      i.finalizedAt = new Date().toISOString();
    });
    setNotice("Inspection finalized.");
  }
  if (loadError)
    return (
      <SafeAreaView style={s.app}>
        <View style={s.content}>
          <Text style={s.title}>Your records need attention.</Text>
          <Text style={s.body}>{loadError}</Text>
          <Text style={s.body}>
            Existing data has not been overwritten. Close and reopen the app, or
            retain the app data for recovery.
          </Text>
        </View>
      </SafeAreaView>
    );
  if (!loaded)
    return (
      <SafeAreaView style={[s.app, { justifyContent: "center" }]}>
        <ActivityIndicator color={C.green} />
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={s.app} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <View style={l.header}>
        <View style={s.row}>
          {inspection ? (
            <Pressable
              accessibilityLabel="Go back"
              onPress={back}
              style={l.iconButton}
            >
              <Icon name="back" />
            </Pressable>
          ) : (
            <View style={l.logo}>
              <Icon name="scan" color="white" size={21} />
            </View>
          )}
          <Text style={l.wordmark}>
            roomrecord<Text style={{ color: "#90a17f" }}>.</Text>
          </Text>
        </View>
        <View style={s.row}>
          <View
            style={[l.dot, { backgroundColor: saving ? C.amber : C.green }]}
          />
          <Text style={{ color: C.muted, fontSize: 11 }}>
            {saving ? "Saving" : "On this phone · 0.4.0"}
          </Text>
        </View>
      </View>
      {!!notice && (
        <Pressable onPress={() => setNotice("")} style={l.notice}>
          <Text style={{ color: C.ink, flex: 1, fontSize: 13, lineHeight: 18 }}>
            {notice}
          </Text>
          <Icon name="close" size={16} />
        </Pressable>
      )}
      {!!busy && (
        <View style={l.busy}>
          <ActivityIndicator size="small" color={C.green} />
          <Text style={s.label}>{busy}</Text>
        </View>
      )}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.content}
      >
        {!inspection && (
          <>
            <View style={{ gap: 8 }}>
              <Text style={s.eyebrow}>
                PROPERTY INSPECTIONS, IN PERSPECTIVE
              </Text>
              <Text style={s.title}>Every room.{"\n"}The whole picture.</Text>
              <Text style={s.body}>
                Capture the condition. Keep the record.
              </Text>
            </View>
            <View style={l.hero}>
              <View style={{ flex: 1, gap: 13 }}>
                <View style={l.heroBadge}>
                  <Text
                    style={{
                      color: C.lime,
                      fontSize: 10,
                      fontWeight: "700",
                      letterSpacing: 1,
                    }}
                  >
                    PHONE-ONLY CAPTURE
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 24,
                    fontWeight: "500",
                    color: "white",
                    lineHeight: 29,
                  }}
                >
                  A clearer view{"\n"}of every property.
                </Text>
                <Text
                  style={{ color: "#b7cbbf", fontSize: 12, lineHeight: 18 }}
                >
                  360° capture + inspection reports
                </Text>
              </View>
              <View style={l.heroIllustration}>
                <Icon name="plan" size={85} color={C.lime} />
                <View style={l.scanBadge}>
                  <Icon name="scan" size={23} color={C.ink} />
                </View>
              </View>
            </View>
            <View style={l.stats}>
              <Stat value={String(db.properties.length)} label="Properties" />
              <Stat
                value={String(
                  db.properties
                    .flatMap((p) => p.inspections)
                    .filter((i) => !i.finalizedAt).length,
                )}
                label="In progress"
              />
              <Stat
                value={String(
                  db.properties
                    .flatMap((p) => p.inspections)
                    .filter((i) => i.finalizedAt).length,
                )}
                label="Finalized"
              />
            </View>
            <SectionTitle
              title="Your properties"
              right="+ Add property"
              onPress={() => openSheet("property")}
            />
            {!db.properties.length ? (
              <Card>
                <Icon name="home" size={30} />
                <Text style={s.h2}>Start with your first property</Text>
                <Text style={s.body}>
                  Add an address to start an ingoing inspection. Rooms and
                  checklists are ready to customize.
                </Text>
                <Button
                  title="Add a property"
                  icon="plus"
                  onPress={() => openSheet("property")}
                />
                <Button
                  secondary
                  title="Explore a sample inspection"
                  onPress={() =>
                    work("Loading sample…", async () => {
                      await commit((d) => {
                        d.properties.push(...demoDatabase().properties);
                      });
                    })
                  }
                />
              </Card>
            ) : (
              db.properties.map((p) => (
                <Card key={p.id}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => selectInspection(p, p.inspections[0])}
                    style={s.between}
                  >
                    <View style={[s.row, { flex: 1 }]}>
                      <View style={l.propertyIcon}>
                        <Icon name="home" />
                      </View>
                      <View style={{ flex: 1, gap: 5 }}>
                        <Text style={[s.h2, { fontSize: 17 }]}>
                          {p.address}
                        </Text>
                        <Text style={[s.body, { fontSize: 12 }]}>
                          {p.suburb || "Property record"}
                        </Text>
                      </View>
                    </View>
                    <Icon name="chevron" size={17} />
                  </Pressable>
                  <View style={s.divider} />
                  {p.inspections.slice(0, 3).map((i) => (
                    <Pressable
                      key={i.id}
                      accessibilityRole="button"
                      onPress={() => selectInspection(p, i)}
                      style={s.between}
                    >
                      <Text style={s.label}>
                        {i.kind === "ingoing" ? "Ingoing" : "Outgoing"} ·{" "}
                        {new Date(i.createdAt).toLocaleDateString()}
                      </Text>
                      <Tag
                        text={
                          i.finalizedAt
                            ? "Finalized"
                            : `${progress(i).percent}% reviewed`
                        }
                        amber={!i.finalizedAt}
                      />
                    </Pressable>
                  ))}
                  <Button
                    secondary
                    title="New inspection"
                    icon="plus"
                    onPress={() => {
                      setPropertyId(p.id);
                      setKind("outgoing");
                      openSheet("inspection");
                    }}
                  />
                </Card>
              ))
            )}
            <View style={[s.row, { alignItems: "flex-start" }]}>
              <Icon name="shield" color={C.muted} size={20} />
              <Text style={[s.body, { flex: 1, fontSize: 12 }]}>
                Inspection records stay on this device. Walkthrough videos are
                temporarily uploaded only when you request an AI draft, then the
                analysis upload is deleted. Export reports to retain a copy.
              </Text>
            </View>
          </>
        )}
        {!!inspection && !!property && !room && (
          <>
            <View style={{ gap: 9 }}>
              <View style={s.between}>
                <Text style={s.eyebrow}>
                  {inspection.kind.toUpperCase()} INSPECTION
                </Text>
                <Tag
                  text={locked ? "Finalized" : "In progress"}
                  amber={!locked}
                />
              </View>
              <Text style={s.title}>{property.address}</Text>
              <Text style={s.body}>
                {property.suburb} ·{" "}
                {new Date(inspection.createdAt).toLocaleDateString()}
              </Text>
            </View>
            {tab === "Overview" && (
              <>
                <Card
                  style={{ backgroundColor: "#eaf0e2", borderColor: "#dce5ce" }}
                >
                  <View style={s.between}>
                    <View>
                      <Text style={s.eyebrow}>INSPECTION PROGRESS</Text>
                      <Text style={[s.title, { marginTop: 6 }]}>
                        {stats!.percent}
                        <Text style={{ fontSize: 21 }}>%</Text>
                      </Text>
                    </View>
                    <View style={l.progressIcon}>
                      <Icon
                        name={locked ? "check" : "scan"}
                        size={38}
                        color={C.green}
                      />
                    </View>
                  </View>
                  <View style={l.track}>
                    <View style={[l.fill, { width: `${stats!.percent}%` }]} />
                  </View>
                  <Text style={s.body}>
                    {stats!.done} of {stats!.total} condition items reviewed
                  </Text>
                </Card>
                <View style={l.stats}>
                  <Stat value={String(inspection.rooms.length)} label="Rooms" />
                  <Stat
                    value={String(
                      inspection.rooms.flatMap((r) => r.evidence).length,
                    )}
                    label="Captures"
                  />
                  <Stat value={String(stats!.issues)} label="Need attention" />
                </View>
                <Card style={{ backgroundColor: "#eaf0e2", borderColor: "#dce5ce" }}>
                  <View style={s.between}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.eyebrow}>WHOLE-LEVEL EVIDENCE</Text>
                      <Text style={s.h2}>One continuous walkthrough</Text>
                    </View>
                    <Icon name="camera" color={C.green} size={28} />
                  </View>
                  <Text style={s.body}>
                    Record the entire level once. The video is uploaded for AI
                    analysis, then becomes a room-by-room draft that you review
                    before it can be signed or exported.
                  </Text>
                  {(inspection.walkthroughs ?? []).length ? (
                    <Text style={s.body}>
                      {(inspection.walkthroughs ?? []).length} walkthrough
                      {(inspection.walkthroughs ?? []).length === 1 ? "" : "s"}{" "}
                      · latest {new Date((inspection.walkthroughs ?? [])[0].capturedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {((inspection.walkthroughs ?? [])[0].status ?? "captured") === "analyzing" ? "analysing" : ((inspection.walkthroughs ?? [])[0].status ?? "captured")}
                    </Text>
                  ) : null}
                  {inspection.analysis && (
                    <View style={{ gap: 7 }}>
                      <Tag text={`AI DRAFT · ${inspection.analysis.confidence} confidence`} amber />
                      <Text style={s.body}>{inspection.analysis.summary}</Text>
                      {inspection.analysis.coverageWarnings.map((warning) => (
                        <Text key={warning} style={s.body}>• {warning}</Text>
                      ))}
                    </View>
                  )}
                  {!locked && (
                    <Button
                      title={inspection.analysis ? "Record & re-analyse walkthrough" : "Record & analyse walkthrough"}
                      icon="camera"
                      disabled={!!busy}
                      onPress={() =>
                        work("Opening walkthrough camera…", async () => {
                          setSheet("walkthrough");
                        })
                      }
                    />
                  )}
                </Card>
                <SectionTitle title="Next steps" />
                <Task
                  icon="check"
                  title="Review the AI draft"
                  body="Confirm every suggested condition and add detail photos where needed."
                  onPress={() => setTab("Rooms")}
                />
                <Task
                  icon="home"
                  title="Review each room"
                  body="Record condition and capture the details."
                  onPress={() => setTab("Rooms")}
                />
                <Task
                  icon="compare"
                  title="Compare entry and exit"
                  body={
                    baseline
                      ? "Your ingoing baseline is linked."
                      : "Comparison is available for outgoing inspections."
                  }
                  onPress={() => setTab("Compare")}
                />
                <Task
                  icon="report"
                  title="Review and export"
                  body="Sign the record and export a PDF."
                  onPress={() => setTab("Report")}
                />
                <Button
                  secondary
                  title="New inspection for this property"
                  icon="plus"
                  onPress={() => {
                    setKind("outgoing");
                    openSheet("inspection");
                  }}
                />
              </>
            )}
            {tab === "Plan" && (
              <>
                <SectionTitle title="Coverage and floor plan" />
                <Text style={s.body}>
                  A walkthrough video creates an inspection draft, not a measured
                  floor plan. It cannot reliably infer room dimensions, walls or
                  boundaries. Add a verified plan separately if your report needs
                  one.
                </Text>
                {inspection.propertyPlan ? (
                  <>
                    <FloorPlanView
                      plan={{
                        ...inspection.propertyPlan,
                        labels: inspection.propertyPlan.labels?.map(
                          (label) => ({
                            ...label,
                            name:
                              inspection.rooms.find(
                                (r) => r.id === label.roomId,
                              )?.name ?? label.name,
                          }),
                        ),
                      }}
                      name="Property"
                    />
                    <Text style={s.body}>
                      {inspection.propertyPlan.roomCount} scanned rooms ·
                      dimensions in metres. Verify critical measurements.
                    </Text>
                    {!!inspection.propertyPlan.exportWarning && (
                      <Text style={s.body}>
                        {inspection.propertyPlan.exportWarning}
                      </Text>
                    )}
                    <Button
                      secondary
                      title="Export property floor plan"
                      icon="plan"
                      onPress={() =>
                        work("Exporting floor plan…", () =>
                          exportFloorPlan(
                            planSVG(
                              {
                                ...inspection.propertyPlan!,
                                labels: inspection.propertyPlan!.labels?.map(
                                  (label) => ({
                                    ...label,
                                    name:
                                      inspection.rooms.find(
                                        (r) => r.id === label.roomId,
                                      )?.name ?? label.name,
                                  }),
                                ),
                              },
                              property.address,
                            ),
                          ),
                        )
                      }
                    />
                  </>
                ) : (
                  <Card>
                    <Icon name="camera" size={40} />
                    <Text style={s.h2}>Walkthrough coverage</Text>
                    <Text style={s.body}>
                      Record slowly through every room, open cupboards or areas
                      that matter, and capture detail photos for marks or damage.
                      The AI will mark anything it cannot clearly see as Not
                      reviewed rather than guessing.
                    </Text>
                  </Card>
                )}
              </>
            )}
            {tab === "Rooms" && (
              <>
                <SectionTitle
                  title="Room checklist"
                  right={locked ? undefined : "+ Add room"}
                  onPress={() => openSheet("room")}
                />
                {inspection.rooms.map((r, n) => {
                  const done = r.items.filter(
                    (i) => i.condition !== "unreviewed",
                  ).length;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={r.id}
                      onPress={() => setRoomId(r.id)}
                    >
                      <Card>
                        <View style={s.between}>
                          <View style={[s.row, { flex: 1 }]}>
                            <View style={l.roomNumber}>
                              <Text
                                style={{
                                  color: C.green,
                                  fontSize: 13,
                                  fontWeight: "600",
                                }}
                              >
                                {String(n + 1).padStart(2, "0")}
                              </Text>
                            </View>
                            <View style={{ gap: 5, flex: 1 }}>
                              <Text style={s.h2}>{r.name}</Text>
                              <Text style={[s.body, { fontSize: 12 }]}>
                                {done}/{r.items.length} reviewed ·{" "}
                                {r.evidence.length} captures
                              </Text>
                            </View>
                          </View>
                          <Icon
                            name={done === r.items.length ? "check" : "chevron"}
                            color={done === r.items.length ? C.green : C.muted}
                          />
                        </View>
                        <View style={s.row}>
                          {r.plan && <Tag text="LiDAR plan" />}
                          {r.evidence.some((e) => e.kind === "panorama") && (
                            <Tag text="360° panorama" />
                          )}
                          {r.items.some((i) => i.condition === "attention") && (
                            <Tag text="Needs attention" amber />
                          )}
                        </View>
                      </Card>
                    </Pressable>
                  );
                })}
              </>
            )}
            {tab === "Compare" && (
              <>
                <SectionTitle title="Ingoing → outgoing" />
                {!baseline ? (
                  <Card>
                    <Icon name="compare" size={32} />
                    <Text style={s.h2}>A baseline comes first</Text>
                    <Text style={s.body}>
                      Finish and finalize an ingoing inspection. Create an
                      outgoing inspection for the same property to compare
                      matching rooms and items.
                    </Text>
                  </Card>
                ) : (
                  <>
                    <Text style={s.body}>
                      Compared with{" "}
                      {new Date(baseline.createdAt).toLocaleDateString()}.
                      Condition changes are observations for review.
                    </Text>
                    {inspection.rooms.map((r) => (
                      <Card key={r.id}>
                        <Text style={s.h2}>{r.name}</Text>
                        {r.items.map((item) => {
                          const before = baseline.rooms
                            .find((b) => b.id === r.id)
                            ?.items.find((i) => i.id === item.id);
                          return (
                            <View key={item.id} style={{ gap: 7 }}>
                              <Text style={s.label}>{item.name}</Text>
                              <View style={s.between}>
                                <Text style={[s.body, { flex: 1 }]}>
                                  {before
                                    ? CONDITION_LABEL[before.condition]
                                    : "No baseline"}
                                </Text>
                                <Icon name="arrow" size={16} color={C.muted} />
                                <View
                                  style={{ flex: 1, alignItems: "flex-end" }}
                                >
                                  <Tag
                                    text={CONDITION_LABEL[item.condition]}
                                    amber={
                                      !!before &&
                                      before.condition !== item.condition &&
                                      item.condition !== "unreviewed"
                                    }
                                  />
                                </View>
                              </View>
                              {item.note ? (
                                <Text style={s.body}>{item.note}</Text>
                              ) : null}
                            </View>
                          );
                        })}
                        <View style={s.divider} />
                        <View style={s.row}>
                          {[baseline.rooms.find((b) => b.id === r.id), r].map(
                            (version, n) => (
                              <View key={n} style={{ flex: 1, gap: 7 }}>
                                <Text style={s.eyebrow}>
                                  {n ? "OUTGOING" : "INGOING"}
                                </Text>
                                {version?.evidence[0] ? (
                                  <Pressable
                                    onPress={() => {
                                      setEvidence(version.evidence[0]);
                                      setSheet("evidence");
                                    }}
                                  >
                                    <Image
                                      source={{
                                        uri: fileURI(version.evidence[0].path),
                                      }}
                                      style={{ height: 95, borderRadius: 10 }}
                                    />
                                  </Pressable>
                                ) : (
                                  <Text style={s.body}>No image</Text>
                                )}
                              </View>
                            ),
                          )}
                        </View>
                      </Card>
                    ))}
                  </>
                )}
              </>
            )}
            {tab === "Report" && (
              <>
                <Card>
                  <View style={s.row}>
                    <View style={l.propertyIcon}>
                      <Icon name="report" />
                    </View>
                    <View>
                      <Text style={s.h2}>Condition report</Text>
                      <Text style={s.body}>
                        {locked
                          ? "Finalized record"
                          : "Draft · review before signing"}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.body}>
                    Includes condition items, notes, captured photos and recorded
                    signatures. AI walkthrough suggestions remain a draft until you
                    open and save each item after review.
                  </Text>
                  <Button
                    title="Export PDF report"
                    icon="report"
                    disabled={!!busy}
                    onPress={() =>
                      work("Preparing PDF…", () =>
                        exportReport(property, inspection),
                      )
                    }
                  />
                </Card>
                <SectionTitle
                  title="Signatures"
                  right={locked ? undefined : "+ Add signature"}
                  onPress={() => openSheet("signature")}
                />
                {!inspection.signatures.length && (
                  <Text style={s.body}>
                    No signatures yet. Any later edits clear signatures so the
                    report can be signed again.
                  </Text>
                )}
                {inspection.signatures.map((sig) => (
                  <Card key={sig.role}>
                    <View style={s.between}>
                      <View>
                        <Text style={s.h2}>{sig.name}</Text>
                        <Text style={s.body}>
                          {sig.role} ·{" "}
                          {new Date(sig.signedAt).toLocaleDateString()}
                        </Text>
                      </View>
                      <Icon name="check" color={C.green} />
                    </View>
                  </Card>
                ))}
                {!locked && (
                  <>
                    <Text style={s.body}>
                      Finalizing makes the inspection read-only. Every condition
                      item must be reviewed and an inspector signature recorded.
                    </Text>
                    <Button
                      title="Finalize inspection"
                      icon="shield"
                      disabled={!!busy}
                      onPress={() => work("Finalizing…", finalize)}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
        {!!room && !!inspection && (
          <>
            <View style={{ gap: 8 }}>
              <View style={s.between}>
                <Text style={s.eyebrow}>
                  {inspection.kind.toUpperCase()} / ROOM RECORD
                </Text>
                {locked && <Tag text="Read-only" />}
              </View>
              <View style={s.between}>
                <Text style={[s.title, { flex: 1 }]}>{room.name}</Text>
                {!locked && (
                  <Pressable
                    accessibilityLabel="Rename room"
                    onPress={() => {
                      setName(room.name);
                      setSheet("rename");
                    }}
                  >
                    <Icon name="edit" />
                  </Pressable>
                )}
              </View>
              <Text style={s.body}>
                Capture the whole room, then the details.
              </Text>
            </View>
            {!locked && (
              <View style={s.row}>
                <Pressable
                  accessibilityRole="button"
                  style={l.captureTile}
                  onPress={() =>
                    work("Opening panorama…", () => scan("panorama"))
                  }
                >
                  <Icon name="globe" color={C.green} size={28} />
                  <Text style={s.label}>360° panorama</Text>
                  <Text style={l.small}>Guided phone capture</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={l.captureTile}
                  onPress={() => work("Opening LiDAR…", () => scan("plan"))}
                >
                  <Icon name="scan" color={C.green} size={28} />
                  <Text style={s.label}>
                    {room.plan ? "Rescan room" : "Scan room"}
                  </Text>
                  <Text style={l.small}>
                    {nativeReady()
                      ? "LiDAR floor plan"
                      : "Not available in Expo Go"}
                  </Text>
                </Pressable>
              </View>
            )}
            <SectionTitle title="Condition checklist" />
            <Card>
              {room.items.map((item, n) => (
                <React.Fragment key={item.id}>
                  {n > 0 && <View style={s.divider} />}
                  <Pressable
                    disabled={locked}
                    accessibilityRole="button"
                    onPress={() => {
                      setItemId(item.id);
                      setName(item.name);
                      setDetail(item.note);
                      setCondition(item.condition);
                      setSheet("item");
                    }}
                    style={{ gap: 9 }}
                  >
                    <View style={s.between}>
                      <Text style={[s.label, { flex: 1, fontSize: 14 }]}>
                        {item.name}
                      </Text>
                      <Tag
                        text={CONDITION_LABEL[item.condition]}
                        amber={
                          item.condition === "attention" ||
                          item.condition === "unreviewed"
                        }
                      />
                    </View>
                    {!!item.note && <Text style={s.body}>{item.note}</Text>}
                  </Pressable>
                </React.Fragment>
              ))}
            </Card>
            <SectionTitle
              title="Room evidence"
              right={locked ? undefined : "+ Take photo"}
              onPress={() => work("Opening camera…", openCamera)}
            />
            {!room.evidence.length ? (
              <Card>
                <View style={s.row}>
                  <Icon name="camera" color={C.muted} />
                  <Text style={[s.body, { flex: 1 }]}>
                    Add a panorama for context and close-ups for marks, wear or
                    damage.
                  </Text>
                </View>
                {!locked && (
                  <Button
                    secondary
                    title="Take a detail photo"
                    icon="camera"
                    onPress={() => work("Opening camera…", openCamera)}
                  />
                )}
              </Card>
            ) : (
              <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
                {room.evidence.map((e) => (
                  <Pressable
                    key={e.id}
                    accessibilityLabel={e.caption || "Open evidence"}
                    onPress={() => {
                      setEvidence(e);
                      setDetail(e.caption);
                      setSheet("evidence");
                    }}
                    style={{ width: "47%", gap: 8 }}
                  >
                    <Image
                      source={{ uri: fileURI(e.path) }}
                      style={{
                        height: 125,
                        borderRadius: 13,
                        backgroundColor: C.line,
                      }}
                    />
                    <Text style={s.label}>
                      {e.kind === "panorama"
                        ? "360° panorama"
                        : e.caption || "Detail photo"}
                    </Text>
                    <Text style={l.small}>
                      {new Date(e.capturedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
            <SectionTitle title="Floor plan" />
            {room.plan ? (
              <>
                <FloorPlanView plan={room.plan} name={room.name} />
                <Text style={s.body}>
                  Scan-derived dimensions. Verify critical measurements. Each
                  room uses its own scan coordinates.
                </Text>
                <Button
                  secondary
                  title="Export room plan (SVG)"
                  icon="plan"
                  onPress={() =>
                    work("Exporting plan…", () =>
                      exportFloorPlan(planSVG(room.plan!, room.name)),
                    )
                  }
                />
              </>
            ) : (
              <Card>
                <Icon name="plan" color={C.muted} size={30} />
                <Text style={s.body}>
                  Scan the room to generate a measured outline with walls, doors
                  and windows.
                </Text>
              </Card>
            )}
          </>
        )}
      </ScrollView>
      {!!inspection && !room && (
        <View style={l.nav}>
          {(["Overview", "Rooms", "Plan", "Compare", "Report"] as Tab[]).map(
            (t, n) => (
              <Pressable
                key={t}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t }}
                onPress={() => setTab(t)}
                style={l.navItem}
              >
                <Icon
                  name={["home", "home", "plan", "compare", "report"][n]}
                  color={tab === t ? C.green : C.muted}
                />
                <Text
                  style={{
                    fontSize: 10,
                    color: tab === t ? C.green : C.muted,
                    fontWeight: tab === t ? "700" : "400",
                  }}
                >
                  {t}
                </Text>
              </Pressable>
            ),
          )}
        </View>
      )}
      <Modal
        visible={!!sheet}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeSheet}
      >
        <SafeAreaView style={s.app}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={{ flex: 1 }}
          >
            <View style={l.header}>
              <Text style={[s.h2, { flex: 1 }]}>
                {
                  (
                    {
                      property: "Add property",
                      inspection: "New inspection",
                      room: "Add room",
                      rename: "Room name",
                      item: name,
                      signature: "Sign inspection",
                      photo: "Detail photo",
                      panorama: "Capture 360°",
                      walkthrough: "Full-level walkthrough",
                      viewer: "Explore 360°",
                      originals: "Original capture photos",
                      evidence: "Room evidence",
                    } as Record<string, string>
                  )[sheet || ""]
                }
              </Text>
              <Pressable
                accessibilityLabel="Close capture"
                accessibilityHint="Exit this screen without saving a capture"
                disabled={!!busy}
                onPress={closeSheet}
                hitSlop={12}
                style={l.closeButton}
              >
                <Icon name="close" />
                <Text style={l.closeText}>Close</Text>
              </Pressable>
            </View>
            {!!notice && <Text style={l.modalNotice}>{notice}</Text>}
            {sheet === "panorama" ? (
              <ExpoPanorama
                onSave={async (result) => {
                  await editRoom((r) => {
                    r.evidence.push({
                      ...result,
                      id: uid(),
                      kind: "panorama",
                      caption: "Room panorama",
                    });
                  });
                  setSheet(null);
                  setNotice("Panorama saved to this room.");
                }}
                onCancel={() => setSheet(null)}
              />
            ) : sheet === "walkthrough" ? (
              <LevelWalkthrough
                onSave={saveWalkthrough}
                onCancel={() => setSheet(null)}
                analysisProgress={analysisProgress}
              />
            ) : sheet === "viewer" && evidence ? (
              <PanoramaViewer path={evidence.path} />
            ) : sheet === "photo" ? (
              <View style={{ flex: 1, gap: 12, padding: 18 }}>
                <View
                  style={{
                    flex: 1,
                    borderRadius: 20,
                    overflow: "hidden",
                    backgroundColor: "#111",
                  }}
                >
                  <CameraView
                    ref={camera}
                    facing="back"
                    style={{ flex: 1 }}
                    onCameraReady={() => setCameraReady(true)}
                    onMountError={(e) => setNotice(e.message)}
                  />
                </View>
                <Field
                  label="Caption"
                  value={detail}
                  onChangeText={setDetail}
                  placeholder="What does this photo show?"
                />
                <Button
                  title={busy ? "Saving photo…" : "Take photo"}
                  icon="camera"
                  disabled={!cameraReady || !!busy}
                  onPress={() => work("Saving photo…", takePhoto)}
                />
              </View>
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={s.content}
              >
                {sheet === "property" && (
                  <>
                    <Field
                      label="Property address"
                      value={name}
                      onChangeText={setName}
                      placeholder="e.g. 24 Brunswick Street"
                    />
                    <Field
                      label="Suburb / postcode"
                      value={detail}
                      onChangeText={setDetail}
                      placeholder="e.g. Fitzroy VIC 3065"
                    />
                    <Text style={s.body}>
                      An ingoing inspection will be created with four starter
                      rooms.
                    </Text>
                    <Button
                      title="Create property"
                      disabled={!!busy || !name.trim()}
                      onPress={() => work("Creating property…", createProperty)}
                    />
                  </>
                )}
                {sheet === "inspection" && (
                  <>
                    <Text style={s.body}>{property?.address}</Text>
                    {(["ingoing", "outgoing"] as const).map((k) => (
                      <Button
                        key={k}
                        secondary={kind !== k}
                        title={
                          k === "ingoing"
                            ? "Ingoing inspection"
                            : "Outgoing inspection"
                        }
                        onPress={() => setKind(k)}
                      />
                    ))}
                    <Text style={s.body}>
                      {kind === "outgoing"
                        ? "The AI will use the latest finalized ingoing inspection as a reference, then flag only clearly visible differences for your review."
                        : "Record one walkthrough and let the AI create a reviewable condition draft."}
                    </Text>
                    <Button
                      title="Start inspection"
                      disabled={!!busy}
                      onPress={() =>
                        work("Creating inspection…", createInspection)
                      }
                    />
                  </>
                )}
                {(sheet === "room" || sheet === "rename") && (
                  <>
                    <Field
                      label="Room name"
                      value={name}
                      onChangeText={setName}
                      placeholder="e.g. Bedroom 2"
                    />
                    <Button
                      title="Save room"
                      disabled={!!busy || !name.trim()}
                      onPress={() =>
                        work("Saving room…", async () => {
                          if (sheet === "rename")
                            await editRoom((r) => {
                              r.name = name.trim();
                            });
                          else
                            await editInspection((i) => {
                              i.rooms.push(newRoom(name.trim()));
                            });
                          setSheet(null);
                        })
                      }
                    />
                  </>
                )}
                {sheet === "item" && (
                  <>
                    <Text style={s.body}>
                      {itemId && room?.items.find((item) => item.id === itemId)?.aiSuggestion
                        ? `AI suggestion from ${room.items.find((item) => item.id === itemId)?.aiSuggestion?.timestamp} · ${room.items.find((item) => item.id === itemId)?.aiSuggestion?.confidence} confidence. Confirm or correct it from the walkthrough before saving.`
                        : "Record the condition you can observe."}
                    </Text>
                    <View style={{ gap: 9 }}>
                      {(
                        [
                          "good",
                          "fair",
                          "attention",
                          "na",
                          "unreviewed",
                        ] as Condition[]
                      ).map((c) => (
                        <Button
                          key={c}
                          title={CONDITION_LABEL[c]}
                          secondary={condition !== c}
                          onPress={() => setCondition(c)}
                        />
                      ))}
                    </View>
                    <Field
                      label="Notes"
                      value={detail}
                      onChangeText={setDetail}
                      multiline
                      placeholder="Describe location, condition and any follow-up."
                    />
                    <Button
                      title="Save condition"
                      disabled={!!busy}
                      onPress={() =>
                        work("Saving condition…", async () => {
                          await editRoom((r) => {
                            const i = r.items.find((i) => i.id === itemId)!;
                            i.condition = condition;
                            i.note = detail.trim();
                            if (i.aiSuggestion) i.aiSuggestion.reviewed = true;
                          });
                          setSheet(null);
                        })
                      }
                    />
                  </>
                )}
                {sheet === "signature" && (
                  <>
                    <Field
                      label="Full name"
                      value={name}
                      onChangeText={setName}
                    />
                    <View style={s.row}>
                      {(["Inspector", "Tenant"] as const).map((r) => (
                        <View key={r} style={{ flex: 1 }}>
                          <Button
                            title={r}
                            secondary={role !== r}
                            onPress={() => setRole(r)}
                          />
                        </View>
                      ))}
                    </View>
                    <SignaturePad onChange={setSignature} />
                    <Text style={s.body}>
                      I confirm that I have reviewed this inspection record.
                      This signature records my review and does not assign
                      liability.
                    </Text>
                    <Button
                      title="Save signature"
                      disabled={!!busy || !signature.length || !name.trim()}
                      onPress={() => work("Saving signature…", addSignature)}
                    />
                  </>
                )}
                {sheet === "originals" &&
                  originals.map((path, i) => (
                    <View key={path} style={{ gap: 8 }}>
                      <Text style={s.label}>View {i + 1}</Text>
                      <Image
                        source={{ uri: fileURI(path) }}
                        resizeMode="contain"
                        style={{ width: "100%", height: 380 }}
                      />
                    </View>
                  ))}
                {sheet === "evidence" && evidence && (
                  <>
                    <Image
                      source={{ uri: fileURI(evidence.path) }}
                      resizeMode="contain"
                      style={{
                        width: "100%",
                        height: 280,
                        backgroundColor: "#e7ece2",
                        borderRadius: 15,
                      }}
                    />
                    <Text style={s.body}>
                      {new Date(evidence.capturedAt).toLocaleString()}
                    </Text>
                    {evidence.kind === "panorama" && (
                      <>
                        <Tag
                          text={`Coverage ${((evidence.coverage ?? 0) * 100).toFixed(1)}%`}
                          amber={(evidence.coverage ?? 0) < 0.99}
                        />
                        <Text style={s.body}>
                          Review seams and uncaptured black regions. Close-up
                          photos are best for assessing small marks.
                        </Text>
                        {evidence.qualityFlags?.map((flag) => (
                          <Text key={flag} style={s.body}>
                            {flag}
                          </Text>
                        ))}
                        <Button
                          title="Share panorama JPEG"
                          onPress={() =>
                            work("Sharing panorama…", async () => {
                              await Sharing.shareAsync(fileURI(evidence.path), {
                                mimeType: "image/jpeg",
                                UTI: "public.jpeg",
                              });
                            })
                          }
                        />
                        {evidence.sourceDirectory?.startsWith(
                          "captures/expo-",
                        ) && (
                          <Button
                            title="Review original photos"
                            secondary
                            onPress={() =>
                              work("Opening originals…", async () => {
                                const manifest = JSON.parse(
                                  await new File(
                                    fileURI(
                                      evidence.sourceDirectory +
                                        "/manifest.json",
                                    ),
                                  ).text(),
                                );
                                setOriginals(
                                  manifest.frames.map(
                                    (f: { path: string }) => f.path,
                                  ),
                                );
                                setSheet("originals");
                              })
                            }
                          />
                        )}

                        <Button
                          title="Explore 360° view"
                          icon="globe"
                          onPress={() =>
                            work("Opening viewer…", async () => {
                              if (captureModule)
                                await captureModule.viewPanorama(evidence.path);
                              else setSheet("viewer");
                            })
                          }
                        />
                      </>
                    )}
                    {room &&
                    !locked &&
                    room.evidence.some((e) => e.id === evidence.id) ? (
                      <>
                        <Field
                          label="Caption"
                          value={detail}
                          onChangeText={setDetail}
                          multiline
                        />
                        <Button
                          title="Save caption"
                          disabled={!!busy}
                          onPress={() =>
                            work("Saving caption…", async () => {
                              await editRoom((r) => {
                                r.evidence.find(
                                  (e) => e.id === evidence.id,
                                )!.caption = detail.trim();
                              });
                              setSheet(null);
                            })
                          }
                        />
                      </>
                    ) : (
                      <Text style={s.body}>{evidence.caption}</Text>
                    )}
                  </>
                )}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}
function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ fontSize: 26, fontWeight: "500", color: C.ink }}>
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: C.muted }}>{label}</Text>
    </View>
  );
}
function Task({
  icon,
  title,
  body,
  onPress,
}: {
  icon: string;
  title: string;
  body: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress}>
      <Card>
        <View style={s.row}>
          <View style={l.propertyIcon}>
            <Icon name={icon} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.label}>{title}</Text>
            <Text style={[s.body, { fontSize: 12 }]}>{body}</Text>
          </View>
          <Icon name="chevron" size={16} />
        </View>
      </Card>
    </Pressable>
  );
}
const l = StyleSheet.create({
  header: {
    minHeight: 65,
    paddingHorizontal: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  wordmark: {
    fontSize: 21,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -0.8,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { height: 5, width: 5, borderRadius: 5 },
  iconButton: { padding: 8 },
  closeButton: {
    minHeight: 46,
    minWidth: 76,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: "#edf2e6",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  closeText: { fontSize: 12, fontWeight: "700", color: C.ink },
  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    backgroundColor: "#e6efd9",
    alignItems: "center",
  },
  modalNotice: {
    padding: 15,
    backgroundColor: "#f8e8d5",
    color: C.ink,
    fontSize: 13,
  },
  busy: {
    padding: 9,
    gap: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#eaf1e4",
  },
  hero: {
    backgroundColor: C.ink,
    padding: 22,
    borderRadius: 21,
    flexDirection: "row",
    minHeight: 220,
    overflow: "hidden",
  },
  heroBadge: {
    borderColor: "#4b6e5d",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    alignSelf: "flex-start",
  },
  heroIllustration: {
    justifyContent: "center",
    alignItems: "center",
    width: 94,
    transform: [{ rotate: "-12deg" }],
  },
  scanBadge: {
    position: "absolute",
    bottom: 16,
    right: -5,
    backgroundColor: C.lime,
    padding: 11,
    borderRadius: 15,
  },
  stats: { flexDirection: "row", paddingVertical: 10, gap: 10 },
  propertyIcon: {
    width: 43,
    height: 43,
    backgroundColor: "#eef2e8",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  roomNumber: {
    width: 42,
    height: 42,
    backgroundColor: "#edf3e6",
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  progressIcon: {
    backgroundColor: "#dde8ce",
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  track: { height: 5, backgroundColor: "#d4dfc9", borderRadius: 6 },
  fill: { backgroundColor: C.green, height: 5, borderRadius: 6 },
  nav: {
    flexDirection: "row",
    paddingTop: 12,
    paddingBottom: 7,
    borderTopWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
  },
  navItem: { flex: 1, alignItems: "center", gap: 5, minHeight: 43 },
  captureTile: {
    flex: 1,
    backgroundColor: "#edf2e6",
    padding: 17,
    gap: 10,
    borderRadius: 17,
    minHeight: 132,
  },
  small: { color: C.muted, fontSize: 11, lineHeight: 16 },
});
