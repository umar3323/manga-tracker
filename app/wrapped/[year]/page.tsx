'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase, type Manga } from '@/lib/supabase'
import type { AnimeRow } from '@/lib/anime-data'

interface LogEntry {
  chapters_read: number
  logged_at: string
  manga_id: string
}

interface WrappedData {
  year: number
  totalChapters: number
  totalManga: number
  totalCompleted: number
  topGenres: [string, number][]
  topManga: { title: string; chapters: number; cover_url: string | null }[]
  mostActiveMonth: string
  monthlyChapters: { month: string; chapters: number }[]
  totalAnimeHours: number
  longestStreak: number
  readingDays: number
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function StatSlide({ label, value, sub, accent = '#FF2D46' }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 min-h-[200px]">
      <div className="text-6xl md:text-8xl font-black tabular-nums" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-xl md:text-2xl font-semibold text-white mt-3">{label}</div>
      {sub && <div className="text-sm text-zinc-400 mt-2">{sub}</div>}
    </div>
  )
}

function MonthChart({ data }: { data: { month: string; chapters: number }[] }) {
  const max = Math.max(...data.map(d => d.chapters), 1)
  return (
    <div className="flex items-end gap-1 h-24">
      {data.map(d => (
        <div key={d.month} className="flex-1 flex flex-col items-center gap-1">
          <div className="w-full rounded-t-sm transition-all" style={{
            height: `${(d.chapters / max) * 80}px`,
            backgroundColor: d.chapters > 0 ? '#FF2D46' : '#27272a',
            minHeight: d.chapters > 0 ? 4 : 0,
          }} />
          <span className="text-[8px] text-zinc-600">{d.month}</span>
        </div>
      ))}
    </div>
  )
}

