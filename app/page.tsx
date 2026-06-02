'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, type Manga, type MangaStatus } from '@/lib/supabase'
import { fetchMangaInfo } from '@/lib/jikan'

const STATUS_LABELS: Record<MangaStatus, string> = {
  reading: 'Reading',
  completed: 'Completed',
  on_hold: 'On Hold',
  dropped: 'Dropped',
}

const STATUS_COLORS: Record<MangaStatus, string> = {
  reading: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  completed: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  on_hold: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  dropped: 'bg-red-500/20 text-red-300 border-red-500/30',
}

type SortKey = 'last_read' | 'title' | 'chapter'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}

function ProgressBar({ current, total }: { current: number; total: number | null }) {
  if (!total) return null
  const pct = Math.min(100, Math.round((current / total) * 100))
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-zinc-500 tabular-nums">{pct}%</span>
    </div>
  )
}

export default function Home() {
  const [manga, setManga] = useState<Manga[]>([])
  const [filter, setFilter] = useState<MangaStatus | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('last_read')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [recommendations, setRecommendations] = useState('')
  const [loadingRec, setLoadingRec] = useState(false)
  const fetchingCovers = useRef(false)

  const fetchManga = useCallback(async () => {
    const { data } = await supabase.from('manga_list').select('*')
    if (data) setManga(data as Manga[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchManga() }, [fetchManga])

  // Fetch missing covers from Jikan, staggered to respect rate limits
  useEffect(() => {
    if (fetchingCovers.current || manga.length === 0) return
    const missing = manga.filter(m => !m.cover_url)
    if (missing.length === 0) return
    fetchingCovers.current = true

    const run = async () => {
      for (const m of missing) {
        const info = await fetchMangaInfo(m.title)
        if (info.coverUrl || info.totalChapters) {
          const updates: Partial<Manga> = {}
          if (info.coverUrl) updates.cover_url = info.coverUrl
          if (info.totalChapters) updates.total_chapters = info.totalChapters
          await supabase.from('manga_list').update(updates).eq('id', m.id)
          setManga(prev => prev.map(x =>
            x.id === m.id ? { ...x, ...updates } : x
          ))
        }
        await new Promise(r => setTimeout(r, 400))
      }
      fetchingCovers.current = false
    }
    run()
  }, [manga.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateChapter = async (id: string, delta: number, current: number) => {
    const next = Math.max(0, current + delta)
    const now = new Date().toISOString()
    setManga(prev => prev.map(m => m.id === id ? { ...m, current_chapter: next, last_read_at: now } : m))
    await supabase.from('manga_list').update({ current_chapter: next, last_read_at: now }).eq('id', id)
  }

  const updateStatus = async (id: string, status: MangaStatus) => {
    setManga(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    await supabase.from('manga_list').update({ status }).eq('id', id)
  }

  const updateNotes = async (id: string, notes: string) => {
    setManga(prev => prev.map(m => m.id === id ? { ...m, notes } : m))
    await supabase.from('manga_list').update({ notes }).eq('id', id)
  }

  const deleteManga = async (id: string) => {
    setManga(prev => prev.filter(m => m.id !== id))
    await supabase.from('manga_list').delete().eq('id', id)
  }

  const addManga = async () => {
    if (!newTitle.trim()) return
    setAdding(true)
    const { data } = await supabase
      .from('manga_list')
      .insert({ title: newTitle.trim(), current_chapter: 0, status: 'reading' })
      .select()
      .single()
    if (data) {
      const newEntry = data as Manga
      setManga(prev => [...prev, newEntry])
      // Fetch cover for new entry immediately
      fetchMangaInfo(newEntry.title).then(async info => {
        if (info.coverUrl || info.totalChapters) {
          const updates: Partial<Manga> = {}
          if (info.coverUrl) updates.cover_url = info.coverUrl
          if (info.totalChapters) updates.total_chapters = info.totalChapters
          await supabase.from('manga_list').update(updates).eq('id', newEntry.id)
          setManga(prev => prev.map(x => x.id === newEntry.id ? { ...x, ...updates } : x))
        }
      })
    }
    setNewTitle('')
    setShowAdd(false)
    setAdding(false)
  }

  const getRecommendations = async () => {
    setLoadingRec(true)
    setRecommendations('')
    const res = await fetch('/api/recommend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manga }),
    })
    const data = await res.json()
    setRecommendations(data.recommendations)
    setLoadingRec(false)
  }

  const toggleNotes = (id: string) =>
    setExpandedNotes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const counts = manga.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sortFn = (a: Manga, b: Manga): number => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'chapter') return b.current_chapter - a.current_chapter
    // last_read: nulls go to bottom
    if (!a.last_read_at && !b.last_read_at) return a.title.localeCompare(b.title)
    if (!a.last_read_at) return 1
    if (!b.last_read_at) return -1
    return new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime()
  }

  const filtered = manga
    .filter(m => filter === 'all' || m.status === filter)
    .filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))
    .sort(sortFn)

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl mx-auto px-4 py-10">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Manga Tracker</h1>
            <p className="text-zinc-500 text-sm mt-1">{manga.length} titles</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={getRecommendations}
              disabled={loadingRec || manga.length === 0}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors"
            >
              {loadingRec ? 'Thinking…' : '✦ Recommend'}
            </button>
            <button
              onClick={() => setShowAdd(v => !v)}
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors"
            >
              + Add
            </button>
          </div>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="mb-6 flex gap-2">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addManga()}
              placeholder="Manga title…"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
            <button
              onClick={addManga}
              disabled={adding || !newTitle.trim()}
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium disabled:opacity-40"
            >
              {adding ? '…' : 'Add'}
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {(Object.keys(STATUS_LABELS) as MangaStatus[]).map(s => (
            <div key={s} className="bg-zinc-900 rounded-lg p-3 text-center">
              <div className="text-xl font-bold">{counts[s] ?? 0}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{STATUS_LABELS[s]}</div>
            </div>
          ))}
        </div>

        {/* Controls row: filter + search + sort */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="flex gap-1 bg-zinc-900 p-1 rounded-lg">
            {(['all', ...Object.keys(STATUS_LABELS)] as (MangaStatus | 'all')[]).map(s => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  filter === s ? 'bg-white text-black font-medium' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {s === 'all' ? 'All' : STATUS_LABELS[s as MangaStatus]}
              </button>
            ))}
          </div>

          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-zinc-600 placeholder:text-zinc-600 w-36"
          />

          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortKey)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none cursor-pointer"
          >
            <option value="last_read">Recently read</option>
            <option value="title">A → Z</option>
            <option value="chapter">Most chapters</option>
          </select>
        </div>

        {/* List */}
        {loading ? (
          <div className="text-zinc-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-zinc-500 text-sm">Nothing here.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => (
              <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="flex gap-3 p-3">
                  {/* Cover */}
                  <div className="shrink-0 w-12 h-16 rounded-md overflow-hidden bg-zinc-800">
                    {m.cover_url ? (
                      <Image
                        src={m.cover_url}
                        alt={m.title}
                        width={48}
                        height={64}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">?</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm leading-snug truncate">{m.title}</div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <select
                        value={m.status}
                        onChange={e => updateStatus(m.id, e.target.value as MangaStatus)}
                        className={`text-xs px-2 py-0.5 rounded-full border bg-transparent cursor-pointer outline-none ${STATUS_COLORS[m.status]}`}
                      >
                        {(Object.keys(STATUS_LABELS) as MangaStatus[]).map(s => (
                          <option key={s} value={s} className="bg-zinc-900 text-white">{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <span className="text-xs text-zinc-600">{timeAgo(m.last_read_at)}</span>
                      <button
                        onClick={() => toggleNotes(m.id)}
                        className={`text-xs transition-colors ${expandedNotes.has(m.id) || m.notes ? 'text-violet-400' : 'text-zinc-700 hover:text-zinc-400'}`}
                        title="Notes"
                      >
                        📝
                      </button>
                    </div>

                    {m.total_chapters && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-violet-500 rounded-full transition-all"
                            style={{ width: `${Math.min(100, Math.round((m.current_chapter / m.total_chapters) * 100))}%` }}
                          />
                        </div>
                        <span className="text-xs text-zinc-600 tabular-nums shrink-0">
                          {m.current_chapter}/{m.total_chapters}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Chapter stepper + delete */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => updateChapter(m.id, -1, m.current_chapter)}
                      className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                    >
                      −
                    </button>
                    <span className="w-10 text-center text-xs font-mono tabular-nums text-zinc-300">
                      {m.current_chapter}
                    </span>
                    <button
                      onClick={() => updateChapter(m.id, 1, m.current_chapter)}
                      className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                    >
                      +
                    </button>
                    <button
                      onClick={() => deleteManga(m.id)}
                      className="ml-1 text-zinc-700 hover:text-red-400 transition-colors text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                </div>

                {/* Notes */}
                {(expandedNotes.has(m.id) || m.notes) && (
                  <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
                    <textarea
                      value={m.notes}
                      onChange={e => updateNotes(m.id, e.target.value)}
                      placeholder="Add a note…"
                      rows={2}
                      className="w-full bg-transparent text-xs text-zinc-400 placeholder:text-zinc-700 outline-none resize-none"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* AI Recommendations */}
        {(recommendations || loadingRec) && (
          <div className="mt-6 bg-zinc-900 border border-violet-500/30 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-violet-300">✦ AI Recommendations</h2>
              {recommendations && (
                <button onClick={() => setRecommendations('')} className="text-zinc-600 hover:text-zinc-400 text-lg leading-none">×</button>
              )}
            </div>
            {loadingRec ? (
              <div className="text-zinc-500 text-sm">Asking Claude…</div>
            ) : (
              <div
                className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: recommendations.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>') }}
              />
            )}
          </div>
        )}
      </div>
    </main>
  )
}
