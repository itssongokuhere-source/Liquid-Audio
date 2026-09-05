import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/src/components/text";

import { Icon } from "@/src/components/icon";
import type { Track } from "@/src/lib/api";
import { makeStyles, useTheme } from "@/src/theme";

const BLUR_HASH = "L6Pj0^i_.AyE_3t7t7R**0o#DgR4";

function TrackRowBase({
  track,
  onPress,
  onMore,
  active,
  isPlaying,
}: {
  track: Track;
  onPress: () => void;
  onMore?: () => void;
  active?: boolean;
  isPlaying?: boolean;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <Pressable
      testID={`track-row-${track.id}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.artWrap}>
        <Image
          source={track.artwork ? { uri: track.artwork } : undefined}
          placeholder={{ blurhash: BLUR_HASH }}
          style={styles.art}
          contentFit="cover"
          transition={250}
        />
        {active ? (
          <View style={styles.playingBadge}>
            <Icon name={isPlaying ? "volume-medium" : "pause"} size={13} color={colors.onBrandPrimary} />
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text style={[styles.title, active && styles.activeTitle]} numberOfLines={1}>
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
        </Text>
      </View>
      {onMore ? (
        <Pressable
          testID={`track-more-${track.id}`}
          onPress={onMore}
          hitSlop={10}
          style={styles.moreBtn}
        >
          <Icon name="ellipsis-horizontal" size={20} color={colors.muted} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

export const TrackRow = memo(TrackRowBase);

const useStyles = makeStyles((colors) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  pressed: { opacity: 0.6 },
  artWrap: { width: 52, height: 52 },
  art: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.surfaceTertiary,
  },
  playingBadge: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  meta: { flex: 1, gap: 3 },
  title: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  activeTitle: { color: colors.brandPrimary },
  artist: { color: colors.muted, fontSize: 13 },
  moreBtn: { padding: 6 },
}));
