-- ============================================================
-- YOMU database migrations
-- Run in Supabase SQL editor (Settings → SQL Editor)
-- ============================================================

-- ── Sprint 2: Web Push subscriptions ────────────────────────
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

-- One subscription per endpoint per user
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_endpoint
  ON push_subscriptions (user_id, endpoint);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
  ON push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Sprint 4: Achievements ───────────────────────────────────
CREATE TABLE IF NOT EXISTS user_achievements (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  badge_id     text NOT NULL,
  unlocked_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_achievements_user_badge
  ON user_achievements (user_id, badge_id);

ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own achievements"
  ON user_achievements FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role inserts achievements"
  ON user_achievements FOR INSERT
  WITH CHECK (true);

-- ── Sprint 5: Public reviews ─────────────────────────────────
ALTER TABLE manga_list ADD COLUMN IF NOT EXISTS is_public_review boolean DEFAULT false;
ALTER TABLE manga_list ADD COLUMN IF NOT EXISTS review_md text;

-- ── Takeout import: content_type field ──────────────────────
-- Distinguishes manga / manhwa / manhua / webtoon / anime
-- Default: 'manga' for all pre-existing rows (safe back-compat)
ALTER TABLE manga_list ADD COLUMN IF NOT EXISTS content_type text
  CHECK (content_type IN ('manga', 'manhwa', 'manhua', 'webtoon', 'anime', 'novel', 'other'))
  DEFAULT 'manga';

-- ── User Settings (key-value store for UI preferences / dismissed duplicates) ──
CREATE TABLE IF NOT EXISTS user_settings (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key        text NOT NULL,
  value      text,
  updated_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_settings_user_key
  ON user_settings (user_id, key);

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own settings"
  ON user_settings FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Chapter Notifications ────────────────────────────────────
CREATE TABLE IF NOT EXISTS chapter_notifications (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  manga_id        uuid REFERENCES manga_list(id) ON DELETE CASCADE NOT NULL,
  mal_id          integer,
  last_chapter    numeric,
  notified_at     timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chapter_notifications_user_manga
  ON chapter_notifications (user_id, manga_id);

ALTER TABLE chapter_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own chapter notifications"
  ON chapter_notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
