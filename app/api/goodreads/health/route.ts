/**
 * GET /api/goodreads/health
 * Quick health check for the Goodreads scraper.
 * Returns { ok, count, cachedAt } — count = 0 means scraper is broken (markup changed).
 * Safe to poll; hits the parent route which serves its own in-memory cache.
 */

import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  try {
    const res = await fetch(`${origin}/api/goodreads`, {
      signal: AbortSignal.timeout(15000),
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, count: 0, error: `HTTP ${res.status}` }, { status: 502 })
    }
    const json = await res.json()
    const count: number = (json.books ?? []).length
    return NextResponse.json({
      ok: count > 0,
      count,
      cached: json.cached ?? null,
      cachedAt: json.cachedAt ?? null,
      warning: count === 0 ? 'Goodreads scraper returned 0 results — markup may have changed' : null,
    })
  } catch (e) {
    return NextResponse.json({ ok: false, count: 0, error: String(e) }, { status: 502 })
  }
}
