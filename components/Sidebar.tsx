'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase, type Manga } from '@/lib/supabase'

const NAV = [
  { href: '/',         label: 'Library',  lucide: 'library-big' },
  { href: '/search',   label: 'Search',   lucide: 'search' },
  { href: '/discover', label: 'Discover', lucide: 'compass' },
  { href: '/stats',    label: 'Stats',    lucide: 'flame' },
  { href: '/shelves',  label: 'Shelves',  lucide: 'folder-open' },
]

const GOAL_KEY = 'manga_weekly_goal'

// Simple Lucide icon via SVG sprite — we inline just the paths we need
// to keep bundle size minimal (no CDN in Next.js app)
function NavIcon({ name, size = 20, color = 'currentColor' }: { name: string; size?: number; color?: string }) {
  const paths: Record<string, string> = {
    'library-big': 'M10 3H6a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h4M6 3h.01M10 3v18M14 3h4a2 2 0 0 1 2 2v3M14 3v18m0 0h4a2 2 0 0 0 2-2v-3',
    'search': 'M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z',
    'compass': 'M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm4.5 5.5-5 2.5-2.5 5 5-2.5 2.5-5z',
    'flame': 'M12 2c0 0-4 5.5-4 9a4 4 0 0 0 8 0c0-3.5-4-9-4-9zm0 11a2 2 0 0 1-2-2c0-1.5 2-4 2-4s2 2.5 2 4a2 2 0 0 1-2 2z',
    'folder-open': 'M5 19a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4l2 2h4a2 2 0 0 1 2 2v1H5m0 3h14a2 2 0 0 1 2 2l-1 5H4L3 14a2 2 0 0 1 2-2z',
    'settings': 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.2-2.3a7 7 0 0 0 .1-1.4c0-.5 0-.9-.1-1.3l2.8-2.2c.3-.2.3-.6.1-.9l-2.7-4.6c-.2-.3-.6-.4-.9-.3l-3.3 1.3c-.7-.5-1.4-.9-2.2-1.2L12.4 2c0-.3-.3-.6-.6-.6h-5.4c-.3 0-.6.3-.6.6l-.5 3.1c-.8.3-1.5.7-2.2 1.2L0 5c-.3-.1-.7 0-.9.3L.4 9.9c-.2.3-.1.7.1.9l2.8 2.2c-.1.4-.1.8-.1 1.3s0 .9.1 1.3l-2.8 2.2c-.3.2-.3.6-.1.9l2.7 4.6c.2.3.6.4.9.3l3.3-1.3c.7.5 1.4.9 2.2 1.2l.5 3.1c0 .3.3.6.6.6h5.4c.3 0 .6-.3.6-.6l.5-3.1c.8-.3 1.5-.7 2.2-1.2l3.3 1.3c.3.1.7 0 .9-.3l2.7-4.6c.2-.3.1-.7-.1-.9l-2.8-2.2z',
  }
  const d = paths[name]
  if (!d) return <span style={{ display: 'inline-block', width: size, height: size }} />
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

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
      .select('id, title, current_chapter, cover_url, last_read_at, total_chapters, status, mal_id, authors, has_anime, anime_mal_id, anime_title, episodes_watched, total_episodes, notes, created_at, updated_at')
      .eq('status', 'reading')
      .order('last_read_at', { ascending: false })
      .limit(5)
      .then(({ data }) => { if (data) setReading(data as Manga[]) })

    const weekStart = new Date()
    weekStart.setDate(weekStart.getDate() - weekStart.getDay() + (weekStart.getDay() === 0 ? -6 : 1))
    weekStart.setHours(0, 0, 0, 0)

    supabase.from('reading_log')
      .select('chapters_read, logged_at')
      .gte('logged_at', weekStart.toISOString())
      .then(({ data }) => {
        if (data) setWeekChapters(data.reduce((s, l) => s + l.chapters_read, 0))
      })

    supabase.from('reading_log')
      .select('logged_at')
      .order('logged_at', { ascending: false })
      .limit(400)
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

  if (path === '/login') return null

  return (
    <aside style={{
      width: 244,
      flexShrink: 0,
      background: 'var(--ink-900)',
      borderRight: 'var(--border-hair)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px 14px',
      height: '100vh',
      position: 'sticky',
      top: 0,
      overflowY: 'auto',
    }} className="hidden lg:flex">
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '0 8px 22px', borderBottom: 'var(--border-hair)', marginBottom: 16 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 'var(--r-sm)',
          background: 'var(--vermillion)', display: 'grid', placeItems: 'center',
          boxShadow: 'var(--glow-vermillion)', flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: '#fff', lineHeight: 1 }}>Y</span>
        </div>
        <span style={{ fontFamily: "'Osaka Pulse', var(--font-display)", fontSize: 34, letterSpacing: '1px', color: 'var(--fg-1)', lineHeight: 1, position: 'relative', top: 4 }}>
          YOMU<span style={{ color: 'var(--vermillion)' }}>.</span>
        </span>
      </div>

      {/* Nav */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
        {NAV.map(n => {
          const active = path === n.href
          return (
            <Link key={n.href} href={n.href} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
              borderRadius: 'var(--r-md)', textDecoration: 'none', position: 'relative',
              background: active ? 'var(--vermillion-tint)' : 'transparent',
              color: active ? 'var(--fg-1)' : 'var(--fg-2)',
              fontWeight: 600, fontSize: 14, fontFamily: 'var(--font-sans)',
              transition: 'all var(--dur-fast) var(--ease-out)',
            }}
            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--ink-700)' }}
            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}>
              {active && (
                <span style={{
                  position: 'absolute', left: -14, top: 8, bottom: 8, width: 3,
                  background: 'var(--vermillion)', borderRadius: '0 3px 3px 0',
                }} />
              )}
              <NavIcon name={n.lucide} size={20} color={active ? 'var(--vermillion)' : 'var(--fg-3)'} />
              <span>{n.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* Weekly goal widget */}
      <div style={{
        margin: '20px 4px 0',
        background: 'var(--ink-700)', border: 'var(--border-hair)',
        borderRadius: 'var(--r-lg)', padding: '14px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="yomu-eyebrow">This week</span>
          {streak > 0 && (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--screen-yellow)', fontWeight: 700 }}>
              {streak}d streak
            </span>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>
            {weekChapters} / {goal} ch
          </span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{goalPct}%</span>
        </div>
        <div style={{ height: 6, background: 'var(--ink-500)', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
          <div style={{
            height: '100%', width: `${goalPct}%`,
            background: goalPct >= 100 ? 'var(--cyan)' : 'var(--vermillion)',
            borderRadius: 'var(--r-pill)', transition: `width var(--dur-slow) var(--ease-out)`,
          }} />
        </div>
      </div>

      {/* Continue reading */}
      {reading.length > 0 && (
        <div style={{ marginTop: 20, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <span className="yomu-eyebrow" style={{ padding: '0 4px 10px', display: 'block' }}>Continue Reading</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {reading.slice(0, 4).map(m => (
              <Link key={m.id} href="/" style={{
                display: 'flex', gap: 10, alignItems: 'center',
                padding: '7px 8px', borderRadius: 'var(--r-md)', textDecoration: 'none',
                transition: 'background var(--dur-fast)',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--ink-700)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                {m.cover_url
                  ? <img src={m.cover_url} alt="" style={{ width: 30, aspectRatio: '2/3', objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                  : <div style={{ width: 30, aspectRatio: '2/3', background: 'var(--ink-500)', borderRadius: 4, flexShrink: 0 }} />
                }
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>CH {m.current_chapter}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* User */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 8px 0', borderTop: 'var(--border-hair)', marginTop: 'auto', paddingTop: 12,
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--vermillion), var(--vermillion-deep))',
          display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 800, fontSize: 14, flexShrink: 0,
        }}>M</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-1)' }}>My Library</div>
          {streak > 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>{streak}-day streak</div>}
        </div>
        <NavIcon name="settings" size={18} color="var(--fg-3)" />
      </div>
    </aside>
  )
}
