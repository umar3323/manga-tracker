'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { supabase, type Manga, type MangaStatus, type Author } from '@/lib/supabase'
import {
  getAuthorWorks,
  getAuthorInfo,
  getMangaById,
  getAnimeAdaptations,
  searchMangaWithFilters,
  searchAnimeByProducer,
  type JikanSearchResult,
} from '@/lib/jikan'
import { TAKEOUT_ENTRIES } from '@/lib/data/takeout-series'
import type { Recommendation } from '@/app/api/recommend/route'
import type { RefObject } from 'react'

// ── STATUS_LABELS (local copy — needed for RecommendationModal) ──────────────
const STATUS_LABELS: Record<MangaStatus, string> = {
  reading:      'Reading',
  completed:    'Completed',
  on_hold:      'On Hold',
  dropped:      'Dropped',
  plan_to_read: 'Plan To Read',
  watching:     'Watching',
  unwatched:    'Unwatched',
}

// ─── AuthorModal ─────────────────────────────────────────────────────────────

export function AuthorModal({ author, onClose }: { author: Author; onClose: () => void }) {
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

// ─── StudioModal ─────────────────────────────────────────────────────────────

export function StudioModal({ studio, onClose }: { studio: Author; onClose: () => void }) {
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

// ─── RecommendationModal ──────────────────────────────────────────────────────

export function RecommendationModal({ rec, onClose }: { rec: Recommendation; onClose: () => void }) {
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

// ─── ShelfPicker ──────────────────────────────────────────────────────────────

export function ShelfPicker({ manga, onClose }: { manga: Manga; onClose: () => void }) {
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

// ─── ShareModal ───────────────────────────────────────────────────────────────

export function ShareModal({ token, enabled, onToggle, onClose }: {
  token: string | null; enabled: boolean; onToggle: () => void; onClose: () => void
}) {
  const [origin, setOrigin] = useState('')
  useEffect(() => { setOrigin(window.location.origin) }, [])
  const shareUrl = token ? `${origin}/share/${token}` : null
  const copy = () => { if (shareUrl) { navigator.clipboard.writeText(shareUrl) } }

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

// ─── TakeoutImportModal ───────────────────────────────────────────────────────

export function TakeoutImportModal({ existingTitles, onClose, onImported }: {
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

// ─── HealthCheckModal ─────────────────────────────────────────────────────────

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

export function HealthCheckModal({
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
      let jikan: JikanSearchResult | null = null
      if (m.mal_id != null) {
        jikan = await (await import('@/lib/jikan')).getMangaById(m.mal_id)
      }
      if (!jikan) {
        const results = await searchMangaWithFilters({ query: m.title })
        jikan = results[0] ?? null
      }
      if (!jikan || jikan.mal_id == null) return false

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
      await new Promise(r => setTimeout(r, 450))
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

// ─── SyncResultsModal ────────────────────────────────────────────────────────

export function SyncResultsModal({
  syncResults,
  malTrackedCount,
  onClose,
}: {
  syncResults: { updated: number; results: { title: string; changes: string[] }[]; timestamp: string }
  malTrackedCount: number
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
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
              Checked {malTrackedCount} Titles · {syncResults.updated} Updated
              {syncResults.timestamp && ` · ${new Date(syncResults.timestamp).toLocaleTimeString()}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-600 hover:text-zinc-400 text-xl leading-none ml-4">×</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
          {syncResults.updated === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="text-2xl">✓</span>
              <p className="text-sm text-zinc-400">Everything Is Up To Date</p>
              <p className="text-xs text-zinc-600">All {malTrackedCount} Tracked Titles Match MyAnimeList</p>
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
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-700 hover:bg-zinc-600 text-zinc-300 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── RecommendationsListModal ─────────────────────────────────────────────────

export function RecommendationsListModal({
  loading,
  error,
  recommendations,
  renderCount,
  filteredLength,
  sentinelRef,
  onClose,
  onRetry,
  onSelectRec,
}: {
  loading: boolean
  error: string
  recommendations: Recommendation[]
  renderCount: number
  filteredLength: number
  sentinelRef: RefObject<HTMLDivElement | null>
  onClose: () => void
  onRetry: () => void
  onSelectRec: (rec: Recommendation) => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center"
      onClick={() => { if (!loading) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-2xl w-full lg:max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>
        <div className="flex justify-center pt-3 pb-1 lg:hidden">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>
        <div className="px-5 pt-4 pb-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-violet-300">✦ AI Recommendations</h2>
            {!loading && (
              <button onClick={onClose} aria-label="Close" className="text-zinc-600 hover:text-zinc-400 text-xl leading-none">×</button>
            )}
          </div>

          {loading && (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-zinc-500">Asking Claude…</p>
            </div>
          )}

          {error && !loading && (
            <div className="text-center py-6">
              <p className="text-red-400 text-sm mb-1">{error}</p>
              <p className="text-zinc-600 text-xs mb-4 font-mono break-all px-2">{error}</p>
              <button onClick={onRetry}
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
                        <button onClick={() => onSelectRec(r)}
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
        {renderCount < filteredLength && (
          <div ref={sentinelRef} className="col-span-full h-4" aria-hidden />
        )}
      </div>
    </div>
  )
}
