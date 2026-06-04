/**
 * Goodreads manga integration
 * Goodreads shut down their public API in 2020, so we scrape HTML server-side.
 *
 * GET /api/goodreads              → trending/popular manga from genres page (cached 2h)
 * GET /api/goodreads?q=query      → search Goodreads for manga by title (cached 30m)
 */

import { NextResponse, type NextRequest } from 'next/server'

export interface GoodreadsBook {
  goodreadsId: string
  title: string
  author: string | null
  rating: number | null
  ratingsCount: string | null
  coverUrl: string | null
  goodreadsUrl: string
  /** Filled in by Jikan cross-ref when available */
  malId: number | null
}

// Per-query cache (genre page + search queries)
const _cache = new Map<string, { data: GoodreadsBook[]; at: number }>()
const GENRE_TTL = 2 * 60 * 60 * 1000   // 2 hours for genres page
const SEARCH_TTL = 30 * 60 * 1000       // 30 min for search queries

const GR_BASE = 'https://www.goodreads.com'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'en-US,en;q=0.9',
}

async function grFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) })
    if (!res.ok) return null
    return res.text()
  } catch { return null }
}

/** Extract /book/show/[id] entries from raw HTML */
function extractBooks(html: string): GoodreadsBook[] {
  const books: GoodreadsBook[] = []
  const seen = new Set<string>()

  // Match book URLs — pattern: href="/book/show/[id][optional-slug]"
  const bookRe = /href="(\/book\/show\/(\d+)[^"]*)"[^>]*>([^<]*)<\/a>/g
  // Image pattern: src from compressed.photo.goodreads.com or i.gr-assets.com
  const imgRe = /"(https:\/\/i\.gr-assets\.com\/images\/S\/compressed\.photo\.goodreads\.com\/books\/[^\s"]+)"/g
  // Rating pattern: "4.37 avg rating" or data-rating="4.37"
  const ratingRe = /data-rating="([\d.]+)"|(\d+\.\d+)\s+avg rating/g
  // Ratings count: "1,234 ratings"
  const countRe = /([\d,]+)\s+ratings?/g
  // Author: class="authorName"
  const authorRe = /class="authorName"[^>]*>[^<]*<span[^>]*>([^<]+)<\/span>/g

  // Collect all images and ratings first (positional matching is brittle; use a coarser approach)
  const images: string[] = []
  let imgM: RegExpExecArray | null
  while ((imgM = imgRe.exec(html)) !== null) images.push(imgM[1])

  const ratings: string[] = []
  let rM: RegExpExecArray | null
  while ((rM = ratingRe.exec(html)) !== null) ratings.push(rM[1] ?? rM[2])

  const counts: string[] = []
  let cM: RegExpExecArray | null
  while ((cM = countRe.exec(html)) !== null) counts.push(cM[1])

  const authors: string[] = []
  let aM: RegExpExecArray | null
  while ((aM = authorRe.exec(html)) !== null) authors.push(aM[1].trim())

  // Now extract books by their URLs
  let m: RegExpExecArray | null
  let bookIdx = 0
  while ((m = bookRe.exec(html)) !== null) {
    const path = m[1]
    const id = m[2]
    const rawTitle = m[3].trim()
    if (!id || !rawTitle || rawTitle.length < 2) continue
    if (seen.has(id)) continue
    seen.add(id)

    // Skip non-book links that sneak in
    if (rawTitle.match(/^(see more|more|all books|lists?|genres?|shelf|community)$/i)) continue

    books.push({
      goodreadsId: id,
      title: rawTitle,
      author: authors[bookIdx] ?? null,
      rating: ratings[bookIdx] ? parseFloat(ratings[bookIdx]) : null,
      ratingsCount: counts[bookIdx] ?? null,
      coverUrl: images[bookIdx] ?? null,
      goodreadsUrl: `${GR_BASE}${path}`,
      malId: null,
    })
    bookIdx++
  }

  return books
}

/** Scrape Goodreads manga genres page → return trending + popular titles */
async function scrapeTrending(): Promise<GoodreadsBook[]> {
  const html = await grFetch(`${GR_BASE}/genres/manga`)
  if (!html) return []
  const books = extractBooks(html)
  // Deduplicate by title similarity (some volumes appear multiple times)
  const seen = new Set<string>()
  return books.filter(b => {
    const base = b.title.toLowerCase().replace(/,?\s+vol\.?\s*\d+.*/i, '').replace(/\s+\d+$/, '').trim()
    if (seen.has(base)) return false
    seen.add(base)
    return true
  })
}

/** Scrape Goodreads search results for a query */
async function scrapeSearch(q: string): Promise<GoodreadsBook[]> {
  // Add "manga" to help disambiguate when q is short/generic
  const encoded = encodeURIComponent(`${q} manga`)
  const html = await grFetch(`${GR_BASE}/search?q=${encoded}&search_type=books`)
  if (!html) return []
  return extractBooks(html).slice(0, 20)
}

/** Cross-reference titles with Jikan to fill in MAL IDs (best-effort, rate-limited) */
async function enrichWithMalIds(books: GoodreadsBook[]): Promise<GoodreadsBook[]> {
  const DELAY = 500 // ms between Jikan calls
  const results = [...books]
  for (let i = 0; i < Math.min(results.length, 15); i++) {
    const b = results[i]
    // Clean volume suffixes for a cleaner title search
    const cleanTitle = b.title
      .replace(/,?\s+(vol|volume|tome|chapter|ch)\.?\s*\d+.*/i, '')
      .replace(/\s+\d+$/, '')
      .trim()
    try {
      if (i > 0) await new Promise(r => setTimeout(r, DELAY))
      const res = await fetch(
        `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(cleanTitle)}&limit=1&order_by=members&sort=desc`,
        { signal: AbortSignal.timeout(6000) }
      )
      if (res.ok) {
        const json = await res.json()
        const hit = json.data?.[0]
        if (hit?.mal_id) results[i] = { ...b, malId: hit.mal_id }
      }
    } catch { /* skip */ }
  }
  return results
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  const cacheKey = q || '__genres__'
  const ttl = q ? SEARCH_TTL : GENRE_TTL

  const cached = _cache.get(cacheKey)
  if (cached && Date.now() - cached.at < ttl) {
    return NextResponse.json({ books: cached.data, cached: true })
  }

  const raw = q ? await scrapeSearch(q) : await scrapeTrending()
  const enriched = await enrichWithMalIds(raw)

  _cache.set(cacheKey, { data: enriched, at: Date.now() })
  return NextResponse.json({ books: enriched, cached: false, total: enriched.length })
}
