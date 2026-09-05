import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

function Bar({
  color,
  playing,
  duration,
  peak,
  size,
}: {
  color: string;
  playing: boolean;
  duration: number;
  peak: number;
  size: number;
}) {
  const h = useSharedValue(0.3);
  useEffect(() => {
    if (playing) {
      h.value = withRepeat(
        withSequence(
          withTiming(peak, { duration, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.25, { duration: duration * 0.9, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(h);
      h.value = withTiming(0.3, { duration: 250 });
    }
  }, [playing, duration, peak, h]);
  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: h.value }] }));
  return (
    <Animated.View
      style={[
        styles.bar,
        { backgroundColor: color, height: size, width: Math.max(2, size / 6), borderRadius: size / 12 },
        style,
      ]}
    />
  );
}

/** Animated "now playing" equalizer bars — pure UI-thread animation. */
export function PlayingBars({
  color,
  playing,
  size = 18,
}: {
  color: string;
  playing: boolean;
  size?: number;
}) {
  return (
    <View style={[styles.wrap, { height: size, gap: Math.max(2, size / 9) }]} testID="playing-bars">
      <Bar color={color} playing={playing} duration={420} peak={1} size={size} />
      <Bar color={color} playing={playing} duration={560} peak={0.7} size={size} />
      <Bar color={color} playing={playing} duration={380} peak={0.9} size={size} />
      <Bar color={color} playing={playing} duration={620} peak={0.6} size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end" },
  bar: { transformOrigin: "bottom" },
});
