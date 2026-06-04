/**
 * GET /api/warmup
 * Pre-warms the expensive in-memory caches so the first real user request
 * after a cold start doesn't wait 10–20s.
 *
 * Called by Vercel cron every hour (see vercel.json).
 * Also safe to hit manually after a deploy.
 *
 * Fires catalog + shonenjump + goodreads + webtoons in parallel — these are
 * the four routes with multi-source aggregation that take longest on cold start.
 * Each route serves its own in-memory cache for subsequent requests.
 */

import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const origin = new URL(req.url).origin
  const start = Date.now()

  const routes = [
    '/api/catalog',
    '/api/shonenjump',
    '/api/goodreads',
    '/api/webtoons',
    '/api/mangaplus',
  ]

  const results = await Promise.allSettled(
    routes.map(path =>
      fetch(`${origin}${path}`, { signal: AbortSignal.timeout(45000) })
        .then(r => ({ path, ok: r.ok, status: r.status }))
        .catch(e => ({ path, ok: false, status: 0, error: String(e) }))
    )
  )

  const summary = results.map(r =>
    r.status === 'fulfilled' ? r.value : { path: '?', ok: false, error: 'rejected' }
  )

  return NextResponse.json({
    warmed: summary.filter(s => s.ok).map(s => s.path),
    failed: summary.filter(s => !s.ok).map(s => s.path),
    ms: Date.now() - start,
  })
}
