import { useState } from "react";
import { FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { Icon, type IconName } from "@/src/components/icon";
import { TrackRow } from "@/src/components/track-row";
import { useTrackActions } from "@/src/components/track-actions";
import type { Track } from "@/src/lib/api";
import { contentBottomPad } from "@/src/lib/layout";
import { useLibrary } from "@/src/lib/hooks";
import { storage } from "@/src/utils/storage";
import {
  getAppScheme,
  makeStyles,
  setAppScheme,
  useTheme,
  type ColorScheme,
} from "@/src/theme";

const SCHEME_KEY = "liquidaudio.scheme";
type Tab = "Favorites" | "Recent" | "Playlists";
const TABS: Tab[] = ["Favorites", "Recent", "Playlists"];

const THEME_OPTIONS: { key: string; label: string; icon: IconName; scheme: ColorScheme | null }[] = [
  { key: "system", label: "Auto", icon: "phone-portrait-outline", scheme: null },
  { key: "light", label: "Light", icon: "sunny-outline", scheme: "light" },
  { key: "dark", label: "Dark", icon: "moon-outline", scheme: "dark" },
];

export default function LibraryScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { playNow, current, hasTrack } = useAudio();
  const openActions = useTrackActions();
  const { data: library } = useLibrary();

  const [tab, setTab] = useState<Tab>("Favorites");
  const [themePref, setThemePref] = useState<string>(getAppScheme() ?? "system");

  const favorites = (library?.favorites ?? []) as Track[];
  const recent = (library?.recent ?? []) as Track[];
  const playlists = library?.playlists ?? [];

  const applyTheme = (opt: (typeof THEME_OPTIONS)[number]) => {
    setThemePref(opt.key);
    setAppScheme(opt.scheme);
    storage.setItem(SCHEME_KEY, opt.key);
  };

  const activeList = tab === "Favorites" ? favorites : recent;

  return (
    <View style={styles.container} testID="library-screen">
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Your Library</Text>

        <View style={styles.themeRow}>
          {THEME_OPTIONS.map((opt) => {
            const active = themePref === opt.key;
            return (
              <Pressable
                key={opt.key}
                testID={`theme-${opt.key}`}
                onPress={() => applyTheme(opt)}
                style={[styles.themeBtn, active && styles.themeBtnActive]}
              >
                <Icon
                  name={opt.icon}
                  size={16}
                  color={active ? colors.onBrandPrimary : colors.onSurfaceTertiary}
                />
                <Text style={[styles.themeText, active && styles.themeTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
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
                onPress={() => item.tracks[0] && playNow(item.tracks[0], item.tracks)}
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
                <Icon name="play-circle" size={30} color={colors.brandPrimary} />
              </Pressable>
            )}
          />
        )
      ) : activeList.length === 0 ? (
        <EmptyState
          icon={tab === "Favorites" ? "heart-outline" : "time-outline"}
          text={tab === "Favorites" ? "No favorites yet" : "Nothing played yet"}
          hint={tab === "Favorites" ? "Tap the heart on a track" : "Your history appears here"}
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
  title: {
    color: colors.onSurface,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  themeRow: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  themeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  themeBtnActive: { backgroundColor: colors.brandPrimary },
  themeText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
  themeTextActive: { color: colors.onBrandPrimary },
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
