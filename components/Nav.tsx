'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/',         label: 'Library',  icon: '📚' },
  { href: '/search',   label: 'Search',   icon: '🔍' },
  { href: '/discover', label: 'Discover', icon: '🧭' },
  { href: '/stats',    label: 'Stats',    icon: '📊' },
  { href: '/shelves',  label: 'Shelves',  icon: '📂' },
]

export default function Nav() {
  const path = usePathname()
  if (path === '/login') return null

  return (
    <>
      {/* Tablet top bar (md only) */}
      <nav className="hidden md:block lg:hidden sticky top-0 z-50" style={{
        background: 'rgba(13,13,18,0.90)',
        backdropFilter: 'blur(14px)',
        borderBottom: 'var(--border-hair)',
      }}>
        <div className="max-w-3xl mx-auto px-4 flex gap-1 py-2">
          {tabs.map(t => {
            const active = path === t.href
            return (
              <Link key={t.href} href={t.href} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', borderRadius: 'var(--r-md)',
                textDecoration: 'none', fontSize: 14, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                background: active ? 'var(--vermillion)' : 'transparent',
                color: active ? '#fff' : 'var(--fg-2)',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--ink-700)' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
                <span>{t.icon}</span><span>{t.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{
        background: 'rgba(9,9,12,0.95)',
        backdropFilter: 'blur(16px)',
        borderTop: 'var(--border-hair)',
      }}>
        <div style={{ display: 'flex' }}>
          {tabs.map(t => {
            const active = path === t.href
            return (
              <Link key={t.href} href={t.href} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 4, padding: '10px 4px 12px', textDecoration: 'none', position: 'relative',
                color: active ? 'var(--fg-1)' : 'var(--fg-3)',
                transition: 'color var(--dur-fast)',
              }}>
                <span style={{ fontSize: 20, lineHeight: 1 }}>{t.icon}</span>
                <span style={{ fontSize: 10, fontWeight: 600, fontFamily: 'var(--font-sans)' }}>{t.label}</span>
                {active && (
                  <span style={{
                    position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                    width: 28, height: 3, background: 'var(--vermillion)',
                    borderRadius: '3px 3px 0 0',
                  }} />
                )}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
