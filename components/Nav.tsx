'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/',         label: 'My List',  icon: '📚' },
  { href: '/search',   label: 'Search',   icon: '🔍' },
  { href: '/discover', label: 'Discover', icon: '✨' },
]

export default function Nav() {
  const path = usePathname()
  if (path === '/login') return null

  return (
    <>
      {/* ── Desktop: sticky top bar ─────────────────────────────────── */}
      <nav className="hidden md:block sticky top-0 z-50 bg-[#0d0d0d]/90 backdrop-blur border-b border-zinc-800">
        <div className="max-w-3xl mx-auto px-4 flex gap-1 py-2">
          {tabs.map(t => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                path === t.href
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* ── Mobile: fixed bottom bar ────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-[#0d0d0d]/95 backdrop-blur-lg border-t border-zinc-800 safe-area-inset-bottom">
        <div className="flex">
          {tabs.map(t => (
            <Link
              key={t.href}
              href={t.href}
              className={`flex-1 flex flex-col items-center gap-1 py-3 transition-colors ${
                path === t.href ? 'text-white' : 'text-zinc-500'
              }`}
            >
              <span className="text-xl leading-none">{t.icon}</span>
              <span className={`text-xs font-medium ${path === t.href ? 'text-white' : 'text-zinc-500'}`}>
                {t.label}
              </span>
              {path === t.href && (
                <span className="absolute bottom-0 w-8 h-0.5 bg-violet-500 rounded-full" />
              )}
            </Link>
          ))}
        </div>
      </nav>
    </>
  )
}
