import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { ArtworkBackdrop } from "@/src/components/artwork-backdrop";
import { Icon } from "@/src/components/icon";
import { LyricsView } from "@/src/components/lyrics-view";
import { Text } from "@/src/components/text";

const WHITE = "#FFFFFF";

export default function LyricsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { current } = useAudio();

  return (
    <View style={styles.container} testID="lyrics-screen">
      <ArtworkBackdrop uri={current?.artwork} intensity={90} />
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="lyrics-close" onPress={() => router.back()} hitSlop={12} style={styles.topBtn}>
          <Icon name="chevron-down" size={28} color={WHITE} />
        </Pressable>
        <Text style={styles.topLabel} numberOfLines={1}>
          {current?.title ?? "Lyrics"}
        </Text>
        <View style={styles.topBtn} />
      </View>
      <LyricsView />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 8 },
  topBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  topLabel: { color: WHITE, fontSize: 15, fontWeight: "700", flex: 1, textAlign: "center" },
});
