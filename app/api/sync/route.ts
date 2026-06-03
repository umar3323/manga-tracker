import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

interface SyncResult {
  title: string
  changes: string[]
}

async function jikanGet(path: string) {
  const res = await fetch(`https://api.jikan.moe/v4${path}`)
  if (!res.ok) return null
  return res.json()
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function POST() {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll(s) { s.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
        },
      }
    )

    // Fetch all manga with a MAL ID
    const { data: mangaList, error } = await supabase
      .from('manga_list')
      .select('id, mal_id, title, cover_url, total_chapters, has_anime')
      .not('mal_id', 'is', null)

    if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })

    const results: SyncResult[] = []
    const entries = mangaList ?? []

    for (let i = 0; i < entries.length; i++) {
      const m = entries[i]
      const changes: string[] = []
      const updates: Record<string, unknown> = {}

      // Rate-limit: 3 req/sec → 400ms gap
      if (i > 0) await delay(450)

      // Fetch fresh manga data
      const json = await jikanGet(`/manga/${m.mal_id}`)
      if (!json?.data) continue

      const d = json.data

      // Update cover if missing
      const newCover = d.images?.jpg?.image_url
      if (!m.cover_url && newCover) {
        updates.cover_url = newCover
        changes.push('added cover art')
      }

      // Update total chapters if changed
      const newChapters = d.chapters ?? null
      if (newChapters && newChapters !== m.total_chapters) {
        updates.total_chapters = newChapters
        changes.push(`chapters updated: ${m.total_chapters ?? '?'} → ${newChapters}`)
      }

      // Check for anime adaptations if not already set
      if (!m.has_anime) {
        await delay(450)
        const relJson = await jikanGet(`/manga/${m.mal_id}/relations`)
        if (relJson?.data) {
          for (const rel of relJson.data) {
            if (rel.relation === 'Adaptation') {
              for (const entry of rel.entry ?? []) {
                if (entry.type === 'anime') {
                  updates.has_anime = true
                  updates.anime_mal_id = entry.mal_id
                  // Fetch anime details for episode count + title
                  await delay(450)
                  const animeJson = await jikanGet(`/anime/${entry.mal_id}`)
                  if (animeJson?.data) {
                    updates.anime_title = animeJson.data.title
                    updates.total_episodes = animeJson.data.episodes ?? null
                  } else {
                    updates.anime_title = entry.name
                  }
                  changes.push(`anime found: ${updates.anime_title}`)
                  break
                }
              }
              if (updates.has_anime) break
            }
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await supabase.from('manga_list').update(updates).eq('id', m.id)
        results.push({ title: m.title, changes })
      }
    }

    return NextResponse.json({
      synced: entries.length,
      updated: results.length,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('sync error', err)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
