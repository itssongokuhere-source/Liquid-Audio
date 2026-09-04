import { BlurView } from "expo-blur";
import type { ReactNode } from "react";
import { Platform, StyleProp, ViewStyle } from "react-native";

import { useTheme } from "@/src/theme";

export function Glass({
  intensity = 40,
  style,
  children,
  testID,
}: {
  intensity?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  testID?: string;
}) {
  const { scheme } = useTheme();
  return (
    <BlurView
      testID={testID}
      intensity={intensity}
      tint={scheme === "dark" ? "dark" : "light"}
      experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
      style={style}
    >
      {children}
    </BlurView>
  );
}
