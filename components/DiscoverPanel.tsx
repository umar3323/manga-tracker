'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import type { MangaStatus } from '@/lib/supabase'
import {
  getNewSeriesManga, getUpdatedManga,
  getAnimeAdaptations, type JikanSearchResult,
} from '@/lib/jikan'
import type { SJChapter } from '@/app/api/shonenjump/route'
import MangaPlusFeed from '@/components/MangaPlusFeed'
import WebtoonsFeed from '@/components/WebtoonsFeed'

// ── Types ─────────────────────────────────────────────────────────────────────

type DiscoverTab = 'new' | 'updated' | 'jump' | 'plus' | 'webtoons' | 'swipe'

// Mood chips map a vibe to a set of MAL genre keywords
const MOODS: { label: string; emoji: string; genres: string[] }[] = [
  { label: 'Slow burn',    emoji: '🕯️', genres: ['Slice of Life', 'Drama'] },
  { label: 'Adrenaline',   emoji: '⚡', genres: ['Action', 'Sports'] },
  { label: 'Feel-good',    emoji: '☀️', genres: ['Comedy', 'Slice of Life'] },
  { label: 'Dark & gritty',emoji: '🌑', genres: ['Horror', 'Psychological', 'Thriller'] },
  { label: 'Found family', emoji: '🤝', genres: ['Adventure', 'Fantasy'] },
  { label: 'Romance',      emoji: '💕', genres: ['Romance', 'Shoujo'] },
  { label: 'Mind-bending', emoji: '🔮', genres: ['Psychological', 'Mystery', 'Sci-Fi'] },
  { label: 'Epic world',   emoji: '🗺️', genres: ['Fantasy', 'Adventure', 'Isekai'] },
]

const DISC_TABS: { id: DiscoverTab; label: string; emoji: string }[] = [
  { id: 'new',      label: 'New',      emoji: '✨' },
  { id: 'updated',  label: 'Updated',  emoji: '🔔' },
  { id: 'jump',     label: 'Jump',     emoji: '⚡' },
  { id: 'plus',     label: 'Jump+',    emoji: '📖' },
  { id: 'webtoons', label: 'Webtoons', emoji: '📱' },
  { id: 'swipe',    label: 'Swipe',    emoji: '🔀' },
]

interface SwipeCard extends JikanSearchResult { swiped?: 'left' | 'right' }
const SWIPE_THRESHOLD = 100

