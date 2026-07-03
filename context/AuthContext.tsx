import { supabase } from "@/lib/supabase";
import { pullFromCloud, pushAllToCloud, clearLocalUserData } from "@/lib/sync";
import { updateLastSeen } from "@/lib/social";
import { getSetting, setSetting } from "@/db/database";
import { registerAndSavePushToken } from "@/lib/notifications";
import { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { Alert, Platform } from "react-native";

type Profile = {
  id: string;
  display_name: string | null;
  email: string | null;
  promo_opt_in: boolean;
  country: string | null;
  avatar_url: string | null;
  username: string | null;
  bio: string | null;
  twitter_handle: string | null;
  instagram_handle: string | null;
  youtube_handle: string | null;
  twitch_handle: string | null;
  hendon_mob_url: string | null;
  poker_index_url: string | null;
  live_earnings: number | null;
  live_cashes: number | null;
  live_wins: number | null;
  top_10_results: number | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isSyncing: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  restoreFromCloud: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isSyncing: false,
  signInWithApple: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
  restoreFromCloud: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  // Tracks whether we've already restored cloud data for the current sign-in.
  // Prevents duplicate wipes on every Supabase token refresh (which also fires SIGNED_IN).
  const hasPulledRef = useRef(false);

  async function handleDeepLink(url: string) {
    if (!url.includes("auth/callback")) return;
    try {
      const parsed = new URL(url);
      const code = parsed.searchParams.get("code");
      const accessToken = parsed.searchParams.get("access_token") ?? new URLSearchParams(parsed.hash.slice(1)).get("access_token");
      const refreshToken = parsed.searchParams.get("refresh_token") ?? new URLSearchParams(parsed.hash.slice(1)).get("refresh_token");

      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      } else if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      }
    } catch (e) {
      console.error("Auth deep link error", e);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session) {
        fetchProfile(session.user.id);
        // Pull on first sign-in or on initial session load (e.g. after reinstall).
        // TOKEN_REFRESHED also emits SIGNED_IN — the ref guard prevents re-wiping on refresh.
        if ((event === "SIGNED_IN" || event === "INITIAL_SESSION") && !hasPulledRef.current) {
          hasPulledRef.current = true;
          setIsSyncing(true);

          // Synchronous SQLite calls can throw (e.g. transient lock/migration timing).
          // This callback runs inside Supabase's native event dispatch — an uncaught
          // throw here escalates to a native fatal crash, so guard it explicitly.
          try {
            const storedUserId = getSetting("current_user_id");
            const isAccountSwitch = !!storedUserId && storedUserId !== session.user.id;
            setSetting("current_user_id", session.user.id);

            if (isAccountSwitch) {
              // Account switch: old account's data was already pushed during sign-out.
              // Safe to clear local now and restore the new account from cloud.
              clearLocalUserData();
              pullFromCloud(session.user.id)
                .catch(console.error)
                .finally(() => setIsSyncing(false));
            } else {
              // Same account (app update / reinstall / token refresh):
              // Push any local data that may not have synced, then restore from cloud.
              pushAllToCloud(session.user.id)
                .catch(console.error)
                .finally(() =>
                  pullFromCloud(session.user.id)
                    .catch(console.error)
                    .finally(() => setIsSyncing(false))
                );
            }
          } catch (e) {
            console.error("Auth sync error", e);
            setIsSyncing(false);
          }
          registerAndSavePushToken(session.user.id).catch(console.error);
          updateLastSeen(session.user.id).catch(console.error);
        }
      } else {
        setProfile(null);
        hasPulledRef.current = false;
      }
    });

    Linking.getInitialURL().then((url) => { if (url) handleDeepLink(url); });
    const linkSub = Linking.addEventListener("url", ({ url }) => handleDeepLink(url));

    return () => {
      subscription.unsubscribe();
      linkSub.remove();
    };
  }, []);

  async function fetchProfile(userId: string) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    if (data) setProfile(data);
  }

  async function refreshProfile() {
    if (session) await fetchProfile(session.user.id);
  }

  async function restoreFromCloud() {
    if (!session?.user.id) return;
    setIsSyncing(true);
    await pushAllToCloud(session.user.id).catch(console.error);
    await pullFromCloud(session.user.id).catch(console.error);
    setIsSyncing(false);
  }

  async function signInWithApple() {
    if (Platform.OS !== "ios") return;
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        Alert.alert("Sign in failed", "Apple did not return an identity token.");
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
      });

      if (error) Alert.alert("Sign in failed", error.message);
    } catch (e: any) {
      // ERR_CANCELED means the user dismissed the sheet — don't show an alert
      if (e?.code !== "ERR_CANCELED") {
        Alert.alert("Sign in failed", e?.message ?? String(e));
      }
    }
  }

  async function signInWithGoogle() {
    try {
      const redirectTo = Linking.createURL("auth/callback");
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) {
        Alert.alert("Sign in failed", error?.message ?? "Could not start Google sign in.");
        return;
      }
      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type === "success") {
        await handleDeepLink(result.url);
      }
    } catch (e: any) {
      Alert.alert("Sign in failed", e?.message ?? String(e));
    }
  }

  async function signOut() {
    // Push all local data to cloud before signing out so nothing is lost on account switch.
    const userId = session?.user.id;
    if (userId) {
      await pushAllToCloud(userId).catch(console.error);
    }
    await supabase.auth.signOut();
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      isSyncing,
      loading,
      signInWithApple,
      signInWithGoogle,
      signOut,
      refreshProfile,
      restoreFromCloud,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
