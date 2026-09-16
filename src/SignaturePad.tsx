import React, { useRef, useState } from "react";
import { PanResponder, View, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Button, C, styles } from "./ui";
export default function SignaturePad({
  onChange,
}: {
  onChange: (paths: string[]) => void;
}) {
  const [paths, setPaths] = useState<string[]>([]);
  const current = useRef<string[]>([]),
    width = useRef(300);
  const callback = useRef(onChange);
  callback.current = onChange;
  const point = (x: number, y: number) =>
    `${Math.max(0, Math.min(300, (x * 300) / width.current)).toFixed(1)} ${Math.max(0, Math.min(130, y)).toFixed(1)}`;
  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        current.current = [
          ...current.current,
          `M ${point(e.nativeEvent.locationX, e.nativeEvent.locationY)}`,
        ];
        setPaths([...current.current]);
      },
      onPanResponderMove: (e) => {
        const i = current.current.length - 1;
        current.current[i] +=
          ` L ${point(e.nativeEvent.locationX, e.nativeEvent.locationY)}`;
        setPaths([...current.current]);
      },
      onPanResponderRelease: () =>
        callback.current(current.current.filter((p) => p.includes(" L "))),
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.label}>Draw your signature</Text>
      <View
        onLayout={(e) => {
          width.current = e.nativeEvent.layout.width;
        }}
        {...responder.panHandlers}
        style={{
          height: 130,
          backgroundColor: "white",
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: 12,
        }}
      >
        <Svg
          width="100%"
          height={130}
          viewBox="0 0 300 130"
          preserveAspectRatio="none"
        >
          {paths.map((d, i) => (
            <Path
              key={i}
              d={d}
              fill="none"
              stroke={C.ink}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </Svg>
      </View>
      <Button
        secondary
        title="Clear signature"
        onPress={() => {
          current.current = [];
          setPaths([]);
          onChange([]);
        }}
      />
    </View>
  );
}
