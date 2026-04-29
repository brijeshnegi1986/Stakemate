import { CustomTabBar } from "@/components/CustomTabBar";
import { PokerRollLogo } from "@/components/PokerRollLogo";
import { usePokerTheme } from "@/hooks/use-poker-theme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router, Tabs } from "expo-router";
import { Text, TouchableOpacity, View } from "react-native";

export default function TabLayout() {
  const { colors } = usePokerTheme();

  const backButton = () => (
    <TouchableOpacity
      onPress={() => {
        if (router.canGoBack()) router.back();
        else router.replace("/(tabs)");
      }}
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8 }}
    >
      <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text.primary} />
      <Text style={{ marginLeft: 8, color: colors.text.primary, fontWeight: "600", fontSize: 16 }}>
        Back
      </Text>
    </TouchableOpacity>
  );

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        headerLeft: ({ canGoBack }) =>
          canGoBack ? undefined : (
            <View style={{ paddingLeft: 16 }}>
              <PokerRollLogo size={36} />
            </View>
          ),
        headerStyle: { backgroundColor: colors.bg.primary },
        headerTintColor: colors.text.primary,
        headerTitleStyle: {
          fontWeight: "700",
          fontSize: 16,
          letterSpacing: 1,
          textTransform: "uppercase",
        },
        headerShadowVisible: true,
      }}
    >
      <Tabs.Screen name="index"   options={{ title: "Dashboard" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
      <Tabs.Screen name="live"    options={{ headerLeft: backButton }} />
      <Tabs.Screen name="add"     options={{ title: "Add Session", headerLeft: backButton }} />
    </Tabs>
  );
}
