'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import { supabase, type Manga, type MangaStatus, type Author } from '@/lib/supabase'
import { fetchMangaInfo, getAuthorWorks, getAuthorInfo, getMangaById, getAnimeAdaptations, searchMangaWithFilters, searchAnimeWithFiltersTyped, searchAnimeByProducer, type JikanSearchResult } from '@/lib/jikan'
import TrendingSection from '@/components/TrendingSection'
import DiscoverySection from '@/components/DiscoverySection'
import ReleaseCalendar from '@/components/ReleaseCalendar'
import ArcEditor from '@/components/ArcEditor'
import SessionTimer, { type ActiveSession } from '@/components/SessionTimer'
import RereadSection from '@/components/RereadSection'
import RewatchSection from '@/components/RewatchSection'
import type { Arc } from '@/components/ArcEditor'
import type { Recommendation } from '@/app/api/recommend/route'
import type { AniListMangaData, AniListAnimeData } from '@/lib/anilist'
import { RELATION_LABELS, formatCountdown } from '@/lib/anilist'
import type { MUSeriesData } from '@/lib/mangaupdates'
import type { ANNRelatedWork } from '@/lib/ann'
import MangaFact from '@/components/MangaFact'
import SeriesMapModal from '@/components/SeriesMapModal'
import CompletionModal from '@/components/CompletionModal'
import DateAttributionModal, { type DateAttribution } from '@/components/DateAttributionModal'
import DeepSearchModal from '@/components/DeepSearchModal'
import UrlImportModal from '@/components/UrlImportModal'
import NotificationBell from '@/components/NotificationBell'
import { getStatus as getAnimeStatus, type AnimeRow } from '@/lib/anime-data'
import { deepDiveSeries, TAKEOUT_ENTRIES } from '@/lib/data/takeout-series'
import { DetailModal, EditableNumber, RelationMergeButton } from '@/components/DetailView'
import {
  Tv, Timer, Play, Clapperboard, BookOpen, PenLine, ThumbsUp, ThumbsDown,
  Folder, MapPin, Flag, Zap, Sword, Cloud, Moon, Flame, Heart, Search,
  ChevronDown, ChevronUp, RefreshCw, GitMerge, X,
} from 'lucide-react'

// EditableNumber, RelationMergeButton, SeriesPanel, and DetailModal are now in components/DetailView.tsx

const STATUS_LABELS: Record<MangaStatus, string> = {
  reading:      'Reading',
  completed:    'Completed',
  on_hold:      'On Hold',
  dropped:      'Dropped',
  plan_to_read: 'Plan To Read',
  watching:     'Watching',
  unwatched:    'Unwatched',
}

const STATUS_COLORS: Record<MangaStatus, string> = {
  reading:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  completed:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
  on_hold:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  dropped:      'bg-red-500/20 text-red-300 border-red-500/30',
  plan_to_read: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  watching:     'bg-violet-500/20 text-violet-300 border-violet-500/30',
  unwatched:    'bg-zinc-500/20 text-zinc-400 border-zinc-600/30',
}

type SortKey = 'last_read' | 'title' | 'chapter'

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just Now'
  if (mins < 60) return `${mins}m Ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h Ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d Ago`
  return `${Math.floor(days / 30)}mo Ago`
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

