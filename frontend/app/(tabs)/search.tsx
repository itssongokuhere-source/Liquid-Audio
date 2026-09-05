import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { useAudio } from "@/src/components/audio-context";
import { Icon } from "@/src/components/icon";
import { Text } from "@/src/components/text";
import { TrackRow } from "@/src/components/track-row";
import { useTrackActions } from "@/src/components/track-actions";
import { fetchSuggestions, searchAll, type SearchEntity } from "@/src/lib/api";
import { haptic } from "@/src/lib/haptics";
import { contentBottomPad } from "@/src/lib/layout";
import { storage } from "@/src/utils/storage";
import { makeStyles, useTheme } from "@/src/theme";

const TRENDING = ["Arijit Singh", "Kesariya", "Punjabi hits", "Atif Aslam", "Lofi", "Shreya Ghoshal", "AP Dhillon", "90s Bollywood"];
const RECENT_KEY = "liquidaudio.recentSearches";
const MAX_RECENT = 8;

function useRecentSearches() {
  const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => {
    storage.getItem<string>(RECENT_KEY, "").then((raw) => {
      try {
        if (raw) setRecent(JSON.parse(raw) as string[]);
      } catch {
        // ignore corrupt cache
      }
    });
  }, []);
  const persist = useCallback((next: string[]) => {
    setRecent(next);
    storage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
  }, []);
  const add = useCallback(
    (q: string) => {
      const t = q.trim();
      if (!t) return;
      setRecent((r) => {
        const next = [t, ...r.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
        storage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );
  const remove = useCallback((q: string) => persist(recent.filter((x) => x !== q)), [persist, recent]);
  const clear = useCallback(() => persist([]), [persist]);
  return { recent, add, remove, clear };
}

export default function SearchScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { playNow, current, hasTrack } = useAudio();
  const openActions = useTrackActions();
  const { recent, add: addRecent, remove: removeRecent, clear: clearRecent } = useRecentSearches();

  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [typing, setTyping] = useState("");

  // Fast debounce for autocomplete (feels instant like YouTube Music).
  useEffect(() => {
    const t = setTimeout(() => setTyping(query.trim()), 180);
    return () => clearTimeout(t);
  }, [query]);

  const showSuggestions = typing.length >= 1 && query.trim() !== submitted;
  const { data: suggest } = useQuery({
    queryKey: ["suggest", typing.toLowerCase()],
    queryFn: () => fetchSuggestions(typing),
    enabled: showSuggestions,
    staleTime: 10 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const resultsEnabled = submitted.length >= 1 && query.trim() === submitted;
  const { data: searchData, isFetching } = useQuery({
    queryKey: ["search", submitted],
    queryFn: () => searchAll(submitted),
    enabled: resultsEnabled,
  });
  const results = useMemo(
    () => [...(searchData?.artistSongs ?? []), ...(searchData?.songs ?? [])],
    [searchData],
  );
  const top = searchData?.top ?? null;
  const artistSongCount = searchData?.artistSongs.length ?? 0;

  const submit = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      haptic.selection();
      setQuery(t);
      setTyping(t);
      setSubmitted(t);
      addRecent(t);
    },
    [addRecent],
  );

  const openEntity = useCallback(
    (e: SearchEntity) => {
      haptic.light();
      if (e.type === "song" && e.track) {
        addRecent(e.title);
        playNow(e.track);
        return;
      }
      if (e.type === "artist") {
        addRecent(e.title);
        router.push(`/artist/${e.id}`);
        return;
      }
      submit(e.title);
    },
    [addRecent, playNow, router, submit],
  );

  const showEmpty = useMemo(
    () => resultsEnabled && !isFetching && results.length === 0,
    [resultsEnabled, isFetching, results.length],
  );

  const suggestionRows = useMemo(() => {
    if (!suggest) return [];
    const rows: ({ kind: "text"; text: string } | { kind: "entity"; entity: SearchEntity })[] = [];
    suggest.suggestions.slice(0, 5).forEach((s) => rows.push({ kind: "text", text: s.text }));
    suggest.entities.slice(0, 6).forEach((e) => rows.push({ kind: "entity", entity: e }));
    return rows;
  }, [suggest]);

  return (
    <View style={styles.container} testID="search-screen">
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.searchBar}>
          <Icon name="search" size={20} color={colors.muted} />
          <TextInput
            testID="search-input"
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              if (!v.trim()) setSubmitted("");
            }}
            onSubmitEditing={() => submit(query)}
            placeholder="Songs, artists, albums…"
            placeholderTextColor={colors.muted}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <Pressable
              testID="search-clear"
              onPress={() => {
                setQuery("");
                setSubmitted("");
                setTyping("");
              }}
              hitSlop={10}
            >
              <Icon name="close-circle" size={20} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {!query.trim() ? (
        <Animated.ScrollView
          entering={FadeIn}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.suggestWrap, { paddingBottom: contentBottomPad(hasTrack) }]}
        >
          {recent.length ? (
            <>
              <View style={styles.rowBetween}>
                <Text style={styles.suggestLabel}>Recent searches</Text>
                <Pressable testID="recent-clear" onPress={clearRecent} hitSlop={8}>
                  <Text style={styles.link}>Clear</Text>
                </Pressable>
              </View>
              {recent.map((r) => (
                <View key={r} style={styles.recentRow}>
                  <AnimatedPressable testID={`recent-${r}`} onPress={() => submit(r)} scaleTo={0.98} style={styles.recentMain}>
                    <Icon name="time-outline" size={18} color={colors.muted} />
                    <Text style={styles.recentText} numberOfLines={1}>
                      {r}
                    </Text>
                  </AnimatedPressable>
                  <Pressable testID={`recent-remove-${r}`} onPress={() => removeRecent(r)} hitSlop={8} style={styles.recentX}>
                    <Icon name="close" size={16} color={colors.muted} />
                  </Pressable>
                </View>
              ))}
            </>
          ) : null}
          <Text style={[styles.suggestLabel, recent.length ? { marginTop: 18 } : null]}>Trending searches</Text>
          <View style={styles.suggestGrid}>
            {TRENDING.map((s) => (
              <AnimatedPressable key={s} testID={`suggestion-${s}`} scaleTo={0.94} style={styles.suggestChip} onPress={() => submit(s)}>
                <Icon name="trending-up" size={14} color={colors.brandPrimary} />
                <Text style={styles.suggestText}>{s}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </Animated.ScrollView>
      ) : showSuggestions ? (
        <FlatList
          testID="suggestion-list"
          data={suggestionRows}
          keyExtractor={(r) => (r.kind === "text" ? `t-${r.text}` : `e-${r.entity.type}-${r.entity.id}`)}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: contentBottomPad(hasTrack) }}
          ListEmptyComponent={
            <Pressable testID="suggest-search-for" style={styles.suggestRow} onPress={() => submit(query)}>
              <View style={styles.suggestIcon}>
                <Icon name="search" size={18} color={colors.muted} />
              </View>
              <Text style={styles.suggestRowText} numberOfLines={1}>
                Search for “{query.trim()}”
              </Text>
            </Pressable>
          }
          renderItem={({ item, index }) =>
            item.kind === "text" ? (
              <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 25).duration(180)}>
                <Pressable testID={`suggest-text-${item.text}`} style={styles.suggestRow} onPress={() => submit(item.text)}>
                  <View style={styles.suggestIcon}>
                    <Icon name="search" size={18} color={colors.muted} />
                  </View>
                  <HighlightedText text={item.text} query={typing} styles={styles} />
                  <Pressable
                    testID={`suggest-fill-${item.text}`}
                    onPress={() => setQuery(item.text)}
                    hitSlop={8}
                    style={styles.fillBtn}
                  >
                    <View style={{ transform: [{ rotate: "-45deg" }] }}>
                      <Icon name="arrow-up-outline" size={18} color={colors.muted} />
                    </View>
                  </Pressable>
                </Pressable>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 25).duration(180)}>
                <Pressable
                  testID={`suggest-entity-${item.entity.type}-${item.entity.id}`}
                  style={styles.suggestRow}
                  onPress={() => openEntity(item.entity)}
                >
                  <Image
                    source={item.entity.image ? { uri: item.entity.image } : undefined}
                    style={[styles.entityImg, item.entity.type === "artist" && styles.entityRound]}
                    contentFit="cover"
                    recyclingKey={item.entity.id}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.suggestRowText} numberOfLines={1}>
                      {item.entity.title}
                    </Text>
                    <Text style={styles.entitySub} numberOfLines={1}>
                      {item.entity.type === "song" ? `Song · ${item.entity.subtitle}` : item.entity.subtitle}
                    </Text>
                  </View>
                  <Icon
                    name={item.entity.type === "song" ? "play-circle-outline" : "chevron-forward"}
                    size={item.entity.type === "song" ? 24 : 18}
                    color={colors.muted}
                  />
                </Pressable>
              </Animated.View>
            )
          }
        />
      ) : isFetching ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brandPrimary} />
        </View>
      ) : showEmpty ? (
        <View style={styles.center}>
          <Icon name="musical-notes-outline" size={40} color={colors.muted} />
          <Text style={styles.dim}>No results for “{submitted}”</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(t) => t.id}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          windowSize={7}
          removeClippedSubviews
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: contentBottomPad(hasTrack) }}
          ListHeaderComponent={
            <View>
              {top ? (
                <Animated.View entering={FadeInDown.duration(220)}>
                  <Text style={styles.resultsLabel}>Top result</Text>
                  <AnimatedPressable
                    testID={`top-result-${top.id}`}
                    onPress={() => router.push(`/artist/${top.id}`)}
                    scaleTo={0.98}
                    style={styles.topCard}
                  >
                    <Image source={top.image ? { uri: top.image } : undefined} style={styles.topImg} contentFit="cover" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.topTitle} numberOfLines={1}>{top.title}</Text>
                      <Text style={styles.topSub} numberOfLines={1}>{top.subtitle}</Text>
                    </View>
                    <Icon name="chevron-forward" size={20} color={colors.muted} />
                  </AnimatedPressable>
                </Animated.View>
              ) : null}
              {artistSongCount ? (
                <Text style={styles.resultsLabel}>Top songs · {top?.title}</Text>
              ) : (
                <Text style={styles.resultsLabel}>Songs · {results.length}</Text>
              )}
            </View>
          }
          renderItem={({ item, index }) => (
            <View>
              {artistSongCount && index === artistSongCount ? (
                <Text style={[styles.resultsLabel, { marginTop: 12 }]}>More songs</Text>
              ) : null}
              <TrackRow
                track={item}
                active={current?.id === item.id}
                onPress={() => playNow(item)}
                onMore={() => openActions(item)}
              />
            </View>
          )}
        />
      )}
    </View>
  );
}

