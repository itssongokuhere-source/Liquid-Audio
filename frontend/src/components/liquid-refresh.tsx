import { useEffect, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Gesture, GestureDetector, type NativeGesture } from "react-native-gesture-handler";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { Text } from "@/src/components/text";
import { useTheme } from "@/src/theme";

const TRIGGER = 72;
const HOLD = 64;
const MAX_PULL = 130;

function Blob({ color, index, active, pull }: { color: string; index: number; active: SharedValue<number>; pull: SharedValue<number> }) {
  const bounce = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    const grow = interpolate(pull.value, [0, TRIGGER], [0.2, 1], "clamp");
    const wave = active.value ? bounce.value : 0;
    return {
      opacity: interpolate(pull.value, [0, 20, TRIGGER], [0, 0.4, 1], "clamp"),
      transform: [{ scale: grow * (1 + wave * 0.35) }, { translateY: -wave * 8 }],
    };
  });
  useEffect(() => {
    bounce.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 420 + index * 110, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 420 + index * 110, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      true,
    );
    return () => cancelAnimation(bounce);
  }, [bounce, index]);
  return <Animated.View style={[styles.blob, { backgroundColor: color }, style]} />;
}

/**
 * Swipe-down-to-refresh with our own liquid effect (works on iOS, Android and web).
 * Wrap a scroll view; pass `scrollGesture` + `onScroll` down to the Animated.ScrollView.
 */
export function PullToRefresh({
  refreshing,
  onRefresh,
  label = "Refreshing your feed…",
  excludeTop = 0,
  children,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  label?: string;
  /** Height at the top (sticky header / chips) where the pull gesture must never start. */
  excludeTop?: number;
  children: (props: { scrollGesture: NativeGesture; onScroll: ReturnType<typeof useAnimatedScrollHandler> }) => ReactNode;
}) {
  const { colors } = useTheme();
  const scrollY = useSharedValue(0);
  const pull = useSharedValue(0);
  const active = useSharedValue(0);
  const busy = useSharedValue(refreshing ? 1 : 0);

  useEffect(() => {
    busy.value = refreshing ? 1 : 0;
    active.value = refreshing ? 1 : 0;
    if (refreshing) {
      pull.value = withSpring(HOLD, { damping: 18, stiffness: 220 });
    } else {
      pull.value = withSpring(0, { damping: 20, stiffness: 200 });
    }
  }, [refreshing, busy, active, pull]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const scrollGesture = Gesture.Native();
  const pan = Gesture.Pan()
    .hitSlop({ top: -excludeTop })
    .activeOffsetY([12, 9999])
    .failOffsetX([-20, 20])
    .simultaneousWithExternalGesture(scrollGesture)
    .onUpdate((e) => {
      if (busy.value || scrollY.value > 2) return;
      const d = Math.max(0, e.translationY - 12);
      pull.value = Math.min(MAX_PULL, d * 0.62);
    })
    .onEnd(() => {
      if (busy.value) return;
      if (pull.value >= TRIGGER) {
        busy.value = 1;
        active.value = 1;
        pull.value = withSpring(HOLD, { damping: 18, stiffness: 220 });
        runOnJS(onRefresh)();
      } else {
        pull.value = withSpring(0, { damping: 20, stiffness: 200 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({ transform: [{ translateY: pull.value }] }));
  const headerStyle = useAnimatedStyle(() => ({
    height: pull.value,
    opacity: interpolate(pull.value, [0, 16], [0, 1], "clamp"),
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: active.value ? 1 : interpolate(pull.value, [TRIGGER - 20, TRIGGER], [0, 1], "clamp"),
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }} collapsable={false}>
        <Animated.View style={[styles.header, { pointerEvents: "none" }, headerStyle]} testID="liquid-refresh">
          <View style={styles.blobs}>
            <Blob color={colors.brandPrimary} index={0} active={active} pull={pull} />
            <Blob color={colors.brandSecondary} index={1} active={active} pull={pull} />
            <Blob color={colors.brandPrimary} index={2} active={active} pull={pull} />
          </View>
          <Animated.Text style={[styles.label, { color: colors.onSurface }, labelStyle]}>
            {refreshing ? label : "Release to refresh"}
          </Animated.Text>
        </Animated.View>
        <Animated.View style={[{ flex: 1 }, contentStyle]}>{children({ scrollGesture, onScroll })}</Animated.View>
      </View>
    </GestureDetector>
  );
}

/** Inline pill variant (used when refresh is triggered from the header button). */
export function LiquidRefresh({ visible, label = "Refreshing your feed…" }: { visible: boolean; label?: string }) {
  const { colors } = useTheme();
  if (!visible) return null;
  return (
    <View style={[styles.pill, { backgroundColor: colors.surfaceSecondary, borderColor: colors.glassBorder }]} testID="liquid-refresh-pill">
      <Text style={[styles.label, { color: colors.onSurface }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", justifyContent: "flex-end", paddingBottom: 10, overflow: "hidden" },
  blobs: { flexDirection: "row", alignItems: "center", gap: 8, height: 24 },
  blob: { width: 12, height: 12, borderRadius: 6 },
  label: { fontSize: 12, fontWeight: "600", marginTop: 6, fontFamily: "Inter-SemiBold" },
  pill: { alignSelf: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, marginTop: 14, marginBottom: 10 },
});
