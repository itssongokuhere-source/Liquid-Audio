import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { StreamQuality } from "@/src/lib/api";
import { ACCENTS, setAccent, type AccentKey } from "@/src/theme";
import { storage } from "@/src/utils/storage";

export type CrossfadeSeconds = 0 | 3 | 6 | 12;

export type Settings = {
  quality: StreamQuality;
  crossfade: CrossfadeSeconds;
  gapless: boolean;
  wifiOnly: boolean;
  adaptiveColors: boolean;
  accent: AccentKey;
  appIcon: string;
};

const KEY = "liquidaudio.settings";

export const DEFAULT_SETTINGS: Settings = {
  quality: "max",
  crossfade: 0,
  gapless: true,
  wifiOnly: false,
  adaptiveColors: true,
  accent: "rose",
  appIcon: "rose",
};

type SettingsContextValue = {
  settings: Settings;
  ready: boolean;
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

export function accentHex(key: AccentKey) {
  return ACCENTS.find((a) => a.key === key)?.hex ?? ACCENTS[0].hex;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    storage
      .getItem<string>(KEY, "")
      .then((raw) => {
        let saved: Partial<Settings> = {};
        try {
          saved = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
        } catch {
          saved = {};
        }
        const merged = { ...DEFAULT_SETTINGS, ...saved };
        setSettings(merged);
        if (!merged.adaptiveColors) setAccent(accentHex(merged.accent));
      })
      .finally(() => setReady(true));
  }, []);

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => {
      const next = { ...s, [key]: value };
      storage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(() => ({ settings, ready, update }), [settings, ready, update]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
