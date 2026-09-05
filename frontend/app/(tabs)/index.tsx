import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { ArtworkCard } from "@/src/components/artwork-card";
import { Icon } from "@/src/components/icon";
import { TrackRow } from "@/src/components/track-row";
import { useTrackActions } from "@/src/components/track-actions";
import { fetchTrending, type Track } from "@/src/lib/api";
import { contentBottomPad } from "@/src/lib/layout";
import { useLibrary } from "@/src/lib/hooks";
import { makeStyles, useTheme } from "@/src/theme";

const GENRES = [
  "For You",
  "Electronic",
  "Hip-Hop/Rap",
  "House",
  "Pop",
  "Techno",
  "Trap",
  "R&B/Soul",
  "Deep House",
  "Ambient",
];

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
  const { data: library } = useLibrary();
  const recent = library?.recent ?? [];

  const hero = tracks[0];
  const trendingRow = tracks.slice(1, 12);
  const listTracks = tracks.slice(1);

  const StickyHeader = (
    <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
      <View style={styles.headerTop}>
        <View>
          <Text style={styles.kicker}>Good vibes</Text>
          <Text style={styles.brand}>LiquidAudio</Text>
        </View>
        <Pressable
          testID="home-search-shortcut"
          onPress={() => router.push("/search")}
          style={styles.iconBtn}
        >
          <Icon name="search" size={22} color={colors.onSurface} />
        </Pressable>
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
      <ScrollView
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPad(hasTrack) }}
      >
        {StickyHeader}

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
      </ScrollView>
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
