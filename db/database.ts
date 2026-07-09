import * as SQLite from "expo-sqlite";

export const db = SQLite.openDatabaseSync("poker.db");

export const initDB = () => {
  db.execSync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      buyIn REAL,
      cashOut REAL,
      duration REAL,
      stakes TEXT,
      state TEXT,
      venue TEXT,
      profit REAL,
      date TEXT
    );
  `);

  // Migrations — safe to run every time (ignored if column already exists)
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN startTime TEXT`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'completed'`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN pausedAt TEXT`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN totalPausedSeconds INTEGER DEFAULT 0`); } catch (_) {}

  // Tournament migrations
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN type TEXT DEFAULT 'cash'`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN tournamentName TEXT`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN entries INTEGER`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN position INTEGER`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN payout REAL`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN notes TEXT`); } catch (_) {}
  try { db.execSync(`ALTER TABLE sessions ADD COLUMN rebuys TEXT DEFAULT '[]'`); } catch (_) {}


  // Notes history (session_id = 0 means standalone note)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS notes_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,
      session_date TEXT,
      session_venue TEXT,
      session_profit REAL,
      session_type TEXT,
      raw_notes TEXT NOT NULL,
      enhanced_notes TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  try { db.execSync(`ALTER TABLE notes_history ADD COLUMN title TEXT DEFAULT ''`); } catch (_) {}
  try { db.execSync(`ALTER TABLE notes_history ADD COLUMN updated_at INTEGER DEFAULT 0`); } catch (_) {}
  try { db.execSync(`ALTER TABLE notes_history ADD COLUMN hand_analysis TEXT`); } catch (_) {}
  try { db.execSync(`ALTER TABLE notes_history ADD COLUMN metadata TEXT DEFAULT NULL`); } catch (_) {}

  // Player notes
  db.execSync(`
    CREATE TABLE IF NOT EXISTS player_notes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT    NOT NULL,
      styles     TEXT    NOT NULL DEFAULT '[]',
      notes      TEXT    NOT NULL DEFAULT '',
      venue      TEXT    NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // Scheduled tournament events (calendar)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS tournament_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      venue TEXT DEFAULT '',
      buyin TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);
  try { db.execSync(`ALTER TABLE tournament_events ADD COLUMN image_url TEXT DEFAULT ''`); } catch {}
  try { db.execSync(`ALTER TABLE tournament_events ADD COLUMN stake_deal_id TEXT DEFAULT ''`); } catch {}
  try { db.execSync(`ALTER TABLE tournament_events ADD COLUMN source TEXT DEFAULT 'custom'`); } catch {}
  try { db.execSync(`ALTER TABLE tournament_events ADD COLUMN start_time TEXT DEFAULT ''`); } catch {}

  // Settings key-value store
  db.execSync(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL DEFAULT ''
    );
  `);

  const defaults: [string, string][] = [
    ["defaultStakes", "1/2"],
    ["defaultVenue", ""],
    ["currency", "AUD"],
    ["breakReminderThreshold", "90"],
  ];
  for (const [key, value] of defaults) {
    db.runSync(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]);
  }

  // Home games (host-run multi-player bookkeeping)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS home_games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      venue TEXT DEFAULT '',
      date TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'currency',
      status TEXT NOT NULL DEFAULT 'active',
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS home_game_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      display_name TEXT NOT NULL,
      leaving_at INTEGER,
      notification_id TEXT,
      settled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
  `);
  try { db.execSync(`ALTER TABLE home_game_players ADD COLUMN settled INTEGER NOT NULL DEFAULT 0`); } catch (_) {}

  db.execSync(`
    CREATE TABLE IF NOT EXISTS home_game_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      confirmed INTEGER DEFAULT 1,
      timestamp INTEGER NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS home_game_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      payee_name TEXT DEFAULT '',
      note TEXT DEFAULT '',
      timestamp INTEGER NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS home_game_rake (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      game_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      note TEXT DEFAULT '',
      timestamp INTEGER NOT NULL
    );
  `);

  // Casino balance tracker (front money / markers held on account at a casino)
  db.execSync(`
    CREATE TABLE IF NOT EXISTS casinos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT '',
      name_key TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS casino_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      casino_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at INTEGER NOT NULL
    );
  `);
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type SessionType = "cash" | "tournament";

