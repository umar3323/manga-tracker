/**
 * GET /api/notifymoe?mal_id=12345&title=Fullmetal+Alchemist
 * Server-side proxy for notify.moe API (CORS blocked for browser requests).
 * Cached in anilist_cache table (reuses existing table with media_type='NOTIFY_MOE').
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { findNotifyMoeByMalId } from '@/lib/notifymoe'

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const malIdStr = searchParams.get('mal_id')
  const title = searchParams.get('title') ?? ''

  if (!malIdStr) return NextResponse.json({ error: 'mal_id required' }, { status: 400 })
  const malId = parseInt(malIdStr, 10)
  if (isNaN(malId)) return NextResponse.json({ error: 'invalid mal_id' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  // Check cache
  const { data: cached } = await supabase
    .from('anilist_cache')
    .select('payload, fetched_at')
    .eq('mal_id', malId)
    .eq('media_type', 'NOTIFY_MOE')
    .single()

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime()
    if (age < CACHE_MAX_AGE_MS) {
      return NextResponse.json({ data: cached.payload, cached: true })
    }
  }

  if (!title) {
    if (cached) return NextResponse.json({ data: cached.payload, cached: true, stale: true })
    return NextResponse.json({ data: null })
  }

  const fresh = await findNotifyMoeByMalId(malId, title)

  if (!fresh) {
    if (cached) return NextResponse.json({ data: cached.payload, cached: true, stale: true })
    return NextResponse.json({ data: null })
  }

  await supabase.from('anilist_cache').upsert({
    mal_id: malId,
    media_type: 'NOTIFY_MOE',
    anilist_id: 0,
    payload: fresh,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'mal_id,media_type' })

  return NextResponse.json({ data: fresh, cached: false })
}
