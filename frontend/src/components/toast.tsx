import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/src/components/glass";
import { Icon, type IconName } from "@/src/components/icon";
import { makeStyles, useTheme } from "@/src/theme";

type ToastType = "success" | "error" | "info";
type ToastState = { message: string; type: ToastType } | null;

const ToastContext = createContext<(message: string, type?: ToastType) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(-20);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (message: string, type: ToastType = "info") => {
      setToast({ message, type });
      opacity.value = withTiming(1, { duration: 220 });
      translateY.value = withTiming(0, { duration: 260 });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        opacity.value = withTiming(0, { duration: 240 });
        translateY.value = withTiming(-20, { duration: 240 });
      }, 2200);
    },
    [opacity, translateY],
  );

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const iconName: IconName =
    toast?.type === "success"
      ? "checkmark-circle"
      : toast?.type === "error"
        ? "alert-circle"
        : "information-circle";
  const iconColor =
    toast?.type === "success"
      ? colors.success
      : toast?.type === "error"
        ? colors.error
        : colors.brandPrimary;

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.wrap, { top: insets.top + 8 }, animStyle]}
          testID="app-toast"
        >
          <Glass intensity={60} style={styles.glass}>
            <Icon name={iconName} size={20} color={iconColor} />
            <Text style={styles.text} numberOfLines={2}>
              {toast.message}
            </Text>
          </Glass>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    zIndex: 1000,
  },
  glass: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    maxWidth: 420,
  },
  text: {
    color: colors.onSurface,
    fontSize: 14,
    fontWeight: "600",
    flexShrink: 1,
  },
}));
