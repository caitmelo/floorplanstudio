import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { DeviceMotion } from "expo-sensors";
import { Icon } from "./ui";

export type WalkthroughCapture = {
  uri: string;
  capturedAt: string;
  durationSeconds: number;
  coverage: number;
};

type Guidance = {
  title: string;
  body: string;
  tone: "green" | "amber" | "white";
};

const gridSize = 12;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const pad = (value: number) => String(value).padStart(2, "0");

export default function GuidedCapture({
  onComplete,
  onExit,
}: {
  onComplete: (capture: WalkthroughCapture) => Promise<void>;
  onExit: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const startedAt = useRef(0);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [covered, setCovered] = useState<Set<number>>(() => new Set());
  const coveredRef = useRef<Set<number>>(new Set());
  const [motionSpeed, setMotionSpeed] = useState(0);
  const [lastRotation, setLastRotation] = useState({ beta: 0, gamma: 0 });
  const [motionEnabled, setMotionEnabled] = useState(false);
  const autoStarted = useRef(false);
  const discarded = useRef(false);

  useEffect(() => {
    if (permission?.granted || permission?.canAskAgain === false) return;
    void requestPermission();
  }, [permission?.granted, permission?.canAskAgain, requestPermission]);

  useEffect(() => {
    if (!recording) return;
    const timer = setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    if (!recording || !motionEnabled) return;
    let subscription: { remove: () => void } | undefined;
    void DeviceMotion.isAvailableAsync().then((available) => {
      if (!available) return;
      DeviceMotion.setUpdateInterval(250);
      subscription = DeviceMotion.addListener((measurement) => {
        const beta = Number(measurement.rotation?.beta || 0);
        const gamma = Number(measurement.rotation?.gamma || 0);
        const speed = measurement.rotationRate
          ? Math.abs(measurement.rotationRate.alpha || 0) +
            Math.abs(measurement.rotationRate.beta || 0) +
            Math.abs(measurement.rotationRate.gamma || 0)
          : 0;
        setMotionSpeed(speed);
        setLastRotation({ beta, gamma });
        // This is a visual coverage guide based on camera pan/tilt. It is not a
        // reconstruction of physical surfaces or a measured spatial mesh.
        const x = clamp(Math.floor((gamma + 90) / 60), 0, 2);
        const y = clamp(Math.floor((beta + 120) / 60), 0, 3);
        setCovered((previous) => {
          if (previous.has(y * 3 + x)) return previous;
          const next = new Set(previous);
          next.add(y * 3 + x);
          coveredRef.current = next;
          return next;
        });
      });
    });
    return () => subscription?.remove();
  }, [motionEnabled, recording]);

  useEffect(() => {
    if (!ready || !permission?.granted || autoStarted.current) return;
    autoStarted.current = true;
    const timer = setTimeout(() => void startRecording(), 360);
    return () => clearTimeout(timer);
    // startRecording is intentionally invoked only once when the preview is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, permission?.granted]);

  useEffect(() => {
    return () => {
      if (recording) camera.current?.stopRecording();
    };
  }, [recording]);

  const guidance = useMemo<Guidance>(() => {
    const coverage = covered.size / gridSize;
    const tilt = lastRotation.beta;
    if (!motionEnabled)
      return {
        title: "Keep a steady sweep",
        body: "Move slowly across walls, ceiling and floor. Motion access enables live green coverage shading.",
        tone: "amber",
      };
    if (motionSpeed > 230)
      return {
        title: "Slow down",
        body: "Move steadily so walls and fixtures remain clear.",
        tone: "amber",
      };
    if (coverage < 0.2)
      return {
        title: "Start at the entry",
        body: "Hold your phone at chest height and pan across the first room.",
        tone: "white",
      };
    if (tilt < -34)
      return {
        title: "Move up",
        body: "Tilt upward to include walls, openings and the ceiling line.",
        tone: "amber",
      };
    if (tilt > 38)
      return {
        title: "Move down",
        body: "Tilt down briefly to include flooring and lower fixtures.",
        tone: "amber",
      };
    if (coverage < 0.58)
      return {
        title: "Keep sweeping the room",
        body: "Turn gradually and revisit grey sections in the guide.",
        tone: "white",
      };
    if (coverage < 0.84)
      return {
        title: "Great coverage",
        body: "Move slowly through the next doorway and repeat the sweep.",
        tone: "green",
      };
    return {
      title: "Coverage looks strong",
      body: "Continue through every room, then complete the recording.",
      tone: "green",
    };
  }, [covered.size, lastRotation.beta, motionEnabled, motionSpeed]);

  async function startRecording() {
    if (!camera.current || recording || finishing) return;
    setError("");
    discarded.current = false;
    startedAt.current = Date.now();
    setElapsed(0);
    setCovered(new Set());
    coveredRef.current = new Set();
    try {
      const available = await DeviceMotion.isAvailableAsync();
      const motionPermission = available
        ? await DeviceMotion.requestPermissionsAsync()
        : undefined;
      setMotionEnabled(!!available && motionPermission?.granted !== false);
    } catch {
      setMotionEnabled(false);
    }
    setRecording(true);
    try {
      const video = await camera.current.recordAsync({ maxDuration: 1800, codec: "avc1" });
      if (!video) throw new Error("RoomRecord could not save this recording. Please try again.");
      if (discarded.current) return;
      setRecording(false);
      setFinishing(true);
      await onComplete({
        uri: video.uri,
        capturedAt: new Date().toISOString(),
        durationSeconds: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
        coverage: coveredRef.current.size / gridSize,
      });
    } catch (reason) {
      setRecording(false);
      setFinishing(false);
      autoStarted.current = false;
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  function finishRecording() {
    if (!recording || finishing) return;
    setFinishing(true);
    camera.current?.stopRecording();
  }

  function confirmExit() {
    if (!recording) return onExit();
    Alert.alert(
      "Discard this recording?",
      "The current walkthrough will not be analysed or saved.",
      [
        { text: "Keep recording", style: "cancel" },
        {
          text: "Discard recording",
          style: "destructive",
          onPress: () => {
            discarded.current = true;
            camera.current?.stopRecording();
            onExit();
          },
        },
      ],
    );
  }

  if (!permission?.granted) {
    return (
      <View style={styles.permission}>
        <View style={styles.permissionMark}>
          <Icon name="camera" color="#16392f" size={30} />
        </View>
        <Text style={styles.permissionTitle}>Camera access is needed</Text>
        <Text style={styles.permissionBody}>
          RoomRecord only uses your camera while you record an inspection walkthrough.
        </Text>
        {!!error && <Text style={styles.error}>{error}</Text>}
        {permission?.canAskAgain !== false && (
          <Pressable style={styles.primary} onPress={() => void requestPermission()}>
            <Text style={styles.primaryText}>Allow camera</Text>
          </Pressable>
        )}
        <Pressable style={styles.textButton} onPress={onExit}>
          <Text style={styles.textButtonLabel}>Return home</Text>
        </Pressable>
      </View>
    );
  }

  const progress = Math.max(covered.size / gridSize, 0.08);
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);

  return (
    <View style={styles.screen}>
      <CameraView
        ref={camera}
        active={!finishing}
        mode="video"
        mute
        facing="back"
        videoQuality="1080p"
        videoStabilizationMode="auto"
        style={StyleSheet.absoluteFill}
        onCameraReady={() => setReady(true)}
        onMountError={(event) => setError(event.message)}
      />
      <View pointerEvents="none" style={styles.tint} />
      <View pointerEvents="none" style={styles.grid}>
        {Array.from({ length: gridSize }, (_, index) => (
          <View
            key={index}
            style={[
              styles.cell,
              covered.has(index) && styles.cellCovered,
              index === clamp(Math.floor((lastRotation.beta + 120) / 60), 0, 3) * 3 + clamp(Math.floor((lastRotation.gamma + 90) / 60), 0, 2) && styles.cellActive,
            ]}
          />
        ))}
      </View>
      <View style={styles.topBar}>
        <View style={styles.recordingPill}>
          <View style={styles.liveDot} />
          <Text style={styles.recordingText}>{recording ? "RECORDING" : "PREPARING"}</Text>
          <Text style={styles.timer}>{pad(minutes)}:{pad(seconds)}</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Exit scan"
          hitSlop={16}
          onPress={confirmExit}
          style={styles.close}
        >
          <Icon name="close" color="white" size={21} />
        </Pressable>
      </View>
      <View style={styles.bottomPanel}>
        <View style={styles.guideRow}>
          <View style={[styles.guideSignal, guidance.tone === "amber" && styles.guideAmber, guidance.tone === "green" && styles.guideGreen]} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={styles.guideTitle}>{guidance.title}</Text>
            <Text style={styles.guideBody}>{guidance.body}</Text>
          </View>
        </View>
        <View style={styles.coverageRow}>
          <Text style={styles.coverageLabel}>VIEWING COVERAGE</Text>
          <Text style={styles.coverageValue}>{Math.round(progress * 100)}%</Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.trackFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.disclaimer}>
          Green shows the directions you have panned and tilted through. It is a capture guide, not a measured 3D map.
        </Text>
        {finishing ? (
          <View style={styles.processing}>
            <ActivityIndicator color="#d7f5ad" />
            <Text style={styles.processingText}>Securing your recording…</Text>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Complete recording and analyse"
            disabled={!recording || !ready}
            onPress={finishRecording}
            style={({ pressed }) => [styles.finish, (!recording || !ready) && styles.disabled, pressed && { opacity: 0.82 }]}
          >
            <Icon name="check" color="#173e33" size={19} />
            <Text style={styles.finishText}>Complete & analyse</Text>
          </Pressable>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c211b" },
  tint: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(8, 27, 21, 0.14)" },
  topBar: { position: "absolute", top: 10, left: 18, right: 18, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recordingPill: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "rgba(10, 28, 22, 0.75)", borderColor: "rgba(255,255,255,.22)", borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 999 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#ff665a" },
  recordingText: { color: "#fff", fontWeight: "800", fontSize: 10, letterSpacing: 1.1 },
  timer: { color: "#d7e6de", fontSize: 12, fontVariant: ["tabular-nums"] },
  close: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(10, 28, 22, 0.74)", borderColor: "rgba(255,255,255,.22)", borderWidth: 1 },
  grid: { ...StyleSheet.absoluteFill, flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 24, paddingTop: 100, paddingBottom: 252 },
  cell: { width: "33.333%", height: "25%", borderColor: "rgba(255,255,255,.25)", borderWidth: 0.75, backgroundColor: "rgba(92, 108, 103, .13)" },
  cellCovered: { backgroundColor: "rgba(146, 232, 146, .28)", borderColor: "rgba(192, 255, 185, .7)" },
  cellActive: { backgroundColor: "rgba(220, 255, 192, .42)", borderColor: "#efffe6", borderWidth: 1.25 },
  bottomPanel: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 19, paddingBottom: 23, gap: 11, backgroundColor: "rgba(11, 30, 23, .92)", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  guideRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  guideSignal: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#dfeadf", marginTop: 5 },
  guideAmber: { backgroundColor: "#ffc56f" },
  guideGreen: { backgroundColor: "#c8f49b" },
  guideTitle: { color: "#fff", fontSize: 18, fontWeight: "700", letterSpacing: -0.2 },
  guideBody: { color: "#c0d0c8", fontSize: 13, lineHeight: 18 },
  coverageRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  coverageLabel: { color: "#9fb0a9", fontSize: 10, fontWeight: "800", letterSpacing: 1.4 },
  coverageValue: { color: "#d7f5ad", fontSize: 12, fontWeight: "800" },
  track: { height: 5, borderRadius: 9, overflow: "hidden", backgroundColor: "rgba(255,255,255,.18)" },
  trackFill: { height: "100%", borderRadius: 9, backgroundColor: "#d7f5ad" },
  disclaimer: { color: "#92a49b", fontSize: 10.5, lineHeight: 15 },
  finish: { minHeight: 54, borderRadius: 15, backgroundColor: "#d7f5ad", justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 9, marginTop: 2 },
  finishText: { color: "#173e33", fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.5 },
  processing: { minHeight: 54, borderRadius: 15, backgroundColor: "rgba(255,255,255,.12)", justifyContent: "center", alignItems: "center", flexDirection: "row", gap: 10 },
  processingText: { color: "#fff", fontWeight: "700" },
  error: { color: "#ffd2ca", fontSize: 12, lineHeight: 17 },
  permission: { flex: 1, padding: 28, justifyContent: "center", gap: 16, backgroundColor: "#f5f6f1" },
  permissionMark: { width: 58, height: 58, borderRadius: 18, backgroundColor: "#d7f5ad", alignItems: "center", justifyContent: "center" },
  permissionTitle: { color: "#173e33", fontWeight: "700", fontSize: 29, letterSpacing: -0.8 },
  permissionBody: { color: "#5f6f67", fontSize: 15, lineHeight: 22 },
  primary: { backgroundColor: "#23684d", minHeight: 54, borderRadius: 14, alignItems: "center", justifyContent: "center", marginTop: 8 },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  textButton: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  textButtonLabel: { color: "#23684d", fontWeight: "700", fontSize: 14 },
});
