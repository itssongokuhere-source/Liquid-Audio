import Constants from "expo-constants";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import * as Updates from "expo-updates";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Linking, Platform } from "react-native";

import { fetchAppVersion, type AppRelease } from "@/src/lib/api";
import { haptic } from "@/src/lib/haptics";

export type UpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installing"
  | "ota-ready"
  | "error";

type UpdatesContextValue = {
  currentVersion: string;
  buildNumber: string;
  status: UpdateStatus;
  progress: number;
  latest: AppRelease | null;
  error: string | null;
  lastChecked: number | null;
  canInstallDirectly: boolean;
  check: (manual?: boolean) => Promise<void>;
  downloadAndInstall: () => Promise<void>;
  applyOta: () => Promise<void>;
};

const UpdatesContext = createContext<UpdatesContextValue | null>(null);

export function useUpdates(): UpdatesContextValue {
  const ctx = useContext(UpdatesContext);
  if (!ctx) throw new Error("useUpdates must be used within UpdatesProvider");
  return ctx;
}

export function UpdatesProvider({
  children,
  onUpdateAvailable,
}: {
  children: ReactNode;
  onUpdateAvailable?: (release: AppRelease) => void;
}) {
  const currentVersion = Constants.expoConfig?.version ?? "1.0.0";
  const buildNumber =
    (Platform.OS === "ios"
      ? Constants.expoConfig?.ios?.buildNumber
      : String(Constants.expoConfig?.android?.versionCode ?? "")) || "dev";

  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [latest, setLatest] = useState<AppRelease | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const notifiedRef = useRef<string | null>(null);

  const canInstallDirectly = Platform.OS === "android" && Constants.appOwnership !== "expo";

  const check = useCallback(
    async (manual = false) => {
      setStatus("checking");
      setError(null);
      try {
        // 1) Silent over-the-air JS/asset fixes (only on a production build with updates enabled).
        if (Updates.isEnabled && !__DEV__) {
          try {
            const res = await Updates.checkForUpdateAsync();
            if (res.isAvailable) {
              await Updates.fetchUpdateAsync();
              setStatus("ota-ready");
              setLastChecked(Date.now());
              return;
            }
          } catch {
            // OTA not configured – fall through to APK check
          }
        }
        // 2) Full app release (APK) from our release manifest.
        const platform = Platform.OS === "ios" ? "ios" : "android";
        const res = await fetchAppVersion(currentVersion, platform);
        setLatest(res.latest);
        setLastChecked(Date.now());
        if (res.update_available && res.latest) {
          setStatus("available");
          if (notifiedRef.current !== res.latest.version) {
            notifiedRef.current = res.latest.version;
            onUpdateAvailable?.(res.latest);
          }
        } else {
          setStatus("up-to-date");
        }
      } catch (e) {
        setStatus("error");
        setError(manual ? "Couldn't reach the update server" : null);
      }
    },
    [currentVersion, onUpdateAvailable],
  );

  const downloadAndInstall = useCallback(async () => {
    if (!latest) return;
    haptic.medium();
    setError(null);
    if (!canInstallDirectly) {
      // Web / iOS / Expo Go: hand off to the browser.
      await Linking.openURL(latest.apk_url).catch(() => setError("Couldn't open the download link"));
      return;
    }
    try {
      setStatus("downloading");
      setProgress(0);
      const dest = `${FileSystem.cacheDirectory}LiquidAudio-${latest.version}.apk`;
      const task = FileSystem.createDownloadResumable(latest.apk_url, dest, {}, (p) => {
        if (p.totalBytesExpectedToWrite > 0) {
          setProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
        }
      });
      const result = await task.downloadAsync();
      if (!result?.uri) throw new Error("download failed");
      setProgress(1);
      setStatus("installing");
      const contentUri = await FileSystem.getContentUriAsync(result.uri);
      await IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
        data: contentUri,
        flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
        type: "application/vnd.android.package-archive",
      });
      haptic.success();
      setStatus("available");
    } catch (e) {
      setStatus("available");
      setError("Install failed — opening the download in your browser");
      Linking.openURL(latest.apk_url).catch(() => {});
    }
  }, [latest, canInstallDirectly]);

  const applyOta = useCallback(async () => {
    try {
      await Updates.reloadAsync();
    } catch {
      setError("Restart the app to apply the update");
    }
  }, []);

  // Silent check shortly after launch.
  useEffect(() => {
    const t = setTimeout(() => {
      check(false).catch(() => {});
    }, 2500);
    return () => clearTimeout(t);
  }, [check]);

  const value = useMemo<UpdatesContextValue>(
    () => ({
      currentVersion,
      buildNumber,
      status,
      progress,
      latest,
      error,
      lastChecked,
      canInstallDirectly,
      check,
      downloadAndInstall,
      applyOta,
    }),
    [currentVersion, buildNumber, status, progress, latest, error, lastChecked, canInstallDirectly, check, downloadAndInstall, applyOta],
  );

  return <UpdatesContext.Provider value={value}>{children}</UpdatesContext.Provider>;
}
