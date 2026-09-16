import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Platform, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, C, styles as s } from "./ui";

export type WalkthroughCapture = {
  uri: string;
  capturedAt: string;
  durationSeconds: number;
};

export default function LevelWalkthrough({
  onSave,
  onCancel,
}: {
  onSave: (capture: WalkthroughCapture) => Promise<void>;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const startedAt = useRef(0);
  const finishRequested = useRef(false);
  const savingRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [capture, setCapture] = useState<WalkthroughCapture>();
  const [error, setError] = useState("");

  useEffect(() => {
    return () => {
      if (recording) camera.current?.stopRecording();
    };
  }, [recording]);

  async function enableCamera() {
    try {
      if (Platform.OS !== "ios")
        throw new Error("Full-level walkthrough recording is designed for iPhone.");
      const result = permission?.granted ? permission : await requestPermission();
      if (!result.granted)
        throw new Error("Allow camera access in Settings to record a walkthrough.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function save(result: WalkthroughCapture) {
    if (savingRef.current) return;
    savingRef.current = true;
    setCompleting(true);
    try {
      await onSave(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setCapture(result);
    } finally {
      savingRef.current = false;
      setCompleting(false);
    }
  }

  async function start() {
    if (!camera.current || !ready || recording) return;
    setCapture(undefined);
    setError("");
    finishRequested.current = false;
    startedAt.current = Date.now();
    setRecording(true);
    try {
      const video = await camera.current.recordAsync({ maxDuration: 1800 });
      if (!video) throw new Error("The camera did not return a video. Please try again.");
      const result = {
        uri: video.uri,
        capturedAt: new Date().toISOString(),
        durationSeconds: Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)),
      };
      setCapture(result);
      if (finishRequested.current) await save(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRecording(false);
    }
  }

  function complete() {
    if (!recording) {
      if (capture) void save(capture);
      return;
    }
    finishRequested.current = true;
    setCompleting(true);
    camera.current?.stopRecording();
  }

  if (!permission?.granted)
    return (
      <View style={{ flex: 1, padding: 22, gap: 18, justifyContent: "center" }}>
        <Text style={s.h2}>One continuous walkthrough</Text>
        <Text style={s.body}>
          Record one steady video as you walk the entire level. Stop only when the
          level is complete, then it is attached to this inspection.
        </Text>
        {!!error && <Text accessibilityRole="alert" style={s.body}>{error}</Text>}
        <Button title="Enable camera" icon="camera" onPress={() => void enableCamera()} />
        <Button secondary title="Exit without saving" onPress={onCancel} />
      </View>
    );

  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={s.h2}>Walk the entire level in one take</Text>
      <Text style={s.body}>
        Keep the phone steady and move slowly through every room. This records a
        continuous walkthrough video; it does not create a LiDAR plan or a 360°
        reconstruction.
      </Text>
      <View
        style={{
          flex: 1,
          minHeight: 220,
          borderRadius: 20,
          overflow: "hidden",
          backgroundColor: "#10251f",
        }}
      >
        <CameraView
          ref={camera}
          mode="video"
          mute
          facing="back"
          videoQuality="1080p"
          videoStabilizationMode="auto"
          style={{ flex: 1 }}
          onCameraReady={() => setReady(true)}
          onMountError={(e) => setError(e.message)}
        />
        {recording && (
          <View
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              flexDirection: "row",
              gap: 7,
              alignItems: "center",
              backgroundColor: "rgba(16,37,31,.82)",
              borderRadius: 16,
              paddingHorizontal: 11,
              paddingVertical: 7,
            }}
          >
            <View style={{ height: 8, width: 8, borderRadius: 8, backgroundColor: "#ef6657" }} />
            <Text style={{ color: "white", fontWeight: "700", fontSize: 12 }}>RECORDING</Text>
          </View>
        )}
      </View>
      {!!error && <Text accessibilityRole="alert" style={s.body}>{error}</Text>}
      {completing ? (
        <View style={{ flexDirection: "row", gap: 9, alignItems: "center", justifyContent: "center", padding: 13 }}>
          <ActivityIndicator color={C.green} />
          <Text style={s.label}>Saving walkthrough to this inspection…</Text>
        </View>
      ) : recording ? (
        <Button title="Complete level & attach" icon="check" onPress={complete} />
      ) : capture ? (
        <Button title="Attach walkthrough to inspection" icon="check" onPress={complete} />
      ) : (
        <Button
          title={ready ? "Start full-level walkthrough" : "Preparing camera…"}
          icon="camera"
          disabled={!ready}
          onPress={() => void start()}
        />
      )}
      {!recording && !completing && <Button secondary title="Exit without saving" onPress={onCancel} />}
    </View>
  );
}
