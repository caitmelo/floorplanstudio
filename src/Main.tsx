import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Sharing from "expo-sharing";
import { exportReport } from "./report";
import GuidedCapture, { WalkthroughCapture } from "./GuidedCapture";
import {
  applyWalkthroughDraft,
  Condition,
  CONDITION_LABEL,
  Database,
  emptyDatabase,
  Inspection,
  newInspection,
  Property,
  Room,
  uid,
} from "./model";
import { fileURI, loadDatabase, retainPhoto, retainVideo, saveDatabase } from "./storage";
import { analyzeWalkthrough } from "./walkthroughAnalysis";
import { Icon } from "./ui";
import DetailCapture from "./DetailCapture";

type Screen = "home" | "capture" | "processing" | "ready" | "report" | "room" | "item" | "details" | "history" | "photo";
type AnalysisPhase = "Uploading your walkthrough" | "Reviewing the rooms" | "Finding condition evidence" | "Preparing your report";

const conditionTone: Record<Condition, { fill: string; text: string }> = {
  good: { fill: "#e4f7d5", text: "#317348" },
  fair: { fill: "#fff0cc", text: "#9c681a" },
  attention: { fill: "#ffe1da", text: "#a34736" },
  unreviewed: { fill: "#eef1ee", text: "#69766f" },
  na: { fill: "#e9efec", text: "#567063" },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <RoomRecord />
    </SafeAreaProvider>
  );
}

