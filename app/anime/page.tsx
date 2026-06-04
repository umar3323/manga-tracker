'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { animeData, getStatus, type AnimeEntry, type AnimeStatus } from '@/lib/anime-data'

// ── Cover art — localStorage cache, staggered Jikan fetches ──────────────────
const COVER_CACHE_KEY = 'yomu_anime_covers'
function loadCache(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem(COVER_CACHE_KEY) ?? '{}') } catch { return {} }
}
function saveCache(c: Record<string, string>) {
  try { localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(c)) } catch {}
}
async function fetchCover(title: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=1`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return null
    return (await res.json()).data?.[0]?.images?.jpg?.image_url ?? null
  } catch { return null }
}

function Cover({ title, fill = false }: { title: string; fill?: boolean }) {
  const [url, setUrl] = useState<string | null>(() => loadCache()[title] ?? null)

  useEffect(() => {
    if (url) return
    // Stagger requests by first two char codes to avoid Jikan rate limit
    const ms = (Math.abs(title.charCodeAt(0) * 7 + (title.charCodeAt(1) ?? 0)) % 40) * 150
    const t = setTimeout(async () => {
      const img = await fetchCover(title)
      if (img) { setUrl(img); saveCache({ ...loadCache(), [title]: img }) }
    }, ms)
    return () => clearTimeout(t)
  }, [title, url])

  const fallback = (
    <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
      <span className="text-zinc-500 font-bold text-sm">{title[0]}</span>
    </div>
  )

  if (!url) return fallback
  if (fill) return <Image src={url} alt={title} fill className="object-cover" unoptimized />
  return <Image src={url} alt={title} fill className="object-cover" unoptimized />
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function daysSince(d: string) { return Math.floor((Date.now() - new Date(d).getTime()) / 86400000) }
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

const STATUS_STYLE: Record<AnimeStatus, { label: string; bg: string; text: string }> = {
  active: { label: 'Active', bg: 'bg-emerald-900/30', text: 'text-emerald-400' },
  paused: { label: 'Paused', bg: 'bg-amber-900/30',   text: 'text-amber-400'   },
  older:  { label: 'Older',  bg: 'bg-zinc-800',        text: 'text-zinc-500'    },
  movie:  { label: 'Movie',  bg: 'bg-violet-900/30',   text: 'text-violet-400'  },
}

function RatingIcon({ r }: { r: 'up' | 'down' | null }) {
  if (!r) return null
  return <span title={r === 'up' ? 'Liked' : 'Disliked'}>{r === 'up' ? '👍' : '👎'}</span>
}

// ── Page ──────────────────────────────────────────────────────────────────────
type SortKey    = 'title' | 'hours' | 'lastWatched'
type FilterSt   = 'all' | AnimeStatus

const totalHours  = animeData.reduce((s, e) => s + e.totalWatchHours, 0)
const totalSeries = animeData.filter(e => !e.isMovie).length
const totalMovies = animeData.filter(e =>  e.isMovie).length
const activeCount = animeData.filter(e => getStatus(e) === 'active').length

export default function AnimePage() {
  const [filter, setFilter]   = useState<FilterSt>('all')
  const [sortKey, setSortKey] = useState<SortKey>('lastWatched')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const activeEntries = useMemo(() =>
    animeData.filter(e => getStatus(e) === 'active')
      .sort((a, b) => b.lastWatched.localeCompare(a.lastWatched)), [])

  const tableEntries = useMemo(() => {
    const rows = filter === 'all' ? [...animeData] : animeData.filter(e => getStatus(e) === filter)
    return rows.sort((a, b) => {
      const [va, vb] =
        sortKey === 'title'       ? [a.title.toLowerCase(), b.title.toLowerCase()] :
        sortKey === 'hours'       ? [a.totalWatchHours, b.totalWatchHours] :
                                    [a.lastWatched, b.lastWatched]
      return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0)
                               : (va > vb ? -1 : va < vb ? 1 : 0)
    })
  }, [filter, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  const si = (k: SortKey) => sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Anime</h1>
          <p className="text-zinc-500 text-sm mt-1">Netflix watch history · {animeData.length} titles</p>
        </div>

        {/* ── Stats cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {[
            { label: 'Series tracked', value: totalSeries,              icon: '📺' },
            { label: 'Total hours',    value: `${totalHours.toFixed(0)}h`, icon: '⏱' },
            { label: 'Active',         value: activeCount,              icon: '▶' },
            { label: 'Movies',         value: totalMovies,              icon: '🎬' },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--vermillion)' }}>{s.value}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* ── Currently watching ── */}
        <section className="mb-10">
          <h2 className="text-base font-bold mb-4">
            Currently Watching
            <span className="text-zinc-500 text-sm font-normal ml-2">last 90 days</span>
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {activeEntries.map(entry => {
              const days = daysSince(entry.lastWatched)
              return (
                <div key={entry.title}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-colors">
                  <div className="relative aspect-[2/3] bg-zinc-800">
                    <Cover title={entry.title} fill />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-2 py-2">
                      <p className="text-[10px] font-mono text-zinc-200 leading-tight">{entry.currentEp}</p>
                    </div>
                    {entry.netflixRating && (
                      <div className="absolute top-1.5 right-1.5 text-xs leading-none">
                        <RatingIcon r={entry.netflixRating} />
                      </div>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium text-zinc-200 line-clamp-2 leading-snug">{entry.title}</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      {days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days}d ago`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* ── Full tracker table ── */}
        <section>
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-base font-bold">All Titles</h2>
            <div className="flex gap-1.5 flex-wrap">
              {(['all', 'active', 'paused', 'older', 'movie'] as FilterSt[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    filter === f
                      ? 'bg-zinc-200 text-zinc-900'
                      : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-zinc-200'
                  }`}>
                  {f === 'all' ? `All ${animeData.length}` : `${STATUS_STYLE[f as AnimeStatus].label} ${animeData.filter(e => getStatus(e) === f).length}`}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="hidden md:grid items-center gap-3 px-4 py-2.5 border-b border-zinc-800"
              style={{ gridTemplateColumns: '2.5rem 1fr 6rem 5rem 6rem 4.5rem 2rem' }}>
              {[
                { key: null,          label: '' },
                { key: 'title',       label: 'Title' },
                { key: null,          label: 'Episode' },
                { key: 'hours',       label: 'Hours' },
                { key: 'lastWatched', label: 'Last watched' },
                { key: null,          label: 'Status' },
                { key: null,          label: '' },
              ].map((col, i) => (
                col.key ? (
                  <button key={i} onClick={() => toggleSort(col.key as SortKey)}
                    className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 text-left hover:text-zinc-300 transition-colors">
                    {col.label}{si(col.key as SortKey)}
                  </button>
                ) : (
                  <div key={i} className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{col.label}</div>
                )
              ))}
            </div>

            {/* Table rows */}
            {tableEntries.map((entry, idx) => {
              const status = getStatus(entry)
              const s = STATUS_STYLE[status]
              return (
                <div key={entry.title}
                  className={`flex md:grid items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors ${idx < tableEntries.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
                  style={{ gridTemplateColumns: '2.5rem 1fr 6rem 5rem 6rem 4.5rem 2rem' } as React.CSSProperties}>
                  {/* Cover */}
                  <div className="w-9 h-[50px] rounded overflow-hidden bg-zinc-800 relative shrink-0">
                    <Cover title={entry.title} fill />
                  </div>
                  {/* Title + mobile meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{entry.title}</p>
                    <p className="text-xs text-zinc-500 md:hidden mt-0.5">
                      {entry.currentEp} · {fmtDate(entry.lastWatched)}
                    </p>
                  </div>
                  {/* Desktop-only columns */}
                  <p className="hidden md:block text-xs font-mono text-zinc-400 truncate">{entry.currentEp}</p>
                  <p className="hidden md:block text-xs font-mono text-zinc-400">
                    {entry.totalWatchHours > 0 ? `${entry.totalWatchHours}h` : '—'}
                  </p>
                  <p className="hidden md:block text-xs text-zinc-500">{fmtDate(entry.lastWatched)}</p>
                  <span className={`hidden md:inline-block text-center text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                    {s.label}
                  </span>
                  <div className="hidden md:flex justify-center text-sm">
                    <RatingIcon r={entry.netflixRating} />
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-zinc-600 text-center mt-3">
            {tableEntries.length} of {animeData.length} titles · sourced from Netflix watch history
          </p>
        </section>
      </div>
    </main>
  )
}
