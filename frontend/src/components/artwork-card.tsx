import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, Text, View } from "react-native";

import type { Track } from "@/src/lib/api";
import { makeStyles } from "@/src/theme";

const BLUR_HASH = "L6Pj0^i_.AyE_3t7t7R**0o#DgR4";

function ArtworkCardBase({
  track,
  onPress,
  size = 150,
}: {
  track: Track;
  onPress: () => void;
  size?: number;
}) {
  const styles = useStyles();
  return (
    <Pressable
      testID={`artwork-card-${track.id}`}
      onPress={onPress}
      style={({ pressed }) => [{ width: size }, pressed && styles.pressed]}
    >
      <Image
        source={track.artwork ? { uri: track.artwork } : undefined}
        placeholder={{ blurhash: BLUR_HASH }}
        style={[styles.art, { width: size, height: size }]}
        contentFit="cover"
        transition={300}
      />
      <Text style={styles.title} numberOfLines={1}>
        {track.title}
      </Text>
      <Text style={styles.artist} numberOfLines={1}>
        {track.artist}
      </Text>
    </Pressable>
  );
}

export const ArtworkCard = memo(ArtworkCardBase);

const useStyles = makeStyles((colors) => ({
  pressed: { opacity: 0.7 },
  art: {
    borderRadius: 16,
    backgroundColor: colors.surfaceTertiary,
    marginBottom: 8,
  },
  title: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  artist: { color: colors.muted, fontSize: 12, marginTop: 2 },
}));
