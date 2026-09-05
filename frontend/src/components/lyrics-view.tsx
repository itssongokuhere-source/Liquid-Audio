import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from "react-native-reanimated";
import { Text } from "@/src/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio, useAudioProgress } from "@/src/components/audio-context";
import { Icon } from "@/src/components/icon";
import { fetchLyrics } from "@/src/lib/api";
import { useTheme } from "@/src/theme";

const WHITE = "#FFFFFF";
const FADED = "rgba(255,255,255,0.32)";
const DIMMED = "rgba(255,255,255,0.7)";

type Line = { at: number; text: string; gap?: boolean };

function parseLRC(lrc: string): Line[] {
  const out: Line[] = [];
  for (const raw of lrc.split("\n")) {
    const matches = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!matches.length) continue;
    const text = raw.replace(/\[(\d+):(\d+(?:\.\d+)?)\]/g, "").trim();
    for (const m of matches) {
      const at = Number(m[1]) * 60 + Number(m[2]);
      out.push({ at, text });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Lines light up a touch before the vocal lands (feels "on the beat" like Apple Music).
const LOOKAHEAD = 0.45;

/**
 * expo-audio reports position only a few times per second; interpolate between updates so
 * word-by-word highlighting runs at the display's frame rate without stalls.
 */
function useSmoothPosition(position: number, playing: boolean) {
  const [smooth, setSmooth] = useState(position);
  const anchor = useRef({ pos: position, at: Date.now() });
  useEffect(() => {
    anchor.current = { pos: position, at: Date.now() };
    setSmooth(position);
  }, [position]);
  useEffect(() => {
    if (!playing) return;
    let raf: ReturnType<typeof setTimeout>;
    const tick = () => {
      const { pos, at } = anchor.current;
      setSmooth(pos + (Date.now() - at) / 1000);
      raf = setTimeout(tick, 50);
    };
    raf = setTimeout(tick, 50);
    return () => clearTimeout(raf);
  }, [playing]);
  return playing ? smooth : position;
}

/** Insert Apple-Music style "• • •" markers for intros and long instrumental gaps. */
function withGaps(lines: Line[]): Line[] {
  const out: Line[] = [];
  if (lines.length && lines[0].at > 6) out.push({ at: 0, text: "", gap: true });
  lines.forEach((l, i) => {
    out.push(l);
    const next = lines[i + 1];
    if (next && l.text && next.at - l.at > 9) out.push({ at: l.at + Math.min(5, (next.at - l.at) / 2), text: "", gap: true });
  });
  return out;
}

/**
 * Apple-style fallback: when only plain (e.g. romanised Hinglish) lyrics exist, spread the
 * lines across the song proportionally to their length so they still flow with the music.
 */
function autoTime(plain: string, duration: number): Line[] {
  const rows = plain.split("\n").map((l) => l.trim());
  const content = rows.filter((l) => l.length > 0);
  if (!content.length || duration <= 0) return [];
  const start = Math.min(12, duration * 0.06);
  const end = duration * 0.94;
  const weights = rows.map((l) => (l.length ? Math.max(6, l.length) : 3));
  const total = weights.reduce((a, b) => a + b, 0);
  let t = start;
  const out: Line[] = [];
  rows.forEach((text, i) => {
    out.push({ at: t, text });
    t += ((end - start) * weights[i]) / total;
  });
  return out;
}

export function LyricsView({ embedded = false }: { embedded?: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { current, seek, isPlaying } = useAudio();
  const { position: rawPosition } = useAudioProgress();
  const position = useSmoothPosition(rawPosition, isPlaying);

  const { data, isLoading } = useQuery({
    queryKey: ["lyrics", current?.id],
    queryFn: () => fetchLyrics(current!),
    enabled: !!current,
  });

  const { duration } = useAudioProgress();
  const approximate = !data?.synced && !!data?.plain && !data?.instrumental;
  const lines = useMemo(() => {
    if (data?.synced) return withGaps(parseLRC(data.synced));
    if (approximate) return withGaps(autoTime(data!.plain as string, duration || current?.duration || 0));
    return [];
  }, [data, approximate, duration, current?.duration]);

  const activeIndex = useMemo(() => {
    if (!lines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].at <= position + LOOKAHEAD) idx = i;
      else break;
    }
    return idx;
  }, [lines, position]);

  const scrollRef = useRef<ScrollView>(null);
  const layoutsRef = useRef<Record<number, number>>({});

  useEffect(() => {
    if (activeIndex < 0) return;
    const y = layoutsRef.current[activeIndex];
    if (y != null) {
      scrollRef.current?.scrollTo({ y: Math.max(0, y - (embedded ? 120 : 220)), animated: true });
    }
  }, [activeIndex, embedded]);

  const activeStart = activeIndex >= 0 ? lines[activeIndex].at : 0;
  const activeEnd =
    activeIndex >= 0 && activeIndex < lines.length - 1
      ? lines[activeIndex + 1].at
      : activeStart + 4;
  const lineProgress = Math.max(0, Math.min(1, (position - activeStart) / Math.max(0.5, activeEnd - activeStart)));

  return (
    <View style={{ flex: 1 }} testID="lyrics-view">
      {approximate && lines.length ? (
        <View style={styles.approxPill} testID="lyrics-approx">
          <Icon name="sparkles" size={12} color={DIMMED} />
          <Text style={styles.approxText}>Auto‑timed · tap a line to jump</Text>
        </View>
      ) : null}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={WHITE} />
          <Text style={styles.dim}>Loading lyrics…</Text>
        </View>
      ) : lines.length > 0 ? (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: embedded ? 12 : 40, paddingBottom: insets.bottom + 120, paddingHorizontal: embedded ? 20 : 26 }}
        >
          {lines.map((line, i) => {
            const isActive = i === activeIndex;
            const isPast = i < activeIndex;
            if (line.gap) {
              return (
                <View key={i} style={styles.gapRow} onLayout={(e) => (layoutsRef.current[i] = e.nativeEvent.layout.y)}>
                  <GapDots active={isActive} progress={isActive ? lineProgress : 0} />
                </View>
              );
            }
            if (!line.text) {
              return <View key={i} style={{ height: 18 }} onLayout={(e) => (layoutsRef.current[i] = e.nativeEvent.layout.y)} />;
            }
            return (
              <Pressable
                key={i}
                onPress={() => seek(line.at)}
                onLayout={(e) => (layoutsRef.current[i] = e.nativeEvent.layout.y)}
                style={styles.lineWrap}
                testID={isActive ? "active-lyric-line" : undefined}
              >
                <LyricLine
                  text={line.text}
                  active={isActive}
                  past={isPast}
                  progress={isActive ? lineProgress : isPast ? 1 : 0}
                  brand={colors.brandPrimary}
                />
              </Pressable>
            );
          })}
        </ScrollView>
      ) : data?.plain ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 12, paddingBottom: insets.bottom + 120, paddingHorizontal: embedded ? 20 : 26 }}
        >
          <Text style={styles.plain}>{data.plain}</Text>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Icon name="mic-off-outline" size={44} color={FADED} />
          <Text style={styles.dim}>{data?.instrumental ? "Instrumental" : "Lyrics not available"}</Text>
        </View>
      )}
    </View>
  );
}

