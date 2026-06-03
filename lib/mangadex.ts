/**
 * MangaDex API helpers.
 * Used to find the latest released chapter for ongoing manga,
 * since MAL/Jikan only knows the total for *completed* series.
 */

export async function getLatestChapterFromMangaDex(malId: number): Promise<number | null> {
  try {
    // 1. Find the MangaDex manga ID via the MAL external link mapping
    const searchRes = await fetch(
      `https://api.mangadex.org/manga?limit=1&links[mal]=${malId}`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!searchRes.ok) return null
    const searchJson = await searchRes.json()
    const mdId: string | undefined = searchJson.data?.[0]?.id
    if (!mdId) return null

    // 2. Get the highest numbered English chapter in the feed
    const feedRes = await fetch(
      `https://api.mangadex.org/manga/${mdId}/feed` +
      `?translatedLanguage[]=en&order[chapter]=desc&limit=10` +
      `&contentRating[]=safe&contentRating[]=suggestive` +
      `&contentRating[]=erotica&contentRating[]=pornographic`,
      { signal: AbortSignal.timeout(8000) }
    )
    if (!feedRes.ok) return null
    const feedJson = await feedRes.json()

    let max = 0
    for (const ch of feedJson.data ?? []) {
      const n = parseFloat(ch.attributes?.chapter ?? '0')
      if (!isNaN(n) && n > max) max = n
    }
    return max > 0 ? Math.floor(max) : null
  } catch {
    return null
  }
}
