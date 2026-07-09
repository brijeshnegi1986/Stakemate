import * as Notifications from "expo-notifications";

export async function scheduleLeavingReminder(
  playerName: string,
  minutes: number
): Promise<string | null> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return null;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Player leaving soon",
        body: `${playerName} said they're leaving in ${minutes} min — cash them out.`,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + minutes * 60000),
      },
    });
    return id;
  } catch {
    return null;
  }
}

export async function cancelLeavingReminder(notificationId: string | null | undefined): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // notification may have already fired or not be supported in this environment
  }
}
