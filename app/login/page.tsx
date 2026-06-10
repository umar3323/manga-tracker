'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('error') === 'auth_failed') {
      setError('Magic link expired or invalid — request a new one.')
    }
  }, [searchParams])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    setError('')

    const redirectTo =
      typeof window !== 'undefined'
        ? `${window.location.origin}/auth/callback`
        : `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 text-center">
        <div className="text-2xl mb-3">📬</div>
        <p className="text-sm text-zinc-300 font-medium">Check your email</p>
        <p className="text-sm text-zinc-500 mt-1">
          A magic link has been sent to <span className="text-white">{email}</span>.
          Click it to sign in.
        </p>
        <button
          onClick={() => setSent(false)}
          className="mt-4 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Use a different email
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleLogin} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
      <div>
        <label htmlFor="email" className="block text-xs text-zinc-500 mb-1.5">
          Email address
        </label>
        <input
          id="email"
          type="email"
          autoFocus
          autoComplete="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={loading || !email.trim()}
        className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 disabled:opacity-40 transition-colors"
      >
        {loading ? 'Sending…' : 'Send magic link'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Manga Tracker</h1>
          <p className="text-zinc-500 text-sm mt-1">Sign in to access your list</p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
        <p className="mt-6 text-center text-xs text-zinc-600">
          On your phone?{' '}
          <Link href="/install" className="text-zinc-400 underline underline-offset-2 hover:text-white transition-colors">
            Add YOMU to your home screen
          </Link>
        </p>
      </div>
    </main>
  )
}
