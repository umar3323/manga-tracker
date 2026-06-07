import { createClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// POST /api/push/subscribe — store or remove a push subscription for the current user
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { subscription, action = 'subscribe' } = body as {
    subscription: PushSubscriptionJSON
    action?: 'subscribe' | 'unsubscribe'
  }

  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Missing subscription' }, { status: 400 })
  }

  // Use service role so we can write regardless of RLS on this route
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Get the calling user from the Authorization header (Supabase JWT)
  const token = req.headers.get('authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: { user }, error: userErr } = await createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ).auth.getUser(token)

  if (userErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (action === 'unsubscribe') {
    await supabase.from('push_subscriptions').delete()
      .eq('user_id', user.id)
      .eq('endpoint', subscription.endpoint)
    return NextResponse.json({ ok: true })
  }

  const keys = subscription.keys as { p256dh: string; auth: string } | undefined
  if (!keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: 'Missing subscription keys' }, { status: 400 })
  }

  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: user.id,
    endpoint: subscription.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
  }, { onConflict: 'user_id,endpoint' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
