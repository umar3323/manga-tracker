'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { getStatus, type AnimeRow, type AnimeStatus } from '@/lib/anime-data'

// ── Cover art — localStorage cache + Jikan fetch ──────────────────────────────
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

function Cover({ anime }: { anime: AnimeRow }) {
  const [url, setUrl] = useState<string | null>(() => anime.cover_url ?? loadCache()[anime.title] ?? null)
  useEffect(() => {
    if (url) return
    const ms = (Math.abs(anime.title.charCodeAt(0) * 7 + (anime.title.charCodeAt(1) ?? 0)) % 40) * 150
    const t = setTimeout(async () => {
      const img = await fetchCover(anime.title)
      if (img) { setUrl(img); saveCache({ ...loadCache(), [anime.title]: img }) }
    }, ms)
    return () => clearTimeout(t)
  }, [anime.title, anime.cover_url, url])
  if (!url) return (
    <div className="w-full h-full bg-zinc-800 flex items-center justify-center">
      <span className="text-zinc-500 font-bold text-sm">{anime.title[0]}</span>
    </div>
  )
  return <Image src={url} alt={anime.title} fill className="object-cover" unoptimized />
}

// ── Jikan anime search for Add flow ──────────────────────────────────────────
interface JikanAnime {
  mal_id: number; title: string; episodes: number | null
  images: { jpg: { image_url: string } }; score: number | null
}
async function searchJikanAnime(q: string): Promise<JikanAnime[]> {
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=8&order_by=score&sort=desc`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return []
    return (await res.json()).data ?? []
  } catch { return [] }
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

// ── Inline editable episode text ──────────────────────────────────────────────
function EditableEp({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])
  if (editing) return (
    <input ref={ref} value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={() => { onSave(draft.trim() || value); setEditing(false) }}
      onKeyDown={e => { if (e.key === 'Enter') { onSave(draft.trim() || value); setEditing(false) } if (e.key === 'Escape') setEditing(false) }}
      className="w-full bg-zinc-700 border border-zinc-500 rounded px-1.5 py-0.5 text-xs font-mono outline-none" />
  )
  return (
    <button onClick={() => { setDraft(value); setEditing(true) }}
      className="text-xs font-mono text-zinc-400 hover:text-white transition-colors text-left w-full truncate"
      title="Click to edit">
      {value}
    </button>
  )
}

type SortKey = 'title' | 'hours' | 'lastWatched'
type FilterSt = 'all' | AnimeStatus

export default function AnimePage() {
  const [anime, setAnime]     = useState<AnimeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter]   = useState<FilterSt>('all')
  const [sortKey, setSortKey] = useState<SortKey>('lastWatched')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [toast, setToast]     = useState('')
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)

  // Add anime state
  const [showAdd, setShowAdd]     = useState(false)
  const [addQuery, setAddQuery]   = useState('')
  const [addResults, setAddResults] = useState<JikanAnime[]>([])
  const [addLoading, setAddLoading] = useState(false)
  const [adding, setAdding]       = useState(false)
  const [showDrop, setShowDrop]   = useState(false)
  const addTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addBarRef = useRef<HTMLDivElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('anime_list').select('*').order('last_watched', { ascending: false })
    if (error) { showToast('Failed to load anime list'); return }
    setAnime((data ?? []) as AnimeRow[])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Close add dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (addBarRef.current && !addBarRef.current.contains(e.target as Node)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Debounced Jikan search
  const handleAddSearch = (q: string) => {
    setAddQuery(q); setShowDrop(true)
    if (addTimer.current) clearTimeout(addTimer.current)
    if (!q.trim() || q.length < 2) { setAddResults([]); return }
    setAddLoading(true)
    addTimer.current = setTimeout(async () => {
      const res = await searchJikanAnime(q)
      setAddResults(res); setAddLoading(false)
    }, 350)
  }

  const addAnime = async (j: JikanAnime) => {
    setAdding(true); setShowDrop(false); setAddQuery('')
    const coverUrl = j.images?.jpg?.image_url ?? null
    const { data, error } = await supabase.from('anime_list').insert({
      title: j.title,
      current_ep: '—',
      total_watch_hours: 0,
      last_watched: new Date().toISOString().slice(0, 10),
      is_movie: false,
      cover_url: coverUrl,
    }).select().single()
    if (error) {
      showToast(error.code === '23505' ? `"${j.title}" already in your list` : 'Failed to add')
    } else if (data) {
      setAnime(prev => [data as AnimeRow, ...prev])
      showToast(`Added "${j.title}"`)
      if (coverUrl) saveCache({ ...loadCache(), [j.title]: coverUrl })
    }
    setAdding(false); setShowAdd(false)
  }

  const updateRating = async (id: string, rating: 'up' | 'down' | null) => {
    await supabase.from('anime_list').update({ user_rating: rating, updated_at: new Date().toISOString() }).eq('id', id)
    setAnime(prev => prev.map(a => a.id === id ? { ...a, user_rating: rating } : a))
  }

  const updateEp = async (id: string, ep: string) => {
    await supabase.from('anime_list').update({ current_ep: ep, last_watched: new Date().toISOString().slice(0, 10), updated_at: new Date().toISOString() }).eq('id', id)
    setAnime(prev => prev.map(a => a.id === id ? { ...a, current_ep: ep, last_watched: new Date().toISOString().slice(0, 10) } : a))
  }

  const deleteAnime = async (id: string) => {
    await supabase.from('anime_list').delete().eq('id', id)
    setAnime(prev => prev.filter(a => a.id !== id))
    setPendingDelete(null)
    showToast('Removed from list')
  }

  // Computed stats
  const totalHours  = anime.reduce((s, a) => s + a.total_watch_hours, 0)
  const totalSeries = anime.filter(a => !a.is_movie).length
  const totalMovies = anime.filter(a =>  a.is_movie).length
  const activeCount = anime.filter(a => getStatus(a) === 'active').length

  const activeEntries = useMemo(() =>
    anime.filter(a => getStatus(a) === 'active').sort((a, b) => b.last_watched.localeCompare(a.last_watched)), [anime])

  const tableEntries = useMemo(() => {
    const rows = filter === 'all' ? [...anime] : anime.filter(a => getStatus(a) === filter)
    return rows.sort((a, b) => {
      const [va, vb] =
        sortKey === 'title'       ? [a.title.toLowerCase(), b.title.toLowerCase()] :
        sortKey === 'hours'       ? [a.total_watch_hours, b.total_watch_hours] :
                                    [a.last_watched, b.last_watched]
      return sortDir === 'asc' ? (va < vb ? -1 : va > vb ? 1 : 0)
                               : (va > vb ? -1 : va < vb ? 1 : 0)
    })
  }, [anime, filter, sortKey, sortDir])

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(k); setSortDir('desc') }
  }
  const si = (k: SortKey) => sortKey === k ? (sortDir === 'desc' ? ' ↓' : ' ↑') : ''

  if (loading) return (
    <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
      <div className="text-zinc-500 text-sm">Loading…</div>
    </main>
  )

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Anime</h1>
            <p className="text-zinc-500 text-sm mt-1">{anime.length} titles tracked</p>
          </div>
          <button onClick={() => setShowAdd(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--vermillion)', color: '#fff' }}>
            + Add anime
          </button>
        </div>

        {/* Add anime panel */}
        {showAdd && (
          <div className="mb-6 p-4 bg-zinc-900 border border-zinc-800 rounded-xl" ref={addBarRef}>
            <div className="relative">
              <input
                autoFocus
                value={addQuery}
                onChange={e => handleAddSearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && setShowAdd(false)}
                placeholder="Search any anime title…"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
              />
              {showDrop && (addLoading || addResults.length > 0) && (
                <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl">
                  {addLoading && <div className="px-4 py-3 text-xs text-zinc-500">Searching…</div>}
                  {!addLoading && addResults.map(j => (
                    <button key={j.mal_id}
                      onMouseDown={e => { e.preventDefault(); addAnime(j) }}
                      disabled={adding}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left border-b border-zinc-800 last:border-0">
                      {j.images?.jpg?.image_url && (
                        <img src={j.images.jpg.image_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-200 truncate">{j.title}</p>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          {j.episodes ? `${j.episodes} eps` : 'ongoing'}
                          {j.score ? ` · ★ ${j.score}` : ''}
                        </p>
                      </div>
                      <span className="text-[10px] text-zinc-600 shrink-0">Add →</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
          {[
            { label: 'Series tracked', value: totalSeries,                 icon: '📺' },
            { label: 'Total hours',    value: `${totalHours.toFixed(0)}h`, icon: '⏱' },
            { label: 'Active',         value: activeCount,                 icon: '▶' },
            { label: 'Movies',         value: totalMovies,                 icon: '🎬' },
          ].map(s => (
            <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
              <div className="text-xl mb-1">{s.icon}</div>
              <div className="text-2xl font-bold" style={{ color: 'var(--vermillion)' }}>{s.value}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Currently watching */}
        {activeEntries.length > 0 && (
          <section className="mb-10">
            <h2 className="text-base font-bold mb-4">
              Currently Watching
              <span className="text-zinc-500 text-sm font-normal ml-2">last 90 days</span>
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {activeEntries.map(entry => {
                const days = daysSince(entry.last_watched)
                const rating = entry.user_rating ?? entry.netflix_rating
                return (
                  <div key={entry.id}
                    className="group bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-colors">
                    <div className="relative aspect-[2/3] bg-zinc-800">
                      <Cover anime={entry} />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-2 py-2">
                        <p className="text-[10px] font-mono text-zinc-200 leading-tight">{entry.current_ep}</p>
                      </div>
                      {/* Interactive rating buttons — top-right corner */}
                      <div className="absolute top-1 right-1 flex flex-col gap-0.5">
                        <button
                          onClick={e => { e.stopPropagation(); updateRating(entry.id, rating === 'up' ? null : 'up') }}
                          title={rating === 'up' ? 'Remove like' : 'Like'}
                          className={`w-6 h-6 rounded flex items-center justify-center text-xs leading-none transition-all ${
                            rating === 'up'
                              ? 'bg-emerald-500/30 text-emerald-400'
                              : 'bg-black/40 text-zinc-400 opacity-0 group-hover:opacity-100'
                          }`}
                        >👍</button>
                        <button
                          onClick={e => { e.stopPropagation(); updateRating(entry.id, rating === 'down' ? null : 'down') }}
                          title={rating === 'down' ? 'Remove dislike' : 'Dislike'}
                          className={`w-6 h-6 rounded flex items-center justify-center text-xs leading-none transition-all ${
                            rating === 'down'
                              ? 'bg-red-500/30 text-red-400'
                              : 'bg-black/40 text-zinc-400 opacity-0 group-hover:opacity-100'
                          }`}
                        >👎</button>
                      </div>
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
        )}

        {/* Full tracker table */}
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
                  {f === 'all'
                    ? `All ${anime.length}`
                    : `${STATUS_STYLE[f as AnimeStatus].label} ${anime.filter(a => getStatus(a) === f).length}`}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {/* Column headers */}
            <div className="hidden md:grid items-center gap-3 px-4 py-2.5 border-b border-zinc-800"
              style={{ gridTemplateColumns: '2.5rem 1fr 7rem 5rem 6rem 4.5rem 4rem 2rem' }}>
              {[
                { key: null,          label: '' },
                { key: 'title',       label: 'Title' },
                { key: null,          label: 'Episode' },
                { key: 'hours',       label: 'Hours' },
                { key: 'lastWatched', label: 'Last watched' },
                { key: null,          label: 'Status' },
                { key: null,          label: 'Rating' },
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

            {tableEntries.map((entry, idx) => {
              const status = getStatus(entry)
              const s = STATUS_STYLE[status]
              const rating = entry.user_rating ?? entry.netflix_rating
              return (
                <div key={entry.id}
                  className={`flex md:grid items-center gap-3 px-4 py-3 hover:bg-zinc-800/40 transition-colors ${idx < tableEntries.length - 1 ? 'border-b border-zinc-800/50' : ''}`}
                  style={{ gridTemplateColumns: '2.5rem 1fr 7rem 5rem 6rem 4.5rem 4rem 2rem' } as React.CSSProperties}>

                  {/* Cover */}
                  <div className="w-9 h-[50px] rounded overflow-hidden bg-zinc-800 relative shrink-0">
                    <Cover anime={entry} />
                  </div>

                  {/* Title + mobile meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{entry.title}</p>
                    <p className="text-xs text-zinc-500 md:hidden mt-0.5">
                      {entry.current_ep} · {fmtDate(entry.last_watched)}
                    </p>
                  </div>

                  {/* Desktop-only columns */}
                  <div className="hidden md:block">
                    <EditableEp value={entry.current_ep} onSave={v => updateEp(entry.id, v)} />
                  </div>
                  <p className="hidden md:block text-xs font-mono text-zinc-400">
                    {entry.total_watch_hours > 0 ? `${entry.total_watch_hours}h` : '—'}
                  </p>
                  <p className="hidden md:block text-xs text-zinc-500">{fmtDate(entry.last_watched)}</p>
                  <span className={`hidden md:inline-block text-center text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                    {s.label}
                  </span>

                  {/* Rating buttons */}
                  <div className="hidden md:flex items-center gap-0.5">
                    <button
                      onClick={() => updateRating(entry.id, rating === 'up' ? null : 'up')}
                      title={rating === 'up' ? 'Remove rating' : 'Like'}
                      className={`text-sm leading-none transition-colors ${rating === 'up' ? 'opacity-100' : 'opacity-25 hover:opacity-70'}`}
                    >👍</button>
                    <button
                      onClick={() => updateRating(entry.id, rating === 'down' ? null : 'down')}
                      title={rating === 'down' ? 'Remove rating' : 'Dislike'}
                      className={`text-sm leading-none transition-colors ${rating === 'down' ? 'opacity-100' : 'opacity-25 hover:opacity-70'}`}
                    >👎</button>
                  </div>

                  {/* Delete */}
                  <div className="hidden md:flex justify-center">
                    {pendingDelete === entry.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => deleteAnime(entry.id)} className="text-[10px] px-1.5 py-0.5 bg-red-600 text-white rounded">Yes</button>
                        <button onClick={() => setPendingDelete(null)} className="text-[10px] px-1.5 py-0.5 bg-zinc-700 text-zinc-300 rounded">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setPendingDelete(entry.id)}
                        className="text-zinc-700 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="text-xs text-zinc-600 text-center mt-3">
            {tableEntries.length} of {anime.length} titles
          </p>
        </section>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm px-4 py-2 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </main>
  )
}
