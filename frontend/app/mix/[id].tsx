import { useLocalSearchParams, useRouter } from "expo-router";
import { FlatList, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { useAudio } from "@/src/components/audio-context";
import { useDownloads } from "@/src/components/downloads-context";
import { Icon } from "@/src/components/icon";
import { MixCover } from "@/src/components/mix-card";
import { Text } from "@/src/components/text";
import { useToast } from "@/src/components/toast";
import { TrackRow } from "@/src/components/track-row";
import { useTrackActions } from "@/src/components/track-actions";
import { haptic } from "@/src/lib/haptics";
import { useMixes } from "@/src/lib/hooks";
import { contentBottomPad } from "@/src/lib/layout";
import { makeStyles, useTheme } from "@/src/theme";

export default function MixScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: mixes = [], isLoading } = useMixes();
  const mix = mixes.find((m) => m.id === id);
  const { playNow, current, hasTrack } = useAudio();
  const { downloadMany } = useDownloads();
  const openActions = useTrackActions();

  const playAll = (shuffle = false) => {
    if (!mix?.tracks.length) return;
    haptic.medium();
    const list = shuffle ? [...mix.tracks].sort(() => Math.random() - 0.5) : mix.tracks;
    playNow(list[0], list);
  };

  return (
    <View style={styles.container} testID="mix-screen">
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <AnimatedPressable testID="mix-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </AnimatedPressable>
        <Text style={styles.topTitle} numberOfLines={1}>{mix?.title ?? "Mix"}</Text>
        <View style={styles.iconBtn} />
      </View>
      {!mix ? (
        <View style={styles.center}>
          <Text style={styles.dim}>{isLoading ? "Building your mix…" : "This mix has refreshed — head back to Home"}</Text>
        </View>
      ) : (
        <FlatList
          data={mix.tracks}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: contentBottomPad(hasTrack) }}
          initialNumToRender={12}
          ListHeaderComponent={
            <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.header}>
              <MixCover mix={mix} size={220} radius={24} />
              <Text style={styles.subtitle}>{mix.subtitle}</Text>
              <Text style={styles.meta}>{mix.tracks.length} songs · refreshed daily</Text>
              <View style={styles.btnRow}>
                <AnimatedPressable testID="mix-play" onPress={() => playAll(false)} scaleTo={0.95} style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary }]}>
                  <Icon name="play" size={18} color={colors.onBrandPrimary} />
                  <Text style={[styles.primaryText, { color: colors.onBrandPrimary }]}>Play</Text>
                </AnimatedPressable>
                <AnimatedPressable testID="mix-shuffle" onPress={() => playAll(true)} scaleTo={0.95} style={styles.ghostBtn}>
                  <Icon name="shuffle" size={18} color={colors.onSurface} />
                  <Text style={styles.ghostText}>Shuffle</Text>
                </AnimatedPressable>
                <AnimatedPressable
                  testID="mix-download"
                  onPress={() => {
                    downloadMany(mix.tracks);
                    toast("Downloading mix for offline", "success");
                  }}
                  scaleTo={0.9}
                  style={styles.roundBtn}
                >
                  <Icon name="download-outline" size={20} color={colors.onSurface} />
                </AnimatedPressable>
              </View>
            </Animated.View>
          }
          renderItem={({ item }) => (
            <TrackRow track={item} active={current?.id === item.id} onPress={() => playNow(item, mix.tracks)} onMore={() => openActions(item)} />
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingBottom: 6 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center" },
  header: { alignItems: "center", paddingVertical: 12, gap: 8 },
  subtitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700", marginTop: 6 },
  meta: { color: colors.muted, fontSize: 12 },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, marginBottom: 12 },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 26, paddingVertical: 12, borderRadius: 999 },
  primaryText: { fontSize: 15, fontWeight: "700" },
  ghostBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, backgroundColor: colors.surfaceTertiary },
  ghostText: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  roundBtn: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceTertiary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  dim: { color: colors.muted, fontSize: 15, textAlign: "center" },
}));
