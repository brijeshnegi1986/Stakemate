import { supabase } from "@/lib/supabase";
import { pullFromCloud } from "@/lib/sync";
import { Session, User } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { createContext, useContext, useEffect, useState } from "react";
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
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithApple: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  signInWithApple: async () => {},
  signInWithGoogle: async () => {},
  signOut: async () => {},
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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
        if (event === "SIGNED_IN") {
          pullFromCloud(session.user.id).catch(console.error);
        }
      } else {
        setProfile(null);
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
    await supabase.auth.signOut();
    setProfile(null);
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      profile,
      loading,
      signInWithApple,
      signInWithGoogle,
      signOut,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
