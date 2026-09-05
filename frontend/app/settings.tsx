import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { useAudio } from "@/src/components/audio-context";
import { useDownloads } from "@/src/components/downloads-context";
import { GlassSwitch } from "@/src/components/glass-switch";
import { Icon } from "@/src/components/icon";
import { Segmented, SettingRow, SettingsSection } from "@/src/components/settings-ui";
import { Text } from "@/src/components/text";
import { useToast } from "@/src/components/toast";
import { useUpdates } from "@/src/components/updates-context";
import { publishRelease } from "@/src/lib/api";
import { APP_ICONS, applyAppIcon, supportsAlternateIcons } from "@/src/lib/app-icon";
import { haptic } from "@/src/lib/haptics";
import { useSettings, type CrossfadeSeconds } from "@/src/lib/settings-context";
import { storage } from "@/src/utils/storage";
import { ACCENTS, getAppScheme, makeStyles, setAppScheme, useTheme, type AccentKey, type ColorScheme } from "@/src/theme";

const SCHEME_KEY = "liquidaudio.scheme";

function fmtBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(0, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export default function SettingsScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const { settings, update } = useSettings();
  const { autoplay, toggleAutoplay, hasTrack } = useAudio();
  const { downloads, usedBytes, clearAll } = useDownloads();
  const updates = useUpdates();

  const [scheme, setScheme] = useState<"system" | ColorScheme>(getAppScheme() ?? "system");
  const [devTaps, setDevTaps] = useState(0);
  const [showDev, setShowDev] = useState(false);
  const [rel, setRel] = useState({ version: "", apk_url: "", notes: "", pin: "" });
  const [publishing, setPublishing] = useState(false);

  const changeScheme = (key: "system" | ColorScheme) => {
    setScheme(key);
    setAppScheme(key === "system" ? null : key);
    storage.setItem(SCHEME_KEY, key).catch(() => {});
  };

  const chooseIcon = async (key: string) => {
    haptic.selection();
    update("appIcon", key);
    const ok = await applyAppIcon(key).catch(() => false);
    if (!ok) toast("Icon changes apply on the installed Android/iOS app", "info");
  };

  const clearImageCache = async () => {
    haptic.light();
    await Promise.all([Image.clearDiskCache(), Image.clearMemoryCache()]).catch(() => {});
    toast("Image cache cleared", "success");
  };

  const submitRelease = async () => {
    if (!rel.version || !rel.apk_url || !rel.pin) {
      toast("Version, APK link and PIN are required", "error");
      return;
    }
    setPublishing(true);
    try {
      await publishRelease(rel);
      toast(`Release ${rel.version} published`, "success");
      setRel({ version: "", apk_url: "", notes: "", pin: "" });
      updates.check(true);
    } catch {
      toast("Publish failed — check the PIN", "error");
    } finally {
      setPublishing(false);
    }
  };

  const updateStatusText = (() => {
    switch (updates.status) {
      case "checking":
        return "Checking…";
      case "available":
        return `Version ${updates.latest?.version} is ready`;
      case "downloading":
        return `Downloading ${Math.round(updates.progress * 100)}%`;
      case "installing":
        return "Opening installer…";
      case "ota-ready":
        return "Improvements downloaded — restart to apply";
      case "error":
        return updates.error ?? "Couldn't check right now";
      case "up-to-date":
        return "You're on the latest version";
      default:
        return "Tap to check";
    }
  })();

  return (
    <View style={styles.container} testID="settings-screen">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <AnimatedPressable testID="settings-back" onPress={() => router.back()} style={styles.iconBtn}>
          <Icon name="chevron-back" size={26} color={colors.onSurface} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 + (hasTrack ? 80 : 0) }]}
        showsVerticalScrollIndicator={false}
      >
        {updates.status === "available" || updates.status === "downloading" || updates.status === "installing" ? (
          <Animated.View entering={FadeInDown.springify().damping(18)} layout={LinearTransition} style={styles.updateCard}>
            <View style={styles.updateHead}>
              <View style={[styles.updateBadge, { backgroundColor: colors.brandPrimary }]}>
                <Icon name="arrow-up-circle" size={22} color={colors.onBrandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.updateTitle}>Update available</Text>
                <Text style={styles.updateSub}>
                  LiquidAudio {updates.latest?.version} · {fmtDate(updates.latest?.published_at)}
                </Text>
              </View>
            </View>
            {updates.latest?.notes ? <Text style={styles.updateNotes}>{updates.latest.notes}</Text> : null}
            {updates.status !== "available" ? (
              <View style={styles.progressTrack}>
                <Animated.View
                  layout={LinearTransition}
                  style={[styles.progressFill, { width: `${Math.max(3, updates.progress * 100)}%`, backgroundColor: colors.brandPrimary }]}
                />
              </View>
            ) : null}
            <AnimatedPressable
              testID="update-install"
              onPress={updates.downloadAndInstall}
              disabled={updates.status !== "available"}
              scaleTo={0.96}
              style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary }]}
            >
              <Icon name={updates.canInstallDirectly ? "download" : "open-outline"} size={18} color={colors.onBrandPrimary} />
              <Text style={[styles.primaryBtnText, { color: colors.onBrandPrimary }]}>
                {updates.status === "downloading"
                  ? `Downloading ${Math.round(updates.progress * 100)}%`
                  : updates.status === "installing"
                    ? "Installing…"
                    : updates.canInstallDirectly
                      ? "Download & install"
                      : "Download update"}
              </Text>
            </AnimatedPressable>
            {updates.error ? <Text style={styles.errorText}>{updates.error}</Text> : null}
          </Animated.View>
        ) : null}

        {updates.status === "ota-ready" ? (
          <Animated.View entering={FadeIn} style={styles.updateCard}>
            <Text style={styles.updateTitle}>Improvements ready</Text>
            <Text style={styles.updateSub}>A small fix was downloaded in the background.</Text>
            <AnimatedPressable testID="update-restart" onPress={updates.applyOta} style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary }]}>
              <Icon name="refresh" size={18} color={colors.onBrandPrimary} />
              <Text style={[styles.primaryBtnText, { color: colors.onBrandPrimary }]}>Restart to apply</Text>
            </AnimatedPressable>
          </Animated.View>
        ) : null}

        <SettingsSection title="App updates" index={0}>
          <SettingRow
            icon="cloud-download-outline"
            iconColor={colors.brandPrimary}
            title="Check for updates"
            subtitle={updateStatusText}
            onPress={() => updates.check(true)}
            testID="settings-check-updates"
            right={
              updates.status === "checking" ? (
                <Icon name="hourglass-outline" size={18} color={colors.muted} />
              ) : (
                <Icon name="chevron-forward" size={18} color={colors.muted} />
              )
            }
          />
          <SettingRow
            icon="shield-checkmark-outline"
            title="Automatic updates"
            subtitle="New versions are detected on launch; fixes install silently when possible"
            last
          />
        </SettingsSection>

        <SettingsSection title="Playback" index={1}>
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTitle}>Audio quality</Text>
              <Text style={styles.blockHint}>
                {settings.quality === "max" ? "320 kbps · best" : settings.quality === "high" ? "160 kbps · balanced" : "96 kbps · data saver"}
              </Text>
            </View>
            <Segmented
              testID="quality"
              options={[
                { key: "low", label: "Low" },
                { key: "high", label: "High" },
                { key: "max", label: "320 kbps" },
              ]}
              value={settings.quality}
              onChange={(v) => {
                haptic.selection();
                update("quality", v);
              }}
            />
          </View>
          <View style={[styles.block, styles.blockBorder]}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTitle}>Crossfade</Text>
              <Text style={styles.blockHint}>{settings.crossfade ? `${settings.crossfade} s` : "Off"}</Text>
            </View>
            <Segmented
              testID="crossfade"
              options={[
                { key: "0", label: "Off" },
                { key: "3", label: "3 s" },
                { key: "6", label: "6 s" },
                { key: "12", label: "12 s" },
              ]}
              value={String(settings.crossfade)}
              onChange={(v) => {
                haptic.selection();
                update("crossfade", Number(v) as CrossfadeSeconds);
              }}
            />
          </View>
          <SettingRow
            icon="git-merge-outline"
            title="Gapless playback"
            subtitle="Prepare the next song early for seamless transitions"
            right={<GlassSwitch testID="gapless-switch" value={settings.gapless} onValueChange={(v) => update("gapless", v)} onColor={colors.brandPrimary} offColor={colors.borderStrong} />}
          />
          <SettingRow
            icon="infinite-outline"
            title="Autoplay"
            subtitle="Continue with similar songs when the queue ends"
            right={<GlassSwitch testID="autoplay-setting" value={autoplay} onValueChange={toggleAutoplay} onColor={colors.brandPrimary} offColor={colors.borderStrong} />}
          />
          <SettingRow
            icon="cellular-outline"
            title="Wi‑Fi only streaming"
            subtitle="Pause streaming on mobile data (downloads still play)"
            last
            right={<GlassSwitch testID="wifi-only-switch" value={settings.wifiOnly} onValueChange={(v) => update("wifiOnly", v)} onColor={colors.brandPrimary} offColor={colors.borderStrong} />}
          />
        </SettingsSection>

        <SettingsSection title="Appearance" index={2}>
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTitle}>Theme</Text>
            </View>
            <Segmented
              testID="theme"
              options={[
                { key: "system", label: "Auto" },
                { key: "light", label: "Light" },
                { key: "dark", label: "Dark" },
              ]}
              value={scheme}
              onChange={(v) => {
                haptic.selection();
                changeScheme(v);
              }}
            />
          </View>
          <SettingRow
            icon="color-wand-outline"
            iconColor={colors.brandPrimary}
            title="Adaptive colours"
            subtitle="Tint the whole app from the artwork of the song playing"
            right={<GlassSwitch testID="adaptive-switch" value={settings.adaptiveColors} onValueChange={(v) => update("adaptiveColors", v)} onColor={colors.brandPrimary} offColor={colors.borderStrong} />}
          />
          <View style={[styles.block, styles.blockBorder]}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTitle}>Accent colour</Text>
              <Text style={styles.blockHint}>{settings.adaptiveColors ? "Used when no artwork" : ACCENTS.find((a) => a.key === settings.accent)?.label}</Text>
            </View>
            <View style={styles.swatchRow}>
              {ACCENTS.map((a) => {
                const active = settings.accent === a.key;
                return (
                  <AnimatedPressable
                    key={a.key}
                    testID={`accent-${a.key}`}
                    onPress={() => {
                      haptic.selection();
                      update("accent", a.key as AccentKey);
                    }}
                    scaleTo={0.85}
                    style={[styles.swatch, { backgroundColor: a.hex }, active && styles.swatchActive]}
                  >
                    {active ? <Icon name="checkmark" size={16} color="#FFFFFF" /> : null}
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>
          <View style={[styles.block, styles.blockBorder]}>
            <View style={styles.blockHead}>
              <Text style={styles.blockTitle}>App icon</Text>
              <Text style={styles.blockHint}>{supportsAlternateIcons ? "Changes on your home screen" : "Applies on the installed app"}</Text>
            </View>
            <View style={styles.iconGrid}>
              {APP_ICONS.map((ic) => {
                const active = settings.appIcon === ic.key;
                return (
                  <AnimatedPressable key={ic.key} testID={`app-icon-${ic.key}`} onPress={() => chooseIcon(ic.key)} scaleTo={0.9} style={styles.iconCell}>
                    <View style={[styles.iconFrame, active && { borderColor: colors.brandPrimary }]}>
                      <Image source={ic.image} style={styles.iconImg} contentFit="cover" />
                    </View>
                    <Text style={[styles.iconLabel, active && { color: colors.onSurface }]}>{ic.label}</Text>
                  </AnimatedPressable>
                );
              })}
            </View>
          </View>
        </SettingsSection>

        <SettingsSection title="Storage" index={3}>
          <SettingRow
            icon="download-outline"
            title="Downloads"
            subtitle={`${downloads.length} ${downloads.length === 1 ? "song" : "songs"} · ${fmtBytes(usedBytes)}${Platform.OS === "web" ? " · native only" : ""}`}
            right={
              downloads.length ? (
                <AnimatedPressable testID="clear-downloads" onPress={clearAll} style={styles.smallBtn}>
                  <Text style={[styles.smallBtnText, { color: colors.error }]}>Remove all</Text>
                </AnimatedPressable>
              ) : undefined
            }
          />
          <SettingRow icon="images-outline" title="Clear image cache" subtitle="Frees space used by cached artwork" onPress={clearImageCache} testID="clear-image-cache" last />
        </SettingsSection>

        <SettingsSection title="About" index={4}>
          <SettingRow
            icon="information-circle-outline"
            title="LiquidAudio"
            subtitle={`Version ${updates.currentVersion} · Build ${updates.buildNumber}`}
            testID="about-version"
            onPress={() => {
              const n = devTaps + 1;
              setDevTaps(n);
              if (n >= 5) {
                setShowDev(true);
                haptic.success();
              }
            }}
            right={<Icon name="musical-notes" size={18} color={colors.muted} />}
          />
          <SettingRow
            icon="sparkles-outline"
            title="What's new"
            subtitle={updates.latest?.notes || "Play next & queue, autoplay recommendations, radio, settings, adaptive colours"}
            last={!showDev}
          />
          {showDev ? (
            <Animated.View entering={FadeInDown.springify()} style={[styles.block, styles.blockBorder]}>
              <View style={styles.blockHead}>
                <Text style={styles.blockTitle}>Publish a release</Text>
                <Text style={styles.blockHint}>Admin</Text>
              </View>
              <TextInput testID="rel-version" value={rel.version} onChangeText={(v) => setRel({ ...rel, version: v })} placeholder="Version (e.g. 1.2.0)" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" />
              <TextInput testID="rel-url" value={rel.apk_url} onChangeText={(v) => setRel({ ...rel, apk_url: v })} placeholder="Direct APK link (KiwiFile / Drive / GitHub)" placeholderTextColor={colors.muted} style={styles.input} autoCapitalize="none" autoCorrect={false} />
              <TextInput testID="rel-notes" value={rel.notes} onChangeText={(v) => setRel({ ...rel, notes: v })} placeholder="What's new" placeholderTextColor={colors.muted} style={[styles.input, { minHeight: 64 }]} multiline />
              <TextInput testID="rel-pin" value={rel.pin} onChangeText={(v) => setRel({ ...rel, pin: v })} placeholder="Admin PIN" placeholderTextColor={colors.muted} style={styles.input} secureTextEntry keyboardType="number-pad" />
              <AnimatedPressable testID="rel-publish" onPress={submitRelease} disabled={publishing} style={[styles.primaryBtn, { backgroundColor: colors.brandPrimary }]}>
                <Icon name="cloud-upload-outline" size={18} color={colors.onBrandPrimary} />
                <Text style={[styles.primaryBtnText, { color: colors.onBrandPrimary }]}>{publishing ? "Publishing…" : "Publish to all users"}</Text>
              </AnimatedPressable>
            </Animated.View>
          ) : null}
        </SettingsSection>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "700" },
  content: { paddingHorizontal: 16, paddingTop: 6 },
  updateCard: {
    borderRadius: 22,
    padding: 16,
    marginBottom: 22,
    backgroundColor: colors.brandTertiary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    gap: 12,
  },
  updateHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  updateBadge: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  updateTitle: { color: colors.onSurface, fontSize: 16, fontWeight: "700" },
  updateSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  updateNotes: { color: colors.onSurfaceSecondary, fontSize: 13, lineHeight: 19 },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceTertiary, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryBtnText: { fontSize: 15, fontWeight: "700" },
  errorText: { color: colors.error, fontSize: 12 },
  block: { paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  blockBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.divider },
  blockHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  blockTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  blockHint: { color: colors.muted, fontSize: 12 },
  swatchRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  swatch: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  swatchActive: { borderWidth: 3, borderColor: colors.onSurface },
  iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  iconCell: { width: 72, alignItems: "center", gap: 6 },
  iconFrame: { padding: 3, borderRadius: 20, borderWidth: 2, borderColor: "transparent" },
  iconImg: { width: 56, height: 56, borderRadius: 15 },
  iconLabel: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surfaceTertiary },
  smallBtnText: { fontSize: 12, fontWeight: "700" },
  input: {
    fontFamily: "Inter-Regular",
    backgroundColor: colors.surfaceTertiary,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.onSurface,
    fontSize: 14,
  },
}));
