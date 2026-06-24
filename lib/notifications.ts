import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

// Configure how notifications appear when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerAndSavePushToken(userId: string): Promise<void> {
  // expo-device not required — just check for a real push token; simulators return a fake token
  if (Platform.OS === "web") return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return;

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await supabase
      .from("profiles")
      .update({ push_token: token })
      .eq("id", userId);
  } catch {
    // Non-fatal — app works fine without push
  }
}

export async function sendPushToUser(
  targetUserId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("push_token")
    .eq("id", targetUserId)
    .single();

  const token: string | null | undefined = (profile as any)?.push_token;
  if (!token) return;

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ to: token, title, body, data: data ?? {}, sound: "default" }),
  }).catch(() => {
    // Non-fatal — notification delivery is best-effort
  });
}
