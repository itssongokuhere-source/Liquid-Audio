import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AudioProvider } from "@/src/components/audio-context";
import { DownloadsProvider } from "@/src/components/downloads-context";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { ToastProvider } from "@/src/components/toast";
import { TrackActionsProvider } from "@/src/components/track-actions";
import { storage } from "@/src/utils/storage";
import { queryClient } from "@/src/query-client";
import { setAppScheme, useTheme, type ColorScheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

const SCHEME_KEY = "liquidaudio.scheme";

function ThemedStack() {
  const { scheme, colors } = useTheme();
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="player"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
        <Stack.Screen
          name="lyrics"
          options={{ presentation: "modal", animation: "fade" }}
        />
        <Stack.Screen
          name="queue"
          options={{ presentation: "modal", animation: "slide_from_bottom" }}
        />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  useEffect(() => {
    storage.getItem<string>(SCHEME_KEY, "dark").then((val) => {
      if (val === "system") setAppScheme(null);
      else setAppScheme((val as ColorScheme) ?? "dark");
    });
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <SafeAreaProvider>
              <ToastProvider>
                <DownloadsProvider>
                  <AudioProvider>
                    <TrackActionsProvider>
                      <ThemedStack />
                    </TrackActionsProvider>
                  </AudioProvider>
                </DownloadsProvider>
              </ToastProvider>
            </SafeAreaProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
