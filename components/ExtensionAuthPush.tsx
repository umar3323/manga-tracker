'use client'

// ExtensionAuthPush — Fix 4 for YOMU Watch Tracker Chrome extension
//
// Pushes the Supabase session token directly to the extension via
// window.postMessage whenever auth state changes (login, token refresh, etc.).
//
// The extension's background.js injects a listener on this domain that
// forwards the message as a SET_AUTH_TOKEN internal message. This is more
// reliable than cookie scraping because:
//   1. It fires immediately on login, not just when the user navigates to YOMU
//   2. It survives Supabase cookie format changes
//   3. It works on token refresh (Supabase refreshes ~every 55 min)

import { useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function ExtensionAuthPush() {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    function pushToken(token: string | null | undefined) {
      if (!token) return
      // background.js injects a listener on this domain that catches this message
      window.postMessage({ type: 'YOMU_PUSH_TOKEN', token }, window.location.origin)
    }

    // Push on initial load if already logged in
    supabase.auth.getSession().then(({ data }) => {
      pushToken(data.session?.access_token)
    })

    // Push on every subsequent auth change (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      pushToken(session?.access_token)
    })

    return () => subscription.unsubscribe()
  }, [])

  return null
}
