import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { ArtworkBackdrop } from "@/src/components/artwork-backdrop";
import { PlayerPanel, type PanelTab } from "@/src/components/player-panel";

export default function QueueScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { current } = useAudio();
  const [tab, setTab] = useState<PanelTab>("upnext");
  return (
    <View style={styles.container}>
      <ArtworkBackdrop uri={current?.artwork} intensity={92} />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <PlayerPanel tab={tab} onTabChange={setTab} onClose={() => router.back()} showTabs />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: "#000" } });
