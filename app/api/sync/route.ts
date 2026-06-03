import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getLatestChapterFromMangaDex } from '@/lib/mangadex'

interface SyncResult {
  title: string
  changes: string[]
}

async function jikanGet(path: string) {
  const res = await fetch(`https://api.jikan.moe/v4${path}`, {
    signal: AbortSignal.timeout(10000),
  })
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

    // Fetch all manga (with and without MAL ID — we still update what we can)
    const { data: mangaList, error } = await supabase
      .from('manga_list')
      .select('id, mal_id, title, cover_url, total_chapters, has_anime, anime_mal_id, anime_title, total_episodes, status')

    if (error) return NextResponse.json({ error: 'DB error' }, { status: 500 })

    const results: SyncResult[] = []
    const entries = (mangaList ?? []).filter(m => m.mal_id)

    for (let i = 0; i < entries.length; i++) {
      const m = entries[i]
      const changes: string[] = []
      const updates: Record<string, unknown> = {}

      if (i > 0) await delay(450) // respect Jikan 3 req/s

      // ── 1. Fetch fresh manga metadata from Jikan ────────────────────────
      const json = await jikanGet(`/manga/${m.mal_id}`)
      if (!json?.data) continue
      const d = json.data

      // Cover art
      const newCover = d.images?.jpg?.large_image_url ?? d.images?.jpg?.image_url
      if (!m.cover_url && newCover) {
        updates.cover_url = newCover
        changes.push('cover added')
      }

      // Authors
      const freshAuthors = (d.authors ?? []).map((a: { mal_id: number; name: string }) => ({
        id: a.mal_id, name: a.name,
      }))
      const currentAuthors = (m as Record<string, unknown>).authors as { id: number; name: string }[] ?? []
      if (freshAuthors.length > 0 && currentAuthors.length === 0) {
        updates.authors = freshAuthors
        changes.push(`authors: ${freshAuthors.map((a: { name: string }) => a.name).join(', ')}`)
      }

      // ── 2. Total / latest chapters ──────────────────────────────────────
      const officialChapters: number | null = d.chapters ?? null
      const isCompleted = d.status === 'Finished'

      if (officialChapters && officialChapters !== m.total_chapters) {
        updates.total_chapters = officialChapters
        changes.push(`chapters: ${m.total_chapters ?? '?'} → ${officialChapters}`)
      } else if (!officialChapters && !isCompleted) {
        // Ongoing manga — ask MangaDex for the latest released chapter
        await delay(300) // small extra gap before MangaDex call
        const latestCh = await getLatestChapterFromMangaDex(m.mal_id)
        if (latestCh && latestCh !== m.total_chapters) {
          updates.total_chapters = latestCh
          changes.push(
            m.total_chapters
              ? `latest chapter: ${m.total_chapters} → ${latestCh}`
              : `latest chapter found: ${latestCh}`
          )
        }
      }

      // ── 3. Anime adaptations ────────────────────────────────────────────
      if (!m.has_anime) {
        // First time — check for adaptation
        await delay(450)
        const relJson = await jikanGet(`/manga/${m.mal_id}/relations`)
        if (relJson?.data) {
          for (const rel of relJson.data) {
            if (rel.relation === 'Adaptation') {
              for (const entry of rel.entry ?? []) {
                if (entry.type === 'anime') {
                  await delay(450)
                  const animeJson = await jikanGet(`/anime/${entry.mal_id}`)
                  if (animeJson?.data) {
                    const ad = animeJson.data
                    updates.has_anime = true
                    updates.anime_mal_id = entry.mal_id
                    updates.anime_title = ad.title
                    // Use aired episodes if still airing, or total if finished
                    updates.total_episodes = ad.episodes ?? null
                    changes.push(`anime found: ${ad.title}${ad.episodes ? ` (${ad.episodes} eps)` : ''}`)
                  }
                  break
                }
              }
              if (updates.has_anime) break
            }
          }
        }
      } else if (m.anime_mal_id) {
        // Already known — refresh episode count (catches newly aired episodes)
        await delay(450)
        const animeJson = await jikanGet(`/anime/${m.anime_mal_id}`)
        if (animeJson?.data) {
          const ad = animeJson.data
          const freshEps: number | null = ad.episodes ?? null
          if (freshEps && freshEps !== m.total_episodes) {
            updates.total_episodes = freshEps
            changes.push(
              `anime episodes: ${m.total_episodes ?? '?'} → ${freshEps}${ad.airing ? ' (airing)' : ''}`
            )
          }
          // Also update anime title if it changed
          if (ad.title && ad.title !== m.anime_title) {
            updates.anime_title = ad.title
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
