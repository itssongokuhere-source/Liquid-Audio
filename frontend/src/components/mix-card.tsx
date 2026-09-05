import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { AnimatedPressable } from "@/src/components/animated-pressable";
import { Text } from "@/src/components/text";
import type { Mix } from "@/src/lib/api";
import { makeStyles } from "@/src/theme";

const SIZE = 150;

export function MixCover({ mix, size = SIZE, radius = 16 }: { mix: Mix; size?: number; radius?: number }) {
  const covers = mix.covers.slice(0, 4);
  const half = size / 2;
  return (
    <View style={[styles.cover, { width: size, height: size, borderRadius: radius, backgroundColor: mix.color }]}>
      {covers.length >= 4 ? (
        <View style={styles.grid}>
          {covers.map((c, i) => (
            <Image key={i} source={{ uri: c }} style={{ width: half, height: half }} contentFit="cover" />
          ))}
        </View>
      ) : covers[0] ? (
        <Image source={{ uri: covers[0] }} style={{ width: size, height: size }} contentFit="cover" />
      ) : null}
      <View style={[styles.tint, { backgroundColor: mix.color + "55" }]} />
      <View style={styles.labelWrap}>
        <Text style={[styles.label, { fontSize: size > 200 ? 30 : 18 }]} numberOfLines={2}>
          {mix.title}
        </Text>
      </View>
    </View>
  );
}

export function MixCard({ mix, onPress }: { mix: Mix; onPress: () => void }) {
  const themed = useStyles();
  return (
    <AnimatedPressable testID={`mix-${mix.id}`} onPress={onPress} scaleTo={0.95} style={{ width: SIZE }}>
      <MixCover mix={mix} />
      <Text style={themed.sub} numberOfLines={2}>
        {mix.subtitle}
      </Text>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  cover: { overflow: "hidden", justifyContent: "flex-end" },
  grid: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, flexDirection: "row", flexWrap: "wrap" },
  tint: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  labelWrap: { padding: 10, backgroundColor: "rgba(0,0,0,0.35)" },
  label: { color: "#FFFFFF", fontWeight: "800", letterSpacing: -0.4 },
});

const useStyles = makeStyles((colors) => ({
  sub: { color: colors.muted, fontSize: 12, marginTop: 8, lineHeight: 16 },
}));
