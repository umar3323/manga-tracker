import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { evaluateAchievements, BADGES } from '@/lib/achievements'
import type { Manga } from '@/lib/supabase'

// POST /api/achievements — evaluate achievements for the calling user and persist new ones
export async function POST(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: userErr } = await anonClient.auth.getUser(token)
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Load the user's manga
  const { data: manga } = await serviceClient
    .from('manga_list')
    .select('*')
    .eq('user_id', user.id)

  if (!manga) return NextResponse.json({ earned: [] })

  const earned = evaluateAchievements(manga as Manga[])

  // Load already-stored achievements
  const { data: existing } = await serviceClient
    .from('user_achievements')
    .select('badge_id')
    .eq('user_id', user.id)

  const existingIds = new Set((existing ?? []).map((r: { badge_id: string }) => r.badge_id))
  const newOnes = earned.filter(id => !existingIds.has(id))

  if (newOnes.length > 0) {
    await serviceClient.from('user_achievements').insert(
      newOnes.map(badge_id => ({ user_id: user.id, badge_id }))
    )
  }

  return NextResponse.json({
    earned,
    new: newOnes,
    badges: earned.map(id => BADGES.find(b => b.id === id)).filter(Boolean),
  })
}

// GET /api/achievements — return the calling user's current achievements
export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { user }, error: userErr } = await anonClient.auth.getUser(token)
  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const serviceClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: rows } = await serviceClient
    .from('user_achievements')
    .select('badge_id, unlocked_at')
    .eq('user_id', user.id)
    .order('unlocked_at', { ascending: false })

  const badgeMap = new Map(BADGES.map(b => [b.id, b]))
  const badges = (rows ?? []).map((r: { badge_id: string; unlocked_at: string }) => ({
    ...badgeMap.get(r.badge_id),
    unlocked_at: r.unlocked_at,
  }))

  return NextResponse.json({ badges, total: BADGES.length })
}
