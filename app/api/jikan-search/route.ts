/**
 * Server-side Jikan search proxy — GET /api/jikan-search?q=...&[filters]
 *
 * Why this exists:
 *   The browser calls api.jikan.moe directly, and Jikan enforces 3 req/s per IP.
 *   When the autocomplete (350ms debounce) and the main search both fire nearly
 *   simultaneously, the second request gets 429 and silently returns empty results.
 *   This proxy runs server-side, retries 429s with a back-off, and caches
 *   identical queries for 30 s so duplicate calls cost zero extra requests.
 *
 * Accepted query params (mirrors SearchFilters in lib/jikan.ts):
 *   q, genres, genres_exclude, status, order_by, sort,
 *   min_score, min_chapters, max_chapters, limit, page
 */

import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

// Simple in-memory cache: key → { data, expiresAt }
const cache = new Map<string, { data: unknown; expiresAt: number }>()
const CACHE_TTL_MS = 30_000 // 30 s

const JIKAN_BASE = 'https://api.jikan.moe/v4'

async function jikanFetch(url: string, attempt = 1): Promise<Response> {
  const res = await fetch(url, { next: { revalidate: 0 } })
  if (res.status === 429 && attempt < 3) {
    // Back-off: 1 s on first retry, 2 s on second
    await new Promise(r => setTimeout(r, attempt * 1000))
    return jikanFetch(url, attempt + 1)
  }
  return res
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  // Build canonical Jikan URL from all passed params
  const jikanParams = new URLSearchParams()
  const allowed = ['q', 'genres', 'genres_exclude', 'status', 'order_by',
                   'sort', 'min_score', 'limit', 'page', 'sfw']
  for (const key of allowed) {
    const v = searchParams.get(key)
    if (v != null) jikanParams.set(key, v)
  }
  if (!jikanParams.has('limit')) jikanParams.set('limit', '24')
  if (!jikanParams.has('page'))  jikanParams.set('page',  '1')
  // Always enforce SFW — caller cannot override this
  jikanParams.set('sfw', 'true')

  // 'manga' (default) or 'anime'
  const mediaType = searchParams.get('type') === 'anime' ? 'anime' : 'manga'
  const cacheKey = `${mediaType}:${jikanParams.toString()}`

  // Serve from cache if fresh
  const cached = cache.get(cacheKey)
  if (cached && Date.now() < cached.expiresAt) {
    return NextResponse.json(cached.data)
  }

  const jikanUrl = `${JIKAN_BASE}/${mediaType}?${jikanParams.toString()}`

  try {
    const res = await jikanFetch(jikanUrl)
    if (!res.ok) {
      // Forward the status code so the client can distinguish 504 (MAL down)
      // from other errors
      return NextResponse.json({ data: [], status: res.status }, { status: res.status })
    }
    const json = await res.json()

    // Jikan sometimes returns 200 with an error payload when MAL is struggling
    if (json.status === 504 || json.type === 'BadResponseException') {
      return NextResponse.json({ data: [], status: 504, type: json.type }, { status: 504 })
    }

    // Client-side chapter filters (Jikan has no native min/max chapter param)
    let data: unknown[] = json.data ?? []
    const minCh = Number(searchParams.get('min_chapters') ?? 0)
    const maxCh = Number(searchParams.get('max_chapters') ?? 0)
    if (minCh > 0) data = data.filter((m: unknown) => {
      const ch = (m as { chapters?: number }).chapters
      return !ch || ch >= minCh
    })
    if (maxCh > 0) data = data.filter((m: unknown) => {
      const ch = (m as { chapters?: number }).chapters
      return !ch || ch <= maxCh
    })

    const result = { data, pagination: json.pagination }
    cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS })

    return NextResponse.json(result)
  } catch (err) {
    console.error('[jikan-search] fetch failed:', err)
    return NextResponse.json({ data: [] }, { status: 500 })
  }
}
