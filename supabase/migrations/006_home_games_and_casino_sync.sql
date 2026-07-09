-- Cloud sync tables for Home Games and Casino Balance (local-only until now).
-- Child rows reference their parent by (user_id, local_*_id) rather than a real
-- foreign key, since the parent is identified locally by a per-table SQLite
-- autoincrement id, not by this table's UUID primary key.

CREATE TABLE IF NOT EXISTS home_games (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id      INTEGER NOT NULL,
  name          TEXT    NOT NULL,
  venue         TEXT    NOT NULL DEFAULT '',
  date          TEXT    NOT NULL,
  unit          TEXT    NOT NULL DEFAULT 'currency',
  status        TEXT    NOT NULL DEFAULT 'active',
  created_at    BIGINT  NOT NULL,
  completed_at  BIGINT,
  UNIQUE(user_id, local_id)
);

CREATE TABLE IF NOT EXISTS home_game_players (
  id               UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id         INTEGER NOT NULL,
  local_game_id    INTEGER NOT NULL,
  display_name     TEXT    NOT NULL,
  leaving_at       BIGINT,
  notification_id  TEXT,
  settled          BOOLEAN NOT NULL DEFAULT false,
  created_at       BIGINT  NOT NULL,
  UNIQUE(user_id, local_id)
);

CREATE TABLE IF NOT EXISTS home_game_transactions (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id          INTEGER NOT NULL,
  local_game_id     INTEGER NOT NULL,
  local_player_id   INTEGER NOT NULL,
  type              TEXT    NOT NULL,
  amount            NUMERIC NOT NULL,
  note              TEXT    DEFAULT '',
  confirmed         BOOLEAN NOT NULL DEFAULT true,
  timestamp         BIGINT  NOT NULL,
  UNIQUE(user_id, local_id)
);

CREATE TABLE IF NOT EXISTS home_game_expenses (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id       INTEGER NOT NULL,
  local_game_id  INTEGER NOT NULL,
  category       TEXT    NOT NULL,
  amount         NUMERIC NOT NULL,
  payee_name     TEXT    DEFAULT '',
  note           TEXT    DEFAULT '',
  timestamp      BIGINT  NOT NULL,
  UNIQUE(user_id, local_id)
);

CREATE TABLE IF NOT EXISTS home_game_rake (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id       INTEGER NOT NULL,
  local_game_id  INTEGER NOT NULL,
  amount         NUMERIC NOT NULL,
  note           TEXT    DEFAULT '',
  timestamp      BIGINT  NOT NULL,
  UNIQUE(user_id, local_id)
);

CREATE TABLE IF NOT EXISTS casinos (
  id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id    INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  state       TEXT    NOT NULL DEFAULT '',
  name_key    TEXT    NOT NULL,
  created_at  BIGINT  NOT NULL,
  UNIQUE(user_id, local_id)
);

CREATE TABLE IF NOT EXISTS casino_transactions (
  id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id          INTEGER NOT NULL,
  local_casino_id   INTEGER NOT NULL,
  type              TEXT    NOT NULL,
  amount            NUMERIC NOT NULL,
  date              TEXT    NOT NULL,
  note              TEXT    DEFAULT '',
  created_at        BIGINT  NOT NULL,
  UNIQUE(user_id, local_id)
);

ALTER TABLE home_games             ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_game_players      ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_game_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_game_expenses     ENABLE ROW LEVEL SECURITY;
ALTER TABLE home_game_rake         ENABLE ROW LEVEL SECURITY;
ALTER TABLE casinos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE casino_transactions    ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner all" ON home_games
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON home_game_players
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON home_game_transactions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON home_game_expenses
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON home_game_rake
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON casinos
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner all" ON casino_transactions
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
