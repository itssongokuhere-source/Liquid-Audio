import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { Icon } from "@/src/components/icon";
import { TrackRow } from "@/src/components/track-row";
import { useTrackActions } from "@/src/components/track-actions";
import { fetchArtist } from "@/src/lib/api";
import { fmtCount } from "@/src/lib/format";
import { contentBottomPad } from "@/src/lib/layout";
import { makeStyles, useTheme } from "@/src/theme";

const WHITE = "#FFFFFF";

export default function ArtistScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const { playNow, current, hasTrack } = useAudio();
  const openActions = useTrackActions();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["artist", handle],
    queryFn: () => fetchArtist(handle as string),
    enabled: !!handle,
  });

  const artist = data?.artist;
  const tracks = data?.tracks ?? [];

  return (
    <View style={styles.container} testID="artist-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPad(hasTrack) }}
      >
        <View style={styles.hero}>
          <Image
            source={artist?.cover || artist?.image ? { uri: artist.cover || artist.image! } : undefined}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={400}
          />
          <LinearGradient
            colors={["rgba(0,0,0,0.35)", "rgba(0,0,0,0.4)", colors.surface]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            testID="artist-back"
            onPress={() => router.back()}
            style={[styles.backBtn, { top: insets.top + 8 }]}
            hitSlop={12}
          >
            <Icon name="chevron-back" size={26} color={WHITE} />
          </Pressable>
          <View style={styles.heroContent}>
            {artist?.image ? (
              <Image source={{ uri: artist.image }} style={styles.avatar} contentFit="cover" />
            ) : null}
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={2}>
                {artist?.name ?? "Artist"}
              </Text>
              {artist?.isVerified ? (
                <Icon name="checkmark-circle" size={20} color={colors.brandPrimary} />
              ) : null}
            </View>
            {artist ? (
              <Text style={styles.stats}>
                {fmtCount(artist.followerCount)} followers · {fmtCount(artist.trackCount)} tracks
              </Text>
            ) : null}
          </View>
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brandPrimary} />
          </View>
        ) : isError || !artist ? (
          <View style={styles.center}>
            <Icon name="person-outline" size={40} color={colors.muted} />
            <Text style={styles.dim}>Couldn’t load artist</Text>
          </View>
        ) : (
          <>
            <View style={styles.actions}>
              <Pressable
                testID="artist-play"
                style={styles.playBtn}
                onPress={() => tracks[0] && playNow(tracks[0], tracks)}
              >
                <Icon name="play" size={18} color={colors.onBrandPrimary} />
                <Text style={styles.playText}>Play</Text>
              </Pressable>
              <Pressable
                testID="artist-shuffle"
                style={styles.shuffleBtn}
                onPress={() => {
                  if (!tracks.length) return;
                  const r = Math.floor(Math.random() * tracks.length);
                  playNow(tracks[r], tracks);
                }}
              >
                <Icon name="shuffle" size={18} color={colors.onSurface} />
                <Text style={styles.shuffleText}>Shuffle</Text>
              </Pressable>
            </View>

            {artist.bio ? (
              <Text style={styles.bio} numberOfLines={3}>
                {artist.bio}
              </Text>
            ) : null}

            <Text style={styles.sectionTitle}>Top tracks</Text>
            <View style={styles.list}>
              {tracks.map((t) => (
                <TrackRow
                  key={t.id}
                  track={t}
                  active={current?.id === t.id}
                  onPress={() => playNow(t, tracks)}
                  onMore={() => openActions(t)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { height: 300, justifyContent: "flex-end", backgroundColor: colors.surfaceTertiary },
  backBtn: {
    position: "absolute",
    left: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: { padding: 20, gap: 8 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.9)",
    backgroundColor: colors.surfaceTertiary,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { color: WHITE, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, flexShrink: 1 },
  stats: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  center: { alignItems: "center", justifyContent: "center", gap: 12, paddingVertical: 60 },
  dim: { color: colors.muted, fontSize: 15 },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 20 },
  playBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.brandPrimary,
    paddingVertical: 13,
    borderRadius: 999,
  },
  playText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
  shuffleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.surfaceTertiary,
    paddingVertical: 13,
    borderRadius: 999,
  },
  shuffleText: { color: colors.onSurface, fontSize: 15, fontWeight: "700" },
  bio: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  sectionTitle: {
    color: colors.onSurface,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
    paddingHorizontal: 16,
    marginTop: 24,
    marginBottom: 12,
  },
  list: { paddingHorizontal: 12 },
}));
