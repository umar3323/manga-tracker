/**
 * GET /api/jikan-proxy?path=/anime/123
 *
 * General-purpose server-side proxy for Jikan API v4.
 * Handles any path that isn't a search query (those go through /api/jikan-search
 * which has 30s in-memory caching for autocomplete dedup).
 *
 * Why this exists:
 *   Some lib/jikan.ts functions (getSeriesEntryDetail, getMangaAllRelations,
 *   getJikanEpisodes, etc.) are called from browser-side components. Direct
 *   browser→api.jikan.moe calls hit CORS restrictions and share the browser's
 *   rate-limit quota. This proxy runs server-side, retries 429s, and is exempt
 *   from the auth middleware (added to isPublicApi in proxy.ts).
 */

import { NextResponse, type NextRequest } from 'next/server'

export const runtime = 'nodejs'

const JIKAN_BASE = 'https://api.jikan.moe/v4'
// Allowlist — only forward to sub-paths of the Jikan v4 API.
// This prevents the proxy being used as an open redirect.
const ALLOWED_PATH_RE = /^\/[a-z]+[/a-z0-9_\-?&=%.]+$/i

async function jikanFetchWithRetry(url: string, attempt = 1): Promise<Response> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 0 }, // no edge caching — let callers control freshness
  })
  if (res.status === 429 && attempt < 3) {
    await new Promise(r => setTimeout(r, attempt * 1200))
    return jikanFetchWithRetry(url, attempt + 1)
  }
  return res
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path') ?? ''

  if (!path || !ALLOWED_PATH_RE.test(path)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 })
  }

  try {
    const res = await jikanFetchWithRetry(`${JIKAN_BASE}${path}`)
    const json = await res.json()
    return NextResponse.json(json, { status: res.status })
  } catch {
    return NextResponse.json({ error: 'upstream error' }, { status: 502 })
  }
}
