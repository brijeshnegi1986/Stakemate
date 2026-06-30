-- Add result + settlement columns to stake_deals
ALTER TABLE stake_deals
  ADD COLUMN IF NOT EXISTS result_type      TEXT CHECK (result_type IN ('cashed', 'busted')),
  ADD COLUMN IF NOT EXISTS result_cash      NUMERIC DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_settled       BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reentry_covered  TEXT DEFAULT 'ask' CHECK (reentry_covered IN ('yes', 'no', 'ask'));

-- Make-up (MUA) balance per staker↔player relationship
CREATE TABLE IF NOT EXISTS staking_mua (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staker_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  balance    NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (staker_id, player_id)
);

ALTER TABLE staking_mua ENABLE ROW LEVEL SECURITY;

-- Staker or player can read their own MUA record
CREATE POLICY "mua_select" ON staking_mua
  FOR SELECT USING (staker_id = auth.uid() OR player_id = auth.uid());

-- Only the service role (Edge Functions) can write MUA records
CREATE POLICY "mua_service_write" ON staking_mua
  FOR ALL USING (auth.role() = 'service_role');
