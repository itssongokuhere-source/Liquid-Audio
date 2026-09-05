import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";

import { AdaptiveTheme } from "@/src/components/adaptive-theme";
import { AudioProvider } from "@/src/components/audio-context";
import { DownloadsProvider } from "@/src/components/downloads-context";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { JamProvider } from "@/src/components/jam-context";
import { MiniPlayer } from "@/src/components/mini-player";
import { TAB_BAR_BASE } from "@/src/lib/layout";
import { FONTS } from "@/src/components/text";
import { ToastProvider, useToast } from "@/src/components/toast";
import { TrackActionsProvider } from "@/src/components/track-actions";
import { UpdatesProvider } from "@/src/components/updates-context";
import { SettingsProvider } from "@/src/lib/settings-context";
import { storage } from "@/src/utils/storage";
import { queryClient } from "@/src/query-client";
import { setAppScheme, useTheme, type ColorScheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

const SCHEME_KEY = "liquidaudio.scheme";

const FULLSCREEN_ROUTES = ["/player", "/lyrics", "/queue", "/jam"];
const TAB_ROUTES = ["/", "/search", "/equalizer", "/library"];

function GlobalMiniPlayer() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  if (FULLSCREEN_ROUTES.some((r) => pathname.startsWith(r))) return null;
  const onTabs = TAB_ROUTES.includes(pathname);
  return <MiniPlayer bottomOffset={onTabs ? TAB_BAR_BASE + insets.bottom : insets.bottom} />;
}

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
        <Stack.Screen name="settings" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="jam" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
        <Stack.Screen name="mix/[id]" options={{ animation: "slide_from_right" }} />
      </Stack>
      <GlobalMiniPlayer />
    </>
  );
}

function UpdatesWithToast({ children }: { children: React.ReactNode }) {
  const toast = useToast();
  return (
    <UpdatesProvider
      onUpdateAvailable={(rel) => toast(`LiquidAudio ${rel.version} is available — open Settings to update`, "info")}
    >
      {children}
    </UpdatesProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(FONTS);

  useEffect(() => {
    storage.getItem<string>(SCHEME_KEY, "dark").then((val) => {
      if (val === "system") setAppScheme(null);
      else setAppScheme((val as ColorScheme) ?? "dark");
    });
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <KeyboardProvider>
            <SafeAreaProvider>
              <ToastProvider>
                <SettingsProvider>
                  <UpdatesWithToast>
                    <DownloadsProvider>
                      <AudioProvider>
                        <AdaptiveTheme />
                        <JamProvider>
                          <TrackActionsProvider>
                            <ThemedStack />
                          </TrackActionsProvider>
                        </JamProvider>
                      </AudioProvider>
                    </DownloadsProvider>
                  </UpdatesWithToast>
                </SettingsProvider>
              </ToastProvider>
            </SafeAreaProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
