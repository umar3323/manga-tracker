'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase, type Manga } from '@/lib/supabase'

const NAV = [
  { href: '/',         label: 'Library',  icon: '▤' },
  { href: '/search',   label: 'Search',   icon: '⌕' },
  { href: '/discover', label: 'Discover', icon: '◎' },
  { href: '/anime',    label: 'Anime',    icon: '▷' },
  { href: '/stats',    label: 'Stats',    icon: '◈' },
  { href: '/shelves',  label: 'Shelves',  icon: '⊟' },
  { href: '/sources',  label: 'Sources',  icon: '⊕' },
]

const GOAL_KEY = 'manga_weekly_goal'

export default function Sidebar() {
  const path = usePathname()
  const [reading, setReading] = useState<Manga[]>([])
  const [streak, setStreak] = useState(0)
  const [weekChapters, setWeekChapters] = useState(0)
  const [goal, setGoal] = useState(10)

  useEffect(() => {
    if (path === '/login') return
    const saved = localStorage.getItem(GOAL_KEY)
    if (saved) setGoal(parseInt(saved, 10))

    supabase.from('manga_list')
      .select('id, title, current_chapter, cover_url, last_read_at, total_chapters, status, mal_id, authors, genres, has_anime, anime_mal_id, anime_title, episodes_watched, total_episodes, notes, created_at, updated_at')
      .eq('status', 'reading')
      .order('last_read_at', { ascending: false })
      .limit(6)
      .then(({ data }) => { if (data) setReading(data as Manga[]) })

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
    weekStart.setHours(0, 0, 0, 0)

    supabase.from('reading_log').select('chapters_read')
      .gte('logged_at', weekStart.toISOString())
      .then(({ data }) => {
        if (data) setWeekChapters(data.reduce((s, l) => s + l.chapters_read, 0))
      })

    supabase.from('reading_log').select('logged_at')
      .order('logged_at', { ascending: false }).limit(400)
      .then(({ data }) => {
        if (!data) return
        const dates = new Set(data.map(l => new Date(l.logged_at).toDateString()))
        let s = 0
        const today = new Date()
        for (let i = 0; i < 365; i++) {
          const d = new Date(today); d.setDate(today.getDate() - i)
          if (dates.has(d.toDateString())) s++
          else break
        }
        setStreak(s)
      })
  }, [path])

  const goalPct = Math.min(100, Math.round((weekChapters / goal) * 100))
  const hero = reading[0]

  if (path === '/login') return null

  return (
    <aside className="hidden lg:flex" style={{
      width: 260,
      flexShrink: 0,
      background: 'var(--ink-900)',
      borderRight: '1px solid var(--ink-600)',
      flexDirection: 'column',
      height: '100vh',
      position: 'sticky',
      top: 0,
      overflowY: 'auto',
      overflowX: 'hidden',
    }}>

      {/* ── BRAND ── */}
      <div style={{ padding: '20px 18px 16px', borderBottom: '1px solid var(--ink-600)' }}>
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, background: 'var(--vermillion)',
            borderRadius: 8, display: 'grid', placeItems: 'center', flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255,45,70,0.4), 0 0 18px rgba(255,45,70,0.25)',
          }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, color: '#fff', lineHeight: 1 }}>Y</span>
          </div>
          <span style={{
            fontFamily: "'Osaka Pulse', var(--font-display)",
            fontSize: 30, letterSpacing: '1px',
            color: 'var(--fg-1)', lineHeight: 1, position: 'relative', top: 3,
          }}>
            YOMU<span style={{ color: 'var(--vermillion)' }}>.</span>
          </span>
        </Link>
      </div>

      {/* ── NOW READING HERO ── */}
      {hero && (
        <Link href="/" style={{ display: 'block', textDecoration: 'none', margin: '14px 14px 0', position: 'relative', borderRadius: 12, overflow: 'hidden', flexShrink: 0, minHeight: 90 }}>
          {hero.cover_url && (
            <div style={{
              position: 'absolute', inset: 0,
              backgroundImage: `url(${hero.cover_url})`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              filter: 'blur(18px) brightness(0.35)',
              transform: 'scale(1.12)',
            }} />
          )}
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(9,9,12,0.95) 20%, rgba(9,9,12,0.35) 100%)' }} />
          <div style={{ position: 'relative', display: 'flex', gap: 12, padding: '12px 12px 14px', alignItems: 'flex-end' }}>
            {hero.cover_url && (
              <img src={hero.cover_url} alt={hero.title}
                style={{ width: 46, aspectRatio: '2/3', objectFit: 'cover', borderRadius: 6, flexShrink: 0, boxShadow: '0 4px 14px rgba(0,0,0,0.7)' }} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--vermillion)', marginBottom: 3 }}>Now Reading</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{hero.title}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)', marginTop: 5 }}>
                Ch.{hero.current_chapter}{hero.total_chapters ? ` / ${hero.total_chapters}` : ''}
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* ── NAV ── */}
      <nav style={{ padding: '14px 10px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
        {NAV.map(n => {
          const active = path === n.href
          return (
            <Link key={n.href} href={n.href} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '9px 10px', borderRadius: 9, textDecoration: 'none',
              background: active ? 'var(--vermillion-tint)' : 'transparent',
              color: active ? 'var(--fg-1)' : 'var(--fg-3)',
              fontWeight: active ? 700 : 500,
              fontSize: 14, fontFamily: 'var(--font-sans)',
              transition: 'all 120ms ease',
              position: 'relative',
            }}
            onMouseEnter={e => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = 'var(--ink-700)'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--fg-1)'
              }
            }}
            onMouseLeave={e => {
              if (!active) {
                (e.currentTarget as HTMLElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLElement).style.color = 'var(--fg-3)'
              }
            }}>
              {active && (
                <span style={{
                  position: 'absolute', left: -10, top: 8, bottom: 8,
                  width: 3, background: 'var(--vermillion)',
                  borderRadius: '0 3px 3px 0',
                }} />
              )}
              <span style={{
                fontSize: 17, lineHeight: 1, width: 22, textAlign: 'center',
                color: active ? 'var(--vermillion)' : 'inherit',
              }}>{n.icon}</span>
              <span>{n.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* ── STATS ROW ── */}
      <div style={{ margin: '18px 14px 0', display: 'flex', gap: 8 }}>
        <div style={{
          flex: 1, background: 'var(--ink-700)', border: '1px solid var(--ink-600)',
          borderRadius: 10, padding: '10px 12px',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 700, color: 'var(--fg-1)', lineHeight: 1 }}>{weekChapters}</div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-4)', marginTop: 4 }}>Ch. this week</div>
          <div style={{ marginTop: 8, height: 3, background: 'var(--ink-500)', borderRadius: 99, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${goalPct}%`, background: goalPct >= 100 ? 'var(--cyan)' : 'var(--vermillion)', borderRadius: 99, transition: 'width 380ms ease' }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-4)', marginTop: 4 }}>goal: {goal}</div>
        </div>
        {streak > 0 && (
          <div style={{
            background: 'var(--ink-700)', border: '1px solid var(--ink-600)',
            borderRadius: 10, padding: '10px 12px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 64,
          }}>
            <div style={{ fontSize: 18 }}>🔥</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--screen-yellow)', lineHeight: 1, marginTop: 3 }}>{streak}</div>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-4)', marginTop: 3 }}>streak</div>
          </div>
        )}
      </div>

      {/* ── UP NEXT ── */}
      {reading.length > 1 && (
        <div style={{ margin: '18px 0 0' }}>
          <div style={{ padding: '0 18px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--fg-4)' }}>Up Next</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '0 10px' }}>
            {reading.slice(1, 5).map(m => (
              <Link key={m.id} href="/" style={{
                display: 'flex', gap: 10, alignItems: 'center', padding: '7px 8px',
                borderRadius: 8, textDecoration: 'none', transition: 'background 120ms ease',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--ink-700)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                {m.cover_url
                  ? <img src={m.cover_url} alt="" style={{ width: 28, aspectRatio: '2/3', objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <div style={{ width: 28, aspectRatio: '2/3', background: 'var(--ink-600)', borderRadius: 4, flexShrink: 0 }} />
                }
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fg-2)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{m.title}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>Ch.{m.current_chapter}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1 }} />

      {/* ── FOOTER ── */}
      <div style={{ padding: '12px 18px 16px', borderTop: '1px solid var(--ink-600)', fontSize: 10, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
        YOMU · your manga life
      </div>
    </aside>
  )
}
