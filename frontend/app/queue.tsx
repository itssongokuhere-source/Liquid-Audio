import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { ArtworkBackdrop } from "@/src/components/artwork-backdrop";
import { Icon } from "@/src/components/icon";
import { useTheme } from "@/src/theme";

const WHITE = "#FFFFFF";
const DIM = "rgba(255,255,255,0.6)";

export default function QueueScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { queue, index, current, isPlaying, jumpTo } = useAudio();

  const upcoming = queue.map((t, i) => ({ t, i })).filter(({ i }) => i > index);

  return (
    <View style={styles.container} testID="queue-screen">
      <ArtworkBackdrop uri={current?.artwork} intensity={92} />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="queue-close" onPress={() => router.back()} hitSlop={12} style={styles.iconBtn}>
          <Icon name="chevron-down" size={28} color={WHITE} />
        </Pressable>
        <Text style={styles.title}>Up Next</Text>
        <View style={styles.iconBtn} />
      </View>

      <FlatList
        data={upcoming}
        keyExtractor={({ t }, i) => `${t.id}-${i}`}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40 }}
        ListHeaderComponent={
          current ? (
            <View style={styles.nowSection}>
              <Text style={styles.sectionLabel}>Now Playing</Text>
              <View style={styles.nowRow}>
                <Image source={current.artwork ? { uri: current.artwork } : undefined} style={styles.art} contentFit="cover" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.nowTitle} numberOfLines={1}>{current.title}</Text>
                  <Text style={styles.nowArtist} numberOfLines={1}>{current.artist}</Text>
                </View>
                <Icon name={isPlaying ? "volume-medium" : "pause"} size={20} color={colors.brandPrimary} />
              </View>
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
                Next in queue{upcoming.length ? ` · ${upcoming.length}` : ""}
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>Nothing queued after this song</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            testID={`queue-item-${item.i}`}
            style={styles.row}
            onPress={() => jumpTo(item.i)}
          >
            <Image source={item.t.artwork ? { uri: item.t.artwork } : undefined} style={styles.artSm} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.t.title}</Text>
              <Text style={styles.rowArtist} numberOfLines={1}>{item.t.artist}</Text>
            </View>
            <Icon name="play" size={18} color={DIM} />
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: WHITE, fontSize: 16, fontWeight: "700" },
  nowSection: {},
  sectionLabel: { color: DIM, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  nowRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  art: { width: 56, height: 56, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)" },
  nowTitle: { color: WHITE, fontSize: 16, fontWeight: "700" },
  nowArtist: { color: DIM, fontSize: 13, marginTop: 2 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  artSm: { width: 48, height: 48, borderRadius: 8, backgroundColor: "rgba(255,255,255,0.1)" },
  rowTitle: { color: WHITE, fontSize: 15, fontWeight: "600" },
  rowArtist: { color: DIM, fontSize: 13, marginTop: 2 },
  empty: { color: DIM, fontSize: 15, textAlign: "center", marginTop: 30 },
});
