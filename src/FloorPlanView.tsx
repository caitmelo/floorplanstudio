import React, { useState } from "react";
import { Text, View, Pressable } from "react-native";
import Svg, { Line, Text as SvgText, Rect, G } from "react-native-svg";
import { FloorPlan } from "./model";
import { bounds } from "./geometry";
import { C, styles, Tag } from "./ui";
export default function FloorPlanView({
  plan,
  name,
}: {
  plan: FloorPlan;
  name: string;
}) {
  const [selected, setSelected] = useState<string>();
  const b = bounds(plan.surfaces);
  const surface = plan.surfaces.find((s) => s.id === selected);
  return (
    <View style={{ gap: 12 }}>
      <View
        style={{
          backgroundColor: "#edf2e9",
          borderRadius: 18,
          overflow: "hidden",
        }}
      >
        <Svg
          width="100%"
          height={300}
          viewBox={`${b.x} ${b.y} ${b.width} ${b.height}`}
        >
          <Rect
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            fill="#edf2e9"
          />
          {[...plan.surfaces]
            .sort(
              (a, b) => Number(a.kind !== "wall") - Number(b.kind !== "wall"),
            )
            .map((s) => (
              <G key={s.id} onPress={() => setSelected(s.id)}>
                <Line
                  x1={s.a.x}
                  y1={s.a.y}
                  x2={s.b.x}
                  y2={s.b.y}
                  stroke="transparent"
                  strokeWidth={0.25}
                />
                <Line
                  x1={s.a.x}
                  y1={s.a.y}
                  x2={s.b.x}
                  y2={s.b.y}
                  stroke={
                    s.id === selected
                      ? "#db773b"
                      : s.kind === "wall"
                        ? C.ink
                        : s.kind === "window"
                          ? "#4699bd"
                          : "#bca064"
                  }
                  strokeWidth={s.kind === "wall" ? 0.07 : 0.09}
                  strokeLinecap="square"
                />
              </G>
            ))}
          {plan.labels?.length ? (
            plan.labels.map((label) => (
              <SvgText
                key={label.roomId}
                x={label.position.x}
                y={label.position.y}
                textAnchor="middle"
                fill={C.ink}
                fontSize={Math.max(0.19, Math.max(b.width, b.height) * 0.023)}
              >
                {label.name}
              </SvgText>
            ))
          ) : (
            <SvgText
              x={b.x + b.width / 2}
              y={b.y + b.height / 2}
              textAnchor="middle"
              fill={C.ink}
              fontSize={0.19}
            >
              {name}
            </SvgText>
          )}
        </Svg>
      </View>
      <View style={styles.row}>
        <Tag text="Walls" />
        <Tag text="Blue · windows" />
        <Tag text="Gold · openings" />
      </View>
      <Text style={styles.body}>
        {surface
          ? `${surface.kind} · ${surface.length.toFixed(2)} m · ${surface.confidence} confidence`
          : "Tap a wall or opening to inspect its measurement."}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {plan.surfaces
          .filter((s) => s.kind === "wall")
          .map((s, n) => (
            <Pressable
              key={s.id}
              onPress={() => setSelected(s.id)}
              style={{
                padding: 9,
                borderRadius: 8,
                backgroundColor: s.id === selected ? C.lime : C.white,
              }}
            >
              <Text style={styles.label}>
                Wall {n + 1} · {s.length.toFixed(2)} m
              </Text>
            </Pressable>
          ))}
      </View>
    </View>
  );
}
