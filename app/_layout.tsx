import { AppThemeProvider, useThemeContext } from "@/store/ThemeContext";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Theme, ThemeProvider } from "@react-navigation/native";
import { router, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text, TouchableOpacity } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import "react-native-reanimated";
import { initDB } from "../db/database";

function RootLayoutContent() {
  const { colors: themeColors, isDark } = useThemeContext();

  useEffect(() => {
    initDB();
  }, []);

  const navigationTheme: Theme = {
    dark: isDark,
    colors: {
      primary: themeColors.bg.brand,
      background: themeColors.bg.primary,
      card: themeColors.bg.primary,
      text: themeColors.text.primary,
      border: themeColors.border.default,
      notification: themeColors.bg.danger,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' },
      medium: { fontFamily: 'System', fontWeight: '500' },
      bold: { fontFamily: 'System', fontWeight: '600' },
      heavy: { fontFamily: 'System', fontWeight: '800' },
    },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <Stack initialRouteName="index">
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="live" options={{ headerShown: false }} />
          <Stack.Screen
            name="session-detail"
            options={{
              title: "Edit Session",
              headerShadowVisible: true,
              headerStyle: { backgroundColor: themeColors.bg.primary },
              headerTintColor: themeColors.text.primary,
              headerTitleStyle: { fontWeight: "700", fontSize: 17 },
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => router.back()}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ flexDirection: "row", alignItems: "center", paddingRight: 12 }}
                >
                  <MaterialCommunityIcons name="arrow-left" size={20} color={themeColors.text.primary} />
                  <Text style={{ marginLeft: 8, color: themeColors.text.primary, fontWeight: "600", fontSize: 16 }}>
                    Back
                  </Text>
                </TouchableOpacity>
              ),
            }}
          />
          <Stack.Screen
            name="modal"
            options={{ presentation: "modal", title: "Modal" }}
          />
        </Stack>
        <StatusBar style={isDark ? "light" : "dark"} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <RootLayoutContent />
    </AppThemeProvider>
  );
}
