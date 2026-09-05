import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAudio } from "@/src/components/audio-context";
import { Icon } from "@/src/components/icon";
import { TrackRow } from "@/src/components/track-row";
import { useTrackActions } from "@/src/components/track-actions";
import { searchTracks } from "@/src/lib/api";
import { contentBottomPad } from "@/src/lib/layout";
import { makeStyles, useTheme } from "@/src/theme";

const SUGGESTIONS = ["Arijit Singh", "Kesariya", "Punjabi", "Atif Aslam", "Pritam", "Lofi", "Shreya Ghoshal", "AP Dhillon"];

export default function SearchScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { playNow, current, hasTrack } = useAudio();
  const openActions = useTrackActions();

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debounced.length >= 2;
  const { data: results = [], isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => searchTracks(debounced),
    enabled,
  });

  const showEmpty = useMemo(() => enabled && !isFetching && results.length === 0, [
    enabled,
    isFetching,
    results.length,
  ]);

  return (
    <View style={styles.container} testID="search-screen">
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.searchBar}>
          <Icon name="search" size={20} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={query}
            onChangeText={setQuery}
            placeholder="Songs, artists, moods…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <Pressable testID="search-clear" onPress={() => setQuery("")} hitSlop={10}>
              <Icon name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!enabled ? (
        <View style={styles.suggestWrap}>
          <Text style={styles.suggestLabel}>Try searching for</Text>
          <View style={styles.suggestGrid}>
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                testID={`suggestion-${s}`}
                style={styles.suggestChip}
                onPress={() => setQuery(s)}
              >
                <Text style={styles.suggestText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : isFetching ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : showEmpty ? (
        <View style={styles.center}>
          <Icon name="musical-notes-outline" size={40} color={colors.muted} />
          <Text style={styles.dim}>No results for “{debounced}”</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(t) => t.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 12,
            paddingBottom: contentBottomPad(hasTrack),
          }}
          renderItem={({ item }) => (
            <TrackRow
              track={item}
              active={current?.id === item.id}
              onPress={() => playNow(item, results)}
              onMore={() => openActions(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  title: {
    color: colors.onSurface,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginBottom: 14,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
  },
  input: { flex: 1, color: colors.onSurface, fontSize: 16 },
  suggestWrap: { padding: 16 },
  suggestLabel: { color: colors.muted, fontSize: 14, fontWeight: "600", marginBottom: 14 },
  suggestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggestChip: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestText: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  dim: { color: colors.muted, fontSize: 15 },
}));
