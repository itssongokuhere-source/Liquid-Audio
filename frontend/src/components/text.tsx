import { forwardRef } from "react";
import { Text as RNText, StyleSheet, type TextProps, type TextStyle } from "react-native";

/** Inter font family — loaded via expo-font in the root layout. */
export const FONTS = {
  "Inter-Regular": require("../../assets/fonts/Inter-Regular.ttf"),
  "Inter-Medium": require("../../assets/fonts/Inter-Medium.ttf"),
  "Inter-SemiBold": require("../../assets/fonts/Inter-SemiBold.ttf"),
  "Inter-Bold": require("../../assets/fonts/Inter-Bold.ttf"),
  "Inter-ExtraBold": require("../../assets/fonts/Inter-ExtraBold.ttf"),
};

export function fontFor(weight?: TextStyle["fontWeight"]): string {
  const w = weight === "bold" ? 700 : weight === "normal" || weight == null ? 400 : Number(weight);
  if (w >= 800) return "Inter-ExtraBold";
  if (w >= 700) return "Inter-Bold";
  if (w >= 600) return "Inter-SemiBold";
  if (w >= 500) return "Inter-Medium";
  return "Inter-Regular";
}

/**
 * Drop-in replacement for RN's Text that applies the Inter family based on
 * the requested fontWeight (weights are baked into separate font files).
 */
export const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  const flat = (StyleSheet.flatten(style) as TextStyle | undefined) ?? {};
  const { fontWeight, ...restStyle } = flat;
  return (
    <RNText
      ref={ref}
      {...rest}
      style={[restStyle, { fontFamily: restStyle.fontFamily ?? fontFor(fontWeight) }]}
    />
  );
});
