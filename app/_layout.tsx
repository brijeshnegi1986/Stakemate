import { AuthProvider } from "@/context/AuthContext";
import { AppThemeProvider, useThemeContext } from "@/store/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, ThemeProvider } from "expo-router";
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

  const navigationTheme = {
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
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium: { fontFamily: 'System', fontWeight: '500' as const },
      bold: { fontFamily: 'System', fontWeight: '600' as const },
      heavy: { fontFamily: 'System', fontWeight: '800' as const },
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
              title: "Session Detail",
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
                  <Ionicons name="arrow-back" size={20} color={themeColors.text.primary} />
                  <Text style={{ marginLeft: 8, color: themeColors.text.primary, fontWeight: "600", fontSize: 16 }}>
                    Back
                  </Text>
                </TouchableOpacity>
              ),
            }}
          />
          <Stack.Screen
            name="session-edit"
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
                  <Ionicons name="arrow-back" size={20} color={themeColors.text.primary} />
                  <Text style={{ marginLeft: 8, color: themeColors.text.primary, fontWeight: "600", fontSize: 16 }}>
                    Back
                  </Text>
                </TouchableOpacity>
              ),
            }}
          />
          <Stack.Screen
            name="sign-in"
            options={{ presentation: "modal", headerShown: false }}
          />
          <Stack.Screen
            name="settings"
            options={{
              title: "Settings",
              headerStyle: { backgroundColor: themeColors.bg.primary },
              headerTintColor: themeColors.text.primary,
              headerTitleStyle: { fontWeight: "700", fontSize: 17 },
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => router.back()}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ flexDirection: "row", alignItems: "center", paddingRight: 12 }}
                >
                  <Ionicons name="arrow-back" size={20} color={themeColors.text.primary} />
                  <Text style={{ marginLeft: 8, color: themeColors.text.primary, fontWeight: "600", fontSize: 16 }}>
                    Back
                  </Text>
                </TouchableOpacity>
              ),
            }}
          />
          <Stack.Screen
            name="privacy-policy"
            options={{
              title: "Privacy Policy",
              headerStyle: { backgroundColor: themeColors.bg.primary },
              headerTintColor: themeColors.text.primary,
              headerTitleStyle: { fontWeight: "700", fontSize: 17 },
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => router.back()}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ flexDirection: "row", alignItems: "center", paddingRight: 12 }}
                >
                  <Ionicons name="arrow-back" size={20} color={themeColors.text.primary} />
                  <Text style={{ marginLeft: 8, color: themeColors.text.primary, fontWeight: "600", fontSize: 16 }}>
                    Back
                  </Text>
                </TouchableOpacity>
              ),
            }}
          />
          <Stack.Screen
            name="terms"
            options={{
              title: "Terms of Service",
              headerStyle: { backgroundColor: themeColors.bg.primary },
              headerTintColor: themeColors.text.primary,
              headerTitleStyle: { fontWeight: "700", fontSize: 17 },
              headerLeft: () => (
                <TouchableOpacity
                  onPress={() => router.back()}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={{ flexDirection: "row", alignItems: "center", paddingRight: 12 }}
                >
                  <Ionicons name="arrow-back" size={20} color={themeColors.text.primary} />
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
      <AuthProvider>
        <RootLayoutContent />
      </AuthProvider>
    </AppThemeProvider>
  );
}
