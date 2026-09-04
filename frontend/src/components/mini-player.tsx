import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useAudio } from "@/src/components/audio-context";
import { Glass } from "@/src/components/glass";
import { Icon } from "@/src/components/icon";
import { MINI_PLAYER_HEIGHT } from "@/src/lib/layout";
import { makeStyles, useTheme } from "@/src/theme";

export function MiniPlayer({ bottomOffset }: { bottomOffset: number }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { current, isPlaying, toggle, next, position, duration } = useAudio();

  if (!current) return null;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={[styles.wrap, { bottom: bottomOffset + 8 }]} pointerEvents="box-none">
      <Pressable
        testID="mini-player"
        onPress={() => router.push("/player")}
        style={styles.press}
      >
        <Glass intensity={80} style={styles.pill}>
          <Image
            source={current.artwork ? { uri: current.artwork } : undefined}
            style={styles.art}
            contentFit="cover"
            transition={200}
          />
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {current.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>
              {current.artist}
            </Text>
          </View>
          <Pressable
            testID="mini-play-toggle"
            onPress={toggle}
            hitSlop={12}
            style={styles.ctrl}
          >
            <Icon name={isPlaying ? "pause" : "play"} size={22} color={colors.onSurface} />
          </Pressable>
          <Pressable
            testID="mini-next"
            onPress={next}
            hitSlop={12}
            style={styles.ctrl}
          >
            <Icon name="play-skip-forward" size={20} color={colors.onSurface} />
          </Pressable>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </Glass>
      </Pressable>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  wrap: {
    position: "absolute",
    left: 8,
    right: 8,
  },
  press: { width: "100%" },
  pill: {
    height: MINI_PLAYER_HEIGHT,
    borderRadius: 18,
    overflow: "hidden",
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 8,
    paddingRight: 6,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  art: {
    width: 46,
    height: 46,
    borderRadius: 12,
    backgroundColor: colors.surfaceTertiary,
  },
  meta: { flex: 1, gap: 2 },
  title: { color: colors.onSurface, fontSize: 14, fontWeight: "700" },
  artist: { color: colors.muted, fontSize: 12 },
  ctrl: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 2.5,
    backgroundColor: colors.eqTrack,
  },
  progressFill: {
    height: 2.5,
    backgroundColor: colors.brandPrimary,
  },
}));
