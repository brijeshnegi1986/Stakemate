import { supabase } from "./supabase";
import { getSessions, getTournamentEvents, getNoteHistory, db, Session, NoteEntry, TournamentEvent } from "@/db/database";

// ── Clear all user-specific local data (used on account switch) ───────────────

export function clearLocalUserData(): void {
  db.execSync("DELETE FROM sessions WHERE status = 'completed' OR status IS NULL");
  db.execSync("DELETE FROM tournament_events");
  db.execSync("DELETE FROM notes_history");
  // Leave the settings table — it holds app preferences, not user data
}

// ── Push local SQLite → Supabase ─────────────────────────────────────────────

export async function pushAllToCloud(userId: string) {
  const sessions = getSessions();
  const events = getTournamentEvents();
  const notes = getNoteHistory();
  const settingsRows = db.getAllSync("SELECT key, value FROM settings") as { key: string; value: string }[];
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, r.value]));

  if (sessions.length > 0) {
    await supabase.from("sessions").upsert(
      sessions.map((s) => ({
        user_id: userId,
        local_id: s.id,
        type: s.type,
        buy_in: s.buyIn,
        cash_out: s.cashOut,
        duration: s.duration,
        stakes: s.stakes,
        state: s.state,
        venue: s.venue,
        profit: s.profit,
        date: s.date,
        start_time: s.startTime ?? null,
        status: s.status ?? "completed",
        paused_at: s.pausedAt ?? null,
        total_paused_seconds: s.totalPausedSeconds ?? 0,
        tournament_name: s.tournamentName ?? null,
        entries: s.entries ?? null,
        position: s.position ?? null,
        payout: s.payout ?? null,
        notes: s.notes ?? null,
        rebuys: s.rebuys ?? "[]",
      })),
      { onConflict: "user_id,local_id", ignoreDuplicates: false }
    );
  }

  if (events.length > 0) {
    await supabase.from("tournament_events").upsert(
      events.map((e) => ({
        user_id: userId,
        local_id: e.id,
        name: e.name,
        date: e.date,
        venue: e.venue,
        buyin: e.buyin,
        notes: e.notes,
        image_url: e.image_url ?? null,
        stake_deal_id: e.stake_deal_id ?? null,
        source: e.source ?? "custom",
        created_at: e.created_at,
      })),
      { onConflict: "user_id,local_id", ignoreDuplicates: false }
    );
  }

  if (notes.length > 0) {
    await supabase.from("notes_history").upsert(
      notes.map((n) => ({
        user_id: userId,
        local_id: n.id,
        session_id: n.session_id,
        session_date: n.session_date,
        session_venue: n.session_venue,
        session_profit: n.session_profit,
        session_type: n.session_type,
        raw_notes: n.raw_notes,
        enhanced_notes: n.enhanced_notes ?? null,
        title: n.title ?? null,
        hand_analysis: n.hand_analysis ?? null,
        metadata: n.metadata ?? null,
        created_at: n.created_at,
        updated_at: n.updated_at,
      })),
      { onConflict: "user_id,local_id", ignoreDuplicates: false }
    );
  }

  await supabase.from("user_settings").upsert(
    { user_id: userId, data: settings, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );
}

// ── Per-item sync (called fire-and-forget after each local write) ────────────

export async function syncSessionToCloud(userId: string, localId: number): Promise<void> {
  const s = db.getFirstSync(`SELECT * FROM sessions WHERE id = ?`, [localId]) as Session | null;
  if (!s) return;
  await supabase.from("sessions").upsert({
    user_id: userId, local_id: s.id, type: s.type,
    buy_in: s.buyIn, cash_out: s.cashOut, duration: s.duration,
    stakes: s.stakes ?? "", state: s.state ?? "", venue: s.venue ?? "",
    profit: s.profit, date: s.date, start_time: s.startTime ?? null,
    status: s.status ?? "completed", paused_at: s.pausedAt ?? null,
    total_paused_seconds: s.totalPausedSeconds ?? 0,
    tournament_name: s.tournamentName ?? null, entries: s.entries ?? null,
    position: s.position ?? null, payout: s.payout ?? null,
    notes: s.notes ?? null, rebuys: s.rebuys ?? "[]",
  }, { onConflict: "user_id,local_id" });
}

export async function deleteSessionFromCloud(userId: string, localId: number): Promise<void> {
  await supabase.from("sessions").delete().eq("user_id", userId).eq("local_id", localId);
}

