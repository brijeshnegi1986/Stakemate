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
  notes?: string;
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
}) => {
  db.runSync(
    `INSERT INTO sessions
       (type, buyIn, cashOut, duration, stakes, state, venue, profit, date, status)
     VALUES ('cash', ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
    [session.buyIn, session.cashOut, session.duration ?? 0,
     session.stakes, session.state, session.venue, session.profit, session.date]
  );
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
  notes: string;
  date: string;
}) => {
  const profit = t.payout - t.buyIn;
  const r = db.runSync(
    `INSERT INTO sessions
       (type, buyIn, cashOut, payout, profit, duration, venue, state,
        tournamentName, entries, position, notes, date, status)
     VALUES ('tournament', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
    [t.buyIn, t.payout, t.payout, profit, t.duration,
     t.venue, t.state, t.tournamentName, t.entries, t.position, t.notes, t.date]
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
    notes?: string;
  }
) => {
  if (data.type === "tournament") {
    db.runSync(
      `UPDATE sessions
       SET type='tournament', buyIn=?, payout=?, cashOut=?, profit=?, duration=?, date=?,
           venue=?, state=?, tournamentName=?, entries=?, position=?, notes=?
       WHERE id=?`,
      [data.buyIn, data.payout ?? 0, data.payout ?? 0, data.profit,
       data.duration, data.date, data.venue, data.state,
       data.tournamentName ?? "", data.entries ?? 0, data.position ?? 0,
       data.notes ?? "", id]
    );
  } else {
    db.runSync(
      `UPDATE sessions
       SET type='cash', stakes=?, venue=?, profit=?, duration=?, date=?,
           buyIn=?, cashOut=?, state=?, notes=?
       WHERE id=?`,
      [data.stakes ?? "", data.venue, data.profit, data.duration, data.date,
       data.buyIn, data.cashOut ?? 0, data.state, data.notes ?? "", id]
    );
  }
};

export const saveNotes = (id: number, notes: string): void => {
  db.runSync(`UPDATE sessions SET notes = ? WHERE id = ?`, [notes, id]);
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
}): void => {
  const now = Date.now();
  db.runSync(
    `INSERT INTO notes_history
       (session_id, session_date, session_venue, session_profit, session_type, raw_notes, enhanced_notes, title, metadata, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.sessionId, data.sessionDate, data.sessionVenue, data.sessionProfit,
     data.sessionType, data.rawNotes, data.enhancedNotes, data.title ?? "",
     data.metadata ? JSON.stringify(data.metadata) : null, now, now]
  );
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
  date: string; // YYYY-MM-DD
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
    `INSERT INTO tournament_events (name, date, venue, buyin, notes, image_url, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.name, event.date, event.venue, event.buyin, event.notes, event.image_url ?? "", event.source ?? "custom", Date.now()]
  );
  return result.lastInsertRowId;
};

export const getTournamentEvents = (): TournamentEvent[] =>
  db.getAllSync(`SELECT * FROM tournament_events ORDER BY date ASC`) as TournamentEvent[];

export const deleteTournamentEvent = (id: number): void => {
  db.runSync(`DELETE FROM tournament_events WHERE id = ?`, [id]);
};

export const setTournamentStakeDeal = (id: number, dealId: string): void => {
  db.runSync(`UPDATE tournament_events SET stake_deal_id = ? WHERE id = ?`, [dealId, id]);
};

// Auto-initialize on import so getSetting is always safe to call
initDB();
