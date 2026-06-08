import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface UrlAnalysisResult {
  title: string | null
  total_chapters: number | null
  total_episodes: number | null
  score: number | null
  synopsis: string | null
  genres: string[]
  authors: string[]
  cover_url: string | null
  published_from: string | null
  published_to: string | null
  content_type: 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'anime' | 'novel' | 'other' | null
  mal_id: number | null
  source_site: string
}

export async function POST(req: NextRequest) {
  const { url } = await req.json()
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 })
  }

  // Fetch the page HTML
  let html = ''
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; YOMU/1.0)' },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const raw = await res.text()
    // Strip scripts/styles, truncate to ~12k chars for Claude
    html = raw
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 12000)
  } catch (e) {
    return NextResponse.json({ error: `Could not fetch URL: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 422 })
  }

  const sourceHost = (() => { try { return new URL(url).hostname } catch { return url } })()

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' }, { status: 503 })
  }

  let text = '{}'
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are extracting manga/anime series metadata from a webpage.
Source URL: ${url}
Page text (truncated):
---
${html}
---

Extract and return ONLY a JSON object with these fields (use null if unknown):
{
  "title": string or null,
  "total_chapters": number or null,
  "total_episodes": number or null,
  "score": number (0-10) or null,
  "synopsis": string (max 400 chars) or null,
  "genres": string[],
  "authors": string[] (names only),
  "cover_url": string (absolute URL) or null,
  "published_from": string (ISO date YYYY-MM-DD) or null,
  "published_to": string (ISO date YYYY-MM-DD) or null,
  "content_type": one of "manga"|"manhwa"|"manhua"|"webtoon"|"anime"|"novel"|"other" or null,
  "mal_id": number (MAL ID if this is a MAL page) or null
}

Reply with ONLY the JSON object, no extra text.`,
      }],
    })
    text = message.content[0].type === 'text' ? message.content[0].text.trim() : '{}'
  } catch (e) {
    return NextResponse.json({ error: `AI analysis failed: ${e instanceof Error ? e.message : 'unknown'}` }, { status: 502 })
  }
  let parsed: Partial<UrlAnalysisResult> = {}
  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) parsed = JSON.parse(match[0])
  } catch {
    // best effort
  }

  const result: UrlAnalysisResult = {
    title: parsed.title ?? null,
    total_chapters: parsed.total_chapters ?? null,
    total_episodes: parsed.total_episodes ?? null,
    score: parsed.score ?? null,
    synopsis: parsed.synopsis ?? null,
    genres: Array.isArray(parsed.genres) ? parsed.genres : [],
    authors: Array.isArray(parsed.authors) ? parsed.authors : [],
    cover_url: parsed.cover_url ?? null,
    published_from: parsed.published_from ?? null,
    published_to: parsed.published_to ?? null,
    content_type: parsed.content_type ?? null,
    mal_id: parsed.mal_id ?? null,
    source_site: sourceHost,
  }

  return NextResponse.json(result)
}
