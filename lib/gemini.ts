// Gemini Flash free tier enrichment helper (server-side only).
// Gate all calls on GEMINI_API_KEY being present — it's optional.

const GEMINI_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

export interface GeminiEnrichment {
  synopsis: string | null
  themes: string[]
  trivia: string | null
}

async function geminiGenerate(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  try {
    const res = await fetch(`${GEMINI_ENDPOINT}?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
      }),
      // 8s timeout — deep-search is user-initiated, small delay is acceptable
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null
  } catch {
    return null
  }
}

export async function enrichWithGemini(
  title: string,
  contentType: 'manga' | 'anime' | 'movie' | string,
): Promise<GeminiEnrichment> {
  if (!process.env.GEMINI_API_KEY) {
    return { synopsis: null, themes: [], trivia: null }
  }

  const kind = contentType === 'anime' || contentType === 'movie' ? 'anime/show' : 'manga/manhwa'
  const raw = await geminiGenerate(
    `You are a knowledgeable anime and manga expert.
For the ${kind} titled "${title}", reply ONLY with a JSON object — no explanation, no markdown fences:
{
  "synopsis": "<2–3 sentence plot summary, or null if unknown>",
  "themes": ["<theme1>", "<theme2>"],
  "trivia": "<one interesting production or story fact, or null if unknown>"
}
Keep synopsis under 300 characters. Themes should be 2–4 short tags like "Shonen", "Isekai", "Military", "Romance". If you are not confident about the title, return null for all fields and an empty array for themes.`,
  )

  if (!raw) return { synopsis: null, themes: [], trivia: null }

  try {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { synopsis: null, themes: [], trivia: null }
    const parsed = JSON.parse(match[0])
    return {
      synopsis: typeof parsed.synopsis === 'string' ? parsed.synopsis : null,
      themes: Array.isArray(parsed.themes)
        ? parsed.themes.filter((t: unknown) => typeof t === 'string').slice(0, 6)
        : [],
      trivia: typeof parsed.trivia === 'string' ? parsed.trivia : null,
    }
  } catch {
    return { synopsis: null, themes: [], trivia: null }
  }
}
