'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase, type Manga, type MangaStatus } from '@/lib/supabase'

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

export default function Home() {
  const [manga, setManga] = useState<Manga[]>([])
  const [filter, setFilter] = useState<MangaStatus | 'all'>('all')
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [recommendations, setRecommendations] = useState('')
  const [loadingRec, setLoadingRec] = useState(false)

  const fetchManga = useCallback(async () => {
    const { data } = await supabase
      .from('manga_list')
      .select('*')
      .order('title')
    if (data) setManga(data as Manga[])
    setLoading(false)
  }, [])

  useEffect(() => { fetchManga() }, [fetchManga])

  const updateChapter = async (id: string, delta: number, current: number) => {
    const next = Math.max(0, current + delta)
    setManga(prev => prev.map(m => m.id === id ? { ...m, current_chapter: next } : m))
    await supabase.from('manga_list').update({ current_chapter: next }).eq('id', id)
  }

  const updateStatus = async (id: string, status: MangaStatus) => {
    setManga(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    await supabase.from('manga_list').update({ status }).eq('id', id)
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
    if (data) setManga(prev => [...prev, data as Manga].sort((a, b) => a.title.localeCompare(b.title)))
    setNewTitle('')
    setShowAdd(false)
    setAdding(false)
  }

  const filtered = filter === 'all' ? manga : manga.filter(m => m.status === filter)

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

  const counts = manga.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

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

        {/* Filter tabs */}
        <div className="flex gap-1 mb-6 bg-zinc-900 p-1 rounded-lg w-fit">
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

        {/* List */}
        {loading ? (
          <div className="text-zinc-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-zinc-500 text-sm">Nothing here.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => (
              <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex items-center gap-4">
                {/* Title + status badge */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{m.title}</div>
                  <div className="mt-1">
                    <select
                      value={m.status}
                      onChange={e => updateStatus(m.id, e.target.value as MangaStatus)}
                      className={`text-xs px-2 py-0.5 rounded-full border bg-transparent cursor-pointer outline-none ${STATUS_COLORS[m.status]}`}
                    >
                      {(Object.keys(STATUS_LABELS) as MangaStatus[]).map(s => (
                        <option key={s} value={s} className="bg-zinc-900 text-white">{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Chapter stepper */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => updateChapter(m.id, -1, m.current_chapter)}
                    className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                  >
                    −
                  </button>
                  <span className="w-12 text-center text-sm font-mono tabular-nums">
                    Ch.{m.current_chapter}
                  </span>
                  <button
                    onClick={() => updateChapter(m.id, 1, m.current_chapter)}
                    className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                  >
                    +
                  </button>
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteManga(m.id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors shrink-0 text-lg leading-none"
                >
                  ×
                </button>
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
              <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: recommendations.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>') }}
              />
            )}
          </div>
        )}
      </div>
    </main>
  )
}
