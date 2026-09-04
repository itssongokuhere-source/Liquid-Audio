import { Ionicons } from "@react-native-vector-icons/ionicons";
import type { ComponentProps } from "react";

export type IconName = ComponentProps<typeof Ionicons>["name"];

export function Icon({
  name,
  size = 24,
  color,
}: {
  name: IconName;
  size?: number;
  color: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}
