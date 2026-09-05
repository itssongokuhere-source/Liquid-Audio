// Thin wrapper so the app still runs where the native module is unavailable (web / Expo Go).
type IconModule = {
  supportsAlternateIcons: boolean;
  setAlternateAppIcon: (name: string | null) => Promise<string | null>;
  getAppIconName: () => string | null;
};

let mod: IconModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require("expo-alternate-app-icons") as IconModule;
} catch {
  mod = null;
}

export const DEFAULT_ICON = "rose";

export const APP_ICONS = [
  { key: "rose", label: "Rose", image: require("../../assets/icons/rose.png") },
  { key: "ocean", label: "Ocean", image: require("../../assets/icons/ocean.png") },
  { key: "aurora", label: "Aurora", image: require("../../assets/icons/aurora.png") },
  { key: "midnight", label: "Midnight", image: require("../../assets/icons/midnight.png") },
  { key: "gold", label: "Gold", image: require("../../assets/icons/gold.png") },
  { key: "violet", label: "Violet", image: require("../../assets/icons/violet.png") },
];

export const supportsAlternateIcons = !!mod?.supportsAlternateIcons;

export async function applyAppIcon(key: string): Promise<boolean> {
  if (!mod?.supportsAlternateIcons) return false;
  await mod.setAlternateAppIcon(key === DEFAULT_ICON ? null : key.charAt(0).toUpperCase() + key.slice(1));
  return true;
}
