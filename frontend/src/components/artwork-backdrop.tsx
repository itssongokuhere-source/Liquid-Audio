import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";

import { Glass } from "@/src/components/glass";

const BLUR_HASH = "L6Pj0^i_.AyE_3t7t7R**0o#DgR4";

export function ArtworkBackdrop({
  uri,
  intensity = 96,
}: {
  uri?: string | null;
  intensity?: number;
}) {
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image
        source={uri ? { uri } : undefined}
        placeholder={{ blurhash: BLUR_HASH }}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        transition={500}
      />
      <Glass intensity={intensity} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.5)" }]} />
    </View>
  );
}
