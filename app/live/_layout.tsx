import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { TouchableOpacity } from "react-native";

export default function LiveLayout() {
  const { colors } = usePokerTheme();

  const modalClose = () => (
    <TouchableOpacity
      onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)"); }}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ marginLeft: 4 }}
    >
      <Ionicons name="close" size={24} color={colors.text.secondary} />
    </TouchableOpacity>
  );

  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.text.primary,
        headerTitleStyle: { fontWeight: "600" as const, fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      {/* MAIN LIVE SCREEN */}
      <Stack.Screen
        name="index"
        options={{
          presentation: "modal",
          title: "Start Live Session",
          headerLeft: modalClose,
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
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
        }}
      />
    </Stack>
  );
}
