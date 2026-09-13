import { requireOptionalNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

type Native = {
  isAvailable(): boolean;
  attach(sessionId: number): void;
  setEnabled(on: boolean): void;
  setBands(gainsDb: number[]): void;
  setBassBoost(strength: number): void;
  setVirtualizer(strength: number): void;
  setLoudness(millibels: number): void;
  setReverb(preset: number): void;
  getDeviceBands(): number[];
  release(): void;
};

// Null in Expo Go / web — the equalizer UI still works, it just can't shape sound there.
const native: Native | null = Platform.OS === "android" ? requireOptionalNativeModule<Native>("AudioFx") : null;

export type AudioFxState = {
  enabled: boolean;
  bands: number[]; // 10 ISO bands, dB (-12..12)
  effects: Record<string, boolean>; // bassBoost | surround | reverb | loudness
  hdEnhance?: boolean;
};

/** Curve blended on top of the user's EQ when HD Enhance is on (clarity + air + tight low end). */
const HD_CURVE = [1.5, 1, 0, -0.5, -1, 0.5, 1.5, 2.5, 3, 2.5];

export const AudioFx = {
  available: !!native,
  attach(sessionId: number) {
    if (native && sessionId > 0) native.attach(sessionId);
  },
  apply(state: AudioFxState) {
    if (!native) return;
    const hd = !!state.hdEnhance;
    const bands = state.bands.map((g, i) => Math.max(-15, Math.min(15, g + (hd ? HD_CURVE[i] : 0))));
    native.setBands(bands);
    native.setBassBoost(state.effects.bassBoost ? 650 : hd ? 250 : 0);
    native.setVirtualizer(state.effects.surround ? 700 : hd ? 300 : 0);
    native.setLoudness(state.effects.loudness ? 900 : hd ? 400 : 0);
    native.setReverb(state.effects.reverb ? 3 : 0); // PRESET_MEDIUMROOM
    native.setEnabled(state.enabled);
  },
  release() {
    native?.release();
  },
};
