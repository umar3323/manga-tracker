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

// ── Known dedicated anime streaming sites ─────────────────────────────────
// Auto-create new library entries ONLY when the watch event comes from one
// of these sites. General sites (YouTube, Netflix, Prime Video, etc.) can
// update existing library matches but will NOT create new entries — that
// prevents non-anime content from polluting the library.
const KNOWN_ANIME_SITES = new Set([
  'crunchyroll.com', 'funimation.com', 'hidive.com',
  'aniwatch.to', 'hianime.to', 'aniwatchtv.to',
  '9anime.to', '9anime.gg', '9anime.rs',
  'gogoanime.by', 'gogoanime.gg', 'gogoanimes.net',
  'anitaku.pe', 'anitaku.be',
  'aniwaves.ru', 'aniwaves.com',
  'bilibili.tv',
  'vrv.co', 'retrocrush.tv',
])

function isKnownAnimeSite(site: string): boolean {
  const lower = site.toLowerCase()
  return [...KNOWN_ANIME_SITES].some(s => lower === s || lower.endsWith('.' + s) || lower.includes(s))
}

// ── Fuzzy title matching ───────────────────────────────────────────────────
// Primary matching is now done via Supabase RPC (pg_trgm) — no full library
// load. JS matchScore is kept as a fallback in case the RPC is unavailable.
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
  const safeEpisode  = episode  != null && Number.isFinite(episode)  && episode  >= 0 && episode  <= 50000 ? Math.round(episode)  : null
  const safeSeason   = season   != null && Number.isFinite(season)   && season   >= 0 && season   <= 9999  ? Math.round(season)   : null
  const safeDuration = duration_seconds != null && Number.isFinite(duration_seconds) && duration_seconds >= 0 && duration_seconds <= 86400 ? Math.round(duration_seconds) : 0
  const safeWatched  = watched_seconds  != null && Number.isFinite(watched_seconds)  && watched_seconds  >= 0 && watched_seconds  <= 86400 ? Math.round(watched_seconds)  : 0

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

  // ── Find best match via pg_trgm RPC ────────────────────────────────────
  // Replaces full JS library load — DB does the fuzzy match against both
  // `title` and `anime_title` columns using GIN indexes. Falls back to the
  // JS matchScore path if the RPC errors (e.g. during a migration).
  const MATCH_THRESHOLD = 0.65
  let best: LibraryEntry | null = null
  let bestScore = 0

  const { data: rpcData, error: rpcErr } = await supabase
    .rpc('match_library_entry', {
      query_title:     safeTitle,
      p_user_id:       user.id,
      match_threshold: MATCH_THRESHOLD,
    })

  if (!rpcErr && rpcData && rpcData.length > 0) {
    best      = rpcData[0] as LibraryEntry
    bestScore = rpcData[0].best_similarity_score ?? 1.0
  } else if (rpcErr) {
    // RPC unavailable — fall back to full JS scan
    console.warn('[watch-event] match_library_entry RPC failed, falling back to JS scan:', rpcErr.message)
    const { data: library } = await supabase
      .from('manga_list')
      .select('id, title, episodes_watched, total_episodes, status, total_watch_time_minutes, content_type, auto_tracked')
      .eq('user_id', user.id)
    for (const entry of (library ?? []) as LibraryEntry[]) {
      const score = matchScore(safeTitle, entry.title)
      if (score > bestScore) { bestScore = score; best = entry }
    }
  }

  const hasLibraryMatch = !!(best && bestScore >= MATCH_THRESHOLD)

  // ── Log watch session (only for library matches or known anime sites) ──
  // Skip logging for non-anime platforms (YouTube, Netflix, etc.) when there
  // is no library match — prevents non-anime content appearing in stats/session log.
  if (hasLibraryMatch || isKnownAnimeSite(safeSite)) {
    await supabase.from('watch_sessions').insert({
      user_id: user.id,
      manga_id: hasLibraryMatch ? best!.id : null,
      title_raw: safeTitle,
      episode: safeEpisode,
      season: safeSeason,
      site: safeSite,
      duration_seconds: safeDuration,
      watched_seconds: safeWatched,
      is_complete: !!is_complete,
      watched_at: watchedAt,
    })
  }

  // ── Matched existing entry ──────────────────────────────────────────────
  if (hasLibraryMatch && best) {
    const updates: Record<string, unknown> = {
      total_watch_time_minutes: (best.total_watch_time_minutes ?? 0) + watchMinutes,
      last_read_at: watchedAt,
      last_watched_site: safeSite,
      auto_tracked: true,
    }

    if (is_complete) {
      if (safeEpisode != null) {
        // Only advance episode counter — never go backwards
        if (safeEpisode > (best.episodes_watched ?? 0)) {
          updates.episodes_watched = safeEpisode
        }
        // Auto-complete: if we just watched the last episode
        if (best.total_episodes && safeEpisode >= best.total_episodes && best.status === 'watching') {
          updates.status = 'completed'
        }
      } else {
        // No episode number available (e.g. Netflix anime) — increment by 1
        const newEp = (best.episodes_watched ?? 0) + 1
        updates.episodes_watched = newEp
        // Auto-complete: if we just watched the last episode
        if (best.total_episodes && newEp >= best.total_episodes && best.status === 'watching') {
          updates.status = 'completed'
        }
      }
      // Auto-promote status: plan_to_read / unwatched → watching
      if (best.status === 'plan_to_read' || best.status === 'unwatched') {
        updates.status = 'watching'
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

  // ── No match — create new entry on completion (anime sites only) ──────────
  // Only auto-create for dedicated anime streaming sites. General platforms
  // (YouTube, Netflix, Prime Video, Disney+, etc.) can match existing entries
  // but must not create new ones — prevents non-anime content polluting the library.
  if (is_complete && isKnownAnimeSite(safeSite)) {
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
        last_watched_site: safeSite,
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