export default function WrappedPage() {
  const { year } = useParams<{ year: string }>()
  const yr = parseInt(year, 10)
  const [data, setData] = useState<WrappedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeSlide, setActiveSlide] = useState(0)
  const [sharing, setSharing] = useState(false)

  const load = useCallback(async () => {
    const start = `${yr}-01-01`
    const end   = `${yr}-12-31`

    const [{ data: ml }, { data: lg }, { data: al }] = await Promise.all([
      supabase.from('manga_list').select('*'),
      supabase.from('reading_log')
        .select('chapters_read, logged_at, manga_id')
        .gte('logged_at', start)
        .lte('logged_at', end + 'T23:59:59'),
      supabase.from('anime_list').select('total_watch_hours'),
    ])

    const manga  = (ml ?? []) as Manga[]
    const log    = (lg ?? []) as LogEntry[]
    const anime  = (al ?? []) as AnimeRow[]

    const totalChapters = log.reduce((s, l) => s + l.chapters_read, 0)
    const completedThisYear = manga.filter(m => {
      if (m.status !== 'completed') return false
      const u = new Date(m.updated_at)
      return u.getFullYear() === yr
    })

    // Chapters per manga (from log)
    const chapsByManga: Record<string, number> = {}
    for (const l of log) {
      chapsByManga[l.manga_id] = (chapsByManga[l.manga_id] ?? 0) + l.chapters_read
    }

    // Top manga by chapters read this year
    const topManga = Object.entries(chapsByManga)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, chapters]) => {
        const m = manga.find(x => x.id === id)
        return { title: m?.title ?? 'Unknown', chapters, cover_url: m?.cover_url ?? null }
      })

    // Genres from read manga this year
    const genreScore: Record<string, number> = {}
    for (const [id] of Object.entries(chapsByManga)) {
      const m = manga.find(x => x.id === id)
      if (m) for (const g of m.genres ?? []) genreScore[g] = (genreScore[g] ?? 0) + 1
    }
    const topGenres = Object.entries(genreScore).sort((a, b) => b[1] - a[1]).slice(0, 5)

    // Monthly chapters
    const monthlyChapters = MONTHS.map((month, i) => ({
      month,
      chapters: log.filter(l => new Date(l.logged_at).getMonth() === i)
                   .reduce((s, l) => s + l.chapters_read, 0),
    }))
    const mostActiveMonth = monthlyChapters.reduce((best, m) => m.chapters > best.chapters ? m : best, { month: 'N/A', chapters: 0 }).month

    // Reading streak (days with any log entry)
    const daySet = new Set(log.map(l => new Date(l.logged_at).toDateString()))
    const readingDays = daySet.size

    // Longest streak
    const sortedDays = [...daySet].map(d => new Date(d)).sort((a, b) => a.getTime() - b.getTime())
    let longestStreak = 0, cur = 0, prev: Date | null = null
    for (const d of sortedDays) {
      if (prev && (d.getTime() - prev.getTime()) === 86400000) cur++
      else cur = 1
      if (cur > longestStreak) longestStreak = cur
      prev = d
    }

    const totalAnimeHours = anime.reduce((s, a) => s + (a.total_watch_hours ?? 0), 0)

    setData({
      year: yr,
      totalChapters,
      totalManga: Object.keys(chapsByManga).length,
      totalCompleted: completedThisYear.length,
      topGenres,
      topManga,
      mostActiveMonth,
      monthlyChapters,
      totalAnimeHours,
      longestStreak,
      readingDays,
    })
    setLoading(false)
  }, [yr])

  useEffect(() => { load() }, [load])

  const shareWrapped = async () => {
    setSharing(true)
    const text = data
      ? `My ${data.year} in reading: ${data.totalChapters.toLocaleString()} chapters across ${data.totalManga} titles. Top genre: ${data.topGenres[0]?.[0] ?? '?'}. #YOMUWrapped`
      : ''
    if (navigator.share) {
      await navigator.share({ title: `YOMU ${yr} Wrapped`, text, url: window.location.href }).catch(() => {})
    } else {
      await navigator.clipboard.writeText(`${text}\n${window.location.href}`)
    }
    setSharing(false)
  }

  if (loading) return (
    <main className="min-h-screen flex items-center justify-center" style={{ background: '#0d0d0d' }}>
      <div className="text-zinc-500 text-sm">Loading your {yr} Wrapped…</div>
    </main>
  )

  if (!data || data.totalChapters === 0) return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: '#0d0d0d' }}>
      <div className="text-4xl">📚</div>
      <h1 className="text-white text-xl font-bold">No reading data for {yr}</h1>
      <p className="text-zinc-500 text-sm">Start tracking to see your Wrapped next year.</p>
      <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400">← Back to list</Link>
    </main>
  )

  const slides = [
    // Slide 0: Intro
    <div key="intro" className="flex flex-col items-center justify-center text-center gap-6 min-h-[400px]">
      <div className="text-6xl">📖</div>
      <div>
        <h1 className="text-4xl md:text-6xl font-black text-white">YOMU</h1>
        <p className="text-xl text-zinc-400 mt-1">Your {data.year} in reading</p>
      </div>
    </div>,

    // Slide 1: Total chapters
    <StatSlide key="chapters" value={data.totalChapters.toLocaleString()}
      label="Chapters Read" sub={`Across ${data.totalManga} Different Titles`} />,

    // Slide 2: Most active month
    <div key="months" className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <div className="text-4xl font-black text-[#FF2D46]">{data.mostActiveMonth}</div>
        <div className="text-lg text-white font-semibold mt-1">Was Your Most Active Month</div>
      </div>
      <div className="w-full max-w-sm">
        <MonthChart data={data.monthlyChapters} />
      </div>
    </div>,

    // Slide 3: Top manga
    <div key="top" className="flex flex-col items-center gap-5 p-6 w-full max-w-sm mx-auto">
      <h2 className="text-lg font-bold text-white">Top titles this year</h2>
      <div className="space-y-2 w-full">
        {data.topManga.map((m, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-zinc-600 text-sm w-4 text-right shrink-0">{i + 1}</span>
            {m.cover_url && <img src={m.cover_url} className="w-8 h-10 object-cover rounded shrink-0" alt="" />}
            <span className="text-sm text-zinc-200 flex-1 truncate">{m.title}</span>
            <span className="text-xs text-zinc-500 shrink-0">{m.chapters} Ch</span>
          </div>
        ))}
      </div>
    </div>,

    // Slide 4: Top genres
    <div key="genres" className="flex flex-col items-center gap-5 p-6">
      <h2 className="text-lg font-bold text-white">Your taste in {data.year}</h2>
      <div className="flex flex-wrap gap-2 justify-center max-w-xs">
        {data.topGenres.map(([g, n], i) => (
          <span key={g} className="px-3 py-1.5 rounded-full text-sm font-medium"
            style={{
              backgroundColor: `rgba(255,45,70,${0.8 - i * 0.12})`,
              color: 'white',
              fontSize: `${1.1 - i * 0.1}rem`,
            }}>
            {g}
          </span>
        ))}
      </div>
    </div>,

    // Slide 5: Streaks + days
    <div key="streak" className="flex flex-col items-center gap-8 p-6">
      <StatSlide label="Reading Days" value={data.readingDays}
        sub={`Longest Streak: ${data.longestStreak} Days`} accent="#2BE6DC" />
      {data.totalCompleted > 0 && (
        <div className="text-center">
          <span className="text-2xl font-bold text-emerald-400">{data.totalCompleted}</span>
          <span className="text-zinc-400 text-sm ml-2">Series Completed ✓</span>
        </div>
      )}
    </div>,

    // Slide 6: Anime hours (if any)
    ...(data.totalAnimeHours > 0 ? [
      <StatSlide key="anime" value={`${data.totalAnimeHours.toFixed(0)}h`}
        label="Of Anime Watched" sub="On Top Of All That Reading" accent="#a78bfa" />,
    ] : []),

    // Slide 7: Outro
    <div key="outro" className="flex flex-col items-center justify-center text-center gap-6 min-h-[400px]">
      <div className="text-5xl">🎉</div>
      <div>
        <h2 className="text-2xl md:text-3xl font-black text-white">That&apos;s a wrap on {data.year}</h2>
        <p className="text-zinc-400 mt-2 text-sm">Keep reading in {data.year + 1} →</p>
      </div>
      <button onClick={shareWrapped} disabled={sharing}
        className="px-6 py-3 rounded-xl bg-[#FF2D46] text-white text-sm font-medium hover:bg-red-500 transition-colors disabled:opacity-50">
        {sharing ? 'Copied!' : '↑ Share your Wrapped'}
      </button>
    </div>,
  ]

  return (
    <main className="min-h-screen flex flex-col" style={{ background: '#0d0d0d' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400">← Back</Link>
        <span className="text-xs text-zinc-500 font-medium">YOMU {data.year} Wrapped</span>
        <span className="text-xs text-zinc-600">{activeSlide + 1} / {slides.length}</span>
      </div>

      {/* Slide */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl border border-zinc-800">
          <div className="p-6 md:p-10">
            {slides[activeSlide]}
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-center gap-4 pb-8">
        <button onClick={() => setActiveSlide(s => Math.max(0, s - 1))} disabled={activeSlide === 0}
          className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 flex items-center justify-center text-lg transition-colors">
          ‹
        </button>
        <div className="flex gap-1.5">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setActiveSlide(i)}
              className={`w-2 h-2 rounded-full transition-all ${i === activeSlide ? 'bg-[#FF2D46] w-4' : 'bg-zinc-700'}`} />
          ))}
        </div>
        <button onClick={() => setActiveSlide(s => Math.min(slides.length - 1, s + 1))} disabled={activeSlide === slides.length - 1}
          className="w-10 h-10 rounded-full bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 flex items-center justify-center text-lg transition-colors">
          ›
        </button>
      </div>
    </main>
  )
}