function RoomRecord() {
  const [db, setDB] = useState<Database>(emptyDatabase());
  const dbRef = useRef(db);
  const saveQueue = useRef(Promise.resolve());
  const [loaded, setLoaded] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [propertyId, setPropertyId] = useState<string>();
  const [inspectionId, setInspectionId] = useState<string>();
  const [roomId, setRoomId] = useState<string>();
  const [itemId, setItemId] = useState<string>();
  const [phase, setPhase] = useState<AnalysisPhase>("Uploading your walkthrough");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [address, setAddress] = useState("");
  const [suburb, setSuburb] = useState("");
  const [inspectionKind, setInspectionKind] = useState<Inspection["kind"]>("ingoing");
  const [itemNote, setItemNote] = useState("");
  const [itemCondition, setItemCondition] = useState<Condition>("unreviewed");

  useEffect(() => {
    loadDatabase()
      .then((value) => {
        dbRef.current = value;
        setDB(value);
        setLoaded(true);
      })
      .catch((error) => {
        setNotice(error instanceof Error ? error.message : "Your saved reports could not be opened.");
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);

  const property = db.properties.find((candidate) => candidate.id === propertyId);
  const inspection = property?.inspections.find((candidate) => candidate.id === inspectionId);
  const room = inspection?.rooms.find((candidate) => candidate.id === roomId);
  const item = room?.items.find((candidate) => candidate.id === itemId);

  function commit(change: (next: Database) => void) {
    setSaving(true);
    const pending = saveQueue.current.then(async () => {
      const next = JSON.parse(JSON.stringify(dbRef.current)) as Database;
      change(next);
      await saveDatabase(next);
      dbRef.current = next;
      setDB(next);
    });
    saveQueue.current = pending.catch(() => undefined);
    return pending.finally(() => setSaving(false));
  }

  function editInspection(change: (value: Inspection) => void) {
    return commit((next) => {
      const target = next.properties
        .find((candidate) => candidate.id === propertyId)
        ?.inspections.find((candidate) => candidate.id === inspectionId);
      if (!target) throw new Error("This inspection no longer exists.");
      change(target);
    });
  }

  async function startScan() {
    const nextInspection = newInspection("ingoing");
    const nextProperty: Property = {
      id: uid(),
      address: "New inspection",
      suburb: "",
      inspections: [nextInspection],
    };
    await commit((next) => next.properties.unshift(nextProperty));
    setPropertyId(nextProperty.id);
    setInspectionId(nextInspection.id);
    setRoomId(undefined);
    setItemId(undefined);
    setUploadProgress(0);
    setScreen("capture");
  }

  async function receiveWalkthrough(capture: WalkthroughCapture) {
    if (!propertyId || !inspectionId) throw new Error("Start a new inspection before recording.");
    setScreen("processing");
    setPhase("Uploading your walkthrough");
    setUploadProgress(0);
    const localPath = await retainVideo(capture.uri);
    const walkthroughId = uid();
    await editInspection((value) => {
      value.walkthroughs = [
        {
          id: walkthroughId,
          path: localPath,
          capturedAt: capture.capturedAt,
          durationSeconds: capture.durationSeconds,
          coverage: capture.coverage,
          status: "analyzing",
        },
        ...(value.walkthroughs ?? []),
      ];
    });
    const snapshot = dbRef.current;
    const sourceProperty = snapshot.properties.find((candidate) => candidate.id === propertyId);
    const sourceInspection = sourceProperty?.inspections.find((candidate) => candidate.id === inspectionId);
    if (!sourceProperty || !sourceInspection) throw new Error("The recording could not be linked to an inspection.");
    const baseline = sourceProperty.inspections.find((candidate) => candidate.id === sourceInspection.baselineId);
    const baselineText = baseline
      ? baseline.rooms
          .map(
            (baselineRoom) =>
              `${baselineRoom.name}: ${baselineRoom.items
                .map((baselineItem) => `${baselineItem.name}=${CONDITION_LABEL[baselineItem.condition]}${baselineItem.note ? ` (${baselineItem.note})` : ""}`)
                .join("; ")}`,
          )
          .join("\n")
      : "";
    try {
      const draft = await analyzeWalkthrough(
        fileURI(localPath),
        {
          kind: sourceInspection.kind,
          property: sourceProperty.address,
          baseline: baselineText,
        },
        (fraction) => {
          setUploadProgress(fraction);
          if (fraction >= 0.98) setPhase("Reviewing the rooms");
        },
      );
      setPhase("Preparing your report");
      await editInspection((value) => {
        applyWalkthroughDraft(value, draft);
        const saved = value.walkthroughs?.find((candidate) => candidate.id === walkthroughId);
        if (saved) {
          saved.status = "analyzed";
          saved.analyzedAt = new Date().toISOString();
          saved.error = undefined;
        }
      });
      setScreen("ready");
    } catch (error) {
      await editInspection((value) => {
        const saved = value.walkthroughs?.find((candidate) => candidate.id === walkthroughId);
        if (saved) {
          saved.status = "failed";
          saved.error = error instanceof Error ? error.message : String(error);
        }
      });
      setNotice(error instanceof Error ? error.message : "Your recording could not be analysed.");
      setScreen("ready");
    }
  }

  function openReport(nextProperty: Property, nextInspection: Inspection) {
    setPropertyId(nextProperty.id);
    setInspectionId(nextInspection.id);
    setRoomId(undefined);
    setItemId(undefined);
    setScreen("report");
  }

  function openDetails() {
    if (!property || !inspection) return;
    setAddress(property.address === "New inspection" ? "" : property.address);
    setSuburb(property.suburb);
    setInspectionKind(inspection.kind);
    setScreen("details");
  }

  async function saveDetails() {
    if (!address.trim()) {
      setNotice("Add the property address before saving the report.");
      return;
    }
    await commit((next) => {
      const targetProperty = next.properties.find((candidate) => candidate.id === propertyId);
      const targetInspection = targetProperty?.inspections.find((candidate) => candidate.id === inspectionId);
      if (!targetProperty || !targetInspection) throw new Error("This report could not be found.");
      targetProperty.address = address.trim();
      targetProperty.suburb = suburb.trim();
      targetInspection.kind = inspectionKind;
    });
    setScreen("report");
  }

  function openRoom(nextRoom: Room) {
    setRoomId(nextRoom.id);
    setScreen("room");
  }

  function openItem(nextId: string) {
    const current = room?.items.find((candidate) => candidate.id === nextId);
    if (!current) return;
    setItemId(nextId);
    setItemNote(current.note);
    setItemCondition(current.condition);
    setScreen("item");
  }

  async function saveItem() {
    if (!roomId || !itemId) return;
    await editInspection((value) => {
      const targetRoom = value.rooms.find((candidate) => candidate.id === roomId);
      const targetItem = targetRoom?.items.find((candidate) => candidate.id === itemId);
      if (!targetItem) throw new Error("This report item could not be found.");
      targetItem.note = itemNote.trim();
      targetItem.condition = itemCondition;
      if (targetItem.aiSuggestion) targetItem.aiSuggestion.reviewed = true;
    });
    setScreen("room");
  }

  async function addCloseUp(uri: string) {
    if (!roomId) return;
    const path = await retainPhoto(uri);
    await editInspection((value) => {
      const target = value.rooms.find((candidate) => candidate.id === roomId);
      if (!target) throw new Error("This room could not be found.");
      target.evidence.unshift({
        id: uid(),
        kind: "photo",
        path,
        source: "manual",
        capturedAt: new Date().toISOString(),
        caption: "Inspector close-up",
      });
    });
    setScreen("room");
  }

  async function shareReport() {
    if (!property || !inspection) return;
    if (property.address === "New inspection") {
      setNotice("Add property details before sharing the report.");
      setScreen("details");
      return;
    }
    await exportReport(property, inspection, "Share inspection report");
  }

  async function savePDF() {
    if (!property || !inspection) return;
    if (property.address === "New inspection") {
      setNotice("Add property details before saving the report.");
      setScreen("details");
      return;
    }
    if (!(await Sharing.isAvailableAsync())) {
      setNotice("Saving to Files is not available on this device.");
      return;
    }
    await exportReport(property, inspection, "Save inspection PDF to Files");
  }

  function returnHome() {
    setPropertyId(undefined);
    setInspectionId(undefined);
    setRoomId(undefined);
    setItemId(undefined);
    setScreen("home");
  }

  async function abandonCapture() {
    const unfinished = dbRef.current.properties.find((candidate) => candidate.id === propertyId);
    const draft = unfinished?.inspections.find((candidate) => candidate.id === inspectionId);
    if (
      unfinished?.address === "New inspection" &&
      draft &&
      !draft.analysis &&
      !(draft.walkthroughs ?? []).length
    ) {
      await commit((next) => {
        next.properties = next.properties.filter((candidate) => candidate.id !== propertyId);
      });
    }
    returnHome();
  }

  if (!loaded)
    return (
      <SafeAreaView style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator color="#23684d" />
      </SafeAreaView>
    );

  if (screen === "capture")
    return (
      <SafeAreaView style={styles.captureSafe} edges={["top", "bottom"]}>
        <StatusBar style="light" />
        <GuidedCapture onComplete={receiveWalkthrough} onExit={() => void abandonCapture()} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.app} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      {!!notice && (
        <Pressable accessibilityRole="alert" onPress={() => setNotice("")} style={styles.notice}>
          <Icon name="warning" color="#9c681a" size={18} />
          <Text style={styles.noticeText}>{notice}</Text>
          <Icon name="close" color="#607066" size={16} />
        </Pressable>
      )}
      {screen === "home" && <Home startScan={startScan} saving={saving} />}
      {screen === "processing" && <Processing phase={phase} progress={uploadProgress} />}
      {screen === "ready" && inspection && <AnalysisReady inspection={inspection} viewReport={() => setScreen("report")} returnHome={returnHome} retry={() => setScreen("capture")} />}
      {screen === "history" && <History reports={db.properties} onBack={returnHome} onOpen={openReport} />}
      {screen === "report" && property && inspection && <Report property={property} inspection={inspection} onRoom={openRoom} onDetails={openDetails} onHome={returnHome} onShare={() => void shareReport()} onDownload={() => void savePDF()} />}
      {screen === "room" && property && inspection && room && <RoomReport room={room} onBack={() => setScreen("report")} onItem={openItem} onPhoto={() => setScreen("photo")} />}
      {screen === "photo" && room && <DetailCapture onSave={addCloseUp} onBack={() => setScreen("room")} />}
      {screen === "item" && room && item && <EditItem itemName={item.name} suggestion={item.aiSuggestion} evidence={item.aiSuggestion?.evidenceId ? room.evidence.find((candidate) => candidate.id === item.aiSuggestion?.evidenceId) : undefined} note={itemNote} condition={itemCondition} onNote={setItemNote} onCondition={setItemCondition} onSave={() => void saveItem()} onBack={() => setScreen("room")} />}
      {screen === "details" && <Details address={address} suburb={suburb} kind={inspectionKind} onAddress={setAddress} onSuburb={setSuburb} onKind={setInspectionKind} onSave={() => void saveDetails()} onBack={() => setScreen("report")} />}
    </SafeAreaView>
  );
}

function Brand() {
  return (
    <View style={styles.brandRow}>
      <View style={styles.brandMark}><Icon name="scan" color="#173e33" size={19} /></View>
      <Text style={styles.brand}>roomrecord<Text style={{ color: "#75a369" }}>.</Text></Text>
    </View>
  );
}

function Home({ startScan, saving }: { startScan: () => Promise<void>; saving: boolean }) {
  return (
    <View style={styles.home}>
      <Brand />
      <View style={styles.homeHero}>
        <View style={styles.heroCircleOne} /><View style={styles.heroCircleTwo} />
        <Text style={styles.kicker}>INSPECTION CAPTURE, SIMPLIFIED</Text>
        <Text style={styles.heroTitle}>Get scanning for your next inspection report.</Text>
        <Text style={styles.heroBody}>One steady walkthrough becomes an editable room-by-room report, with video evidence where it matters.</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Start scanning" disabled={saving} onPress={() => void startScan()} style={({ pressed }) => [styles.startButton, saving && { opacity: 0.55 }, pressed && { transform: [{ scale: 0.98 }] }]}>
        <View style={styles.startIcon}><Icon name="camera" color="#173e33" size={21} /></View>
        <Text style={styles.startText}>Start scanning</Text>
        <Icon name="arrow" color="#173e33" size={20} />
      </Pressable>
      <Text style={styles.homeNote}>Your camera opens next. No setup, measurements or room-by-room capture required.</Text>
      <View style={styles.privacyHome}><Icon name="shield" color="#7a897f" size={17} /><Text style={styles.privacyText}>The video is kept on your phone. A temporary analysis copy is deleted after your draft is created.</Text></View>
    </View>
  );
}

function Processing({ phase, progress }: { phase: AnalysisPhase; progress: number }) {
  const steps: AnalysisPhase[] = ["Uploading your walkthrough", "Reviewing the rooms", "Finding condition evidence", "Preparing your report"];
  const active = steps.indexOf(phase);
  return (
    <View style={styles.processingPage}>
      <Brand />
      <View style={styles.processingGlyph}><View style={styles.pulseOne} /><View style={styles.pulseTwo} /><Icon name="scan" color="#173e33" size={38} /></View>
      <Text style={styles.processingTitle}>Your walkthrough is being analysed.</Text>
      <Text style={styles.processingBody}>Keep RoomRecord open while we organise your room evidence and draft the report.</Text>
      <View style={styles.stepStack}>
        {steps.map((step, index) => (
          <View key={step} style={styles.stepRow}>
            <View style={[styles.stepDot, index < active && styles.stepDone, index === active && styles.stepCurrent]}>{index < active ? <Icon name="check" color="#173e33" size={13} /> : index === active ? <ActivityIndicator size="small" color="#173e33" /> : null}</View>
            <View style={{ flex: 1 }}><Text style={[styles.stepText, index <= active && styles.stepTextActive]}>{step}</Text>{index === 0 && phase === "Uploading your walkthrough" && <View style={styles.uploadTrack}><View style={[styles.uploadFill, { width: `${Math.max(4, progress * 100)}%` }]} /></View>}</View>
          </View>
        ))}
      </View>
      <Text style={styles.processingFoot}>Your report stays a draft until you review and edit it.</Text>
    </View>
  );
}

function AnalysisReady({ inspection, viewReport, returnHome, retry }: { inspection: Inspection; viewReport: () => void; returnHome: () => void; retry: () => void }) {
  const warnings = inspection.analysis?.coverageWarnings ?? ["The recording did not complete. You can try scanning again."];
  const reviewCount = inspection.rooms.flatMap((room) => room.items).filter((item) => item.aiSuggestion && !item.aiSuggestion.reviewed).length;
  const failed = inspection.walkthroughs?.[0]?.status === "failed";
  return (
    <ScrollView contentContainerStyle={styles.readyPage}>
      <Brand />
      <View style={styles.successMark}><Icon name={failed ? "warning" : "check"} color="#173e33" size={38} /></View>
      <Text style={styles.readyTitle}>{failed ? "Your recording needs another try." : "Your recording has been analysed."}</Text>
      <Text style={styles.readyBody}>{failed ? inspection.walkthroughs?.[0]?.error || "The analysis did not complete." : `We found ${inspection.rooms.length} ${inspection.rooms.length === 1 ? "room" : "rooms"} and ${reviewCount} condition items to review.`}</Text>
      {!failed && <View style={styles.readySummary}><SummaryCell value={`${inspection.rooms.length}`} label="ROOMS FOUND" /><View style={styles.summaryDivider} /><SummaryCell value={`${reviewCount}`} label="ITEMS TO REVIEW" /><View style={styles.summaryDivider} /><SummaryCell value={inspection.analysis?.confidence?.toUpperCase() || "LOW"} label="AI CONFIDENCE" /></View>}
      <View style={styles.warningBox}><Icon name="warning" color="#9c681a" size={19} /><View style={{ flex: 1, gap: 5 }}><Text style={styles.warningTitle}>Review before sharing</Text>{warnings.slice(0, 3).map((warning) => <Text key={warning} style={styles.warningText}>• {warning}</Text>)}</View></View>
      <Pressable style={styles.startButton} onPress={failed ? retry : viewReport}><View style={styles.startIcon}><Icon name={failed ? "camera" : "report"} color="#173e33" size={20} /></View><Text style={styles.startText}>{failed ? "Try scanning again" : "View your report"}</Text><Icon name="arrow" color="#173e33" size={20} /></Pressable>
      <Pressable onPress={returnHome} style={styles.textAction}><Text style={styles.textActionText}>Return home</Text></Pressable>
    </ScrollView>
  );
}

function Header({ label, title, onBack, right }: { label: string; title: string; onBack?: () => void; right?: React.ReactNode }) {
  return <View style={styles.pageHeader}><View style={{ gap: 5, flex: 1 }}>{onBack ? <Pressable accessibilityRole="button" onPress={onBack} style={styles.backLine}><Icon name="back" color="#23684d" size={18} /><Text style={styles.backText}>Back</Text></Pressable> : <Brand />}<Text style={styles.pageLabel}>{label}</Text><Text style={styles.pageTitle}>{title}</Text></View>{right}</View>;
}

function Report({ property, inspection, onRoom, onDetails, onHome, onShare, onDownload }: { property: Property; inspection: Inspection; onRoom: (room: Room) => void; onDetails: () => void; onHome: () => void; onShare: () => void; onDownload: () => void }) {
  const reviewItems = inspection.rooms.flatMap((room) => room.items).filter((item) => item.aiSuggestion && !item.aiSuggestion.reviewed).length;
  const captured = inspection.walkthroughs?.[0];
  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.reportPage}>
        <Header label={`${inspection.kind.toUpperCase()} INSPECTION · DRAFT`} title={property.address === "New inspection" ? "Untitled property" : property.address} right={<Pressable accessibilityLabel="Edit property details" onPress={onDetails} style={styles.editCircle}><Icon name="edit" color="#173e33" size={19} /></Pressable>} />
        <Pressable onPress={onDetails} style={styles.detailsPrompt}><View style={styles.detailsIcon}><Icon name="home" color="#23684d" size={20} /></View><View style={{ flex: 1, gap: 2 }}><Text style={styles.detailsTitle}>{property.address === "New inspection" ? "Add property details" : property.suburb || "Add suburb or postcode"}</Text><Text style={styles.detailsSubtitle}>Address, report type and report date</Text></View><Icon name="chevron" color="#23684d" size={18} /></Pressable>
        <View style={styles.reportIntro}><Text style={styles.reportIntroTitle}>{reviewItems ? `${reviewItems} suggestions need your review` : "All suggestions have been reviewed"}</Text><Text style={styles.reportIntroBody}>{inspection.analysis?.summary || "Your original walkthrough is retained on this device as evidence."}</Text><View style={styles.coverageMeta}><Icon name="clock" color="#5f756a" size={16} /><Text style={styles.coverageMetaText}>{captured ? `${Math.ceil(captured.durationSeconds / 60)} min walkthrough · ${Math.round((captured.coverage ?? 0) * 100)}% guided coverage` : "Walkthrough evidence"}</Text></View></View>
        <Text style={styles.sectionCaption}>ROOM-BY-ROOM REPORT</Text>
        <View style={styles.roomList}>{inspection.rooms.map((candidate, index) => <RoomCard key={candidate.id} room={candidate} number={index + 1} onPress={() => onRoom(candidate)} />)}</View>
        <View style={styles.aiNote}><Icon name="shield" color="#607066" size={18} /><Text style={styles.aiNoteText}>AI suggestions are linked to video evidence and stay editable. Review every item before relying on this report.</Text></View>
      </ScrollView>
      <ReportActions onHome={onHome} onShare={onShare} onDownload={onDownload} />
    </View>
  );
}

