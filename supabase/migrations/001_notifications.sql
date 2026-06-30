-- ─── Notifications table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id    UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL,
  title       TEXT        NOT NULL,
  body        TEXT        NOT NULL,
  data        JSONB       NOT NULL DEFAULT '{}',
  read        BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON notifications(user_id, created_at DESC);

-- Allow users to read/update only their own notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner read" ON notifications
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "owner update" ON notifications
  FOR UPDATE USING (auth.uid() = user_id);

-- Service role (edge functions / triggers) can insert freely
CREATE POLICY "service insert" ON notifications
  FOR INSERT WITH CHECK (TRUE);

-- ─── Helper: resolve display name from profiles ─────────────────────────────

CREATE OR REPLACE FUNCTION _notif_display_name(p_id UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(display_name, username, 'Someone')
  FROM profiles WHERE id = p_id;
$$;

-- ─── Trigger: new stake claim → notify deal owner ───────────────────────────

CREATE OR REPLACE FUNCTION notify_on_stake_claim_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_owner_id        UUID;
  v_tournament_name TEXT;
  v_actor_name      TEXT;
BEGIN
  SELECT user_id, tournament_name
    INTO v_owner_id, v_tournament_name
    FROM stake_deals WHERE id = NEW.deal_id;

  -- Skip if buyer is the deal owner
  IF v_owner_id IS NULL OR v_owner_id = NEW.buyer_id THEN
    RETURN NEW;
  END IF;

  v_actor_name := _notif_display_name(NEW.buyer_id);

  INSERT INTO notifications (user_id, actor_id, type, title, body, data)
  VALUES (
    v_owner_id,
    NEW.buyer_id,
    'stake_claim_pending',
    'New Stake Request',
    v_actor_name || ' wants ' || NEW.percent_claimed || '% of your action in ' || COALESCE(v_tournament_name, 'your tournament'),
    jsonb_build_object('dealId', NEW.deal_id, 'claimId', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stake_claim_insert ON stake_claims;
CREATE TRIGGER trg_stake_claim_insert
  AFTER INSERT ON stake_claims
  FOR EACH ROW EXECUTE FUNCTION notify_on_stake_claim_insert();

-- ─── Trigger: claim status change → notify buyer ────────────────────────────

CREATE OR REPLACE FUNCTION notify_on_stake_claim_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament_name TEXT;
  v_owner_name      TEXT;
  v_notif_type      TEXT;
  v_title           TEXT;
  v_body            TEXT;
BEGIN
  -- Only react to status transitions to confirmed or rejected
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('confirmed', 'rejected') THEN RETURN NEW; END IF;

  SELECT tournament_name INTO v_tournament_name
    FROM stake_deals WHERE id = NEW.deal_id;

  SELECT user_id INTO STRICT v_owner_name
    FROM stake_deals WHERE id = NEW.deal_id;
  v_owner_name := _notif_display_name(v_owner_name::UUID);

  IF NEW.status = 'confirmed' THEN
    v_notif_type := 'stake_claim_confirmed';
    v_title      := 'Stake Confirmed!';
    v_body       := v_owner_name || ' confirmed your ' || NEW.percent_claimed || '% stake in ' || COALESCE(v_tournament_name, 'a tournament');
  ELSE
    v_notif_type := 'stake_claim_rejected';
    v_title      := 'Stake Not Approved';
    v_body       := v_owner_name || ' declined your stake request for ' || COALESCE(v_tournament_name, 'a tournament');
  END IF;

  INSERT INTO notifications (user_id, actor_id, type, title, body, data)
  VALUES (
    NEW.buyer_id,
    (SELECT user_id FROM stake_deals WHERE id = NEW.deal_id),
    v_notif_type,
    v_title,
    v_body,
    jsonb_build_object('dealId', NEW.deal_id, 'claimId', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stake_claim_update ON stake_claims;
CREATE TRIGGER trg_stake_claim_update
  AFTER UPDATE ON stake_claims
  FOR EACH ROW EXECUTE FUNCTION notify_on_stake_claim_update();

-- ─── Trigger: new comment on a post → notify post owner ─────────────────────

CREATE OR REPLACE FUNCTION notify_on_comment_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_post_owner UUID;
  v_post_name  TEXT;
  v_actor_name TEXT;
  v_preview    TEXT;
BEGIN
  SELECT user_id, COALESCE(session_name, 'your post')
    INTO v_post_owner, v_post_name
    FROM social_posts WHERE id = NEW.post_id;

  -- Skip if commenter is the post owner
  IF v_post_owner IS NULL OR v_post_owner = NEW.user_id THEN
    RETURN NEW;
  END IF;

  v_actor_name := _notif_display_name(NEW.user_id);
  v_preview    := LEFT(NEW.content, 60) || CASE WHEN LENGTH(NEW.content) > 60 THEN '…' ELSE '' END;

  INSERT INTO notifications (user_id, actor_id, type, title, body, data)
  VALUES (
    v_post_owner,
    NEW.user_id,
    'post_comment',
    'New Comment',
    v_actor_name || ' commented on ' || v_post_name || ': "' || v_preview || '"',
    jsonb_build_object('postId', NEW.post_id, 'commentId', NEW.id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_comment_insert ON social_comments;
CREATE TRIGGER trg_comment_insert
  AFTER INSERT ON social_comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment_insert();

-- ─── Trigger: new follower → notify followed user ────────────────────────────

CREATE OR REPLACE FUNCTION notify_on_follow_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor_name TEXT;
BEGIN
  IF NEW.following_id = NEW.follower_id THEN RETURN NEW; END IF;

  v_actor_name := _notif_display_name(NEW.follower_id);

  INSERT INTO notifications (user_id, actor_id, type, title, body, data)
  VALUES (
    NEW.following_id,
    NEW.follower_id,
    'new_follower',
    'New Follower',
    v_actor_name || ' started following you',
    jsonb_build_object('followerId', NEW.follower_id)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_insert ON social_follows;
CREATE TRIGGER trg_follow_insert
  AFTER INSERT ON social_follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow_insert();
