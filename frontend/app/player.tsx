import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Text } from "@/src/components/text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { useAudio, useAudioProgress } from "@/src/components/audio-context";
import { ArtworkBackdrop } from "@/src/components/artwork-backdrop";
import { useDownloads } from "@/src/components/downloads-context";
import { Icon } from "@/src/components/icon";
import { useJam } from "@/src/components/jam-context";
import { PlayerPanel, type PanelTab } from "@/src/components/player-panel";
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
    queue,
    index,
    isPlaying,
    isBuffering,
    toggle,
    next,
    prev,
    seek,
    repeat,
    shuffle,
    cycleRepeat,
    toggleShuffle,
  } = useAudio();

  const { position, duration } = useAudioProgress();
  const jam = useJam();
  const guest = !!jam.room && !jam.isHost;
  const onToggle = guest ? () => jam.sendControl("toggle") : toggle;
  const onNext = guest ? () => jam.sendControl("next") : next;
  const onPrev = guest ? () => jam.sendControl("prev") : prev;
  const { height: winH, width: winW } = useWindowDimensions();
  // Artwork must never push the controls off-screen: fit it to the space left after the chrome.
  const artSize = Math.max(180, Math.min(winW - 48, 360, winH - insets.top - insets.bottom - 470));
  const [panel, setPanel] = useState<PanelTab | null>(null);
  const panelY = useSharedValue(winH);
  const scrim = useSharedValue(0);
  useEffect(() => {
    panelY.value = panel ? withSpring(0, { damping: 22, stiffness: 220, mass: 0.9 }) : withTiming(winH, { duration: 260 });
    scrim.value = withTiming(panel ? 1 : 0, { duration: 240 });
  }, [panel, winH, panelY, scrim]);
  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateY: panelY.value }] }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const openPanel = (t: PanelTab) => {
    haptic.selection();
    setPanel((cur) => (cur === t ? null : t));
  };
  const BAR_H = 56;
  // Swipe down anywhere on the player (when the panel is closed) to dismiss it.
  const dragY = useSharedValue(0);
  const goBack = () => router.back();
  const dismiss = Gesture.Pan()
    .activeOffsetY([18, 9999])
    .failOffsetX([-24, 24])
    .onUpdate((e) => {
      if (panel) return;
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (panel) return;
      if (dragY.value > 140 || e.velocityY > 1100) {
        dragY.value = withTiming(winH, { duration: 200 });
        runOnJS(goBack)();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
      }
    });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }, { scale: 1 - Math.min(0.06, dragY.value / 2500) }],
    borderRadius: dragY.value > 0 ? 28 : 0,
    overflow: "hidden",
  }));
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
  const upcomingCount = Math.max(0, queue.length - index - 1);

  return (
    <Animated.View style={[styles.container, dragStyle]} testID="player-screen">
      <ArtworkBackdrop uri={current.artwork} />

      <View style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 8) + BAR_H + 16 }]}>
        <GestureDetector gesture={dismiss}>
        <View collapsable={false} testID="player-drag-zone">
        <View style={styles.topBar}>
          <Pressable testID="player-close" onPress={() => router.back()} hitSlop={12} style={styles.topBtn}>
            <Icon name="chevron-down" size={28} color={WHITE} />
          </Pressable>
          <Pressable testID="player-jam" onPress={() => router.push("/jam")} style={[styles.jamPill, jam.room && { backgroundColor: colors.brandPrimary }]}>
            <Icon name="people" size={16} color={WHITE} />
            <Text style={styles.jamPillText}>{jam.room ? `Jam · ${jam.members.length}` : "Jam"}</Text>
          </Pressable>
          <Pressable testID="player-more" onPress={() => openActions(current)} hitSlop={12} style={styles.topBtn}>
            <Icon name="ellipsis-horizontal" size={24} color={WHITE} />
          </Pressable>
        </View>

        <View style={styles.artWrap}>
          <Image
            source={current.artwork ? { uri: current.artwork } : undefined}
            style={[styles.art, { width: artSize, height: artSize }]}
            contentFit="cover"
            transition={400}
          />
          <View style={StyleSheet.absoluteFill} />
        </View>
        </View>
        </GestureDetector>

        <View style={styles.info}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {current.title}
            </Text>
            <Pressable
              testID="player-artist-link"
              disabled={!current.artistHandle}
              onPress={() => {
                const credited = (current.artists ?? []).filter((a) => a.id);
                if (credited.length > 1) openActions(current);
                else if (current.artistHandle) router.push(`/artist/${current.artistHandle}`);
              }}
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
          <AnimatedPressable testID="player-shuffle" onPress={toggleShuffle} scaleTo={0.8}>
            <Icon name="shuffle" size={24} color={shuffle ? colors.brandPrimary : WHITE_DIM} />
          </AnimatedPressable>
          <AnimatedPressable testID="player-prev" onPress={onPrev} scaleTo={0.8}>
            <Icon name="play-skip-back" size={34} color={WHITE} />
          </AnimatedPressable>
          <AnimatedPressable testID="player-play-toggle" onPress={onToggle} style={[styles.playBtn, { backgroundColor: colors.brandPrimary, boxShadow: `0 6px 16px ${colors.brandPrimary}80` }]} scaleTo={0.9}>
            <Icon
              name={isBuffering ? "ellipsis-horizontal" : isPlaying ? "pause" : "play"}
              size={36}
              color={colors.onBrandPrimary}
            />
          </AnimatedPressable>
          <AnimatedPressable testID="player-next" onPress={onNext} scaleTo={0.8}>
            <Icon name="play-skip-forward" size={34} color={WHITE} />
          </AnimatedPressable>
          <AnimatedPressable testID="player-repeat" onPress={cycleRepeat} scaleTo={0.8}>
            <View>
              <Icon name="repeat" size={24} color={repeatColor} />
              {repeat === "one" ? <View style={[styles.repeatBadge, { backgroundColor: colors.brandPrimary }]}><Text style={styles.repeatBadgeText}>1</Text></View> : null}
            </View>
          </AnimatedPressable>
        </View>

        <View style={styles.bottomActions}>
          <AnimatedPressable
            testID="player-download-btn"
            onPress={() => downloadTrack(current)}
            disabled={isDownloaded(current.id) || isDownloading(current.id)}
            style={styles.bottomBtn}
            scaleTo={0.93}
          >
            <Icon
              name={isDownloaded(current.id) ? "checkmark-circle" : isDownloading(current.id) ? "cloud-download" : "download-outline"}
              size={22}
              color={isDownloaded(current.id) ? colors.brandPrimary : WHITE}
            />
            <Text style={styles.bottomBtnText}>
              {isDownloaded(current.id) ? "Saved" : isDownloading(current.id) ? "…" : "Save"}
            </Text>
          </AnimatedPressable>
          <AnimatedPressable
            testID="player-eq-btn"
            onPress={() => {
              router.back();
              router.push("/equalizer");
            }}
            style={styles.bottomBtn}
            scaleTo={0.93}
          >
            <Icon name="options" size={22} color={WHITE} />
            <Text style={styles.bottomBtnText}>EQ</Text>
          </AnimatedPressable>
          <AnimatedPressable testID="player-jam-btn" onPress={() => router.push("/jam")} style={styles.bottomBtn} scaleTo={0.93}>
            <Icon name="people-outline" size={22} color={jam.room ? colors.brandPrimary : WHITE} />
            <Text style={styles.bottomBtnText}>{jam.room ? `Jam · ${jam.members.length}` : "Jam"}</Text>
          </AnimatedPressable>
        </View>

      </View>

      <Animated.View pointerEvents={panel ? "auto" : "none"} style={[styles.scrim, scrimStyle]}>
        <Pressable style={{ flex: 1 }} onPress={() => setPanel(null)} testID="player-panel-scrim" />
      </Animated.View>
      <Animated.View
        pointerEvents={panel ? "auto" : "none"}
        style={[styles.panel, { top: insets.top + 56, bottom: BAR_H + Math.max(insets.bottom, 8) + 8 }, panelStyle]}
        testID="player-panel"
      >
        {panel ? <PlayerPanel tab={panel} onTabChange={setPanel} onClose={() => setPanel(null)} /> : null}
      </Animated.View>

        {/* YouTube-Music style bottom bar: Up next · Lyrics · Related */}
        <View style={[styles.panelBar, { bottom: Math.max(insets.bottom, 8) }]} testID="player-panel-bar">
          {(
            [
              { key: "upnext", label: "Up next", icon: "list" },
              { key: "lyrics", label: "Lyrics", icon: "mic-outline" },
              { key: "related", label: "Related", icon: "sparkles-outline" },
            ] as const
          ).map((t) => (
            <AnimatedPressable
              key={t.key}
              testID={`player-tab-${t.key}`}
              onPress={() => openPanel(t.key)}
              scaleTo={0.94}
              hitSlop={0}
              style={[styles.panelTab, panel === t.key && { backgroundColor: colors.brandPrimary }]}
            >
              <View>
                <Icon name={t.icon} size={18} color={panel === t.key ? colors.onBrandPrimary : WHITE} />
                {t.key === "upnext" && upcomingCount > 0 ? (
                  <View style={[styles.queueBadge, { backgroundColor: colors.brandPrimary }]}>
                    <Text style={styles.repeatBadgeText}>{upcomingCount > 99 ? "99+" : upcomingCount}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.panelTabText, panel === t.key && { color: colors.onBrandPrimary }]}>{t.label}</Text>
            </AnimatedPressable>
          ))}
        </View>
    </Animated.View>
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
  jamPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    height: 34,
    borderRadius: 17,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  jamPillText: { color: WHITE, fontSize: 13, fontWeight: "700" },
  artWrap: {
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 12,
  },
  art: {
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.1)",
    boxShadow: "0 16px 30px rgba(0,0,0,0.5)",
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
    alignItems: "center",
    justifyContent: "center",
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
  panelBar: {
    position: "absolute",
    left: 20,
    right: 20,
    zIndex: 30,
    flexDirection: "row",
    padding: 4,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    gap: 4,
  },
  panelTab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14 },
  panelTabText: { color: WHITE, fontSize: 13, fontWeight: "700" },
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 10 },
  panel: { position: "absolute", left: 0, right: 0, zIndex: 20 },
  queueBadge: {
    position: "absolute",
    top: -6,
    right: -10,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
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
