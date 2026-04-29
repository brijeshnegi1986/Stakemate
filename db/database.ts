import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("poker.db");

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
  db.runSync(
    `INSERT INTO sessions
       (type, buyIn, cashOut, payout, profit, duration, venue, state,
        tournamentName, entries, position, notes, date, status)
     VALUES ('tournament', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')`,
    [t.buyIn, t.payout, t.payout, profit, t.duration,
     t.venue, t.state, t.tournamentName, t.entries, t.position, t.notes, t.date]
  );
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
           buyIn=?, cashOut=?, state=?
       WHERE id=?`,
      [data.stakes ?? "", data.venue, data.profit, data.duration, data.date,
       data.buyIn, data.cashOut ?? 0, data.state, id]
    );
  }
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
    `SELECT buyIn FROM sessions WHERE id = ?`, [id]
  ) as { buyIn: number } | null;
  const profit = payout - (row?.buyIn ?? 0);
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

// Auto-initialize on import so getSetting is always safe to call
initDB();