function HighlightedText({ text, query, styles }: { text: string; query: string; styles: ReturnType<typeof useStyles> }) {
  const i = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (i < 0) {
    return (
      <Text style={styles.suggestRowText} numberOfLines={1}>
        {text}
      </Text>
    );
  }
  return (
    <Text style={styles.suggestRowText} numberOfLines={1}>
      <Text style={styles.suggestRowTextDim}>{text.slice(0, i)}</Text>
      {text.slice(i, i + query.length)}
      <Text style={styles.suggestRowTextDim}>{text.slice(i + query.length)}</Text>
    </Text>
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
  input: { flex: 1, color: colors.onSurface, fontSize: 16, fontFamily: "Inter-Regular" },
  suggestWrap: { padding: 16 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  link: { color: colors.brandPrimary, fontSize: 13, fontWeight: "700" },
  suggestLabel: { color: colors.muted, fontSize: 13, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 12 },
  recentRow: { flexDirection: "row", alignItems: "center" },
  recentMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  recentText: { color: colors.onSurface, fontSize: 15, flex: 1 },
  recentX: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  suggestGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  suggestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestText: { color: colors.onSurface, fontSize: 14, fontWeight: "600" },
  suggestRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 8, minHeight: 52 },
  suggestIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  suggestRowText: { color: colors.onSurface, fontSize: 15, fontWeight: "600", flex: 1 },
  suggestRowTextDim: { color: colors.muted, fontWeight: "500" },
  fillBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  entityImg: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceTertiary },
  entityRound: { borderRadius: 22 },
  entitySub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  topCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    marginHorizontal: 4,
    marginBottom: 6,
  },
  topImg: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surfaceTertiary },
  topTitle: { color: colors.onSurface, fontSize: 18, fontWeight: "800", letterSpacing: -0.3 },
  topSub: { color: colors.muted, fontSize: 13, marginTop: 2 },
  resultsLabel: { color: colors.muted, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", paddingHorizontal: 4, paddingVertical: 8 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  dim: { color: colors.muted, fontSize: 15 },
}));