/** Author works modal */
function AuthorModal({ author, onClose }: { author: Author; onClose: () => void }) {
  const [works, setWorks] = useState<JikanSearchResult[]>([])
  const [info, setInfo] = useState<{ name: string; about: string | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<number | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState('')

  useEffect(() => {
    const load = async () => {
      const [authorInfo, authorWorks] = await Promise.all([
        getAuthorInfo(author.id),
        getAuthorWorks(author.id),
      ])
      setInfo(authorInfo)
      setWorks(authorWorks)
      setLoading(false)
    }
    load()
  }, [author.id])

  const addWork = async (manga: JikanSearchResult) => {
    setAdding(manga.mal_id)
    const { error } = await supabase.from('manga_list').insert({
      mal_id: manga.mal_id, title: manga.title, current_chapter: 0,
      status: 'plan_to_read', cover_url: manga.cover_url,
      total_chapters: manga.total_chapters, authors: manga.authors ?? [],
    })
    if (!error) setAdded(prev => new Set([...prev, manga.mal_id ?? -1]))
    else if (error.code === '23505') setToast('Already In Your List')
    setAdding(null)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>
        <div className="px-5 pt-4 pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-bold text-lg">{author.name}</h2>
              {info?.about && (
                <p className="text-xs text-zinc-500 mt-1 line-clamp-2">{info.about.slice(0, 120)}…</p>
              )}
            </div>
            <button onClick={onClose} aria-label="Close" className="text-zinc-600 hover:text-zinc-400 text-xl ml-3 shrink-0">×</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading && <p className="text-sm text-zinc-500 text-center py-8">Loading works…</p>}
          {!loading && works.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">No works found.</p>}
          {works.map(w => (
            <div key={w.mal_id} className="flex gap-3 items-center bg-zinc-800 rounded-xl p-3">
              {w.cover_url && (
                <Image src={w.cover_url} alt={w.title} width={36} height={50}
                  className="w-9 h-12 object-cover rounded shrink-0" unoptimized />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{w.title}</div>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {w.genres.slice(0, 3).map(g => (
                    <span key={g} className="text-xs px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">{g}</span>
                  ))}
                  {w.score && <span className="text-xs text-yellow-400">★ {w.score}</span>}
                </div>
              </div>
              <button onClick={() => addWork(w)} disabled={adding === w.mal_id || (w.mal_id !== null && added.has(w.mal_id))}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  added.has(w.mal_id ?? -1) ? 'bg-emerald-600/20 text-emerald-400' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-40'
                }`}>
                {added.has(w.mal_id ?? -1) ? '✓ Added' : adding === w.mal_id ? '…' : '+ Add'}
              </button>
            </div>
          ))}
        </div>
        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-700 text-xs text-white px-3 py-2 rounded-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

/** Studio / production company modal — shows anime by that studio, allows adding to library */
function StudioModal({ studio, onClose }: { studio: Author; onClose: () => void }) {
  const [works, setWorks] = useState<JikanSearchResult[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState<number | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState('')

  useEffect(() => {
    searchAnimeByProducer(studio.id).then(results => {
      setWorks(results)
      setLoading(false)
    })
  }, [studio.id])

  const addWork = async (item: JikanSearchResult) => {
    if (!item.mal_id) return
    setAdding(item.mal_id)
    const { error } = await supabase.from('manga_list').insert({
      mal_id: item.mal_id,
      title: item.title,
      current_chapter: 0,
      episodes_watched: 0,
      status: 'unwatched',
      cover_url: item.cover_url,
      total_episodes: item.episodes ?? null,
      content_type: 'anime',
      has_anime: true,
      authors: item.authors ?? [],
      synopsis: item.synopsis ?? null,
      genres: item.genres ?? [],
      score: item.score ?? null,
    })
    if (!error) setAdded(prev => new Set([...prev, item.mal_id!]))
    else if (error.code === '23505') setToast('Already In Your Library')
    setAdding(null)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl md:rounded-2xl w-full md:max-w-lg max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>
        <div className="px-5 pt-4 pb-3 border-b border-zinc-800 shrink-0">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] text-zinc-600 uppercase tracking-widest mb-0.5">Studio / Producer</p>
              <h2 className="font-bold text-lg">{studio.name}</h2>
            </div>
            <button onClick={onClose} aria-label="Close" className="text-zinc-600 hover:text-zinc-400 text-xl ml-3 shrink-0">×</button>
          </div>
        </div>
        <div className="overflow-y-auto flex-1 p-4 space-y-2">
          {loading && <p className="text-sm text-zinc-500 text-center py-8">Loading titles…</p>}
          {!loading && works.length === 0 && <p className="text-sm text-zinc-500 text-center py-8">No titles found.</p>}
          {works.map(w => (
            <div key={w.mal_id} className="flex gap-3 items-center bg-zinc-800 rounded-xl p-3">
              {w.cover_url && (
                <Image src={w.cover_url} alt={w.title} width={36} height={50}
                  className="w-9 h-12 object-cover rounded shrink-0" unoptimized />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{w.title}</div>
                <div className="flex gap-1 mt-1 flex-wrap items-center">
                  {w.genres.slice(0, 3).map(g => (
                    <span key={g} className="text-xs px-1.5 py-0.5 bg-zinc-700 text-zinc-400 rounded">{g}</span>
                  ))}
                  {w.score && <span className="text-xs text-yellow-400">★ {w.score}</span>}
                  {w.episodes && <span className="text-xs text-zinc-500">{w.episodes} ep</span>}
                </div>
              </div>
              <button onClick={() => addWork(w)} disabled={adding === w.mal_id || (w.mal_id !== null && added.has(w.mal_id))}
                className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  added.has(w.mal_id ?? -1) ? 'bg-emerald-600/20 text-emerald-400' : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-40'
                }`}>
                {added.has(w.mal_id ?? -1) ? '✓ Added' : adding === w.mal_id ? '…' : '+ Add'}
              </button>
            </div>
          ))}
        </div>
        {toast && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-zinc-700 text-xs text-white px-3 py-2 rounded-lg">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}

/** Full-page detail modal for a recommended manga */
function RecommendationModal({ rec, onClose }: { rec: Recommendation; onClose: () => void }) {
  const [detail, setDetail] = useState<JikanSearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<MangaStatus>('plan_to_read')
  const [toast, setToast] = useState('')

  useEffect(() => {
    if (!rec.mal_id) { Promise.resolve().then(() => setLoading(false)); return }
    getMangaById(rec.mal_id).then(d => { setDetail(d); setLoading(false) })
  }, [rec.mal_id])

  const addToList = async () => {
    if (!detail) return
    setAdding(true)
    const adaptations = detail.mal_id ? await getAnimeAdaptations(detail.mal_id) : []
    const anim = adaptations[0]
    const { error } = await supabase.from('manga_list').insert({
      mal_id: detail.mal_id,
      title: detail.title,
      current_chapter: 0,
      status: selectedStatus,
      cover_url: detail.cover_url,
      total_chapters: detail.total_chapters,
      genres: detail.genres ?? [],
      authors: detail.authors ?? [],
      has_anime: anim ? true : false,
      anime_mal_id: anim?.mal_id ?? null,
      anime_title: anim?.title ?? null,
      total_episodes: anim?.episodes ?? null,
    })
    if (!error || error.code === '23505') {
      setAdded(true)
      setToast(error?.code === '23505' ? 'Already In Your List' : 'Added To Your List!')
    } else {
      setToast('Failed To Add — Try Again')
    }
    setAdding(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-l-2xl lg:rounded-t-none w-full lg:w-[420px] max-h-[92vh] lg:max-h-none overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64 text-zinc-500 text-sm">Loading…</div>
        ) : (
          <div className="p-5">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1 min-w-0 pr-3">
                <h2 className="font-bold text-xl leading-tight">{rec.title}</h2>
                {detail?.authors && detail.authors.length > 0 && (
                  <p className="text-xs text-zinc-500 mt-1">by {detail.authors.map(a => a.name).join(', ')}</p>
                )}
              </div>
              <button onClick={onClose} aria-label="Close" className="text-zinc-600 hover:text-zinc-400 text-2xl leading-none shrink-0">×</button>
            </div>

            {/* Cover + meta */}
            <div className="flex gap-4 mb-5">
              {detail?.cover_url && (
                <Image src={detail.cover_url} alt={rec.title} width={96} height={136}
                  className="w-24 h-[136px] object-cover rounded-xl shrink-0" unoptimized />
              )}
              <div className="flex-1 space-y-2">
                {detail?.score && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-yellow-400 text-sm">★</span>
                    <span className="text-sm font-semibold">{detail.score}</span>
                    <span className="text-xs text-zinc-500">/ 10 on MAL</span>
                  </div>
                )}
                {detail?.total_chapters && (
                  <p className="text-xs text-zinc-500">{detail.total_chapters} chapters</p>
                )}
                {detail?.status && (
                  <p className="text-xs text-zinc-500">{detail.status}</p>
                )}
                {/* Genres */}
                <div className="flex flex-wrap gap-1 mt-1">
                  {(detail?.genres ?? []).slice(0, 5).map(g => (
                    <span key={g} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">{g}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Recommendation reason */}
            <div className="flex items-center gap-3 bg-zinc-800 rounded-xl p-3 mb-5">
              <div className="w-10 h-10 rounded-full bg-zinc-700 flex flex-col items-center justify-center shrink-0">
                <span className="text-sm font-bold text-violet-300 leading-none">{rec.confidence}</span>
                <span className="text-zinc-600 text-[9px] leading-none">%</span>
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">{rec.reason}</p>
            </div>

            {/* Synopsis */}
            {detail?.synopsis && (
              <div className="mb-5">
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Synopsis</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{detail.synopsis}</p>
              </div>
            )}

            {/* MAL link */}
            {detail?.mal_id && (
              <a href={`https://myanimelist.net/manga/${detail.mal_id}`} target="_blank" rel="noopener noreferrer"
                className="block text-xs text-violet-400 hover:text-violet-300 mb-5">
                View on MyAnimeList ↗
              </a>
            )}

            {/* Add to list */}
            {added ? (
              <div className="w-full py-3 bg-emerald-900/30 border border-emerald-700/40 rounded-xl text-sm text-emerald-400 text-center">
                ✓ {toast || 'Added To Your List'}
              </div>
            ) : (
              <div className="flex gap-2">
                <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value as MangaStatus)}
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-3 text-sm text-zinc-300 outline-none cursor-pointer">
                  {(Object.keys(STATUS_LABELS) as MangaStatus[]).map(s => (
                    <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                  ))}
                </select>
                <button onClick={addToList} disabled={adding || !detail}
                  className="px-5 py-3 bg-white text-black rounded-xl text-sm font-medium hover:bg-zinc-200 disabled:opacity-40 transition-colors">
                  {adding ? '…' : '+ Add'}
                </button>
              </div>
            )}
          </div>
        )}

        {toast && added && (
          <div className="mx-5 mb-5 text-xs text-zinc-500 text-center">{toast}</div>
        )}
      </div>
    </div>
  )
}

function ShelfPicker({ manga, onClose }: { manga: Manga; onClose: () => void }) {
  const [shelves, setShelves] = useState<{ id: string; name: string }[]>([])
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    supabase.from('shelves').select('id, name').order('created_at').then(({ data }) => {
      if (data) setShelves(data)
    })
  }, [])

  const addToShelf = async (shelfId: string) => {
    setAdding(shelfId)
    const { error } = await supabase.from('shelf_manga').insert({ shelf_id: shelfId, manga_id: manga.id })
    if (!error || error.code === '23505') setAdded(prev => new Set([...prev, shelfId]))
    setAdding(null)
  }

  const createAndAdd = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const { data } = await supabase.from('shelves').insert({ name: newName.trim() }).select().single()
    if (data) {
      setShelves(prev => [...prev, data])
      await addToShelf(data.id)
    }
    setNewName('')
    setCreating(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-sm p-5"
        onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold mb-1">Add to shelf</h2>
        <p className="text-xs text-zinc-500 mb-4 truncate">{manga.title}</p>
        <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
          {shelves.length === 0 && <p className="text-xs text-zinc-600">No shelves yet — create one below.</p>}
          {shelves.map(s => (
            <button key={s.id} onClick={() => addToShelf(s.id)} disabled={adding === s.id || added.has(s.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-colors ${
                added.has(s.id) ? 'bg-emerald-900/30 text-emerald-400' : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-40'
              }`}>
              <span>{s.name}</span>
              <span>{added.has(s.id) ? '✓' : adding === s.id ? '…' : '+'}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-2 border-t border-zinc-800 pt-4">
          <input value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createAndAdd()}
            placeholder="New shelf name…"
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <button onClick={createAndAdd} disabled={creating || !newName.trim()}
            className="px-4 py-2 bg-white text-black rounded-xl text-sm font-medium disabled:opacity-40">
            {creating ? '…' : 'Create'}
          </button>
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 text-xs text-zinc-600 hover:text-zinc-400">Done</button>
      </div>
    </div>
  )
}

function ShareModal({ token, enabled, onToggle, onClose }: {
  token: string | null; enabled: boolean; onToggle: () => void; onClose: () => void
}) {
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const shareUrl = token ? `${origin}/share/${token}` : null
  const copy = () => { if (shareUrl) { navigator.clipboard.writeText(shareUrl); } }
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-sm p-5"
        onClick={e => e.stopPropagation()}>
        <h2 className="font-semibold mb-1">Share your list</h2>
        <p className="text-xs text-zinc-500 mb-4">Generate a public read-only link to your manga list.</p>
        <div className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3 mb-4">
          <span className="text-sm font-medium">Sharing {enabled ? 'on' : 'off'}</span>
          <button onClick={onToggle}
            className={`w-12 h-6 rounded-full transition-colors relative ${enabled ? 'bg-emerald-500' : 'bg-zinc-600'}`}>
            <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${enabled ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
        {enabled && shareUrl && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input readOnly value={shareUrl}
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-300 outline-none" />
              <button onClick={copy} className="px-3 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-xl text-xs text-zinc-300">
                Copy
              </button>
            </div>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer"
              className="block text-xs text-violet-400 hover:text-violet-300">
              Preview ↗
            </a>
            <p className="text-[10px] text-zinc-600 pt-1">
              Compare two lists: <code className="text-zinc-500">/compare/[tokenA]/[tokenB]</code>
            </p>
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full py-2 text-xs text-zinc-600 hover:text-zinc-400">Close</button>
      </div>
    </div>
  )
}

// ─── Library Health Check ────────────────────────────────────────────────────

type CardIssue = { field: string; label: string }
type CardHealth = { manga: Manga; issues: CardIssue[] }

function computeHealth(manga: Manga[]): CardHealth[] {
  return manga
    .map(m => {
      const issues: CardIssue[] = []
      if (!m.mal_id)                                     issues.push({ field: 'mal_id',    label: 'No MAL ID'       })
      if (!m.cover_url)                                  issues.push({ field: 'cover_url', label: 'No Cover'        })
      if (!m.authors || (m.authors as unknown[]).length === 0) issues.push({ field: 'authors', label: 'No Author'    })
      if (!m.genres  || m.genres.length === 0)           issues.push({ field: 'genres',    label: 'No Genres'       })
      if (!m.synopsis)                                   issues.push({ field: 'synopsis',  label: 'No Synopsis'     })
      return { manga: m, issues }
    })
    .filter(c => c.issues.length > 0)
    .sort((a, b) => b.issues.length - a.issues.length)
}

// ── Google Takeout Import ────────────────────────────────────────────────────
// TAKEOUT_ENTRIES is imported from lib/data/takeout-series.ts

function TakeoutImportModal({ existingTitles, onClose, onImported }: {
  existingTitles: Set<string>
  onClose: () => void
  onImported: (count: number) => void
}) {
  const toImport = TAKEOUT_ENTRIES.filter(e => !existingTitles.has(e.title.toLowerCase().trim()))
  const alreadyIn = TAKEOUT_ENTRIES.filter(e => existingTitles.has(e.title.toLowerCase().trim()))
  const [status, setStatus] = useState<'idle' | 'importing' | 'done' | 'error'>('idle')
  const [imported, setImported] = useState<string[]>([])
  const [errMsg, setErrMsg] = useState('')

  const runImport = async () => {
    setStatus('importing')
    const { error } = await supabase.from('manga_list').insert(toImport)
    if (error) {
      setErrMsg(error.message)
      setStatus('error')
      return
    }
    setImported(toImport.map(e => e.title))
    setStatus('done')
    onImported(toImport.length)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-semibold text-base">📦 Google Takeout Import</h2>
            <p className="text-xs text-zinc-500 mt-0.5">33 series from your YouTube watch history analysis</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {status === 'idle' && (
            <>
              <p className="text-sm text-zinc-400 mb-4">
                This will add <span className="text-white font-semibold">{toImport.length} new series</span> to your library
                {alreadyIn.length > 0 && `, skipping ${alreadyIn.length} already in your library`}.
              </p>
              {toImport.length > 0 && (
                <div className="space-y-1 mb-4">
                  {toImport.map(e => (
                    <div key={e.title} className="flex items-center justify-between bg-zinc-800 rounded-lg px-3 py-2">
                      <span className="text-xs text-zinc-300 truncate flex-1">{e.title}</span>
                      <span className="text-[10px] text-zinc-500 ml-2 shrink-0">{e.status}</span>
                    </div>
                  ))}
                </div>
              )}
              {alreadyIn.length > 0 && (
                <details className="mb-4">
                  <summary className="text-xs text-zinc-600 cursor-pointer">Already in library ({alreadyIn.length})</summary>
                  <div className="mt-2 space-y-1">
                    {alreadyIn.map(e => (
                      <div key={e.title} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50">
                        <span className="text-[10px] text-emerald-500">✓</span>
                        <span className="text-xs text-zinc-500">{e.title}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              {toImport.length === 0 && (
                <p className="text-sm text-emerald-400">All 33 series are already in your library! 🎉</p>
              )}
            </>
          )}
          {status === 'importing' && (
            <p className="text-sm text-zinc-400 text-center py-8">Importing {toImport.length} series…</p>
          )}
          {status === 'done' && (
            <div className="py-4">
              <p className="text-sm text-emerald-400 font-semibold mb-3">✓ Imported {imported.length} series successfully!</p>
              <div className="space-y-1">
                {imported.map(t => (
                  <div key={t} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg">
                    <span className="text-[10px] text-emerald-500">✓</span>
                    <span className="text-xs text-zinc-300">{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {status === 'error' && (
            <p className="text-sm text-red-400 py-4">Import failed: {errMsg}</p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-zinc-800 flex justify-end gap-2">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700 hover:text-white transition-colors">
            {status === 'done' ? 'Close' : 'Cancel'}
          </button>
          {status === 'idle' && toImport.length > 0 && (
            <button onClick={runImport}
              className="px-5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium transition-colors">
              Import {toImport.length} Series
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function HealthCheckModal({
  manga,
  onClose,
  onEnriched,
}: {
  manga: Manga[]
  onClose: () => void
  onEnriched: (updated: Manga) => void
}) {
  const [cards, setCards] = useState<CardHealth[]>(() => computeHealth(manga))
  const [enrichingId, setEnrichingId] = useState<string | null>(null)
  const [enrichingAll, setEnrichingAll] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)

  const healthy   = manga.length - cards.length
  const pct       = Math.round((healthy / manga.length) * 100)
  const scoreColor = pct === 100 ? 'text-emerald-400' : pct >= 80 ? 'text-yellow-400' : 'text-red-400'

  const enrichOne = async (m: Manga): Promise<boolean> => {
    try {
      // Search Jikan for this title (or use existing mal_id)
      let jikan: JikanSearchResult | null = null
      if (m.mal_id != null) {
        jikan = await getMangaById(m.mal_id)
      }
      if (!jikan) {
        const results = await searchMangaWithFilters({ query: m.title })
        jikan = results[0] ?? null
      }
      if (!jikan || jikan.mal_id == null) return false

      // Anime adaptation
      let animePatch: Partial<Manga> = {}
      if (!m.has_anime) {
        const adaptations = await getAnimeAdaptations(jikan.mal_id)
        const anim = adaptations[0] ?? null
        if (anim) {
          animePatch = {
            has_anime: true,
            anime_mal_id: anim.mal_id,
            anime_title: anim.title,
            total_episodes: anim.episodes ?? null,
          }
        }
      }

      const patch: Partial<Manga> = {
        mal_id:         jikan.mal_id,
        cover_url:      jikan.cover_url ?? m.cover_url,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        authors:        (jikan.authors?.length ? jikan.authors : m.authors) as any,
        genres:         jikan.genres?.length  ? jikan.genres  : m.genres,
        synopsis:       jikan.synopsis ?? m.synopsis,
        total_chapters: jikan.total_chapters ?? m.total_chapters,
        ...animePatch,
      }

      await supabase.from('manga_list').update(patch).eq('id', m.id)
      onEnriched({ ...m, ...patch })
      return true
    } catch {
      return false
    }
  }

  const handleEnrichOne = async (c: CardHealth) => {
    setEnrichingId(c.manga.id)
    const ok = await enrichOne(c.manga)
    setEnrichingId(null)
    if (ok) setCards(prev => prev.filter(x => x.manga.id !== c.manga.id))
    else setLog(prev => [...prev, `❌ ${c.manga.title} — could not fetch`])
  }

  const handleEnrichAll = async () => {
    setEnrichingAll(true)
    setLog([])
    const queue = [...cards]
    for (const c of queue) {
      setLog(prev => [...prev, `⟳ Enriching ${c.manga.title}…`])
      const ok = await enrichOne(c.manga)
      setLog(prev => {
        const next = [...prev]
        next[next.length - 1] = ok
          ? `✅ ${c.manga.title}`
          : `❌ ${c.manga.title} — not found`
        return next
      })
      if (ok) setCards(prev => prev.filter(x => x.manga.id !== c.manga.id))
      await new Promise(r => setTimeout(r, 450)) // respect Jikan rate limit
    }
    setEnrichingAll(false)
    setDone(true)
  }

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-bold text-lg">Library Health Check</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {manga.length} total cards ·{' '}
              <span className={scoreColor}>{pct}% healthy</span>
              {cards.length > 0 && ` · ${cards.length} Need Attention`}
            </p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Score bar */}
        <div className="px-6 pt-4">
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-500' : pct >= 80 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-zinc-600 mt-1">
            <span>{healthy} Healthy</span>
            <span>{cards.length} Issues</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {cards.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-4xl mb-3">✅</div>
              <p className="text-zinc-300 font-medium">All {manga.length} cards are fully populated!</p>
              <p className="text-zinc-500 text-sm mt-1">Every entry has MAL ID, cover, authors, genres & synopsis.</p>
            </div>
          ) : (
            cards.map(c => (
              <div key={c.manga.id} className="flex items-center gap-3 bg-zinc-800/60 rounded-xl p-3">
                {/* Cover thumbnail */}
                {c.manga.cover_url ? (
                  <img src={c.manga.cover_url} alt={c.manga.title}
                    className="w-10 h-14 object-cover rounded-lg shrink-0 bg-zinc-700" />
                ) : (
                  <div className="w-10 h-14 rounded-lg bg-zinc-700 shrink-0 flex items-center justify-center text-zinc-500 text-xs">?</div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.manga.title}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.issues.map(i => (
                      <span key={i.field} className="text-[10px] bg-red-900/40 text-red-400 border border-red-900/60 rounded px-1.5 py-0.5">
                        {i.label}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Enrich button */}
                <button
                  onClick={() => handleEnrichOne(c)}
                  disabled={!!enrichingId || enrichingAll}
                  className="shrink-0 px-3 py-1.5 rounded-lg bg-cyan-900/40 text-cyan-400 border border-cyan-900/60 text-xs font-medium hover:bg-cyan-800/60 disabled:opacity-40 transition-colors"
                >
                  {enrichingId === c.manga.id ? '⟳' : '⚡ Fix'}
                </button>
              </div>
            ))
          )}

          {/* Log */}
          {log.length > 0 && (
            <div className="mt-3 bg-zinc-950 rounded-xl p-3 space-y-0.5 max-h-40 overflow-y-auto">
              {log.map((l, i) => (
                <p key={i} className="text-xs font-mono text-zinc-400">{l}</p>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {cards.length > 0 && !done && (
          <div className="px-6 py-4 border-t border-zinc-800 flex justify-between items-center gap-3">
            <p className="text-xs text-zinc-500">{enrichingAll ? 'Enriching From Jikan / MAL…' : `${cards.length} Card${cards.length !== 1 ? 's' : ''} Need Data`}</p>
            <button
              onClick={handleEnrichAll}
              disabled={enrichingAll || !!enrichingId}
              className="px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-500 disabled:opacity-40 transition-colors"
            >
              {enrichingAll ? '⟳ Enriching All…' : `⚡ Fix All ${cards.length}`}
            </button>
          </div>
        )}
        {done && (
          <div className="px-6 py-4 border-t border-zinc-800 text-center text-sm text-emerald-400">
            ✅ Enrichment Complete — {manga.length} Cards Checked
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Mobile Menu ─────────────────────────────────────────────────────────────

function MobileMenu({ onRecommend, onSync, onSignOut, onExportCSV, onExportMAL, onExportAniList, onShare, onCheckCards, onTakeoutImport, loadingRec, syncing }: {
  onRecommend: () => void; onSync: () => void; onSignOut: () => void
  onExportCSV: () => void; onExportMAL: () => void; onExportAniList: () => void
  onShare: () => void; onCheckCards: () => void; onTakeoutImport: () => void; loadingRec: boolean; syncing: boolean
}) {
  const [open, setOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} aria-label="More actions"
        className="w-10 h-10 rounded-xl bg-zinc-800 text-zinc-300 text-xl flex items-center justify-center hover:bg-zinc-700">
        ⋮
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setExportOpen(false) }} />
          <div className="absolute right-0 top-12 z-20 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl w-48">
            <button onClick={() => { onRecommend(); setOpen(false) }} disabled={loadingRec}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-40">
              <span>✦</span> {loadingRec ? 'Thinking…' : 'Recommend'}
            </button>
            <button onClick={() => { onSync(); setOpen(false) }} disabled={syncing}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-40 border-t border-zinc-700">
              <span>⟳</span> {syncing ? 'Syncing…' : 'Sync from MAL'}
            </button>
            {/* Export sub-menu */}
            <button onClick={() => setExportOpen(v => !v)}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center justify-between gap-2 border-t border-zinc-700">
              <span className="flex items-center gap-2"><span>↓</span> Export</span>
              <span className="text-zinc-500 text-xs">{exportOpen ? '▲' : '▼'}</span>
            </button>
            {exportOpen && (
              <>
                <button onClick={() => { onExportCSV(); setOpen(false) }}
                  className="w-full px-6 py-2.5 text-xs text-left text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700/50">
                  CSV
                </button>
                <button onClick={() => { onExportMAL(); setOpen(false) }}
                  className="w-full px-6 py-2.5 text-xs text-left text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700/50">
                  MAL XML
                </button>
                <button onClick={() => { onExportAniList(); setOpen(false) }}
                  className="w-full px-6 py-2.5 text-xs text-left text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700/50">
                  AniList JSON
                </button>
              </>
            )}
            <button onClick={() => { onCheckCards(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>🩺</span> Check Cards
            </button>
            <button onClick={() => { onTakeoutImport(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>📦</span> Takeout Import
            </button>
            <button onClick={() => { onShare(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>🔗</span> Share List
            </button>
            <button onClick={() => { onSignOut(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-400 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>↩</span> Sign Out
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
  const [filter, setFilter] = useState<MangaStatus | 'all' | 'duplicates'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('last_read')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addSuggestions, setAddSuggestions] = useState<JikanSearchResult[]>([])
  const [showAddSuggestions, setShowAddSuggestions] = useState(false)
  const [addSuggestLoading, setAddSuggestLoading] = useState(false)
  const [selectedJikan, setSelectedJikan] = useState<JikanSearchResult | null>(null)
  const [addContentType, setAddContentType] = useState<'manga' | 'anime' | 'movie'>('manga')
  const addSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addBarRef = useRef<HTMLDivElement>(null)
  // Quick-details fields shown after a title is confirmed
  const [addShowDetails, setAddShowDetails] = useState(false)
  const [addDetailStatus, setAddDetailStatus] = useState<MangaStatus | null>(null)
  const [addDetailProgress, setAddDetailProgress] = useState<string>('')
  const [addDetailDate, setAddDetailDate] = useState<string>('')
  const [addDetailNotes, setAddDetailNotes] = useState<string>('')
  const [addDetailRating, setAddDetailRating] = useState<'up' | 'down' | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState('')
  const [showRecModal, setShowRecModal] = useState(false)
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null)
  const [selectedStudio, setSelectedStudio] = useState<Author | null>(null)
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<{ updated: number; results: { title: string; changes: string[] }[]; timestamp: string } | null>(null)
  const [notifications, setNotifications] = useState<{ id: string; title: string; new_chapters: number; previous_chapters: number }[]>([])
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null)
  const [shelfPickerManga, setShelfPickerManga] = useState<Manga | null>(null)
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null)
  const [mood, setMood] = useState<string | null>(null)

  // ── Incremental rendering ──────────────────────────────────────────────
  // Only render the first N cards in the DOM; an IntersectionObserver sentinel
  // at the bottom of the grid loads the next batch when it scrolls into view.
  // This keeps the DOM lean (≈40 nodes max) without any extra dependency.
  const INITIAL_BATCH = 40
  const BATCH_SIZE    = 20
  const [renderCount, setRenderCount] = useState(INITIAL_BATCH)
  const gridSentinelRef = useRef<HTMLDivElement>(null)

  // Reset to first batch whenever the visible set changes
  useEffect(() => { setRenderCount(INITIAL_BATCH) }, [filter, typeFilter, search, mood])

  // Load next batch when sentinel scrolls into view
  useEffect(() => {
    const el = gridSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setRenderCount(c => c + BATCH_SIZE) },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const [watchPrompt, setWatchPrompt] = useState<{ id: string; epInput: string } | null>(null)
  const [completionManga, setCompletionManga] = useState<Manga | null>(null)
  const [progressPrompt, setProgressPrompt] = useState<{
    id: string; delta: number; current: number; type: 'chapter' | 'episode'; title: string
  } | null>(null)
  const sessionAttrRef = useRef<DateAttribution | null>(null)
  const [pacePerDay, setPacePerDay] = useState(0)
  const [shareModal, setShareModal] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [arcsMap, setArcsMap] = useState<Record<string, Arc[]>>({})
  const [rereadCounts, setRereadCounts] = useState<Record<string, number>>({})
  const [rewatchCounts, setRewatchCounts] = useState<Record<string, number>>({})
  const [expandedSynopsis, setExpandedSynopsis] = useState<Set<string>>(new Set())
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [showHealthCheck, setShowHealthCheck] = useState(false)
  const [showTakeoutImport, setShowTakeoutImport] = useState(false)
  const [deepSelectMode, setDeepSelectMode] = useState(false)
  const [deepSelected, setDeepSelected] = useState<Set<string>>(new Set())
  const [deepSearchTarget, setDeepSearchTarget] = useState<Manga | null>(null)
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set())

  // Sync dismissedPairs from localStorage + Supabase user metadata on mount
  useEffect(() => {
    let local: Set<string> = new Set()
    try { local = new Set(JSON.parse(localStorage.getItem('yomu_dismissed_pairs') ?? '[]')) } catch {}
    if (local.size > 0) setDismissedPairs(local)
    supabase.auth.getUser().then(({ data }) => {
      const remote: string[] = data?.user?.user_metadata?.dismissed_pairs ?? []
      if (remote.length === 0) return
      setDismissedPairs(prev => {
        const merged = new Set([...prev, ...remote])
        try { localStorage.setItem('yomu_dismissed_pairs', JSON.stringify([...merged])) } catch {}
        return merged
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cover fetch tracking — prevents re-fetching on every render
  const fetchedIds = useRef<Set<string>>(new Set())
  // Notes debounce timers
  const notesTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel pending notes saves and toast on unmount
  useEffect(() => {
    return () => {
      notesTimers.current.forEach(t => clearTimeout(t))
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  const [animeList, setAnimeList] = useState<AnimeRow[]>([])

  const fetchManga = useCallback(async () => {
    const [{ data, error }, { data: al }] = await Promise.all([
      supabase.from('manga_list').select('*'),
      supabase.from('anime_list').select('id,title,total_watch_hours,last_watched,is_movie'),
    ])
    if (error) { showToast('Failed To Load Manga List'); setLoading(false); return }
    if (data) setManga(data as Manga[])
    if (al) setAnimeList(al as AnimeRow[])
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

  // Re-fetch when user switches back to this tab — ensures episode-count updates from the
  // extension (which fire while watching in another tab) are reflected immediately on return.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchManga() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchManga])

  // Pace tracking: avg chapters/day over last 30 days
  useEffect(() => {
    const ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    supabase.from('reading_log').select('chapters_read').gte('logged_at', ago)
      .then(({ data }) => {
        if (!data?.length) return
        const total = data.reduce((s, l) => s + l.chapters_read, 0)
        setPacePerDay(total / 30)
      })
    // Public share token
    supabase.from('public_shares').select('token, enabled').limit(1).single()
      .then(({ data }) => { if (data) { setShareToken(data.token); setShareEnabled(data.enabled) } })
    // Bulk fetch all arcs for arc-aware progress display
    supabase.from('arcs').select('*').order('chapter_start')
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, Arc[]> = {}
        for (const arc of data as Arc[]) {
          if (!map[arc.manga_id]) map[arc.manga_id] = []
          map[arc.manga_id].push(arc)
        }
        setArcsMap(map)
      })
    // Re-read counts per manga
    supabase.from('rereads').select('manga_id')
      .then(({ data }) => {
        if (!data) return
        const counts: Record<string, number> = {}
        for (const r of data as { manga_id: string }[]) {
          counts[r.manga_id] = (counts[r.manga_id] ?? 0) + 1
        }
        setRereadCounts(counts)
      })
    // Re-watch counts per manga
    supabase.from('rewatches').select('manga_id')
      .then(({ data }) => {
        if (!data) return
        const counts: Record<string, number> = {}
        for (const r of data as { manga_id: string }[]) {
          counts[r.manga_id] = (counts[r.manga_id] ?? 0) + 1
        }
        setRewatchCounts(counts)
      })
  }, [])

  // Fetch missing covers — guard against concurrent runs with a ref flag
  const fetchRunning = useRef(false)
  useEffect(() => {
    const missing = manga.filter(m => (!m.cover_url || !m.synopsis) && !fetchedIds.current.has(m.id))
    if (missing.length === 0 || fetchRunning.current) return

    fetchRunning.current = true
    ;(async () => {
      for (const m of missing) {
        fetchedIds.current.add(m.id)
        const info = await fetchMangaInfo(m.title)
        if (info.coverUrl || info.totalChapters || info.synopsis) {
          const updates: Partial<Manga> = {}
          if (info.coverUrl) updates.cover_url = info.coverUrl
          if (info.totalChapters) updates.total_chapters = info.totalChapters
          if (info.synopsis && !m.synopsis) updates.synopsis = info.synopsis
          await supabase.from('manga_list').update(updates).eq('id', m.id)
          setManga(prev => prev.map(x => x.id === m.id ? { ...x, ...updates } : x))
        }
        await new Promise(r => setTimeout(r, 400))
      }
      fetchRunning.current = false
    })()
  }, [manga])

  const commitChapterProgress = async (id: string, delta: number, current: number, attr: DateAttribution) => {
    const next = Math.max(0, current + delta)
    const now = new Date().toISOString()
    const timestamp = attr.precision === 'exact' && attr.date ? new Date(attr.date).toISOString() : now

    const patch: Record<string, unknown> = { current_chapter: next, last_read_at: timestamp }

    setManga(prev => prev.map(x =>
      x.id === id ? { ...x, current_chapter: next, last_read_at: timestamp } : x,
    ))
    setSelectedManga(prev =>
      prev?.id === id ? { ...prev, current_chapter: next, last_read_at: timestamp } : prev,
    )

    const { error } = await supabase.from('manga_list').update(patch).eq('id', id)
    if (error) {
      showToast('Failed To Update Chapter')
      setManga(prev => prev.map(x => x.id === id ? { ...x, current_chapter: current } : x))
      setSelectedManga(prev => prev?.id === id ? { ...prev, current_chapter: current } : prev)
      return
    }
    if (delta > 0) {
      const logRow: Record<string, unknown> = {
        manga_id: id,
        chapters_read: delta,
        media_type: 'manga',
        date_precision: attr.precision,
      }
      if (attr.precision === 'exact') logRow.progress_date = attr.date
      if (attr.precision === 'year_only') logRow.progress_year = attr.year
      await supabase.from('reading_log').insert(logRow)
    }
  }

  const updateChapter = (id: string, delta: number, current: number) => {
    if (delta <= 0) {
      commitChapterProgress(id, delta, current, { precision: 'unknown' })
      return
    }
    if (sessionAttrRef.current) {
      commitChapterProgress(id, delta, current, sessionAttrRef.current)
      return
    }
    const m = manga.find(x => x.id === id)
    setProgressPrompt({ id, delta, current, type: 'chapter', title: m?.title ?? '' })
  }

  const updateStatus = async (id: string, status: MangaStatus) => {
    // Intercept "watching" — ask for episode count first
    if (status === 'watching') {
      const m = manga.find(m => m.id === id)
      setWatchPrompt({ id, epInput: String(m?.episodes_watched ?? 0) })
      return
    }
    const prev_status = manga.find(m => m.id === id)?.status
    const now = new Date().toISOString()
    setManga(prev => prev.map(m => m.id === id ? { ...m, status, last_read_at: now } : m))
    const { error } = await supabase.from('manga_list').update({ status, last_read_at: now }).eq('id', id)
    if (error) {
      showToast('Failed To Update Status')
      if (prev_status) setManga(prev => prev.map(m => m.id === id ? { ...m, status: prev_status } : m))
      return
    }
    // Intercept "completed" — show ceremony modal
    if (status === 'completed' && prev_status !== 'completed') {
      const m = manga.find(m => m.id === id)
      if (m) setCompletionManga({ ...m, status: 'completed' })
    }
  }

  const confirmWatching = async () => {
    if (!watchPrompt) return
    const ep = Math.max(0, parseInt(watchPrompt.epInput, 10) || 0)
    const m = manga.find(m => m.id === watchPrompt.id)
    if (!m) return
    setManga(prev => prev.map(x => x.id === watchPrompt.id
      ? { ...x, status: 'watching', episodes_watched: ep } : x))
    await supabase.from('manga_list')
      .update({ status: 'watching', episodes_watched: ep })
      .eq('id', watchPrompt.id)
    if (ep > 0) await supabase.from('reading_log').insert({ manga_id: watchPrompt.id, chapters_read: 0 })
    showToast(`Now Watching — Ep. ${ep} Logged`)
    setWatchPrompt(null)
  }

  // Debounced notes save — fires 500ms after last keystroke
  const updateNotes = (id: string, notes: string) => {
    setManga(prev => prev.map(m => m.id === id ? { ...m, notes } : m))
    const existing = notesTimers.current.get(id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showToast('Failed To Save Note'); return }
      const { error } = await supabase.from('manga_list').update({ notes }).eq('id', id).eq('user_id', user.id)
      if (error) showToast('Failed To Save Note')
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
      if (!res.ok) { showToast(data.error ?? 'Sync Failed'); return }
      setSyncResults(data)
      showToast(data.updated > 0 ? `Sync Complete — ${data.updated} Updates` : 'Sync Complete — Everything Up To Date')
    } catch {
      showToast('Sync Failed — Check Your Connection')
    } finally {
      setSyncing(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
    triggerDownload(new Blob([csv], { type: 'text/csv' }), `yomu-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // MAL XML format — compatible with MyAnimeList import
  const exportMALXML = () => {
    const statusMap: Record<string, string> = {
      reading: 'Reading', completed: 'Completed', on_hold: 'On-Hold',
      dropped: 'Dropped', plan_to_read: 'Plan To Read', watching: 'Reading',
    }
    const entries = manga.map(m => `  <manga>
    <manga_mangadb_id>${m.mal_id ?? 0}</manga_mangadb_id>
    <manga_title><![CDATA[${m.title}]]></manga_title>
    <manga_volumes>0</manga_volumes>
    <manga_chapters>${m.current_chapter}</manga_chapters>
    <my_id>0</my_id>
    <my_read_volumes>0</my_read_volumes>
    <my_read_chapters>${m.current_chapter}</my_read_chapters>
    <my_start_date>0000-00-00</my_start_date>
    <my_finish_date>${m.status === 'completed' && m.last_read_at ? m.last_read_at.slice(0, 10) : '0000-00-00'}</my_finish_date>
    <my_score>${m.user_rating === 'up' ? 8 : m.user_rating === 'down' ? 4 : 0}</my_score>
    <my_status>${statusMap[m.status] ?? 'Reading'}</my_status>
    <my_reread_value></my_reread_value>
    <my_comments><![CDATA[${m.notes ?? ''}]]></my_comments>
    <update_on_import>1</update_on_import>
  </manga>`).join('\n')

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<myanimelist>
  <myinfo>
    <user_export_type>2</user_export_type>
  </myinfo>
${entries}
</myanimelist>`
    triggerDownload(new Blob([xml], { type: 'application/xml' }), `yomu-mal-${new Date().toISOString().slice(0, 10)}.xml`)
  }

  // AniList JSON format — compatible with AniList import
  const exportAniListJSON = () => {
    const statusMap: Record<string, string> = {
      reading: 'CURRENT', completed: 'COMPLETED', on_hold: 'PAUSED',
      dropped: 'DROPPED', plan_to_read: 'PLANNING', watching: 'CURRENT',
    }
    const lists: Record<string, object[]> = {}
    for (const m of manga) {
      const s = statusMap[m.status] ?? 'CURRENT'
      if (!lists[s]) lists[s] = []
      lists[s].push({
        mediaId: m.mal_id ?? null,
        title: m.title,
        status: s,
        score: m.user_rating === 'up' ? 8 : m.user_rating === 'down' ? 4 : 0,
        progress: m.current_chapter,
        progressVolumes: 0,
        startedAt: null,
        completedAt: m.status === 'completed' && m.last_read_at ? m.last_read_at.slice(0, 10) : null,
        notes: m.notes ?? '',
        genres: m.genres,
      })
    }
    const json = JSON.stringify({ lists, exportedAt: new Date().toISOString(), source: 'YOMU' }, null, 2)
    triggerDownload(new Blob([json], { type: 'application/json' }), `yomu-anilist-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const toggleShare = async () => {
    if (!shareToken) {
      const { data } = await supabase.from('public_shares').insert({}).select('token, enabled').single()
      if (data) { setShareToken(data.token); setShareEnabled(true) }
    } else {
      const next = !shareEnabled
      await supabase.from('public_shares').update({ enabled: next }).eq('token', shareToken)
      setShareEnabled(next)
    }
  }

  const finishEstimate = (m: Manga): string | null => {
    if (!pacePerDay || !m.total_chapters || m.current_chapter >= m.total_chapters) return null
    const days = Math.ceil((m.total_chapters - m.current_chapter) / pacePerDay)
    if (days > 365) return null
    if (days < 1) return 'today'
    if (days < 7) return `~${days}d`
    if (days < 60) return `~${Math.ceil(days / 7)}w`
    return `~${Math.ceil(days / 30)}mo`
  }

  const startSession = (m: Manga) => {
    setActiveSession({
      mangaId: m.id,
      mangaTitle: m.title,
      startChapter: m.current_chapter,
      startTime: Date.now(),
      coverUrl: m.cover_url,
    })
  }

  const endSession = useCallback(async (chaptersRead: number, durationMinutes: number) => {
    if (!activeSession) return
    const now = new Date().toISOString()
    const todayDate = now.slice(0, 10)
    // Update chapter count with today's exact date (session = real-time, date is known)
    if (chaptersRead > 0) {
      const m = manga.find(m => m.id === activeSession.mangaId)
      if (m) await commitChapterProgress(activeSession.mangaId, chaptersRead, m.current_chapter, { precision: 'exact', date: todayDate })
    }
    // Also log duration separately
    await supabase.from('reading_log').insert({
      manga_id: activeSession.mangaId,
      chapters_read: chaptersRead,
      duration_minutes: durationMinutes,
      logged_at: now,
      media_type: 'manga',
      date_precision: 'exact',
      progress_date: todayDate,
    })
    showToast(`Session Logged — ${chaptersRead} Ch In ${durationMinutes} Min`)
    setActiveSession(null)
  }, [activeSession, manga, commitChapterProgress, showToast])

  const dismissNotifications = async () => {
    const ids = notifications.map(n => n.id)
    setNotifications([])
    await supabase.from('chapter_notifications').update({ seen: true }).in('id', ids)
  }

  const commitEpisodeProgress = async (id: string, delta: number, current: number, attr: DateAttribution) => {
    const next = Math.max(0, current + delta)
    const now = new Date().toISOString()
    const timestamp = attr.precision === 'exact' && attr.date ? new Date(attr.date).toISOString() : now

    const patch: Record<string, unknown> = { episodes_watched: next, last_read_at: timestamp }

    setManga(prev => prev.map(x =>
      x.id === id ? { ...x, episodes_watched: next } : x,
    ))
    setSelectedManga(prev =>
      prev?.id === id ? { ...prev, episodes_watched: next } : prev,
    )

    const { error } = await supabase.from('manga_list').update(patch).eq('id', id)
    if (error) {
      showToast('Failed To Update Episodes')
      setManga(prev => prev.map(x => x.id === id ? { ...x, episodes_watched: current } : x))
      setSelectedManga(prev => prev?.id === id ? { ...prev, episodes_watched: current } : prev)
      return
    }
    if (delta > 0) {
      const logRow: Record<string, unknown> = {
        manga_id: id,
        chapters_read: 0,
        media_type: 'anime',
        date_precision: attr.precision,
      }
      if (attr.precision === 'exact') logRow.progress_date = attr.date
      if (attr.precision === 'year_only') logRow.progress_year = attr.year
      await supabase.from('reading_log').insert(logRow)
    }
  }

  const updateEpisodes = (id: string, delta: number, current: number) => {
    if (delta <= 0) {
      commitEpisodeProgress(id, delta, current, { precision: 'unknown' })
      return
    }
    if (sessionAttrRef.current) {
      commitEpisodeProgress(id, delta, current, sessionAttrRef.current)
      return
    }
    const m = manga.find(x => x.id === id)
    setProgressPrompt({ id, delta, current, type: 'episode', title: m?.title ?? '' })
  }

  // Community totals — write to manga_list + community_totals table
  const updateTotalChapters = async (id: string, n: number, malId?: number | null, contentType?: string | null) => {
    await supabase.from('manga_list').update({ total_chapters: n }).eq('id', id)
    setManga(prev => prev.map(x => x.id === id ? { ...x, total_chapters: n } : x))
    if (malId) {
      await fetch('/api/community-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: malId, content_type: contentType ?? 'manga', total_chapters: n }),
      })
      showToast('Total chapters shared with community ✓')
    }
  }

  const updateTotalEpisodes = async (id: string, n: number, malId?: number | null, contentType?: string | null) => {
    await supabase.from('manga_list').update({ total_episodes: n }).eq('id', id)
    setManga(prev => prev.map(x => x.id === id ? { ...x, total_episodes: n } : x))
    if (malId) {
      await fetch('/api/community-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: malId, content_type: contentType ?? 'anime', total_episodes: n }),
      })
      showToast('Total episodes shared with community ✓')
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
      showToast('Failed To Delete')
      if (removed) setManga(prev => [...prev, removed].sort((a, b) => a.title.localeCompare(b.title)))
    }
  }

  const resetAddDetails = () => {
    setAddShowDetails(false)
    setAddDetailStatus(null)
    setAddDetailProgress('')
    setAddDetailDate('')
    setAddDetailNotes('')
    setAddDetailRating(null)
  }

  const addManga = async () => {
    if (!selectedJikan && !newTitle.trim()) return
    setAdding(true)
    try {
      const isAnime = addContentType === 'anime'
      const isMovie = addContentType === 'movie'
      let insertPayload: Record<string, unknown>
      if (selectedJikan) {
        if (isMovie) {
          insertPayload = {
            mal_id: selectedJikan.mal_id,
            title: selectedJikan.title,
            current_chapter: 0,
            episodes_watched: 0,
            status: 'unwatched',
            content_type: 'movie',
            cover_url: selectedJikan.cover_url ?? null,
            total_chapters: null,
            total_episodes: null,
            authors: selectedJikan.authors ?? [],
            genres: selectedJikan.genres ?? [],
            has_anime: false,
            synopsis: selectedJikan.synopsis ?? null,
            score: selectedJikan.score ?? null,
          }
        } else if (isAnime) {
          // Adding anime directly — store as anime content type
          insertPayload = {
            mal_id: null,
            anime_mal_id: selectedJikan.mal_id,
            title: selectedJikan.title,
            current_chapter: 0,
            episodes_watched: 0,
            status: 'watching',
            content_type: 'anime',
            cover_url: selectedJikan.cover_url ?? null,
            total_chapters: null,
            total_episodes: (selectedJikan as JikanSearchResult & { episodes?: number | null }).episodes ?? null,
            authors: selectedJikan.authors ?? [],
            genres: selectedJikan.genres ?? [],
            has_anime: true,
            anime_title: selectedJikan.title,
          }
        } else {
          // Adding manga — fetch anime adaptations too
          const adaptations = selectedJikan.mal_id ? await getAnimeAdaptations(selectedJikan.mal_id) : []
          const anim = adaptations[0]
          insertPayload = {
            mal_id: selectedJikan.mal_id,
            title: selectedJikan.title,
            current_chapter: 0,
            status: 'reading',
            content_type: (selectedJikan as JikanSearchResult & { media_type?: string }).media_type === 'anime' ? 'anime' : 'manga',
            cover_url: selectedJikan.cover_url ?? null,
            total_chapters: selectedJikan.total_chapters ?? null,
            authors: selectedJikan.authors ?? [],
            genres: selectedJikan.genres ?? [],
            has_anime: !!anim,
            anime_mal_id: anim?.mal_id ?? null,
            anime_title: anim?.title ?? null,
            total_episodes: anim?.episodes ?? null,
          }
        }
      } else {
        insertPayload = {
          title: newTitle.trim(),
          current_chapter: 0,
          status: isMovie ? 'unwatched' : isAnime ? 'watching' : 'reading',
          content_type: isMovie ? 'movie' : isAnime ? 'anime' : 'manga',
          ...(isAnime ? { episodes_watched: 0, has_anime: true } : {}),
          ...(isMovie ? { has_anime: false } : {}),
        }
      }
      // Apply quick-detail overrides from the expanded details panel
      if (addDetailStatus) insertPayload.status = addDetailStatus
      const progressNum = parseInt(addDetailProgress, 10)
      if (!isNaN(progressNum) && progressNum > 0) {
        if (isAnime || isMovie) insertPayload.episodes_watched = progressNum
        else insertPayload.current_chapter = progressNum
      }
      if (addDetailNotes.trim()) insertPayload.notes = addDetailNotes.trim()
      if (addDetailRating) insertPayload.user_rating = addDetailRating
      if (addDetailDate) insertPayload.last_read_at = new Date(addDetailDate).toISOString()

      const { data, error } = await supabase
        .from('manga_list')
        .insert(insertPayload)
        .select()
        .single()
      if (error?.code === '23505') { showToast(`"${insertPayload.title}" Is Already In Your List`); setAdding(false); return }
      if (error) { showToast('Failed To Add'); return }
      if (data) {
        const newEntry = data as Manga
        setManga(prev => [...prev, newEntry])
        setNewTitle('')
        setSelectedJikan(null)
        setShowAdd(false)
        setAddSuggestions([])
        setShowAddSuggestions(false)
        resetAddDetails()
        // Check community totals to fill in missing totals (runs async after add)
        const malIdForCommunity = newEntry.mal_id ?? newEntry.anime_mal_id
        if (malIdForCommunity) {
          const ct = newEntry.content_type === 'anime' ? 'anime' : 'manga'
          fetch(`/api/community-totals?mal_id=${malIdForCommunity}&content_type=${ct}`)
            .then(r => r.json())
            .then(async (communityData: { total_chapters?: number | null; total_episodes?: number | null } | null) => {
              if (!communityData) return
              const updates: Partial<Manga> = {}
              if (communityData.total_chapters && !newEntry.total_chapters) updates.total_chapters = communityData.total_chapters
              if (communityData.total_episodes && !newEntry.total_episodes) updates.total_episodes = communityData.total_episodes
              if (Object.keys(updates).length > 0) {
                await supabase.from('manga_list').update(updates).eq('id', newEntry.id)
                setManga(prev => prev.map(x => x.id === newEntry.id ? { ...x, ...updates } : x))
              }
            }).catch(() => {})
        }
        if (!selectedJikan && !isAnime) {
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
      }
    } finally {
      setAdding(false)
    }
  }

  const getRecommendations = async () => {
    setLoadingRec(true)
    setRecommendations([])
    setRecError('')
    setShowRecModal(true)   // open modal immediately so user sees "Asking Claude…"
    try {
      // Include genres + ratings so the algorithm can match and weight preferences
      const payload = manga.map(m => ({
        title: m.title,
        current_chapter: m.current_chapter,
        status: m.status,
        genres: m.genres ?? [],
        mal_id: m.mal_id,
        user_rating: m.user_rating ?? null,
      }))

      // Anime ratings from localStorage
      // Build anime ratings map from Supabase data (user_rating overrides netflix_rating)
      const animeRatings: Record<string, 'up' | 'down'> = {}
      for (const a of animeList) {
        const r = a.user_rating ?? a.netflix_rating
        if (r) animeRatings[a.title] = r
      }

      // Send both right-swipes (liked) and left-swipes (disliked) from Discover history
      const [{ data: swipeData }, { data: dislikeData }] = await Promise.all([
        supabase.from('swipe_history').select('genres').eq('direction', 'right').limit(200),
        supabase.from('swipe_history').select('genres').eq('direction', 'left').limit(200),
      ])
      const likedGenres    = [...new Set((swipeData   ?? []).flatMap(s => s.genres))]
      const dislikedGenres = [...new Set((dislikeData ?? []).flatMap(s => s.genres))]
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manga: payload, likedGenres, dislikedGenres, animeRatings, watchedAnimeTitles: animeList.map(a => a.title) }),
      })
      const data = await res.json()
      if (!res.ok) { setRecError(data.error ?? 'Something went wrong'); return }
      const recs = data.recommendations ?? []
      if (recs.length === 0) {
        setRecError("Couldn't generate recommendations — please try again")
      } else {
        setRecommendations(recs)
      }
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

  const toggleSynopsis = (id: string) =>
    setExpandedSynopsis(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const refreshCardInfo = async (m: Manga) => {
    setRefreshingId(m.id)
    try {
      const info = await fetchMangaInfo(m.title)
      const updates: Partial<Manga> = {}
      if (info.coverUrl) updates.cover_url = info.coverUrl
      if (info.totalChapters) updates.total_chapters = info.totalChapters
      if (info.synopsis) updates.synopsis = info.synopsis
      if (Object.keys(updates).length > 0) {
        await supabase.from('manga_list').update(updates).eq('id', m.id)
        setManga(prev => prev.map(x => x.id === m.id ? { ...x, ...updates } : x))
        showToast('Info Updated')
      } else {
        showToast('No New Info Found')
      }
    } catch {
      showToast('Failed To Fetch Info')
    } finally {
      setRefreshingId(null)
    }
  }

  // Duplicate detection across all manga
  const duplicatePairs = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const tokens = (s: string) => new Set(normalize(s).split(/\s+/).filter(Boolean))
    const synTokens = (s: string | null) => s ? new Set(normalize(s).split(/\s+/).filter(Boolean)) : null
    const jaccard = (a: Set<string>, b: Set<string>) => {
      const overlap = [...a].filter(t => b.has(t)).length
      return overlap / (a.size + b.size - overlap)
    }
    const pairs: { a: Manga; b: Manga; score: number; reason: string }[] = []
    const seen = new Set<string>()
    for (let i = 0; i < manga.length; i++) {
      for (let j = i + 1; j < manga.length; j++) {
        const a = manga[i], b = manga[j]
        const key = [a.id, b.id].sort().join('|')
        if (seen.has(key) || dismissedPairs.has(key)) continue
        // Skip pairs already grouped in the same series
        if (a.series_id && a.series_id === b.series_id) continue
        const titleScore = jaccard(tokens(a.title), tokens(b.title))
        const aS = synTokens(a.synopsis), bS = synTokens(b.synopsis)
        const synScore = (aS && bS && aS.size > 10 && bS.size > 10) ? jaccard(aS, bS) : 0
        const best = Math.max(titleScore, synScore * 0.8)
        if (best >= 0.55) {
          seen.add(key)
          pairs.push({
            a, b, score: best,
            reason: titleScore >= synScore * 0.8 ? 'Similar title' : 'Similar synopsis',
          })
        }
      }
    }
    return pairs.sort((x, y) => y.score - x.score)
  }, [manga, dismissedPairs])

  const dismissPair = (a: Manga, b: Manga) => {
    const key = [a.id, b.id].sort().join('|')
    setDismissedPairs(prev => {
      const next = new Set(prev)
      next.add(key)
      const arr = [...next]
      try { localStorage.setItem('yomu_dismissed_pairs', JSON.stringify(arr)) } catch {}
      // Persist cross-device via Supabase user metadata
      supabase.auth.updateUser({ data: { dismissed_pairs: arr } }).catch(() => {})
      return next
    })
  }

  // Status rank: higher = more progress made
  const STATUS_RANK: Record<string, number> = {
    completed: 6, reading: 4, watching: 4, on_hold: 3, dropped: 2, plan_to_read: 1, unwatched: 1,
  }

  /** Pick the entry with the best overall progress to keep as the primary card. */
  const pickKeeper = (entries: Manga[]): Manga => {
    return entries.reduce((best, m) => {
      const bScore = (STATUS_RANK[best.status] ?? 0) * 1000
        + (best.current_chapter ?? 0) + (best.episodes_watched ?? 0)
      const mScore = (STATUS_RANK[m.status] ?? 0) * 1000
        + (m.current_chapter ?? 0) + (m.episodes_watched ?? 0)
      return mScore > bScore ? m : best
    })
  }

  /** Merge any number of entries into `keep`. Best-of-all logic across every field. */
  const mergeMultiple = async (keep: Manga, toRemove: Manga[]) => {
    const all = [keep, ...toRemove]

    // ── Progress fields (take max) ─────────────────────────────────────────
    const bestChapter    = Math.max(...all.map(m => m.current_chapter ?? 0))
    const bestEpisodes   = Math.max(...all.map(m => m.episodes_watched ?? 0))
    const bestWatchTime  = all.reduce((s, m) => s + (m.total_watch_time_minutes ?? 0), 0)

    // ── Status (most advanced) ─────────────────────────────────────────────
    const bestStatus = all.reduce((best, m) =>
      (STATUS_RANK[m.status] ?? 0) > (STATUS_RANK[best.status] ?? 0) ? m : best
    ).status

    // ── Timestamps (most recent) ───────────────────────────────────────────
    const lastReadDates = all.map(m => m.last_read_at).filter(Boolean) as string[]
    const bestLastRead  = lastReadDates.length
      ? lastReadDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : keep.last_read_at

    // ── Scalar fields (first non-null wins, prefer keeper) ─────────────────
    const firstOf = <T,>(field: keyof Manga): T | null =>
      (all.map(m => m[field]).find(v => v != null) ?? null) as T | null

    const bestTotal       = firstOf<number>('total_chapters')
    const bestTotalEp     = firstOf<number>('total_episodes')
    const bestSynopsis    = firstOf<string>('synopsis')
    const bestCover       = firstOf<string>('cover_url')
    const bestMalId       = firstOf<number>('mal_id')
    const bestAnimeMal    = firstOf<number>('anime_mal_id')
    const bestAnimeTitle  = firstOf<string>('anime_title')
    const bestRating      = firstOf<'up'|'down'>('user_rating')
    const bestScore       = firstOf<number>('score')
    const bestContentType = firstOf<Manga['content_type']>('content_type')
    const bestPubStatus   = firstOf<Manga['publishing_status']>('publishing_status')
    const bestSeriesId    = firstOf<string>('series_id')
    const bestSeriesPrim  = all.some(m => m.series_primary)
    const bestReviewMd    = firstOf<string>('review_md')
    const bestPublicRev   = firstOf<boolean>('is_public_review')

    // ── Array fields (union) ───────────────────────────────────────────────
    const genreSet  = new Set(all.flatMap(m => m.genres ?? []))
    const authorSet = new Set(all.flatMap(m => (m.authors ?? []).map((a: { name: string }) => JSON.stringify(a))))
    const bestGenres  = [...genreSet]
    const bestAuthors = [...authorSet].map(s => JSON.parse(s))

    // ── Booleans (OR) ─────────────────────────────────────────────────────
    const bestHasAnime   = all.some(m => m.has_anime)
    const bestAutoTracked = all.some(m => m.auto_tracked)

    // ── Notes (concat unique) ──────────────────────────────────────────────
    const notesParts: string[] = []
    for (const m of all) {
      if (m.notes?.trim() && !notesParts.some(p => p.includes(m.notes!.trim()))) {
        notesParts.push(m.notes.trim())
      }
    }
    const bestNotes = notesParts.join('\n---\n') || null

    const updates = {
      current_chapter:         bestChapter,
      episodes_watched:        bestEpisodes,
      total_watch_time_minutes: bestWatchTime,
      status:                  bestStatus,
      last_read_at:            bestLastRead,
      total_chapters:          bestTotal,
      total_episodes:          bestTotalEp,
      synopsis:                bestSynopsis,
      cover_url:               bestCover,
      mal_id:                  bestMalId,
      anime_mal_id:            bestAnimeMal,
      anime_title:             bestAnimeTitle,
      user_rating:             bestRating,
      score:                   bestScore,
      content_type:            bestContentType,
      publishing_status:       bestPubStatus,
      series_id:               bestSeriesId,
      series_primary:          bestSeriesPrim,
      review_md:               bestReviewMd,
      is_public_review:        bestPublicRev,
      has_anime:               bestHasAnime,
      auto_tracked:            bestAutoTracked,
      genres:                  bestGenres,
      authors:                 bestAuthors,
      notes:                   bestNotes,
    }

    const removeIds = toRemove.map(r => r.id)

    // 1. Update the kept entry with merged data
    const { error: updateErr } = await supabase.from('manga_list').update(updates).eq('id', keep.id)
    if (updateErr) { showToast('Merge failed — could not update entry'); return }

    // 2. Atomically reassign watch_sessions + delete duplicates via RPC
    // (single DB transaction — prevents orphaned records if the connection drops)
    const { error: mergeErr } = await supabase.rpc('merge_entries', {
      keep_id:  keep.id,
      drop_ids: removeIds,
    })
    if (mergeErr) { showToast('Merge failed — could not remove duplicates'); return }

    setManga(prev =>
      prev
        .filter(m => !removeIds.includes(m.id))
        .map(m => m.id === keep.id ? { ...m, ...updates } : m)
    )
    showToast(toRemove.length === 1
      ? 'Merged — All Data Integrated'
      : `Merged ${toRemove.length + 1} Entries — All Data Integrated`)
  }

  /** Auto-pick the best keeper and merge the rest into it. */
  const mergePair = (a: Manga, b: Manga) => {
    const keep = pickKeeper([a, b])
    const remove = keep.id === a.id ? b : a
    return mergeMultiple(keep, [remove])
  }

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

  const currentArc = (m: Manga): Arc | null => {
    const arcs = arcsMap[m.id] ?? []
    return arcs.find(a => m.current_chapter >= a.chapter_start && m.current_chapter <= a.chapter_end) ?? null
  }

  const MOODS: { id: string; label: string; icon: React.ReactNode; test: (m: Manga) => boolean }[] = [
    { id: 'quick',     label: 'Quick',     icon: <Zap    size={11} strokeWidth={1.5} />, test: m => !!m.total_chapters && m.total_chapters <= 100 },
    { id: 'epic',      label: 'Epic',      icon: <Sword  size={11} strokeWidth={1.5} />, test: m => !!m.total_chapters && m.total_chapters >= 300 },
    { id: 'light',     label: 'Light',     icon: <Cloud  size={11} strokeWidth={1.5} />, test: m => m.genres.some(g => ['Comedy','Slice of Life'].includes(g)) },
    { id: 'dark',      label: 'Dark',      icon: <Moon   size={11} strokeWidth={1.5} />, test: m => m.genres.some(g => ['Horror','Psychological','Thriller'].includes(g)) },
    { id: 'action',    label: 'Action',    icon: <Flame  size={11} strokeWidth={1.5} />, test: m => m.genres.some(g => ['Action','Martial Arts'].includes(g)) },
    { id: 'heartfelt', label: 'Heartfelt', icon: <Heart  size={11} strokeWidth={1.5} />, test: m => m.genres.some(g => ['Romance','Drama'].includes(g)) },
  ]

  // Series grouping: map series_id → all members
  const seriesMap = useMemo(() => {
    const map = new Map<string, Manga[]>()
    for (const m of manga) {
      if (m.series_id) {
        if (!map.has(m.series_id)) map.set(m.series_id, [])
        map.get(m.series_id)!.push(m)
      }
    }
    return map
  }, [manga])

  // An entry "belongs" to the anime tab if its content_type is anime/movie OR it has an anime adaptation.
  // This lets manga entries with has_anime=true show up in both their primary type tab AND the anime tab.
  const matchesTypeFilter = (m: Manga) => {
    if (typeFilter === 'all') return true
    const ct = m.content_type ?? 'manga'
    if (typeFilter === 'anime') return ct === 'anime' || ct === 'movie' || !!m.has_anime
    return ct === typeFilter
  }

  const filtered = useMemo(() => manga
    .filter(m => !m.series_id || !!m.series_primary) // hide non-primary grouped entries
    .filter(m => filter === 'all' || filter === 'duplicates' || m.status === filter)
    .filter(matchesTypeFilter)
    .filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))
    .filter(m => !mood || MOODS.find(mo => mo.id === mood)?.test(m))
    .sort(sortFn),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [manga, filter, typeFilter, search, mood, sortFn])

  // Count per type for badge labels.
  // Anime tab count includes entries where has_anime=true so it reflects what the tab will show.
  const typeCounts = useMemo(() => {
    const acc: Record<string, number> = {}
    manga.forEach(m => {
      const t = m.content_type ?? 'manga'
      acc[t] = (acc[t] ?? 0) + 1
      // also count has_anime entries toward the anime tab (unless they already are anime)
      if (m.has_anime && t !== 'anime' && t !== 'movie') {
        acc['anime'] = (acc['anime'] ?? 0) + 1
      }
    })
    return acc
  }, [manga])

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-[1800px] mx-auto px-6 py-6 md:py-10">

        {/* Header — responsive */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Manga Tracker</h1>
            <p className="text-zinc-500 text-xs md:text-sm mt-0.5">{manga.length} Titles</p>
          </div>

          {/* Desktop actions (all visible) */}
          <div className="hidden md:flex gap-2">
            <button onClick={getRecommendations} disabled={manga.length === 0 || loadingRec} aria-label="Get AI recommendations"
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
            <button onClick={() => setShowHealthCheck(true)} aria-label="Check card health"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
              🩺 Check Cards
            </button>
            {deepSelectMode ? (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (deepSelected.size === 0) return
                    const first = manga.find(m => deepSelected.has(m.id))
                    if (first) setDeepSearchTarget(first)
                  }}
                  disabled={deepSelected.size === 0}
                  className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors"
                >
                  🔍 Search {deepSelected.size > 0 ? `${deepSelected.size} Card${deepSelected.size > 1 ? 's' : ''}` : '…'}
                </button>
                <button
                  onClick={() => { setDeepSelectMode(false); setDeepSelected(new Set()) }}
                  className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setDeepSelectMode(true)} aria-label="Deep search cards"
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
                🔍 Deep Search
              </button>
            )}
            <div className="relative group">
              <button aria-label="Export list"
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
                ↓ Export
              </button>
              <div className="absolute right-0 top-10 z-20 hidden group-hover:flex flex-col bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl w-36">
                <button onClick={exportCSV} className="px-4 py-2.5 text-xs text-left text-zinc-200 hover:bg-zinc-700">CSV</button>
                <button onClick={exportMALXML} className="px-4 py-2.5 text-xs text-left text-zinc-200 hover:bg-zinc-700 border-t border-zinc-700/50">MAL XML</button>
                <button onClick={exportAniListJSON} className="px-4 py-2.5 text-xs text-left text-zinc-200 hover:bg-zinc-700 border-t border-zinc-700/50">AniList JSON</button>
              </div>
            </div>
            <NotificationBell />
            <button onClick={() => setShareModal(true)} aria-label="Share my list"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
              🔗 Share
            </button>
            <button onClick={() => setShowTakeoutImport(true)} aria-label="Takeout import"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
              📦 Import
            </button>
            <button onClick={signOut} aria-label="Sign out"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
              Sign Out
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
              onExportCSV={exportCSV}
              onExportMAL={exportMALXML}
              onExportAniList={exportAniListJSON}
              onShare={() => setShareModal(true)}
              onCheckCards={() => setShowHealthCheck(true)}
              onTakeoutImport={() => setShowTakeoutImport(true)}
              loadingRec={loadingRec}
              syncing={syncing}
            />
          </div>
        </div>

        {/* Stats — 2 cols on mobile, responsive on desktop (hide watching if 0) */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-2">
          {(Object.keys(STATUS_LABELS) as MangaStatus[]).filter(s => (s !== 'watching' && s !== 'unwatched') || (counts[s] ?? 0) > 0).map(s => (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`rounded-xl p-3 text-center transition-colors ${filter === s ? 'bg-white text-black' : 'bg-zinc-900 hover:bg-zinc-800'}`}>
              <div className="text-xl font-bold">{counts[s] ?? 0}</div>
              <div className={`text-xs mt-0.5 ${filter === s ? 'text-zinc-600' : 'text-zinc-500'}`}>{STATUS_LABELS[s]}</div>
            </button>
          ))}
        </div>

        {/* Anime stats row */}
        {(() => {
          const trackedMinutes = manga.reduce((s, m) => s + (m.total_watch_time_minutes || 0), 0)
          const totalHours  = animeList.reduce((s, e) => s + e.total_watch_hours, 0) + trackedMinutes / 60
          const totalSeries = animeList.filter(e => !e.is_movie).length
          const totalMovies = animeList.filter(e =>  e.is_movie).length
          const activeCount = animeList.filter(e => getAnimeStatus(e) === 'active').length
          const stats = [
            { value: totalSeries,                 label: 'Anime series',  icon: <Tv          size={16} strokeWidth={1.5} className="icon-primary"   /> },
            { value: `${totalHours.toFixed(0)}h`, label: 'Hours watched', icon: <Timer       size={16} strokeWidth={1.5} className="icon-secondary" /> },
            { value: activeCount,                 label: 'Active',        icon: <Play        size={16} strokeWidth={1.5} className="icon-primary"   /> },
            { value: totalMovies,                 label: 'Movies',        icon: <Clapperboard size={16} strokeWidth={1.5} className="icon-muted"    /> },
          ] as { value: string | number; label: string; icon: React.ReactNode }[]
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
              {stats.map(s => (
                <div key={s.label} className="bg-zinc-900 rounded-xl p-3 flex items-center gap-3">
                  <span className="shrink-0">{s.icon}</span>
                  <div>
                    <div className="text-lg font-bold leading-tight" style={{ color: 'var(--cyan)' }}>{s.value}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

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

        {/* Add form with live autocomplete */}
        {showAdd && (
          <div className="mb-5 flex flex-col gap-2" ref={addBarRef}>
            {/* Manga / Anime toggle */}
            <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
              {(['manga', 'anime', 'movie'] as const).map(ct => (
                <button
                  key={ct}
                  onClick={() => { setAddContentType(ct); setSelectedJikan(null); setNewTitle(''); setAddSuggestions([]); resetAddDetails() }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${addContentType === ct ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {ct === 'manga' ? '📚 Manga / Manhwa' : ct === 'anime' ? '🎌 Anime' : '🎬 Movie'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
            <div className="relative flex-1">
              {selectedJikan ? (
                /* Confirmed selection chip */
                <div className="flex items-center gap-3 bg-zinc-900 border border-emerald-600/50 rounded-xl px-4 py-3">
                  {selectedJikan.cover_url && (
                    <img src={selectedJikan.cover_url} alt="" className="w-6 h-9 object-cover rounded shrink-0" />
                  )}
                  <span className="text-sm text-zinc-200 flex-1 truncate">{selectedJikan.title}</span>
                  <button onClick={() => { setSelectedJikan(null); setNewTitle(''); resetAddDetails() }}
                    className="text-zinc-500 hover:text-white text-lg shrink-0">×</button>
                </div>
              ) : (
                <>
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => {
                      const v = e.target.value
                      setNewTitle(v)
                      setSelectedJikan(null)
                      setShowAddSuggestions(true)
                      if (addSuggestTimer.current) clearTimeout(addSuggestTimer.current)
                      if (!v.trim() || v.length < 2) { setAddSuggestions([]); setShowAddSuggestions(false); return }
                      addSuggestTimer.current = setTimeout(async () => {
                        setAddSuggestLoading(true)
                        let results: JikanSearchResult[] = []
                        if (addContentType === 'anime' || addContentType === 'movie') {
                          const r = await searchAnimeWithFiltersTyped({ query: v.trim(), orderBy: 'score', sort: 'desc' })
                          results = r.ok ? r.results.filter(x => addContentType === 'movie' ? (x as JikanSearchResult & { media_type?: string }).media_type === 'movie' : (x as JikanSearchResult & { media_type?: string }).media_type !== 'movie') : []
                        } else {
                          results = await searchMangaWithFilters({ query: v.trim(), orderBy: 'score', sort: 'desc' })
                        }
                        setAddSuggestions(results.slice(0, 8))
                        setShowAddSuggestions(true)
                        setAddSuggestLoading(false)
                      }, 350)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setShowAddSuggestions(false); addManga() }
                      if (e.key === 'Escape') { setShowAdd(false); setNewTitle(''); setAddSuggestions([]); setSelectedJikan(null); resetAddDetails() }
                    }}
                    placeholder={addContentType === 'anime' ? 'Search for an anime title…' : addContentType === 'movie' ? 'Search for a movie title…' : 'Search for a manga / manhwa title…'}
                    aria-label={addContentType === 'anime' ? 'New anime title' : addContentType === 'movie' ? 'New movie title' : 'New manga title'}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                  />
                  {/* Dropdown */}
                  {showAddSuggestions && newTitle.length >= 2 && (
                    <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl">
                      {addSuggestLoading && (
                        <div className="px-4 py-3 text-xs text-zinc-500">Searching…</div>
                      )}
                      {!addSuggestLoading && addSuggestions.length === 0 && (
                        <div className="px-4 py-3 text-xs text-zinc-500">No matches — try a different spelling</div>
                      )}
                      {!addSuggestLoading && addSuggestions.map(s => (
                        <button
                          key={s.mal_id}
                          onMouseDown={e => { e.preventDefault(); setSelectedJikan(s); setNewTitle(s.title); setShowAddSuggestions(false) }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left border-b border-zinc-800 last:border-0"
                        >
                          {s.cover_url && (
                            <img src={s.cover_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-zinc-200 truncate">{s.title}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              {s.authors.length > 0 ? `by ${s.authors[0].name}` : ''}
                              {s.score ? ` · ★ ${s.score}` : ''}
                              {s.total_chapters ? ` · ${s.total_chapters} ch` : ''}
                            </p>
                          </div>
                          <span className="text-[10px] text-zinc-600 shrink-0">Select →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <button onClick={addManga} disabled={adding || (!selectedJikan && !newTitle.trim())}
              className="px-5 py-3 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-40 shrink-0">
              {adding ? '…' : 'Add'}
            </button>
            </div>

            {/* ── Quick Details (shown once a title is confirmed) ── */}
            {(selectedJikan || newTitle.trim()) && (
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setAddShowDetails(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-colors"
                >
                  <span className="font-medium">{addShowDetails ? '▲ Hide details' : '▼ Add details (status, progress, date, notes…)'}</span>
                  {/* Show a summary of filled fields when collapsed */}
                  {!addShowDetails && (addDetailStatus || addDetailProgress || addDetailDate || addDetailNotes || addDetailRating) && (
                    <span className="text-zinc-600 text-[10px] gap-1.5 flex items-center">
                      {addDetailStatus && <span className="bg-zinc-800 rounded px-1.5 py-0.5">{addDetailStatus.replace('_', ' ')}</span>}
                      {addDetailProgress && <span className="bg-zinc-800 rounded px-1.5 py-0.5">{addContentType === 'manga' ? `Ch.${addDetailProgress}` : `Ep.${addDetailProgress}`}</span>}
                      {addDetailDate && <span className="bg-zinc-800 rounded px-1.5 py-0.5">{addDetailDate}</span>}
                      {addDetailRating && <span>{addDetailRating === 'up' ? '👍' : '👎'}</span>}
                    </span>
                  )}
                </button>

                {addShowDetails && (
                  <div className="px-4 pb-4 pt-1 flex flex-col gap-4 bg-zinc-900/40">
                    {/* Status */}
                    <div>
                      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">Status</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(addContentType === 'manga'
                          ? (['reading', 'completed', 'plan_to_read', 'on_hold', 'dropped'] as MangaStatus[])
                          : addContentType === 'anime'
                          ? (['watching', 'completed', 'plan_to_read', 'on_hold', 'dropped'] as MangaStatus[])
                          : (['unwatched', 'watching', 'completed'] as MangaStatus[])
                        ).map(s => (
                          <button
                            key={s}
                            onClick={() => setAddDetailStatus(prev => prev === s ? null : s)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                              addDetailStatus === s
                                ? 'bg-white text-black'
                                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {s.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress + Date row */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">
                          {addContentType === 'manga' ? 'Current Chapter' : 'Episodes Watched'}
                        </p>
                        <input
                          type="number"
                          min={0}
                          value={addDetailProgress}
                          onChange={e => setAddDetailProgress(e.target.value)}
                          placeholder="0"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 text-zinc-200 placeholder:text-zinc-600"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">
                          {addContentType === 'manga' ? 'Date Read' : 'Date Watched'}
                        </p>
                        <input
                          type="date"
                          value={addDetailDate}
                          onChange={e => setAddDetailDate(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 text-zinc-200 [color-scheme:dark]"
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">Notes</p>
                      <textarea
                        value={addDetailNotes}
                        onChange={e => setAddDetailNotes(e.target.value)}
                        placeholder="Your thoughts, where you left off, reminders…"
                        rows={2}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 text-zinc-200 placeholder:text-zinc-600 resize-none"
                      />
                    </div>

                    {/* Rating */}
                    <div>
                      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">Rating</p>
                      <div className="flex gap-2">
                        {(['up', 'down'] as const).map(r => (
                          <button
                            key={r}
                            onClick={() => setAddDetailRating(prev => prev === r ? null : r)}
                            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                              addDetailRating === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {r === 'up' ? '👍 Liked' : '👎 Didn\'t like'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Continue strip ── */}
        {(() => {
          const CONTINUE_KEY = 'yomu_last_read'
          // Derive the last-touched reading/watching entry from loaded data
          const lastRead = manga
            .filter(m => (m.status === 'reading' || m.status === 'watching') && m.last_read_at)
            .sort((a, b) => new Date(b.last_read_at!).getTime() - new Date(a.last_read_at!).getTime())[0]

          if (!lastRead) return null

          // Persist for instant next-load
          try { localStorage.setItem(CONTINUE_KEY, JSON.stringify({ id: lastRead.id, title: lastRead.title, chapter: lastRead.current_chapter, cover: lastRead.cover_url })) } catch {}

          const isWatching = lastRead.status === 'watching'
          const site = lastRead.last_watched_site

          // Site name display helpers
          const SITE_DISPLAY: Record<string, string> = {
            'netflix.com': 'Netflix', 'netflix': 'Netflix',
            'crunchyroll.com': 'Crunchyroll', 'crunchyroll': 'Crunchyroll',
            'funimation.com': 'Funimation', 'funimation': 'Funimation',
            'hidive.com': 'HiDive', 'hidive': 'HiDive',
            'disneyplus.com': 'Disney+', 'disney+': 'Disney+',
            'max.com': 'Max', 'hbomax.com': 'Max', 'max': 'Max',
            'hulu.com': 'Hulu', 'hulu': 'Hulu',
            'vrv.co': 'VRV', 'vrv': 'VRV',
            'bilibili.tv': 'Bilibili', 'bilibili': 'Bilibili',
            'tubi.tv': 'Tubi', 'tubi': 'Tubi',
            'appletv.apple.com': 'Apple TV+', 'apple tv+': 'Apple TV+',
          }
          const SITE_COLORS: Record<string, string> = {
            'Netflix': '#e50914',
            'Crunchyroll': '#ff6400',
            'Disney+': '#113ccf',
            'Max': '#002be0',
            'Hulu': '#3dba00',
            'HiDive': '#00b4d8',
            'VRV': '#f5c400',
            'Funimation': '#410099',
            'Bilibili': '#00aeec',
            'Tubi': '#fa4616',
            'Apple TV+': '#555',
          }
          const siteKey = site?.toLowerCase() ?? ''
          const siteName = SITE_DISPLAY[siteKey] ?? (site ? site.replace(/\.com$/, '') : null)
          const siteColor = siteName ? (SITE_COLORS[siteName] ?? '#555') : null

          const mdexUrl = !isWatching && lastRead.mal_id
            ? `https://mangadex.org/search?q=${encodeURIComponent(lastRead.title)}`
            : null

          return (
            <div className="mb-4 flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors">
              {lastRead.cover_url && (
                <img src={lastRead.cover_url} alt="" className="w-8 h-11 object-cover rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{isWatching ? 'Continue Watching' : 'Continue Reading'}</p>
                  {isWatching && siteName && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: siteColor + '25', color: siteColor!, border: `1px solid ${siteColor}55` }}>
                      {siteName}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-zinc-100 truncate">{lastRead.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isWatching
                    ? `Episode ${lastRead.episodes_watched}${lastRead.total_episodes ? ` of ${lastRead.total_episodes}` : ''}`
                    : `Chapter ${lastRead.current_chapter}${lastRead.total_chapters ? ` of ${lastRead.total_chapters}` : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {mdexUrl && (
                  <a href={mdexUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--vermillion)', color: '#fff' }}>
                    <Play size={11} strokeWidth={2} /> Read
                  </a>
                )}
                <button onClick={() => setSelectedManga(lastRead)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
                  Details
                </button>
              </div>
            </div>
          )
        })()}

        {/* Release calendar — anime airing this week + currently-releasing manga */}
        <ReleaseCalendar
          animeMalIds={manga.filter(m => m.anime_mal_id).map(m => m.anime_mal_id!)}
          watchingMalIds={manga.filter(m => m.anime_mal_id && m.status === 'watching').map(m => m.anime_mal_id!)}
          libraryMalIdSet={new Set(manga.filter(m => m.anime_mal_id).map(m => m.anime_mal_id!))}
          releasingManga={manga.filter(m => m.status === 'reading' && m.publishing_status === 'Publishing')}
          onAddToLibrary={async (entry) => {
            const payload = {
              title: entry.title,
              current_chapter: 0,
              episodes_watched: 0,
              status: 'watching' as const,
              content_type: 'anime',
              mal_id: null,
              anime_mal_id: entry.mal_id,
              anime_title: entry.title,
              cover_url: entry.cover ?? null,
              total_episodes: entry.episodes ?? null,
              genres: entry.genres ?? [],
              has_anime: true,
            }
            const { data, error } = await supabase.from('manga_list').insert(payload).select().single()
            if (error?.code === '23505') { showToast(`"${entry.title}" Is Already In Your Library`); return }
            if (error) { showToast('Failed To Add To Library'); return }
            if (data) {
              setManga(prev => [...prev, data as Manga])
              showToast(`"${entry.title}" Added To Library`)
            }
          }}
        />

        {/* Trending section — reads excluded genres from localStorage (set on Search page) */}
        <TrendingSection
          onSelect={rec => setSelectedRec(rec)}
          excludeGenreIds={(() => {
            try { return JSON.parse(localStorage.getItem('excluded_genres') ?? '[]') } catch { return [] }
          })()}
        />

        {/* Discovery — Featured / Popular Today / New Releases */}
        <DiscoverySection
          onSelect={(mal_id, title) => setSelectedRec({ title, mal_id, confidence: 0, reason: '', isAnime: false })}
        />


        <MangaFact />

        {/* Backlog pressure score */}
        {(() => {
          const reading = manga.filter(m => m.status === 'reading' && m.total_chapters)
          const totalUnread = reading.reduce((s, m) => s + Math.max(0, (m.total_chapters ?? 0) - m.current_chapter), 0)
          if (totalUnread === 0) return null
          const weeksLeft = pacePerDay > 0 ? Math.ceil(totalUnread / (pacePerDay * 7)) : null
          const pressurePct = Math.min(100, Math.round((totalUnread / 2000) * 100)) // 2000 = "full"
          const colour = pressurePct < 30 ? 'bg-emerald-500' : pressurePct < 60 ? 'bg-yellow-500' : 'bg-red-500'
          return (
            <div className="mb-5 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} strokeWidth={1.5} className="icon-muted shrink-0" />
                  <span className="text-sm font-medium">
                    {totalUnread.toLocaleString()} unread chapters
                  </span>
                  <span className="text-xs text-zinc-500">across {reading.length} series</span>
                </div>
                {weeksLeft !== null && (
                  <span className="text-xs text-zinc-500">
                    ~{weeksLeft < 1 ? 'This Week' : weeksLeft === 1 ? '1 Week' : `${weeksLeft} Weeks`} At Your Pace
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${pressurePct}%` }} />
              </div>
            </div>
          )
        })()}

        {/* Mood filter */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {MOODS.map(mo => (
            <button key={mo.id} onClick={() => setMood(mood === mo.id ? null : mo.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                mood === mo.id
                  ? 'bg-violet-600/30 border-violet-500/50 text-violet-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
              }`}>
              {mo.icon}{mo.label}
            </button>
          ))}
          {mood && <button onClick={() => setMood(null)} className="text-xs text-zinc-600 hover:text-zinc-400 px-2">✕ clear</button>}
        </div>

        {/* Type filter — only show if there's more than one type in the library */}
        {Object.keys(typeCounts).length > 1 && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            {([
              { id: 'all',    label: 'All Types',  color: '' },
              { id: 'manga',  label: 'Manga',      color: typeFilter === 'manga'   ? 'bg-zinc-700 border-zinc-500 text-white' : '' },
              { id: 'manhwa', label: 'Manhwa',     color: typeFilter === 'manhwa'  ? 'bg-violet-600/30 border-violet-500/50 text-violet-300' : '' },
              { id: 'webtoon',label: 'Webtoon',    color: typeFilter === 'webtoon' ? 'bg-orange-600/30 border-orange-500/50 text-orange-300' : '' },
              { id: 'manhua', label: 'Manhua',     color: typeFilter === 'manhua'  ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' : '' },
              { id: 'anime',  label: 'Anime',      color: typeFilter === 'anime'   ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300' : '' },
              { id: 'movie',  label: 'Movie',      color: typeFilter === 'movie'   ? 'bg-yellow-600/30 border-yellow-500/50 text-yellow-300' : '' },
            ]
              .filter(t => t.id === 'all' || typeCounts[t.id] > 0)
              .map(t => {
                const count = t.id === 'all' ? manga.length : (typeCounts[t.id] ?? 0)
                const active = typeFilter === t.id
                return (
                  <button key={t.id}
                    onClick={() => setTypeFilter(t.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all
                      ${active
                        ? (t.color || 'bg-white/10 border-white/20 text-white')
                        : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                      }`}>
                    {t.label}
                    <span className={`text-[10px] px-1 rounded ${active ? 'opacity-70' : 'text-zinc-700'}`}>
                      {count}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        )}

        {/* Controls — stacked on mobile */}
        <div className="flex flex-col gap-2 mb-5 md:flex-row md:items-center md:flex-wrap md:gap-3">
          {/* Filter tabs — horizontal scroll on mobile */}
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
            <div className="flex gap-1 bg-zinc-900 p-1 rounded-xl w-fit min-w-full md:min-w-0" role="group" aria-label="Filter by status">
              {(['all', ...Object.keys(STATUS_LABELS)] as (MangaStatus | 'all')[]).map(s => (
                <button key={s} onClick={() => setFilter(s)} aria-pressed={filter === s}
                  className={`px-3 py-2 rounded-lg text-base whitespace-nowrap transition-colors ${filter === s ? 'bg-white text-black font-medium' : 'text-zinc-300 hover:text-white'}`}>
                  {s === 'all' ? 'All' : STATUS_LABELS[s as MangaStatus]}
                </button>
              ))}
              <button onClick={() => setFilter('duplicates')} aria-pressed={filter === 'duplicates'}
                className={`px-3 py-2 rounded-lg text-base whitespace-nowrap transition-colors flex items-center gap-1.5 ${filter === 'duplicates' ? 'bg-amber-500 text-black font-medium' : 'text-zinc-300 hover:text-white'}`}>
                <GitMerge size={13} strokeWidth={1.5} />
                Duplicates
                {duplicatePairs.length > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${filter === 'duplicates' ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-400'}`}>
                    {duplicatePairs.length}
                  </span>
                )}
              </button>
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

        {/* Duplicates view */}
        {filter === 'duplicates' && !loading && (
          <div className="space-y-3">
            {duplicatePairs.length === 0 ? (
              <div className="text-center py-12">
                <GitMerge size={32} strokeWidth={1} className="mx-auto mb-3 text-zinc-700" />
                <p className="text-zinc-500 text-sm">No suspected duplicates found.</p>
              </div>
            ) : duplicatePairs.map(({ a, b, score, reason }) => {
              const key = [a.id, b.id].sort().join('|')
              return (
                <div key={key} className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                      <GitMerge size={12} strokeWidth={1.5} /> {reason} — {Math.round(score * 100)}% match
                    </span>
                    <button onClick={() => dismissPair(a, b)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[a, b].map(m => (
                      <div key={m.id} className="bg-zinc-800 rounded-lg p-3">
                        <div className="flex gap-2 mb-2">
                          {m.cover_url && <img src={m.cover_url} alt="" className="w-8 h-11 object-cover rounded shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-snug truncate">{m.title}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">{STATUS_LABELS[m.status]}</p>
                            <p className="text-[10px] text-zinc-600">Ch. {m.current_chapter}{m.total_chapters ? `/${m.total_chapters}` : ''}</p>
                          </div>
                        </div>
                        {m.synopsis && <p className="text-[10px] text-zinc-600 line-clamp-2 leading-relaxed">{m.synopsis}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => mergePair(a, b)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors">
                      <GitMerge size={12} strokeWidth={1.5} /> Merge &amp; Integrate All Data
                    </button>
                    <button onClick={() => dismissPair(a, b)}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors">
                      Not A Duplicate
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* List */}
        {filter !== 'duplicates' && (loading ? (
          <div className="text-zinc-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-zinc-500 text-sm">Nothing here.</div>
        ) : (
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))' }}>
            {filtered.slice(0, renderCount).map(m => (
              <div key={m.id}
                className={`bg-zinc-900 border rounded-xl overflow-hidden flex flex-col h-full transition-colors ${deepSelectMode ? (deepSelected.has(m.id) ? 'border-violet-500 ring-1 ring-violet-500/40' : 'border-zinc-700 cursor-pointer hover:border-zinc-600') : 'border-zinc-800'}`}
                onClick={deepSelectMode ? () => setDeepSelected(prev => { const s = new Set(prev); s.has(m.id) ? s.delete(m.id) : s.add(m.id); return s }) : undefined}
              >
                {deepSelectMode && (
                  <div className="px-3 pt-2.5 pb-0 flex items-center gap-2 text-xs text-zinc-400">
                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${deepSelected.has(m.id) ? 'bg-violet-600 border-violet-600 text-white' : 'border-zinc-600'}`}>
                      {deepSelected.has(m.id) && <span className="text-[10px] leading-none">✓</span>}
                    </div>
                    <span className="truncate">{m.title}</span>
                  </div>
                )}
                <div className="flex gap-3 p-3 flex-1" onClick={deepSelectMode ? e => e.stopPropagation() : undefined}>

                  {/* Cover — slightly larger, vertically centred */}
                  <div className="shrink-0 w-20 h-28 rounded-lg overflow-hidden bg-zinc-800 self-center">
                    {m.cover_url ? (
                      <Image
                        src={m.cover_url}
                        alt={`Cover for ${m.title}`}
                        width={80}
                        height={112}
                        className="w-full h-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs" aria-hidden>?</div>
                    )}
                  </div>

                  {/* Info — always renders all 6 sections */}
                  <div className="flex-1 min-w-0 flex flex-col gap-2">

                    {/* 1. Title + author */}
                    <div>
                      <div className="flex items-start gap-1.5 min-w-0">
                        {m.publishing_status && m.status === 'reading' && (
                          <span title={m.publishing_status} className="shrink-0 w-2 h-2 rounded-full mt-[5px]"
                            style={{ backgroundColor: m.publishing_status === 'Publishing' ? '#2FCF7A' : m.publishing_status === 'On Hiatus' ? '#FFB02E' : '#52525b' }} />
                        )}
                        <button onClick={() => setSelectedManga(m)}
                          className="font-semibold text-sm leading-snug text-left hover:text-violet-300 transition-colors flex-1 min-w-0 truncate">
                          {m.title}
                        </button>
                        {m.total_chapters && m.current_chapter < m.total_chapters && m.status === 'reading' && (
                          <span className="shrink-0 text-[10px] px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full whitespace-nowrap">
                            +{m.total_chapters - m.current_chapter}
                          </span>
                        )}
                        {deepDiveSeries.some(s => s.title.toLowerCase() === m.title.toLowerCase()) && (
                          <span title="YouTube rabbit hole — hundreds of analysis & lore videos watched"
                            className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                            style={{ background: 'rgba(255,45,70,0.12)', color: 'var(--vermillion)', border: '1px solid rgba(255,45,70,0.25)' }}>
                            🔥 yt deep-dive
                          </span>
                        )}
                        {(() => {
                          const ct = m.content_type ?? 'manga'
                          const typeStyles: Record<string, { bg: string; color: string; border: string }> = {
                            manga:   { bg: 'rgba(113,113,122,0.18)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.35)' },
                            manhwa:  { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.3)' },
                            webtoon: { bg: 'rgba(251,146,60,0.12)',  color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' },
                            manhua:  { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' },
                            anime:   { bg: 'rgba(34,211,238,0.10)',  color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' },
                            movie:   { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' },
                          }
                          const s = typeStyles[ct] ?? typeStyles.manga
                          const animeS = typeStyles.anime
                          // Show both badges when entry has an anime AND is not already purely anime/movie
                          const showAnimeBadge = m.has_anime && ct !== 'anime' && ct !== 'movie'
                          return (
                            <>
                              <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide font-semibold whitespace-nowrap"
                                style={{ background: s.bg, color: s.color, border: s.border }}>
                                {ct}
                              </span>
                              {showAnimeBadge && (
                                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide font-semibold whitespace-nowrap"
                                  style={{ background: animeS.bg, color: animeS.color, border: animeS.border }}>
                                  anime
                                </span>
                              )}
                            </>
                          )
                        })()}
                      </div>
                      {m.authors?.length > 0 ? (
                        <div className="flex gap-1 flex-wrap mt-0.5 items-center">
                          {(m.content_type === 'anime' || m.content_type === 'movie') && (
                            <span className="text-[10px] text-zinc-700 mr-0.5">Studio:</span>
                          )}
                          {m.authors.map((a: Author) => (
                            <button key={a.id}
                              onClick={() => (m.content_type === 'anime' || m.content_type === 'movie') ? setSelectedStudio(a) : setSelectedAuthor(a)}
                              className="text-[11px] text-zinc-500 hover:text-violet-400 transition-colors">
                              {a.name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-zinc-700 mt-0.5 italic">Unknown {(m.content_type === 'anime' || m.content_type === 'movie') ? 'studio' : 'author'}</p>
                      )}
                    </div>

                    {/* 2. Status dropdown + action buttons */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <select value={m.status} onChange={e => updateStatus(m.id, e.target.value as MangaStatus)}
                        aria-label={`Status for ${m.title}`}
                        className={`text-xs px-2 py-0.5 rounded-full border bg-transparent cursor-pointer outline-none ${STATUS_COLORS[m.status]}`}>
                        {(Object.keys(STATUS_LABELS) as MangaStatus[]).filter(s => (s !== 'watching' && s !== 'unwatched') || m.has_anime).map(s => (
                          <option key={s} value={s} className="bg-zinc-900 text-white">{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      <span className="text-[11px] text-zinc-600" suppressHydrationWarning>{timeAgo(m.last_read_at)}</span>
                      {m.auto_tracked && (() => {
                        const siteLabelMap: Record<string, string> = {
                          'netflix.com': 'Netflix', 'netflix': 'Netflix',
                          'crunchyroll.com': 'Crunchyroll', 'crunchyroll': 'Crunchyroll',
                          'funimation.com': 'Funimation', 'funimation': 'Funimation',
                          'hidive.com': 'HiDive', 'hidive': 'HiDive',
                          'disneyplus.com': 'Disney+', 'disney+': 'Disney+',
                          'max.com': 'Max', 'hbomax.com': 'Max', 'max': 'Max',
                          'hulu.com': 'Hulu', 'hulu': 'Hulu',
                          'vrv.co': 'VRV', 'vrv': 'VRV',
                          'bilibili.tv': 'Bilibili', 'bilibili': 'Bilibili',
                          'tubi.tv': 'Tubi', 'tubi': 'Tubi',
                        }
                        const sk = m.last_watched_site?.toLowerCase() ?? ''
                        const sn = siteLabelMap[sk] ?? (m.last_watched_site ? m.last_watched_site.replace(/\.com$/, '') : null)
                        const watchHrs = m.total_watch_time_minutes > 0 ? Math.round(m.total_watch_time_minutes / 60 * 10) / 10 + 'h' : null
                        return (
                          <span title={`Auto-tracked${sn ? ` on ${sn}` : ''}${watchHrs ? ` · ${watchHrs} watched` : ''}`}
                            className="text-[10px] bg-green-950 text-green-400 border border-green-800/50 px-1.5 py-0.5 rounded-full">
                            🎬 {sn ?? 'tracked'}
                          </span>
                        )
                      })()}
                      {m.status === 'reading' && finishEstimate(m) && (
                        <span className="text-[11px] text-zinc-600 flex items-center gap-1">
                          <Flag size={10} strokeWidth={1.5} /> {finishEstimate(m)}
                        </span>
                      )}
                      <button onClick={() => toggleNotes(m.id)}
                        className={`transition-colors ${expandedNotes.has(m.id) || m.notes ? 'text-violet-400' : 'text-zinc-700 hover:text-zinc-400'}`}>
                        <PenLine size={12} strokeWidth={1.5} />
                      </button>
                      <div className="ml-auto flex items-center gap-1.5">
                        {m.status === 'reading' && (
                          <button onClick={() => activeSession?.mangaId === m.id ? setActiveSession(null) : startSession(m)}
                            title={activeSession?.mangaId === m.id ? 'Stop session' : 'Start reading session'}
                            className={`transition-colors ${activeSession?.mangaId === m.id ? 'text-violet-400 animate-pulse' : 'text-zinc-700 hover:text-violet-400'}`}>
                            {activeSession?.mangaId === m.id ? <Timer size={13} strokeWidth={1.5} /> : <Play size={13} strokeWidth={1.5} />}
                          </button>
                        )}
                        <button onClick={() => setShelfPickerManga(m)} title="Add to shelf" className="text-zinc-700 hover:text-violet-400 transition-colors">
                          <Folder size={13} strokeWidth={1.5} />
                        </button>
                        <a href={`/search?q=${encodeURIComponent(m.title)}`} title="Search for more info" className="text-zinc-700 hover:text-cyan-400 transition-colors">
                          <Search size={12} strokeWidth={1.5} />
                        </a>
                        <button onClick={() => refreshCardInfo(m)} disabled={refreshingId === m.id} title="Refresh info"
                          className={`transition-colors ${refreshingId === m.id ? 'text-cyan-400 animate-spin' : 'text-zinc-700 hover:text-cyan-400'}`}>
                          <RefreshCw size={12} strokeWidth={1.5} />
                        </button>
                        <button onClick={() => confirmDelete(m.id)} aria-label={`Delete ${m.title}`} className="text-zinc-700 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                      </div>
                    </div>

                    {/* 3. Description */}
                    <p className={`text-[11px] leading-[1.5] ${m.synopsis ? 'text-zinc-500' : 'text-zinc-700 italic'} ${expandedSynopsis.has(m.id) ? '' : 'line-clamp-3'}`}
                      style={{ minHeight: '3.375rem', cursor: m.synopsis ? 'pointer' : 'default' }}
                      onClick={() => m.synopsis && toggleSynopsis(m.id)}>
                      {m.synopsis ?? 'No Description Available.'}
                    </p>

                    {/* Arc / re-read / re-watch badges */}
                    {(() => {
                      const arc = currentArc(m)
                      const rereadCount = rereadCounts[m.id] ?? 0
                      const rewatchCount = rewatchCounts[m.id] ?? 0
                      if (!arc && !rereadCount && !rewatchCount) return null
                      return (
                        <div className="flex items-center gap-2">
                          {arc && <span className="text-[11px] text-zinc-600 truncate flex items-center gap-1"><MapPin size={10} strokeWidth={1.5} /> {arc.label}</span>}
                          {rereadCount > 0 && <span className="text-[11px] text-violet-500 shrink-0">×{rereadCount} Re-Read</span>}
                          {rewatchCount > 0 && <span className="text-[11px] text-cyan-600 shrink-0">×{rewatchCount} Re-Watch</span>}
                        </div>
                      )
                    })()}

                    {/* Anime episode tracker — hidden for movies, dimmed when manga is primary */}
                    {m.has_anime && m.content_type !== 'movie' && (() => {
                      const isAnimePrimary = m.content_type === 'anime'
                      const epMembers = m.series_id ? (seriesMap.get(m.series_id) ?? []).filter(e => e.has_anime) : []
                      const seriesEpCurrent = epMembers.length > 1 ? epMembers.reduce((s, e) => s + e.episodes_watched, 0) : m.episodes_watched
                      const seriesEpTotal = epMembers.length > 1 ? (epMembers.reduce((s, e) => s + (e.total_episodes ?? 0), 0) || null) : m.total_episodes
                      const activeEpMember = epMembers.length > 1
                        ? epMembers.find(e => !e.total_episodes || e.episodes_watched < e.total_episodes) ?? m
                        : m
                      return (
                      <div className={`flex flex-col gap-0.5 ${!isAnimePrimary ? 'opacity-40' : ''}`}>
                        {epMembers.length > 1 && (
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                              style={{ background: 'rgba(34,211,238,0.10)', color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' }}>
                              📺 {epMembers.length} Parts
                            </span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clapperboard size={11} strokeWidth={1.5} className={isAnimePrimary ? 'text-violet-400 shrink-0' : 'text-zinc-600 shrink-0'} />
                          <span className="text-[11px] text-zinc-600 truncate">{epMembers.length > 1 ? 'Series Total' : (m.anime_title ?? 'Anime')}</span>
                          {isAnimePrimary && seriesEpTotal && seriesEpCurrent < seriesEpTotal && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-violet-500/20 text-violet-400 border border-violet-500/30 rounded-full whitespace-nowrap shrink-0">
                              +{seriesEpTotal - seriesEpCurrent} ep
                            </span>
                          )}
                          <div className="flex items-center gap-1 ml-auto shrink-0">
                            <button onClick={() => updateEpisodes(activeEpMember.id, -1, activeEpMember.episodes_watched)} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">−</button>
                            <EditableNumber value={seriesEpCurrent} onSave={n => updateEpisodes(m.id, n - m.episodes_watched, m.episodes_watched)} label={`Episodes for ${m.title}`} className="w-8 text-xs py-0.5" />
                            <span className="text-[11px] text-zinc-600 font-mono">/</span>
                            <EditableNumber
                              value={epMembers.length <= 1 ? (m.total_episodes ?? 0) : (seriesEpTotal ?? 0)}
                              label={`Total episodes for ${m.title}`}
                              className="w-8 text-[11px] text-zinc-500 py-0.5"
                              onSave={async n => {
                                if (epMembers.length > 1) {
                                  // Series mode: save total on the primary card and null-out
                                  // other members so the displayed sum equals what the user typed.
                                  await updateTotalEpisodes(m.id, n, m.anime_mal_id ?? m.mal_id, m.content_type)
                                  for (const mem of epMembers.filter(e => e.id !== m.id)) {
                                    await supabase.from('manga_list').update({ total_episodes: null }).eq('id', mem.id)
                                    setManga(prev => prev.map(x => x.id === mem.id ? { ...x, total_episodes: null } : x))
                                  }
                                } else {
                                  updateTotalEpisodes(activeEpMember.id, n, activeEpMember.anime_mal_id ?? activeEpMember.mal_id, activeEpMember.content_type)
                                }
                              }}
                            />
                            <button onClick={() => updateEpisodes(activeEpMember.id, 1, activeEpMember.episodes_watched)} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">+</button>
                          </div>
                        </div>
                      </div>
                      )
                    })()}

                    {/* 4. Chapter tracker + inline stepper + progress bar — dimmed when anime is primary */}
                    {/* Movie runtime gauge — replaces chapter/episode tracker for movies */}
                    {m.content_type === 'movie' && (() => {
                      // total_episodes repurposed as runtime_minutes for movies
                      const runtimeMin = m.total_episodes ?? null
                      const watchedMin = m.total_watch_time_minutes ?? 0
                      const fmtMin = (mins: number) => {
                        if (mins <= 0) return null
                        const h = Math.floor(mins / 60), mn = mins % 60
                        return h > 0 ? `${h}h ${mn > 0 ? mn + 'm' : ''}`.trim() : `${mn}m`
                      }
                      const pct = runtimeMin && runtimeMin > 0
                        ? Math.min(100, Math.round((watchedMin / runtimeMin) * 100))
                        : 0
                      return (
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                              🎬 {runtimeMin ? fmtMin(runtimeMin) ?? '—' : <span className="italic text-zinc-700">Runtime not set</span>}
                              {watchedMin > 0 && runtimeMin && (
                                <span className="text-zinc-700 ml-1">· {fmtMin(watchedMin)} watched · {pct}%</span>
                              )}
                            </span>
                            <EditableNumber
                              value={runtimeMin ?? 0}
                              label={`Runtime (minutes) for ${m.title}`}
                              className="w-10 text-[11px] text-zinc-600 py-0"
                              onSave={n => updateTotalEpisodes(m.id, n, m.anime_mal_id ?? m.mal_id, m.content_type)}
                            />
                          </div>
                          {(runtimeMin ?? 0) > 0 && (
                            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"
                              role="progressbar" aria-valuenow={watchedMin} aria-valuemax={runtimeMin ?? 0}>
                              <div className="h-full rounded-full transition-all bg-yellow-500/70"
                                style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      )
                    })()}

                    {/* 4. Chapter tracker + inline stepper + progress bar — dimmed when anime is primary */}
                    {m.content_type !== 'movie' && (() => {
                      const isMangaPrimary = m.content_type !== 'anime'
                      // Series-aware totals
                      const members = m.series_id ? (seriesMap.get(m.series_id) ?? []) : []
                      const seriesCurrent = members.length > 1 ? members.reduce((s, e) => s + e.current_chapter, 0) : m.current_chapter
                      const seriesTotal = members.length > 1 ? members.reduce((s, e) => s + (e.total_chapters ?? 0), 0) || null : m.total_chapters
                      const partCount = members.length
                      // Active member: first not-yet-completed part (for +/- routing)
                      const activeMember = members.length > 1
                        ? members.find(e => !e.total_chapters || e.current_chapter < e.total_chapters) ?? m
                        : m
                      // Skip chapter tracker entirely if pure anime with no chapter data
                      if (m.content_type === 'anime' && !m.total_chapters && m.current_chapter === 0) return null
                      return (
                    <div className={!isMangaPrimary ? 'opacity-40' : ''}>
                      {partCount > 1 && (
                        <div className="flex items-center gap-1 mb-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                            style={{ background: 'rgba(167,139,250,0.15)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)' }}>
                            📚 {partCount} Parts
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] text-zinc-500 tabular-nums flex items-center gap-0.5">
                          Ch.&nbsp;{seriesCurrent}&nbsp;/&nbsp;
                          <EditableNumber
                            value={members.length <= 1 ? (m.total_chapters ?? 0) : (seriesTotal ?? 0)}
                            label={`Total chapters for ${m.title}`}
                            className="w-9 text-[11px] text-zinc-500 py-0"
                            onSave={n => updateTotalChapters(activeMember.id, n, activeMember.mal_id, activeMember.content_type)}
                          />
                          {isMangaPrimary && seriesTotal && seriesTotal > 0 && <span className="text-zinc-700 ml-1">{Math.min(100, Math.round((seriesCurrent / seriesTotal) * 100))}%</span>}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => updateChapter(activeMember.id, -1, activeMember.current_chapter)} aria-label={`Decrease chapter for ${m.title}`}
                            className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">−</button>
                          <EditableNumber value={seriesCurrent} onSave={n => updateChapter(m.id, n - m.current_chapter, m.current_chapter)}
                            label={`Chapter for ${m.title}`} className="w-9 text-xs py-0.5" />
                          <button onClick={() => updateChapter(activeMember.id, 1, activeMember.current_chapter)} aria-label={`Increase chapter for ${m.title}`}
                            className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">+</button>
                        </div>
                      </div>
                      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden"
                        role="progressbar" aria-valuenow={seriesCurrent} aria-valuemax={seriesTotal ?? 0}>
                        <div className={`h-full rounded-full transition-all ${isMangaPrimary ? 'bg-violet-500' : 'bg-zinc-600'}`}
                          style={{ width: seriesTotal && seriesTotal > 0 ? `${Math.min(100, Math.round((seriesCurrent / seriesTotal) * 100))}%` : '0%' }} />
                      </div>
                    </div>
                      )
                    })()}

                    {/* 5. Genre tags */}
                    <div className="flex flex-wrap gap-1">
                      {m.genres?.length > 0
                        ? m.genres.slice(0, 5).map(g => <span key={g} className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded-full">{g}</span>)
                        : <span className="text-[10px] text-zinc-700 italic">No Genres Listed</span>
                      }
                    </div>

                    {/* 6. Rating row */}
                    <div className="flex items-center gap-2 pt-1.5 border-t border-zinc-800/70 mt-auto">
                      <span className="text-[10px] text-zinc-700 uppercase tracking-widest">Rating</span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <button onClick={async (e) => {
                            e.stopPropagation()
                            const prev_rating = m.user_rating
                            const next = m.user_rating === 'up' ? null : 'up'
                            setManga(prev => prev.map(x => x.id === m.id ? { ...x, user_rating: next } : x))
                            const { error } = await supabase.from('manga_list').update({ user_rating: next }).eq('id', m.id)
                            if (error) setManga(prev => prev.map(x => x.id === m.id ? { ...x, user_rating: prev_rating } : x))
                          }}
                          title={m.user_rating === 'up' ? 'Remove like' : 'Like'}
                          className={`transition-colors ${m.user_rating === 'up' ? 'text-emerald-400' : 'text-zinc-700 hover:text-emerald-400'}`}>
                          <ThumbsUp size={13} strokeWidth={1.5} />
                        </button>
                        <button onClick={async (e) => {
                            e.stopPropagation()
                            const prev_rating = m.user_rating
                            const next = m.user_rating === 'down' ? null : 'down'
                            setManga(prev => prev.map(x => x.id === m.id ? { ...x, user_rating: next } : x))
                            const { error } = await supabase.from('manga_list').update({ user_rating: next }).eq('id', m.id)
                            if (error) setManga(prev => prev.map(x => x.id === m.id ? { ...x, user_rating: prev_rating } : x))
                          }}
                          title={m.user_rating === 'down' ? 'Remove dislike' : 'Dislike'}
                          className={`transition-colors ${m.user_rating === 'down' ? 'text-red-400' : 'text-zinc-700 hover:text-red-400'}`}>
                          <ThumbsDown size={13} strokeWidth={1.5} />
                        </button>
                        <span className="text-[10px] text-zinc-700 ml-1">
                          {m.user_rating === 'up' ? 'Liked' : m.user_rating === 'down' ? 'Disliked' : 'Not Rated'}
                        </span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Watching episode prompt */}
                {watchPrompt?.id === m.id && (
                  <div className="border-t border-zinc-800 px-3 py-3 bg-violet-900/10">
                    <p className="text-xs text-violet-300 font-medium mb-2 flex items-center gap-1.5"><Tv size={12} strokeWidth={1.5} /> How Many Episodes Have You Watched?</p>
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" min={0}
                        value={watchPrompt.epInput}
                        onChange={e => setWatchPrompt(p => p ? { ...p, epInput: e.target.value } : null)}
                        onKeyDown={e => { if (e.key === 'Enter') confirmWatching(); if (e.key === 'Escape') setWatchPrompt(null) }}
                        autoFocus
                        placeholder="0"
                        className="w-24 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-center outline-none focus:border-violet-500 text-white"
                      />
                      {m.total_episodes && (
                        <span className="text-xs text-zinc-500">/ {m.total_episodes} eps</span>
                      )}
                      <button onClick={confirmWatching}
                        className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors">
                        Confirm
                      </button>
                      <button onClick={() => setWatchPrompt(null)}
                        className="text-xs text-zinc-600 hover:text-zinc-400">Cancel</button>
                    </div>
                  </div>
                )}

                {/* Notes + optional public review */}
                {(expandedNotes.has(m.id) || m.notes) && (
                  <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
                    <textarea
                      value={m.notes ?? ''}
                      onChange={e => updateNotes(m.id, e.target.value)}
                      placeholder="Add a note… (supports [spoiler]text[/spoiler])"
                      aria-label={`Notes for ${m.title}`}
                      rows={2}
                      className="w-full bg-transparent text-xs text-zinc-400 placeholder:text-zinc-700 outline-none resize-none"
                    />
                    {/* Make public review toggle */}
                    {m.notes && m.notes.trim().length > 10 && (
                      <label className="flex items-center gap-2 mt-2 cursor-pointer select-none w-fit">
                        <div className={`relative w-7 h-4 rounded-full transition-colors ${m.is_public_review ? 'bg-violet-600' : 'bg-zinc-700'}`}>
                          <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${m.is_public_review ? 'left-3.5' : 'left-0.5'}`} />
                        </div>
                        <input type="checkbox" className="sr-only"
                          checked={m.is_public_review ?? false}
                          onChange={async e => {
                            const val = e.target.checked
                            setManga(prev => prev.map(x => x.id === m.id ? { ...x, is_public_review: val } : x))
                            await supabase.from('manga_list').update({ is_public_review: val }).eq('id', m.id)
                          }} />
                        <span className="text-[10px] text-zinc-500">
                          {m.is_public_review ? 'Visible On Share Page' : 'Make This A Public Review'}
                        </span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {/* Recommendations modal — rendered below, triggered via showRecModal */}
      </div>

      {/* Recommendations modal */}
      {showRecModal && (
        <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center" onClick={() => { if (!loadingRec) { setShowRecModal(false); setRecommendations([]); setRecError('') } }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-lg max-h-[85vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 lg:hidden">
              <div className="w-10 h-1 bg-zinc-700 rounded-full" />
            </div>
            <div className="px-5 pt-4 pb-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-violet-300">✦ AI Recommendations</h2>
                {!loadingRec && (
                  <button onClick={() => { setShowRecModal(false); setRecommendations([]); setRecError('') }}
                    aria-label="Close" className="text-zinc-600 hover:text-zinc-400 text-xl leading-none">×</button>
                )}
              </div>

              {loadingRec && (
                <div className="flex flex-col items-center py-10 gap-3">
                  <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-zinc-500">Asking Claude…</p>
                </div>
              )}

              {recError && !loadingRec && (
                <div className="text-center py-6">
                  <p className="text-red-400 text-sm mb-1">{recError}</p>
                  <p className="text-zinc-600 text-xs mb-4 font-mono break-all px-2">{recError}</p>
                  <button onClick={getRecommendations}
                    className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300">
                    Try Again
                  </button>
                </div>
              )}

              {recommendations.length > 0 && (
                <div className="space-y-4">
                  {recommendations.map((r, i) => {
                    const barColour = r.confidence >= 80 ? 'bg-emerald-500' : r.confidence >= 65 ? 'bg-yellow-500' : 'bg-zinc-500'
                    const textColour = r.confidence >= 80 ? 'text-emerald-400' : r.confidence >= 65 ? 'text-yellow-400' : 'text-zinc-400'
                    return (
                      <div key={i} className="flex items-start gap-3">
                        <div className="shrink-0 w-12 h-12 rounded-full bg-zinc-800 border border-zinc-700 flex flex-col items-center justify-center">
                          <span className={`text-sm font-bold leading-none ${textColour}`}>{r.confidence}</span>
                          <span className="text-zinc-600 text-[9px] leading-none">%</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <button onClick={() => setSelectedRec(r)}
                              className="font-semibold text-sm text-white hover:text-violet-300 transition-colors text-left">
                              {r.title} ↗
                            </button>
                            {r.isAnime && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded-full">Anime</span>}
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden mb-1.5">
                            <div className={`h-full rounded-full ${barColour}`} style={{ width: `${r.confidence}%` }} />
                          </div>
                          <p className="text-xs text-zinc-500 leading-relaxed">{r.reason}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
            {/* Sentinel — triggers loading the next batch when it scrolls into view */}
            {renderCount < filtered.length && (
              <div ref={gridSentinelRef} className="col-span-full h-4" aria-hidden />
            )}
          </div>
        </div>
      )}

      {/* Session timer */}
      {activeSession && (
        <SessionTimer
          session={activeSession}
          currentChapter={manga.find(m => m.id === activeSession.mangaId)?.current_chapter ?? activeSession.startChapter}
          onEnd={endSession}
          onCancel={() => setActiveSession(null)}
        />
      )}

      {/* Share modal */}
      {shareModal && (
        <ShareModal token={shareToken} enabled={shareEnabled} onToggle={toggleShare} onClose={() => setShareModal(false)} />
      )}

      {/* Takeout Import modal */}
      {showTakeoutImport && (
        <TakeoutImportModal
          existingTitles={new Set(manga.map(m => m.title.toLowerCase().trim()))}
          onClose={() => setShowTakeoutImport(false)}
          onImported={(count) => { showToast(`Imported ${count} series from Takeout`); fetchManga() }}
        />
      )}

      {/* Health Check modal */}
      {showHealthCheck && (
        <HealthCheckModal
          manga={manga}
          onClose={() => setShowHealthCheck(false)}
          onEnriched={(updated) => setManga(prev => prev.map(m => m.id === updated.id ? updated : m))}
        />
      )}

      {/* Recommendation detail modal */}
      {selectedRec && (
        <RecommendationModal rec={selectedRec} onClose={() => setSelectedRec(null)} />
      )}

      {/* Shelf picker */}
      {shelfPickerManga && (
        <ShelfPicker manga={shelfPickerManga} onClose={() => setShelfPickerManga(null)} />
      )}

      {/* Author modal */}
      {selectedAuthor && (
        <AuthorModal author={selectedAuthor} onClose={() => setSelectedAuthor(null)} />
      )}

      {selectedStudio && (
        <StudioModal studio={selectedStudio} onClose={() => setSelectedStudio(null)} />
      )}

      {/* Detail modal */}
      {selectedManga && (
        <DetailModal
          manga={selectedManga}
          allManga={manga}
          onClose={() => setSelectedManga(null)}
          onStatusChange={(id, status) => {
            updateStatus(id, status)
            setSelectedManga(prev => prev ? { ...prev, status } : null)
          }}
          onMerge={(removedId) => {
            setManga(prev => prev.filter(m => m.id !== removedId))
          }}
          onMergeMultiple={async (removeIds) => {
            const candidates = [selectedManga!, ...manga.filter(m => removeIds.includes(m.id))]
            const keep = pickKeeper(candidates)
            const toRemove = candidates.filter(m => m.id !== keep.id)
            await mergeMultiple(keep, toRemove)
            // If the kept entry is different from the selected one, navigate to it
            if (keep.id !== selectedManga!.id) setSelectedManga(keep)
          }}
          onNavigate={(m) => setSelectedManga(m)}
          onChapterReset={(chapterAtStart) => {
            setManga(prev => prev.map(m => m.id === selectedManga!.id ? { ...m, current_chapter: 0 } : m))
            setSelectedManga(prev => prev ? { ...prev, current_chapter: 0 } : prev)
            showToast(`Re-Read Started — Ch. ${chapterAtStart} Saved, Reset To 0`)
          }}
          onEpisodesReset={(episodesAtStart) => {
            setManga(prev => prev.map(m => m.id === selectedManga!.id ? { ...m, episodes_watched: 0 } : m))
            setSelectedManga(prev => prev ? { ...prev, episodes_watched: 0 } : prev)
            showToast(`Re-Watch Started — Ep. ${episodesAtStart} Saved, Reset To 0`)
          }}
          onChapterRestored={(restored) => {
            setManga(prev => prev.map(m => m.id === selectedManga!.id ? { ...m, current_chapter: restored } : m))
            setSelectedManga(prev => prev ? { ...prev, current_chapter: restored } : prev)
            showToast(`Re-Read Complete — Progress Restored To Ch. ${restored}`)
          }}
          onEpisodesRestored={(restored) => {
            setManga(prev => prev.map(m => m.id === selectedManga!.id ? { ...m, episodes_watched: restored } : m))
            setSelectedManga(prev => prev ? { ...prev, episodes_watched: restored } : prev)
            showToast(`Re-Watch Complete — Progress Restored To Ep. ${restored}`)
          }}
          onTotalChaptersUpdated={(n) => {
            const tc = n ?? null
            setManga(prev => prev.map(m => m.id === selectedManga!.id ? { ...m, total_chapters: tc } : m))
            setSelectedManga(prev => prev ? { ...prev, total_chapters: tc } : prev)
            if (tc != null) showToast(`Total Chapters Updated To ${tc}`)
          }}
          onSeriesUpdated={(patches) => {
            setManga(prev => prev.map(m => {
              if (patches[m.id]) return { ...m, ...patches[m.id] }
              return m
            }))
            // Also update selectedManga if it's in the patches
            setSelectedManga(prev => prev && patches[prev.id] ? { ...prev, ...patches[prev.id] } : prev)
          }}
          onSeriesEntryAdded={(entry) => {
            setManga(prev => [...prev, entry])
          }}
        />
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (() => {
        const target = manga.find(m => m.id === pendingDelete)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={cancelDelete}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="text-base font-semibold text-white mb-1">Remove From Library?</div>
              <div className="text-sm text-zinc-400 mb-5">
                <span className="text-white font-medium">{target?.title}</span> will be permanently deleted.
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={cancelDelete}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
                <button onClick={() => deleteManga(pendingDelete)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Toast */}
      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {progressPrompt && (
        <DateAttributionModal
          title={progressPrompt.title}
          delta={progressPrompt.delta}
          type={progressPrompt.type}
          onConfirm={(attr, applyToAll) => {
            const p = progressPrompt
            setProgressPrompt(null)
            if (applyToAll) sessionAttrRef.current = attr
            if (p.type === 'chapter') commitChapterProgress(p.id, p.delta, p.current, attr)
            else commitEpisodeProgress(p.id, p.delta, p.current, attr)
          }}
          onDismiss={() => {
            const p = progressPrompt
            setProgressPrompt(null)
            // Dismissed = save as unknown date
            if (p.type === 'chapter') commitChapterProgress(p.id, p.delta, p.current, { precision: 'unknown' })
            else commitEpisodeProgress(p.id, p.delta, p.current, { precision: 'unknown' })
          }}
        />
      )}

      {completionManga && (
        <CompletionModal
          manga={completionManga}
          onClose={() => setCompletionManga(null)}
          onSaved={(id, rating, note) => {
            setManga(prev => prev.map(m => m.id === id
              ? { ...m, user_rating: rating, notes: note ? (m.notes ? m.notes.trim() + '\n' : '') + `[Completed] ${note}` : m.notes }
              : m
            ))
            showToast(`"${completionManga.title}" Logged ✓`)
          }}
        />
      )}

      {/* Deep Search Modal — library multi-select */}
      {deepSearchTarget && (
        <DeepSearchModal
          mangaId={deepSearchTarget.id}
          malId={deepSearchTarget.mal_id}
          title={deepSearchTarget.title}
          onClose={() => {
            const remaining = [...deepSelected].filter(id => id !== deepSearchTarget.id)
            setDeepSelected(new Set(remaining))
            if (remaining.length === 0) {
              setDeepSelectMode(false)
              setDeepSearchTarget(null)
            } else {
              const next = manga.find(m => remaining[0] === m.id)
              setDeepSearchTarget(next ?? null)
            }
          }}
          onSaved={(total) => {
            setManga(prev => prev.map(m => m.id === deepSearchTarget.id ? { ...m, total_chapters: total } : m))
            showToast(`Deep Search Saved — ${deepSearchTarget.title}`)
            const remaining = [...deepSelected].filter(id => id !== deepSearchTarget.id)
            setDeepSelected(new Set(remaining))
            if (remaining.length === 0) {
              setDeepSelectMode(false)
              setDeepSearchTarget(null)
            } else {
              const next = manga.find(m => remaining[0] === m.id)
              setDeepSearchTarget(next ?? null)
            }
          }}
        />
      )}

      {/* Sync Results Modal */}
      {syncResults && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
          onClick={() => setSyncResults(null)}
        >
          <div
            className="relative w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <div>
                <h2 className="text-sm font-bold text-zinc-200">⟳ Sync Complete</h2>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Checked {manga.filter(m => m.mal_id).length} Titles · {syncResults.updated} Updated
                  {syncResults.timestamp && ` · ${new Date(syncResults.timestamp).toLocaleTimeString()}`}
                </p>
              </div>
              <button onClick={() => setSyncResults(null)} aria-label="Close" className="text-zinc-600 hover:text-zinc-400 text-xl leading-none ml-4">×</button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
              {syncResults.updated === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 text-center">
                  <span className="text-2xl">✓</span>
                  <p className="text-sm text-zinc-400">Everything Is Up To Date</p>
                  <p className="text-xs text-zinc-600">All {manga.filter(m => m.mal_id).length} Tracked Titles Match MyAnimeList</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {syncResults.results.map((r, i) => (
                    <div key={i} className="rounded-xl bg-zinc-800 px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-emerald-400 text-xs shrink-0">✓</span>
                        <span className="text-sm font-semibold text-zinc-200 truncate">{r.title}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5 ml-4">
                        {r.changes.map((c, j) => (
                          <span key={j} className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-700 text-zinc-400">{c}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-zinc-800 flex justify-between items-center">
              <p className="text-[11px] text-zinc-700">MAL ID required for sync. Use Search to add titles.</p>
              <button
                onClick={() => setSyncResults(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
