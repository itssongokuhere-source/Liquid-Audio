import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/src/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { ArtworkBackdrop } from "@/src/components/artwork-backdrop";
import { Icon } from "@/src/components/icon";
import { fetchLyrics } from "@/src/lib/api";
import { useTheme } from "@/src/theme";

const WHITE = "#FFFFFF";
const FADED = "rgba(255,255,255,0.32)";

type Line = { at: number; text: string };

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

export default function LyricsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { current, position, seek } = useAudio();

  const { data, isLoading } = useQuery({
    queryKey: ["lyrics", current?.id],
    queryFn: () => fetchLyrics(current!),
    enabled: !!current,
  });

  const lines = useMemo(() => (data?.synced ? parseLRC(data.synced) : []), [data?.synced]);

  const activeIndex = useMemo(() => {
    if (!lines.length) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].at <= position + 0.15) idx = i;
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
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 220), animated: true });
    }
  }, [activeIndex]);

  const activeStart = activeIndex >= 0 ? lines[activeIndex].at : 0;
  const activeEnd =
    activeIndex >= 0 && activeIndex < lines.length - 1
      ? lines[activeIndex + 1].at
      : activeStart + 4;
  const lineProgress = Math.max(0, Math.min(1, (position - activeStart) / Math.max(0.5, activeEnd - activeStart)));

  return (
    <View style={styles.container} testID="lyrics-screen">
      <ArtworkBackdrop uri={current?.artwork} intensity={90} />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="lyrics-close" onPress={() => router.back()} hitSlop={12} style={styles.topBtn}>
          <Icon name="chevron-down" size={28} color={WHITE} />
        </Pressable>
        <Text style={styles.topLabel} numberOfLines={1}>
          {current?.title ?? "Lyrics"}
        </Text>
        <View style={styles.topBtn} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={WHITE} />
          <Text style={styles.dim}>Loading lyrics…</Text>
        </View>
      ) : lines.length > 0 ? (
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 40, paddingBottom: insets.bottom + 120, paddingHorizontal: 26 }}
        >
          {lines.map((line, i) => {
            const isActive = i === activeIndex;
            const isPast = i < activeIndex;
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
                {isActive ? (
                  <ActiveLine text={line.text} progress={lineProgress} brand={colors.brandPrimary} />
                ) : (
                  <Text style={[styles.line, { color: isPast ? "rgba(255,255,255,0.5)" : FADED }]}>
                    {line.text}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      ) : data?.plain ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 20, paddingBottom: insets.bottom + 120, paddingHorizontal: 26 }}
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

function ActiveLine({ text, progress, brand }: { text: string; progress: number; brand: string }) {
  const words = text.split(/(\s+)/);
  const realWords = words.filter((w) => w.trim().length > 0).length;
  const filled = Math.round(progress * realWords);
  let counter = 0;
  return (
    <View style={styles.activeRow}>
      {words.map((w, idx) => {
        if (!w.trim()) return <Text key={idx} style={styles.activeWord}> </Text>;
        const on = counter < filled;
        counter += 1;
        return (
          <Text key={idx} style={[styles.activeWord, { color: on ? WHITE : "rgba(255,255,255,0.45)" }]}>
            {w}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  topBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topLabel: { color: WHITE, fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  dim: { color: FADED, fontSize: 16, fontWeight: "600" },
  lineWrap: { paddingVertical: 12 },
  line: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5, lineHeight: 34 },
  activeRow: { flexDirection: "row", flexWrap: "wrap" },
  activeWord: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, lineHeight: 36 },
  plain: { color: "rgba(255,255,255,0.85)", fontSize: 20, fontWeight: "600", lineHeight: 32 },
});
