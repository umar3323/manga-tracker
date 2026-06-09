import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
}

// GET /api/community-totals?mal_id=123&content_type=manga
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const mal_id = searchParams.get('mal_id')
  const content_type = searchParams.get('content_type') ?? 'manga'

  if (!mal_id) return NextResponse.json({ error: 'mal_id required' }, { status: 400 })

  const supabase = await getSupabase()
  const { data, error } = await supabase
    .from('community_totals')
    .select('total_chapters, total_episodes, updated_at')
    .eq('mal_id', Number(mal_id))
    .eq('content_type', content_type)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? null)
}

// POST — upsert community total
// body: { mal_id, content_type, total_chapters?, total_episodes? }
export async function POST(req: NextRequest) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    mal_id: number
    content_type?: string
    total_chapters?: number | null
    total_episodes?: number | null
  }

  const { mal_id, content_type = 'manga', total_chapters, total_episodes } = body
  if (!mal_id) return NextResponse.json({ error: 'mal_id required' }, { status: 400 })

  // Build update payload — only include fields that were provided
  const payload: Record<string, unknown> = {
    mal_id,
    content_type,
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }
  if (total_chapters !== undefined) payload.total_chapters = total_chapters
  if (total_episodes !== undefined) payload.total_episodes = total_episodes

  const { data, error } = await supabase
    .from('community_totals')
    .upsert(payload, { onConflict: 'mal_id,content_type' })
    .select('total_chapters, total_episodes, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
