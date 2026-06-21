-- ─── Social Comments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_comments (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id    UUID REFERENCES social_posts(id) ON DELETE CASCADE NOT NULL,
  user_id    UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  content    TEXT NOT NULL CHECK (char_length(content) > 0),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE social_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Comments readable by authenticated users"
  ON social_comments FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own comments"
  ON social_comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
  ON social_comments FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_social_comments_post_id    ON social_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_comments_created_at ON social_comments(created_at);
