import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Accepts both cookie-based auth (browser) and Bearer-token auth (extension).
async function getUser(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } },
    )
    const { data: { user }, error } = await supabase.auth.getUser(token)
    return { user: error ? null : user, supabase }
  }

  // Cookie-based (browser)
  const { createServerClient } = await import('@supabase/ssr')
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  return { user, supabase }
}

/**
 * GET /api/library-titles
 *
 * Returns all title strings from the user's library (title + anime_title).
 * Used by the Chrome extension to gate streaming-platform tracking to only
 * anime that exist in the user's library (bug-c fix).
 *
 * Response: { titles: string[] }
 */
export async function GET(req: NextRequest) {
  const { user, supabase } = await getUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('manga_list')
    .select('title, anime_title')
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Collect all non-empty title strings (both title and anime_title columns)
  const titles: string[] = []
  for (const row of data ?? []) {
    if (row.title) titles.push(row.title)
    if (row.anime_title) titles.push(row.anime_title)
  }

  return NextResponse.json(
    { titles },
    {
      headers: {
        // Cache for 5 minutes — library rarely changes mid-session
        'Cache-Control': 'private, max-age=300',
      },
    },
  )
}
