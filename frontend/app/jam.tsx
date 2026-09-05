import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Share, StyleSheet, TextInput, View } from "react-native";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInDown, FadeInUp } from "react-native-reanimated";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { useAudio } from "@/src/components/audio-context";
import { ArtworkBackdrop } from "@/src/components/artwork-backdrop";
import { Icon } from "@/src/components/icon";
import { useJam } from "@/src/components/jam-context";
import { PlayingBars } from "@/src/components/playing-bars";
import { Text } from "@/src/components/text";
import { useToast } from "@/src/components/toast";
import { jamShareUrl } from "@/src/lib/api";
import { haptic } from "@/src/lib/haptics";
import { storage } from "@/src/utils/storage";
import { useTheme } from "@/src/theme";

const WHITE = "#FFFFFF";
const DIM = "rgba(255,255,255,0.65)";
const GLASS = "rgba(255,255,255,0.12)";
const GLASS_BORDER = "rgba(255,255,255,0.16)";
const NAME_KEY = "liquidaudio.jamName";

function extractCode(input: string) {
  const m = input.toUpperCase().match(/[A-Z2-9]{6}/g);
  return m ? m[m.length - 1] : "";
}

export default function JamScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ code?: string }>();
  const jam = useJam();
  const { current, isPlaying } = useAudio();

  const [name, setName] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const autoJoined = useRef(false);

  useEffect(() => {
    storage.getItem<string>(NAME_KEY, "").then((v) => setName(v || ""));
  }, []);

  // Deep link: /jam?code=ABC123 → auto-join
  useEffect(() => {
    const code = params.code ? extractCode(String(params.code)) : "";
    if (code && !jam.room && !autoJoined.current) {
      autoJoined.current = true;
      setCodeInput(code);
      jam.join(code, name || "Guest").catch(() => toast("That jam has ended or the code is wrong", "error"));
    }
  }, [params.code, jam, name, toast]);

  const saveName = (v: string) => {
    setName(v);
    storage.setItem(NAME_KEY, v).catch(() => {});
  };

  const onStart = async () => {
    haptic.medium();
    try {
      await jam.start(name.trim() || "Host");
    } catch {
      toast("Couldn't start a jam right now", "error");
    }
  };

  const onJoin = async () => {
    const code = extractCode(codeInput);
    if (!code) {
      toast("Enter the 6‑character code or paste the link", "error");
      return;
    }
    haptic.medium();
    try {
      await jam.join(code, name.trim() || "Guest");
    } catch {
      toast("That jam has ended or the code is wrong", "error");
    }
  };

  const share = async () => {
    if (!jam.room) return;
    const url = jamShareUrl(jam.room.code);
    haptic.light();
    try {
      await Share.share({ message: `Join my LiquidAudio jam 🎧 Code: ${jam.room.code}\n${url}`, url });
    } catch {
      await Clipboard.setStringAsync(url);
      toast("Link copied", "success");
    }
  };

  const copyCode = async () => {
    if (!jam.room) return;
    await Clipboard.setStringAsync(jam.room.code);
    haptic.success();
    toast("Code copied", "success");
  };

  return (
    <View style={styles.container} testID="jam-screen">
      <ArtworkBackdrop uri={current?.artwork} intensity={94} />
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        <AnimatedPressable testID="jam-close" onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="chevron-down" size={28} color={WHITE} />
        </AnimatedPressable>
        <Text style={styles.title}>Jam</Text>
        <View style={styles.iconBtn} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 16 }}
        >
          {jam.room ? (
            <>
              <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.card}>
                <View style={styles.liveRow}>
                  <View style={[styles.liveDot, { backgroundColor: jam.connected ? colors.success : colors.warning }]} />
                  <Text style={styles.liveText}>
                    {jam.connected ? "Live" : "Reconnecting…"} · {jam.isHost ? "You're hosting" : `Hosted by ${jam.room.host_name}`}
                    {jam.latencyMs ? ` · ${jam.latencyMs} ms` : ""}
                  </Text>
                </View>
                <AnimatedPressable testID="jam-copy-code" onPress={copyCode} scaleTo={0.97} style={styles.codeBox}>
                  <Text style={styles.codeLabel}>Invite code</Text>
                  <Text style={styles.code} testID="jam-code">{jam.room.code}</Text>
                  <Text style={styles.codeHint}>Tap to copy</Text>
                </AnimatedPressable>
                <View style={styles.qrWrap}>
                  <QRCode value={jamShareUrl(jam.room.code)} size={150} backgroundColor="#FFFFFF" color="#0A0A0A" />
                </View>
                <Text style={styles.qrHint}>Friends scan this with their camera to jump straight in</Text>
                <View style={styles.btnRow}>
                  <AnimatedPressable testID="jam-share" onPress={share} scaleTo={0.95} style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary }]}>
                    <Icon name="share-social-outline" size={18} color={colors.onBrandPrimary} />
                    <Text style={[styles.primaryText, { color: colors.onBrandPrimary }]}>Share link</Text>
                  </AnimatedPressable>
                  <AnimatedPressable testID="jam-leave" onPress={() => jam.leave().then(() => router.back())} scaleTo={0.95} style={styles.ghostBtn}>
                    <Icon name={jam.isHost ? "stop-circle-outline" : "exit-outline"} size={18} color={WHITE} />
                    <Text style={styles.ghostText}>{jam.isHost ? "End jam" : "Leave"}</Text>
                  </AnimatedPressable>
                </View>
              </Animated.View>

              {current ? (
                <Animated.View entering={FadeInUp.delay(80).springify().damping(18)} style={styles.card}>
                  <Text style={styles.sectionLabel}>Playing together</Text>
                  <View style={styles.nowRow}>
                    <Image source={current.artwork ? { uri: current.artwork } : undefined} style={styles.art} contentFit="cover" />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.nowTitle} numberOfLines={1}>{current.title}</Text>
                      <Text style={styles.nowArtist} numberOfLines={1}>{current.artist}</Text>
                    </View>
                    <PlayingBars color={colors.brandPrimary} playing={isPlaying} size={18} />
                  </View>
                  {!jam.isHost ? (
                    <View style={styles.guestControls}>
                      <AnimatedPressable testID="jam-prev" onPress={() => jam.sendControl("prev")} style={styles.ctrl}>
                        <Icon name="play-skip-back" size={24} color={WHITE} />
                      </AnimatedPressable>
                      <AnimatedPressable testID="jam-toggle" onPress={() => jam.sendControl("toggle")} style={[styles.ctrlMain, { backgroundColor: colors.brandPrimary }]}>
                        <Icon name={isPlaying ? "pause" : "play"} size={26} color={colors.onBrandPrimary} />
                      </AnimatedPressable>
                      <AnimatedPressable testID="jam-next" onPress={() => jam.sendControl("next")} style={styles.ctrl}>
                        <Icon name="play-skip-forward" size={24} color={WHITE} />
                      </AnimatedPressable>
                    </View>
                  ) : null}
                </Animated.View>
              ) : null}

              <Animated.View entering={FadeInUp.delay(140).springify().damping(18)} style={styles.card}>
                <Text style={styles.sectionLabel}>Listening · {jam.members.length}</Text>
                {jam.members.map((m) => (
                  <View key={m.device} style={styles.memberRow} testID={`jam-member-${m.device}`}>
                    <View style={[styles.avatar, m.host && { backgroundColor: colors.brandPrimary }]}>
                      <Text style={styles.avatarText}>{(m.name || "?").charAt(0).toUpperCase()}</Text>
                    </View>
                    <Text style={styles.memberName} numberOfLines={1}>{m.name}</Text>
                    {m.host ? <Text style={styles.hostTag}>HOST</Text> : null}
                  </View>
                ))}
              </Animated.View>
            </>
          ) : (
            <>
              <Animated.View entering={FadeIn.duration(300)} style={styles.hero}>
                <View style={[styles.heroIcon, { backgroundColor: colors.brandPrimary }]}>
                  <Icon name="people" size={30} color={colors.onBrandPrimary} />
                </View>
                <Text style={styles.heroTitle}>Listen together, in sync</Text>
                <Text style={styles.heroSub}>
                  Start a jam and share the code, link or QR. Everyone hears the same song at the same moment.
                </Text>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(60).springify().damping(18)} style={styles.card}>
                <Text style={styles.sectionLabel}>Your name</Text>
                <TextInput
                  testID="jam-name"
                  value={name}
                  onChangeText={saveName}
                  placeholder="How friends will see you"
                  placeholderTextColor={DIM}
                  style={styles.input}
                  maxLength={24}
                />
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(120).springify().damping(18)} style={styles.card}>
                <Text style={styles.sectionLabel}>Start a jam</Text>
                <Text style={styles.cardHint}>{current ? `Everyone will hear “${current.title}”` : "Pick a song after starting"}</Text>
                <AnimatedPressable testID="jam-start" onPress={onStart} disabled={jam.busy} scaleTo={0.96} style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary }]}>
                  <Icon name="radio-outline" size={18} color={colors.onBrandPrimary} />
                  <Text style={[styles.primaryText, { color: colors.onBrandPrimary }]}>{jam.busy ? "Starting…" : "Start a jam"}</Text>
                </AnimatedPressable>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(180).springify().damping(18)} style={styles.card}>
                <Text style={styles.sectionLabel}>Join a jam</Text>
                <TextInput
                  testID="jam-code-input"
                  value={codeInput}
                  onChangeText={(v) => setCodeInput(v.toUpperCase())}
                  placeholder="Enter code or paste link"
                  placeholderTextColor={DIM}
                  style={[styles.input, styles.codeInput]}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  returnKeyType="join"
                  onSubmitEditing={onJoin}
                />
                <AnimatedPressable testID="jam-join" onPress={onJoin} disabled={jam.busy} scaleTo={0.96} style={styles.ghostBtn}>
                  <Icon name="enter-outline" size={18} color={WHITE} />
                  <Text style={styles.ghostText}>{jam.busy ? "Joining…" : "Join"}</Text>
                </AnimatedPressable>
                <Text style={styles.cardHint}>Or scan a friend’s QR with your camera — it opens right here.</Text>
              </Animated.View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { color: WHITE, fontSize: 16, fontWeight: "700" },
  hero: { alignItems: "center", gap: 10, paddingVertical: 10 },
  heroIcon: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  heroTitle: { color: WHITE, fontSize: 24, fontWeight: "800", letterSpacing: -0.5, textAlign: "center" },
  heroSub: { color: DIM, fontSize: 14, lineHeight: 20, textAlign: "center", paddingHorizontal: 10 },
  card: {
    borderRadius: 22,
    padding: 16,
    gap: 12,
    backgroundColor: GLASS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: GLASS_BORDER,
  },
  sectionLabel: { color: DIM, fontSize: 12, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase" },
  cardHint: { color: DIM, fontSize: 13, lineHeight: 18 },
  input: {
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: WHITE,
    fontSize: 15,
    fontFamily: "Inter-Regular",
  },
  codeInput: { fontFamily: "Inter-Bold", fontSize: 18, letterSpacing: 3, textAlign: "center" },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 14 },
  primaryText: { fontSize: 15, fontWeight: "700" },
  ghostBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  ghostText: { color: WHITE, fontSize: 15, fontWeight: "700" },
  btnRow: { flexDirection: "row", gap: 10 },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { color: DIM, fontSize: 12, fontWeight: "600", flex: 1 },
  codeBox: { alignItems: "center", paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.35)" },
  codeLabel: { color: DIM, fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase" },
  code: { color: WHITE, fontSize: 40, fontWeight: "800", letterSpacing: 8, marginVertical: 4 },
  codeHint: { color: DIM, fontSize: 11 },
  qrWrap: { alignSelf: "center", padding: 10, borderRadius: 18, backgroundColor: "#FFFFFF" },
  qrHint: { color: DIM, fontSize: 12, textAlign: "center" },
  nowRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  art: { width: 54, height: 54, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.1)" },
  nowTitle: { color: WHITE, fontSize: 15, fontWeight: "700" },
  nowArtist: { color: DIM, fontSize: 13, marginTop: 2 },
  guestControls: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 22, marginTop: 4 },
  ctrl: { width: 48, height: 48, alignItems: "center", justifyContent: "center" },
  ctrlMain: { width: 58, height: 58, borderRadius: 29, alignItems: "center", justifyContent: "center" },
  memberRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.18)" },
  avatarText: { color: WHITE, fontSize: 15, fontWeight: "800" },
  memberName: { color: WHITE, fontSize: 15, fontWeight: "600", flex: 1 },
  hostTag: { color: DIM, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
});
