import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const client = new Anthropic()

export interface Recommendation {
  title: string
  confidence: number   // 0–100
  reason: string
  isAnime: boolean
}

export async function POST(req: Request) {
  try {
    const { manga } = await req.json()

    const list = manga
      .map((m: { title: string; current_chapter: number; status: string }) =>
        `- ${m.title} (ch.${m.current_chapter}, ${m.status})`
      )
      .join('\n')

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: `You are a manga and anime expert. Given a user's reading/watching list, recommend 5 titles they will enjoy.
Mix manga and anime recommendations as appropriate.
Return ONLY a valid JSON array — no markdown, no explanation outside the array.
Each item: { "title": string, "confidence": number, "reason": string, "isAnime": boolean }
confidence: 55–95 integer. Be honest — vary scores based on actual fit. Don't give everything 90+.
reason: one sentence explaining the match. Reference something specific from their list.`,
      messages: [
        {
          role: 'user',
          content: `My list:\n${list}\n\nReturn 5 recommendations as a JSON array.`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '[]'

    let recommendations: Recommendation[] = []
    try {
      // Strip any markdown code fences if present
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned)
      if (Array.isArray(parsed)) {
        recommendations = parsed.map(r => ({
          title: String(r.title ?? ''),
          confidence: Math.min(100, Math.max(0, parseInt(r.confidence ?? 70, 10))),
          reason: String(r.reason ?? ''),
          isAnime: Boolean(r.isAnime),
        }))
      }
    } catch {
      // Fallback: return empty array rather than crashing
      recommendations = []
    }

    return NextResponse.json({ recommendations })
  } catch (err) {
    console.error('recommend error', err)
    return NextResponse.json({ error: 'Failed to get recommendations' }, { status: 500 })
  }
}
