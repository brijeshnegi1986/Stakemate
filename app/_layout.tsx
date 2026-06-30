import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://591e7e4906eb66777e0f5402f3547a30@o4511652338663424.ingest.us.sentry.io/4511652338860037',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

import { AuthProvider } from "@/context/AuthContext";
import { AppThemeProvider, useThemeContext } from "@/store/ThemeContext";
import { Ionicons } from "@expo/vector-icons";
import { router, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Text, TouchableOpacity, View } from "react-native";
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

  // Shared close button for modals (iOS standard: bare xmark, no circle bg)
  const modalClose = () => (
    <TouchableOpacity
      onPress={() => router.back()}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ marginLeft: 4 }}
    >
      <Ionicons name="close" size={24} color={themeColors.text.secondary} />
    </TouchableOpacity>
  );

  // Shared back button for push screens (iOS standard: chevron-back)
  const pushBack = () => (
    <TouchableOpacity
      onPress={() => router.back()}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={{ flexDirection: "row", alignItems: "center", gap: 4, marginLeft: -4 }}
    >
      <Ionicons name="chevron-back" size={24} color={themeColors.text.primary} />
    </TouchableOpacity>
  );

  // Shared modal header options (no explicit background — inherits navigation theme card color, single surface)
  const modalOptions = (title: string) => ({
    presentation: "modal" as const,
    title,
    headerTintColor: themeColors.text.primary,
    headerTitleStyle: { fontWeight: "600" as const, fontSize: 17 },
    headerShadowVisible: false,
    headerLeft: modalClose,
  });

  // Shared push header options
  const pushOptions = (title: string) => ({
    title,
    headerTintColor: themeColors.text.primary,
    headerTitleStyle: { fontWeight: "600" as const, fontSize: 17 },
    headerShadowVisible: true,
    headerLeft: pushBack,
  });

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={navigationTheme}>
        <Stack initialRouteName="index">
          <Stack.Screen name="index"   options={{ headerShown: false }} />
          <Stack.Screen name="welcome" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)"  options={{ headerShown: false }} />
          <Stack.Screen name="live"    options={{ presentation: "modal", headerShown: false }} />
          <Stack.Screen name="sign-in" options={{ presentation: "modal", headerShown: false }} />

          <Stack.Screen name="add-session"    options={modalOptions("Add Completed Session")} />
          <Stack.Screen name="explore"        options={modalOptions("Explore Stakemate")} />
          <Stack.Screen name="settings"       options={modalOptions("Settings")} />
          <Stack.Screen name="privacy-policy" options={modalOptions("Privacy Policy")} />
          <Stack.Screen name="terms"          options={modalOptions("Terms of Service")} />

          <Stack.Screen name="session-detail" options={pushOptions("Session Detail")} />
          <Stack.Screen name="session-edit"   options={pushOptions("Edit Session")} />

          <Stack.Screen name="notifications"  options={{ ...pushOptions("Notifications"), headerShown: false }} />
          <Stack.Screen name="user-profile"   options={{ headerShown: false, animation: "slide_from_right" }} />
          <Stack.Screen name="modal"          options={{ presentation: "modal", title: "Modal" }} />
        </Stack>
        <StatusBar style={isDark ? "light" : "dark"} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

export default Sentry.wrap(function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <RootLayoutContent />
      </AuthProvider>
    </AppThemeProvider>
  );
});