function RoomCard({ room, number, onPress }: { room: Room; number: number; onPress: () => void }) {
  const toReview = room.items.filter((item) => item.aiSuggestion && !item.aiSuggestion.reviewed).length;
  const needsAttention = room.items.filter((item) => item.condition === "attention").length;
  const still = room.evidence.find((evidence) => evidence.source === "walkthrough") || room.evidence[0];
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.roomCard, pressed && { opacity: 0.74 }]}><View style={styles.roomNumber}><Text style={styles.roomNumberText}>{String(number).padStart(2, "0")}</Text></View><View style={{ flex: 1, gap: 7 }}><View style={styles.roomTop}><Text style={styles.roomName}>{room.name}</Text><Icon name="chevron" color="#23684d" size={18} /></View><Text style={styles.roomMeta}>{toReview ? `${toReview} items to review` : "Reviewed"}{needsAttention ? ` · ${needsAttention} needs attention` : ""}</Text><View style={styles.roomEvidenceRow}>{still ? <Image source={{ uri: fileURI(still.path) }} style={styles.roomThumb} /> : <View style={styles.roomThumbEmpty}><Icon name="camera" color="#7e8a83" size={18} /></View>}<Text style={styles.evidenceLabel}>{still ? `Walkthrough still${still.timestamp ? ` · ${still.timestamp}` : ""}` : "No still available"}</Text></View></View></Pressable>;
}

