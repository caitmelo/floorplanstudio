import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Path, Circle, Rect, Line } from "react-native-svg";
export const C = {
  ink: "#173e33",
  green: "#23684d",
  lime: "#d9edbc",
  paper: "#f5f6f1",
  white: "#ffffff",
  muted: "#77827a",
  line: "#e0e6dd",
  amber: "#a66b26",
  amberBg: "#fcf0dc",
  red: "#ad5142",
};
export function Icon({
  name,
  color = C.ink,
  size = 22,
}: {
  name: string;
  color?: string;
  size?: number;
}) {
  const paths: Record<string, string> = {
    home: "M3 10 12 3 21 10V21H15V14H9V21H3Z",
    scan: "M8 3H3V8M16 3H21V8M21 16V21H16M8 21H3V16M7 12H17M12 7V17",
    camera: "M3 7H7L9 4H15L17 7H21V20H3ZM16 13A4 4 0 1 0 8 13A4 4 0 1 0 16 13",
    plan: "M3 3H21V21H3ZM3 11H12V3M12 11V16M12 21V19M12 14H21",
    report: "M5 3H15L20 8V21H5ZM15 3V8H20M9 12H16M9 16H16",
    arrow: "M5 12H19M14 7L19 12 14 17",
    back: "M19 12H5M10 7L5 12 10 17",
    plus: "M12 5V19M5 12H19",
    check: "M5 12L10 17 20 6",
    close: "M6 6L18 18M18 6L6 18",
    globe:
      "M3 12H21M12 3C6 7 6 17 12 21C18 17 18 7 12 3M21 12A9 9 0 1 0 3 12A9 9 0 1 0 21 12",
    chevron: "M9 5L16 12 9 19",
    edit: "M4 16L16 4 20 8 8 20H4ZM14 6L18 10",
    shield:
      "M12 3L21 7V13C21 17 17 20 12 22C7 20 3 17 3 13V7ZM8 12L11 15 16 10",
    clock: "M12 7V12L16 15M21 12A9 9 0 1 0 3 12A9 9 0 1 0 21 12",
    compare: "M8 3V21M16 3V21M3 8L8 3 13 8M11 16L16 21 21 16",
    warning: "M12 3L22 21H2ZM12 9V14M12 17V18",
  };
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d={paths[name] || paths.home} />
    </Svg>
  );
}
export function Button({
  title,
  onPress,
  secondary,
  disabled,
  icon,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary && styles.secondary,
        { opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      {icon && (
        <Icon name={icon} color={secondary ? C.ink : C.white} size={19} />
      )}
      <Text style={[styles.buttonText, secondary && { color: C.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.muted}
        multiline={multiline}
        style={[
          styles.input,
          multiline && { height: 100, textAlignVertical: "top" },
        ]}
      />
    </View>
  );
}
export function Tag({ text, amber }: { text: string; amber?: boolean }) {
  return (
    <View style={[styles.tag, amber && { backgroundColor: C.amberBg }]}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: "700",
          color: amber ? C.amber : C.green,
        }}
      >
        {text}
      </Text>
    </View>
  );
}
export function SectionTitle({
  title,
  right,
  onPress,
}: {
  title: string;
  right?: string;
  onPress?: () => void;
}) {
  return (
    <View style={styles.between}>
      <Text style={styles.h2}>{title}</Text>
      {right && (
        <Pressable onPress={onPress} accessibilityRole="button">
          <Text style={{ color: C.green, fontWeight: "600", fontSize: 13 }}>
            {right}
          </Text>
        </Pressable>
      )}
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: C.paper },
  content: {
    padding: 22,
    gap: 22,
    paddingBottom: 36,
    width: "100%",
    maxWidth: 700,
    alignSelf: "center",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    fontSize: 34,
    fontWeight: "600",
    color: C.ink,
    letterSpacing: -1.3,
    lineHeight: 40,
  },
  h2: { fontSize: 19, fontWeight: "600", color: C.ink, letterSpacing: -0.4 },
  body: { fontSize: 14, lineHeight: 21, color: C.muted },
  label: { fontSize: 12, fontWeight: "600", color: C.ink },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 2,
    color: C.muted,
    fontWeight: "700",
  },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.white,
    borderRadius: 18,
    gap: 14,
  },
  button: {
    minHeight: 50,
    borderRadius: 12,
    backgroundColor: C.green,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  buttonText: { fontSize: 14, color: "white", fontWeight: "600" },
  secondary: { backgroundColor: C.white, borderWidth: 1, borderColor: C.line },
  input: {
    minHeight: 49,
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 14,
    fontSize: 15,
    color: C.ink,
  },
  tag: {
    borderRadius: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: "#edf4e6",
  },
  divider: { height: 1, backgroundColor: C.line },
});
