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

// GET — return all custom streaming sites for the authenticated user
export async function GET(req: NextRequest) {
  const { user, supabase } = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('custom_streaming_sites')
    .select('id, hostname, display_name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — add a custom streaming site
export async function POST(req: NextRequest) {
  const { user, supabase } = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  let { hostname, display_name } = body as { hostname?: string; display_name?: string }

  if (!hostname || typeof hostname !== 'string') {
    return NextResponse.json({ error: 'hostname is required' }, { status: 400 })
  }

  // Normalise: strip scheme/path, lowercase, remove www.
  try {
    const u = hostname.includes('://') ? new URL(hostname) : new URL(`https://${hostname}`)
    hostname = u.hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    hostname = hostname.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0].toLowerCase()
  }

  if (!hostname || hostname.length < 3) {
    return NextResponse.json({ error: 'Invalid hostname' }, { status: 400 })
  }

  display_name = (display_name?.trim() || hostname)

  const { data, error } = await supabase
    .from('custom_streaming_sites')
    .insert({ user_id: user.id, hostname, display_name })
    .select('id, hostname, display_name, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Site already added' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

// DELETE — remove a custom streaming site by id
export async function DELETE(req: NextRequest) {
  const { user, supabase } = await getUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabase
    .from('custom_streaming_sites')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