function RoomReport({ room, onBack, onItem, onPhoto }: { room: Room; onBack: () => void; onItem: (id: string) => void; onPhoto: () => void }) {
  const stills = room.evidence.filter((evidence) => evidence.source === "walkthrough");
  return <View style={{ flex: 1 }}><ScrollView contentContainerStyle={styles.roomPage}><Header label={`ROOM REPORT · ${room.confidence ? `${room.confidence.toUpperCase()} CONFIDENCE` : "REVIEW"}`} title={room.name} onBack={onBack} /><Text style={styles.roomEvidenceHeading}>VIDEO EVIDENCE</Text>{stills.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stillStrip}>{stills.map((still) => <View key={still.id} style={styles.stillWrap}><Image source={{ uri: fileURI(still.path) }} style={styles.detailStill} /><Text style={styles.stillCaption}>{still.timestamp || "Walkthrough"}</Text></View>)}</ScrollView> : <View style={styles.emptyEvidence}><Icon name="camera" color="#7e8a83" size={22} /><Text style={styles.emptyEvidenceText}>No extracted video stills are available for this room.</Text></View>}<Text style={styles.roomContext}>{room.walkthroughEvidence || "Review the room evidence before confirming these suggestions."}</Text><Pressable style={styles.closeUpButton} onPress={onPhoto}><Icon name="camera" color="#23684d" size={18} /><Text style={styles.closeUpText}>Add a close-up</Text><Icon name="chevron" color="#23684d" size={17} /></Pressable><Text style={styles.sectionCaption}>CONDITION REPORT</Text><View style={styles.itemList}>{room.items.map((candidate) => <ConditionCard key={candidate.id} item={candidate} evidence={candidate.aiSuggestion?.evidenceId ? room.evidence.find((evidence) => evidence.id === candidate.aiSuggestion?.evidenceId) : undefined} onPress={() => onItem(candidate.id)} />)}</View></ScrollView></View>;
}

