'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Manga, type MangaStatus } from '@/lib/supabase'

const STATUS_LABELS: Record<MangaStatus, string> = {
  reading: 'Reading', completed: 'Completed', on_hold: 'On Hold',
  dropped: 'Dropped', plan_to_read: 'Plan to Read',
}
const STATUS_COLORS: Record<MangaStatus, string> = {
  reading: 'bg-emerald-500', completed: 'bg-blue-500',
  on_hold: 'bg-yellow-500', dropped: 'bg-red-500', plan_to_read: 'bg-zinc-500',
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const GOAL_KEY = 'manga_weekly_goal'

interface LogEntry { chapters_read: number; logged_at: string }
interface SwipeEntry { genres: string[]; direction: string }

function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-4 text-center">
      <div className="text-2xl md:text-3xl font-bold text-white">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
      {sub && <div className="text-xs text-violet-400 mt-0.5">{sub}</div>}
    </div>
  )
}

function ProgressRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (Math.min(pct, 100) / 100) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#27272a" strokeWidth="6" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#7c3aed" strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
    </svg>
  )
}

export default function StatsPage() {
  const [manga, setManga] = useState<Manga[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [swipes, setSwipes] = useState<SwipeEntry[]>([])
  const [goal, setGoal] = useState(10)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const [{ data: ml }, { data: lg }, { data: sw }] = await Promise.all([
      supabase.from('manga_list').select('*'),
      supabase.from('reading_log').select('chapters_read, logged_at').order('logged_at', { ascending: false }).limit(500),
      supabase.from('swipe_history').select('genres, direction').eq('direction', 'right').limit(300),
    ])
    if (ml) setManga(ml as Manga[])
    if (lg) setLog(lg as LogEntry[])
    if (sw) setSwipes(sw as SwipeEntry[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const saved = localStorage.getItem(GOAL_KEY)
    if (saved) setGoal(parseInt(saved, 10))
  }, [load])

  const saveGoal = () => {
    const n = parseInt(goalDraft, 10)
    if (!isNaN(n) && n > 0) {
      setGoal(n)
      localStorage.setItem(GOAL_KEY, String(n))
    }
    setEditingGoal(false)
  }

  if (loading) return <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center"><div className="text-zinc-500 text-sm">Loading…</div></main>

  // ── Computed stats ─────────────────────────────────────────────────────────
  const totalChapters = manga.reduce((s, m) => s + m.current_chapter, 0)
  const totalEpisodes = manga.reduce((s, m) => s + m.episodes_watched, 0)
  const counts = manga.reduce((acc, m) => { acc[m.status] = (acc[m.status] ?? 0) + 1; return acc }, {} as Record<string, number>)
  const completedCount = counts.completed ?? 0

  // Reading streak from log
  const logDates = new Set(log.map(l => new Date(l.logged_at).toDateString()))
  let streak = 0
  const today = new Date()
  for (let i = 0; i < 365; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    if (logDates.has(d.toDateString())) streak++
    else break
  }

  // Weekly chapters (Mon–Sun of current week)
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay() + (today.getDay() === 0 ? -6 : 1))
  weekStart.setHours(0, 0, 0, 0)
  const weekChapters = log
    .filter(l => new Date(l.logged_at) >= weekStart)
    .reduce((s, l) => s + l.chapters_read, 0)
  const goalPct = goal > 0 ? Math.round((weekChapters / goal) * 100) : 0

  // Last 7 days activity
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (6 - i))
    const ds = d.toDateString()
    const chs = log.filter(l => new Date(l.logged_at).toDateString() === ds)
                   .reduce((s, l) => s + l.chapters_read, 0)
    return { label: DAYS[d.getDay()], chapters: chs, isToday: i === 6 }
  })
  const maxDay = Math.max(...last7.map(d => d.chapters), 1)

  // Genre preferences
  const genreScore: Record<string, number> = {}
  swipes.forEach(s => s.genres.forEach(g => { genreScore[g] = (genreScore[g] ?? 0) + 1 }))
  const topGenres = Object.entries(genreScore).sort((a, b) => b[1] - a[1]).slice(0, 8)

  const maxStatus = Math.max(...Object.values(counts), 1)

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-6">Stats</h1>

        {/* Hero stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard value={totalChapters.toLocaleString()} label="Chapters read" />
          <StatCard value={manga.length} label="Titles tracked" />
          <StatCard value={`${streak}d`} label="Reading streak" sub={streak > 0 ? 'keep it up!' : 'start today'} />
          <StatCard value={completedCount} label="Completed" />
        </div>

        {/* Anime stats */}
        {totalEpisodes > 0 && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <StatCard value={totalEpisodes} label="Episodes watched" />
            <StatCard value={manga.filter(m => m.has_anime).length} label="With anime" />
          </div>
        )}

        {/* Reading goal */}
        <div className="bg-zinc-900 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Weekly reading goal</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                {weekChapters} / {goal} chapters this week
              </p>
            </div>
            {editingGoal ? (
              <div className="flex gap-2 items-center">
                <input autoFocus value={goalDraft} onChange={e => setGoalDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveGoal(); if (e.key === 'Escape') setEditingGoal(false) }}
                  onBlur={saveGoal} type="number" min={1}
                  className="w-16 bg-zinc-800 border border-zinc-600 rounded-lg px-2 py-1 text-sm text-center outline-none" />
                <span className="text-xs text-zinc-500">ch/week</span>
              </div>
            ) : (
              <button onClick={() => { setGoalDraft(String(goal)); setEditingGoal(true) }}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">
                Edit goal
              </button>
            )}
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing pct={goalPct} size={72} />
            <div className="flex-1">
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                <span>Progress</span><span>{goalPct}%</span>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-violet-500 rounded-full transition-all"
                  style={{ width: `${Math.min(goalPct, 100)}%` }} />
              </div>
              {weekChapters >= goal && (
                <p className="text-xs text-emerald-400 mt-1.5">🎉 Goal achieved this week!</p>
              )}
            </div>
          </div>
        </div>

        {/* 7-day activity chart */}
        <div className="bg-zinc-900 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold mb-4">7-day activity</h2>
          {log.length === 0 ? (
            <p className="text-xs text-zinc-600">No log data yet — start reading to see your activity here.</p>
          ) : (
            <div className="flex items-end gap-2 h-24">
              {last7.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: '72px' }}>
                    <div className={`w-full rounded-t-md transition-all ${d.isToday ? 'bg-violet-500' : 'bg-zinc-700'}`}
                      style={{ height: `${Math.max((d.chapters / maxDay) * 72, d.chapters > 0 ? 4 : 0)}px` }} />
                  </div>
                  <span className={`text-xs ${d.isToday ? 'text-violet-400' : 'text-zinc-600'}`}>{d.label}</span>
                  {d.chapters > 0 && <span className="text-xs text-zinc-500">{d.chapters}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Status breakdown */}
        <div className="bg-zinc-900 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold mb-4">Status breakdown</h2>
          <div className="space-y-3">
            {(Object.keys(STATUS_LABELS) as MangaStatus[]).map(s => {
              const n = counts[s] ?? 0
              if (n === 0) return null
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 w-24 shrink-0">{STATUS_LABELS[s]}</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${STATUS_COLORS[s]}`}
                      style={{ width: `${(n / maxStatus) * 100}%` }} />
                  </div>
                  <span className="text-xs text-zinc-500 w-6 text-right shrink-0">{n}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Genre preferences */}
        {topGenres.length > 0 && (
          <div className="bg-zinc-900 rounded-xl p-5 mb-6">
            <h2 className="text-sm font-semibold mb-1">Your taste</h2>
            <p className="text-xs text-zinc-500 mb-4">From your Discover swipes</p>
            <div className="flex flex-wrap gap-2">
              {topGenres.map(([genre, score]) => (
                <span key={genre}
                  className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-full text-xs text-zinc-300 flex items-center gap-1.5">
                  <span className="text-violet-400">♥</span>
                  {genre}
                  <span className="text-zinc-600">{score}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* All-time totals */}
        <div className="bg-zinc-900 rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">All time</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="flex justify-between">
              <span className="text-zinc-500">Chapters read</span>
              <span className="font-medium">{totalChapters.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Avg per title</span>
              <span className="font-medium">{manga.length > 0 ? Math.round(totalChapters / manga.length) : 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Longest manga</span>
              <span className="font-medium">{manga.length > 0 ? Math.max(...manga.map(m => m.current_chapter)) : 0} ch</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Swipes logged</span>
              <span className="font-medium">{swipes.length}</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