const STATUS_LABELS: Record<MangaStatus, string> = {
  reading: 'Reading', completed: 'Completed', on_hold: 'On Hold',
  dropped: 'Dropped', plan_to_read: 'Plan To Read', watching: 'Watching', unwatched: 'Unwatched',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DiscoveryGrid({ items, loading, onSelect, emptyMsg }: {
  items: JikanSearchResult[]; loading: boolean; onSelect: (m: JikanSearchResult) => void; emptyMsg?: string
}) {
  if (loading) return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-zinc-900 rounded-xl overflow-hidden animate-pulse">
          <div className="aspect-[2/3] bg-zinc-800" />
          <div className="p-2 space-y-1.5">
            <div className="h-3 bg-zinc-800 rounded w-3/4" />
            <div className="h-3 bg-zinc-800 rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
  if (!items.length) return <p className="text-zinc-500 text-sm text-center py-12">{emptyMsg ?? 'Nothing found.'}</p>
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {items.map(m => (
        <button key={m.mal_id} onClick={() => onSelect(m)}
          className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden text-left group hover:border-zinc-600 transition-colors">
          <div className="relative aspect-[2/3] bg-zinc-800">
            {m.cover_url ? (
              <Image src={m.cover_url} alt={m.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs p-2 text-center">{m.title}</div>
            )}
            {m.score && (
              <div className="absolute top-1.5 right-1.5 bg-black/70 text-yellow-400 text-[10px] font-medium px-1.5 py-0.5 rounded">★{m.score}</div>
            )}
          </div>
          <div className="p-2.5">
            <p className="text-xs font-medium text-zinc-200 line-clamp-2 leading-snug">{m.title}</p>
            {m.genres.length > 0 && (
              <p className="text-[10px] text-zinc-600 mt-1 truncate">{m.genres.slice(0, 2).join(' · ')}</p>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}

function ShonenJumpFeed({ trackedTitles }: { trackedTitles: Set<string> }) {
  const [chapters, setChapters] = useState<SJChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'tracked'>('all')
  useEffect(() => {
    fetch('/api/shonenjump').then(r => r.json()).then(j => { setChapters(j.chapters ?? []); setLoading(false) }).catch(() => setLoading(false))
  }, [])
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const isTracked = (ch: SJChapter) => { const n = norm(ch.title); return [...trackedTitles].some(t => norm(t).includes(n) || n.includes(norm(t))) }
  const visible = filter === 'tracked' ? chapters.filter(isTracked) : chapters
  if (loading) return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-16 bg-zinc-900 rounded-xl animate-pulse" />)}</div>
  if (!chapters.length) return <p className="text-zinc-500 text-sm text-center py-12">Could not load Shonen Jump data.</p>
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><span className="text-lg">⚡</span><div><p className="text-sm font-bold">Shonen Jump</p><p className="text-[10px] text-zinc-500">via viz.com · {chapters.length} series</p></div></div>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {(['all', 'tracked'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${filter === f ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}>
              {f === 'all' ? 'All' : 'Tracking'}
            </button>
          ))}
        </div>
      </div>
      {visible.length === 0 && filter === 'tracked' && <p className="text-zinc-500 text-sm text-center py-8">None of your tracked manga are on Shonen Jump.</p>}
      <div className="space-y-1.5">
        {visible.map(ch => {
          const tracked = isTracked(ch)
          return (
            <div key={ch.seriesSlug} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 hover:border-zinc-600 transition-colors">
              <div className={`w-1.5 h-8 rounded-full shrink-0 ${tracked ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{ch.title}</p>
                  {ch.isFree && <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-800/50">FREE</span>}
                  {tracked && <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-800/50">TRACKING</span>}
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">Chapter {ch.chapter}</p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <a href={ch.vizUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 bg-orange-600 hover:bg-orange-500 text-white text-[11px] font-bold rounded-lg transition-colors">Read ↗</a>
                <a href={ch.seriesUrl} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium rounded-lg transition-colors">Series</a>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DiscoverCardModal({ manga, onClose }: { manga: JikanSearchResult; onClose: () => void }) {
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<MangaStatus>('plan_to_read')
  const [toast, setToast] = useState('')
  const addToList = async () => {
    setAdding(true)
    const adaptations = manga.mal_id ? await getAnimeAdaptations(manga.mal_id) : []
    const anim = adaptations[0]
    const { error } = await supabase.from('manga_list').insert({
      mal_id: manga.mal_id, title: manga.title, current_chapter: 0, status: selectedStatus,
      cover_url: manga.cover_url, total_chapters: manga.total_chapters,
      genres: manga.genres ?? [], authors: manga.authors ?? [],
      has_anime: !!anim, anime_mal_id: anim?.mal_id ?? null, anime_title: anim?.title ?? null, total_episodes: anim?.episodes ?? null,
    })
    if (!error) { setAdded(true); setToast(`Added "${manga.title}"`) }
    else if (error.code === '23505') setToast('Already in your list')
    setAdding(false)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-sm max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 md:hidden"><div className="w-10 h-1 bg-zinc-700 rounded-full" /></div>
        <div className="p-5">
          <div className="flex gap-4 mb-4">
            {manga.cover_url && <img src={manga.cover_url} alt={manga.title} className="w-20 h-28 object-cover rounded-xl shrink-0" />}
            <div className="min-w-0">
              <h2 className="font-bold text-base leading-snug">{manga.title}</h2>
              {manga.score && <p className="text-xs text-yellow-400 mt-1">★ {manga.score}</p>}
              {manga.status && <p className="text-xs text-zinc-500 mt-0.5">{manga.status}</p>}
              <div className="flex flex-wrap gap-1 mt-2">{manga.genres.slice(0, 3).map(g => <span key={g} className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">{g}</span>)}</div>
            </div>
          </div>
          {manga.synopsis && <p className="text-xs text-zinc-400 leading-relaxed mb-4 line-clamp-4">{manga.synopsis}</p>}
          {!added && (
            <div className="flex gap-2 mb-3">
              <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value as MangaStatus)} className="flex-1 text-xs bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-2 text-zinc-300 outline-none">
                {(Object.keys(STATUS_LABELS) as MangaStatus[]).filter(s => s !== 'watching').map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
              <button onClick={addToList} disabled={adding} className="px-4 py-2 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-opacity" style={{ background: 'var(--vermillion)' }}>
                {adding ? '…' : '+ Add'}
              </button>
            </div>
          )}
          {added && <div className="flex items-center gap-2 bg-emerald-900/30 border border-emerald-500/30 rounded-lg px-3 py-2.5 mb-3"><span className="text-emerald-400">✓</span><span className="text-xs text-emerald-300">Added to your list</span></div>}
          {manga.authors && manga.authors.length > 0 && <p className="text-[10px] text-zinc-600 mb-4">By {manga.authors.map(a => a.name).join(', ')}</p>}
          <button onClick={onClose} className="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-colors">Close</button>
        </div>
        {toast && <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-700 text-xs text-white px-3 py-2 rounded-lg whitespace-nowrap">{toast}</div>}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

interface DiscoverPanelProps {
  defaultTab?: DiscoverTab
}

export default function DiscoverPanel({ defaultTab = 'new' }: DiscoverPanelProps) {
  const [activeTab, setActiveTab] = useState<DiscoverTab>(defaultTab)
  const [selectedCard, setSelectedCard] = useState<JikanSearchResult | null>(null)
  const [trackedTitles, setTrackedTitles] = useState<Set<string>>(new Set())
  const [activeMood, setActiveMood] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('manga_list').select('title').then(({ data }) => {
      if (data) setTrackedTitles(new Set(data.map((m: { title: string }) => m.title)))
    })
  }, [])

  // Grid tab data
  const [gridData, setGridData] = useState<Partial<Record<DiscoverTab, JikanSearchResult[]>>>({})
  const [gridLoading, setGridLoading] = useState<Partial<Record<DiscoverTab, boolean>>>({})
  const fetchedGridTabs = useRef<Set<DiscoverTab>>(new Set())

  const fetchGridTab = useCallback(async (tab: DiscoverTab) => {
    if (['swipe', 'jump', 'plus', 'webtoons'].includes(tab) || fetchedGridTabs.current.has(tab)) return
    fetchedGridTabs.current.add(tab)
    setGridLoading(prev => ({ ...prev, [tab]: true }))
    const { data: addedData } = await supabase.from('manga_list').select('mal_id')
    const excludeIds = (addedData ?? []).map((r: { mal_id: number | null }) => r.mal_id).filter(Boolean) as number[]
    let excludeGenreIds: number[] = []
    try { excludeGenreIds = JSON.parse(localStorage.getItem('excluded_genres') ?? '[]') } catch {}
    let results: JikanSearchResult[] = []
    if (tab === 'new') {
      results = await getNewSeriesManga(24, excludeIds)
    } else if (tab === 'updated') {
      results = await getUpdatedManga(24, excludeIds, excludeGenreIds)
    }
    setGridData(prev => ({ ...prev, [tab]: results }))
    setGridLoading(prev => ({ ...prev, [tab]: false }))
  }, [])

  const handleTabChange = (tab: DiscoverTab) => {
    setActiveTab(tab)
    if (tab !== 'swipe') fetchGridTab(tab)
  }

  // Auto-load the default tab on mount
  useEffect(() => { fetchGridTab(defaultTab) }, [defaultTab, fetchGridTab])

  // Swipe state
  const [queue, setQueue] = useState<SwipeCard[]>([])
  const [swipeLoading, setSwipeLoading] = useState(true)
  const [swipeError, setSwipeError] = useState('')
  const [genreProfile, setGenreProfile] = useState<string[] | null>(null)
  const [swipeCount, setSwipeCount] = useState(0)
  const [lastSwipe, setLastSwipe] = useState<'left' | 'right' | null>(null)
  const [lastSwiped, setLastSwiped] = useState<SwipeCard | null>(null)
  const [undoVisible, setUndoVisible] = useState(false)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toast, setToast] = useState('')
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 2000) }

  const loadQueue = useCallback(async () => {
    setSwipeLoading(true); setSwipeError('')
    try {
      const res = await fetch('/api/swipe-queue')
      const data = await res.json()
      if (!res.ok) { setSwipeError(data.error ?? 'Failed to load'); return }
      setQueue(data.queue ?? []); setGenreProfile(data.genreProfile)
    } catch { setSwipeError('Network error — check your connection') }
    finally { setSwipeLoading(false) }
  }, [])

  useEffect(() => { if (activeTab === 'swipe') loadQueue() }, [activeTab, loadQueue])

  const current = queue[0] as SwipeCard | undefined
  const next    = queue[1] as SwipeCard | undefined

  const undoSwipe = useCallback(async () => {
    if (!lastSwiped) return
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoVisible(false)
    setQueue(prev => [lastSwiped, ...prev])
    await supabase.from('swipe_history').delete().eq('mal_id', lastSwiped.mal_id)
    if (lastSwiped.swiped === 'right') await supabase.from('manga_list').delete().eq('mal_id', lastSwiped.mal_id)
    setLastSwiped(null)
  }, [lastSwiped])

  const commitSwipe = useCallback(async (dir: 'left' | 'right', card: SwipeCard) => {
    setLastSwipe(dir); setLastSwiped({ ...card, swiped: dir })
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoVisible(true)
    undoTimer.current = setTimeout(() => setUndoVisible(false), 4000)
    setQueue(prev => prev.slice(1))
    setSwipeCount(c => c + 1)
    await supabase.from('swipe_history').insert({ mal_id: card.mal_id, title: card.title, direction: dir, genres: card.genres ?? [] })
    if (dir === 'right') {
      const { error } = await supabase.from('manga_list').insert({ mal_id: card.mal_id, title: card.title, current_chapter: 0, status: 'plan_to_read', cover_url: card.cover_url, total_chapters: card.total_chapters })
      if (!error) showToast(`Added "${card.title}" to Plan To Read`)
      else if (error.code === '23505') showToast('Already in your list!')
    }
    if (queue.length <= 2) setTimeout(() => loadQueue(), 300)
  }, [queue.length, loadQueue])

  const onMouseDown = (e: React.MouseEvent) => { setIsDragging(true); startX.current = e.clientX }
  const onMouseMove = useCallback((e: React.MouseEvent) => { if (isDragging) setDragX(e.clientX - startX.current) }, [isDragging])
  const onMouseUp = useCallback(() => {
    if (!isDragging || !current) return
    setIsDragging(false)
    if (dragX > SWIPE_THRESHOLD) commitSwipe('right', current)
    else if (dragX < -SWIPE_THRESHOLD) commitSwipe('left', current)
    setDragX(0)
  }, [isDragging, dragX, current, commitSwipe])
  const onTouchStart = (e: React.TouchEvent) => { setIsDragging(true); startX.current = e.touches[0].clientX }
  const onTouchMove = (e: React.TouchEvent) => { if (isDragging) setDragX(e.touches[0].clientX - startX.current) }
  const onTouchEnd = () => {
    if (!isDragging || !current) return
    setIsDragging(false)
    if (dragX > SWIPE_THRESHOLD) commitSwipe('right', current)
    else if (dragX < -SWIPE_THRESHOLD) commitSwipe('left', current)
    setDragX(0)
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (activeTab !== 'swipe' || !current) return
      if (e.key === 'ArrowRight') commitSwipe('right', current)
      if (e.key === 'ArrowLeft')  commitSwipe('left',  current)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTab, current, commitSwipe])

  const rotation = dragX * 0.05
  const likeOpacity = Math.min(1, Math.max(0, dragX / SWIPE_THRESHOLD))
  const skipOpacity = Math.min(1, Math.max(0, -dragX / SWIPE_THRESHOLD))

  return (
    <div
      className="select-none"
      onMouseMove={activeTab === 'swipe' ? onMouseMove : undefined}
      onMouseUp={activeTab === 'swipe' ? onMouseUp : undefined}
      onMouseLeave={activeTab === 'swipe' ? onMouseUp : undefined}
    >
      {/* Mood chips — shown on grid tabs */}
      {activeTab !== 'swipe' && activeTab !== 'jump' && activeTab !== 'plus' && activeTab !== 'webtoons' && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4 scrollbar-none">
          {MOODS.map(m => (
            <button key={m.label}
              onClick={() => setActiveMood(prev => prev === m.label ? null : m.label)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs whitespace-nowrap transition-all shrink-0
                ${activeMood === m.label
                  ? 'bg-[#FF2D46] text-white font-medium shadow'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 border border-zinc-700'}`}>
              <span>{m.emoji}</span>{m.label}
            </button>
          ))}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-xl p-1 mb-5 overflow-x-auto">
        {DISC_TABS.map(tab => (
          <button key={tab.id} onClick={() => handleTabChange(tab.id)}
            className={`flex-1 flex flex-col items-center py-2 rounded-lg text-center transition-colors min-w-[52px] ${
              activeTab === tab.id ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
            }`}>
            <span className="text-base leading-none">{tab.emoji}</span>
            <span className="text-[10px] font-medium mt-1">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Jump */}
      {activeTab === 'jump' && <ShonenJumpFeed trackedTitles={trackedTitles} />}

      {/* Jump+ */}
      {activeTab === 'plus' && <MangaPlusFeed trackedTitles={trackedTitles} />}

      {/* Webtoons */}
      {activeTab === 'webtoons' && <WebtoonsFeed trackedTitles={trackedTitles} onSelect={setSelectedCard} />}

      {/* Grid tabs */}
      {activeTab !== 'swipe' && activeTab !== 'jump' && activeTab !== 'plus' && activeTab !== 'webtoons' && (
        <DiscoveryGrid
          items={(() => {
            const all = gridData[activeTab] ?? []
            if (!activeMood) return all
            const moodGenres = MOODS.find(m => m.label === activeMood)?.genres ?? []
            const filtered = all.filter(m => m.genres.some(g => moodGenres.includes(g)))
            return filtered.length > 0 ? filtered : all // fall back if nothing matches
          })()}
          loading={gridLoading[activeTab] ?? false}
          onSelect={setSelectedCard}
          emptyMsg={activeTab === 'new' ? 'No new series found.' : 'No recently updated manga found.'}
        />
      )}

      {/* Swipe tab */}
      {activeTab === 'swipe' && (
        <div className="max-w-sm mx-auto">
          {/* Swipe header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold">Swipe to discover</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {genreProfile ? `Tuned to: ${genreProfile.slice(0, 3).join(', ')}` : 'Rate manga to train your taste'}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-500">{swipeCount} Swiped</div>
              <div className="flex gap-1 mt-1 justify-end">
                {lastSwipe === 'right' && <span className="text-emerald-400 text-xs">✓ Liked</span>}
                {lastSwipe === 'left'  && <span className="text-red-400 text-xs">✗ Skipped</span>}
              </div>
            </div>
          </div>

          {swipeLoading && <div className="flex items-center justify-center h-96 text-zinc-500 text-sm">Loading…</div>}
          {swipeError && (
            <div className="flex flex-col items-center justify-center h-96 gap-3">
              <p className="text-red-400 text-sm">{swipeError}</p>
              <button onClick={loadQueue} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700">Retry</button>
            </div>
          )}
          {!swipeLoading && !swipeError && queue.length === 0 && (
            <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
              <div className="text-4xl">🎉</div>
              <p className="text-zinc-300 font-medium">You&apos;ve seen everything!</p>
              <p className="text-zinc-500 text-sm">We&apos;ll find more manga based on your taste.</p>
              <button onClick={loadQueue} className="px-6 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200">Load more</button>
            </div>
          )}
          {!swipeLoading && !swipeError && queue.length > 0 && current && (
            <>
              <div className="relative mb-5" style={{ height: 'min(520px, calc(100dvh - 320px))' }}>
                {next && <div className="absolute inset-0 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 scale-95 opacity-60 pointer-events-none" />}
                <div ref={cardRef}
                  className="absolute inset-0 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 cursor-grab active:cursor-grabbing touch-none"
                  style={{ transform: `translateX(${dragX}px) rotate(${rotation}deg)`, transition: isDragging ? 'none' : 'transform 0.3s ease', userSelect: 'none' }}
                  onMouseDown={onMouseDown} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
                  <div className="relative bg-zinc-800" style={{ height: '55%' }}>
                    {current.cover_url ? <Image src={current.cover_url} alt={current.title} fill className="object-cover pointer-events-none" unoptimized /> : <div className="w-full h-full flex items-center justify-center text-zinc-700">No cover</div>}
                    <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center pointer-events-none" style={{ opacity: likeOpacity }}><div className="border-4 border-emerald-400 text-emerald-400 text-4xl font-black px-4 py-1 rounded-xl -rotate-12">LIKE</div></div>
                    <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center pointer-events-none" style={{ opacity: skipOpacity }}><div className="border-4 border-red-400 text-red-400 text-4xl font-black px-4 py-1 rounded-xl rotate-12">SKIP</div></div>
                  </div>
                  <div className="p-4 overflow-y-auto" style={{ height: '45%' }}>
                    <div className="font-bold text-base leading-snug mb-2">{current.title}</div>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {current.genres.slice(0, 5).map(g => <span key={g} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">{g}</span>)}
                      {current.score && <span className="text-xs px-2 py-0.5 bg-zinc-800 text-yellow-400 rounded-full">★ {current.score}</span>}
                    </div>
                    {current.synopsis && <p className="text-xs text-zinc-400 leading-relaxed">{current.synopsis.slice(0, 280)}{current.synopsis.length > 280 ? '…' : ''}</p>}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-8">
                <button onClick={() => commitSwipe('left', current)} aria-label="Skip" className="w-20 h-20 md:w-16 md:h-16 rounded-full bg-zinc-900 border-2 border-red-500/50 flex items-center justify-center text-3xl md:text-2xl hover:bg-red-500/10 hover:border-red-500 active:scale-95 transition-all">✕</button>
                <div className="text-xs text-zinc-600 text-center leading-relaxed"><div>← Skip</div><div>Like →</div></div>
                <button onClick={() => commitSwipe('right', current)} aria-label="Like" className="w-20 h-20 md:w-16 md:h-16 rounded-full bg-zinc-900 border-2 border-emerald-500/50 flex items-center justify-center text-3xl md:text-2xl hover:bg-emerald-500/10 hover:border-emerald-500 active:scale-95 transition-all">♥</button>
              </div>
              <p className="text-center text-xs text-zinc-700 mt-3"><span className="md:hidden">Swipe the card or tap the buttons</span><span className="hidden md:inline">Drag card · Tap buttons · ← → arrows</span></p>
              <div className={`flex justify-center mt-3 transition-all duration-300 ${undoVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
                <button onClick={undoSwipe} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-full text-xs text-zinc-300 transition-colors">↩ Undo last swipe</button>
              </div>
            </>
          )}
        </div>
      )}

      {selectedCard && <DiscoverCardModal manga={selectedCard} onClose={() => setSelectedCard(null)} />}

      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