function ConditionCard({ item, evidence, onPress }: { item: Room["items"][number]; evidence?: Room["evidence"][number]; onPress: () => void }) {
  const tone = conditionTone[item.condition];
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.conditionCard, pressed && { opacity: 0.74 }]}><View style={styles.conditionHead}><View style={{ flex: 1, gap: 4 }}><Text style={styles.conditionName}>{item.name}</Text>{item.aiSuggestion && <Text style={styles.suggestionMeta}>{item.aiSuggestion.reviewed ? "REVIEWED BY INSPECTOR" : `AI SUGGESTION · ${item.aiSuggestion.confidence.toUpperCase()} CONFIDENCE`}</Text>}</View><View style={[styles.conditionTag, { backgroundColor: tone.fill }]}><Text style={[styles.conditionTagText, { color: tone.text }]}>{CONDITION_LABEL[item.condition]}</Text></View></View>{!!item.note && <Text style={styles.conditionNote}>{item.note}</Text>}{(evidence || item.aiSuggestion) && <View style={styles.conditionEvidence}>{evidence ? <Image source={{ uri: fileURI(evidence.path) }} style={styles.conditionThumb} /> : <View style={styles.conditionThumbEmpty}><Icon name="camera" color="#758179" size={16} /></View>}<View style={{ flex: 1 }}><Text style={styles.evidenceRefTitle}>Evidence from walkthrough</Text><Text style={styles.evidenceRefTime}>{item.aiSuggestion?.timestamp || "Timestamp unavailable"}</Text></View><Icon name="chevron" color="#23684d" size={17} /></View>}</Pressable>;
}

function EditItem({ itemName, suggestion, evidence, note, condition, onNote, onCondition, onSave, onBack }: { itemName: string; suggestion?: { timestamp: string; confidence: string; reviewed: boolean }; evidence?: Room["evidence"][number]; note: string; condition: Condition; onNote: (value: string) => void; onCondition: (value: Condition) => void; onSave: () => void; onBack: () => void }) {
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView contentContainerStyle={styles.editPage} keyboardShouldPersistTaps="handled"><Header label="EDIT REPORT ITEM" title={itemName} onBack={onBack} />{suggestion && <View style={styles.sourceBox}><Icon name="clock" color="#23684d" size={18} /><Text style={styles.sourceText}>AI suggestion from the walkthrough at {suggestion.timestamp} · {suggestion.confidence} confidence. Saving confirms you have reviewed it.</Text></View>}{evidence && <View style={styles.editEvidence}><Image source={{ uri: fileURI(evidence.path) }} style={styles.editEvidenceImage} /><Text style={styles.editEvidenceCaption}>Video evidence · {evidence.timestamp || suggestion?.timestamp}</Text></View>}<Text style={styles.fieldLabel}>CONDITION</Text><View style={styles.conditionChoices}>{(["good", "fair", "attention", "unreviewed", "na"] as Condition[]).map((choice) => <Pressable key={choice} onPress={() => onCondition(choice)} style={[styles.choice, condition === choice && { borderColor: conditionTone[choice].text, backgroundColor: conditionTone[choice].fill }]}><Text style={[styles.choiceText, condition === choice && { color: conditionTone[choice].text }]}>{CONDITION_LABEL[choice]}</Text></Pressable>)}</View><Text style={styles.fieldLabel}>REPORT TEXT</Text><TextInput value={note} onChangeText={onNote} multiline placeholder="Describe what you can see, where it is, and what needs follow-up." placeholderTextColor="#89948e" style={styles.noteInput} /><Pressable style={styles.saveButton} onPress={onSave}><Icon name="check" color="#fff" size={19} /><Text style={styles.saveText}>Save report item</Text></Pressable></ScrollView></KeyboardAvoidingView>;
}

