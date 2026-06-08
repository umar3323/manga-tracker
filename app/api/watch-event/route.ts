import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────
interface WatchEventBody {
  title: string
  episode: number | null
  season: number | null
  site: string
  duration_seconds: number
  watched_seconds: number
  is_complete: boolean
  timestamp: string
}

interface LibraryEntry {
  id: string
  title: string
  episodes_watched: number
  total_episodes: number | null
  status: string
  total_watch_time_minutes: number
  content_type: string
  auto_tracked: boolean
}

// ── Fuzzy title matching ───────────────────────────────────────────────────
function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(the|a|an|season|part|cour)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchScore(query: string, candidate: string): number {
  const q = normalise(query)
  const c = normalise(candidate)
  if (q === c) return 1.0
  if (c.startsWith(q) || q.startsWith(c)) return 0.92
  if (c.includes(q) || q.includes(c)) return 0.85
  // Word-overlap Jaccard
  const wq = new Set(q.split(' ').filter(Boolean))
  const wc = new Set(c.split(' ').filter(Boolean))
  const inter = [...wq].filter(w => wc.has(w)).length
  const union = new Set([...wq, ...wc]).size
  return union > 0 ? inter / union : 0
}

// ── Route ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  // Pass the user's JWT as the Authorization header so auth.uid() resolves
  // correctly inside RLS policies on watch_sessions and manga_list.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  // Verify JWT → get user
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: WatchEventBody
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { title, episode, season, site, duration_seconds, watched_seconds, is_complete, timestamp } = body
  if (!title?.trim()) return NextResponse.json({ error: 'title required' }, { status: 400 })

  // ── Input validation & sanitisation ──────────────────────────────────────
  // Clamp strings to safe lengths
  const safeTitle = String(title).trim().slice(0, 255)
  const safeSite  = String(site ?? '').trim().slice(0, 100)

  // Validate numeric fields — reject non-finite, negative, or unreasonably large values
  const safeEpisode  = Number.isFinite(episode)  && episode  >= 0 && episode  <= 50000 ? Math.round(episode)  : null
  const safeSeason   = Number.isFinite(season)   && season   >= 0 && season   <= 9999  ? Math.round(season)   : null
  const safeDuration = Number.isFinite(duration_seconds) && duration_seconds >= 0 && duration_seconds <= 86400 ? Math.round(duration_seconds) : 0
  const safeWatched  = Number.isFinite(watched_seconds)  && watched_seconds  >= 0 && watched_seconds  <= 86400 ? Math.round(watched_seconds)  : 0

  // Validate timestamp — must parse as a real date, not more than 1 hour in the future,
  // not more than 10 years in the past. Fallback to server time on invalid input.
  const nowMs = Date.now()
  let watchedAt = new Date().toISOString()
  if (timestamp) {
    const parsed = new Date(timestamp)
    const parsedMs = parsed.getTime()
    if (!isNaN(parsedMs) && parsedMs <= nowMs + 3_600_000 && parsedMs >= nowMs - 10 * 365 * 24 * 3_600_000) {
      watchedAt = parsed.toISOString()
    }
  }
  const watchMinutes = Math.max(0, Math.round(safeWatched / 60))

  // ── Load user library ───────────────────────────────────────────────────
  const { data: library, error: libErr } = await supabase
    .from('manga_list')
    .select('id, title, episodes_watched, total_episodes, status, total_watch_time_minutes, content_type, auto_tracked')
    .eq('user_id', user.id)

  if (libErr || !library) {
    return NextResponse.json({ error: 'db error' }, { status: 500 })
  }

  // ── Find best match ─────────────────────────────────────────────────────
  let best: LibraryEntry | null = null
  let bestScore = 0
  for (const entry of library as LibraryEntry[]) {
    const score = matchScore(safeTitle, entry.title)
    if (score > bestScore) { bestScore = score; best = entry }
  }
  const MATCH_THRESHOLD = 0.65

  // ── Log watch session (always) ──────────────────────────────────────────
  await supabase.from('watch_sessions').insert({
    user_id: user.id,
    manga_id: best && bestScore >= MATCH_THRESHOLD ? best.id : null,
    title_raw: safeTitle,
    episode: safeEpisode,
    season: safeSeason,
    site: safeSite,
    duration_seconds: safeDuration,
    watched_seconds: safeWatched,
    is_complete: !!is_complete,
    watched_at: watchedAt,
  })

  // ── Matched existing entry ──────────────────────────────────────────────
  if (best && bestScore >= MATCH_THRESHOLD) {
    const updates: Record<string, unknown> = {
      total_watch_time_minutes: (best.total_watch_time_minutes ?? 0) + watchMinutes,
      last_read_at: watchedAt,
      auto_tracked: true,
    }

    if (is_complete && safeEpisode != null) {
      // Only advance episode counter — never go backwards
      if (safeEpisode > (best.episodes_watched ?? 0)) {
        updates.episodes_watched = safeEpisode
      }
      // Auto-promote status: plan_to_read / unwatched → watching
      if (best.status === 'plan_to_read' || best.status === 'unwatched') {
        updates.status = 'watching'
      }
      // Auto-complete: if we just watched the last episode
      if (best.total_episodes && safeEpisode >= best.total_episodes && best.status === 'watching') {
        updates.status = 'completed'
      }
    }

    await supabase.from('manga_list').update(updates).eq('id', best.id).eq('user_id', user.id)

    return NextResponse.json({
      action: 'updated',
      entry_id: best.id,
      matched_title: best.title,
      score: Math.round(bestScore * 100),
      status_changed: updates.status ? `→ ${updates.status}` : null,
    })
  }

  // ── No match — create new entry on completion ───────────────────────────
  if (is_complete) {
    const { data: newEntry } = await supabase
      .from('manga_list')
      .insert({
        user_id: user.id,
        title: safeTitle,
        status: 'watching',
        content_type: 'anime',
        has_anime: true,
        episodes_watched: safeEpisode ?? 0,
        total_watch_time_minutes: watchMinutes,
        last_read_at: watchedAt,
        auto_tracked: true,
        notes: `[auto-tracked] First seen on ${safeSite}`,
      })
      .select('id')
      .single()

    // Backfill session with the new manga_id
    if (newEntry?.id) {
      await supabase.from('watch_sessions')
        .update({ manga_id: newEntry.id })
        .eq('user_id', user.id)
        .eq('title_raw', title)
        .is('manga_id', null)
    }

    return NextResponse.json({ action: 'created', entry_id: newEntry?.id, title })
  }

  return NextResponse.json({ action: 'ignored', reason: 'no match and video not complete' })
}
