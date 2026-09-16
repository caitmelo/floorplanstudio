import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Icon } from "./ui";

export default function DetailCapture({
  onSave,
  onBack,
}: {
  onSave: (uri: string) => Promise<void>;
  onBack: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!permission?.granted && permission?.canAskAgain !== false)
      void requestPermission();
  }, [permission?.canAskAgain, permission?.granted, requestPermission]);

  async function takePhoto() {
    if (!camera.current || !ready || saving) return;
    setSaving(true);
    setError("");
    try {
      const result = await camera.current.takePictureAsync({ quality: 0.9 });
      if (!result) throw new Error("The close-up could not be saved.");
      await onSave(result.uri);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      setSaving(false);
    }
  }

  if (!permission?.granted)
    return <View style={styles.permission}><Icon name="camera" color="#173e33" size={30} /><Text style={styles.permissionTitle}>Allow camera access</Text><Text style={styles.permissionText}>RoomRecord needs the camera to add a close-up to this room report.</Text>{permission?.canAskAgain !== false && <Pressable style={styles.confirm} onPress={() => void requestPermission()}><Text style={styles.confirmText}>Allow camera</Text></Pressable>}<Pressable style={styles.back} onPress={onBack}><Text style={styles.backText}>Back to report</Text></Pressable></View>;

  return <View style={styles.screen}><CameraView ref={camera} facing="back" style={StyleSheet.absoluteFill} onCameraReady={() => setReady(true)} onMountError={(event) => setError(event.message)} /><View style={styles.top}><Pressable accessibilityLabel="Back to room report" onPress={onBack} style={styles.close}><Icon name="close" color="#fff" size={21} /></Pressable><View><Text style={styles.topLabel}>ADD CLOSE-UP</Text><Text style={styles.topText}>Frame the detail clearly</Text></View></View><View style={styles.bottom}><Text style={styles.hint}>Use close-ups for marks, damage, fittings, or anything that needs clearer evidence.</Text>{!!error && <Text style={styles.error}>{error}</Text>}<Pressable accessibilityRole="button" accessibilityLabel="Take close-up photo" onPress={() => void takePhoto()} disabled={!ready || saving} style={[styles.shutter, (!ready || saving) && { opacity: 0.55 }]}>{saving ? <ActivityIndicator color="#173e33" /> : <View style={styles.shutterInner} />}</Pressable><Text style={styles.shutterText}>{saving ? "Saving close-up…" : "Take close-up"}</Text></View></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0c211b" },
  top: { position: "absolute", top: 11, left: 18, right: 18, flexDirection: "row", alignItems: "center", gap: 10 },
  close: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(9,24,19,.76)", alignItems: "center", justifyContent: "center", borderColor: "rgba(255,255,255,.2)", borderWidth: 1 },
  topLabel: { color: "#d7f5ad", fontSize: 9, fontWeight: "800", letterSpacing: 1.4 },
  topText: { color: "#fff", fontSize: 13, fontWeight: "700", marginTop: 2 },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, alignItems: "center", gap: 10, padding: 20, paddingBottom: 24, backgroundColor: "rgba(9,24,19,.9)", borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  hint: { color: "#cad6d0", fontSize: 12, lineHeight: 17, textAlign: "center", maxWidth: 290 },
  shutter: { width: 62, height: 62, borderRadius: 31, borderWidth: 4, borderColor: "#d7f5ad", alignItems: "center", justifyContent: "center", marginTop: 3 },
  shutterInner: { width: 45, height: 45, borderRadius: 23, backgroundColor: "#d7f5ad" },
  shutterText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  error: { color: "#ffd4cc", fontSize: 12, textAlign: "center" },
  permission: { flex: 1, padding: 28, gap: 15, justifyContent: "center", backgroundColor: "#f5f6f1" },
  permissionTitle: { color: "#173e33", fontSize: 27, fontWeight: "700", letterSpacing: -0.8 },
  permissionText: { color: "#64746a", fontSize: 14, lineHeight: 21 },
  confirm: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#23684d", marginTop: 8 },
  confirmText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  back: { minHeight: 42, alignItems: "center", justifyContent: "center" },
  backText: { color: "#23684d", fontWeight: "700" },
});
