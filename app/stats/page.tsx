'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Manga, type MangaStatus } from '@/lib/supabase'
import { getStatus, type AnimeRow } from '@/lib/anime-data'
import AnimeLinker from '@/components/AnimeLinker'
import DuplicateDetector from '@/components/DuplicateDetector'

const STATUS_LABELS: Record<MangaStatus, string> = {
  reading: 'Reading', completed: 'Completed', on_hold: 'On Hold',
  dropped: 'Dropped', plan_to_read: 'Plan to Read', watching: 'Watching',
}
const STATUS_COLORS: Record<MangaStatus, string> = {
  reading: '#FF2D46', completed: '#2FCF7A',
  on_hold: '#FFB02E', dropped: '#6F6E7C', plan_to_read: '#FFC93D', watching: '#2BE6DC',
}

const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const GOAL_KEY = 'manga_weekly_goal' // localStorage fallback key

interface LogEntry { chapters_read: number; logged_at: string }
interface SwipeEntry { genres: string[]; direction: string }

const HEAT_COLORS = ['#30303D', '#5a0a18', '#a01c30', '#D11B33', '#FF2D46']

function ReadingHeatmap({ log }: { log: LogEntry[] }) {
  const activityMap: Record<string, number> = {}
  log.forEach(l => {
    const d = new Date(l.logged_at).toISOString().slice(0, 10)
    activityMap[d] = (activityMap[d] ?? 0) + l.chapters_read
  })

  // Build 52-week grid starting from the most recent Sunday ≥ 52 weeks ago
  const today = new Date()
  const origin = new Date(today)
  origin.setDate(today.getDate() - 52 * 7)
  origin.setDate(origin.getDate() - origin.getDay()) // align to Sunday

  const weeks: { date: string; chapters: number }[][] = []
  for (let w = 0; w < 53; w++) {
    const week = []
    for (let d = 0; d < 7; d++) {
      const dt = new Date(origin)
      dt.setDate(origin.getDate() + w * 7 + d)
      if (dt > today) break
      const ds = dt.toISOString().slice(0, 10)
      week.push({ date: ds, chapters: activityMap[ds] ?? 0 })
    }
    if (week.length) weeks.push(week)
  }

  const maxCh = Math.max(...Object.values(activityMap), 1)
  const level = (ch: number) => {
    if (!ch) return 0
    const r = ch / maxCh
    return r < 0.25 ? 1 : r < 0.5 ? 2 : r < 0.75 ? 3 : 4
  }

  // Month label positions
  const monthLabels: { label: string; col: number }[] = []
  let lastMonth = -1
  weeks.forEach((week, wi) => {
    const m = new Date(week[0].date).getMonth()
    if (m !== lastMonth) {
      monthLabels.push({ label: new Date(week[0].date).toLocaleDateString('en', { month: 'short' }), col: wi })
      lastMonth = m
    }
  })

  const totalCh = Object.values(activityMap).reduce((s, v) => s + v, 0)
  const activeDays = Object.values(activityMap).filter(Boolean).length

  return (
    <div className="bg-zinc-900 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold">Reading calendar</h2>
        <div className="flex gap-3 text-xs text-zinc-500">
          <span>{totalCh} chapters</span>
          <span>{activeDays} active days</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        {/* Month labels */}
        <div className="flex gap-[3px] mb-1 pl-5 text-[10px] text-zinc-600">
          {weeks.map((_, wi) => {
            const ml = monthLabels.find(m => m.col === wi)
            return <div key={wi} className="w-3 shrink-0">{ml?.label ?? ''}</div>
          })}
        </div>
        <div className="flex gap-[3px]">
          {/* Day labels */}
          <div className="flex flex-col gap-[3px] mr-1 text-[9px] text-zinc-700">
            {['S','M','T','W','T','F','S'].map((d, i) => (
              <div key={i} className={`h-3 flex items-center ${i % 2 ? '' : 'invisible'}`}>{d}</div>
            ))}
          </div>
          {/* Cells */}
          {weeks.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-[3px]">
              {week.map((day, di) => (
                <div key={di}
                  className="w-3 h-3 rounded-sm transition-colors"
                  style={{ backgroundColor: HEAT_COLORS[level(day.chapters)] }}
                  title={`${day.date}: ${day.chapters} chapter${day.chapters !== 1 ? 's' : ''}`}
                />
              ))}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div className="flex items-center gap-1 mt-2 justify-end">
          <span className="text-[10px] text-zinc-600">Less</span>
          {HEAT_COLORS.map((c, i) => <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: c }} />)}
          <span className="text-[10px] text-zinc-600">More</span>
        </div>
      </div>
    </div>
  )
}

