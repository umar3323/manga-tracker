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
    <nav className="sticky top-0 z-50 bg-[#0d0d0d]/90 backdrop-blur border-b border-zinc-800">
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
  )
}
