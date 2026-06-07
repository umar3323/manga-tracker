import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import webpush from 'web-push'

// This route is called weekly by Vercel Cron.
// Requires SUPABASE_SERVICE_ROLE_KEY env var (bypasses RLS).
// Secured with CRON_SECRET env var.

async function delay(ms: number) { return new Promise(r => setTimeout(r, ms)) }

export async function GET(req: NextRequest) {
  // Set VAPID details inside the handler so env vars are available at runtime,
  // not at module load time (which causes build failures when env vars are absent)
  if (process.env.VAPID_EMAIL && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      process.env.VAPID_EMAIL,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    )
  }
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
    .select('id, mal_id, title, total_chapters, user_id')
    .not('mal_id', 'is', null)
    .in('status', ['reading', 'on_hold'])

  if (!mangaList?.length) return NextResponse.json({ checked: 0, updated: 0 })

  let updated = 0
  const notifications: { manga_id: string; title: string; previous_chapters: number; new_chapters: number; user_id: string }[] = []

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
            user_id: m.user_id,
          })
          updated++
        }
      }
    } catch { /* skip */ }
  }

  if (notifications.length > 0) {
    await supabase.from('chapter_notifications').insert(
      notifications.map(n => ({
        manga_id: n.manga_id,
        title: n.title,
        previous_chapters: n.previous_chapters,
        new_chapters: n.new_chapters,
      }))
    )

    // Send web-push to each affected user
    // Group notifications by user_id
    const byUser: Record<string, typeof notifications> = {}
    for (const n of notifications) {
      if (!byUser[n.user_id]) byUser[n.user_id] = []
      byUser[n.user_id].push(n)
    }

    for (const [userId, userNotifs] of Object.entries(byUser)) {
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId)

      if (!subs?.length) continue

      // Build a summary message
      const titles = userNotifs.map(n => n.title)
      const body = titles.length === 1
        ? `${titles[0]} has new chapters!`
        : `${titles.slice(0, 2).join(', ')}${titles.length > 2 ? ` +${titles.length - 2} more` : ''} have new chapters!`

      const payload = JSON.stringify({
        title: 'YOMU — New chapters',
        body,
        tag: 'new-chapters',
        url: '/',
      })

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        } catch (e: unknown) {
          // If subscription expired (410), remove it
          if (e instanceof Error && 'statusCode' in e && (e as { statusCode: number }).statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }
    }
  }

  return NextResponse.json({
    checked: mangaList.length,
    updated,
    notifications: notifications.length,
  })
}
