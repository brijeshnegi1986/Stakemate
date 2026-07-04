CREATE TABLE IF NOT EXISTS player_notes (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  local_id   INTEGER     NOT NULL,
  name       TEXT        NOT NULL,
  styles     JSONB       NOT NULL DEFAULT '[]',
  notes      TEXT        NOT NULL DEFAULT '',
  venue      TEXT        NOT NULL DEFAULT '',
  created_at BIGINT      NOT NULL,
  updated_at BIGINT      NOT NULL,
  UNIQUE(user_id, local_id)
);

ALTER TABLE player_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner all" ON player_notes
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