export async function syncNoteToCloud(userId: string, localId: number): Promise<void> {
  const n = db.getFirstSync(`SELECT * FROM notes_history WHERE id = ?`, [localId]) as NoteEntry | null;
  if (!n) return;
  await supabase.from("notes_history").upsert({
    user_id: userId, local_id: n.id, session_id: n.session_id,
    session_date: n.session_date, session_venue: n.session_venue,
    session_profit: n.session_profit, session_type: n.session_type,
    raw_notes: n.raw_notes, enhanced_notes: n.enhanced_notes ?? null,
    title: n.title ?? null, hand_analysis: n.hand_analysis ?? null,
    metadata: n.metadata ?? null, created_at: n.created_at, updated_at: n.updated_at,
  }, { onConflict: "user_id,local_id" });
}

export async function deleteNoteFromCloud(userId: string, localId: number): Promise<void> {
  await supabase.from("notes_history").delete().eq("user_id", userId).eq("local_id", localId);
}

export async function syncEventToCloud(userId: string, localId: number): Promise<void> {
  const e = db.getFirstSync(`SELECT * FROM tournament_events WHERE id = ?`, [localId]) as TournamentEvent | null;
  if (!e) return;
  await supabase.from("tournament_events").upsert({
    user_id: userId, local_id: e.id, name: e.name, date: e.date,
    venue: e.venue ?? "", buyin: e.buyin ?? "", notes: e.notes ?? "",
    image_url: e.image_url ?? null, stake_deal_id: e.stake_deal_id ?? null,
    source: e.source ?? "custom", created_at: e.created_at,
  }, { onConflict: "user_id,local_id" });
}

export async function deleteEventFromCloud(userId: string, localId: number): Promise<void> {
  await supabase.from("tournament_events").delete().eq("user_id", userId).eq("local_id", localId);
}

// ── Pull Supabase → local SQLite (called on sign-in / after reinstall) ───────

export async function pullFromCloud(userId: string) {
  const [
    { data: sessions, error: sessErr },
    { data: events,   error: evtErr  },
    { data: notes,    error: notesErr },
    { data: settingsRow },
  ] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", userId),
    supabase.from("tournament_events").select("*").eq("user_id", userId),
    supabase.from("notes_history").select("*").eq("user_id", userId),
    supabase.from("user_settings").select("data").eq("user_id", userId).maybeSingle(),
  ]);

  // Critical guard: only wipe + restore a table when Supabase returned actual rows.
  // If the response errored or came back empty (e.g. RLS policies missing, network
  // hiccup, or genuinely new account) we leave local data untouched rather than
  // wiping it to nothing. This prevents catastrophic data loss on sign-out/sign-in.

  if (!sessErr && sessions && sessions.length > 0) {
    // Leave any active live session untouched; replace all completed ones
    db.execSync("DELETE FROM sessions WHERE status = 'completed' OR status IS NULL");
    for (const s of sessions) {
      db.runSync(
        `INSERT OR REPLACE INTO sessions
           (id, type, buyIn, cashOut, duration, stakes, state, venue, profit, date,
            startTime, status, pausedAt, totalPausedSeconds, tournamentName, entries,
            position, payout, notes, rebuys)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.local_id, s.type, s.buy_in, s.cash_out, s.duration,
          s.stakes ?? "", s.state ?? "", s.venue ?? "", s.profit, s.date,
          s.start_time ?? null, s.status ?? "completed", s.paused_at ?? null,
          s.total_paused_seconds ?? 0, s.tournament_name ?? null, s.entries ?? null,
          s.position ?? null, s.payout ?? null, s.notes ?? null, s.rebuys ?? "[]",
        ]
      );
    }
  }

  if (!evtErr && events && events.length > 0) {
    db.execSync("DELETE FROM tournament_events");
    for (const e of events) {
      db.runSync(
        `INSERT OR REPLACE INTO tournament_events
           (id, name, date, venue, buyin, notes, image_url, stake_deal_id, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.local_id, e.name, e.date, e.venue ?? "", e.buyin ?? "",
          e.notes ?? "", e.image_url ?? "", e.stake_deal_id ?? null,
          e.source ?? "custom", e.created_at,
        ]
      );
    }
  }

  if (!notesErr && notes && notes.length > 0) {
    db.execSync("DELETE FROM notes_history");
    for (const n of notes) {
      db.runSync(
        `INSERT OR REPLACE INTO notes_history
           (id, session_id, session_date, session_venue, session_profit, session_type,
            raw_notes, enhanced_notes, title, hand_analysis, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          n.local_id, n.session_id, n.session_date, n.session_venue ?? "",
          n.session_profit ?? 0, n.session_type ?? "", n.raw_notes,
          n.enhanced_notes ?? null, n.title ?? null, n.hand_analysis ?? null,
          n.metadata ?? null, n.created_at, n.updated_at,
        ]
      );
    }
  }

  if (settingsRow?.data) {
    for (const [key, value] of Object.entries(settingsRow.data as Record<string, unknown>)) {
      db.runSync(
        `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
        [key, String(value)]
      );
    }
  }
}
