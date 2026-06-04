/**
 * GET /api/ann?title=...
 * Proxy for ANN encyclopedia — search + entry detail in one call.
 * Cache: 24h per title (in-memory). Returns { ann_id, related_anime[] } or { ann_id: null }.
 * Non-blocking: never await before rendering; fire-and-forget from detail modal.
 * Attribution: any UI showing ANN data must link to animenewsnetwork.com.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { searchANN, getANNEntry, type ANNRelatedWork } from '@/lib/ann'

interface CacheEntry {
  ann_id: string | null
  related_anime: ANNRelatedWork[]
  at: number
}
const _cache = new Map<string, CacheEntry>()
const CACHE_MS = 24 * 60 * 60 * 1000

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get('title')?.trim()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const key = title.toLowerCase()
  const cached = _cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ ann_id: cached.ann_id, related_anime: cached.related_anime, cached: true })
  }

  const searchResult = await searchANN(title)
  if (!searchResult) {
    const empty: CacheEntry = { ann_id: null, related_anime: [], at: Date.now() }
    _cache.set(key, empty)
    return NextResponse.json({ ann_id: null, related_anime: [] })
  }

  const entry = await getANNEntry(searchResult.ann_id)
  const result: CacheEntry = {
    ann_id: searchResult.ann_id,
    related_anime: entry?.related_anime ?? [],
    at: Date.now(),
  }
  _cache.set(key, result)
  return NextResponse.json({ ann_id: result.ann_id, related_anime: result.related_anime, cached: false })
}
