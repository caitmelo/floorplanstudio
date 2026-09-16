import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Platform,
  AppState,
  Linking,
  ActivityIndicator,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { DeviceMotion } from "expo-sensors";
import { useKeepAwake } from "expo-keep-awake";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { Directory, File, Paths } from "expo-file-system";
import WebView from "react-native-webview";
import { Button, styles as s, C } from "../ui";
import { Evidence, uid } from "../model";
import { imageData, fileURI } from "../storage";
import {
  Quaternion,
  IDENTITY,
  integrate,
  matrix,
  aim,
  wrap,
  distance,
  TARGETS,
  focalPixels,
} from "./pose";
import { COMPOSER_HTML, viewerHTML } from "./engine";
type Frame = {
  path: string;
  preview: string;
  matrix: number[];
  focal: number;
  width: number;
  height: number;
  capturedAt: string;
};
type Result = Omit<Evidence, "id" | "kind" | "caption">;
export function PanoramaViewer({ path }: { path: string }) {
  const [data, setData] = useState(""),
    [error, setError] = useState("");
  const web = useRef<WebView>(null);
  useEffect(() => {
    let active = true;
    imageData(path)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
    };
  }, [path]);
  const html = React.useMemo(() => (data ? viewerHTML(data) : ""), [data]);
  if (Platform.OS === "web")
    return (
      <Text style={s.body}>Open this panorama in Expo Go on your iPhone.</Text>
    );
  return (
    <View style={{ flex: 1, gap: 12 }}>
      {error ? (
        <Text style={s.body}>{error}</Text>
      ) : data ? (
        <WebView
          ref={web}
          originWhitelist={["*"]}
          source={{ html }}
          javaScriptEnabled
          onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
          onMessage={(e) => {
            try {
              const m = JSON.parse(e.nativeEvent.data);
              if (m.type === "error") setError(m.message);
            } catch {}
          }}
          onError={(e) => setError(e.nativeEvent.description)}
          style={{ flex: 1 }}
        />
      ) : (
        <ActivityIndicator />
      )}
      <View style={{ flexDirection: "row", gap: 12, padding: 14 }}>
        <Button
          title="− Zoom out"
          onPress={() => web.current?.injectJavaScript("window.zoom(10);true;")}
        />
        <Button
          title="+ Zoom in"
          onPress={() =>
            web.current?.injectJavaScript("window.zoom(-10);true;")
          }
        />
      </View>
    </View>
  );
}
export default function ExpoPanorama({
  onSave,
}: {
  onSave: (result: Result) => Promise<void>;
}) {
  useKeepAwake();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null),
    web = useRef<WebView>(null),
    alive = useRef(true),
    saving = useRef(false);
  const frames = useRef<Frame[]>([]),
    q = useRef<Quaternion>([...IDENTITY]),
    lastTime = useRef(0),
    sensorTime = useRef(0),
    speed = useRef(999),
    level = useRef(false),
    motionStarted = useRef(false),
    holding = useRef(0);
  const [motion, setMotion] = useState(false),
    [ready, setReady] = useState(false),
    [count, setCount] = useState(0),
    [hint, setHint] = useState("Allow camera and motion access to begin."),
    [aligned, setAligned] = useState(false),
    [error, setError] = useState(""),
    [fatal, setFatal] = useState(false),
    [taking, setTaking] = useState(false),
    [stage, setStage] = useState<"capture" | "compose" | "review">("capture"),
    [percent, setPercent] = useState(0),
    [result, setResult] = useState<Result>();
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const folder = useRef(`captures/expo-${uid()}`),
    flags = useRef<string[]>([
      "Experimental motion-guided stitching: review seams and original photos.",
    ]);
  const outputFile = (name: string) =>
    new File(Paths.document, folder.current, name);
  const ensureFolder = () =>
    new Directory(Paths.document, folder.current).create({
      intermediates: true,
      idempotent: true,
    });
  function persist(complete = false, coverage?: number) {
    ensureFolder();
    outputFile("manifest.json").write(
      JSON.stringify(
        {
          version: 1,
          projection: "equirectangular",
          capture: "expo-go-gyro",
          complete,
          coverage,
          qualityFlags: flags.current,
          frames: frames.current,
        },
        null,
        2,
      ),
    );
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (
        state !== "active" &&
        motionStarted.current &&
        stageRef.current === "capture"
      ) {
        setFatal(true);
        setError(
          "Capture was interrupted. Close and start a new panorama so the views stay aligned.",
        );
      }
    });
    return () => sub.remove();
  }, []);
  async function enable() {
    try {
      if (Platform.OS !== "ios")
        throw new Error("This capture is designed for Expo Go on iPhone.");
      if (!(await requestPermission()).granted)
        throw new Error("Allow camera access in Settings to capture a room.");
      if (!(await DeviceMotion.requestPermissionsAsync()).granted)
        throw new Error(
          "Allow Motion & Fitness access in Settings to guide the panorama.",
        );
      if (!(await DeviceMotion.isAvailableAsync()))
        throw new Error("Motion sensors are not available.");
      setError("");
      setMotion(true);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  }
  useEffect(() => {
    if (!motion) return;
    DeviceMotion.setUpdateInterval(50);
    const sub = DeviceMotion.addListener((m) => {
      const now = m.rotation.timestamp,
        dt = lastTime.current ? now - lastTime.current : 0;
      lastTime.current = now;
      sensorTime.current = Date.now();
      const g = m.accelerationIncludingGravity;
      level.current =
        !!g && g.y < -8.8 && Math.abs(g.x) < 1.4 && Math.abs(g.z) < 1.4;
      if (m.rotationRate) {
        speed.current = Math.hypot(
          m.rotationRate.alpha,
          m.rotationRate.beta,
          m.rotationRate.gamma,
        );
        if (motionStarted.current) {
          if (dt >= 0.25 && stageRef.current === "capture") {
            setFatal(true);
            setError(
              "Motion readings were interrupted. Close and restart this panorama.",
            );
          }
          q.current = integrate(q.current, m.rotationRate, dt);
        }
      }
    });
    return () => sub.remove();
  }, [motion]);
  const captureRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    const timer = setInterval(() => {
      if (stageRef.current !== "capture" || fatal || saving.current) return;
      const target = TARGETS[frames.current.length];
      if (!target) return;
      if (!motion || Date.now() - sensorTime.current > 600) {
        setAligned(false);
        setHint("Waiting for motion sensors…");
        holding.current = 0;
        return;
      }
      const a = aim(q.current),
        dy = wrap(target.yaw - a.yaw),
        dp = target.pitch - a.pitch;
      const first = !frames.current.length;
      const match = first
        ? level.current
        : Math.abs(dp) < 6 && (Math.abs(target.pitch) > 85 || Math.abs(dy) < 6);
      const still = speed.current < 2;
      if (match && still) {
        if (!holding.current) holding.current = Date.now();
      } else holding.current = 0;
      const held = !!holding.current && Date.now() - holding.current > 800;
      setAligned(held);
      setHint(
        !match
          ? first
            ? "Hold the phone upright and level."
            : `${Math.abs(dy) > 6 && Math.abs(target.pitch) < 85 ? `Turn ${dy > 0 ? "right" : "left"} ${Math.round(Math.abs(dy))}°. ` : ""}${Math.abs(dp) > 6 ? `Tilt ${dp > 0 ? "up" : "down"} ${Math.round(Math.abs(dp))}°.` : ""}`
          : !still
            ? "Hold still."
            : held
              ? "Aligned — hold your position."
              : "Hold still for capture…",
      );
      if (held && !first) void captureRef.current();
    }, 100);
    return () => clearInterval(timer);
  }, [motion, fatal]);
  async function take() {
    if (
      saving.current ||
      !ready ||
      fatal ||
      stageRef.current !== "capture" ||
      Date.now() - sensorTime.current > 600
    )
      return;
    saving.current = true;
    setTaking(true);
    setError("");
    if (!frames.current.length) {
      q.current = [...IDENTITY];
      motionStarted.current = true;
    }
    const before: [number, number, number, number] = [...q.current];
    try {
      const photo = await camera.current!.takePictureAsync({
        quality: 0.95,
        exif: true,
        skipProcessing: false,
        shutterSound: false,
      });
      if (!alive.current) return;
      if (!photo)
        throw new Error("The camera did not return a photo. Try again.");
      if (distance(before, q.current) > 2)
        throw new Error(
          "The phone moved during the photo. Hold still to retry.",
        );
      if (photo.width > photo.height)
        throw new Error("Keep the phone in portrait orientation and retry.");
      ensureFolder();
      const index = frames.current.length,
        raw = `frame-${index}.jpg`,
        thumb = `preview-${index}.jpg`;
      new File(photo.uri).copy(outputFile(raw));
      const small = await manipulateAsync(
        photo.uri,
        [{ resize: { width: 768 } }],
        { compress: 0.9, format: SaveFormat.JPEG },
      );
      if (!alive.current) return;
      new File(small.uri).copy(outputFile(thumb));
      const f = focalPixels(
        small.width,
        small.height,
        photo.exif?.FocalLenIn35mmFilm ??
          photo.exif?.FocalLengthIn35mmFilm ??
          photo.exif?.FocalLengthIn35mmFormat,
      );
      if (
        f.estimated &&
        !flags.current.includes(
          "Lens field of view estimated from a 24 mm equivalent lens.",
        )
      )
        flags.current.push(
          "Lens field of view estimated from a 24 mm equivalent lens.",
        );
      frames.current.push({
        path: `${folder.current}/${raw}`,
        preview: `${folder.current}/${thumb}`,
        matrix: matrix(before),
        focal: f.focal,
        width: small.width,
        height: small.height,
        capturedAt: new Date().toISOString(),
      });
      persist();
      setCount(frames.current.length);
      holding.current = 0;
      setAligned(false);
      if (frames.current.length === TARGETS.length) {
        stageRef.current = "compose";
        setStage("compose");
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : String(e));
      holding.current = 0;
    } finally {
      saving.current = false;
      if (alive.current) setTaking(false);
    }
  }
  captureRef.current = take;
  async function receive(text: string) {
    try {
      const message = JSON.parse(text);
      if (message.type === "error") throw new Error(message.message);
      if (message.type === "next") {
        const index = message.index;
        setPercent(Math.round((index / TARGETS.length) * 100));
        if (index === frames.current.length) {
          web.current?.injectJavaScript("window.receive({finish:true});true;");
          return;
        }
        const frame = frames.current[index];
        if (!frame) throw new Error("Panorama frame is missing.");
        const data = await imageData(frame.preview);
        if (!alive.current) return;
        web.current?.injectJavaScript(
          `window.receive(${JSON.stringify({ data, matrix: frame.matrix, focal: frame.focal })});true;`,
        );
      } else if (message.type === "done") {
        if (
          typeof message.data !== "string" ||
          !Number.isFinite(message.coverage)
        )
          throw new Error("Invalid panorama output.");
        outputFile("panorama.jpg").write(message.data, { encoding: "base64" });
        persist(true, message.coverage);
        setResult({
          path: `${folder.current}/panorama.jpg`,
          sourceDirectory: folder.current,
          coverage: message.coverage,
          width: message.width,
          height: message.height,
          qualityFlags: flags.current,
          capturedAt: new Date().toISOString(),
        });
        setStage("review");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  if (stage === "review" && result)
    return (
      <View style={{ flex: 1, padding: 12, gap: 10 }}>
        <PanoramaViewer path={result.path} />
        <Text style={s.body}>
          {Math.round((result.coverage ?? 0) * 100)}% of sphere covered. Review
          seams and gaps before saving. Original photos are retained.
        </Text>
        {!!error && <Text style={s.body}>{error}</Text>}
        <Button
          title={taking ? "Saving…" : "Save panorama to this room"}
          disabled={taking}
          onPress={async () => {
            setTaking(true);
            try {
              await onSave(result);
            } catch (e) {
              setError(String(e));
            } finally {
              if (alive.current) setTaking(false);
            }
          }}
        />
      </View>
    );
  if (stage === "compose")
    return (
      <View style={{ flex: 1, padding: 22, gap: 20, justifyContent: "center" }}>
        <ActivityIndicator color={C.green} />
        <Text style={s.h2}>Stitching your room · {percent}%</Text>
        <Text style={s.body}>
          Keep this screen open. Photos are processed on your phone.
        </Text>
        {!!error && (
          <>
            <Text style={s.body}>{error}</Text>
            <Button
              title="Retry stitching"
              onPress={() => {
                setError("");
                setPercent(0);
                web.current?.reload();
              }}
            />
          </>
        )}
        <View style={{ width: 2, height: 2, opacity: 0.01 }}>
          <WebView
            ref={web}
            source={{ html: COMPOSER_HTML }}
            originWhitelist={["*"]}
            javaScriptEnabled
            onShouldStartLoadWithRequest={(r) => r.url === "about:blank"}
            onMessage={(e) => void receive(e.nativeEvent.data)}
            onError={(e) => setError(e.nativeEvent.description)}
            onContentProcessDidTerminate={() =>
              setError("Stitching stopped. Tap Retry stitching.")
            }
          />
        </View>
      </View>
    );
  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={s.h2}>
        {count} / {TARGETS.length} views
      </Text>
      <Text style={s.body}>
        {count < 12
          ? "Around the room"
          : count < 24
            ? "Upper walls and ceiling"
            : count < 36
              ? "Lower walls and floor"
              : count === 36
                ? "Ceiling above you"
                : "Floor beneath you"}{" "}
        · Rotate around the camera lens from one spot. Keep the phone portrait.
      </Text>
      {permission?.granted && motion ? (
        <View
          style={{
            flex: 1,
            minHeight: 180,
            borderRadius: 20,
            overflow: "hidden",
            backgroundColor: "#10251f",
          }}
        >
          <CameraView
            ref={camera}
            facing="back"
            selectedLens="builtInWideAngleCamera"
            zoom={0}
            mirror={false}
            responsiveOrientationWhenOrientationLocked={false}
            style={{ flex: 1 }}
            onCameraReady={() => setReady(true)}
            onMountError={(e) => setError(e.message)}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              alignSelf: "center",
              top: "43%",
              width: 52,
              height: 52,
              borderRadius: 26,
              borderWidth: 3,
              borderColor: aligned ? "#b9ed75" : "white",
            }}
          />
        </View>
      ) : (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <Text style={s.body}>
            Capture 38 overlapping views for a stitched 360° image, including
            ceiling and floor. After the first photo, capture is automatic when
            aligned and steady.
          </Text>
          <Button
            title="Enable camera & motion"
            onPress={() => void enable()}
          />
        </View>
      )}
      <Text style={[s.label, { color: aligned ? C.green : C.ink }]}>
        {taking ? "Capturing…" : hint}
      </Text>
      {!!error && (
        <Text accessibilityRole="alert" style={s.body}>
          {error}
        </Text>
      )}
      {!permission?.canAskAgain && !permission?.granted && (
        <Button
          title="Open Settings"
          onPress={() => void Linking.openSettings()}
        />
      )}
      <Button
        title={count ? "Capture aligned view" : "Start 360° capture"}
        disabled={!aligned || !ready || taking || fatal}
        onPress={() => void take()}
      />
    </View>
  );
}