function StatCard({ value, label, sub }: { value: string | number; label: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 rounded-xl p-4 text-center">
      <div className="text-2xl md:text-3xl font-bold text-white">{value}</div>
      <div className="text-xs text-zinc-500 mt-1">{label}</div>
      {sub && <div className="text-xs mt-0.5" style={{ color: 'var(--cyan)' }}>{sub}</div>}
    </div>
  )
}

function ProgressRing({ pct, size = 80 }: { pct: number; size?: number }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = (Math.min(pct, 100) / 100) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--ink-500)" strokeWidth="6" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--vermillion)" strokeWidth="6"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 0.5s ease' }} />
    </svg>
  )
}

export default function StatsPage() {
  const [manga, setManga] = useState<Manga[]>([])
  const [animeList, setAnimeList] = useState<AnimeRow[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [swipes, setSwipes] = useState<SwipeEntry[]>([])
  const [goal, setGoal] = useState(10)
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalDraft, setGoalDraft] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const oneYearAgo = new Date(Date.now() - 52 * 7 * 24 * 60 * 60 * 1000).toISOString()
    const [{ data: ml }, { data: lg }, { data: sw }, { data: settings }, { data: al }] = await Promise.all([
      supabase.from('manga_list').select('*'),
      supabase.from('reading_log').select('chapters_read, logged_at').gte('logged_at', oneYearAgo).order('logged_at', { ascending: false }).limit(5000),
      supabase.from('swipe_history').select('genres, direction').eq('direction', 'right').limit(300),
      supabase.from('user_settings').select('key, value'),
      supabase.from('anime_list').select('*'),
    ])
    if (ml) setManga(ml as Manga[])
    if (lg) setLog(lg as LogEntry[])
    if (sw) setSwipes(sw as SwipeEntry[])
    if (al) setAnimeList(al as AnimeRow[])
    // Goal: prefer Supabase, fall back to localStorage
    const remoteGoal = (settings as { key: string; value: string }[] | null)?.find(s => s.key === 'weekly_goal')?.value
    if (remoteGoal) {
      const n = parseInt(remoteGoal, 10)
      if (!isNaN(n) && n > 0) setGoal(n)
    } else {
      const saved = localStorage.getItem(GOAL_KEY)
      if (saved) setGoal(parseInt(saved, 10))
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveGoal = async () => {
    const n = parseInt(goalDraft, 10)
    if (!isNaN(n) && n > 0) {
      setGoal(n)
      localStorage.setItem(GOAL_KEY, String(n)) // keep in sync as offline fallback
      await supabase.from('user_settings').upsert({ key: 'weekly_goal', value: String(n), updated_at: new Date().toISOString() })
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
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-6">Stats</h1>

        {/* Hero stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatCard value={totalChapters.toLocaleString()} label="Chapters read" />
          <StatCard value={manga.length} label="Titles tracked" />
          <StatCard value={`${streak}d`} label="Reading streak" sub={streak > 0 ? 'keep it up!' : 'start today'} />
          <StatCard value={completedCount} label="Completed" />
        </div>

        {/* ── Anime stats ── */}
        {(() => {
          const al = animeList
          const totalAnimeSeries  = al.filter(e => !e.is_movie).length
          const totalAnimeMovies  = al.filter(e =>  e.is_movie).length
          const totalAnimeHours   = al.reduce((s, e) => s + e.total_watch_hours, 0)
          const activeAnime       = al.filter(e => getStatus(e) === 'active').length
          const effectiveRating   = (e: AnimeRow) => e.user_rating ?? e.netflix_rating
          const likedAnime        = al.filter(e => effectiveRating(e) === 'up').length
          const dislikedAnime     = al.filter(e => effectiveRating(e) === 'down').length

          const topAnime = [...al]
            .filter(e => e.total_watch_hours > 0)
            .sort((a, b) => b.total_watch_hours - a.total_watch_hours)
            .slice(0, 5)

          const animeCounts = {
            active: al.filter(e => getStatus(e) === 'active').length,
            paused: al.filter(e => getStatus(e) === 'paused').length,
            older:  al.filter(e => getStatus(e) === 'older').length,
            movie:  al.filter(e => getStatus(e) === 'movie').length,
          }
          const maxAnimeSt = Math.max(...Object.values(animeCounts), 1)

          const ANIME_STATUS_COLORS: Record<string, string> = {
            active: '#2FCF7A', paused: '#FFB02E', older: '#6F6E7C', movie: '#a78bfa',
          }
          const ANIME_STATUS_LABELS: Record<string, string> = {
            active: 'Active', paused: 'Paused', older: 'Older', movie: 'Movies',
          }

          return (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3">Anime</h2>

              {/* Hero cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <StatCard value={totalAnimeSeries} label="Series tracked" />
                <StatCard value={`${totalAnimeHours.toFixed(0)}h`} label="Hours watched" />
                <StatCard value={activeAnime} label="Currently active" sub="last 90 days" />
                <StatCard value={totalAnimeMovies} label="Movies" />
              </div>

              <div className="lg:grid lg:grid-cols-2 lg:gap-4">
                {/* Status breakdown */}
                <div className="bg-zinc-900 rounded-xl p-5 mb-4">
                  <h3 className="text-sm font-semibold mb-4">Status breakdown</h3>
                  <div className="space-y-3">
                    {Object.entries(animeCounts).map(([s, n]) => n > 0 && (
                      <div key={s} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-16 shrink-0">{ANIME_STATUS_LABELS[s]}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all"
                            style={{ backgroundColor: ANIME_STATUS_COLORS[s], width: `${(n / maxAnimeSt) * 100}%` }} />
                        </div>
                        <span className="text-xs text-zinc-500 w-6 text-right shrink-0">{n}</span>
                      </div>
                    ))}
                  </div>
                  {(likedAnime > 0 || dislikedAnime > 0) && (
                    <div className="mt-4 pt-4 border-t border-zinc-800 flex gap-4 text-xs text-zinc-500">
                      <span>👍 {likedAnime} liked</span>
                      <span>👎 {dislikedAnime} disliked</span>
                    </div>
                  )}
                </div>

                {/* Most-watched */}
                {topAnime.length > 0 && (
                  <div className="bg-zinc-900 rounded-xl p-5 mb-4">
                    <h3 className="text-sm font-semibold mb-4">Most time spent</h3>
                    <div className="space-y-3">
                      {topAnime.map((e, i) => (
                        <div key={e.id} className="flex items-center gap-3">
                          <span className="text-xs text-zinc-600 w-4 shrink-0 text-right">{i + 1}</span>
                          <span className="text-xs text-zinc-300 flex-1 truncate">{e.title}</span>
                          <div className="w-20 h-2 bg-zinc-800 rounded-full overflow-hidden shrink-0">
                            <div className="h-full rounded-full" style={{
                              width: `${(e.total_watch_hours / topAnime[0].total_watch_hours) * 100}%`,
                              backgroundColor: 'var(--cyan)',
                            }} />
                          </div>
                          <span className="text-xs text-zinc-500 w-10 text-right shrink-0">{e.total_watch_hours}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        <hr className="border-zinc-800 mb-6" />

        {/* ── Ratings breakdown ── */}
        {(() => {
          const liked    = manga.filter(m => m.user_rating === 'up')
          const disliked = manga.filter(m => m.user_rating === 'down')
          if (liked.length === 0 && disliked.length === 0) return null

          const genreCount = (list: typeof manga) => {
            const acc: Record<string, number> = {}
            list.forEach(m => (m.genres ?? []).forEach(g => { acc[g] = (acc[g] ?? 0) + 1 }))
            return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, 5)
          }
          const likedGenres    = genreCount(liked)
          const dislikedGenres = genreCount(disliked)

          // Anime ratings from Supabase (user_rating overrides netflix_rating)
          const effectiveAnimeRating = (a: AnimeRow) => a.user_rating ?? a.netflix_rating
          const likedAnime    = animeList.filter(a => effectiveAnimeRating(a) === 'up').map(a => a.title)
          const dislikedAnime = animeList.filter(a => effectiveAnimeRating(a) === 'down').map(a => a.title)

          return (
            <div className="mb-6">
              <h2 className="text-lg font-bold mb-3">Your ratings</h2>
              <div className="lg:grid lg:grid-cols-2 lg:gap-4">
                {/* Liked */}
                {liked.length > 0 && (
                  <div className="bg-zinc-900 rounded-xl p-5 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">👍</span>
                      <h3 className="text-sm font-semibold text-emerald-400">{liked.length} liked</h3>
                    </div>
                    <div className="space-y-1 mb-3">
                      {liked.slice(0, 5).map(m => (
                        <p key={m.id} className="text-xs text-zinc-300 truncate">• {m.title}</p>
                      ))}
                      {liked.length > 5 && <p className="text-xs text-zinc-600">+{liked.length - 5} more</p>}
                    </div>
                    {likedGenres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-zinc-800">
                        {likedGenres.map(([g, n]) => (
                          <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/30 border border-emerald-800/40 text-emerald-400">{g} ×{n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Disliked */}
                {disliked.length > 0 && (
                  <div className="bg-zinc-900 rounded-xl p-5 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">👎</span>
                      <h3 className="text-sm font-semibold text-red-400">{disliked.length} disliked</h3>
                    </div>
                    <div className="space-y-1 mb-3">
                      {disliked.slice(0, 5).map(m => (
                        <p key={m.id} className="text-xs text-zinc-300 truncate">• {m.title}</p>
                      ))}
                      {disliked.length > 5 && <p className="text-xs text-zinc-600">+{disliked.length - 5} more</p>}
                    </div>
                    {dislikedGenres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-3 border-t border-zinc-800">
                        {dislikedGenres.map(([g, n]) => (
                          <span key={g} className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 border border-red-800/40 text-red-400">{g} ×{n}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Anime ratings */}
                {(() => {
                  const effectiveRating = (a: AnimeRow) => a.user_rating ?? a.netflix_rating
                  const likedA    = animeList.filter(a => effectiveRating(a) === 'up').map(a => a.title)
                  const dislikedA = animeList.filter(a => effectiveRating(a) === 'down').map(a => a.title)
                  if (!likedA.length && !dislikedA.length) return null
                  return (
                    <div className="bg-zinc-900 rounded-xl p-5 mb-4 lg:col-span-2">
                      <h3 className="text-sm font-semibold mb-3">Anime ratings</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">👍 Liked ({likedA.length})</p>
                          {likedA.slice(0, 5).map(t => <p key={t} className="text-xs text-zinc-300 truncate">• {t}</p>)}
                          {likedA.length > 5 && <p className="text-xs text-zinc-600">+{likedA.length - 5} more</p>}
                        </div>
                        <div>
                          <p className="text-xs text-zinc-500 mb-2">👎 Disliked ({dislikedA.length})</p>
                          {dislikedA.slice(0, 5).map(t => <p key={t} className="text-xs text-zinc-300 truncate">• {t}</p>)}
                          {dislikedA.length > 5 && <p className="text-xs text-zinc-600">+{dislikedA.length - 5} more</p>}
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })()}

        {/* Reading calendar heatmap */}
        <ReadingHeatmap log={log} />

        {/* Two-column layout on lg+ */}
        <div className="lg:grid lg:grid-cols-2 lg:gap-6">
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
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${Math.min(goalPct, 100)}%`, backgroundColor: goalPct >= 100 ? 'var(--cyan)' : 'var(--vermillion)' }} />
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
                    <div className="w-full rounded-t-md transition-all"
                      style={{ height: `${Math.max((d.chapters / maxDay) * 72, d.chapters > 0 ? 4 : 0)}px`, backgroundColor: d.isToday ? 'var(--vermillion)' : 'var(--ink-500)' }} />
                  </div>
                  <span className="text-xs" style={{ color: d.isToday ? 'var(--vermillion)' : 'var(--fg-3)' }}>{d.label}</span>
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
                    <div className="h-full rounded-full transition-all" style={{ backgroundColor: STATUS_COLORS[s], width: `${(n / maxStatus) * 100}%` }} />
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
                  <span style={{ color: 'var(--vermillion)' }}>♥</span>
                  {genre}
                  <span className="text-zinc-600">{score}</span>
                </span>
              ))}
            </div>
          </div>
        )}
        </div>{/* end two-column grid */}

        {/* Taste profile */}
        {(() => {
          // Genre breakdown by chapters read
          const genreChapters: Record<string, number> = {}
          for (const m of manga) {
            if (!m.genres?.length || !m.current_chapter) continue
            for (const g of m.genres) {
              genreChapters[g] = (genreChapters[g] ?? 0) + m.current_chapter
            }
          }
          const topGenres = Object.entries(genreChapters).sort((a, b) => b[1] - a[1]).slice(0, 6)
          if (!topGenres.length) return null
          const maxG = topGenres[0][1]

          // Reading personality
          const topGenre = topGenres[0]?.[0] ?? ''
          const personality: Record<string, string> = {
            Action: '⚔️ Battle-hungry',    Fantasy: '🧙 World-builder',
            Romance: '💝 Heart-seeker',     Horror: '👻 Thrill-chaser',
            Comedy: '😄 Laughter-seeker',  Psychological: '🧠 Mind-explorer',
            Shounen: '🔥 Determined soul', Seinen: '🎯 Thoughtful reader',
            'Sci-Fi': '🚀 Future-gazer',   Drama: '🎭 Story-chaser',
          }

          // Reading speed
          const activeDaysCount = new Set(log.map(l => new Date(l.logged_at).toDateString())).size
          const avgPerActiveDay = activeDaysCount > 0
            ? Math.round(log.reduce((s, l) => s + l.chapters_read, 0) / activeDaysCount)
            : 0

          return (
            <div className="bg-zinc-900 rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold mb-1">Your reading DNA</h2>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-2xl">{personality[topGenre]?.split(' ')[0] ?? '📚'}</span>
                <div>
                  <p className="text-sm font-medium text-white">{personality[topGenre]?.split(' ').slice(1).join(' ') ?? 'Avid reader'}</p>
                  <p className="text-xs text-zinc-500">
                    {avgPerActiveDay > 0 ? `${avgPerActiveDay} chapters per active day` : 'Start logging chapters to see pace'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {topGenres.map(([genre, chapters]) => (
                  <div key={genre} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-400 w-28 shrink-0 truncate">{genre}</span>
                    <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${(chapters / maxG) * 100}%`, backgroundColor: 'var(--vermillion)' }} />
                    </div>
                    <span className="text-xs text-zinc-500 w-16 text-right shrink-0">
                      {chapters.toLocaleString()} ch
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* Personal analytics — Chat's reframe of "social proof" */}
        {(() => {
          // Drop-off analysis: where do you stop reading?
          const droppedOrHold = manga.filter(m => m.status === 'dropped' || m.status === 'on_hold')
          const dropBuckets: Record<string, number> = { '1–25': 0, '26–75': 0, '76–150': 0, '151–300': 0, '300+': 0 }
          for (const m of droppedOrHold) {
            const ch = m.current_chapter
            if (ch <= 25) dropBuckets['1–25']++
            else if (ch <= 75) dropBuckets['26–75']++
            else if (ch <= 150) dropBuckets['76–150']++
            else if (ch <= 300) dropBuckets['151–300']++
            else dropBuckets['300+']++
          }
          const maxDrop = Math.max(...Object.values(dropBuckets), 1)

          // Genre completion rates
          const genreTotal: Record<string, number> = {}
          const genreDone: Record<string, number> = {}
          for (const m of manga) {
            for (const g of (m.genres ?? [])) {
              genreTotal[g] = (genreTotal[g] ?? 0) + 1
              if (m.status === 'completed') genreDone[g] = (genreDone[g] ?? 0) + 1
            }
          }
          const genreRates = Object.entries(genreTotal)
            .filter(([, n]) => n >= 2)
            .map(([g, n]) => ({ genre: g, rate: Math.round(((genreDone[g] ?? 0) / n) * 100), total: n }))
            .sort((a, b) => b.rate - a.rate)
            .slice(0, 6)

          // Session analysis from log
          const byDay: Record<string, number> = {}
          for (const l of log) {
            const d = new Date(l.logged_at).toDateString()
            byDay[d] = (byDay[d] ?? 0) + l.chapters_read
          }
          const sessionValues = Object.values(byDay)
          const avgSession = sessionValues.length
            ? Math.round(sessionValues.reduce((s, v) => s + v, 0) / sessionValues.length)
            : 0
          const maxSession = sessionValues.length ? Math.max(...sessionValues) : 0

          if (!droppedOrHold.length && !genreRates.length && !log.length) return null

          return (
            <div className="lg:grid lg:grid-cols-2 lg:gap-6">
              {/* Drop-off histogram */}
              {droppedOrHold.length > 0 && (
                <div className="bg-zinc-900 rounded-xl p-5 mb-6">
                  <h2 className="text-sm font-semibold mb-1">Where you stop reading</h2>
                  <p className="text-xs text-zinc-500 mb-4">Chapter range when you dropped or paused ({droppedOrHold.length} titles)</p>
                  <div className="space-y-2">
                    {Object.entries(dropBuckets).map(([range, count]) => (
                      <div key={range} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-500 w-16 shrink-0">Ch. {range}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(count / maxDrop) * 100}%`, backgroundColor: 'rgba(255,71,87,0.7)' }} />
                        </div>
                        <span className="text-xs text-zinc-500 w-4 text-right shrink-0">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Genre completion rates */}
              {genreRates.length > 0 && (
                <div className="bg-zinc-900 rounded-xl p-5 mb-6">
                  <h2 className="text-sm font-semibold mb-1">Completion rate by genre</h2>
                  <p className="text-xs text-zinc-500 mb-4">How often you finish what you start</p>
                  <div className="space-y-2">
                    {genreRates.map(({ genre, rate, total }) => (
                      <div key={genre} className="flex items-center gap-3">
                        <span className="text-xs text-zinc-400 w-24 shrink-0 truncate">{genre}</span>
                        <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full"
                            style={{ width: `${rate}%`, backgroundColor: rate >= 70 ? 'var(--success)' : rate >= 40 ? 'var(--screen-yellow)' : 'var(--danger)' }} />
                        </div>
                        <span className="text-xs text-zinc-500 w-14 text-right shrink-0">{rate}% / {total}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Session stats */}
              {log.length > 0 && (
                <div className="bg-zinc-900 rounded-xl p-5 mb-6">
                  <h2 className="text-sm font-semibold mb-4">Reading sessions</h2>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="bg-zinc-800 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold">{avgSession}</div>
                      <div className="text-xs text-zinc-500 mt-1">Avg ch per day</div>
                    </div>
                    <div className="bg-zinc-800 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold">{maxSession}</div>
                      <div className="text-xs text-zinc-500 mt-1">Best single day</div>
                    </div>
                    <div className="bg-zinc-800 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold">{Object.keys(byDay).length}</div>
                      <div className="text-xs text-zinc-500 mt-1">Reading days (yr)</div>
                    </div>
                    <div className="bg-zinc-800 rounded-xl p-3 text-center">
                      <div className="text-2xl font-bold">{droppedOrHold.length}</div>
                      <div className="text-xs text-zinc-500 mt-1">Abandoned titles</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {/* Duplicate detector */}
        <DuplicateDetector manga={manga} onDeleted={id => setManga(prev => prev.filter(m => m.id !== id))} />

        {/* Anime–Manga linker */}
        <AnimeLinker manga={manga} watchedAnime={animeList} />

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
