import { Image } from "expo-image";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { Text } from "@/src/components/text";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { Glass } from "@/src/components/glass";
import { Icon } from "@/src/components/icon";
import { haptic } from "@/src/lib/haptics";
import { contentBottomPad } from "@/src/lib/layout";
import { storage } from "@/src/utils/storage";
import { makeStyles, useTheme } from "@/src/theme";

const EQ_KEY = "liquidaudio.eq";
const BANDS = ["32", "64", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
const FADER_H = 150;
const THUMB = 20;

const PRESETS: Record<string, number[]> = {
  Flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Bass Boost": [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  Vocal: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1],
  Treble: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7],
  Acoustic: [4, 3, 2, 0, 1, 2, 3, 3, 2, 3],
  Electronic: [5, 4, 1, 0, -2, 1, 1, 3, 4, 5],
  Rock: [5, 4, 2, 0, -1, 0, 2, 3, 4, 4],
  Jazz: [4, 3, 1, 2, -1, -1, 0, 1, 2, 3],
  Lounge: [-3, -1, 1, 3, 3, 1, 0, -1, 2, 1],
};
const PRESET_NAMES = Object.keys(PRESETS);

const EFFECTS = [
  { key: "bassBoost", label: "Bass Boost", icon: "pulse-outline" as const },
  { key: "surround", label: "3D Surround", icon: "planet-outline" as const },
  { key: "reverb", label: "Reverb", icon: "aperture-outline" as const },
  { key: "loudness", label: "Loudness", icon: "volume-high-outline" as const },
];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export default function EqualizerScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { current, isPlaying, hasTrack } = useAudio();

  const [enabled, setEnabled] = useState(true);
  const [preset, setPreset] = useState("Flat");
  const [bands, setBands] = useState<number[]>(PRESETS.Flat);
  const [effects, setEffects] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    storage
      .getItem<{
        enabled: boolean;
        preset: string;
        bands: number[];
        effects: Record<string, boolean>;
      }>(EQ_KEY, null as never)
      .then((saved) => {
        if (saved) {
          setEnabled(saved.enabled ?? true);
          setPreset(saved.preset ?? "Flat");
          setBands(saved.bands ?? PRESETS.Flat);
          setEffects(saved.effects ?? {});
        }
        setLoaded(true);
      });
  }, []);

  useEffect(() => {
    if (loaded) storage.setItem(EQ_KEY, { enabled, preset, bands, effects });
  }, [enabled, preset, bands, effects, loaded]);

  const applyPreset = (name: string) => {
    haptic.medium();
    setPreset(name);
    setBands([...PRESETS[name]]);
  };

  const updateBand = (i: number, value: number) => {
    setBands((prev) => {
      const nextArr = [...prev];
      nextArr[i] = value;
      return nextArr;
    });
    setPreset("Custom");
  };

  const toggleEffect = (key: string) => {
    haptic.selection();
    setEffects((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const dim = enabled ? 1 : 0.4;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingTop: insets.top + 10,
        paddingBottom: contentBottomPad(hasTrack),
      }}
      testID="equalizer-screen"
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Sound</Text>
          <Text style={styles.subtitle}>Shape your audio</Text>
        </View>
        <Switch
          testID="eq-enable-switch"
          value={enabled}
          onValueChange={(v) => {
            haptic.selection();
            setEnabled(v);
          }}
          trackColor={{ true: colors.brandPrimary, false: colors.surfaceTertiary }}
          thumbColor={colors.onBrandPrimary}
        />
      </View>

      <Visualizer playing={isPlaying && enabled} />

      {current ? (
        <View style={styles.nowPlaying}>
          <Image
            source={current.artwork ? { uri: current.artwork } : undefined}
            style={styles.npArt}
            contentFit="cover"
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.npTitle} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={styles.npArtist} numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Presets</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {PRESET_NAMES.map((name) => {
          const active = preset === name;
          return (
            <Pressable
              key={name}
              testID={`preset-${name}`}
              onPress={() => applyPreset(name)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.eqCard, { opacity: dim }]} pointerEvents={enabled ? "auto" : "none"}>
        <View style={styles.faders}>
          {BANDS.map((label, i) => (
            <View key={label} style={styles.band}>
              <Text style={styles.gain}>
                {bands[i] > 0 ? "+" : ""}
                {bands[i]}
              </Text>
              <Fader
                value={bands[i]}
                onChange={(v) => updateBand(i, v)}
                fill={colors.brandPrimary}
                track={colors.eqTrack}
                thumb={colors.onSurface}
              />
              <Text style={styles.freq}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={styles.sectionLabel}>Effects</Text>
      <View style={styles.effectsGrid}>
        {EFFECTS.map((e) => {
          const on = !!effects[e.key];
          return (
            <Pressable
              key={e.key}
              testID={`effect-${e.key}`}
              onPress={() => toggleEffect(e.key)}
              style={styles.effectWrap}
            >
              <Glass intensity={40} style={[styles.effect, on && styles.effectOn]}>
                <Icon
                  name={e.icon}
                  size={22}
                  color={on ? colors.brandPrimary : colors.muted}
                />
                <Text style={[styles.effectText, on && styles.effectTextOn]}>{e.label}</Text>
                <View style={[styles.dot, on && styles.dotOn]} />
              </Glass>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.note}>
        EQ presets & effects are saved to this device. Full DSP band processing activates on a
        native build.
      </Text>
    </ScrollView>
  );
}

function Fader({
  value,
  onChange,
  fill,
  track,
  thumb,
}: {
  value: number;
  onChange: (v: number) => void;
  fill: string;
  track: string;
  thumb: string;
}) {
  const usable = FADER_H - THUMB;
  const startRef = useRef(value);
  const valueRef = useRef(value);
  valueRef.current = value;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          startRef.current = valueRef.current;
          haptic.selection();
        },
        onPanResponderMove: (_e, g) => {
          const delta = (-g.dy / usable) * 24;
          const v = clamp(Math.round(startRef.current + delta), -12, 12);
          if (v !== valueRef.current) onChange(v);
        },
      }),
    [usable, onChange],
  );

  const pct = (value + 12) / 24;
  const topOffset = (1 - pct) * usable;

  return (
    <View style={faderStyles.box} {...responder.panHandlers}>
      <View style={[faderStyles.track, { backgroundColor: track }]} />
      <View
        style={[
          faderStyles.fill,
          { backgroundColor: fill, height: pct * usable + THUMB / 2 },
        ]}
      />
      <View style={[faderStyles.thumb, { top: topOffset, borderColor: fill, backgroundColor: thumb }]} />
    </View>
  );
}

function Visualizer({ playing }: { playing: boolean }) {
  const styles = useStyles();
  const bars = Array.from({ length: 34 });
  return (
    <Glass intensity={30} style={styles.viz}>
      <View style={styles.vizInner}>
        {bars.map((_, i) => (
          <VizBar key={i} playing={playing} index={i} />
        ))}
      </View>
    </Glass>
  );
}

function VizBar({ playing, index }: { playing: boolean; index: number }) {
  const { colors } = useTheme();
  const h = useSharedValue(0.15);
  useEffect(() => {
    if (!playing) {
      h.value = withTiming(0.12, { duration: 400 });
      return;
    }
    const tick = () => {
      const center = 1 - Math.abs(index - 17) / 20;
      h.value = withTiming(0.15 + Math.random() * 0.75 * center + 0.1, { duration: 230 });
    };
    tick();
    const id = setInterval(tick, 230);
    return () => clearInterval(id);
  }, [playing, index, h]);
  const style = useAnimatedStyle(() => ({ height: `${h.value * 100}%` }));
  return (
    <Animated.View
      style={[
        { flex: 1, borderRadius: 3, backgroundColor: colors.brandPrimary },
        style,
      ]}
    />
  );
}

const faderStyles = StyleSheet.create({
  box: { width: 40, height: FADER_H, alignItems: "center", justifyContent: "center" },
  track: {
    position: "absolute",
    width: 6,
    height: FADER_H,
    borderRadius: 3,
  },
  fill: {
    position: "absolute",
    bottom: 0,
    width: 6,
    borderRadius: 3,
  },
  thumb: {
    position: "absolute",
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 3,
  },
});

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  title: { color: colors.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 2 },
  viz: {
    marginHorizontal: 16,
    height: 84,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  vizInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  nowPlaying: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
  },
  npArt: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.surfaceTertiary },
  npTitle: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  npArtist: { color: colors.muted, fontSize: 12, marginTop: 2 },
  sectionLabel: {
    color: colors.onSurface,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: -0.3,
    paddingHorizontal: 16,
    marginTop: 26,
    marginBottom: 12,
  },
  chipRow: { gap: 8, height: 56, alignItems: "center", paddingHorizontal: 16 },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: 16,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  eqCard: {
    marginHorizontal: 16,
    backgroundColor: colors.surfaceSecondary,
    borderRadius: 24,
    paddingVertical: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  faders: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  band: { alignItems: "center", gap: 8 },
  gain: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  freq: { color: colors.onSurfaceTertiary, fontSize: 11, fontWeight: "600" },
  effectsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
  },
  effectWrap: { width: "47%" },
  effect: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  effectOn: { borderColor: colors.brandPrimary },
  effectText: { color: colors.muted, fontSize: 14, fontWeight: "600", flex: 1 },
  effectTextOn: { color: colors.onSurface },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  dotOn: { backgroundColor: colors.brandPrimary },
  note: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    paddingHorizontal: 16,
    marginTop: 24,
  },
}));
