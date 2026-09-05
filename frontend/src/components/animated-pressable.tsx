import type { ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

/**
 * Pressable with a UI-thread spring scale (runs at the display's native refresh
 * rate — 120Hz on ProMotion / high-refresh Android). Use for every icon button.
 */
export function AnimatedPressable({
  children,
  onPress,
  style,
  scaleTo = 0.86,
  disabled,
  hitSlop = 8,
  testID,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  disabled?: boolean;
  hitSlop?: number;
  testID?: string;
}) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const flat = StyleSheet.flatten(style) as ViewStyle | undefined;
  const outer = flat?.flex != null ? { flex: flat.flex, minWidth: 0 } : undefined;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      style={outer}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, { damping: 14, stiffness: 400, mass: 0.6 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 300, mass: 0.7 });
      }}
    >
      <Animated.View style={[style, anim, disabled && { opacity: 0.5 }]}>{children}</Animated.View>
    </Pressable>
  );
}
