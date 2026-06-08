import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface Arc {
  name: string
  start_chapter: number
  end_chapter: number
}

export interface DeepSearchResult {
  title: string
  total_chapters: number | null
  score: number | null
  published_from: string | null
  published_to: string | null
  arcs: Arc[]
  source: string
}

async function fetchJikan(malId: number) {
  const res = await fetch(`https://api.jikan.moe/v4/manga/${malId}`, { next: { revalidate: 0 } })
  if (!res.ok) return null
  const data = await res.json()
  return data.data ?? null
}

async function searchJikan(title: string) {
  const res = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`, { next: { revalidate: 0 } })
  if (!res.ok) return null
  const data = await res.json()
  return data.data?.[0] ?? null
}

async function getArcsFromClaude(title: string, totalChapters: number | null): Promise<Arc[]> {
  const chapterHint = totalChapters ? ` The series has ${totalChapters} chapters total.` : ''
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `List the story arcs for the manga/manhwa/anime "${title}".${chapterHint}
For each arc, give the arc name and the chapter range (start and end chapters).
Reply ONLY with a JSON array, no explanation:
[{"name":"Arc Name","start_chapter":1,"end_chapter":20}, ...]
If you don't know the arcs, reply with an empty array: []`,
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'
  try {
    const match = text.match(/\[[\s\S]*\]/)
    if (!match) return []
    const parsed = JSON.parse(match[0])
    if (!Array.isArray(parsed)) return []
    return parsed.filter((a: unknown) => {
      if (typeof a !== 'object' || !a) return false
      const arc = a as Record<string, unknown>
      return typeof arc.name === 'string' && typeof arc.start_chapter === 'number' && typeof arc.end_chapter === 'number'
    })
  } catch {
    return []
  }
}

export async function POST(req: NextRequest) {
  const { mal_id, title } = await req.json()

  let jikanData: Record<string, unknown> | null = null
  if (mal_id) {
    jikanData = await fetchJikan(mal_id)
  }
  if (!jikanData && title) {
    jikanData = await searchJikan(title)
  }

  const resolvedTitle = (jikanData?.title as string | undefined) ?? title ?? ''
  const totalChapters = (jikanData?.chapters as number | undefined) ?? null
  const score = (jikanData?.score as number | undefined) ?? null
  const published = jikanData?.published as { from?: string; to?: string } | undefined

  const arcs = await getArcsFromClaude(resolvedTitle, totalChapters)

  const result: DeepSearchResult = {
    title: resolvedTitle,
    total_chapters: totalChapters,
    score,
    published_from: published?.from ?? null,
    published_to: published?.to ?? null,
    arcs,
    source: jikanData ? 'jikan+claude' : 'claude',
  }

  return NextResponse.json(result)
}
