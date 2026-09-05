import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  FadeInDown,
  FadeOutUp,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { Text } from "@/src/components/text";
import { useTheme } from "@/src/theme";

function Blob({ color, delay, size }: { color: string; delay: number; size: number }) {
  const s = useSharedValue(0.7);
  const y = useSharedValue(0);
  useEffect(() => {
    s.value = withRepeat(
      withSequence(
        withTiming(1.25, { duration: 520, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.7, { duration: 520, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    y.value = withRepeat(
      withSequence(withTiming(-6, { duration: 520 + delay }), withTiming(0, { duration: 520 + delay })),
      -1,
      true,
    );
    return () => {
      cancelAnimation(s);
      cancelAnimation(y);
    };
  }, [s, y, delay]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { translateY: y.value }] }));
  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.9 }, style]}
    />
  );
}

/** Liquid "drops" refresh indicator shown while the feed is being rebuilt. */
export function LiquidRefresh({ visible, label = "Refreshing your feed…" }: { visible: boolean; label?: string }) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(18)}
      exiting={FadeOutUp.duration(220)}
      style={[styles.pill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.glassBorder }]}
      testID="liquid-refresh"
    >
      <View style={styles.blobs}>
        <Blob color={colors.brandPrimary} delay={0} size={10} />
        <Blob color={colors.brandSecondary} delay={90} size={12} />
        <Blob color={colors.brandPrimary} delay={180} size={10} />
      </View>
      <Text style={[styles.label, { color: colors.onSurface }]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 14,
    marginBottom: 10,
  },
  blobs: { flexDirection: "row", alignItems: "center", gap: 6, width: 44, justifyContent: "center" },
  label: { fontSize: 13, fontWeight: "600" },
});
