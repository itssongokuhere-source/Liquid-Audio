import { Image } from "expo-image";
import { memo, useEffect } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import { Text } from "@/src/components/text";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { Icon } from "@/src/components/icon";
import type { Track } from "@/src/lib/api";
import { haptic } from "@/src/lib/haptics";

export const QUEUE_ROW_H = 66;
const REMOVE_THRESHOLD = -96;

export type QueueItem = { track: Track; index: number };

type Positions = Record<string, number>;

const SPRING = { damping: 20, stiffness: 260, mass: 0.8 };

function QueueRowBase({
  item,
  order,
  positions,
  count,
  onMove,
  onRemove,
  onPlay,
  onPlayNext,
  colors,
  width,
}: {
  item: QueueItem;
  order: number;
  positions: SharedValue<Positions>;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onPlay: (index: number) => void;
  onPlayNext: (index: number) => void;
  colors: { text: string; dim: string; accent: string; danger: string; surface: string; border: string };
  width: number;
}) {
  const id = item.track.id;
  const dragging = useSharedValue(false);
  const dragY = useSharedValue(0);
  const startY = useSharedValue(0);
  const swipeX = useSharedValue(0);
  const removed = useSharedValue(false);

  const commitMove = (fromOrder: number, toOrder: number) => {
    // Convert display order → absolute queue index (items are contiguous after "current").
    const base = item.index - fromOrder;
    onMove(item.index, base + toOrder);
  };

  const drag = Gesture.Pan()
    .activateAfterLongPress(140)
    .onStart(() => {
      dragging.value = true;
      startY.value = (positions.value[id] ?? order) * QUEUE_ROW_H;
      dragY.value = startY.value;
      runOnJS(haptic.medium)();
    })
    .onUpdate((e) => {
      const y = startY.value + e.translationY;
      dragY.value = y;
      const newOrder = Math.max(0, Math.min(count - 1, Math.round(y / QUEUE_ROW_H)));
      const cur = positions.value[id];
      if (newOrder !== cur) {
        const next: Positions = { ...positions.value };
        for (const key in next) {
          if (next[key] === newOrder) next[key] = cur;
        }
        next[id] = newOrder;
        positions.value = next;
        runOnJS(haptic.selection)();
      }
    })
    .onFinalize(() => {
      dragging.value = false;
      runOnJS(commitMove)(order, positions.value[id] ?? order);
    });

  const swipe = Gesture.Pan()
    .activeOffsetX([-18, 18])
    .failOffsetY([-12, 12])
    .onUpdate((e) => {
      swipeX.value = Math.min(0, e.translationX);
    })
    .onEnd((e) => {
      if (e.translationX < REMOVE_THRESHOLD || e.velocityX < -1200) {
        removed.value = true;
        swipeX.value = withTiming(-width, { duration: 180 }, () => {
          runOnJS(onRemove)(item.index);
        });
        runOnJS(haptic.success)();
      } else {
        swipeX.value = withSpring(0, SPRING);
      }
    });

  const rowStyle = useAnimatedStyle(() => {
    const target = (positions.value[id] ?? order) * QUEUE_ROW_H;
    return {
      top: dragging.value ? dragY.value : withSpring(target, SPRING),
      zIndex: dragging.value ? 10 : 1,
      transform: [{ scale: withSpring(dragging.value ? 1.03 : 1, SPRING) }],
      opacity: removed.value ? withTiming(0, { duration: 180 }) : 1,
    };
  });
  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: swipeX.value }],
    backgroundColor: dragging.value || swipeX.value < 0 ? colors.surface : "transparent",
  }));
  const trashStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, -swipeX.value / 60),
    transform: [{ scale: Math.min(1, 0.6 + -swipeX.value / 200) }],
  }));
  const trashBgStyle = useAnimatedStyle(() => ({
    opacity: swipeX.value < -2 ? 1 : 0,
  }));

  return (
    <Animated.View
      style={[styles.row, { width }, rowStyle]}
      entering={FadeInDown.delay(Math.min(order, 8) * 35).springify().damping(18)}
      testID={`queue-item-${item.index}`}
    >
      <Animated.View style={[styles.trashBg, { backgroundColor: colors.danger }, trashBgStyle]}>
        <Animated.View style={trashStyle}>
          <Icon name="trash" size={22} color="#FFFFFF" />
        </Animated.View>
      </Animated.View>
      <GestureDetector gesture={swipe}>
        <Animated.View style={[styles.rowContent, { borderColor: colors.border }, contentStyle]}>
          <AnimatedPressable
            testID={`queue-play-${item.index}`}
            onPress={() => onPlay(item.index)}
            scaleTo={0.98}
            style={styles.main}
          >
            <Image
              source={item.track.artwork ? { uri: item.track.artwork } : undefined}
              style={styles.art}
              contentFit="cover"
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
                {item.track.title}
              </Text>
              <Text style={[styles.artist, { color: colors.dim }]} numberOfLines={1}>
                {item.track.artist}
              </Text>
            </View>
          </AnimatedPressable>
          {order > 0 ? (
            <AnimatedPressable
              testID={`queue-bump-${item.index}`}
              onPress={() => onPlayNext(item.index)}
              style={styles.iconBtn}
            >
              <Icon name="arrow-up-circle-outline" size={22} color={colors.dim} />
            </AnimatedPressable>
          ) : null}
          <GestureDetector gesture={drag}>
            <Animated.View style={styles.handle} testID={`queue-handle-${item.index}`}>
              <Icon name="reorder-three" size={26} color={colors.dim} />
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const QueueRow = memo(QueueRowBase);

export function QueueList({
  items,
  onMove,
  onRemove,
  onPlay,
  onPlayNext,
  colors,
}: {
  items: QueueItem[];
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  onPlay: (index: number) => void;
  onPlayNext: (index: number) => void;
  colors: { text: string; dim: string; accent: string; danger: string; surface: string; border: string };
}) {
  const { width } = useWindowDimensions();
  const rowWidth = width - 40;
  const positions = useSharedValue<Positions>({});
  const signature = items.map((i) => i.track.id).join("|");

  useEffect(() => {
    const next: Positions = {};
    items.forEach((it, i) => {
      next[it.track.id] = i;
    });
    positions.value = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return (
    <View style={{ height: items.length * QUEUE_ROW_H }} testID="queue-list">
      {items.map((item, order) => (
        <QueueRow
          key={item.track.id}
          item={item}
          order={order}
          positions={positions}
          count={items.length}
          onMove={onMove}
          onRemove={onRemove}
          onPlay={onPlay}
          onPlayNext={onPlayNext}
          colors={colors}
          width={rowWidth}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { position: "absolute", left: 0, height: QUEUE_ROW_H, justifyContent: "center" },
  trashBg: {
    position: "absolute",
    top: 3,
    bottom: 3,
    left: 0,
    right: 0,
    borderRadius: 14,
    alignItems: "flex-end",
    justifyContent: "center",
    paddingRight: 22,
  },
  rowContent: {
    flexDirection: "row",
    alignItems: "center",
    height: QUEUE_ROW_H - 6,
    borderRadius: 14,
    paddingLeft: 6,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  art: { width: 48, height: 48, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  title: { fontSize: 15, fontWeight: "600" },
  artist: { fontSize: 13, marginTop: 2 },
  iconBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center" },
  handle: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});
