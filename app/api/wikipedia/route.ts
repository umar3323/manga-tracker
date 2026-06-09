/**
 * GET /api/wikipedia?title=Berserk&type=manga
 * Fetches Wikipedia summary + lead section for a manga/anime title.
 * Returns: summary text, url, thumbnail, categories, and parsed infobox fields
 * from the REST summary endpoint. Falls back to a search if exact title fails.
 *
 * Cached in anilist_cache table with media_type='WIKIPEDIA'.
 * TTL: 72h (Wikipedia articles change infrequently).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const CACHE_TTL_MS = 72 * 60 * 60 * 1000 // 72h

export interface WikipediaData {
  title: string
  url: string
  summary: string        // opening paragraph (plain text)
  thumbnail?: string     // image URL
  // Parsed from wikitext infobox / summary — best-effort
  author?: string
  illustrator?: string
  publisher?: string
  serializedIn?: string
  originalRun?: string
  volumes?: string
  episodes?: string
  directed?: string
  studio?: string
  genres?: string[]
  // Arc / chapter list section — plain-text excerpt
  arcSummary?: string
}

async function fetchWikipediaSummary(slug: string): Promise<WikipediaData | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(slug)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'YOMU/1.0 (https://manga-tracker-hazel.vercel.app)' },
      next: { revalidate: 0 },
    })
    if (!res.ok) return null
    const d = await res.json()
    if (d.type === 'disambiguation') return null

    const data: WikipediaData = {
      title: d.title ?? slug,
      url: d.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(slug)}`,
      summary: d.extract ?? '',
      thumbnail: d.thumbnail?.source ?? d.originalimage?.source,
    }

    // Fetch the page sections to pull infobox-style fields from the lead section HTML
    try {
      const sectUrl = `https://en.wikipedia.org/api/rest_v1/page/mobile-sections/${encodeURIComponent(slug)}`
      const sectRes = await fetch(sectUrl, {
        headers: { 'User-Agent': 'YOMU/1.0 (https://manga-tracker-hazel.vercel.app)' },
        next: { revalidate: 0 },
      })
      if (sectRes.ok) {
        const sectData = await sectRes.json()
        const leadHtml: string = sectData?.lead?.sections?.[0]?.text ?? ''

        // Parse table rows from infobox — values are between <td> tags
        const parseField = (labels: string[]): string | undefined => {
          for (const label of labels) {
            const re = new RegExp(
              `<th[^>]*>\\s*(?:<[^>]+>)*\\s*${label}\\s*(?:<\\/[^>]+>)*\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
              'i'
            )
            const m = leadHtml.match(re)
            if (m) {
              // Strip HTML tags and collapse whitespace
              return m[1]
                .replace(/<br\s*\/?>/gi, ', ')
                .replace(/<[^>]+>/g, '')
                .replace(/\[\d+\]/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/,\s*,/g, ',')
                .slice(0, 200)
            }
          }
        }

        data.author        = parseField(['Written by', 'Author', 'Story'])
        data.illustrator   = parseField(['Illustrated by', 'Art', 'Artist'])
        data.publisher     = parseField(['Published by', 'Publisher'])
        data.serializedIn  = parseField(['Original run', 'Serialized in', 'Magazine'])
        data.originalRun   = parseField(['Original run', 'Published'])
        data.volumes       = parseField(['Volumes', 'Volume'])
        data.episodes      = parseField(['Episodes', 'Episode'])
        data.directed      = parseField(['Directed by', 'Director'])
        data.studio        = parseField(['Animated by', 'Studio', 'Animation'])
        data.genres        = parseField(['Genre', 'Genres'])
          ?.split(/[,;]/)
          .map(g => g.trim())
          .filter(g => g.length > 0 && g.length < 40)
          .slice(0, 8)

        // Find an arc/chapter list section and grab the first few section titles
        const sections: Array<{ title?: string; text?: string }> = sectData?.remaining?.sections ?? []
        const arcSection = sections.find(s =>
          /chapters?|volumes?|arc|episodes?|story arc/i.test(s.title ?? '')
        )
        if (arcSection?.text) {
          // Extract list items or headings
          const items = [...arcSection.text.matchAll(/<(?:li|h[234])[^>]*>([^<]{3,80})<\/(?:li|h[234])>/gi)]
            .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\[\d+\]/g, '').trim())
            .filter(Boolean)
            .slice(0, 12)
          if (items.length) data.arcSummary = items.join(' · ')
        }
      }
    } catch {
      // infobox parsing is best-effort
    }

    return data
  } catch {
    return null
  }
}

async function searchWikipedia(query: string): Promise<string | null> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' manga OR anime')}&srlimit=3&format=json&origin=*`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'YOMU/1.0 (https://manga-tracker-hazel.vercel.app)' },
    })
    if (!res.ok) return null
    const d = await res.json()
    const results: Array<{ title: string }> = d?.query?.search ?? []
    return results[0]?.title ?? null
  } catch {
    return null
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const title = searchParams.get('title')?.trim()
  const malId = searchParams.get('mal_id')

  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const cacheKey = malId ? parseInt(malId, 10) : 0

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  )

  // Check cache (keyed by mal_id when available, otherwise 0 with title as anilist_id placeholder)
  const { data: cached } = await supabase
    .from('anilist_cache')
    .select('payload, fetched_at')
    .eq('mal_id', cacheKey)
    .eq('media_type', 'WIKIPEDIA')
    // Distinguish by title when mal_id=0
    .eq('anilist_id', cacheKey === 0 ? (title.length % 100000) : 0)
    .single()

  if (cached) {
    const age = Date.now() - new Date(cached.fetched_at).getTime()
    if (age < CACHE_TTL_MS) {
      return NextResponse.json({ data: cached.payload, cached: true })
    }
  }

  // Try exact title first, then search
  let data = await fetchWikipediaSummary(title)

  if (!data) {
    const found = await searchWikipedia(title)
    if (found) data = await fetchWikipediaSummary(found)
  }

  if (!data) {
    return NextResponse.json({ data: null })
  }

  // Cache result
  const anilistId = cacheKey === 0 ? (title.length % 100000) : 0
  await supabase.from('anilist_cache').upsert({
    mal_id: cacheKey,
    media_type: 'WIKIPEDIA',
    anilist_id: anilistId,
    payload: data,
    fetched_at: new Date().toISOString(),
  }, { onConflict: 'mal_id,media_type' }).catch(() => {})

  return NextResponse.json({ data, cached: false })
}
