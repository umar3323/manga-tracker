import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ── Types ──────────────────────────────────────────────────────────────────
interface BatchWatchEvent {
  idempotency_key: string
  title: string
  episode: number | null
  season: number | null
  site: string
  duration_seconds: number
  watched_seconds: number
  is_complete: boolean
  timestamp: string
  retryCount?: number
}

interface BatchWatchPayload {
  events: BatchWatchEvent[]
}

// ── Route ──────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const token = authHeader.slice(7)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  )

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: BatchWatchPayload
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }

  const { events } = body
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 })
  }

  // Clamp to 500 events per batch to prevent abuse
  const safeEvents = events.slice(0, 500)

  const nowMs = Date.now()

  // Build watch_sessions rows — force server-side user_id for security
  const rows = safeEvents
    .filter(e => e.idempotency_key && typeof e.idempotency_key === 'string' && e.title?.trim())
    .map(e => {
      // Validate timestamp
      let watchedAt = new Date().toISOString()
      if (e.timestamp) {
        const parsed = new Date(e.timestamp)
        const parsedMs = parsed.getTime()
        if (!isNaN(parsedMs) && parsedMs <= nowMs + 3_600_000 && parsedMs >= nowMs - 10 * 365 * 24 * 3_600_000) {
          watchedAt = parsed.toISOString()
        }
      }

      const safeDuration = Number.isFinite(e.duration_seconds) && e.duration_seconds >= 0 && e.duration_seconds <= 86400
        ? Math.round(e.duration_seconds) : 0
      const safeWatched = Number.isFinite(e.watched_seconds) && e.watched_seconds >= 0 && e.watched_seconds <= 86400
        ? Math.round(e.watched_seconds) : 0
      const safeEpisode = e.episode != null && Number.isFinite(e.episode) && e.episode >= 0 && e.episode <= 50000
        ? Math.round(e.episode) : null

      return {
        user_id: user.id,
        idempotency_key: String(e.idempotency_key).slice(0, 36),
        title_raw: String(e.title).trim().slice(0, 255),
        episode: safeEpisode,
        season: e.season != null && Number.isFinite(e.season) ? Math.round(e.season) : null,
        site: String(e.site ?? '').trim().slice(0, 100),
        duration_seconds: safeDuration,
        watched_seconds: safeWatched,
        is_complete: !!e.is_complete,
        watched_at: watchedAt,
        manga_id: null as string | null,
      }
    })

  if (rows.length === 0) {
    return NextResponse.json({ success: true, inserted: 0 })
  }

  // ── Upsert watch sessions (idempotent via idempotency_key) ─────────────
  const { error: upsertErr } = await supabase
    .from('watch_sessions')
    .upsert(rows, {
      onConflict: 'idempotency_key',
      ignoreDuplicates: true,
    })

  if (upsertErr) {
    console.error('[watch-event/batch] upsert error:', upsertErr.message)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }

  // ── Update library totals (group by title, one update per show) ────────
  // Aggregate total watch time per title across the batch
  const titleTotals = new Map<string, number>()
  for (const row of rows) {
    const minutes = Math.max(0, Math.round((row.watched_seconds) / 60))
    titleTotals.set(row.title_raw, (titleTotals.get(row.title_raw) ?? 0) + minutes)
  }

  // Update each matched library entry's watch time
  for (const [titleRaw, addedMinutes] of titleTotals) {
    if (addedMinutes <= 0) continue
    const { data: matches } = await supabase
      .rpc('match_library_entry', {
        query_title: titleRaw,
        p_user_id: user.id,
        match_threshold: 0.65,
      })
    if (matches && matches.length > 0) {
      const entry = matches[0]
      await supabase
        .from('manga_list')
        .update({
          total_watch_time_minutes: (entry.total_watch_time_minutes ?? 0) + addedMinutes,
          last_read_at: new Date().toISOString(),
          auto_tracked: true,
        })
        .eq('id', entry.id)
        .eq('user_id', user.id)
    }
  }

  return NextResponse.json({ success: true, inserted: rows.length })
}
