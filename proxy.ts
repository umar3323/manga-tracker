import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must not write any logic between createServerClient and getUser()
  const { data: { user } } = await supabase.auth.getUser()

  const isLoginPage = request.nextUrl.pathname === '/login'
  const isCallback = request.nextUrl.pathname.startsWith('/auth/')
  const isPublicShare = request.nextUrl.pathname.startsWith('/share/')
  const isPublicPage = request.nextUrl.pathname === '/install'
  const p = request.nextUrl.pathname
  // Cron + warmup routes secure themselves (CRON_SECRET Bearer header) —
  // Vercel sends no session cookie, so they must be exempt from auth redirect.
  const isPublicApi =
    p === '/api/feature-request' ||
    p.startsWith('/api/cron/') ||
    p === '/api/warmup' ||
    // Warmup sub-routes: public catalog aggregation (no per-user data).
    // The cron job calls /api/warmup which fan-outs to these; they carry no
    // session cookie so they must be exempt from the auth redirect.
    p === '/api/catalog' ||
    p === '/api/shonenjump' ||
    p === '/api/goodreads' ||
    p === '/api/webtoons' ||
    p === '/api/mangaplus' ||
    // General Jikan proxy — forwards to api.jikan.moe server-side.
    // Public anime/manga data only; no user data returned.
    p === '/api/jikan-proxy'

  if (!user && !isLoginPage && !isCallback && !isPublicShare && !isPublicApi && !isPublicPage) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (user && isLoginPage) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
