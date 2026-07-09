import { usePokerTheme } from "@/hooks/use-poker-theme";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { TouchableOpacity } from "react-native";

export default function HomeGamesLayout() {
  const { colors } = usePokerTheme();

  const modalClose = () => (
    <TouchableOpacity
      onPress={() => { if (router.canGoBack()) router.back(); else router.replace("/(tabs)/more"); }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ alignItems: "center", justifyContent: "center" }}
    >
      <Ionicons name="close" size={32} color={colors.text.secondary} />
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
      <Stack.Screen
        name="index"
        options={{ presentation: "modal", title: "New Home Game", headerLeft: modalClose }}
      />
      <Stack.Screen name="active" options={{ headerShown: false }} />
      <Stack.Screen
        name="settle"
        options={{ title: "Settle Up", presentation: "modal", headerTintColor: colors.text.primary, headerShadowVisible: false }}
      />
    </Stack>
  );
}
