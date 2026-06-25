import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BRAND = "#155DFC";

export default function TabLayout() {
  const { colors } = usePokerTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1 }}>
      <StatusBar style="light" />
      {/* Brand blue band that fills the status bar area on every tab screen */}
      <View
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0,
          height: insets.top,
          backgroundColor: BRAND,
          zIndex: 999,
        }}
      />
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.bg.brand,
        tabBarInactiveTintColor: colors.text.tertiary,
        tabBarStyle: {
          backgroundColor: colors.bg.primary,
          borderTopColor: colors.border.default,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
      }}
    >
      <Tabs.Screen
        name="history"
        options={{
          title: "Bankroll",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "pie-chart" : "pie-chart-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="social"
        options={{
          title: "Community",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "grid" : "grid-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "calendar" : "calendar-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: "More",
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? "ellipsis-horizontal-circle" : "ellipsis-horizontal-circle-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="notes"   options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="live"    options={{ href: null }} />
    </Tabs>
    </View>
  );
}
