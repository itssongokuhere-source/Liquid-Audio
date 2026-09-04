import { Platform } from "react-native";

export const MINI_PLAYER_HEIGHT = 62;

// Height of the bottom tab bar chrome (excludes the safe-area inset).
export const TAB_BAR_BASE = Platform.OS === "web" ? 64 : 49;

// Bottom padding for scrollable screen content so nothing hides behind the
// floating mini-player. Tab bar space is already reserved by the navigator.
export function contentBottomPad(hasTrack: boolean): number {
  return hasTrack ? MINI_PLAYER_HEIGHT + 20 : 20;
}
