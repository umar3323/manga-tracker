'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/',       label: 'Library', icon: '▤' },
  { href: '/search', label: 'Search',  icon: '⌕' },
  { href: '/anime',  label: 'Anime',   icon: '▷' },
  { href: '/stats',  label: 'Stats',   icon: '◈' },
  { href: '/shelves',label: 'Shelves', icon: '⊟' },
]

export default function Nav() {
  const path = usePathname()
  if (path === '/login') return null

  return (
    <>
      {/* ── TABLET: icon rail on the left (md only) ── */}
      <nav className="hidden md:flex lg:hidden" style={{
        width: 68, flexShrink: 0, flexDirection: 'column',
        alignItems: 'center', gap: 4, padding: '18px 8px',
        background: 'var(--ink-900)', borderRight: '1px solid var(--ink-600)',
        height: '100vh', position: 'sticky', top: 0,
      }}>
        <Link href="/" style={{
          width: 36, height: 36, background: 'var(--vermillion)', borderRadius: 9,
          display: 'grid', placeItems: 'center', textDecoration: 'none', marginBottom: 14, flexShrink: 0,
          boxShadow: '0 0 0 1px rgba(255,45,70,0.4), 0 0 16px rgba(255,45,70,0.2)',
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#fff', lineHeight: 1 }}>Y</span>
        </Link>

        {tabs.map(t => {
          const active = path === t.href || (t.href === '/search' && path === '/discover')
          return (
            <Link key={t.href} href={t.href} title={t.label} style={{
              width: 46, height: 46, borderRadius: 12,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
              textDecoration: 'none',
              background: active ? 'var(--vermillion-tint)' : 'transparent',
              color: active ? 'var(--fg-1)' : 'var(--fg-4)',
              transition: 'all 120ms ease', position: 'relative',
            }}
            onMouseEnter={e => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = 'var(--ink-700)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--fg-2)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--fg-4)'
              }
            }}>
              {active && (
                <span style={{
                  position: 'absolute', left: -8, top: 10, bottom: 10,
                  width: 3, background: 'var(--vermillion)', borderRadius: '0 3px 3px 0',
                }} />
              )}
              <span style={{ fontSize: 20, lineHeight: 1, color: active ? 'var(--vermillion)' : 'inherit' }}>{t.icon}</span>
              <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-sans)' }}>{t.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── MOBILE: floating pill bottom bar ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{ padding: '0 12px 12px' }}>
        <div style={{
          background: 'rgba(9,9,12,0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--ink-600)',
          borderRadius: 20,
          display: 'flex',
          padding: '6px 4px',
          boxShadow: '0 -2px 24px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.04)',
        }}>
          {tabs.map(t => {
            const active = path === t.href
            return (
              <Link key={t.href} href={t.href} style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 3, padding: '7px 4px 6px', textDecoration: 'none',
                borderRadius: 14,
                background: active ? 'var(--vermillion-tint)' : 'transparent',
                transition: 'background 120ms ease',
              }}>
                <span style={{
                  fontSize: 21, lineHeight: 1,
                  color: active ? 'var(--vermillion)' : 'var(--fg-3)',
                  transition: 'color 120ms ease',
                }}>{t.icon}</span>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
                  textTransform: 'uppercase', fontFamily: 'var(--font-sans)',
                  color: active ? 'var(--fg-1)' : 'var(--fg-4)',
                  transition: 'color 120ms ease',
                }}>{t.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
