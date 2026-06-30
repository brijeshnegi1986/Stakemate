import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const notification = payload?.record;

    if (!notification?.id || !notification?.user_id) {
      return new Response("missing record", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Fetch push token and unread badge count in parallel
    const [profileRes, countRes] = await Promise.all([
      supabase.from("profiles").select("push_token").eq("id", notification.user_id).single(),
      supabase.from("notifications").select("id", { count: "exact", head: true })
        .eq("user_id", notification.user_id)
        .eq("read", false),
    ]);

    const token: string | null | undefined = profileRes.data?.push_token;
    if (!token) {
      return new Response("no push token", { status: 200 });
    }

    const badgeCount = (countRes.count ?? 1);

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        to: token,
        title: notification.title,
        body: notification.body,
        data: notification.data ?? {},
        sound: "default",
        badge: badgeCount,
      }),
    });

    const result = await res.json();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(String(err), { status: 500 });
  }
});
