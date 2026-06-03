'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, type Manga, type MangaStatus } from '@/lib/supabase'
import { fetchMangaInfo } from '@/lib/jikan'

/** Click the number to type directly. Enter or blur saves; Escape cancels. */
function EditableNumber({
  value,
  onSave,
  label,
  className = '',
}: {
  value: number
  onSave: (n: number) => void
  label?: string
  className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])

  const start = () => { setDraft(String(value)); setEditing(true) }

  const commit = () => {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n >= 0) onSave(n)
    setEditing(false)
  }

  const cancel = () => setEditing(false)

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        value={draft}
        min={0}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
        onBlur={commit}
        aria-label={label}
        className={`text-center font-mono bg-zinc-700 border border-zinc-500 rounded outline-none text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${className}`}
      />
    )
  }

  return (
    <button
      onClick={start}
      title="Click to type a number"
      aria-label={label}
      className={`font-mono tabular-nums text-zinc-300 hover:text-white hover:bg-zinc-700 rounded cursor-text transition-colors ${className}`}
    >
      {value}
    </button>
  )
}

const STATUS_LABELS: Record<MangaStatus, string> = {
  reading:      'Reading',
  completed:    'Completed',
  on_hold:      'On Hold',
  dropped:      'Dropped',
  plan_to_read: 'Plan to Read',
}

