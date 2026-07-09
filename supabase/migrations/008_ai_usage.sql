-- Tracks per-user, per-month usage of metered AI features (e.g. AI Hand Review)
-- so the backend can enforce a monthly cap for Pro subscribers.
-- Written only by the backend (service role, bypasses RLS) — clients can read
-- their own usage to show "X of N used this month" but never write it directly.
CREATE TABLE IF NOT EXISTS ai_usage (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature    TEXT NOT NULL,
  period     TEXT NOT NULL, -- 'YYYY-MM', UTC calendar month
  count      INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, feature, period)
);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read" ON ai_usage
  FOR SELECT
  USING (auth.uid() = user_id);
