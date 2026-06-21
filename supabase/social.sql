-- ─── Social Posts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_posts (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  session_type    TEXT NOT NULL CHECK (session_type IN ('cash', 'tournament')),
  session_name    TEXT,
  venue           TEXT,
  status          TEXT,
  amount          NUMERIC,
  amount_label    TEXT,
  is_live         BOOLEAN DEFAULT FALSE,
  content         TEXT,
  visibility      TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public posts are readable by all authenticated users"
  ON social_posts FOR SELECT
  USING (visibility = 'public' AND auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own posts"
  ON social_posts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own posts"
  ON social_posts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own posts"
  ON social_posts FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Social Follows ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_follows (
  follower_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id)
);

ALTER TABLE social_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Follows are readable by authenticated users"
  ON social_follows FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage their own follows"
  ON social_follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can unfollow"
  ON social_follows FOR DELETE
  USING (auth.uid() = follower_id);

-- ─── Social Reactions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_reactions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    UUID REFERENCES social_posts(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  emoji      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (post_id, user_id, emoji)
);

ALTER TABLE social_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reactions are readable by authenticated users"
  ON social_reactions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can add reactions"
  ON social_reactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove their own reactions"
  ON social_reactions FOR DELETE
  USING (auth.uid() = user_id);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_social_posts_user_id    ON social_posts (user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_follows_follower ON social_follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_social_reactions_post   ON social_reactions (post_id);