const STATUS_COLORS: Record<MangaStatus, string> = {
  reading:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  completed:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
  on_hold:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  dropped:      'bg-red-500/20 text-red-300 border-red-500/30',
  plan_to_read: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
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

/** Safe bold-markdown renderer — no dangerouslySetInnerHTML */
function MarkdownBold({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1
          ? <strong key={i} className="text-white">{part}</strong>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

/** Manga detail modal */
function DetailModal({ manga, onClose, onStatusChange }: {
  manga: Manga
  onClose: () => void
  onStatusChange: (id: string, status: MangaStatus) => void
}) {
  const STATUS_LABELS: Record<MangaStatus, string> = {
    reading: 'Reading', completed: 'Completed', on_hold: 'On Hold',
    dropped: 'Dropped', plan_to_read: 'Plan to Read',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        {/* Drag handle on mobile */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>
        <div className="p-5">
          <div className="flex gap-4 mb-4">
            {manga.cover_url && (
              <img src={manga.cover_url} alt={manga.title}
                className="w-20 h-28 object-cover rounded-lg shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="font-bold text-lg leading-snug">{manga.title}</h2>
              {manga.mal_id && (
                <a href={`https://myanimelist.net/manga/${manga.mal_id}`} target="_blank" rel="noopener noreferrer"
                  className="text-xs text-violet-400 hover:text-violet-300 mt-1 inline-block">
                  View on MyAnimeList ↗
                </a>
              )}
              <div className="mt-2">
                <select value={manga.status} onChange={e => onStatusChange(manga.id, e.target.value as MangaStatus)}
                  className="text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-zinc-300 outline-none cursor-pointer">
                  {(Object.keys(STATUS_LABELS) as MangaStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-4 text-center">
            <div className="bg-zinc-800 rounded-lg p-2">
              <div className="text-sm font-bold">{manga.current_chapter}</div>
              <div className="text-xs text-zinc-500">Current ch.</div>
            </div>
            <div className="bg-zinc-800 rounded-lg p-2">
              <div className="text-sm font-bold">{manga.total_chapters ?? '?'}</div>
              <div className="text-xs text-zinc-500">Total ch.</div>
            </div>
            {manga.has_anime && (
              <div className="bg-zinc-800 rounded-lg p-2">
                <div className="text-sm font-bold">{manga.episodes_watched}</div>
                <div className="text-xs text-zinc-500">Ep. watched</div>
              </div>
            )}
          </div>
          {manga.has_anime && manga.anime_title && (
            <div className="bg-zinc-800 rounded-lg p-3 mb-4 flex items-center gap-2">
              <span className="text-violet-400">🎬</span>
              <span className="text-sm text-zinc-300">{manga.anime_title}</span>
              {manga.total_episodes && <span className="text-xs text-zinc-500 ml-auto">{manga.total_episodes} eps</span>}
            </div>
          )}
          {manga.notes && (
            <div className="bg-zinc-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-zinc-400 leading-relaxed">{manga.notes}</p>
            </div>
          )}
          <button onClick={onClose}
            className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function MobileMenu({ onRecommend, onSync, onSignOut, onExport, loadingRec, syncing }: {
  onRecommend: () => void; onSync: () => void; onSignOut: () => void; onExport: () => void
  loadingRec: boolean; syncing: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} aria-label="More actions"
        className="w-10 h-10 rounded-xl bg-zinc-800 text-zinc-300 text-xl flex items-center justify-center hover:bg-zinc-700">
        ⋮
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-12 z-20 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl w-44">
            <button onClick={() => { onRecommend(); setOpen(false) }} disabled={loadingRec}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-40">
              <span>✦</span> {loadingRec ? 'Thinking…' : 'Recommend'}
            </button>
            <button onClick={() => { onSync(); setOpen(false) }} disabled={syncing}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-40 border-t border-zinc-700">
              <span>⟳</span> {syncing ? 'Syncing…' : 'Sync from MAL'}
            </button>
            <button onClick={() => { onExport(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>↓</span> Export CSV
            </button>
            <button onClick={() => { onSignOut(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-400 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>↩</span> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function RecommendationText({ text }: { text: string }) {
  return (
    <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
      {text.split('\n').map((line, i) => (
        <p key={i} className={line === '' ? 'mt-2' : ''}>
          <MarkdownBold text={line} />
        </p>
      ))}
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
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState('')
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState('')
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<{ updated: number; results: { title: string; changes: string[] }[]; timestamp: string } | null>(null)
  const [notifications, setNotifications] = useState<{ id: string; title: string; new_chapters: number; previous_chapters: number }[]>([])
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null)

  // Cover fetch tracking — prevents re-fetching on every render
  const fetchedIds = useRef<Set<string>>(new Set())
  // Notes debounce timers
  const notesTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const fetchManga = useCallback(async () => {
    const { data, error } = await supabase.from('manga_list').select('*')
    if (error) { showToast('Failed to load manga list'); return }
    if (data) setManga(data as Manga[])
    setLoading(false)
    // Fetch unseen chapter notifications
    const { data: notifs } = await supabase
      .from('chapter_notifications')
      .select('id, title, new_chapters, previous_chapters')
      .eq('seen', false)
      .order('created_at', { ascending: false })
    if (notifs?.length) setNotifications(notifs)
  }, [])

  useEffect(() => { fetchManga() }, [fetchManga])

  // Fetch missing covers — tracks fetched IDs in ref to avoid re-fetching
  useEffect(() => {
    const missing = manga.filter(m => !m.cover_url && !fetchedIds.current.has(m.id))
    if (missing.length === 0) return

    const run = async () => {
      for (const m of missing) {
        fetchedIds.current.add(m.id)
        const info = await fetchMangaInfo(m.title)
        if (info.coverUrl || info.totalChapters) {
          const updates: Partial<Manga> = {}
          if (info.coverUrl) updates.cover_url = info.coverUrl
          if (info.totalChapters) updates.total_chapters = info.totalChapters
          await supabase.from('manga_list').update(updates).eq('id', m.id)
          setManga(prev => prev.map(x => x.id === m.id ? { ...x, ...updates } : x))
        }
        await new Promise(r => setTimeout(r, 400))
      }
    }
    run()
  }, [manga])

  const updateChapter = async (id: string, delta: number, current: number) => {
    const next = Math.max(0, current + delta)
    const now = new Date().toISOString()
    setManga(prev => prev.map(m => m.id === id ? { ...m, current_chapter: next, last_read_at: now } : m))
    const { error } = await supabase
      .from('manga_list')
      .update({ current_chapter: next, last_read_at: now })
      .eq('id', id)
    if (error) {
      showToast('Failed to update chapter')
      setManga(prev => prev.map(m => m.id === id ? { ...m, current_chapter: current } : m))
    } else if (delta > 0) {
      // Log reading activity for stats
      await supabase.from('reading_log').insert({ manga_id: id, chapters_read: delta })
    }
  }

  const updateStatus = async (id: string, status: MangaStatus) => {
    const prev_status = manga.find(m => m.id === id)?.status
    setManga(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    const { error } = await supabase.from('manga_list').update({ status }).eq('id', id)
    if (error) {
      showToast('Failed to update status')
      if (prev_status) setManga(prev => prev.map(m => m.id === id ? { ...m, status: prev_status } : m))
    }
  }

  // Debounced notes save — fires 500ms after last keystroke
  const updateNotes = (id: string, notes: string) => {
    setManga(prev => prev.map(m => m.id === id ? { ...m, notes } : m))
    const existing = notesTimers.current.get(id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      const { error } = await supabase.from('manga_list').update({ notes }).eq('id', id)
      if (error) showToast('Failed to save note')
      notesTimers.current.delete(id)
    }, 500)
    notesTimers.current.set(id, timer)
  }

  const runSync = async () => {
    setSyncing(true)
    setSyncResults(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Sync failed'); return }
      setSyncResults(data)
      showToast(data.updated > 0 ? `Sync complete — ${data.updated} updates` : 'Sync complete — everything up to date')
    } catch {
      showToast('Sync failed — check your connection')
    } finally {
      setSyncing(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const exportCSV = () => {
    const headers = ['Title', 'Status', 'Current Chapter', 'Total Chapters', 'Has Anime', 'Episodes Watched', 'Last Read', 'Notes']
    const rows = manga.map(m => [
      `"${m.title.replace(/"/g, '""')}"`,
      m.status,
      m.current_chapter,
      m.total_chapters ?? '',
      m.has_anime ? 'Yes' : 'No',
      m.episodes_watched,
      m.last_read_at ? new Date(m.last_read_at).toLocaleDateString() : '',
      `"${(m.notes ?? '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `manga-list-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(url)
  }

  const dismissNotifications = async () => {
    const ids = notifications.map(n => n.id)
    setNotifications([])
    await supabase.from('chapter_notifications').update({ seen: true }).in('id', ids)
  }

  const updateEpisodes = async (id: string, delta: number, current: number) => {
    const next = Math.max(0, current + delta)
    setManga(prev => prev.map(m => m.id === id ? { ...m, episodes_watched: next } : m))
    const { error } = await supabase.from('manga_list').update({ episodes_watched: next }).eq('id', id)
    if (error) {
      showToast('Failed to update episodes')
      setManga(prev => prev.map(m => m.id === id ? { ...m, episodes_watched: current } : m))
    }
  }

  const confirmDelete = (id: string) => setPendingDelete(id)
  const cancelDelete = () => setPendingDelete(null)

  const deleteManga = async (id: string) => {
    setPendingDelete(null)
    const removed = manga.find(m => m.id === id)
    setManga(prev => prev.filter(m => m.id !== id))
    const { error } = await supabase.from('manga_list').delete().eq('id', id)
    if (error) {
      showToast('Failed to delete')
      if (removed) setManga(prev => [...prev, removed].sort((a, b) => a.title.localeCompare(b.title)))
    }
  }

  const addManga = async () => {
    if (!newTitle.trim()) return
    setAdding(true)
    try {
      const { data, error } = await supabase
        .from('manga_list')
        .insert({ title: newTitle.trim(), current_chapter: 0, status: 'reading' })
        .select()
        .single()
      if (error) { showToast('Failed to add manga'); return }
      if (data) {
        const newEntry = data as Manga
        setManga(prev => [...prev, newEntry])
        setNewTitle('')
        setShowAdd(false)
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
    } finally {
      setAdding(false)
    }
  }

  const getRecommendations = async () => {
    setLoadingRec(true)
    setRecommendations('')
    setRecError('')
    try {
      const payload = manga.map(m => ({
        title: m.title,
        current_chapter: m.current_chapter,
        status: m.status,
      }))
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manga: payload }),
      })
      const data = await res.json()
      if (!res.ok) { setRecError(data.error ?? 'Something went wrong'); return }
      setRecommendations(data.recommendations)
    } catch {
      setRecError('Network error — check your connection')
    } finally {
      setLoadingRec(false)
    }
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
      <div className="max-w-3xl mx-auto px-4 py-6 md:py-10">

        {/* Header — responsive */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Manga Tracker</h1>
            <p className="text-zinc-500 text-xs md:text-sm mt-0.5">{manga.length} titles</p>
          </div>

          {/* Desktop actions (all visible) */}
          <div className="hidden md:flex gap-2">
            <button onClick={getRecommendations} disabled={manga.length === 0} aria-label="Get AI recommendations"
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors">
              {loadingRec ? 'Thinking…' : '✦ Recommend'}
            </button>
            <button onClick={() => setShowAdd(v => !v)} aria-label="Add manga"
              className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors">
              + Add
            </button>
            <button onClick={runSync} disabled={syncing} aria-label="Sync from MAL"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white disabled:opacity-40 transition-colors">
              {syncing ? '⟳ Syncing…' : '⟳ Sync'}
            </button>
            <button onClick={exportCSV} aria-label="Export list as CSV"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
              ↓ Export
            </button>
            <button onClick={signOut} aria-label="Sign out"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
              Sign out
            </button>
          </div>

          {/* Mobile actions (compact) */}
          <div className="flex md:hidden gap-2">
            <button onClick={() => setShowAdd(v => !v)} aria-label="Add manga"
              className="w-10 h-10 rounded-xl bg-white text-black text-lg font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center">
              +
            </button>
            <MobileMenu
              onRecommend={getRecommendations}
              onSync={runSync}
              onSignOut={signOut}
              onExport={exportCSV}
              loadingRec={loadingRec}
              syncing={syncing}
            />
          </div>
        </div>

        {/* Chapter notifications banner */}
        {notifications.length > 0 && (
          <div className="mb-5 bg-violet-900/30 border border-violet-500/40 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-violet-300 mb-1">📬 New chapters available!</p>
                <div className="space-y-0.5">
                  {notifications.map(n => (
                    <p key={n.id} className="text-xs text-zinc-400">
                      <span className="text-white">{n.title}</span>
                      {n.previous_chapters && <span> · {n.previous_chapters} → </span>}
                      <span className="text-emerald-400">{n.new_chapters} chapters</span>
                    </p>
                  ))}
                </div>
              </div>
              <button onClick={dismissNotifications} aria-label="Dismiss notifications"
                className="text-zinc-600 hover:text-zinc-400 shrink-0 text-lg">×</button>
            </div>
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="mb-5 flex gap-2">
            <input autoFocus value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addManga(); if (e.key === 'Escape') { setShowAdd(false); setNewTitle('') } }}
              placeholder="Manga title…" aria-label="New manga title"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
            <button onClick={addManga} disabled={adding || !newTitle.trim()}
              className="px-5 py-3 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-40">
              {adding ? '…' : 'Add'}
            </button>
          </div>
        )}

        {/* Stats — 2 cols on mobile, 5 on desktop */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5">
          {(Object.keys(STATUS_LABELS) as MangaStatus[]).map(s => (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`rounded-xl p-3 text-center transition-colors ${filter === s ? 'bg-white text-black' : 'bg-zinc-900 hover:bg-zinc-800'}`}>
              <div className="text-xl font-bold">{counts[s] ?? 0}</div>
              <div className={`text-xs mt-0.5 ${filter === s ? 'text-zinc-600' : 'text-zinc-500'}`}>{STATUS_LABELS[s]}</div>
            </button>
          ))}
        </div>

        {/* Controls — stacked on mobile */}
        <div className="flex flex-col gap-2 mb-5 md:flex-row md:items-center md:flex-wrap md:gap-3">
          {/* Filter tabs — horizontal scroll on mobile */}
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-1 bg-zinc-900 p-1 rounded-xl w-fit min-w-full md:min-w-0" role="group" aria-label="Filter by status">
              {(['all', ...Object.keys(STATUS_LABELS)] as (MangaStatus | 'all')[]).map(s => (
                <button key={s} onClick={() => setFilter(s)} aria-pressed={filter === s}
                  className={`px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${filter === s ? 'bg-white text-black font-medium' : 'text-zinc-400 hover:text-white'}`}>
                  {s === 'all' ? 'All' : STATUS_LABELS[s as MangaStatus]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && setSearch('')}
              placeholder="Search…" aria-label="Search manga"
              className="flex-1 md:w-36 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-600 placeholder:text-zinc-600"
            />
            <select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sort order"
              className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 outline-none cursor-pointer">
              <option value="last_read">Recent</option>
              <option value="title">A → Z</option>
              <option value="chapter">Chapters</option>
            </select>
          </div>
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
                        alt={`Cover for ${m.title}`}
                        width={48}
                        height={64}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs" aria-hidden>?</div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button onClick={() => setSelectedManga(m)}
                        className="font-medium text-sm leading-snug truncate text-left hover:text-violet-300 transition-colors flex-1 min-w-0">
                        {m.title}
                      </button>
                      {/* Behind badge — new chapters available */}
                      {m.total_chapters && m.current_chapter < m.total_chapters && m.status === 'reading' && (
                        <span className="shrink-0 text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full whitespace-nowrap">
                          +{m.total_chapters - m.current_chapter} new
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <select
                        value={m.status}
                        onChange={e => updateStatus(m.id, e.target.value as MangaStatus)}
                        aria-label={`Status for ${m.title}`}
                        className={`text-xs px-2 py-0.5 rounded-full border bg-transparent cursor-pointer outline-none ${STATUS_COLORS[m.status]}`}
                      >
                        {(Object.keys(STATUS_LABELS) as MangaStatus[]).map(s => (
                          <option key={s} value={s} className="bg-zinc-900 text-white">{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <span className="text-xs text-zinc-600" aria-label={`Last read ${timeAgo(m.last_read_at)}`}>{timeAgo(m.last_read_at)}</span>
                      <button
                        onClick={() => toggleNotes(m.id)}
                        aria-label={expandedNotes.has(m.id) ? 'Hide notes' : 'Show notes'}
                        aria-expanded={expandedNotes.has(m.id)}
                        className={`text-xs transition-colors ${expandedNotes.has(m.id) || m.notes ? 'text-violet-400' : 'text-zinc-700 hover:text-zinc-400'}`}
                      >
                        📝
                      </button>
                    </div>

                    {m.total_chapters && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden" role="progressbar" aria-valuenow={m.current_chapter} aria-valuemax={m.total_chapters}>
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
                    {m.has_anime && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-xs text-violet-400">🎬</span>
                        <span className="text-xs text-zinc-600 truncate">{m.anime_title ?? 'Anime'}</span>
                        {m.total_episodes && m.episodes_watched < m.total_episodes && (
                          <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-full whitespace-nowrap shrink-0">
                            +{m.total_episodes - m.episodes_watched} ep
                          </span>
                        )}
                        <div className="flex items-center gap-1 ml-auto shrink-0">
                          <button onClick={() => updateEpisodes(m.id, -1, m.episodes_watched)} aria-label="Decrease episode" className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">−</button>
                          <span className="text-xs text-zinc-500 font-mono">ep</span>
                          <EditableNumber
                            value={m.episodes_watched}
                            onSave={n => updateEpisodes(m.id, n - m.episodes_watched, m.episodes_watched)}
                            label={`Episodes watched for ${m.title}`}
                            className="w-8 text-xs py-0.5"
                          />
                          {m.total_episodes && (
                            <span className="text-xs text-zinc-600 font-mono">/{m.total_episodes}</span>
                          )}
                          <button onClick={() => updateEpisodes(m.id, 1, m.episodes_watched)} aria-label="Increase episode" className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">+</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Chapter stepper + delete */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pendingDelete === m.id ? (
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-zinc-400">Delete?</span>
                        <button
                          onClick={() => deleteManga(m.id)}
                          aria-label="Confirm delete"
                          className="px-2 py-1 rounded bg-red-600 hover:bg-red-500 text-white transition-colors"
                        >Yes</button>
                        <button
                          onClick={cancelDelete}
                          aria-label="Cancel delete"
                          className="px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-white transition-colors"
                        >No</button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => updateChapter(m.id, -1, m.current_chapter)}
                          aria-label={`Decrease chapter for ${m.title}`}
                          className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                        >
                          −
                        </button>
                        <EditableNumber
                          value={m.current_chapter}
                          onSave={n => updateChapter(m.id, n - m.current_chapter, m.current_chapter)}
                          label={`Chapter for ${m.title}`}
                          className="w-10 text-xs py-0.5"
                        />
                        <button
                          onClick={() => updateChapter(m.id, 1, m.current_chapter)}
                          aria-label={`Increase chapter for ${m.title}`}
                          className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors"
                        >
                          +
                        </button>
                        <button
                          onClick={() => confirmDelete(m.id)}
                          aria-label={`Delete ${m.title}`}
                          className="ml-1 text-zinc-700 hover:text-red-400 transition-colors text-lg leading-none"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {(expandedNotes.has(m.id) || m.notes) && (
                  <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
                    <textarea
                      value={m.notes ?? ''}
                      onChange={e => updateNotes(m.id, e.target.value)}
                      placeholder="Add a note…"
                      aria-label={`Notes for ${m.title}`}
                      rows={2}
                      className="w-full bg-transparent text-xs text-zinc-400 placeholder:text-zinc-700 outline-none resize-none"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Sync results */}
        {syncResults && (
          <div className="mt-6 bg-zinc-900 border border-zinc-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-zinc-300">⟳ Sync Results</h2>
              <button onClick={() => setSyncResults(null)} aria-label="Dismiss sync results" className="text-zinc-600 hover:text-zinc-400 text-lg leading-none">×</button>
            </div>
            <p className="text-xs text-zinc-500 mb-3">
              Checked {manga.filter(m => m.mal_id).length} titles against MyAnimeList
              {syncResults.timestamp && ` · ${new Date(syncResults.timestamp).toLocaleTimeString()}`}
            </p>
            {syncResults.updated === 0 ? (
              <p className="text-xs text-zinc-500">Everything is up to date.</p>
            ) : (
              <div className="space-y-1.5">
                {syncResults.results.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="text-emerald-400 shrink-0">✓</span>
                    <span className="text-zinc-300 font-medium">{r.title}</span>
                    <span className="text-zinc-500">{r.changes.join(' · ')}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-zinc-700 mt-3">
              Note: sync only works for manga added via Search (MAL ID required). Use the local sync script for browser history — see README.
            </p>
          </div>
        )}

        {/* AI Recommendations */}
        {(recommendations || loadingRec || recError) && (
          <div className="mt-6 bg-zinc-900 border border-violet-500/30 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-violet-300">✦ AI Recommendations</h2>
              <button
                onClick={() => { setRecommendations(''); setRecError(''); setLoadingRec(false) }}
                aria-label="Dismiss recommendations"
                className="text-zinc-600 hover:text-zinc-400 text-lg leading-none"
              >×</button>
            </div>
            {loadingRec && <div className="text-zinc-500 text-sm">Asking Claude…</div>}
            {recError && <div className="text-red-400 text-sm">{recError}</div>}
            {recommendations && <RecommendationText text={recommendations} />}
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selectedManga && (
        <DetailModal
          manga={selectedManga}
          onClose={() => setSelectedManga(null)}
          onStatusChange={(id, status) => {
            updateStatus(id, status)
            setSelectedManga(prev => prev ? { ...prev, status } : null)
          }}
        />
      )}

      {/* Toast */}
      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </main>
  )
}
