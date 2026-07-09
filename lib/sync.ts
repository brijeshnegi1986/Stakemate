import { supabase } from "./supabase";
import {
  getSessions, getTournamentEvents, getNoteHistory, getPlayerNotes, db,
  Session, NoteEntry, TournamentEvent, PlayerNote,
  getHomeGame, getHomeGames, getHomeGamePlayers, getHomeGameTransactions, getHomeGameExpenses, getHomeGameRakeEntries,
  getCasino, getCasinos, getCasinoTransactions,
  pruneExpiredTournamentEvents,
} from "@/db/database";

// ── Clear all user-specific local data (used on account switch) ───────────────

export function clearLocalUserData(): void {
  db.execSync("DELETE FROM sessions WHERE status = 'completed' OR status IS NULL");
  db.execSync("DELETE FROM tournament_events");
  db.execSync("DELETE FROM notes_history");
  db.execSync("DELETE FROM player_notes");
  db.execSync("DELETE FROM home_game_transactions");
  db.execSync("DELETE FROM home_game_expenses");
  db.execSync("DELETE FROM home_game_rake");
  db.execSync("DELETE FROM home_game_players");
  db.execSync("DELETE FROM home_games WHERE status = 'completed' OR status IS NULL");
  db.execSync("DELETE FROM casino_transactions");
  db.execSync("DELETE FROM casinos");
  // Leave the settings table — it holds app preferences, not user data
}

// ── Push local SQLite → Supabase ─────────────────────────────────────────────

