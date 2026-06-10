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

-- ── pg_trgm fuzzy matching (watch-event RPC) ─────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS manga_list_title_trgm_idx
  ON manga_list USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS manga_list_anime_title_trgm_idx
  ON manga_list USING GIN (anime_title gin_trgm_ops);

DROP FUNCTION IF EXISTS match_library_entry(text, uuid, real);

CREATE OR REPLACE FUNCTION match_library_entry(
  query_title     text,
  p_user_id       uuid,
  match_threshold real DEFAULT 0.65
)
RETURNS TABLE (
  id                       uuid,
  title                    text,
  episodes_watched         integer,
  total_episodes           integer,
  status                   text,
  total_watch_time_minutes integer,
  content_type             text,
  auto_tracked             boolean,
  best_similarity_score    real
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.title,
    l.episodes_watched,
    l.total_episodes,
    l.status,
    l.total_watch_time_minutes,
    l.content_type,
    l.auto_tracked,
    GREATEST(
      similarity(l.title,       query_title),
      COALESCE(similarity(l.anime_title, query_title), 0)
    )::real AS best_similarity_score
  FROM manga_list l
  WHERE l.user_id = p_user_id
    AND GREATEST(
          similarity(l.title,       query_title),
          COALESCE(similarity(l.anime_title, query_title), 0)
        ) >= match_threshold
  ORDER BY best_similarity_score DESC
  LIMIT 1;
END;
$$;

-- ── Offline-first batch sync: idempotency_key on watch_sessions ──────────
-- Allows the batch /api/watch-event/batch endpoint to upsert events
-- idempotently — retries never double-count the same heartbeat.
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS idempotency_key uuid;
UPDATE watch_sessions SET idempotency_key = gen_random_uuid() WHERE idempotency_key IS NULL;
ALTER TABLE watch_sessions ALTER COLUMN idempotency_key SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'watch_sessions_idempotency_key_key'
  ) THEN
    ALTER TABLE watch_sessions ADD CONSTRAINT watch_sessions_idempotency_key_key UNIQUE (idempotency_key);
  END IF;
END $$;

-- ── Jaccard-based discovery RPC ───────────────────────────────────────────
-- Scores discover_cache entries against the user's taste profile
-- (genres from completed/watching library entries) using the Jaccard index.
-- Filters out already-swiped and already-in-library titles.
CREATE OR REPLACE FUNCTION discover_jaccard_feed(p_user_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  cover_url text,
  genres text[],
  mal_id integer,
  similarity_score real
)
LANGUAGE plpgsql
AS $$
DECLARE
  user_taste_profile text[];
BEGIN
  SELECT ARRAY(
    SELECT DISTINCT unnest(m.genres)
    FROM manga_list m
    WHERE m.user_id = p_user_id
      AND m.status IN ('completed', 'watching')
  ) INTO user_taste_profile;

  RETURN QUERY
  WITH scored_cache AS (
    SELECT
      d.id,
      d.title,
      d.cover_url,
      d.genres,
      d.mal_id,
      (
        SELECT CAST(COUNT(*) AS real)
        FROM (SELECT unnest(d.genres) INTERSECT SELECT unnest(user_taste_profile)) AS intersection_set
      ) / NULLIF(
        (SELECT CAST(COUNT(*) AS real)
        FROM (SELECT unnest(d.genres) UNION SELECT unnest(user_taste_profile)) AS union_set),
      0) AS calculated_score
    FROM discover_cache d
    WHERE d.id NOT IN (
      SELECT sh.anime_id FROM swipe_history sh WHERE sh.user_id = p_user_id
    )
    AND d.mal_id NOT IN (
      SELECT ml.mal_id FROM manga_list ml WHERE ml.user_id = p_user_id AND ml.mal_id IS NOT NULL
    )
  )
  SELECT s.id, s.title, s.cover_url, s.genres, s.mal_id,
         s.calculated_score::real AS similarity_score
  FROM scored_cache s
  WHERE s.calculated_score > 0
  ORDER BY s.calculated_score DESC
  LIMIT 20;
END;
$$;

-- ── Atomic merge RPC (duplicate detector) ────────────────────────────────
DROP FUNCTION IF EXISTS merge_entries(uuid, uuid[]);

CREATE OR REPLACE FUNCTION merge_entries(
  keep_id  uuid,
  drop_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Reassign watch sessions from dropped entries to the kept entry
  UPDATE watch_sessions
    SET manga_id = keep_id
  WHERE manga_id = ANY(drop_ids);

  -- Reassign chapter notifications so alerts keep firing on the kept entry
  UPDATE chapter_notifications
    SET manga_id = keep_id
  WHERE manga_id = ANY(drop_ids);

  -- Delete the dropped duplicates
  DELETE FROM manga_list
  WHERE id = ANY(drop_ids);
END;
$$;

-- ── swipe_history: user_id column + RLS policies ─────────────────────────
ALTER TABLE swipe_history ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS swipe_history_user_id_idx ON swipe_history(user_id);
ALTER TABLE swipe_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own swipe history" ON swipe_history;
CREATE POLICY "Users can read own swipe history" ON swipe_history
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own swipe history" ON swipe_history;
CREATE POLICY "Users can insert own swipe history" ON swipe_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
