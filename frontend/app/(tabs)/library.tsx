import { useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/src/components/text";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { useDownloads } from "@/src/components/downloads-context";
import { Icon, type IconName } from "@/src/components/icon";
import { TrackRow } from "@/src/components/track-row";
import { useTrackActions } from "@/src/components/track-actions";
import type { Track } from "@/src/lib/api";
import { contentBottomPad } from "@/src/lib/layout";
import { useLibrary } from "@/src/lib/hooks";
import { makeStyles, useTheme } from "@/src/theme";

type Tab = "Favorites" | "Recent" | "Downloads" | "Playlists";
const TABS: Tab[] = ["Favorites", "Recent", "Downloads", "Playlists"];

export default function LibraryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { playNow, current, hasTrack } = useAudio();
  const openActions = useTrackActions();
  const { data: library } = useLibrary();
  const { downloads } = useDownloads();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("Favorites");

  const favorites = (library?.favorites ?? []) as Track[];
  const recent = (library?.recent ?? []) as Track[];
  const playlists = library?.playlists ?? [];

  const activeList =
    tab === "Favorites" ? favorites : tab === "Downloads" ? downloads : recent;

  return (
    <View style={styles.container} testID="library-screen">
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Your Library</Text>
          <Pressable
            testID="library-settings"
            onPress={() => router.push("/settings")}
            style={styles.settingsBtn}
          >
            <Icon name="settings-outline" size={22} color={colors.onSurface} />
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabRow}
        >
          {TABS.map((t) => {
            const active = t === tab;
            return (
              <Pressable
                key={t}
                testID={`library-tab-${t}`}
                onPress={() => setTab(t)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{t}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {tab === "Playlists" ? (
        playlists.length === 0 ? (
          <EmptyState
            icon="albums-outline"
            text="No playlists yet"
            hint="Tap ••• on any track to start one"
          />
        ) : (
          <FlatList
            data={playlists}
            keyExtractor={(p) => p.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: contentBottomPad(hasTrack),
            }}
            renderItem={({ item }) => (
              <Pressable
                testID={`playlist-${item.id}`}
                style={styles.playlistRow}
                onPress={() => router.push(`/playlist/${item.id}`)}
              >
                <View style={styles.playlistIcon}>
                  <Icon name="musical-notes" size={22} color={colors.onBrandPrimary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playlistName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.playlistCount}>
                    {item.tracks.length} {item.tracks.length === 1 ? "track" : "tracks"}
                  </Text>
                </View>
                <Pressable
                  testID={`playlist-play-${item.id}`}
                  onPress={() => item.tracks[0] && playNow(item.tracks[0], item.tracks)}
                  hitSlop={8}
                >
                  <Icon name="play-circle" size={34} color={colors.brandPrimary} />
                </Pressable>
              </Pressable>
            )}
          />
        )
      ) : activeList.length === 0 ? (
        <EmptyState
          icon={
            tab === "Favorites"
              ? "heart-outline"
              : tab === "Downloads"
                ? "download-outline"
                : "time-outline"
          }
          text={
            tab === "Favorites"
              ? "No favorites yet"
              : tab === "Downloads"
                ? "No downloads yet"
                : "Nothing played yet"
          }
          hint={
            tab === "Favorites"
              ? "Tap the heart on a track"
              : tab === "Downloads"
                ? "Tap ••• → Download to save songs offline"
                : "Your history appears here"
          }
        />
      ) : (
        <FlatList
          data={activeList}
          keyExtractor={(t) => t.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: contentBottomPad(hasTrack),
          }}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              active={current?.id === item.id}
              onPress={() => playNow(item, activeList)}
              onMore={() => openActions(item)}
            />
          )}
        />
      )}
    </View>
  );
}

function EmptyState({ icon, text, hint }: { icon: IconName; text: string; hint: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={styles.center}>
      <Icon name={icon} size={44} color={colors.muted} />
      <Text style={styles.emptyText}>{text}</Text>
      <Text style={styles.emptyHint}>{hint}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingBottom: 10 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    color: colors.onSurface,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  settingsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  tabRow: { gap: 8, height: 56, alignItems: "center", paddingRight: 16 },
  chip: {
    height: 36,
    flexShrink: 0,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  chipText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: colors.onBrandPrimary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 32 },
  emptyText: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  emptyHint: { color: colors.muted, fontSize: 14 },
  playlistRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 10,
  },
  playlistIcon: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.brandSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  playlistName: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  playlistCount: { color: colors.muted, fontSize: 13, marginTop: 2 },
}));