function Details({ address, suburb, kind, onAddress, onSuburb, onKind, onSave, onBack }: { address: string; suburb: string; kind: Inspection["kind"]; onAddress: (value: string) => void; onSuburb: (value: string) => void; onKind: (value: Inspection["kind"]) => void; onSave: () => void; onBack: () => void }) {
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView contentContainerStyle={styles.detailsPage} keyboardShouldPersistTaps="handled"><Header label="REPORT DETAILS" title="Property details" onBack={onBack} /><Text style={styles.fieldLabel}>PROPERTY ADDRESS</Text><TextInput value={address} onChangeText={onAddress} placeholder="e.g. 24 Brunswick Street" placeholderTextColor="#89948e" style={styles.textInput} /><Text style={styles.fieldLabel}>SUBURB OR POSTCODE</Text><TextInput value={suburb} onChangeText={onSuburb} placeholder="e.g. Fitzroy VIC 3065" placeholderTextColor="#89948e" style={styles.textInput} /><Text style={styles.fieldLabel}>INSPECTION TYPE</Text><View style={styles.kindRow}>{(["ingoing", "outgoing"] as const).map((option) => <Pressable key={option} onPress={() => onKind(option)} style={[styles.kindOption, kind === option && styles.kindOptionActive]}><Text style={[styles.kindOptionText, kind === option && styles.kindOptionTextActive]}>{option === "ingoing" ? "Ingoing" : "Outgoing"}</Text></Pressable>)}</View>{kind === "outgoing" && <View style={styles.outgoingHint}><Icon name="compare" color="#9c681a" size={18} /><Text style={styles.outgoingHintText}>This report is an editable outgoing condition draft. Check each observation against your own ingoing record before relying on a change.</Text></View>}<Pressable style={styles.saveButton} onPress={onSave}><Icon name="check" color="#fff" size={19} /><Text style={styles.saveText}>Save report details</Text></Pressable></ScrollView></KeyboardAvoidingView>;
}

function History({ reports, onBack, onOpen }: { reports: Property[]; onBack: () => void; onOpen: (property: Property, inspection: Inspection) => void }) {
  const entries = reports.flatMap((property) => property.inspections.map((inspection) => ({ property, inspection }))).sort((a, b) => b.inspection.createdAt.localeCompare(a.inspection.createdAt));
  return <ScrollView contentContainerStyle={styles.historyPage}><Header label="YOUR REPORTS" title="Previous reports" onBack={onBack} />{entries.length ? entries.map(({ property, inspection }) => <Pressable key={inspection.id} onPress={() => onOpen(property, inspection)} style={styles.historyCard}><View style={styles.historyCardIcon}><Icon name="report" color="#23684d" size={21} /></View><View style={{ flex: 1, gap: 4 }}><Text style={styles.historyTitle}>{property.address || "Untitled property"}</Text><Text style={styles.historyMeta}>{inspection.kind === "ingoing" ? "Ingoing" : "Outgoing"} · {new Date(inspection.createdAt).toLocaleDateString()}</Text></View><Icon name="chevron" color="#23684d" size={18} /></Pressable>) : <Text style={styles.emptyHistory}>Your completed reports will appear here.</Text>}</ScrollView>;
}

function ReportActions({ onHome, onShare, onDownload }: { onHome: () => void; onShare: () => void; onDownload: () => void }) {
  return <View style={styles.reportActions}><Pressable accessibilityRole="button" onPress={onHome} style={styles.actionButton}><Icon name="home" color="#23684d" size={20} /><Text style={styles.actionText}>Home</Text></Pressable><Pressable accessibilityRole="button" onPress={onShare} style={styles.actionButton}><Icon name="arrow" color="#23684d" size={20} /><Text style={styles.actionText}>Share</Text></Pressable><Pressable accessibilityRole="button" onPress={onDownload} style={styles.actionButton}><Icon name="report" color="#23684d" size={20} /><Text style={styles.actionText}>Save PDF</Text></Pressable></View>;
}

