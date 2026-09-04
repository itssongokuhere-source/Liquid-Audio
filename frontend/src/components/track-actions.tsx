import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/src/components/glass";
import { Icon } from "@/src/components/icon";
import { useToast } from "@/src/components/toast";
import {
  addToPlaylist,
  createPlaylist,
  toggleFavorite,
  type Track,
} from "@/src/lib/api";
import { haptic } from "@/src/lib/haptics";
import { useLibrary } from "@/src/lib/hooks";
import { queryClient } from "@/src/query-client";
import { makeStyles, useTheme } from "@/src/theme";

const TrackActionsContext = createContext<(track: Track) => void>(() => {});

export function useTrackActions() {
  return useContext(TrackActionsContext);
}

export function TrackActionsProvider({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const { data: library, deviceId } = useLibrary();

  const [track, setTrack] = useState<Track | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const open = useMemo(
    () =>
      (t: Track) => {
        setTrack(t);
        setCreating(false);
        setName("");
      },
    [],
  );

  const close = () => {
    setTrack(null);
    setCreating(false);
    setName("");
  };

  const isFav = !!(track && library?.favorites?.some((f) => f.id === track.id));

  const favMutation = useMutation({
    mutationFn: () => toggleFavorite(deviceId as string, track as Track),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast(res.favorited ? "Added to Favorites" : "Removed from Favorites", "success");
    },
  });

  const addMutation = useMutation({
    mutationFn: (playlistId: string) =>
      addToPlaylist(deviceId as string, playlistId, track as Track),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast("Added to playlist", "success");
      close();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await createPlaylist(deviceId as string, name.trim() || "New Playlist");
      const created = res.playlists[res.playlists.length - 1];
      if (created && track) await addToPlaylist(deviceId as string, created.id, track);
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast("Playlist created", "success");
      close();
    },
  });

  const playlists = library?.playlists ?? [];

  return (
    <TrackActionsContext.Provider value={open}>
      {children}
      <Modal
        visible={!!track}
        transparent
        animationType="slide"
        onRequestClose={close}
        testID="track-actions-modal"
      >
        <Pressable style={styles.backdrop} onPress={close} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.sheetWrap}
        >
          <Glass intensity={90} style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
            {track ? (
              <>
                <View style={styles.handle} />
                <View style={styles.header}>
                  <Image
                    source={track.artwork ? { uri: track.artwork } : undefined}
                    style={styles.art}
                    contentFit="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title} numberOfLines={1}>
                      {track.title}
                    </Text>
                    <Text style={styles.artist} numberOfLines={1}>
                      {track.artist}
                    </Text>
                  </View>
                </View>

                {creating ? (
                  <View style={styles.createRow}>
                    <TextInput
                      testID="new-playlist-input"
                      value={name}
                      onChangeText={setName}
                      placeholder="Playlist name"
                      placeholderTextColor={colors.muted}
                      style={styles.input}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={() => createMutation.mutate()}
                    />
                    <Pressable
                      testID="confirm-create-playlist"
                      onPress={() => createMutation.mutate()}
                      style={styles.createBtn}
                    >
                      <Text style={styles.createBtnText}>Create</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    <Pressable
                      testID="action-favorite"
                      style={styles.action}
                      onPress={() => {
                        haptic.selection();
                        favMutation.mutate();
                      }}
                    >
                      <Icon
                        name={isFav ? "heart" : "heart-outline"}
                        size={22}
                        color={isFav ? colors.brandPrimary : colors.onSurface}
                      />
                      <Text style={styles.actionText}>
                        {isFav ? "Remove from Favorites" : "Add to Favorites"}
                      </Text>
                    </Pressable>

                    <View style={styles.divider} />
                    <Text style={styles.sectionLabel}>Add to playlist</Text>
                    <ScrollView style={styles.playlistScroll} keyboardShouldPersistTaps="handled">
                      {playlists.length === 0 ? (
                        <Text style={styles.emptyText}>No playlists yet</Text>
                      ) : (
                        playlists.map((p) => (
                          <Pressable
                            key={p.id}
                            testID={`add-to-playlist-${p.id}`}
                            style={styles.action}
                            onPress={() => addMutation.mutate(p.id)}
                          >
                            <Icon name="list" size={20} color={colors.muted} />
                            <Text style={styles.actionText} numberOfLines={1}>
                              {p.name}
                            </Text>
                            <Text style={styles.count}>{p.tracks.length}</Text>
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                    <Pressable
                      testID="action-create-playlist"
                      style={styles.action}
                      onPress={() => setCreating(true)}
                    >
                      <Icon name="add-circle-outline" size={22} color={colors.brandPrimary} />
                      <Text style={[styles.actionText, { color: colors.brandPrimary }]}>
                        Create new playlist
                      </Text>
                    </Pressable>
                  </>
                )}
              </>
            ) : null}
          </Glass>
        </KeyboardAvoidingView>
      </Modal>
    </TrackActionsContext.Provider>
  );
}

const useStyles = makeStyles((colors) => ({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrimStrong },
  sheetWrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginBottom: 16,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  art: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  title: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  artist: { color: colors.muted, fontSize: 13, marginTop: 2 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
  },
  actionText: { color: colors.onSurface, fontSize: 15, fontWeight: "600", flex: 1 },
  count: { color: colors.muted, fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.divider, marginVertical: 4 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  playlistScroll: { maxHeight: 180 },
  emptyText: { color: colors.muted, fontSize: 14, paddingVertical: 12 },
  createRow: { flexDirection: "row", gap: 10, alignItems: "center", paddingVertical: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.onSurface,
    fontSize: 15,
  },
  createBtn: {
    backgroundColor: colors.brandPrimary,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  createBtnText: { color: colors.onBrandPrimary, fontSize: 15, fontWeight: "700" },
}));
