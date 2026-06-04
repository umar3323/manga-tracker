/**
 * MangaPlus (Shueisha) chapter feed
 * Source: jumpg-webapi.tokyo-cdn.com — official Shueisha CDN used by the MangaPlus web app.
 * The CDN returns a protobuf binary. We extract title strings + title IDs via byte scanning
 * and construct chapter entries from them.
 *
 * Cache: 1h in-memory; serves stale on failure (same pattern as shonenjump/route.ts).
 * NOTE: If Shueisha changes CDN structure or IP-blocks the serverless region, this returns [].
 */

import { NextResponse } from 'next/server'

export interface MPChapter {
  title: string
  titleId: string          // Shueisha title ID (from URL or extracted)
  chapter: string
  url: string              // MangaPlus reader URL
  seriesUrl: string        // MangaPlus series page URL
  isFree: boolean
  releaseDate: string | null
}

const CDN = 'https://jumpg-webapi.tokyo-cdn.com'
const ORIGIN = 'https://mangaplus.shueisha.co.jp'
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Referer': `${ORIGIN}/`,
  'Origin': ORIGIN,
  'Accept': 'application/x-protobuf',
}

let _cache: { chapters: MPChapter[]; at: number } | null = null
const CACHE_MS = 60 * 60 * 1000  // 1h

/** Extract printable ASCII strings ≥5 chars from a binary buffer */
function extractStrings(buf: Buffer, minLen = 5): string[] {
  const strings: string[] = []
  let cur = ''
  for (const byte of buf) {
    if (byte >= 0x20 && byte <= 0x7e) {
      cur += String.fromCharCode(byte)
    } else {
      if (cur.length >= minLen) strings.push(cur)
      cur = ''
    }
  }
  if (cur.length >= minLen) strings.push(cur)
  return strings
}

/** Try to parse the CDN protobuf response into chapter entries */
function parseProtobuf(buf: Buffer): MPChapter[] {
  const strings = extractStrings(buf, 4)
  const chapters: MPChapter[] = []
  const seen = new Set<string>()

  for (let i = 0; i < strings.length; i++) {
    const s = strings[i]

    // MangaPlus title IDs appear as 6-digit numbers; viewer URLs contain them
    // Title strings: "One Piece" style — mixed case, 3–60 chars, not a URL/code
    const isTitleCandidate = (
      s.length >= 3 && s.length <= 60 &&
      /^[A-Z]/.test(s) &&
      !/^(https?:|http:|www\.|Content-|Accept|User-|application|charset)/.test(s) &&
      !/^\d+$/.test(s) &&
      !/^[A-Z_]+$/.test(s)  // skip all-caps codes
    )
    if (!isTitleCandidate) continue
    if (seen.has(s.toLowerCase())) continue
    seen.add(s.toLowerCase())

    // Look ahead for a title ID (6-digit number) in nearby strings
    let titleId = ''
    for (let j = i + 1; j < Math.min(i + 8, strings.length); j++) {
      if (/^\d{6}$/.test(strings[j])) { titleId = strings[j]; break }
    }

    // Look ahead for chapter number
    let chapter = ''
    for (let j = i + 1; j < Math.min(i + 10, strings.length); j++) {
      if (/^#?\d{1,4}$/.test(strings[j])) { chapter = strings[j].replace('#', ''); break }
    }

    if (!titleId && !chapter) continue  // need at least one piece of metadata

    const url = titleId
      ? `${ORIGIN}/viewer/${titleId}`
      : `${ORIGIN}/manga_list/all`
    const seriesUrl = titleId
      ? `${ORIGIN}/titles/${titleId}`
      : `${ORIGIN}/manga_list/all`

    chapters.push({
      title: s,
      titleId,
      chapter: chapter || '—',
      url,
      seriesUrl,
      isFree: true,  // MangaPlus latest chapters are free by default
      releaseDate: null,
    })

    if (chapters.length >= 40) break  // cap to keep response lean
  }

  return chapters
}

export async function GET() {
  if (_cache && Date.now() - _cache.at < CACHE_MS) {
    return NextResponse.json({ chapters: _cache.chapters, cached: true })
  }

  try {
    // Try the web home endpoint — contains recently updated titles
    const res = await fetch(`${CDN}/api/web/web_homeV4?lang=eng`, {
      headers: HEADERS,
      signal: AbortSignal.timeout(12000),
    })

    if (!res.ok) {
      if (_cache) return NextResponse.json({ chapters: _cache.chapters, cached: true, stale: true })
      return NextResponse.json({ chapters: [] })
    }

    const arrayBuf = await res.arrayBuffer()
    const buf = Buffer.from(arrayBuf)
    const chapters = parseProtobuf(buf)

    _cache = { chapters, at: Date.now() }
    return NextResponse.json({ chapters, cached: false })
  } catch {
    if (_cache) return NextResponse.json({ chapters: _cache.chapters, cached: true, stale: true })
    return NextResponse.json({ chapters: [] })
  }
}