function SummaryCell({ value, label }: { value: string; label: string }) { return <View style={{ flex: 1, gap: 5 }}><Text style={styles.summaryValue}>{value}</Text><Text style={styles.summaryLabel}>{label}</Text></View>; }

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: "#f5f6f1" },
  captureSafe: { flex: 1, backgroundColor: "#0c211b" },
  loading: { flex: 1, backgroundColor: "#f5f6f1", alignItems: "center", justifyContent: "center" },
  notice: { marginHorizontal: 16, marginTop: 8, padding: 12, gap: 9, flexDirection: "row", alignItems: "center", backgroundColor: "#fff5dc", borderColor: "#f0dca5", borderWidth: 1, borderRadius: 14 },
  noticeText: { flex: 1, color: "#675126", fontSize: 12.5, lineHeight: 18 },
  home: { flex: 1, paddingHorizontal: 24, paddingTop: 21, paddingBottom: 26, justifyContent: "space-between" },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: { width: 32, height: 32, borderRadius: 10, backgroundColor: "#d8f5ad", alignItems: "center", justifyContent: "center" },
  brand: { color: "#173e33", fontSize: 18, fontWeight: "800", letterSpacing: -0.7 },
  homeHero: { paddingVertical: 44, gap: 15, overflow: "hidden" },
  heroCircleOne: { position: "absolute", width: 220, height: 220, borderRadius: 110, borderWidth: 1, borderColor: "#dbe6d4", right: -110, top: 14 },
  heroCircleTwo: { position: "absolute", width: 130, height: 130, borderRadius: 65, backgroundColor: "#e5efdc", right: -36, top: 58 },
  kicker: { color: "#62736a", fontSize: 10, fontWeight: "800", letterSpacing: 1.6 },
  heroTitle: { maxWidth: 340, color: "#173e33", fontSize: 37, fontWeight: "700", letterSpacing: -1.55, lineHeight: 43 },
  heroBody: { maxWidth: 315, color: "#617168", fontSize: 15, lineHeight: 22 },
  startButton: { minHeight: 62, borderRadius: 19, backgroundColor: "#d8f5ad", paddingHorizontal: 12, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 12 },
  startIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#ecfbd9", justifyContent: "center", alignItems: "center" },
  startText: { flex: 1, color: "#173e33", fontSize: 16, fontWeight: "800" },
  homeNote: { textAlign: "center", color: "#758279", fontSize: 12, lineHeight: 18, paddingHorizontal: 18, marginTop: 12 },
  historyLink: { minHeight: 50, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 4 },
  historyLinkText: { color: "#23684d", fontWeight: "700", fontSize: 13 },
  privacyHome: { flexDirection: "row", gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#e0e7dd", alignItems: "flex-start" },
  privacyText: { flex: 1, color: "#7a877f", fontSize: 11, lineHeight: 16 },
  processingPage: { flex: 1, paddingHorizontal: 25, paddingTop: 21, justifyContent: "center", gap: 19 },
  processingGlyph: { height: 132, width: 132, borderRadius: 66, backgroundColor: "#e3f5ce", alignSelf: "center", justifyContent: "center", alignItems: "center", marginBottom: 6 },
  pulseOne: { position: "absolute", height: 108, width: 108, borderRadius: 54, borderWidth: 1, borderColor: "#b4d796" },
  pulseTwo: { position: "absolute", height: 150, width: 150, borderRadius: 75, borderWidth: 1, borderColor: "#d7e8c8" },
  processingTitle: { color: "#173e33", fontSize: 31, lineHeight: 37, letterSpacing: -1.15, fontWeight: "700", textAlign: "center" },
  processingBody: { color: "#64756c", fontSize: 14, lineHeight: 21, textAlign: "center", paddingHorizontal: 14 },
  stepStack: { marginTop: 8, backgroundColor: "#fff", padding: 18, borderColor: "#e0e6de", borderWidth: 1, borderRadius: 20, gap: 16 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepDot: { height: 24, width: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#edf0ec" },
  stepDone: { backgroundColor: "#d8f5ad" },
  stepCurrent: { backgroundColor: "#e3f5ce" },
  stepText: { color: "#9aa59e", fontSize: 13, fontWeight: "600" },
  stepTextActive: { color: "#234a3c" },
  uploadTrack: { height: 4, marginTop: 7, backgroundColor: "#e2e8e1", overflow: "hidden", borderRadius: 5 },
  uploadFill: { height: "100%", backgroundColor: "#77ad6c", borderRadius: 5 },
  processingFoot: { color: "#7b887f", textAlign: "center", fontSize: 11, lineHeight: 16, marginTop: 5 },
  readyPage: { padding: 25, gap: 18, minHeight: "100%", justifyContent: "center" },
  successMark: { width: 76, height: 76, borderRadius: 25, backgroundColor: "#d8f5ad", alignSelf: "center", alignItems: "center", justifyContent: "center" },
  readyTitle: { color: "#173e33", fontSize: 31, lineHeight: 37, letterSpacing: -1.1, fontWeight: "700", textAlign: "center" },
  readyBody: { color: "#63736a", textAlign: "center", fontSize: 14, lineHeight: 21 },
  readySummary: { flexDirection: "row", backgroundColor: "#e6f0de", borderRadius: 18, paddingVertical: 16, paddingHorizontal: 15 },
  summaryDivider: { width: 1, backgroundColor: "#c8dbbf", marginHorizontal: 10 },
  summaryValue: { color: "#173e33", fontSize: 18, fontWeight: "800" },
  summaryLabel: { color: "#63736a", fontSize: 8.5, fontWeight: "800", letterSpacing: 0.65 },
  warningBox: { flexDirection: "row", gap: 10, padding: 15, backgroundColor: "#fff5df", borderRadius: 16, borderColor: "#f1dfb5", borderWidth: 1 },
  warningTitle: { color: "#735318", fontSize: 13, fontWeight: "800" },
  warningText: { color: "#826631", fontSize: 12, lineHeight: 17 },
  textAction: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  textActionText: { color: "#23684d", fontWeight: "700", fontSize: 14 },
  reportPage: { padding: 22, paddingBottom: 105, gap: 19 },
  pageHeader: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  backLine: { alignSelf: "flex-start", flexDirection: "row", gap: 5, alignItems: "center", minHeight: 26 },
  backText: { color: "#23684d", fontSize: 13, fontWeight: "700" },
  pageLabel: { color: "#7e8b83", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.3 },
  pageTitle: { color: "#173e33", fontSize: 28, lineHeight: 33, letterSpacing: -1, fontWeight: "700" },
  editCircle: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#e3f0d8" },
  detailsPrompt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0e6de", borderRadius: 16 },
  detailsIcon: { width: 35, height: 35, borderRadius: 11, backgroundColor: "#e7f3dd", alignItems: "center", justifyContent: "center" },
  detailsTitle: { color: "#214438", fontSize: 13, fontWeight: "800" },
  detailsSubtitle: { color: "#718077", fontSize: 11.5 },
  reportIntro: { backgroundColor: "#193d32", borderRadius: 21, padding: 19, gap: 10 },
  reportIntroTitle: { color: "#d8f5ad", fontSize: 18, fontWeight: "700", letterSpacing: -0.4 },
  reportIntroBody: { color: "#c2d5cb", fontSize: 13, lineHeight: 19 },
  coverageMeta: { flexDirection: "row", gap: 7, alignItems: "center", marginTop: 3 },
  coverageMetaText: { color: "#aec4b9", fontSize: 11.5 },
  sectionCaption: { color: "#7b887f", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  roomList: { gap: 10 },
  roomCard: { padding: 14, borderRadius: 18, borderWidth: 1, borderColor: "#e0e6de", backgroundColor: "#fff", flexDirection: "row", gap: 12 },
  roomNumber: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#e7f3dd", alignItems: "center", justifyContent: "center" },
  roomNumberText: { color: "#2f7450", fontSize: 11, fontWeight: "800" },
  roomTop: { flexDirection: "row", gap: 8, justifyContent: "space-between", alignItems: "center" },
  roomName: { flex: 1, color: "#173e33", fontWeight: "700", fontSize: 16, letterSpacing: -0.2 },
  roomMeta: { color: "#6f7e75", fontSize: 12 },
  roomEvidenceRow: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 3 },
  roomThumb: { width: 38, height: 29, borderRadius: 6, backgroundColor: "#e7ece7" },
  roomThumbEmpty: { width: 38, height: 29, borderRadius: 6, backgroundColor: "#edf0ed", alignItems: "center", justifyContent: "center" },
  evidenceLabel: { color: "#77847c", fontSize: 10.5 },
  aiNote: { flexDirection: "row", gap: 9, padding: 13, alignItems: "flex-start" },
  aiNoteText: { flex: 1, color: "#718078", fontSize: 11, lineHeight: 16 },
  reportActions: { position: "absolute", bottom: 0, left: 0, right: 0, minHeight: 78, paddingHorizontal: 13, paddingTop: 9, paddingBottom: 13, flexDirection: "row", borderTopWidth: 1, borderColor: "#dce4db", backgroundColor: "rgba(250,251,247,.97)" },
  actionButton: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4 },
  actionText: { color: "#23684d", fontSize: 10.5, fontWeight: "700" },
  roomPage: { padding: 22, gap: 16, paddingBottom: 36 },
  roomEvidenceHeading: { color: "#7b887f", fontSize: 10, fontWeight: "800", letterSpacing: 1.3 },
  stillStrip: { gap: 12 },
  stillWrap: { width: 220, gap: 7 },
  detailStill: { width: 220, height: 150, borderRadius: 14, backgroundColor: "#e8ece7" },
  stillCaption: { color: "#6f7d75", fontSize: 11, fontWeight: "700" },
  emptyEvidence: { padding: 15, borderRadius: 14, backgroundColor: "#edf1ec", flexDirection: "row", gap: 9, alignItems: "center" },
  emptyEvidenceText: { flex: 1, color: "#708077", fontSize: 12, lineHeight: 17 },
  roomContext: { color: "#66766d", fontSize: 12.5, lineHeight: 18 },
  closeUpButton: { minHeight: 48, flexDirection: "row", gap: 10, alignItems: "center", paddingHorizontal: 14, borderWidth: 1, borderColor: "#d9e4d7", borderRadius: 14, backgroundColor: "#edf6e7" },
  closeUpText: { flex: 1, color: "#23684d", fontSize: 13, fontWeight: "800" },
  itemList: { gap: 10 },
  conditionCard: { padding: 15, borderRadius: 17, borderColor: "#e0e6de", borderWidth: 1, backgroundColor: "#fff", gap: 11 },
  conditionHead: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  conditionName: { color: "#173e33", fontSize: 15, fontWeight: "700" },
  suggestionMeta: { color: "#7c8a81", fontSize: 9, fontWeight: "800", letterSpacing: 0.8 },
  conditionTag: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  conditionTagText: { fontWeight: "800", fontSize: 10.5 },
  conditionNote: { color: "#5e6d64", fontSize: 13, lineHeight: 19 },
  conditionEvidence: { borderTopColor: "#e8ece7", borderTopWidth: 1, paddingTop: 10, flexDirection: "row", gap: 9, alignItems: "center" },
  conditionThumb: { width: 42, height: 33, borderRadius: 7, backgroundColor: "#e8ece7" },
  conditionThumbEmpty: { width: 42, height: 33, borderRadius: 7, backgroundColor: "#edf0ed", alignItems: "center", justifyContent: "center" },
  evidenceRefTitle: { color: "#426455", fontSize: 11.5, fontWeight: "700" },
  evidenceRefTime: { color: "#7b887f", fontSize: 10.5, marginTop: 2 },
  editPage: { padding: 22, gap: 16, paddingBottom: 40 },
  sourceBox: { flexDirection: "row", gap: 10, padding: 14, borderRadius: 15, backgroundColor: "#e4f1dc" },
  sourceText: { flex: 1, color: "#486452", fontSize: 12, lineHeight: 18 },
  editEvidence: { gap: 7 },
  editEvidenceImage: { width: "100%", height: 220, borderRadius: 16, backgroundColor: "#e8ece7" },
  editEvidenceCaption: { color: "#718077", fontSize: 11.5, fontWeight: "700" },
  fieldLabel: { color: "#748279", fontSize: 10, fontWeight: "800", letterSpacing: 1.2, marginTop: 5 },
  conditionChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: { paddingHorizontal: 12, minHeight: 37, justifyContent: "center", borderRadius: 10, borderWidth: 1, borderColor: "#dce4db", backgroundColor: "#fff" },
  choiceText: { color: "#53635a", fontSize: 12, fontWeight: "700" },
  noteInput: { minHeight: 165, padding: 14, borderRadius: 15, borderWidth: 1, borderColor: "#dce4db", backgroundColor: "#fff", color: "#173e33", fontSize: 14, lineHeight: 21, textAlignVertical: "top" },
  saveButton: { minHeight: 54, marginTop: 8, borderRadius: 15, backgroundColor: "#23684d", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9 },
  saveText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  detailsPage: { padding: 22, gap: 14, paddingBottom: 40 },
  textInput: { minHeight: 51, paddingHorizontal: 14, borderRadius: 14, borderColor: "#dce4db", borderWidth: 1, backgroundColor: "#fff", color: "#173e33", fontSize: 14 },
  kindRow: { flexDirection: "row", gap: 9 },
  kindOption: { flex: 1, minHeight: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#dce4db", borderRadius: 13, backgroundColor: "#fff" },
  kindOptionActive: { borderColor: "#347454", backgroundColor: "#e4f3dc" },
  kindOptionText: { color: "#64746a", fontWeight: "700", fontSize: 13 },
  kindOptionTextActive: { color: "#216240" },
  outgoingHint: { flexDirection: "row", gap: 9, padding: 13, borderRadius: 14, backgroundColor: "#fff5df" },
  outgoingHintText: { flex: 1, color: "#816433", fontSize: 11.5, lineHeight: 17 },
  historyPage: { padding: 22, gap: 12, paddingBottom: 38 },
  historyCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e0e6de", borderRadius: 16 },
  historyCardIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "#e7f3dd", alignItems: "center", justifyContent: "center" },
  historyTitle: { color: "#173e33", fontSize: 14, fontWeight: "700" },
  historyMeta: { color: "#718077", fontSize: 11.5 },
  emptyHistory: { color: "#718077", textAlign: "center", marginTop: 40 },
});
