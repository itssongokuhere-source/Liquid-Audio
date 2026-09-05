import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { Icon, type IconName } from "@/src/components/icon";
import { Text } from "@/src/components/text";
import { makeStyles, useTheme } from "@/src/theme";

export function SettingsSection({
  title,
  children,
  index = 0,
}: {
  title: string;
  children: ReactNode;
  index?: number;
}) {
  const styles = useStyles();
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)} style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </Animated.View>
  );
}

export function SettingRow({
  icon,
  iconColor,
  title,
  subtitle,
  right,
  onPress,
  last,
  testID,
}: {
  icon: IconName;
  iconColor?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const content = (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={[styles.iconTile, iconColor ? { backgroundColor: iconColor + "22" } : null]}>
        <Icon name={icon} size={19} color={iconColor ?? colors.onSurface} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.muted} /> : null)}
    </View>
  );
  if (!onPress) return <View testID={testID}>{content}</View>;
  return (
    <AnimatedPressable testID={testID} onPress={onPress} scaleTo={0.985} hitSlop={0}>
      {content}
    </AnimatedPressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const idx = Math.max(0, options.findIndex((o) => o.key === value));
  const width = useSharedValue(0);
  const thumb = useAnimatedStyle(() => ({
    width: width.value / options.length,
    transform: [{ translateX: withSpring((width.value / options.length) * idx, { damping: 18, stiffness: 240 }) }],
  }));
  return (
    <View
      testID={testID}
      style={styles.segment}
      onLayout={(e) => {
        width.value = e.nativeEvent.layout.width - 6;
      }}
    >
      <Animated.View style={[styles.segmentThumb, { backgroundColor: colors.brandPrimary }, thumb]} />
      {options.map((o) => {
        const active = o.key === value;
        return (
          <AnimatedPressable
            key={o.key}
            testID={testID ? `${testID}-${o.key}` : undefined}
            onPress={() => onChange(o.key)}
            scaleTo={0.95}
            hitSlop={0}
            style={styles.segmentItem}
          >
            <Text style={[styles.segmentText, active && { color: colors.onBrandPrimary }]}>{o.label}</Text>
          </AnimatedPressable>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  section: { marginBottom: 22 },
  sectionTitle: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 8,
    marginLeft: 6,
  },
  card: {
    borderRadius: 20,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.glassBorder,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 56,
  },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.divider },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceTertiary,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { color: colors.onSurface, fontSize: 15, fontWeight: "600" },
  rowSub: { color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 },
  segment: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    backgroundColor: colors.surfaceTertiary,
    position: "relative",
  },
  segmentThumb: { position: "absolute", top: 3, bottom: 3, left: 3, borderRadius: 10 },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 8 },
  segmentText: { color: colors.onSurfaceTertiary, fontSize: 13, fontWeight: "600" },
}));
