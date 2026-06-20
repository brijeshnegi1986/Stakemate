import * as SecureStore from "expo-secure-store";
import { createClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

const SUPABASE_URL = "https://zktdckwnazuhmthxmmoc.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InprdGRja3duYXp1aG10aHhtbW9jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzODUxMTAsImV4cCI6MjA5NDk2MTExMH0.2uGcB6GUIdO83n34F4UjEBOzXoq33UbF2LyHNahsz0I";

// SecureStore has a 2048-byte per-key limit on iOS.
// Supabase JWT tokens exceed this, so we chunk large values across multiple keys.
const CHUNK_SIZE = 1800;

const ChunkedSecureStore = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === "web") return null;
    const countStr = await SecureStore.getItemAsync(`${key}.n`);
    if (!countStr) return SecureStore.getItemAsync(key);
    const count = parseInt(countStr, 10);
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`))
    );
    return chunks.every(Boolean) ? chunks.join("") : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === "web") return;
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      await SecureStore.deleteItemAsync(`${key}.n`);
      return;
    }
    const chunks: string[] = [];
    for (let i = 0; i < value.length; i += CHUNK_SIZE) {
      chunks.push(value.slice(i, i + CHUNK_SIZE));
    }
    await Promise.all(chunks.map((chunk, i) => SecureStore.setItemAsync(`${key}.${i}`, chunk)));
    await SecureStore.setItemAsync(`${key}.n`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    if (Platform.OS === "web") return;
    const countStr = await SecureStore.getItemAsync(`${key}.n`);
    if (countStr) {
      const count = parseInt(countStr, 10);
      await Promise.all([
        ...Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)),
        SecureStore.deleteItemAsync(`${key}.n`),
      ]);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ChunkedSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Pause/resume token auto-refresh when app goes to background/foreground
AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});
