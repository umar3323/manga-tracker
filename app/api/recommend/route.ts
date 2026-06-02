import Anthropic from '@anthropic-ai/sdk'
import { NextResponse } from 'next/server'

const client = new Anthropic()

export async function POST(req: Request) {
  const { manga } = await req.json()

  const list = manga
    .map((m: { title: string; current_chapter: number; status: string }) =>
      `- ${m.title} (ch.${m.current_chapter}, ${m.status})`
    )
    .join('\n')

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system:
      'You are a manga expert. Given a user\'s reading list, suggest 5 manga they would enjoy. ' +
      'Be specific about why each recommendation fits their taste. Format each as: ' +
      '**Title** — one sentence reason. Keep the whole response under 300 words.',
    messages: [
      {
        role: 'user',
        content: `Here is my manga list:\n${list}\n\nWhat should I read next?`,
      },
    ],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  return NextResponse.json({ recommendations: text })
}
