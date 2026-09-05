import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { ArtworkBackdrop } from "@/src/components/artwork-backdrop";
import { useDownloads } from "@/src/components/downloads-context";
import { Icon } from "@/src/components/icon";
import { useToast } from "@/src/components/toast";
import { useTrackActions } from "@/src/components/track-actions";
import { toggleFavorite } from "@/src/lib/api";
import { fmtTime } from "@/src/lib/format";
import { haptic } from "@/src/lib/haptics";
import { useLibrary } from "@/src/lib/hooks";
import { queryClient } from "@/src/query-client";
import { useTheme } from "@/src/theme";

const WHITE = "#FFFFFF";
const WHITE_DIM = "rgba(255,255,255,0.6)";

export default function PlayerScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const openActions = useTrackActions();
  const {
    current,
    isPlaying,
    isBuffering,
    position,
    duration,
    toggle,
    next,
    prev,
    seek,
    repeat,
    shuffle,
    cycleRepeat,
    toggleShuffle,
  } = useAudio();

  const { data: library, deviceId } = useLibrary();
  const { isDownloaded, isDownloading, downloadTrack } = useDownloads();
  const isFav = !!(current && library?.favorites?.some((f) => f.id === current.id));
  const favMutation = useMutation({
    mutationFn: () => toggleFavorite(deviceId as string, current!),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast(res.favorited ? "Added to Favorites" : "Removed from Favorites", "success");
    },
  });

  if (!current) {
    return (
      <View style={[styles.container, { backgroundColor: colors.surface }]}>
        <View style={[styles.emptyWrap, { paddingTop: insets.top + 60 }]}>
          <Icon name="musical-note" size={48} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>Nothing playing</Text>
          <Pressable testID="player-close-empty" onPress={() => router.back()}>
            <Text style={{ color: colors.brandPrimary, fontWeight: "700" }}>Close</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const repeatColor = repeat === "off" ? WHITE_DIM : colors.brandPrimary;

  return (
    <View style={styles.container} testID="player-screen">
      <ArtworkBackdrop uri={current.artwork} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.topBar}>
          <Pressable testID="player-close" onPress={() => router.back()} hitSlop={12} style={styles.topBtn}>
            <Icon name="chevron-down" size={28} color={WHITE} />
          </Pressable>
          <Text style={styles.topLabel}>Now Playing</Text>
          <Pressable testID="player-more" onPress={() => openActions(current)} hitSlop={12} style={styles.topBtn}>
            <Icon name="ellipsis-horizontal" size={24} color={WHITE} />
          </Pressable>
        </View>

        <View style={styles.artWrap}>
          <Image
            source={current.artwork ? { uri: current.artwork } : undefined}
            style={styles.art}
            contentFit="cover"
            transition={400}
          />
        </View>

        <View style={styles.info}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {current.title}
            </Text>
            <Pressable
              testID="player-artist-link"
              disabled={!current.artistHandle}
              onPress={() => current.artistHandle && router.push(`/artist/${current.artistHandle}`)}
            >
              <Text style={styles.artist} numberOfLines={1}>
                {current.artist}
                {current.artistHandle ? "  ›" : ""}
              </Text>
            </Pressable>
          </View>
          <Pressable
            testID="player-favorite"
            onPress={() => {
              haptic.selection();
              favMutation.mutate();
            }}
            hitSlop={10}
          >
            <Icon name={isFav ? "heart" : "heart-outline"} size={28} color={isFav ? colors.brandPrimary : WHITE} />
          </Pressable>
        </View>

        <SeekBar
          position={position}
          duration={duration || current.duration}
          onSeek={seek}
          fill={colors.brandPrimary}
        />

        <View style={styles.controls}>
          <Pressable testID="player-shuffle" onPress={toggleShuffle} hitSlop={10}>
            <Icon name="shuffle" size={24} color={shuffle ? colors.brandPrimary : WHITE_DIM} />
          </Pressable>
          <Pressable testID="player-prev" onPress={prev} hitSlop={10}>
            <Icon name="play-skip-back" size={34} color={WHITE} />
          </Pressable>
          <Pressable testID="player-play-toggle" onPress={toggle} style={styles.playBtn}>
            <Icon
              name={isBuffering ? "ellipsis-horizontal" : isPlaying ? "pause" : "play"}
              size={36}
              color={colors.onBrandPrimary}
            />
          </Pressable>
          <Pressable testID="player-next" onPress={next} hitSlop={10}>
            <Icon name="play-skip-forward" size={34} color={WHITE} />
          </Pressable>
          <Pressable testID="player-repeat" onPress={cycleRepeat} hitSlop={10}>
            <View>
              <Icon name="repeat" size={24} color={repeatColor} />
              {repeat === "one" ? <View style={[styles.repeatBadge, { backgroundColor: colors.brandPrimary }]}><Text style={styles.repeatBadgeText}>1</Text></View> : null}
            </View>
          </Pressable>
        </View>

        <View style={styles.bottomActions}>
          <Pressable testID="player-lyrics-btn" onPress={() => router.push("/lyrics")} style={styles.bottomBtn}>
            <Icon name="mic-outline" size={22} color={WHITE} />
            <Text style={styles.bottomBtnText}>Lyrics</Text>
          </Pressable>
          <Pressable testID="player-queue-btn" onPress={() => router.push("/queue")} style={styles.bottomBtn}>
            <Icon name="list" size={22} color={WHITE} />
            <Text style={styles.bottomBtnText}>Queue</Text>
          </Pressable>
          <Pressable
            testID="player-download-btn"
            onPress={() => downloadTrack(current)}
            disabled={isDownloaded(current.id) || isDownloading(current.id)}
            style={styles.bottomBtn}
          >
            <Icon
              name={isDownloaded(current.id) ? "checkmark-circle" : isDownloading(current.id) ? "cloud-download" : "download-outline"}
              size={22}
              color={isDownloaded(current.id) ? colors.brandPrimary : WHITE}
            />
            <Text style={styles.bottomBtnText}>
              {isDownloaded(current.id) ? "Saved" : isDownloading(current.id) ? "…" : "Save"}
            </Text>
          </Pressable>
          <Pressable
            testID="player-eq-btn"
            onPress={() => {
              router.back();
              router.push("/equalizer");
            }}
            style={styles.bottomBtn}
          >
            <Icon name="options" size={22} color={WHITE} />
            <Text style={styles.bottomBtnText}>EQ</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function SeekBar({
  position,
  duration,
  onSeek,
  fill,
}: {
  position: number;
  duration: number;
  onSeek: (s: number) => void;
  fill: string;
}) {
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [dragValue, setDragValue] = useState(0);
  const widthRef = useRef(0);
  const durRef = useRef(duration);
  durRef.current = duration;

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          setDragging(true);
          haptic.selection();
          const x = e.nativeEvent.locationX;
          const ratio = widthRef.current ? x / widthRef.current : 0;
          setDragValue(Math.max(0, Math.min(1, ratio)) * durRef.current);
        },
        onPanResponderMove: (e) => {
          const x = e.nativeEvent.locationX;
          const ratio = widthRef.current ? x / widthRef.current : 0;
          setDragValue(Math.max(0, Math.min(1, ratio)) * durRef.current);
        },
        onPanResponderRelease: (e) => {
          const x = e.nativeEvent.locationX;
          const ratio = widthRef.current ? x / widthRef.current : 0;
          const target = Math.max(0, Math.min(1, ratio)) * durRef.current;
          onSeek(target);
          setDragging(false);
        },
      }),
    [onSeek],
  );

  const shown = dragging ? dragValue : position;
  const pct = duration > 0 ? Math.min(1, shown / duration) : 0;

  return (
    <View style={styles.seekWrap}>
      <View
        testID="seek-bar"
        style={styles.seekHit}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          setWidth(w);
          widthRef.current = w;
        }}
        {...responder.panHandlers}
      >
        <View style={styles.seekTrack} />
        <View style={[styles.seekFill, { width: pct * width, backgroundColor: fill }]} />
        <View style={[styles.seekThumb, { left: Math.max(0, pct * width - 7), backgroundColor: fill }]} />
      </View>
      <View style={styles.seekTimes}>
        <Text style={styles.timeText}>{fmtTime(shown)}</Text>
        <Text style={styles.timeText}>{fmtTime(duration)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  emptyWrap: { flex: 1, alignItems: "center", gap: 14 },
  emptyText: { fontSize: 16, fontWeight: "600" },
  content: { flex: 1, paddingHorizontal: 24 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topLabel: { color: WHITE, fontSize: 14, fontWeight: "700", letterSpacing: 0.5 },
  artWrap: {
    flex: 1,
    maxHeight: 380,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 16,
  },
  art: {
    width: "100%",
    aspectRatio: 1,
    maxWidth: 360,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
  },
  info: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 12 },
  title: { color: WHITE, fontSize: 24, fontWeight: "800", letterSpacing: -0.5 },
  artist: { color: WHITE_DIM, fontSize: 16, marginTop: 4 },
  seekWrap: { marginBottom: 8 },
  seekHit: { height: 28, justifyContent: "center" },
  seekTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  seekFill: { position: "absolute", height: 5, borderRadius: 3, left: 0 },
  seekThumb: { position: "absolute", width: 14, height: 14, borderRadius: 7, top: 7 },
  seekTimes: { flexDirection: "row", justifyContent: "space-between", marginTop: 6 },
  timeText: { color: WHITE_DIM, fontSize: 12, fontWeight: "600" },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 18,
  },
  playBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F43F5E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#F43F5E",
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
  },
  repeatBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  repeatBadgeText: { color: "#FFF", fontSize: 9, fontWeight: "800" },
  bottomActions: { flexDirection: "row", justifyContent: "center", gap: 10 },
  bottomBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  bottomBtnText: { color: WHITE, fontSize: 12, fontWeight: "700" },
});
