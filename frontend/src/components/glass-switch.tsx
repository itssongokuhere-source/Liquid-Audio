import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

import { haptic } from "@/src/lib/haptics";

const W = 52;
const H = 30;
const KNOB = 24;

/** Premium spring-animated toggle (UI-thread, high-refresh-rate friendly). */
export function GlassSwitch({
  value,
  onValueChange,
  onColor,
  offColor,
  knobColor = "#FFFFFF",
  testID,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  onColor: string;
  offColor: string;
  knobColor?: string;
  testID?: string;
}) {
  const progress = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 16, stiffness: 260, mass: 0.7 });
  }, [value, progress]);

  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [offColor, onColor]),
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [
      { translateX: (H - KNOB) / 2 + progress.value * (W - KNOB - (H - KNOB)) },
      { scale: 1 + Math.sin(progress.value * Math.PI) * 0.12 },
    ],
  }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => {
        haptic.selection();
        onValueChange(!value);
      }}
      hitSlop={8}
    >
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.knob, { backgroundColor: knobColor }, knob]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { width: W, height: H, borderRadius: H / 2, justifyContent: "center" },
  knob: { width: KNOB, height: KNOB, borderRadius: KNOB / 2 },
});