function GapDots({ active, progress }: { active: boolean; progress: number }) {
  const filled = Math.round(progress * 3);
  return (
    <View style={styles.dotsRow} testID={active ? "lyrics-gap-active" : undefined}>
      {[0, 1, 2].map((i) => (
        <Dot key={i} on={active && i < filled} active={active} index={i} />
      ))}
    </View>
  );
}

function Dot({ on, active, index }: { on: boolean; active: boolean; index: number }) {
  const s = useSharedValue(0.6);
  useEffect(() => {
    if (active) {
      s.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 520 + index * 90 }),
          withTiming(0.75, { duration: 520 + index * 90 }),
        ),
        -1,
        true,
      );
    } else {
      cancelAnimation(s);
      s.value = withTiming(0.6, { duration: 200 });
    }
  }, [active, index, s]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View
      style={[styles.dot, { backgroundColor: on ? WHITE : active ? "rgba(255,255,255,0.55)" : FADED }, anim]}
    />
  );
}


function LyricLine({
  text,
  active,
  past,
  progress,
  brand,
}: {
  text: string;
  active: boolean;
  past: boolean;
  progress: number;
  brand: string;
}) {
  const scale = useSharedValue(active ? 1 : 0.94);
  const opacity = useSharedValue(active ? 1 : past ? 0.5 : 0.38);
  useEffect(() => {
    scale.value = withSpring(active ? 1 : 0.94, { damping: 18, stiffness: 160 });
    opacity.value = withTiming(active ? 1 : past ? 0.5 : 0.38, { duration: 260 });
  }, [active, past, scale, opacity]);
  const anim = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const words = text.split(/(\s+)/);
  const realWords = words.filter((w) => w.trim().length > 0).length;
  const filled = active ? progress * realWords : past ? realWords : 0;
  let counter = 0;
  return (
    <Animated.View style={[styles.activeRow, { transformOrigin: "left center" }, anim]}>
      {words.map((w, idx) => {
        if (!w.trim()) return <Text key={idx} style={styles.activeWord}> </Text>;
        const i = counter;
        counter += 1;
        const wordProgress = Math.max(0, Math.min(1, filled - i));
        return <Word key={idx} text={w} progress={wordProgress} active={active} brand={brand} />;
      })}
    </Animated.View>
  );
}

function Word({ text, progress, active, brand }: { text: string; progress: number; active: boolean; brand: string }) {
  const p = useSharedValue(progress);
  useEffect(() => {
    p.value = withTiming(progress, { duration: 180 });
  }, [progress, p]);
  const anim = useAnimatedStyle(() => ({
    opacity: 0.45 + 0.55 * p.value,
    transform: [{ translateY: active ? -3 * p.value * (1 - p.value) * 4 : 0 }],
    textShadowRadius: active ? 14 * p.value : 0,
  }));
  return (
    <Animated.Text
      style={[
        styles.activeWord,
        { color: WHITE, textShadowColor: brand, textShadowOffset: { width: 0, height: 0 }, fontFamily: "Inter-ExtraBold" },
        anim,
      ]}
    >
      {text}
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  topBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topLabel: { color: WHITE, fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  dim: { color: FADED, fontSize: 16, fontWeight: "600" },
  lineWrap: { paddingVertical: 10 },
  gapRow: { paddingVertical: 14 },
  dotsRow: { flexDirection: "row", gap: 10, alignItems: "center" },
  dot: { width: 12, height: 12, borderRadius: 6 },
  approxPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  approxText: { color: DIMMED, fontSize: 12, fontWeight: "600" },
  activeRow: { flexDirection: "row", flexWrap: "wrap" },
  activeWord: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, lineHeight: 36 },
  plain: { color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: "600", lineHeight: 32 },
});
