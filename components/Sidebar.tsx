'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase, type Manga } from '@/lib/supabase'

const NAV = [
  { href: '/',         label: 'My List',  icon: '📚' },
  { href: '/search',   label: 'Search',   icon: '🔍' },
  { href: '/discover', label: 'Discover', icon: '✨' },
  { href: '/stats',    label: 'Stats',    icon: '📊' },
  { href: '/shelves',  label: 'Shelves',  icon: '📂' },
]

const GOAL_KEY = 'manga_weekly_goal'

export default function Sidebar() {
  const path = usePathname()
  const [reading, setReading] = useState<Manga[]>([])
  const [streak, setStreak] = useState(0)
  const [weekChapters, setWeekChapters] = useState(0)
  const [goal, setGoal] = useState(10)

  if (path === '/login') return null

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
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
  }, [])

  const goalPct = Math.min(100, Math.round((weekChapters / goal) * 100))

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 min-h-screen bg-[#0d0d0d] border-r border-zinc-800 sticky top-0 overflow-y-auto">
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 border-b border-zinc-800">
        <h1 className="text-lg font-bold tracking-tight text-white">Manga Tracker</h1>
        <p className="text-xs text-zinc-500 mt-0.5">manga-tracker-hazel.vercel.app</p>
      </div>

      {/* Nav */}
      <nav className="px-3 pt-4 space-y-0.5">
        {NAV.map(t => (
          <Link key={t.href} href={t.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              path === t.href
                ? 'bg-white text-black'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
            }`}>
            <span className="text-base">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        ))}
      </nav>

      {/* Streak + goal widget */}
      <div className="mx-3 mt-5 bg-zinc-900 rounded-xl p-4 border border-zinc-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-400">This week</span>
          <span className="text-xs text-zinc-600">{streak > 0 ? `🔥 ${streak}d streak` : 'No streak yet'}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-zinc-500 mb-1.5">
          <span>{weekChapters} / {goal} chapters</span>
          <span>{goalPct}%</span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${goalPct}%` }} />
        </div>
      </div>

      {/* Currently reading */}
      {reading.length > 0 && (
        <div className="mx-3 mt-4 mb-4">
          <p className="text-xs font-medium text-zinc-500 px-1 mb-2">Currently reading</p>
          <div className="space-y-1">
            {reading.map(m => (
              <Link key={m.id} href="/"
                className="flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-zinc-800 transition-colors group">
                {m.cover_url
                  ? <img src={m.cover_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
                  : <div className="w-7 h-9 bg-zinc-800 rounded shrink-0" />
                }
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-300 truncate group-hover:text-white">{m.title}</p>
                  <p className="text-xs text-zinc-600">Ch. {m.current_chapter}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
