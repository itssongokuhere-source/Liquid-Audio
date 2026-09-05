import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/text";
import Animated, { FadeIn, FadeInUp, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { useAudio } from "@/src/components/audio-context";
import { ArtworkBackdrop } from "@/src/components/artwork-backdrop";
import { GlassSwitch } from "@/src/components/glass-switch";
import { Icon } from "@/src/components/icon";
import { PlayingBars } from "@/src/components/playing-bars";
import { QueueList } from "@/src/components/queue-list";
import { useToast } from "@/src/components/toast";
import { useTrackActions } from "@/src/components/track-actions";
import { useTheme } from "@/src/theme";

const WHITE = "#FFFFFF";
const DIM = "rgba(255,255,255,0.6)";
const GLASS = "rgba(255,255,255,0.12)";
const GLASS_BORDER = "rgba(255,255,255,0.14)";

export default function QueueScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const openActions = useTrackActions();
  const {
    queue,
    index,
    current,
    isPlaying,
    jumpTo,
    moveInQueue,
    removeFromQueue,
    clearUpcoming,
    autoplay,
    toggleAutoplay,
    suggestions,
    suggestionsLoading,
    playSuggestion,
    addToQueue,
  } = useAudio();

  const upcoming = useMemo(() => {
    const seen = new Set<string>();
    const out: { track: typeof queue[number]; index: number }[] = [];
    queue.forEach((t, i) => {
      if (i > index && !seen.has(t.id)) {
        seen.add(t.id);
        out.push({ track: t, index: i });
      }
    });
    return out;
  }, [queue, index]);

  const listColors = {
    text: WHITE,
    dim: DIM,
    accent: colors.brandPrimary,
    danger: colors.error,
    surface: "rgba(20,20,20,0.9)",
    border: GLASS_BORDER,
  };

  return (
    <View style={styles.container} testID="queue-screen">
      <ArtworkBackdrop uri={current?.artwork} intensity={92} />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <AnimatedPressable testID="queue-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="chevron-down" size={28} color={WHITE} />
        </AnimatedPressable>
        <Text style={styles.title}>Up Next</Text>
        <AnimatedPressable
          testID="queue-clear"
          onPress={() => {
            clearUpcoming();
            toast("Queue cleared", "success");
          }}
          disabled={upcoming.length === 0}
          style={styles.iconBtn}
        >
          <Icon name="trash-outline" size={22} color={upcoming.length ? WHITE : DIM} />
        </AnimatedPressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
      >
        {current ? (
          <Animated.View entering={FadeIn.duration(300)}>
            <Text style={styles.sectionLabel}>Now Playing</Text>
            <View style={styles.nowRow}>
              <Image source={current.artwork ? { uri: current.artwork } : undefined} style={styles.art} contentFit="cover" />
              <View style={{ flex: 1 }}>
                <Text style={styles.nowTitle} numberOfLines={1}>{current.title}</Text>
                <Text style={styles.nowArtist} numberOfLines={1}>{current.artist}</Text>
              </View>
              <PlayingBars color={colors.brandPrimary} playing={isPlaying} size={20} />
            </View>
          </Animated.View>
        ) : (
          <Text style={styles.empty}>Nothing playing</Text>
        )}

        {current ? (
          <View style={styles.sectionHead}>
            <Text style={styles.sectionLabel}>
              Next in queue{upcoming.length ? ` · ${upcoming.length}` : ""}
            </Text>
            <Text style={styles.hint}>Hold ≡ to reorder · swipe left to remove</Text>
          </View>
        ) : null}

        {current && upcoming.length === 0 ? (
          <Animated.View entering={FadeIn} style={styles.emptyCard}>
            <Icon name="albums-outline" size={22} color={DIM} />
            <Text style={styles.emptyCardText}>
              {autoplay ? "Autoplay will keep the music going with similar songs" : "Nothing queued after this song"}
            </Text>
          </Animated.View>
        ) : null}

        <Animated.View layout={LinearTransition.springify().damping(20)}>
          <QueueList
            items={upcoming}
            onMove={moveInQueue}
            onRemove={removeFromQueue}
            onPlay={jumpTo}
            onPlayNext={(i) => moveInQueue(i, index + 1)}
            colors={listColors}
          />
        </Animated.View>

        {current ? (
          <Animated.View entering={FadeInUp.delay(120).springify().damping(18)} style={styles.autoplayCard}>
            <View style={styles.autoplayIcon}>
              <Icon name="infinite" size={22} color={autoplay ? colors.brandPrimary : DIM} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.autoplayTitle}>Autoplay</Text>
              <Text style={styles.autoplaySub}>Keep the music going with similar songs</Text>
            </View>
            <GlassSwitch
              testID="autoplay-switch"
              value={autoplay}
              onValueChange={toggleAutoplay}
              onColor={colors.brandPrimary}
              offColor="rgba(255,255,255,0.25)"
            />
          </Animated.View>
        ) : null}

        {current && autoplay ? (
          <View>
            <Text style={[styles.sectionLabel, { marginTop: 24 }]}>Similar songs</Text>
            {suggestionsLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.brandPrimary} />
                <Text style={styles.hint}>Finding songs you’ll love…</Text>
              </View>
            ) : suggestions.length === 0 ? (
              <Text style={styles.hint}>No suggestions right now</Text>
            ) : (
              suggestions.slice(0, 15).map((t, i) => (
                <Animated.View
                  key={t.id}
                  entering={FadeInUp.delay(160 + Math.min(i, 10) * 40).springify().damping(18)}
                  layout={LinearTransition.springify().damping(20)}
                >
                  <View style={styles.suggestRow}>
                    <AnimatedPressable
                      testID={`suggest-play-${t.id}`}
                      onPress={() => playSuggestion(t)}
                      scaleTo={0.98}
                      style={styles.suggestMain}
                    >
                      <Image source={t.artwork ? { uri: t.artwork } : undefined} style={styles.artSm} contentFit="cover" />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{t.title}</Text>
                        <Text style={styles.rowArtist} numberOfLines={1}>{t.artist}</Text>
                      </View>
                    </AnimatedPressable>
                    <AnimatedPressable
                      testID={`suggest-add-${t.id}`}
                      onPress={() => {
                        addToQueue(t);
                        toast("Added to queue", "success");
                      }}
                      style={styles.smallBtn}
                    >
                      <Icon name="add" size={22} color={WHITE} />
                    </AnimatedPressable>
                    <AnimatedPressable
                      testID={`suggest-more-${t.id}`}
                      onPress={() => openActions(t)}
                      style={styles.smallBtn}
                    >
                      <Icon name="ellipsis-horizontal" size={20} color={DIM} />
                    </AnimatedPressable>
                  </View>
                </Animated.View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: WHITE, fontSize: 16, fontWeight: "700" },
  sectionLabel: { color: DIM, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  sectionHead: { marginTop: 24 },
  hint: { color: DIM, fontSize: 12, marginTop: -4, marginBottom: 10 },
  nowRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  art: { width: 56, height: 56, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)" },
  nowTitle: { color: WHITE, fontSize: 16, fontWeight: "700" },
  nowArtist: { color: DIM, fontSize: 13, marginTop: 2 },
  emptyCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS_BORDER,
  },
  emptyCardText: { color: DIM, fontSize: 14, flex: 1 },
  autoplayCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: 18,
    marginTop: 20,
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS_BORDER,
  },
  autoplayIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  autoplayTitle: { color: WHITE, fontSize: 15, fontWeight: "700" },
  autoplaySub: { color: DIM, fontSize: 12, marginTop: 2 },
  loading: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  suggestRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
  suggestMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  artSm: { width: 48, height: 48, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  rowTitle: { color: WHITE, fontSize: 15, fontWeight: "600" },
  rowArtist: { color: DIM, fontSize: 13, marginTop: 2 },
  smallBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  empty: { color: DIM, fontSize: 15, textAlign: "center", marginTop: 30 },
});
