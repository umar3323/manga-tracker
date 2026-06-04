/**
 * GET /api/mangaupdates?title=One+Piece
 * Proxy for MangaUpdates search + series detail.
 * Cached in-memory per title for 6 hours.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { searchMangaUpdates, type MUSeriesData } from '@/lib/mangaupdates'

const _cache = new Map<string, { data: MUSeriesData | null; at: number }>()
const CACHE_MS = 6 * 60 * 60 * 1000  // 6 hours

export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get('title')?.trim()
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 })

  const key = title.toLowerCase()
  const cached = _cache.get(key)
  if (cached && Date.now() - cached.at < CACHE_MS) {
    return NextResponse.json({ data: cached.data, cached: true })
  }

  const data = await searchMangaUpdates(title)
  _cache.set(key, { data, at: Date.now() })
  return NextResponse.json({ data, cached: false })
}
