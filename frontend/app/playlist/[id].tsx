import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/src/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { useDownloads } from "@/src/components/downloads-context";
import { Icon } from "@/src/components/icon";
import { TrackRow } from "@/src/components/track-row";
import { useToast } from "@/src/components/toast";
import { useTrackActions } from "@/src/components/track-actions";
import {
  removeFromPlaylist,
  reorderPlaylist,
  type Track,
} from "@/src/lib/api";
import { haptic } from "@/src/lib/haptics";
import { contentBottomPad } from "@/src/lib/layout";
import { useLibrary } from "@/src/lib/hooks";
import { queryClient } from "@/src/query-client";
import { makeStyles, useTheme } from "@/src/theme";

export default function PlaylistDetailScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { playNow, current, hasTrack } = useAudio();
  const openActions = useTrackActions();
  const { data: library, deviceId } = useLibrary();
  const { downloadMany } = useDownloads();

  const playlist = useMemo(
    () => library?.playlists?.find((p) => p.id === id),
    [library?.playlists, id],
  );

  const [editing, setEditing] = useState(false);
  const [order, setOrder] = useState<Track[]>([]);

  useEffect(() => {
    if (playlist) setOrder(playlist.tracks);
  }, [playlist]);

  const removeMutation = useMutation({
    mutationFn: (trackId: string) => removeFromPlaylist(deviceId as string, id as string, trackId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast("Removed from playlist", "success");
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderPlaylist(deviceId as string, id as string, ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["library"] }),
  });

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    haptic.selection();
    const nextArr = [...order];
    [nextArr[index], nextArr[target]] = [nextArr[target], nextArr[index]];
    setOrder(nextArr);
    reorderMutation.mutate(nextArr.map((t) => t.id));
  };

  const remove = (track: Track) => {
    setOrder((prev) => prev.filter((t) => t.id !== track.id));
    removeMutation.mutate(track.id);
  };

  if (!playlist) {
    return (
      <View style={styles.container}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable testID="playlist-back" onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
            <Icon name="chevron-back" size={26} color={colors.onSurface} />
          </Pressable>
        </View>
        <View style={styles.center}>
          <Icon name="albums-outline" size={40} color={colors.muted} />
          <Text style={styles.dim}>Playlist not found</Text>
        </View>
      </View>
    );
  }

  const cover = order[0]?.artwork;

  return (
    <View style={styles.container} testID="playlist-detail-screen">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPad(hasTrack) }}
      >
        <View style={styles.hero}>
          {cover ? (
            <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <LinearGradient
            colors={["rgba(0,0,0,0.2)", "rgba(0,0,0,0.45)", colors.surface]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
            <Pressable testID="playlist-back" onPress={() => router.back()} hitSlop={12} style={styles.iconBtnGlass}>
              <Icon name="chevron-back" size={24} color="#FFFFFF" />
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                testID="playlist-download-all"
                onPress={() => order.length && downloadMany(order)}
                hitSlop={12}
                style={styles.iconBtnGlass}
              >
                <Icon name="download-outline" size={22} color="#FFFFFF" />
              </Pressable>
              <Pressable
                testID="playlist-edit-toggle"
                onPress={() => {
                  haptic.selection();
                  setEditing((v) => !v);
                }}
                hitSlop={12}
                style={styles.iconBtnGlass}
              >
                <Icon name={editing ? "checkmark" : "create-outline"} size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <View style={styles.heroContent}>
            <Text style={styles.plName} numberOfLines={2}>
              {playlist.name}
            </Text>
            <Text style={styles.plCount}>
              {order.length} {order.length === 1 ? "track" : "tracks"}
            </Text>
          </View>
        </View>

        {order.length === 0 ? (
          <View style={styles.center}>
            <Icon name="musical-notes-outline" size={40} color={colors.muted} />
            <Text style={styles.dim}>No tracks yet</Text>
            <Text style={styles.hint}>Tap ••• on any track to add it here</Text>
          </View>
        ) : (
          <>
            {!editing ? (
              <View style={styles.actions}>
                <Pressable
                  testID="playlist-play"
                  style={styles.playBtn}
                  onPress={() => playNow(order[0], order)}
                >
                  <Icon name="play" size={18} color={colors.onBrandPrimary} />
                  <Text style={styles.playText}>Play</Text>
                </Pressable>
                <Pressable
                  testID="playlist-shuffle"
                  style={styles.shuffleBtn}
                  onPress={() => {
                    const r = Math.floor(Math.random() * order.length);
                    playNow(order[r], order);
                  }}
                >
                  <Icon name="shuffle" size={18} color={colors.onSurface} />
                  <Text style={styles.shuffleText}>Shuffle</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.editHint}>Reorder with the arrows, or remove with −</Text>
            )}

            <View style={styles.list}>
              {order.map((track, index) =>
                editing ? (
                  <View key={track.id} style={styles.editRow} testID={`edit-row-${track.id}`}>
                    <Pressable
                      testID={`remove-track-${track.id}`}
                      onPress={() => remove(track)}
                      hitSlop={8}
                      style={styles.removeBtn}
                    >
                      <Icon name="remove-circle" size={24} color={colors.error} />
                    </Pressable>
                    <Image
                      source={track.artwork ? { uri: track.artwork } : undefined}
                      style={styles.editArt}
                      contentFit="cover"
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.editTitle} numberOfLines={1}>
                        {track.title}
                      </Text>
                      <Text style={styles.editArtist} numberOfLines={1}>
                        {track.artist}
                      </Text>
                    </View>
                    <View style={styles.arrows}>
                      <Pressable
                        testID={`move-up-${track.id}`}
                        onPress={() => move(index, -1)}
                        hitSlop={6}
                        style={styles.arrowBtn}
                        disabled={index === 0}
                      >
                        <Icon name="chevron-up" size={22} color={index === 0 ? colors.border : colors.onSurface} />
                      </Pressable>
                      <Pressable
                        testID={`move-down-${track.id}`}
                        onPress={() => move(index, 1)}
                        hitSlop={6}
                        style={styles.arrowBtn}
                        disabled={index === order.length - 1}
                      >
                        <Icon
                          name="chevron-down"
                          size={22}
                          color={index === order.length - 1 ? colors.border : colors.onSurface}
                        />
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <TrackRow
                    key={track.id}
                    track={track}
                    active={current?.id === track.id}
                    onPress={() => playNow(track, order)}
                    onMore={() => openActions(track)}
                  />
                ),
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  hero: { minHeight: 240, justifyContent: "flex-end", backgroundColor: colors.surfaceTertiary },
  topBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    zIndex: 2,
  },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  iconBtnGlass: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  heroContent: { padding: 20, gap: 6 },
  plName: { color: "#FFFFFF", fontSize: 30, fontWeight: "800", letterSpacing: -0.6 },
  plCount: { color: "rgba(255,255,255,0.85)", fontSize: 14, fontWeight: "600" },
  center: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 70 },
  dim: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 14 },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 16, marginTop: 18 },
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
  editHint: { color: colors.muted, fontSize: 13, paddingHorizontal: 16, marginTop: 16 },
  list: { paddingHorizontal: 12, marginTop: 12 },
  editRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  removeBtn: { padding: 2 },
  editArt: { width: 46, height: 46, borderRadius: 8, backgroundColor: colors.surfaceTertiary },
  editTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  editArtist: { color: colors.muted, fontSize: 13, marginTop: 2 },
  arrows: { flexDirection: "row", gap: 4 },
  arrowBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.surfaceTertiary,
  },
}));
