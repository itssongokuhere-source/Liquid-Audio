// Design tokens for LiquidAudio — a premium liquid-glass music app.
// Dark is the primary scheme; light is fully supported. Users can toggle via
// setAppScheme(). Keys mirror the "color" block of /app/design_guidelines.json.

import { useMemo, useSyncExternalStore } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const light = {
  surface: "#FCFCFC",
  onSurface: "#0A0A0A",
  surfaceSecondary: "#FFFFFF",
  onSurfaceSecondary: "#1A1A1A",
  surfaceTertiary: "#F0F0F0",
  onSurfaceTertiary: "#262626",
  surfaceInverse: "#0A0A0A",
  onSurfaceInverse: "#FFFFFF",
  muted: "#6B7280",

  brand: "#E11D48",
  onBrand: "#FFFFFF",
  brandPrimary: "#E11D48",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#BE123C",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#FFE4E6",
  onBrandTertiary: "#881337",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#6B7280",
  onInfo: "#FFFFFF",

  border: "#E5E7EB",
  borderStrong: "#D1D5DB",
  divider: "#F3F4F6",

  // Liquid-glass helpers
  glass: "rgba(255,255,255,0.55)",
  glassStrong: "rgba(255,255,255,0.78)",
  glassBorder: "rgba(255,255,255,0.7)",
  scrim: "rgba(0,0,0,0.28)",
  scrimStrong: "rgba(0,0,0,0.45)",
  playerBackdrop: "#0A0A0A",
  eqTrack: "#E5E7EB",
  skeleton: "#ECECEC",
};

const dark: typeof light = {
  surface: "#050505",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#121212",
  onSurfaceSecondary: "#E5E5E5",
  surfaceTertiary: "#1F1F1F",
  onSurfaceTertiary: "#A3A3A3",
  surfaceInverse: "#FCFCFC",
  onSurfaceInverse: "#0A0A0A",
  muted: "#A3A3A3",

  brand: "#F43F5E",
  onBrand: "#FFFFFF",
  brandPrimary: "#F43F5E",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#E11D48",
  onBrandSecondary: "#FFFFFF",
  brandTertiary: "#4C0519",
  onBrandTertiary: "#FFE4E6",

  success: "#10B981",
  onSuccess: "#FFFFFF",
  warning: "#F59E0B",
  onWarning: "#FFFFFF",
  error: "#EF4444",
  onError: "#FFFFFF",
  info: "#A3A3A3",
  onInfo: "#0A0A0A",

  border: "#262626",
  borderStrong: "#404040",
  divider: "#171717",

  glass: "rgba(18,18,18,0.5)",
  glassStrong: "rgba(10,10,10,0.72)",
  glassBorder: "rgba(255,255,255,0.1)",
  scrim: "rgba(0,0,0,0.4)",
  scrimStrong: "rgba(0,0,0,0.62)",
  playerBackdrop: "#000000",
  eqTrack: "#2A2A2A",
  skeleton: "#1A1A1A",
};

export type ThemeColors = typeof light;

export const defaultScheme: ColorScheme = "dark";
export const themes: { light: ThemeColors; dark: ThemeColors } = { light, dark };

// --- App-level scheme override (works on all platforms incl. web) ----------
let overrideScheme: ColorScheme | null = defaultScheme;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function setAppScheme(scheme: ColorScheme | null) {
  overrideScheme = scheme;
  Appearance.setColorScheme?.(scheme);
  listeners.forEach((l) => l());
}

export function getAppScheme(): ColorScheme | null {
  return overrideScheme;
}

// Keep the old export name working for any framework callers.
export const setColorScheme = setAppScheme;

Appearance.setColorScheme?.(defaultScheme);

// --- Accent colour override (user preset or adaptive from artwork) ----------
export const ACCENTS = [
  { key: "rose", label: "Rose", hex: "#F43F5E" },
  { key: "ocean", label: "Ocean", hex: "#38BDF8" },
  { key: "aurora", label: "Aurora", hex: "#34D399" },
  { key: "gold", label: "Gold", hex: "#FBBF24" },
  { key: "violet", label: "Violet", hex: "#A78BFA" },
  { key: "midnight", label: "Midnight", hex: "#94A3B8" },
] as const;
export type AccentKey = (typeof ACCENTS)[number]["key"];

let accentHex: string | null = null;

export function setAccent(hex: string | null) {
  accentHex = hex && /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toUpperCase() : null;
  listeners.forEach((l) => l());
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]) {
  return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function mix(a: string, b: string, t: number) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return rgbToHex([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

function luminance(hex: string) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function withAccent(base: ThemeColors, hex: string, scheme: ColorScheme): ThemeColors {
  const onBrand = luminance(hex) > 0.6 ? "#0A0A0A" : "#FFFFFF";
  return {
    ...base,
    brand: hex,
    onBrand,
    brandPrimary: hex,
    onBrandPrimary: onBrand,
    brandSecondary: mix(hex, "#000000", 0.18),
    onBrandSecondary: onBrand,
    brandTertiary: scheme === "dark" ? mix(hex, "#000000", 0.72) : mix(hex, "#FFFFFF", 0.82),
    onBrandTertiary: scheme === "dark" ? mix(hex, "#FFFFFF", 0.7) : mix(hex, "#000000", 0.55),
  };
}

const accentCache = new Map<string, ThemeColors>();

function resolveColors(scheme: ColorScheme): ThemeColors {
  if (!accentHex) return themes[scheme];
  const key = `${scheme}:${accentHex}`;
  let c = accentCache.get(key);
  if (!c) {
    c = withAccent(themes[scheme], accentHex, scheme);
    accentCache.set(key, c);
  }
  return c;
}

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const snapshot = useSyncExternalStore(
    subscribe,
    () => `${overrideScheme ?? "auto"}|${accentHex ?? ""}`,
    () => `${overrideScheme ?? "auto"}|${accentHex ?? ""}`,
  );
  const override = snapshot.split("|")[0];
  const chosen: ColorScheme =
    override !== "auto"
      ? (override as ColorScheme)
      : system && themes[system as ColorScheme]
        ? (system as ColorScheme)
        : defaultScheme;
  const scheme = themes[chosen] ? chosen : "dark";
  return { scheme, colors: resolveColors(scheme) };
}

export function makeStyles<
  T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>,
>(factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}