export async function pushAllToCloud(userId: string) {
  const sessions     = getSessions();
  const events       = getTournamentEvents();
  const notes        = getNoteHistory();
  const playerNotes  = getPlayerNotes();
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

  if (playerNotes.length > 0) {
    await supabase.from("player_notes").upsert(
      playerNotes.map((p) => ({
        user_id:    userId,
        local_id:   p.id,
        name:       p.name,
        styles:     p.styles,
        notes:      p.notes,
        venue:      p.venue,
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
      { onConflict: "user_id,local_id", ignoreDuplicates: false }
    );
  }

  await supabase.from("user_settings").upsert(
    { user_id: userId, data: settings, updated_at: new Date().toISOString() },
    { onConflict: "user_id" }
  );

  const homeGames = getHomeGames();
  await Promise.all(homeGames.map((g) => syncHomeGameToCloud(userId, g.id)));

  const casinos = getCasinos();
  await Promise.all(casinos.map((c) => syncCasinoToCloud(userId, c.id)));
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
    rebuys: s.rebuys ?? "[]",
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

export async function deleteEventsFromCloud(userId: string, localIds: number[]): Promise<void> {
  if (localIds.length === 0) return;
  await supabase.from("tournament_events").delete().eq("user_id", userId).in("local_id", localIds);
}

// Prunes past local tournament events (see pruneExpiredTournamentEvents) and mirrors
// the deletion to Supabase so they don't reappear on the next pullFromCloud.
export async function pruneExpiredTournaments(userId: string): Promise<void> {
  const ids = pruneExpiredTournamentEvents();
  await deleteEventsFromCloud(userId, ids);
}

export async function syncPlayerNoteToCloud(userId: string, localId: number): Promise<void> {
  const p = db.getFirstSync(`SELECT * FROM player_notes WHERE id = ?`, [localId]) as PlayerNote | null;
  if (!p) return;
  await supabase.from("player_notes").upsert({
    user_id: userId, local_id: p.id,
    name: p.name, styles: p.styles,
    notes: p.notes, venue: p.venue,
    created_at: p.created_at, updated_at: p.updated_at,
  }, { onConflict: "user_id,local_id" });
}

export async function deletePlayerNoteFromCloud(userId: string, localId: number): Promise<void> {
  await supabase.from("player_notes").delete().eq("user_id", userId).eq("local_id", localId);
}

// ── Home Games (whole-entity re-sync — cheap, since a game has few dozen rows) ──

export async function syncHomeGameToCloud(userId: string, gameId: number): Promise<void> {
  const game = getHomeGame(gameId);
  if (!game) return;

  const players      = getHomeGamePlayers(gameId);
  const transactions = getHomeGameTransactions(gameId);
  const expenses      = getHomeGameExpenses(gameId);
  const rake          = getHomeGameRakeEntries(gameId);

  await supabase.from("home_games").upsert({
    user_id: userId, local_id: game.id, name: game.name, venue: game.venue,
    date: game.date, unit: game.unit, status: game.status,
    created_at: game.created_at, completed_at: game.completed_at ?? null,
  }, { onConflict: "user_id,local_id" });

  if (players.length > 0) {
    await supabase.from("home_game_players").upsert(
      players.map((p) => ({
        user_id: userId, local_id: p.id, local_game_id: gameId,
        display_name: p.display_name, leaving_at: p.leaving_at ?? null,
        notification_id: p.notification_id ?? null, settled: !!p.settled,
        created_at: p.created_at,
      })),
      { onConflict: "user_id,local_id" }
    );
  }

  if (transactions.length > 0) {
    await supabase.from("home_game_transactions").upsert(
      transactions.map((t) => ({
        user_id: userId, local_id: t.id, local_game_id: gameId, local_player_id: t.player_id,
        type: t.type, amount: t.amount, note: t.note, confirmed: !!t.confirmed, timestamp: t.timestamp,
      })),
      { onConflict: "user_id,local_id" }
    );
  }

  if (expenses.length > 0) {
    await supabase.from("home_game_expenses").upsert(
      expenses.map((e) => ({
        user_id: userId, local_id: e.id, local_game_id: gameId,
        category: e.category, amount: e.amount, payee_name: e.payee_name, note: e.note, timestamp: e.timestamp,
      })),
      { onConflict: "user_id,local_id" }
    );
  }

  if (rake.length > 0) {
    await supabase.from("home_game_rake").upsert(
      rake.map((r) => ({
        user_id: userId, local_id: r.id, local_game_id: gameId, amount: r.amount, note: r.note, timestamp: r.timestamp,
      })),
      { onConflict: "user_id,local_id" }
    );
  }
}

export async function deleteHomeGameFromCloud(userId: string, gameId: number): Promise<void> {
  await supabase.from("home_game_transactions").delete().eq("user_id", userId).eq("local_game_id", gameId);
  await supabase.from("home_game_expenses").delete().eq("user_id", userId).eq("local_game_id", gameId);
  await supabase.from("home_game_rake").delete().eq("user_id", userId).eq("local_game_id", gameId);
  await supabase.from("home_game_players").delete().eq("user_id", userId).eq("local_game_id", gameId);
  await supabase.from("home_games").delete().eq("user_id", userId).eq("local_id", gameId);
}

export async function deleteHomeGamePlayerFromCloud(userId: string, playerId: number): Promise<void> {
  await supabase.from("home_game_transactions").delete().eq("user_id", userId).eq("local_player_id", playerId);
  await supabase.from("home_game_players").delete().eq("user_id", userId).eq("local_id", playerId);
}

// ── Casino Balance ────────────────────────────────────────────────────────────

export async function syncCasinoToCloud(userId: string, casinoId: number): Promise<void> {
  const casino = getCasino(casinoId);
  if (!casino) return;

  const transactions = getCasinoTransactions(casinoId);

  await supabase.from("casinos").upsert({
    user_id: userId, local_id: casino.id, name: casino.name,
    state: casino.state, name_key: casino.name_key, created_at: casino.created_at,
  }, { onConflict: "user_id,local_id" });

  if (transactions.length > 0) {
    await supabase.from("casino_transactions").upsert(
      transactions.map((t) => ({
        user_id: userId, local_id: t.id, local_casino_id: casinoId,
        type: t.type, amount: t.amount, date: t.date, note: t.note, created_at: t.created_at,
      })),
      { onConflict: "user_id,local_id" }
    );
  }
}

export async function deleteCasinoTransactionFromCloud(userId: string, txnId: number): Promise<void> {
  await supabase.from("casino_transactions").delete().eq("user_id", userId).eq("local_id", txnId);
}

export async function deleteCasinoFromCloud(userId: string, casinoId: number): Promise<void> {
  await supabase.from("casino_transactions").delete().eq("user_id", userId).eq("local_casino_id", casinoId);
  await supabase.from("casinos").delete().eq("user_id", userId).eq("local_id", casinoId);
}

// ── Pull Supabase → local SQLite (called on sign-in / after reinstall) ───────

export async function pullFromCloud(userId: string) {
  const [
    { data: sessions,    error: sessErr   },
    { data: events,      error: evtErr    },
    { data: notes,       error: notesErr  },
    { data: playerNotes, error: pNotesErr },
    { data: settingsRow },
    { data: homeGames,        error: hgErr     },
    { data: homeGamePlayers,  error: hgpErr    },
    { data: homeGameTxns,     error: hgtErr    },
    { data: homeGameExpenses, error: hgeErr    },
    { data: homeGameRake,     error: hgrErr    },
    { data: casinos,          error: casErr    },
    { data: casinoTxns,       error: casTxnErr },
  ] = await Promise.all([
    supabase.from("sessions").select("*").eq("user_id", userId),
    supabase.from("tournament_events").select("*").eq("user_id", userId),
    supabase.from("notes_history").select("*").eq("user_id", userId),
    supabase.from("player_notes").select("*").eq("user_id", userId),
    supabase.from("user_settings").select("data").eq("user_id", userId).maybeSingle(),
    supabase.from("home_games").select("*").eq("user_id", userId),
    supabase.from("home_game_players").select("*").eq("user_id", userId),
    supabase.from("home_game_transactions").select("*").eq("user_id", userId),
    supabase.from("home_game_expenses").select("*").eq("user_id", userId),
    supabase.from("home_game_rake").select("*").eq("user_id", userId),
    supabase.from("casinos").select("*").eq("user_id", userId),
    supabase.from("casino_transactions").select("*").eq("user_id", userId),
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
            position, payout, rebuys)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.local_id, s.type, s.buy_in, s.cash_out, s.duration,
          s.stakes ?? "", s.state ?? "", s.venue ?? "", s.profit, s.date,
          s.start_time ?? null, s.status ?? "completed", s.paused_at ?? null,
          s.total_paused_seconds ?? 0, s.tournament_name ?? null, s.entries ?? null,
          s.position ?? null, s.payout ?? null, s.rebuys ?? "[]",
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

  if (!pNotesErr && playerNotes && playerNotes.length > 0) {
    db.execSync("DELETE FROM player_notes");
    for (const p of playerNotes) {
      db.runSync(
        `INSERT OR REPLACE INTO player_notes
           (id, name, styles, notes, venue, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          p.local_id, p.name,
          typeof p.styles === "string" ? p.styles : JSON.stringify(p.styles),
          p.notes ?? "", p.venue ?? "",
          p.created_at, p.updated_at,
        ]
      );
    }
  }

  if (!hgErr && homeGames && homeGames.length > 0) {
    // Leave any active game (and its children) untouched; replace all completed ones
    db.execSync("DELETE FROM home_games WHERE status = 'completed' OR status IS NULL");
    db.execSync("DELETE FROM home_game_players WHERE game_id NOT IN (SELECT id FROM home_games WHERE status = 'active')");
    db.execSync("DELETE FROM home_game_transactions WHERE game_id NOT IN (SELECT id FROM home_games WHERE status = 'active')");
    db.execSync("DELETE FROM home_game_expenses WHERE game_id NOT IN (SELECT id FROM home_games WHERE status = 'active')");
    db.execSync("DELETE FROM home_game_rake WHERE game_id NOT IN (SELECT id FROM home_games WHERE status = 'active')");

    for (const g of homeGames) {
      db.runSync(
        `INSERT OR REPLACE INTO home_games (id, name, venue, date, unit, status, created_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [g.local_id, g.name, g.venue ?? "", g.date, g.unit ?? "currency", g.status ?? "completed", g.created_at, g.completed_at ?? null]
      );
    }
    if (!hgpErr && homeGamePlayers) {
      for (const p of homeGamePlayers) {
        db.runSync(
          `INSERT OR REPLACE INTO home_game_players (id, game_id, display_name, leaving_at, notification_id, settled, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [p.local_id, p.local_game_id, p.display_name, p.leaving_at ?? null, p.notification_id ?? null, p.settled ? 1 : 0, p.created_at]
        );
      }
    }
    if (!hgtErr && homeGameTxns) {
      for (const t of homeGameTxns) {
        db.runSync(
          `INSERT OR REPLACE INTO home_game_transactions (id, game_id, player_id, type, amount, note, confirmed, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [t.local_id, t.local_game_id, t.local_player_id, t.type, t.amount, t.note ?? "", t.confirmed ? 1 : 0, t.timestamp]
        );
      }
    }
    if (!hgeErr && homeGameExpenses) {
      for (const e of homeGameExpenses) {
        db.runSync(
          `INSERT OR REPLACE INTO home_game_expenses (id, game_id, category, amount, payee_name, note, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [e.local_id, e.local_game_id, e.category, e.amount, e.payee_name ?? "", e.note ?? "", e.timestamp]
        );
      }
    }
    if (!hgrErr && homeGameRake) {
      for (const r of homeGameRake) {
        db.runSync(
          `INSERT OR REPLACE INTO home_game_rake (id, game_id, amount, note, timestamp)
           VALUES (?, ?, ?, ?, ?)`,
          [r.local_id, r.local_game_id, r.amount, r.note ?? "", r.timestamp]
        );
      }
    }
  }

  if (!casErr && casinos && casinos.length > 0) {
    db.execSync("DELETE FROM casino_transactions");
    db.execSync("DELETE FROM casinos");
    for (const c of casinos) {
      db.runSync(
        `INSERT OR REPLACE INTO casinos (id, name, state, name_key, created_at) VALUES (?, ?, ?, ?, ?)`,
        [c.local_id, c.name, c.state ?? "", c.name_key, c.created_at]
      );
    }
    if (!casTxnErr && casinoTxns) {
      for (const t of casinoTxns) {
        db.runSync(
          `INSERT OR REPLACE INTO casino_transactions (id, casino_id, type, amount, date, note, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [t.local_id, t.local_casino_id, t.type, t.amount, t.date, t.note ?? "", t.created_at]
        );
      }
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
