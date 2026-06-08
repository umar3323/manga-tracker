import { NextRequest, NextResponse } from 'next/server'

// Proxy for MangaDex API — avoids CORS issues with direct browser requests.
// Usage:
//   GET /api/mangadex?path=/manga%3Ftitle%3DBerserk...
//   The `path` param is the MangaDex API path + query string, URL-encoded.

const BASE = 'https://api.mangadex.org'

export async function GET(req: NextRequest) {
  const path = req.nextUrl.searchParams.get('path')
  if (!path) return NextResponse.json({ error: 'missing path' }, { status: 400 })

  try {
    const url = `${BASE}${path}`
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 300 }, // cache 5 min server-side
    })
    if (!res.ok) return NextResponse.json({ error: `mangadex ${res.status}` }, { status: res.status })
    const json = await res.json()
    return NextResponse.json(json, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' },
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
