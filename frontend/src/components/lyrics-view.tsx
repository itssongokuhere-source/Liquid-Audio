import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Animated, { cancelAnimation, interpolateColor, useAnimatedStyle, useFrameCallback, useSharedValue, withRepeat, withSequence, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { Text } from "@/src/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio, useAudioProgress } from "@/src/components/audio-context";
import { Icon } from "@/src/components/icon";
import { fetchLyrics, type RichLine } from "@/src/lib/api";
import { useTheme } from "@/src/theme";
import { storage } from "@/src/utils/storage";
import { haptic } from "@/src/lib/haptics";

const WHITE = "#FFFFFF";
const FADED = "rgba(255,255,255,0.32)";
const DIMMED = "rgba(255,255,255,0.7)";

type RichWord = { t: number; text: string };
type Line = { at: number; text: string; gap?: boolean; end?: number; words?: RichWord[] };

/** Musixmatch RichSync → lines with real per-word onsets (true karaoke timing). */
function fromRich(rich: RichLine[]): Line[] {
  return rich.map((l) => ({ at: l.start, end: l.end, text: l.text, words: l.words }));
}

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
// Estimated word timing needs more lead; real word onsets only need to cover render latency.
const LOOKAHEAD = 0.45;
const LOOKAHEAD_RICH = 0.12;

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

function nextTextAt(lines: Line[], i: number): number {
  for (let k = i + 1; k < lines.length; k++) {
    if (lines[k].text || lines[k].gap) return lines[k].at;
  }
  return lines[i].at + 4;
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
  // Per-song manual sync nudge (seconds), persisted — for lyrics filed against a different edit.
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!current) return;
    const id = current.id;
    storage.getItem<number>(`liquidaudio.lyricOffset.${id}`, 0).then((v) => setOffset(Number(v) || 0));
  }, [current]);
  const nudge = (d: number) => {
    if (!current) return;
    const next = Math.round((offset + d) * 10) / 10;
    setOffset(next);
    haptic.selection();
    storage.setItem(`liquidaudio.lyricOffset.${current.id}`, next).catch(() => {});
  };
  const position = useSmoothPosition(rawPosition, isPlaying) + offset;
  // Frame-accurate clock for the karaoke sweep (runs on the UI thread at the display refresh rate).
  const { data, isLoading } = useQuery({
    queryKey: ["lyrics", current?.id],
    queryFn: () => fetchLyrics(current!),
    enabled: !!current,
  });
  const wordSynced = !!data?.rich?.length;
  const lookahead = wordSynced ? LOOKAHEAD_RICH : LOOKAHEAD;

  const clock = useSharedValue(rawPosition + LOOKAHEAD);
  const anchorPos = useSharedValue(rawPosition);
  const anchorAt = useSharedValue(Date.now());
  const playingSV = useSharedValue(isPlaying ? 1 : 0);
  const offsetSV = useSharedValue(0);
  useEffect(() => {
    offsetSV.value = offset + lookahead;
  }, [offset, lookahead, offsetSV]);
  useEffect(() => {
    anchorPos.value = rawPosition;
    anchorAt.value = Date.now();
    playingSV.value = isPlaying ? 1 : 0;
  }, [rawPosition, isPlaying, anchorPos, anchorAt, playingSV]);
  useFrameCallback(() => {
    const elapsed = playingSV.value ? (Date.now() - anchorAt.value) / 1000 : 0;
    clock.value = anchorPos.value + elapsed + offsetSV.value;
  });

  const { duration } = useAudioProgress();
  const approximate = !data?.synced && !!data?.plain && !data?.instrumental;
  const lines = useMemo(() => {
    if (data?.rich?.length) return withGaps(fromRich(data.rich));
    if (data?.synced) return withGaps(parseLRC(data.synced));
    if (approximate) return withGaps(autoTime(data!.plain as string, duration || current?.duration || 0));
    return [];
  }, [data, approximate, duration, current?.duration]);

  const activeIndex = useMemo(() => {
    if (!lines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].at <= position + lookahead) idx = i;
      else break;
    }
    return idx;
  }, [lines, position, lookahead]);

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
      {lines.length ? (
        <View style={styles.syncRow}>
          {approximate ? (
            <View style={styles.approxPill} testID="lyrics-approx">
              <Icon name="sparkles" size={12} color={DIMMED} />
              <Text style={styles.approxText}>Auto‑timed</Text>
            </View>
          ) : wordSynced ? (
            <View style={styles.approxPill} testID="lyrics-wordsync">
              <Icon name="mic" size={12} color={DIMMED} />
              <Text style={styles.approxText}>Word‑synced</Text>
            </View>
          ) : null}
          <View style={styles.approxPill} testID="lyrics-sync">
            <Pressable testID="lyrics-sync-minus" onPress={() => nudge(-0.5)} hitSlop={8} style={styles.syncBtn}>
              <Icon name="remove" size={14} color={WHITE} />
            </Pressable>
            <Text style={styles.approxText}>
              Sync {offset === 0 ? "0.0" : `${offset > 0 ? "+" : ""}${offset.toFixed(1)}`} s
            </Text>
            <Pressable testID="lyrics-sync-plus" onPress={() => nudge(0.5)} hitSlop={8} style={styles.syncBtn}>
              <Icon name="add" size={14} color={WHITE} />
            </Pressable>
          </View>
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
                  words={line.words}
                  active={isActive}
                  past={isPast}
                  start={line.at}
                  end={line.words ? Math.max(line.end ?? 0, line.at + 0.4) : nextTextAt(lines, i)}
                  clock={clock}
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
  words,
  active,
  past,
  start,
  end,
  clock,
  brand,
}: {
  text: string;
  words?: RichWord[];
  active: boolean;
  past: boolean;
  start: number;
  end: number;
  clock: SharedValue<number>;
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
  // Word timing: real onsets from RichSync when available, otherwise each word owns a slice of
  // the line's time proportional to its length.
  const timed = useMemo<{ text: string; from: number; to: number }[]>(() => {
    if (words?.length) {
      return words.map((w, i) => ({
        text: w.text,
        from: w.t,
        to: Math.max(w.t + 0.12, i + 1 < words.length ? words[i + 1].t : end),
      }));
    }
    const parts = text.split(/\s+/).filter(Boolean);
    const weights = parts.map((w) => Math.max(2, w.length + 1));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const span = Math.max(0.4, end - start);
    let acc = 0;
    return parts.map((w, i) => {
      const from = start + (acc / total) * span;
      acc += weights[i];
      return { text: w, from, to: start + (acc / total) * span };
    });
  }, [words, text, start, end]);
  return (
    <Animated.View style={[styles.activeRow, { transformOrigin: "left center" }, anim]}>
      {timed.map((w, idx) => (
        <Word key={idx} text={w.text} active={active} past={past} brand={brand} clock={clock} from={w.from} to={w.to} last={idx === timed.length - 1} />
      ))}
    </Animated.View>
  );
}

const IS_WEB = Platform.OS === "web";

function Word({
  text,
  active,
  past,
  brand,
  clock,
  from,
  to,
  last,
}: {
  text: string;
  active: boolean;
  past: boolean;
  brand: string;
  clock: SharedValue<number>;
  from: number;
  to: number;
  last: boolean;
}) {
  const anim = useAnimatedStyle(() => {
    if (!active) {
      return IS_WEB
        ? { opacity: past ? 1 : 0.9, color: WHITE, transform: [{ translateY: 0 }], textShadow: "none" }
        : { opacity: past ? 1 : 0.9, color: WHITE, transform: [{ translateY: 0 }], textShadowRadius: 0 };
    }
    // Sweep across this word between its onset and the next word's onset, with a soft feather
    // (never longer than 220 ms) so the fill lands exactly on the sung syllable.
    const span = Math.max(0.12, to - from);
    const feather = Math.min(0.22, span * 0.25);
    const wp = Math.min(1, Math.max(0, (clock.value - from + feather) / (span + feather)));
    const eased = wp * wp * (3 - 2 * wp);
    const radius = 16 * eased;
    const base = {
      opacity: 0.42 + 0.58 * eased,
      color: interpolateColor(eased, [0, 1], ["rgba(255,255,255,0.55)", WHITE]),
      transform: [{ translateY: -3 * Math.sin(eased * Math.PI) }],
    };
    return IS_WEB
      ? { ...base, textShadow: radius > 0.5 ? `0 0 ${radius}px ${brand}` : "none" }
      : { ...base, textShadowRadius: radius };
  });
  return (
    <Animated.Text
      style={[
        styles.activeWord,
        { fontFamily: "Inter-ExtraBold" },
        IS_WEB ? null : { textShadowColor: brand, textShadowOffset: { width: 0, height: 0 } },
        anim,
      ]}
    >
      {text}
      {last ? "" : " "}
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
  syncRow: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 4 },
  syncBtn: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.14)" },
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
