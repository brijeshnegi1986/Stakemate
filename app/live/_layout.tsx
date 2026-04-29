import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { Text, TouchableOpacity } from "react-native";

export default function LiveLayout() {
  const { colors } = usePokerTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg.primary },
        headerTintColor: colors.text.primary,
        headerShadowVisible: true
        // headerBackTitle: "Cancel",
      }}
    >
      {/* MAIN LIVE SCREEN */}
      <Stack.Screen
        name="index"
        options={{
          title: "Add Live Session",
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                if (router.canGoBack()) router.back();
                else router.replace("/(tabs)");
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text.primary} />
              <Text style={{ marginLeft: 8, color: colors.text.primary, fontWeight: "600", fontSize: 16 }}>Back</Text>
            </TouchableOpacity>
          ),
        }}
      />
      {/* ACTIVE SESSION — custom full-screen header */}
      <Stack.Screen
        name="active"
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="end"
        options={{
          title: "End Session",
          presentation: "modal",
          headerStyle: { backgroundColor: colors.bg.primary },
          headerTintColor: colors.text.primary,
          headerShadowVisible: true,
        }}
      />
    </Stack>
  );
}