export type Session = {
  id: number;
  type: SessionType;
  buyIn: number;
  cashOut: number;
  profit: number;
  duration: number;
  date: string;
  venue: string;
  state: string;
  status?: "active" | "completed";
  startTime?: string;
  pausedAt?: string | null;
  totalPausedSeconds?: number;
  // cash-only
  stakes: string;
  // tournament-only
  tournamentName?: string;
  entries?: number;
  position?: number;
  payout?: number;
  rebuys?: string; // JSON array of amounts e.g. "[100, 200]"
};

// ─── CRUD — Cash ──────────────────────────────────────────────────────────────

export const addSession = (session: {
  buyIn: number;
  cashOut: number;
  duration: number | null;
  stakes: string;
  state: string;
  venue: string;
  profit: number;
  date: string;
}): number => {
  const result = db.runSync(
    `INSERT INTO sessions
       (type, buyIn, cashOut, duration, stakes, state, venue, profit, date, status)
     VALUES ('cash', ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
    [session.buyIn, session.cashOut, session.duration ?? 0,
     session.stakes, session.state, session.venue, session.profit, session.date]
  );
  return result.lastInsertRowId;
};

// ─── CRUD — Tournament ────────────────────────────────────────────────────────

export const addTournament = (t: {
  buyIn: number;
  tournamentName: string;
  entries: number;
  position: number;
  payout: number;
  duration: number;
  venue: string;
  state: string;
  date: string;
}) => {
  const profit = t.payout - t.buyIn;
  const r = db.runSync(
    `INSERT INTO sessions
       (type, buyIn, cashOut, payout, profit, duration, venue, state,
        tournamentName, entries, position, date, status)
     VALUES ('tournament', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
    [t.buyIn, t.payout, t.payout, profit, t.duration,
     t.venue, t.state, t.tournamentName, t.entries, t.position, t.date]
  );
  return r.lastInsertRowId;
};

// ─── Queries ─────────────────────────────────────────────────────────────────

const COMPLETED = `(status = 'completed' OR status IS NULL)`;

export const getSessions = (type?: SessionType): Session[] => {
  const typeClause = type ? `AND type = '${type}'` : "";
  return db.getAllSync(
    `SELECT * FROM sessions WHERE ${COMPLETED} ${typeClause} ORDER BY id DESC`
  ) as Session[];
};

export const getStats = () => {
  const totalProfit = db.getFirstSync(
    `SELECT SUM(profit) as total FROM sessions WHERE ${COMPLETED}`
  ) as any;
  const totalHours = db.getFirstSync(
    `SELECT SUM(duration) as total FROM sessions WHERE ${COMPLETED}`
  ) as any;
  return {
    totalProfit: totalProfit?.total ?? 0,
    totalHours: totalHours?.total ?? 0,
  };
};

export const getTournamentStats = () => {
  const rows = db.getAllSync(
    `SELECT buyIn, profit, payout FROM sessions WHERE type = 'tournament' AND ${COMPLETED}`
  ) as { buyIn: number; profit: number; payout: number }[];

  if (!rows.length) return null;

  const totalBuyIn  = rows.reduce((s, r) => s + (r.buyIn  ?? 0), 0);
  const totalProfit = rows.reduce((s, r) => s + (r.profit ?? 0), 0);
  const itm         = rows.filter((r) => (r.payout ?? 0) > 0).length;

  return {
    count:      rows.length,
    totalBuyIn,
    totalProfit,
    roi:        totalBuyIn > 0 ? (totalProfit / totalBuyIn) * 100 : 0,
    itmPct:     rows.length  > 0 ? (itm / rows.length) * 100 : 0,
  };
};

// ─── Update ───────────────────────────────────────────────────────────────────

export const updateSession = (
  id: number,
  data: {
    type: SessionType;
    buyIn: number;
    profit: number;
    duration: number;
    date: string;
    venue: string;
    state: string;
    // cash
    cashOut?: number;
    stakes?: string;
    // tournament
    tournamentName?: string;
    entries?: number;
    position?: number;
    payout?: number;
  }
) => {
  if (data.type === "tournament") {
    db.runSync(
      `UPDATE sessions
       SET type='tournament', buyIn=?, payout=?, cashOut=?, profit=?, duration=?, date=?,
           venue=?, state=?, tournamentName=?, entries=?, position=?
       WHERE id=?`,
      [data.buyIn, data.payout ?? 0, data.payout ?? 0, data.profit,
       data.duration, data.date, data.venue, data.state,
       data.tournamentName ?? "", data.entries ?? 0, data.position ?? 0, id]
    );
  } else {
    db.runSync(
      `UPDATE sessions
       SET type='cash', stakes=?, venue=?, profit=?, duration=?, date=?,
           buyIn=?, cashOut=?, state=?
       WHERE id=?`,
      [data.stakes ?? "", data.venue, data.profit, data.duration, data.date,
       data.buyIn, data.cashOut ?? 0, data.state, id]
    );
  }
};

export const parseRebuys = (session: { rebuys?: string }): number[] => {
  try { return JSON.parse(session.rebuys ?? "[]"); } catch { return []; }
};

export const getRebuysTotal = (session: { rebuys?: string }): number =>
  parseRebuys(session).reduce((s, r) => s + r, 0);

export const addRebuy = (id: number, amount: number): void => {
  const row = db.getFirstSync(`SELECT rebuys FROM sessions WHERE id = ?`, [id]) as { rebuys?: string } | null;
  const existing = parseRebuys({ rebuys: row?.rebuys });
  db.runSync(
    `UPDATE sessions SET rebuys = ? WHERE id = ?`,
    [JSON.stringify([...existing, amount]), id]
  );
};

export const deleteSession = (id: number) => {
  db.runSync("DELETE FROM sessions WHERE id = ?", [id]);
};

// ─── Live — Cash ──────────────────────────────────────────────────────────────

export const startLiveSession = (data: {
  buyIn: number;
  stakes: string;
  state: string;
  venue: string;
  startTime: string;
}): number => {
  const result = db.runSync(
    `INSERT INTO sessions
       (type, buyIn, cashOut, duration, stakes, state, venue, profit, date, startTime, status)
     VALUES ('cash', ?, 0, 0, ?, ?, ?, 0, ?, ?, 'active')`,
    [data.buyIn, data.stakes, data.state, data.venue, data.startTime, data.startTime]
  );
  return result.lastInsertRowId;
};

export const endLiveSession = (
  id: number,
  cashOut: number,
  profit: number,
  durationHours: number
) => {
  db.runSync(
    `UPDATE sessions SET cashOut=?, profit=?, duration=?, status='completed' WHERE id=?`,
    [cashOut, profit, durationHours, id]
  );
};

// ─── Live — Tournament ────────────────────────────────────────────────────────

export const startLiveTournament = (data: {
  buyIn: number;
  tournamentName: string;
  entries: number;
  venue: string;
  state: string;
  startTime: string;
}): number => {
  const result = db.runSync(
    `INSERT INTO sessions
       (type, buyIn, cashOut, payout, profit, duration, venue, state,
        tournamentName, entries, date, startTime, status)
     VALUES ('tournament', ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, ?, 'active')`,
    [data.buyIn, data.venue, data.state,
     data.tournamentName, data.entries, data.startTime, data.startTime]
  );
  return result.lastInsertRowId;
};

export const endLiveTournament = (
  id: number,
  position: number,
  payout: number,
  durationHours: number
) => {
  const row = db.getFirstSync(
    `SELECT buyIn, rebuys FROM sessions WHERE id = ?`, [id]
  ) as { buyIn: number; rebuys?: string } | null;
  const rebuysTotal = parseRebuys({ rebuys: row?.rebuys }).reduce((s, r) => s + r, 0);
  const profit = payout - (row?.buyIn ?? 0) - rebuysTotal;
  db.runSync(
    `UPDATE sessions
     SET position=?, payout=?, cashOut=?, profit=?, duration=?, status='completed'
     WHERE id=?`,
    [position, payout, payout, profit, durationHours, id]
  );
};

// ─── Live — Shared ────────────────────────────────────────────────────────────

export const getActiveSession = (): Session | null => {
  return db.getFirstSync(
    `SELECT * FROM sessions WHERE status = 'active' LIMIT 1`
  ) as Session | null;
};

export const abandonLiveSession = (id: number) => {
  db.runSync(`DELETE FROM sessions WHERE id = ?`, [id]);
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export const getSetting = (key: string): string | null => {
  const row = db.getFirstSync(
    `SELECT value FROM settings WHERE key = ?`, [key]
  ) as { value: string } | null;
  return row?.value ?? null;
};

export const setSetting = (key: string, value: string): void => {
  db.runSync(
    `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, value]
  );
};

export const clearAllSessions = (): void => {
  db.runSync(`DELETE FROM sessions WHERE ${COMPLETED}`);
};

// ─── Dashboard personalization ───────────────────────────────────────────────

export type DashboardSection =
  | "quickActions" | "nextUp" | "stakes" | "goals" | "recentSessions" | "handNotes" | "promotions" | "handReview" | "todaysTournaments";

export const getDashboardHiddenSections = (): DashboardSection[] => {
  try { return JSON.parse(getSetting("dashboardHiddenSections") ?? "[]"); } catch { return []; }
};

export const setDashboardSectionVisible = (section: DashboardSection, visible: boolean): void => {
  const hidden = new Set(getDashboardHiddenSections());
  if (visible) hidden.delete(section); else hidden.add(section);
  setSetting("dashboardHiddenSections", JSON.stringify([...hidden]));
};


// ─── Notes History ────────────────────────────────────────────────────────────

// Structured poker hand metadata — stored as JSON in the metadata column
export type HandMetadata = {
  stakes?: string;      // e.g. "1/2"
  betType?: string;     // e.g. "SRP" | "3BP" | "4BP" | "5BP"
  heroPos?: string;     // e.g. "SB" | "BTN" | "CO" | "HJ" | "MP" | "EP" | "UTG" | "BB"
  vsPos?: string;       // e.g. "OOP" | "IP" | "BTN"
  holeCards?: string[]; // e.g. ["8d","8h"]
  boardCards?: string[]; // e.g. ["Ts","7c","2c","5s","8c"]
};

export type NoteEntry = {
  id: number;
  session_id: number;      // 0 = standalone note
  session_date: string;
  session_venue: string;
  session_profit: number;
  session_type: string;    // "cash" | "tournament" | "standalone"
  raw_notes: string;
  enhanced_notes: string | null;
  title: string | null;
  created_at: number;
  updated_at: number;
  hand_analysis: string | null;  // JSON string of HandAnalysis
  metadata: string | null;       // JSON string of HandMetadata
};

export const saveNoteEntry = (data: {
  sessionId: number;
  sessionDate: string;
  sessionVenue: string;
  sessionProfit: number;
  sessionType: string;
  rawNotes: string;
  enhancedNotes: string | null;
  title?: string;
  metadata?: HandMetadata | null;
}): number => {
  const now = Date.now();
  const result = db.runSync(
    `INSERT INTO notes_history
       (session_id, session_date, session_venue, session_profit, session_type, raw_notes, enhanced_notes, title, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.sessionId, data.sessionDate, data.sessionVenue, data.sessionProfit,
     data.sessionType, data.rawNotes, data.enhancedNotes, data.title ?? "",
     data.metadata ? JSON.stringify(data.metadata) : null, now, now]
  );
  return result.lastInsertRowId;
};

export const updateNoteEntry = (id: number, data: {
  title?: string;
  rawNotes?: string;
  enhancedNotes?: string | null;
  handAnalysis?: string | null;
  metadata?: HandMetadata | null;
}): void => {
  const now = Date.now();
  db.runSync(
    `UPDATE notes_history
     SET title = COALESCE(?, title),
         raw_notes = COALESCE(?, raw_notes),
         enhanced_notes = COALESCE(?, enhanced_notes),
         hand_analysis = COALESCE(?, hand_analysis),
         metadata = COALESCE(?, metadata),
         updated_at = ?
     WHERE id = ?`,
    [data.title ?? null, data.rawNotes ?? null, data.enhancedNotes ?? null,
     data.handAnalysis ?? null,
     data.metadata !== undefined ? (data.metadata ? JSON.stringify(data.metadata) : null) : null,
     now, id]
  );
};

export const getTotalSessionCount = (): number => {
  const row = db.getFirstSync(
    `SELECT COUNT(*) as count FROM sessions WHERE ${COMPLETED}`
  ) as { count: number } | null;
  return row?.count ?? 0;
};

export const getNoteHistory = (): NoteEntry[] =>
  db.getAllSync(`SELECT * FROM notes_history ORDER BY created_at DESC`) as NoteEntry[];

export const deleteNoteEntry = (id: number): void => {
  db.runSync(`DELETE FROM notes_history WHERE id = ?`, [id]);
};

// ─── Tournament Events (Calendar) ────────────────────────────────────────────

export type TournamentEvent = {
  id: number;
  name: string;
  date: string;       // YYYY-MM-DD
  start_time?: string; // HH:MM (24h), optional
  venue: string;
  buyin: string;
  notes: string;
  image_url?: string;
  stake_deal_id?: string;
  source?: "custom" | "directory";
  created_at: number;
};

export const addTournamentEvent = (event: Omit<TournamentEvent, "id" | "created_at">): number => {
  const result = db.runSync(
    `INSERT INTO tournament_events (name, date, start_time, venue, buyin, notes, image_url, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.name, event.date, event.start_time ?? "", event.venue, event.buyin, event.notes, event.image_url ?? "", event.source ?? "custom", Date.now()]
  );
  return result.lastInsertRowId;
};

export const getTournamentEvents = (): TournamentEvent[] =>
  db.getAllSync(
    `SELECT * FROM tournament_events
     ORDER BY date ASC,
              CASE WHEN start_time IS NULL OR start_time = '' THEN 1 ELSE 0 END ASC,
              start_time ASC`
  ) as TournamentEvent[];

export const deleteTournamentEvent = (id: number): void => {
  db.runSync(`DELETE FROM tournament_events WHERE id = ?`, [id]);
};

export const setTournamentStakeDeal = (id: number, dealId: string): void => {
  db.runSync(`UPDATE tournament_events SET stake_deal_id = ? WHERE id = ?`, [dealId, id]);
};

// Removes past tournament events from local storage.
// Events with a stake deal attached lose no data by being pruned — the deal itself
// (tournament_name/venue/date) lives independently in Supabase's stake_deals table
// and keeps surfacing in the seller's/buyers' marketplace views — so those are
// pruned as soon as they're past. Events with no deal get a grace window so users
// can still log a session/notes against a tournament that just ended.
export const pruneExpiredTournamentEvents = (graceDays = 2): number[] => {
  const todayYMD = new Date().toISOString().slice(0, 10);
  const grace = new Date();
  grace.setDate(grace.getDate() - graceDays);
  const graceYMD = grace.toISOString().slice(0, 10);

  const rows = db.getAllSync(
    `SELECT id FROM tournament_events
     WHERE (stake_deal_id IS NOT NULL AND stake_deal_id != '' AND date < ?)
        OR ((stake_deal_id IS NULL OR stake_deal_id = '') AND date < ?)`,
    [todayYMD, graceYMD]
  ) as { id: number }[];

  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  db.runSync(`DELETE FROM tournament_events WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
  return ids;
};

// ─── Player Notes ─────────────────────────────────────────────────────────────

export type PlayerNote = {
  id: number;
  name: string;
  styles: string[];   // stored as JSON
  notes: string;
  venue: string;
  created_at: number;
  updated_at: number;
};

export const addPlayerNote = (note: Omit<PlayerNote, "id" | "created_at" | "updated_at">): number => {
  const now = Date.now();
  const result = db.runSync(
    `INSERT INTO player_notes (name, styles, notes, venue, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`,
    [note.name.trim(), JSON.stringify(note.styles), note.notes.trim(), note.venue.trim(), now, now]
  );
  return result.lastInsertRowId;
};

export const updatePlayerNote = (id: number, note: Omit<PlayerNote, "id" | "created_at" | "updated_at">): void => {
  db.runSync(
    `UPDATE player_notes SET name = ?, styles = ?, notes = ?, venue = ?, updated_at = ? WHERE id = ?`,
    [note.name.trim(), JSON.stringify(note.styles), note.notes.trim(), note.venue.trim(), Date.now(), id]
  );
};

export const deletePlayerNote = (id: number): void => {
  db.runSync(`DELETE FROM player_notes WHERE id = ?`, [id]);
};

export const getPlayerNotes = (): PlayerNote[] => {
  const rows = db.getAllSync(`SELECT * FROM player_notes ORDER BY updated_at DESC`) as any[];
  return rows.map((r) => ({ ...r, styles: JSON.parse(r.styles || "[]") }));
};

// ─── Home Games ───────────────────────────────────────────────────────────────

export type HomeGameUnit = "currency" | "chips";
export type HomeGameStatus = "active" | "completed";
export type HomeGameTxnType = "buy_in" | "rebuy" | "cash_out" | "adjustment";
export type HomeGameExpenseCategory = "food" | "transport" | "drinks" | "dealer" | "other";

export type HomeGame = {
  id: number;
  name: string;
  venue: string;
  date: string;
  unit: HomeGameUnit;
  status: HomeGameStatus;
  created_at: number;
  completed_at: number | null;
};

export type HomeGamePlayer = {
  id: number;
  game_id: number;
  display_name: string;
  leaving_at: number | null;
  notification_id: string | null;
  settled: number;
  created_at: number;
};

export type HomeGameTransaction = {
  id: number;
  game_id: number;
  player_id: number;
  type: HomeGameTxnType;
  amount: number;
  note: string;
  confirmed: number;
  timestamp: number;
};

export type HomeGameExpense = {
  id: number;
  game_id: number;
  category: HomeGameExpenseCategory;
  amount: number;
  payee_name: string;
  note: string;
  timestamp: number;
};

export type HomeGameRake = {
  id: number;
  game_id: number;
  amount: number;
  note: string;
  timestamp: number;
};

export type HomeGamePlayerTotals = {
  playerId: number;
  name: string;
  buyIn: number;
  cashOut: number;
  net: number;
};

export const startHomeGame = (data: {
  name: string;
  venue: string;
  date: string;
  unit: HomeGameUnit;
}): number => {
  const result = db.runSync(
    `INSERT INTO home_games (name, venue, date, unit, status, created_at)
     VALUES (?, ?, ?, ?, 'active', ?)`,
    [data.name.trim(), data.venue.trim(), data.date, data.unit, Date.now()]
  );
  return result.lastInsertRowId;
};

export const getActiveHomeGame = (): HomeGame | null =>
  db.getFirstSync(`SELECT * FROM home_games WHERE status = 'active' LIMIT 1`) as HomeGame | null;

export const getHomeGames = (): HomeGame[] =>
  db.getAllSync(`SELECT * FROM home_games ORDER BY date DESC, id DESC`) as HomeGame[];

export const getHomeGame = (id: number): HomeGame | null =>
  db.getFirstSync(`SELECT * FROM home_games WHERE id = ?`, [id]) as HomeGame | null;

export const endHomeGame = (id: number): void => {
  db.runSync(
    `UPDATE home_games SET status = 'completed', completed_at = ? WHERE id = ?`,
    [Date.now(), id]
  );
};

export const deleteHomeGame = (id: number): void => {
  db.runSync(`DELETE FROM home_game_transactions WHERE game_id = ?`, [id]);
  db.runSync(`DELETE FROM home_game_expenses WHERE game_id = ?`, [id]);
  db.runSync(`DELETE FROM home_game_rake WHERE game_id = ?`, [id]);
  db.runSync(`DELETE FROM home_game_players WHERE game_id = ?`, [id]);
  db.runSync(`DELETE FROM home_games WHERE id = ?`, [id]);
};

export const addHomeGamePlayer = (gameId: number, displayName: string): number => {
  const result = db.runSync(
    `INSERT INTO home_game_players (game_id, display_name, created_at) VALUES (?, ?, ?)`,
    [gameId, displayName.trim(), Date.now()]
  );
  return result.lastInsertRowId;
};

export const getHomeGamePlayers = (gameId: number): HomeGamePlayer[] =>
  db.getAllSync(
    `SELECT * FROM home_game_players WHERE game_id = ? ORDER BY id ASC`, [gameId]
  ) as HomeGamePlayer[];

export const renameHomeGamePlayer = (id: number, displayName: string): void => {
  db.runSync(`UPDATE home_game_players SET display_name = ? WHERE id = ?`, [displayName.trim(), id]);
};

export const deleteHomeGamePlayer = (id: number): void => {
  db.runSync(`DELETE FROM home_game_transactions WHERE player_id = ?`, [id]);
  db.runSync(`DELETE FROM home_game_players WHERE id = ?`, [id]);
};

export const setPlayerLeavingTimer = (id: number, leavingAt: number, notificationId: string): void => {
  db.runSync(
    `UPDATE home_game_players SET leaving_at = ?, notification_id = ? WHERE id = ?`,
    [leavingAt, notificationId, id]
  );
};

export const clearPlayerLeavingTimer = (id: number): void => {
  db.runSync(
    `UPDATE home_game_players SET leaving_at = NULL, notification_id = NULL WHERE id = ?`,
    [id]
  );
};

export const setPlayerSettled = (id: number, settled: boolean): void => {
  db.runSync(`UPDATE home_game_players SET settled = ? WHERE id = ?`, [settled ? 1 : 0, id]);
};

export const addHomeGameTransaction = (
  gameId: number,
  playerId: number,
  type: HomeGameTxnType,
  amount: number,
  note: string = ""
): number => {
  const result = db.runSync(
    `INSERT INTO home_game_transactions (game_id, player_id, type, amount, note, confirmed, timestamp)
     VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [gameId, playerId, type, amount, note, Date.now()]
  );
  return result.lastInsertRowId;
};

export const addHomeGameAdjustment = (
  gameId: number,
  playerId: number,
  type: HomeGameTxnType,
  amount: number,
  note: string,
  confirmed: boolean
): number => {
  const result = db.runSync(
    `INSERT INTO home_game_transactions (game_id, player_id, type, amount, note, confirmed, timestamp)
     VALUES (?, ?, 'adjustment', ?, ?, ?, ?)`,
    [gameId, playerId, amount, note, confirmed ? 1 : 0, Date.now()]
  );
  return result.lastInsertRowId;
};

export const getHomeGameTransactions = (gameId: number): HomeGameTransaction[] =>
  db.getAllSync(
    `SELECT * FROM home_game_transactions WHERE game_id = ? ORDER BY timestamp ASC`, [gameId]
  ) as HomeGameTransaction[];

export const getPlayerTotals = (gameId: number): HomeGamePlayerTotals[] => {
  const rows = db.getAllSync(
    `SELECT
       p.id as playerId,
       p.display_name as name,
       COALESCE(SUM(CASE WHEN t.type IN ('buy_in','rebuy') THEN t.amount ELSE 0 END), 0) as buyIn,
       COALESCE(SUM(CASE WHEN t.type = 'cash_out' THEN t.amount ELSE 0 END), 0) as cashOut,
       COALESCE(SUM(CASE WHEN t.type = 'adjustment' THEN t.amount ELSE 0 END), 0) as adjustment
     FROM home_game_players p
     LEFT JOIN home_game_transactions t ON t.player_id = p.id
     WHERE p.game_id = ?
     GROUP BY p.id
     ORDER BY p.id ASC`,
    [gameId]
  ) as (HomeGamePlayerTotals & { adjustment: number })[];

  return rows.map((r) => ({
    playerId: r.playerId,
    name: r.name,
    buyIn: r.buyIn,
    cashOut: r.cashOut,
    net: r.cashOut - r.buyIn + r.adjustment,
  }));
};

export const addHomeGameExpense = (
  gameId: number,
  category: HomeGameExpenseCategory,
  amount: number,
  payeeName: string = "",
  note: string = ""
): number => {
  const result = db.runSync(
    `INSERT INTO home_game_expenses (game_id, category, amount, payee_name, note, timestamp)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [gameId, category, amount, payeeName.trim(), note, Date.now()]
  );
  return result.lastInsertRowId;
};

export const getHomeGameExpenses = (gameId: number): HomeGameExpense[] =>
  db.getAllSync(
    `SELECT * FROM home_game_expenses WHERE game_id = ? ORDER BY timestamp ASC`, [gameId]
  ) as HomeGameExpense[];

export const getHomeGameExpensesTotal = (gameId: number): number => {
  const row = db.getFirstSync(
    `SELECT SUM(amount) as total FROM home_game_expenses WHERE game_id = ?`, [gameId]
  ) as { total: number | null } | null;
  return row?.total ?? 0;
};

export const addHomeGameRake = (gameId: number, amount: number, note: string = ""): number => {
  const result = db.runSync(
    `INSERT INTO home_game_rake (game_id, amount, note, timestamp) VALUES (?, ?, ?, ?)`,
    [gameId, amount, note, Date.now()]
  );
  return result.lastInsertRowId;
};

export const getHomeGameRakeTotal = (gameId: number): number => {
  const row = db.getFirstSync(
    `SELECT SUM(amount) as total FROM home_game_rake WHERE game_id = ?`, [gameId]
  ) as { total: number | null } | null;
  return row?.total ?? 0;
};

export const getHomeGameRakeEntries = (gameId: number): HomeGameRake[] =>
  db.getAllSync(
    `SELECT * FROM home_game_rake WHERE game_id = ? ORDER BY timestamp ASC`, [gameId]
  ) as HomeGameRake[];

// ─── Casino Balance ─────────────────────────────────────────────────────────────

export type CasinoTxnType = "deposit" | "withdraw";

export type Casino = {
  id: number;
  name: string;
  state: string;
  name_key: string;
  created_at: number;
};

export type CasinoWithBalance = Casino & { balance: number };

export type CasinoTransaction = {
  id: number;
  casino_id: number;
  type: CasinoTxnType;
  amount: number;
  date: string;
  note: string;
  created_at: number;
};

const casinoNameKey = (name: string, state: string): string =>
  `${name.trim().toLowerCase()}|${state.trim().toLowerCase()}`;

export const findOrCreateCasino = (name: string, state: string): number => {
  const key = casinoNameKey(name, state);
  const existing = db.getFirstSync(
    `SELECT id FROM casinos WHERE name_key = ?`, [key]
  ) as { id: number } | null;
  if (existing) return existing.id;

  const result = db.runSync(
    `INSERT INTO casinos (name, state, name_key, created_at) VALUES (?, ?, ?, ?)`,
    [name.trim(), state.trim(), key, Date.now()]
  );
  return result.lastInsertRowId;
};

export const getCasino = (id: number): Casino | null =>
  db.getFirstSync(`SELECT * FROM casinos WHERE id = ?`, [id]) as Casino | null;

export const getCasinoBalance = (casinoId: number): number => {
  const row = db.getFirstSync(
    `SELECT SUM(CASE WHEN type = 'deposit' THEN amount ELSE -amount END) as balance
     FROM casino_transactions WHERE casino_id = ?`,
    [casinoId]
  ) as { balance: number | null } | null;
  return row?.balance ?? 0;
};

export const getCasinos = (): CasinoWithBalance[] => {
  const rows = db.getAllSync(
    `SELECT c.*,
       COALESCE(SUM(CASE WHEN t.type = 'deposit' THEN t.amount ELSE -t.amount END), 0) as balance,
       MAX(t.created_at) as last_activity
     FROM casinos c
     LEFT JOIN casino_transactions t ON t.casino_id = c.id
     GROUP BY c.id
     ORDER BY COALESCE(last_activity, c.created_at) DESC`
  ) as (CasinoWithBalance & { last_activity: number | null })[];
  return rows.map(({ last_activity, ...c }) => c);
};

export const addCasinoTransaction = (
  casinoId: number,
  type: CasinoTxnType,
  amount: number,
  date: string,
  note: string = ""
): number => {
  const result = db.runSync(
    `INSERT INTO casino_transactions (casino_id, type, amount, date, note, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [casinoId, type, amount, date, note, Date.now()]
  );
  return result.lastInsertRowId;
};

export const getCasinoTransactions = (casinoId: number): CasinoTransaction[] =>
  db.getAllSync(
    `SELECT * FROM casino_transactions WHERE casino_id = ? ORDER BY date DESC, created_at DESC`,
    [casinoId]
  ) as CasinoTransaction[];

export const deleteCasinoTransaction = (id: number): void => {
  db.runSync(`DELETE FROM casino_transactions WHERE id = ?`, [id]);
};

export const deleteCasino = (id: number): void => {
  db.runSync(`DELETE FROM casino_transactions WHERE casino_id = ?`, [id]);
  db.runSync(`DELETE FROM casinos WHERE id = ?`, [id]);
};

// Auto-initialize on import so getSetting is always safe to call
initDB();
