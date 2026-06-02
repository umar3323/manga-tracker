export interface JikanManga {
  coverUrl: string | null
  totalChapters: number | null
}

export async function fetchMangaInfo(title: string): Promise<JikanManga> {
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`,
      { next: { revalidate: 86400 } }
    )
    if (!res.ok) return { coverUrl: null, totalChapters: null }
    const json = await res.json()
    const item = json.data?.[0]
    if (!item) return { coverUrl: null, totalChapters: null }
    return {
      coverUrl: item.images?.jpg?.image_url ?? null,
      totalChapters: item.chapters ?? null,
    }
  } catch {
    return { coverUrl: null, totalChapters: null }
  }
}
