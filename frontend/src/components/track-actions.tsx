import { useMutation } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
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
  TextInput,
  View,
} from "react-native";
import { Text } from "@/src/components/text";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { useAudio } from "@/src/components/audio-context";
import { Glass } from "@/src/components/glass";
import { useDownloads } from "@/src/components/downloads-context";
import { Icon, type IconName } from "@/src/components/icon";
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
  const router = useRouter();
  const { data: library, deviceId } = useLibrary();
  const { isDownloaded, isDownloading, downloadTrack, removeDownload } = useDownloads();
  const { playNext, addToQueue, startRadio, radioLoading, hasTrack } = useAudio();

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
          <Pressable style={{ flex: 1 }} onPress={close} testID="track-actions-dismiss" />
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
                    <View style={styles.quickRow}>
                      <QuickAction
                        testID="action-play-next"
                        icon="play-skip-forward"
                        label="Play next"
                        delay={0}
                        color={colors.brandPrimary}
                        onPress={() => {
                          playNext(track);
                          toast(hasTrack ? "Playing next" : "Now playing", "success");
                          close();
                        }}
                      />
                      <QuickAction
                        testID="action-add-queue"
                        icon="list"
                        label="Add to queue"
                        delay={40}
                        color={colors.onSurface}
                        onPress={() => {
                          addToQueue(track);
                          toast(hasTrack ? "Added to queue" : "Now playing", "success");
                          close();
                        }}
                      />
                      <QuickAction
                        testID="action-start-radio"
                        icon={radioLoading ? "hourglass-outline" : "radio-outline"}
                        label={radioLoading ? "Tuning…" : "Start radio"}
                        delay={80}
                        color={colors.onSurface}
                        disabled={radioLoading}
                        onPress={async () => {
                          try {
                            await startRadio(track);
                            toast(`Radio based on ${track.title}`, "success");
                            close();
                          } catch {
                            toast("Couldn't start radio", "error");
                          }
                        }}
                      />
                    </View>

                    <ActionRow
                      testID="action-favorite"
                      delay={120}
                      icon={isFav ? "heart" : "heart-outline"}
                      iconColor={isFav ? colors.brandPrimary : colors.onSurface}
                      label={isFav ? "Remove from Favorites" : "Add to Favorites"}
                      onPress={() => {
                        haptic.selection();
                        favMutation.mutate();
                      }}
                    />

                    {(track.artists?.filter((a) => a.id).length
                      ? track.artists!.filter((a) => a.id).slice(0, 3)
                      : track.artistHandle
                        ? [{ id: track.artistHandle, name: track.artist.split(",")[0].trim(), role: "singer" }]
                        : []
                    ).map((a, i) => (
                      <ActionRow
                        key={a.id as string}
                        testID={i === 0 ? "action-view-artist" : `action-view-artist-${a.id}`}
                        delay={160 + i * 30}
                        icon="person-outline"
                        iconColor={colors.onSurface}
                        label={`View ${a.name}`}
                        trailing={a.role === "music" ? "Composer" : undefined}
                        onPress={() => {
                          close();
                          router.push(`/artist/${a.id}`);
                        }}
                      />
                    ))}

                    <ActionRow
                      testID="action-download"
                      delay={200}
                      icon={
                        isDownloaded(track.id)
                          ? "checkmark-circle"
                          : isDownloading(track.id)
                            ? "cloud-download"
                            : "download-outline"
                      }
                      iconColor={isDownloaded(track.id) ? colors.brandPrimary : colors.onSurface}
                      label={
                        isDownloaded(track.id)
                          ? "Remove download"
                          : isDownloading(track.id)
                            ? "Downloading…"
                            : "Download"
                      }
                      onPress={() => {
                        if (isDownloaded(track.id)) removeDownload(track.id);
                        else downloadTrack(track);
                      }}
                    />

                    <View style={styles.divider} />
                    <Text style={styles.sectionLabel}>Add to playlist</Text>
                    <ScrollView style={styles.playlistScroll} keyboardShouldPersistTaps="handled">
                      {playlists.length === 0 ? (
                        <Text style={styles.emptyText}>No playlists yet</Text>
                      ) : (
                        playlists.map((p, i) => (
                          <ActionRow
                            key={p.id}
                            testID={`add-to-playlist-${p.id}`}
                            delay={240 + i * 30}
                            icon="musical-notes-outline"
                            iconColor={colors.muted}
                            label={p.name}
                            trailing={String(p.tracks.length)}
                            onPress={() => addMutation.mutate(p.id)}
                          />
                        ))
                      )}
                    </ScrollView>
                    <ActionRow
                      testID="action-create-playlist"
                      delay={280}
                      icon="add-circle-outline"
                      iconColor={colors.brandPrimary}
                      label="Create new playlist"
                      labelColor={colors.brandPrimary}
                      onPress={() => setCreating(true)}
                    />
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

function QuickAction({
  icon,
  label,
  color,
  delay,
  onPress,
  disabled,
  testID,
}: {
  icon: IconName;
  label: string;
  color: string;
  delay: number;
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18).stiffness(220)} style={{ flex: 1 }}>
      <AnimatedPressable testID={testID} onPress={onPress} disabled={disabled} scaleTo={0.92} style={styles.quick}>
        <View style={styles.quickIcon}>
          <Icon name={icon} size={22} color={color} />
        </View>
        <Text style={styles.quickLabel} numberOfLines={1}>
          {label}
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
}

function ActionRow({
  icon,
  iconColor,
  label,
  labelColor,
  trailing,
  delay,
  onPress,
  testID,
}: {
  icon: IconName;
  iconColor: string;
  label: string;
  labelColor?: string;
  trailing?: string;
  delay: number;
  onPress: () => void;
  testID: string;
}) {
  const styles = useStyles();
  return (
    <Animated.View entering={FadeInDown.delay(delay).springify().damping(18).stiffness(220)}>
      <AnimatedPressable testID={testID} onPress={onPress} scaleTo={0.97} style={styles.action}>
        <View style={styles.iconTile}>
          <Icon name={icon} size={20} color={iconColor} />
        </View>
        <Text style={[styles.actionText, labelColor ? { color: labelColor } : null]} numberOfLines={1}>
          {label}
        </Text>
        {trailing ? <Text style={styles.count}>{trailing}</Text> : null}
      </AnimatedPressable>
    </Animated.View>
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
  header: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
  art: { width: 56, height: 56, borderRadius: 12, backgroundColor: colors.surfaceTertiary },
  title: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  artist: { color: colors.muted, fontSize: 13, marginTop: 2 },
  quickRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  quick: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceTertiary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  quickLabel: { color: colors.onSurface, fontSize: 12, fontWeight: "700" },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 9,
  },
  iconTile: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
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
    fontFamily: "Inter-Regular",
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
