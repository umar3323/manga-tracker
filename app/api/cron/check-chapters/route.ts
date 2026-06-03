import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// This route is called weekly by Vercel Cron.
// Requires SUPABASE_SERVICE_ROLE_KEY env var (bypasses RLS).
// Secured with CRON_SECRET env var.

async function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')?.replace('Bearer ', '')
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) {
    return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  )

  // Get all manga with MAL IDs that are still being read
  const { data: mangaList } = await supabase
    .from('manga_list')
    .select('id, mal_id, title, total_chapters')
    .not('mal_id', 'is', null)
    .in('status', ['reading', 'on_hold'])

  if (!mangaList?.length) return NextResponse.json({ checked: 0, updated: 0 })

  let updated = 0
  const notifications = []

  for (let i = 0; i < mangaList.length; i++) {
    const m = mangaList[i]
    if (i > 0) await delay(450)

    try {
      const res = await fetch(`https://api.jikan.moe/v4/manga/${m.mal_id}`)
      if (!res.ok) continue
      const json = await res.json()
      const newChapters = json.data?.chapters ?? null
      if (!newChapters) continue

      if (newChapters !== m.total_chapters) {
        await supabase.from('manga_list')
          .update({ total_chapters: newChapters })
          .eq('id', m.id)

        if (m.total_chapters && newChapters > m.total_chapters) {
          notifications.push({
            manga_id: m.id,
            title: m.title,
            previous_chapters: m.total_chapters,
            new_chapters: newChapters,
          })
          updated++
        }
      }
    } catch { /* skip */ }
  }

  if (notifications.length > 0) {
    await supabase.from('chapter_notifications').insert(notifications)
  }

  return NextResponse.json({
    checked: mangaList.length,
    updated,
    notifications: notifications.length,
  })
}
