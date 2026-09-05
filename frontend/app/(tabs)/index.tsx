import { useQueries, useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "@/src/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { ArtworkCard } from "@/src/components/artwork-card";
import { Icon } from "@/src/components/icon";
import { TrackRow } from "@/src/components/track-row";
import { useTrackActions } from "@/src/components/track-actions";
import { fetchTrending, type Track } from "@/src/lib/api";
import { contentBottomPad } from "@/src/lib/layout";
import { useLibrary, useMixes } from "@/src/lib/hooks";
import { MixCard } from "@/src/components/mix-card";
import { LiquidRefresh, PullToRefresh } from "@/src/components/liquid-refresh";
import { GestureDetector } from "react-native-gesture-handler";
import { fetchMixes, fetchRecommendations } from "@/src/lib/api";
import { haptic } from "@/src/lib/haptics";
import { queryClient } from "@/src/query-client";
import Animated, { Easing, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withTiming, cancelAnimation } from "react-native-reanimated";
import { makeStyles, useTheme } from "@/src/theme";

const BASE_GENRES = ["For You", "Hindi", "English", "Punjabi"];

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night listening";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { playNow, current, hasTrack } = useAudio();
  const openActions = useTrackActions();
  const [genre, setGenre] = useState("For You");

  const { data: tracks = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["trending", genre],
    queryFn: () => fetchTrending(genre),
  });
  const { data: library, deviceId } = useLibrary();
  const { data: mixes = [] } = useMixes();
  const recent = useMemo(() => library?.recent ?? [], [library?.recent]);
  // Only languages the listener actually plays are surfaced (plus the core set).
  const GENRES = useMemo(() => {
    const extra: string[] = [];
    for (const t of recent) {
      const g = t.genre ? t.genre.charAt(0).toUpperCase() + t.genre.slice(1).toLowerCase() : "";
      if (g && !BASE_GENRES.includes(g) && !extra.includes(g)) extra.push(g);
    }
    return [...BASE_GENRES, ...extra.slice(0, 3)];
  }, [recent]);

  // Pull-to-refresh (YouTube-Music style): rebuild mixes, refetch trending and reshuffle the feed.
  const [refreshing, setRefreshing] = useState(false);
  const [feedSeed, setFeedSeed] = useState(0);
  const [pulled, setPulled] = useState(false);
  const spin = useSharedValue(0);
  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const onRefresh = useCallback(async (fromPull = false) => {
    if (refreshing) return;
    setPulled(fromPull === true);
    haptic.medium();
    setRefreshing(true);
    spin.value = withRepeat(withTiming(360, { duration: 900, easing: Easing.linear }), -1, false);
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ["library"] }),
        deviceId
          ? fetchMixes(deviceId, true).then((m) => queryClient.setQueryData(["mixes", deviceId], m))
          : Promise.resolve(),
      ]);
      setFeedSeed((n) => n + 1);
      haptic.success();
    } finally {
      cancelAnimation(spin);
      spin.value = withTiming(0, { duration: 200 });
      setRefreshing(false);
    }
  }, [refreshing, refetch, deviceId, spin]);

  const shuffled = useMemo(() => {
    if (!feedSeed) return tracks;
    const arr = [...tracks];
    let seed = feedSeed * 9301 + 49297;
    for (let i = arr.length - 1; i > 0; i--) {
      seed = (seed * 9301 + 49297) % 233280;
      const j = Math.floor((seed / 233280) * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, [tracks, feedSeed]);

  // "Because you played …" — recommendations seeded by the two most recent distinct songs.
  const seeds = useMemo(() => {
    const out: Track[] = [];
    for (const t of recent) {
      if (out.length >= 2) break;
      if (!out.some((x) => x.artist === t.artist)) out.push(t);
    }
    return out;
  }, [recent]);
  const becauseQueries = useQueries({
    queries: seeds.map((t) => ({
      queryKey: ["because", t.id],
      queryFn: () => fetchRecommendations(t.id),
      staleTime: 30 * 60 * 1000,
    })),
  });
  const because = seeds
    .map((seed, i) => ({ seed, tracks: (becauseQueries[i]?.data ?? []).slice(0, 12) }))
    .filter((b) => b.tracks.length >= 4);

  const hero = shuffled[0];
  const trendingRow = shuffled.slice(1, 12);
  const listTracks = shuffled.slice(1);

  const StickyHeader = (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.kicker}>{greeting()}</Text>
          <Text style={styles.brand}>LiquidAudio</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            testID="home-search-shortcut"
            onPress={() => router.push("/search")}
            style={styles.iconBtn}
          >
            <Icon name="search" size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable testID="home-refresh" onPress={() => onRefresh(false)} style={styles.iconBtn}>
            <Animated.View style={spinStyle}>
              <Icon name="refresh" size={22} color={refreshing ? colors.brandPrimary : colors.onSurface} />
            </Animated.View>
          </Pressable>
          <Pressable
            testID="home-settings"
            onPress={() => router.push("/settings")}
            style={styles.iconBtn}
          >
            <Icon name="settings-outline" size={22} color={colors.onSurface} />
          </Pressable>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {GENRES.map((g) => {
          const active = g === genre;
          return (
            <Pressable
              key={g}
              testID={`genre-chip-${g}`}
              onPress={() => setGenre(g)}
              style={[styles.chip, active && styles.chipActive]}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{g}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        {StickyHeader}
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
          <Text style={styles.dim}>Curating your feed…</Text>
        </View>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.container}>
        {StickyHeader}
        <View style={styles.center}>
          <Icon name="cloud-offline-outline" size={40} color={colors.muted} />
          <Text style={styles.dim}>Couldn’t load music</Text>
          <Pressable testID="home-retry" onPress={() => refetch()} style={styles.retryBtn}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="home-screen">
      <PullToRefresh refreshing={refreshing} onRefresh={() => onRefresh(true)} excludeTop={insets.top + 132}>
        {({ scrollGesture, onScroll }) => (
      <GestureDetector gesture={scrollGesture}>
      <Animated.ScrollView
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        bounces={false}
        overScrollMode="never"
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: contentBottomPad(hasTrack) }}
      >
        {StickyHeader}
        <LiquidRefresh visible={refreshing && !pulled} label="Refreshing your feed…" />
        <Animated.View layout={LinearTransition.springify().damping(20)} key={`feed-${feedSeed}`}>

        {hero ? (
          <Pressable
            testID="hero-card"
            style={styles.hero}
            onPress={() => playNow(hero, tracks)}
          >
            <Image
              source={hero.artwork ? { uri: hero.artwork } : undefined}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={400}
            />
            <LinearGradient
              colors={["transparent", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.85)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroContent}>
              <Text style={styles.heroBadge}>FEATURED</Text>
              <Text style={styles.heroTitle} numberOfLines={2}>
                {hero.title}
              </Text>
              <Text style={styles.heroArtist} numberOfLines={1}>
                {hero.artist}
              </Text>
              <View style={styles.heroPlay}>
                <Icon name="play" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.heroPlayText}>Play</Text>
              </View>
            </View>
          </Pressable>
        ) : null}

        {mixes.length ? (
          <>
            <SectionTitle text="Made for you" />
            <FlatList
              horizontal
              data={mixes}
              keyExtractor={(m) => m.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <MixCard mix={item} onPress={() => router.push(`/mix/${item.id}`)} />
              )}
            />
          </>
        ) : null}

        <SectionTitle text={`Trending in ${genre}`} />
        <FlatList
          horizontal
          data={trendingRow}
          keyExtractor={(t) => t.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hRow}
          renderItem={({ item }) => (
            <ArtworkCard track={item} onPress={() => playNow(item, tracks)} size={150} />
          )}
        />

        {because.map((b) => (
          <View key={b.seed.id} testID={`because-${b.seed.id}`}>
            <SectionTitle text={`Because you played ${b.seed.title}`} />
            <FlatList
              horizontal
              data={b.tracks}
              keyExtractor={(t) => t.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <ArtworkCard track={item} onPress={() => playNow(item, b.tracks)} size={130} />
              )}
            />
          </View>
        ))}

        {recent.length > 0 ? (
          <>
            <SectionTitle text="Recently Played" />
            <FlatList
              horizontal
              data={recent as Track[]}
              keyExtractor={(t) => t.id}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hRow}
              renderItem={({ item }) => (
                <ArtworkCard
                  track={item}
                  onPress={() => playNow(item, recent as Track[])}
                  size={132}
                />
              )}
            />
          </>
        ) : null}

        </Animated.View>
        <SectionTitle text="More to explore" />
        <View style={styles.listWrap}>
          {listTracks.map((item) => (
            <TrackRow
              key={item.id}
              track={item}
              active={current?.id === item.id}
              onPress={() => playNow(item, listTracks)}
              onMore={() => openActions(item)}
            />
          ))}
        </View>
      </Animated.ScrollView>
      </GestureDetector>
        )}
      </PullToRefresh>
    </View>
  );
}

function SectionTitle({ text }: { text: string }) {
  const styles = useStyles();
  return <Text style={styles.sectionTitle}>{text}</Text>;
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  kicker: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  brand: { color: colors.onSurface, fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  headerActions: { flexDirection: "row", gap: 8 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  chipRow: { gap: 8, paddingRight: 16, height: 56, alignItems: "center" },
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
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  dim: { color: colors.muted, fontSize: 14 },
  retryBtn: {
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 999,
  },
  retryText: { color: colors.onBrandPrimary, fontWeight: "700" },
  hero: {
    height: 230,
    marginHorizontal: 16,
    marginTop: 8,
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.surfaceTertiary,
    justifyContent: "flex-end",
  },
  heroContent: { padding: 20, gap: 4 },
  heroBadge: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    opacity: 0.85,
  },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  heroArtist: { color: "rgba(255,255,255,0.8)", fontSize: 14, marginBottom: 8 },
  heroPlay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: colors.brandPrimary,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
  },
  heroPlayText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    marginTop: 24,
    marginBottom: 14,
    paddingHorizontal: 16,
  },
  hRow: { gap: 14, paddingHorizontal: 16 },
  listWrap: { paddingHorizontal: 12 },
}));
