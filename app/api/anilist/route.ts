import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse, type NextRequest } from 'next/server'
import { fetchAniListManga, fetchAniListAnime } from '@/lib/anilist'

const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24h

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const malIdStr = searchParams.get('mal_id')
  const type = searchParams.get('type') ?? 'MANGA'

  if (!malIdStr) return NextResponse.json({ error: 'mal_id required' }, { status: 400 })
  const malId = parseInt(malIdStr, 10)
  if (isNaN(malId)) return NextResponse.json({ error: 'invalid mal_id' }, { status: 400 })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  // Check cache first
  const { data: cached } = await supabase
    .from('anilist_cache')
    .select('payload, fetched_at, anilist_id')
    .eq('mal_id', malId)
    .eq('media_type', type)
    .single()

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime()
    if (age < CACHE_MAX_AGE_MS) {
      return NextResponse.json({ data: cached.payload, cached: true })
    }
  }

  // Fetch fresh from AniList
  const fresh = type === 'ANIME'
    ? await fetchAniListAnime(malId)
    : await fetchAniListManga(malId)

  if (!fresh) {
    // Return stale cache if fetch failed rather than nothing
    if (cached) return NextResponse.json({ data: cached.payload, cached: true, stale: true })
    return NextResponse.json({ data: null })
  }

  // Store in cache (upsert)
  await supabase.from('anilist_cache').upsert({
    mal_id: malId,
    media_type: type,
    anilist_id: fresh.id,
    payload: fresh,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'mal_id,media_type' })

  return NextResponse.json({ data: fresh, cached: false })
}
