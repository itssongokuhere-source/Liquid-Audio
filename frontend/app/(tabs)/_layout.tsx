import { Tabs } from "expo-router";
import { Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Glass } from "@/src/components/glass";
import { Icon, type IconName } from "@/src/components/icon";
import { TAB_BAR_BASE } from "@/src/lib/layout";
import { useTheme } from "@/src/theme";

function tabIcon(name: IconName) {
  return function TabBarIcon({ color, size }: { color: string; size: number }) {
    return <Icon name={name} size={size} color={color} />;
  };
}

export default function TabsLayout() {
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brandPrimary,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            position: "absolute",
            borderTopWidth: 0,
            backgroundColor: "transparent",
            elevation: 0,
            ...(Platform.OS === "web" ? { height: TAB_BAR_BASE } : {}),
          },
          tabBarItemStyle: { alignSelf: "center" },
          tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
          tabBarBackground: () => (
            <Glass
              intensity={80}
              style={{
                flex: 1,
                borderTopWidth: 0.5,
                borderTopColor: colors.glassBorder,
              }}
            />
          ),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{ title: "Home", tabBarIcon: tabIcon("home") }}
        />
        <Tabs.Screen
          name="search"
          options={{ title: "Search", tabBarIcon: tabIcon("search") }}
        />
        <Tabs.Screen
          name="equalizer"
          options={{ title: "Sound", tabBarIcon: tabIcon("options") }}
        />
        <Tabs.Screen
          name="library"
          options={{ title: "Library", tabBarIcon: tabIcon("library") }}
        />
      </Tabs>
    </View>
  );
}
