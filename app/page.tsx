'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import { supabase, type Manga, type MangaStatus, type Author } from '@/lib/supabase'
import { fetchMangaInfo, getAuthorWorks, getAuthorInfo, getMangaById, getAnimeAdaptations, getMangaAllRelations, searchMangaWithFilters, searchAnimeWithFiltersTyped, getSeriesEntryDetail, searchAnimeByProducer, getJikanRecommendations, getJikanEpisodes, getJikanEpisodeSynopsis, getMangaDexChapters, type JikanSearchResult, type JikanEpisode, type SeriesRelation, type MangaDexChapter } from '@/lib/jikan'
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
import { deepDiveSeries } from '@/lib/data/takeout-series'
import {
  Tv, Timer, Play, Clapperboard, BookOpen, PenLine, ThumbsUp, ThumbsDown,
  Folder, MapPin, Flag, Zap, Sword, Cloud, Moon, Flame, Heart, Search,
  ChevronDown, ChevronUp, RefreshCw, GitMerge, X,
} from 'lucide-react'

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

// ─── Series Panel ─────────────────────────────────────────────────────────────
function SeriesPanel({
  primary,
  allManga,
  onUpdated,
  onAdded,
}: {
  primary: Manga
  allManga: Manga[]
  onUpdated: (patches: Record<string, Partial<Manga>>) => void
  onAdded?: (entry: Manga) => void
}) {
  const members = allManga
    .filter(m => m.series_id && m.series_id === primary.series_id)
    .sort((a, b) => a.title.localeCompare(b.title))

  const [open, setOpen] = useState(true)
  const [addQuery, setAddQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [jikanResults, setJikanResults] = useState<JikanSearchResult[]>([])
  const [searchingJikan, setSearchingJikan] = useState(false)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced Jikan search
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!addQuery.trim()) { setJikanResults([]); return }
    searchTimerRef.current = setTimeout(async () => {
      setSearchingJikan(true)
      try {
        const isAnime = primary.content_type === 'anime'
        if (isAnime) {
          const r = await searchAnimeWithFiltersTyped({ query: addQuery.trim(), orderBy: 'score', sort: 'desc' })
          setJikanResults(r.ok ? r.results : [])
        } else {
          const r = await searchMangaWithFilters({ query: addQuery.trim(), orderBy: 'score', sort: 'desc' })
          setJikanResults(r)
        }
      } finally {
        setSearchingJikan(false)
      }
    }, 400)
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current) }
  }, [addQuery, primary.content_type])

  const getOrCreateSeriesId = async (): Promise<string> => {
    if (primary.series_id) return primary.series_id
    const sid = crypto.randomUUID()
    await supabase.from('manga_list').update({ series_id: sid, series_primary: true }).eq('id', primary.id)
    onUpdated({ [primary.id]: { series_id: sid, series_primary: true } })
    return sid
  }

  const addMember = async (m: Manga) => {
    setAdding(true)
    const sid = await getOrCreateSeriesId()
    await supabase.from('manga_list').update({ series_id: sid, series_primary: false }).eq('id', m.id)
    onUpdated({ [m.id]: { series_id: sid, series_primary: false } })
    setAddQuery('')
    setJikanResults([])
    setAdding(false)
  }

  const addJikanMember = async (j: JikanSearchResult) => {
    setAdding(true)
    const sid = await getOrCreateSeriesId()
    const isAnime = primary.content_type === 'anime'
    let totalChapters = isAnime ? null : (j.total_chapters ?? null)
    let totalEpisodes = isAnime ? (j.episodes ?? null) : null
    // If totals are missing from search result, fetch detail
    if (j.mal_id && ((!isAnime && totalChapters == null) || (isAnime && totalEpisodes == null))) {
      const detail = await getSeriesEntryDetail(j.mal_id, isAnime ? 'anime' : 'manga')
      if (detail) {
        totalChapters = totalChapters ?? detail.chapters ?? null
        totalEpisodes = totalEpisodes ?? detail.episodes ?? null
      }
    }
    const newEntry: Record<string, unknown> = {
      title: j.title,
      mal_id: j.mal_id,
      cover_url: j.cover_url ?? null,
      synopsis: j.synopsis ?? null,
      genres: j.genres ?? [],
      authors: j.authors ?? [],
      total_chapters: totalChapters,
      total_episodes: totalEpisodes,
      current_chapter: 0,
      episodes_watched: 0,
      status: isAnime ? 'unwatched' : 'plan_to_read',
      has_anime: isAnime,
      content_type: primary.content_type ?? (isAnime ? 'anime' : 'manga'),
      series_id: sid,
      series_primary: false,
    }
    const { data } = await supabase.from('manga_list').insert(newEntry).select().single()
    if (data) {
      onAdded?.(data as Manga)
      onUpdated({ [data.id]: { series_id: sid, series_primary: false } })
    }
    setAddQuery('')
    setJikanResults([])
    setAdding(false)
  }

  const removeMember = async (m: Manga) => {
    setSavingId(m.id)
    const isPrimary = m.series_primary
    await supabase.from('manga_list').update({ series_id: null, series_primary: null }).eq('id', m.id)
    onUpdated({ [m.id]: { series_id: null, series_primary: null } })
    // If removed was primary and others remain, promote first alphabetically
    if (isPrimary) {
      const remaining = members.filter(e => e.id !== m.id)
      if (remaining.length > 0) {
        const newPrimary = remaining[0]
        await supabase.from('manga_list').update({ series_primary: true }).eq('id', newPrimary.id)
        onUpdated({ [newPrimary.id]: { series_primary: true } })
      } else {
        // Last member — dissolve group
        const allInGroup = allManga.filter(x => x.series_id === primary.series_id)
        for (const x of allInGroup) {
          await supabase.from('manga_list').update({ series_id: null, series_primary: null }).eq('id', x.id)
          onUpdated({ [x.id]: { series_id: null, series_primary: null } })
        }
      }
    }
    setSavingId(null)
  }

  const setPrimary = async (m: Manga) => {
    setSavingId(m.id)
    // Demote current primary
    await supabase.from('manga_list').update({ series_primary: false }).eq('id', primary.id)
    // Promote new primary
    await supabase.from('manga_list').update({ series_primary: true }).eq('id', m.id)
    onUpdated({
      [primary.id]: { series_primary: false },
      [m.id]: { series_primary: true },
    })
    setSavingId(null)
  }

  const updateMemberChapter = async (m: Manga, delta: number) => {
    const next = Math.max(0, m.current_chapter + delta)
    await supabase.from('manga_list').update({ current_chapter: next }).eq('id', m.id)
    onUpdated({ [m.id]: { current_chapter: next } })
  }

  const updateMemberEpisode = async (m: Manga, delta: number) => {
    const next = Math.max(0, m.episodes_watched + delta)
    await supabase.from('manga_list').update({ episodes_watched: next }).eq('id', m.id)
    onUpdated({ [m.id]: { episodes_watched: next } })
  }

  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors mb-2 px-1"
      >
        <span className="flex items-center gap-1.5">
          📚 Series / Sequel Parts
          {members.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-violet-500/20 text-violet-400 border border-violet-500/30">
              {members.length} part{members.length !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <span className="text-zinc-600">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="space-y-2">
          {/* Member list */}
          {members.map((m, i) => {
            const pct = m.total_chapters && m.total_chapters > 0
              ? Math.min(100, Math.round((m.current_chapter / m.total_chapters) * 100))
              : 0
            const epPct = m.has_anime && m.total_episodes && m.total_episodes > 0
              ? Math.min(100, Math.round((m.episodes_watched / m.total_episodes) * 100))
              : 0
            return (
              <div key={m.id} className="bg-zinc-800/60 rounded-xl p-3">
                <div className="flex items-start gap-2 mb-1.5">
                  <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5 font-mono">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 truncate">{m.title}</p>
                    {(m.total_chapters != null || m.current_chapter > 0) && (
                      <p className="text-[10px] text-zinc-500 mt-0.5 tabular-nums">
                        Ch. {m.current_chapter} / {m.total_chapters ?? '?'}
                        {m.total_chapters ? <span className="text-zinc-700 ml-1">{pct}%</span> : ''}
                        {m.series_primary && <span className="ml-2 text-violet-400 font-semibold">★ Primary</span>}
                      </p>
                    )}
                    {m.series_primary && !m.total_chapters && !m.current_chapter && (
                      <span className="text-[10px] text-violet-400 font-semibold">★ Primary</span>
                    )}
                    {m.has_anime && (m.total_episodes != null || m.episodes_watched > 0) && (
                      <p className="text-[10px] text-violet-300/70 mt-0.5 tabular-nums">
                        Ep. {m.episodes_watched} / {m.total_episodes ?? '?'}
                        {m.total_episodes ? <span className="text-zinc-700 ml-1">{epPct}%</span> : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {(m.total_chapters != null || m.current_chapter > 0) && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateMemberChapter(m, -1)} className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-xs transition-colors">−</button>
                        <span className="text-[10px] text-zinc-400 font-mono w-5 text-center">ch</span>
                        <button onClick={() => updateMemberChapter(m, 1)} className="w-5 h-5 rounded bg-zinc-700 hover:bg-zinc-600 flex items-center justify-center text-xs transition-colors">+</button>
                      </div>
                    )}
                    {m.has_anime && (m.total_episodes != null || m.episodes_watched > 0) && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => updateMemberEpisode(m, -1)} className="w-5 h-5 rounded bg-violet-900/50 hover:bg-violet-800/60 flex items-center justify-center text-xs transition-colors text-violet-300">−</button>
                        <span className="text-[10px] text-violet-400/60 font-mono w-5 text-center">ep</span>
                        <button onClick={() => updateMemberEpisode(m, 1)} className="w-5 h-5 rounded bg-violet-900/50 hover:bg-violet-800/60 flex items-center justify-center text-xs transition-colors text-violet-300">+</button>
                      </div>
                    )}
                  </div>
                </div>
                {m.total_chapters && m.total_chapters > 0 && (
                  <div className="h-1 bg-zinc-700 rounded-full overflow-hidden mb-1">
                    <div className="h-full bg-violet-500 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                )}
                {m.has_anime && m.total_episodes && m.total_episodes > 0 && (
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-violet-400/50 rounded-full" style={{ width: `${epPct}%` }} />
                  </div>
                )}
                <div className="flex gap-1.5">
                  {!m.series_primary && (
                    <button
                      onClick={() => setPrimary(m)}
                      disabled={savingId === m.id}
                      className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-400 hover:text-violet-300 hover:bg-zinc-600 transition-colors"
                    >
                      Set Primary
                    </button>
                  )}
                  <button
                    onClick={() => removeMember(m)}
                    disabled={savingId === m.id}
                    className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-400 hover:text-red-400 hover:bg-zinc-600 transition-colors ml-auto"
                  >
                    {savingId === m.id ? '…' : 'Remove'}
                  </button>
                </div>
              </div>
            )
          })}

          {/* Add part */}
          <div className="relative">
            <input
              value={addQuery}
              onChange={e => setAddQuery(e.target.value)}
              placeholder="Search to add another part…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-violet-500 placeholder:text-zinc-600"
            />
            {searchingJikan && addQuery.trim() && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="w-3 h-3 rounded-full border border-violet-500 border-t-transparent animate-spin" />
              </div>
            )}
            {jikanResults.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-xl max-h-56 overflow-y-auto">
                {jikanResults.slice(0, 10).map(j => {
                  const inLib = allManga.find(m => m.mal_id != null && m.mal_id === j.mal_id)
                  const alreadyGrouped = inLib && inLib.series_id === primary.series_id
                  return (
                    <button
                      key={j.mal_id ?? j.title}
                      onMouseDown={e => {
                        e.preventDefault()
                        if (alreadyGrouped || adding) return
                        if (inLib) addMember(inLib)
                        else addJikanMember(j)
                      }}
                      disabled={adding || !!alreadyGrouped}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-800 transition-colors border-b border-zinc-800 last:border-0 disabled:opacity-50"
                    >
                      {j.cover_url && <img src={j.cover_url} alt="" className="w-5 h-7 object-cover rounded shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-zinc-200 truncate">{j.title}</p>
                        <p className="text-[10px] text-zinc-500 tabular-nums">
                          {j.score ? `★${j.score}` : ''}
                          {j.total_chapters ? ` · ${j.total_chapters} ch` : ''}
                          {j.episodes ? ` · ${j.episodes} ep` : ''}
                        </p>
                      </div>
                      {alreadyGrouped
                        ? <span className="text-[10px] text-violet-400 shrink-0">In Group</span>
                        : inLib
                          ? <span className="text-[10px] text-emerald-400 shrink-0">In Library</span>
                          : <span className="text-[10px] text-zinc-600 shrink-0">Add →</span>
                      }
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {members.length === 0 && !addQuery && (
            <p className="text-[11px] text-zinc-600 px-1">
              Group sequel entries together. Progress and chapter counts combine across all parts.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Small merge button shown on related-work cards that are already in the user's list */
function RelationMergeButton({ keep, remove, onMerge }: {
  keep: Manga; remove: Manga; onMerge: (removedId: string) => void
}) {
  const [merging, setMerging] = useState(false)
  const [done, setDone] = useState(false)

  if (done) return <span className="text-[10px] text-emerald-500">✓ merged</span>

  const handleMerge = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setMerging(true)
    const updates: Record<string, unknown> = {
      current_chapter:  Math.max(keep.current_chapter, remove.current_chapter),
      cover_url:        keep.cover_url ?? remove.cover_url,
      total_chapters:   keep.total_chapters ?? remove.total_chapters,
      has_anime:        keep.has_anime || remove.has_anime,
      anime_mal_id:     keep.anime_mal_id ?? remove.anime_mal_id,
      anime_title:      keep.anime_title ?? remove.anime_title,
      user_rating:      keep.user_rating ?? remove.user_rating,
    }
    if (remove.notes?.trim()) {
      const base = keep.notes?.trim() ?? ''
      const extra = remove.notes.trim()
      if (!base.includes(extra)) updates.notes = base ? `${base}\n---\n${extra}` : extra
    }
    const [, del] = await Promise.all([
      supabase.from('manga_list').update(updates).eq('id', keep.id),
      supabase.from('manga_list').delete().eq('id', remove.id),
    ])
    setMerging(false)
    if (!del.error) { setDone(true); onMerge(remove.id) }
  }

  return (
    <button
      onClick={handleMerge}
      disabled={merging}
      title={`Merge "${remove.title}" into this entry`}
      className="text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors disabled:opacity-40"
      style={{ backgroundColor: 'rgba(43,230,220,0.12)', color: 'var(--cyan)' }}
    >
      {merging ? '…' : '⟷'}
    </button>
  )
}

/** Manga detail modal */
function DetailModal({ manga, allManga, onClose, onStatusChange, onMerge, onMergeMultiple, onNavigate, onChapterReset, onEpisodesReset, onChapterRestored, onEpisodesRestored, onTotalChaptersUpdated, onSeriesUpdated, onSeriesEntryAdded }: {
  manga: Manga
  allManga: Manga[]
  onClose: () => void
  onStatusChange: (id: string, status: MangaStatus) => void
  onMerge: (removedId: string) => void
  onMergeMultiple: (removeIds: string[]) => Promise<void>
  onNavigate: (m: Manga) => void
  onChapterReset: (chapterAtStart: number) => void
  onEpisodesReset: (episodesAtStart: number) => void
  onChapterRestored: (restored: number) => void
  onEpisodesRestored: (restored: number) => void
  onTotalChaptersUpdated?: (n: number | null | undefined) => void
  onSeriesUpdated: (patches: Record<string, Partial<Manga>>) => void
  onSeriesEntryAdded?: (entry: Manga) => void
}) {
  const [alManga, setAlManga] = useState<AniListMangaData | null>(null)
  const [alAnime, setAlAnime] = useState<AniListAnimeData | null>(null)
  const [suggestedAnime, setSuggestedAnime] = useState<{ idMal: number; title: string } | null>(null)

  // Dismiss flags persisted in localStorage so banners don't reappear on re-open
  const dupKey   = `yomu_dismissed_dup_${manga.id}`
  const animeKey = `yomu_dismissed_anime_${manga.mal_id ?? manga.id}`
  const [animeSuggestionDismissed, setAnimeSuggestionDismissed] = useState(
    () => { try { return !!localStorage.getItem(animeKey) } catch { return false } }
  )
  const [animeSuggestionConfirmed, setAnimeSuggestionConfirmed] = useState(false)
  // duplicateCandidate is derived via useMemo below (not state) to avoid setState-in-effect
  const [duplicateDismissed, setDuplicateDismissed] = useState(
    () => { try { return !!localStorage.getItem(dupKey) } catch { return false } }
  )
  const [merging, setMerging] = useState(false)
  const [muData, setMuData] = useState<MUSeriesData | null>(null)
  const [annAnime, setAnnAnime] = useState<ANNRelatedWork[]>([])
  // Merge panel
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
  const [mergingMulti, setMergingMulti] = useState(false)
  // Series Map
  const [showSeriesMap, setShowSeriesMap] = useState(false)
  const [jikanRelations, setJikanRelations] = useState<SeriesRelation[]>([])
  const [relationsLoaded, setRelationsLoaded] = useState(false)
  const [showDeepSearch, setShowDeepSearch] = useState(false)
  const [showUrlImport, setShowUrlImport] = useState(false)
  // OMDB / IMDb rating
  const [imdbRating, setImdbRating] = useState<string | null>(null)
  const [imdbId, setImdbId] = useState<string | null>(null)
  const [omdbKeyInput, setOmdbKeyInput] = useState('')
  const [showOmdbInput, setShowOmdbInput] = useState(false)
  // Jikan recommendations
  const [jikanRecs, setJikanRecs] = useState<JikanSearchResult[]>([])
  const [jikanRecAdded, setJikanRecAdded] = useState<Set<number>>(new Set())
  const [jikanRecAdding, setJikanRecAdding] = useState<number | null>(null)
  // Episode list
  const [episodes, setEpisodes] = useState<JikanEpisode[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(false)
  const [episodesExpanded, setEpisodesExpanded] = useState(false)
  const [episodeHasNext, setEpisodeHasNext] = useState(false)
  const [episodePage, setEpisodePage] = useState(1)
  const [episodeSynopses, setEpisodeSynopses] = useState<Record<number, string | null>>({})
  const [episodeSynopsisLoading, setEpisodeSynopsisLoading] = useState<number | null>(null)
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set())
  // Chapter listing (MangaDex)
  const [mdxChapters, setMdxChapters] = useState<MangaDexChapter[]>([])
  const [mdxChaptersLoading, setMdxChaptersLoading] = useState(false)
  const [mdxChaptersExpanded, setMdxChaptersExpanded] = useState(false)
  const [mdxChaptersTotal, setMdxChaptersTotal] = useState(0)

  useEffect(() => {
    if (manga.mal_id) {
      fetch(`/api/anilist?mal_id=${manga.mal_id}&type=MANGA`)
        .then(r => r.json()).then(j => {
          if (j.data) {
            setAlManga(j.data)
            // Check if AniList knows of an anime adaptation we haven't recorded
            if (!manga.has_anime) {
              const adaptRel = (j.data as AniListMangaData).relations.find(
                r => r.relationType === 'ADAPTATION' && r.node.type === 'ANIME' && r.node.idMal
              )
              if (adaptRel) {
                setSuggestedAnime({ idMal: adaptRel.node.idMal!, title: adaptRel.node.title.romaji })
              }
            }
          }
        })
    }
    if (manga.anime_mal_id) {
      fetch(`/api/anilist?mal_id=${manga.anime_mal_id}&type=ANIME`)
        .then(r => r.json()).then(j => { if (j.data) setAlAnime(j.data) })
    }
    // MangaUpdates: fetch adaptation depth + community recommendations (non-blocking)
    if (manga.title) {
      fetch(`/api/mangaupdates?title=${encodeURIComponent(manga.title)}`)
        .then(r => r.json()).then(j => { if (j.data) setMuData(j.data) })
        .catch(() => {/* non-critical */})
    }
    // ANN: fallback anime adaptation signal when AniList hasn't updated yet (non-blocking)
    if (manga.title && !manga.has_anime) {
      fetch(`/api/ann?title=${encodeURIComponent(manga.title)}`)
        .then(r => r.json())
        .then(j => {
          if (j.related_anime?.length) {
            setAnnAnime(j.related_anime)
            // Set suggestion now if AniList hasn't found one yet
            setSuggestedAnime(prev =>
              prev ? prev : { idMal: 0, title: j.related_anime[0].title }
            )
          }
        })
        .catch(() => {/* non-critical */})
    }
    // Jikan recommendations (non-blocking)
    const recMalId = (manga.content_type === 'anime' || manga.content_type === 'movie') ? manga.mal_id : manga.mal_id
    const recType: 'anime' | 'manga' = (manga.content_type === 'anime' || manga.content_type === 'movie') ? 'anime' : 'manga'
    if (recMalId) {
      getJikanRecommendations(recMalId, recType).then(recs => setJikanRecs(recs)).catch(() => {})
    }
    // OMDB / IMDb rating (non-blocking, requires user-stored API key)
    setImdbRating(null)
    setImdbId(null)
    const omdbKey = (() => { try { return localStorage.getItem('yomu_omdb_key') } catch { return null } })()
    if (omdbKey && manga.title) {
      const q = encodeURIComponent(manga.title)
      fetch(`https://www.omdbapi.com/?t=${q}&apikey=${omdbKey}&type=${manga.content_type === 'movie' ? 'movie' : 'series'}`)
        .then(r => r.json())
        .then(j => {
          if (j.Response === 'True') {
            setImdbRating(j.imdbRating ?? null)
            setImdbId(j.imdbID ?? null)
          }
        })
        .catch(() => {})
    }
  }, [manga.mal_id, manga.anime_mal_id, manga.has_anime, manga.title, manga.content_type])

  // Fetch Jikan relations for Related Anime section + Series Map button
  useEffect(() => {
    if (!manga.mal_id) return
    setRelationsLoaded(false)
    getMangaAllRelations(manga.mal_id).then(rels => {
      setJikanRelations(rels)
      setRelationsLoaded(true)
    })
  }, [manga.mal_id])

  const relatedAnime = jikanRelations.filter(r => r.type === 'anime')
  const hasSeriesRelations = jikanRelations.length > 0

  const [addingRelId, setAddingRelId] = useState<string | null>(null)

  const addRelationEntry = async (
    malId: number | null,
    title: string,
    isAnime: boolean,
    coverUrl: string | null,
    toSeries: boolean,
  ) => {
    const key = `${malId ?? title}-${toSeries ? 'series' : 'lib'}`
    setAddingRelId(key)
    try {
      let seriesId = manga.series_id ?? null
      if (toSeries && !seriesId) {
        seriesId = crypto.randomUUID()
        await supabase.from('manga_list').update({ series_id: seriesId, series_primary: true }).eq('id', manga.id)
        onSeriesUpdated({ [manga.id]: { series_id: seriesId, series_primary: true } })
      }
      // Fetch totals from Jikan so the series combined count updates immediately
      let totalChapters: number | null = null
      let totalEpisodes: number | null = null
      let fetchedCover = coverUrl
      if (malId) {
        const detail = await getSeriesEntryDetail(malId, isAnime ? 'anime' : 'manga')
        if (detail) {
          totalChapters = detail.chapters ?? null
          totalEpisodes = detail.episodes ?? null
          fetchedCover = detail.cover_url ?? coverUrl
        }
      }
      const row: Record<string, unknown> = {
        title,
        mal_id: malId,
        cover_url: fetchedCover,
        current_chapter: 0,
        episodes_watched: 0,
        status: isAnime ? 'unwatched' : 'plan_to_read',
        has_anime: isAnime,
        content_type: isAnime ? 'anime' : 'manga',
        genres: [],
        authors: [],
        total_chapters: totalChapters,
        total_episodes: totalEpisodes,
        ...(toSeries && seriesId ? { series_id: seriesId, series_primary: false } : {}),
      }
      const { data } = await supabase.from('manga_list').insert(row).select().single()
      if (data) onSeriesEntryAdded?.(data as Manga)
    } finally {
      setAddingRelId(null)
    }
  }

  // Duplicate detection: derived via useMemo to avoid setState-in-effect
  const duplicateCandidate = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const tokens = (s: string) => new Set(normalize(s).split(/\s+/).filter(Boolean))
    const myTokens = tokens(manga.title)
    return allManga.find(m => {
      if (m.id === manga.id) return false
      // Skip entries already grouped in the same series — they are intentionally separate
      if (manga.series_id && m.series_id === manga.series_id) return false
      const theirTokens = tokens(m.title)
      const overlap = [...myTokens].filter(t => theirTokens.has(t)).length
      const jaccard = overlap / (myTokens.size + theirTokens.size - overlap)
      return jaccard >= 0.7
    }) ?? null
  }, [manga.id, manga.title, manga.series_id, allManga])

  const confirmAnimeSuggestion = async () => {
    if (!suggestedAnime) return
    await supabase.from('manga_list').update({
      has_anime: true,
      anime_mal_id: suggestedAnime.idMal || null,  // 0 sentinel → null in DB
      anime_title: suggestedAnime.title,
    }).eq('id', manga.id)
    setAnimeSuggestionConfirmed(true)
  }

  const mergeDuplicate = async () => {
    if (!duplicateCandidate) return
    setMerging(true)
    await onMergeMultiple([duplicateCandidate.id])
    setMerging(false)
    onClose()
  }

  const addJikanRec = async (rec: JikanSearchResult) => {
    if (!rec.mal_id) return
    setJikanRecAdding(rec.mal_id)
    const isAnimeRec = rec.media_type === 'anime' || rec.media_type === 'movie'
    const { error } = await supabase.from('manga_list').insert({
      mal_id: isAnimeRec ? null : rec.mal_id,
      anime_mal_id: isAnimeRec ? rec.mal_id : null,
      title: rec.title,
      current_chapter: 0,
      episodes_watched: 0,
      status: isAnimeRec ? 'unwatched' : 'plan_to_read',
      content_type: rec.media_type ?? (isAnimeRec ? 'anime' : 'manga'),
      cover_url: rec.cover_url ?? null,
      total_chapters: rec.total_chapters ?? null,
      total_episodes: rec.episodes ?? null,
      has_anime: isAnimeRec,
      genres: rec.genres ?? [],
      authors: rec.authors ?? [],
    })
    if (!error) setJikanRecAdded(prev => new Set([...prev, rec.mal_id!]))
    setJikanRecAdding(null)
  }

  const loadEpisodes = async (page = 1) => {
    const malId = manga.content_type === 'anime' || manga.content_type === 'movie'
      ? manga.mal_id
      : manga.anime_mal_id
    if (!malId) return
    setEpisodesLoading(true)
    const { episodes: newEps, hasNext } = await getJikanEpisodes(malId, page)
    setEpisodes(prev => page === 1 ? newEps : [...prev, ...newEps])
    setEpisodeHasNext(hasNext)
    setEpisodePage(page)
    setEpisodesLoading(false)
  }

  const toggleEpisodeSynopsis = async (ep: JikanEpisode) => {
    const malId = manga.content_type === 'anime' || manga.content_type === 'movie'
      ? manga.mal_id
      : manga.anime_mal_id
    if (!malId) return
    if (expandedEpisodes.has(ep.mal_id)) {
      setExpandedEpisodes(prev => { const s = new Set(prev); s.delete(ep.mal_id); return s })
      return
    }
    setExpandedEpisodes(prev => new Set([...prev, ep.mal_id]))
    if (episodeSynopses[ep.mal_id] !== undefined) return
    setEpisodeSynopsisLoading(ep.mal_id)
    const synopsis = await getJikanEpisodeSynopsis(malId, ep.mal_id)
    setEpisodeSynopses(prev => ({ ...prev, [ep.mal_id]: synopsis }))
    setEpisodeSynopsisLoading(null)
  }

  const STATUS_LABELS: Record<MangaStatus, string> = {
    reading: 'Reading', completed: 'Completed', on_hold: 'On Hold',
    dropped: 'Dropped', plan_to_read: 'Plan To Read', watching: 'Watching', unwatched: 'Unwatched',
  }
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-l-2xl lg:rounded-t-none w-full lg:w-[380px] max-h-[90vh] lg:max-h-none overflow-y-auto"
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
              {imdbRating && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-yellow-400 text-xs">★</span>
                  <span className="text-xs font-semibold text-yellow-400">{imdbRating}</span>
                  <span className="text-xs text-zinc-500">IMDb</span>
                  {imdbId && (
                    <a href={`https://www.imdb.com/title/${imdbId}/`} target="_blank" rel="noopener noreferrer"
                      className="text-[10px] text-zinc-600 hover:text-zinc-400 ml-0.5">↗</a>
                  )}
                  <button
                    onClick={() => { const cur = (() => { try { return localStorage.getItem('yomu_omdb_key') ?? '' } catch { return '' } })(); setOmdbKeyInput(cur); setShowOmdbInput(v => !v) }}
                    className="text-[9px] text-zinc-700 hover:text-zinc-500 ml-1"
                    title="Change OMDB API key"
                  >⚙</button>
                </div>
              )}
              {!imdbRating && (() => {
                const hasKey = (() => { try { return !!localStorage.getItem('yomu_omdb_key') } catch { return false } })()
                if (hasKey) return null
                return (
                  <button
                    onClick={() => { setOmdbKeyInput(''); setShowOmdbInput(true) }}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 mt-0.5 block"
                    title="Add OMDB API key for IMDb ratings"
                  >
                    + IMDb rating
                  </button>
                )
              })()}
              {showOmdbInput && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <input
                    autoFocus
                    value={omdbKeyInput}
                    onChange={e => setOmdbKeyInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Escape') { setShowOmdbInput(false); return }
                      if (e.key === 'Enter') {
                        const k = omdbKeyInput.trim()
                        try { if (k) localStorage.setItem('yomu_omdb_key', k); else localStorage.removeItem('yomu_omdb_key') } catch {}
                        setShowOmdbInput(false)
                        if (k) {
                          const q = encodeURIComponent(manga.title)
                          fetch(`https://www.omdbapi.com/?t=${q}&apikey=${k}&type=${manga.content_type === 'movie' ? 'movie' : 'series'}`)
                            .then(r => r.json()).then(j => { if (j.Response === 'True') { setImdbRating(j.imdbRating ?? null); setImdbId(j.imdbID ?? null) } }).catch(() => {})
                        }
                      }
                    }}
                    placeholder="OMDB API key (omdbapi.com)"
                    className="flex-1 text-[10px] bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-zinc-300 outline-none focus:border-zinc-500"
                  />
                  <button
                    onClick={() => {
                      const k = omdbKeyInput.trim()
                      try { if (k) localStorage.setItem('yomu_omdb_key', k); else localStorage.removeItem('yomu_omdb_key') } catch {}
                      setShowOmdbInput(false)
                      if (k) {
                        const q = encodeURIComponent(manga.title)
                        fetch(`https://www.omdbapi.com/?t=${q}&apikey=${k}&type=${manga.content_type === 'movie' ? 'movie' : 'series'}`)
                          .then(r => r.json()).then(j => { if (j.Response === 'True') { setImdbRating(j.imdbRating ?? null); setImdbId(j.imdbID ?? null) } }).catch(() => {})
                      }
                    }}
                    className="text-[10px] px-1.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded"
                  >Save</button>
                  <button onClick={() => setShowOmdbInput(false)} className="text-[10px] text-zinc-600 hover:text-zinc-400">✕</button>
                </div>
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
              <EditableNumber
                value={manga.total_chapters ?? 0}
                label="Total chapters"
                className="text-sm w-full"
                onSave={async (n) => {
                  await supabase.from('manga_list').update({ total_chapters: n }).eq('id', manga.id)
                  onTotalChaptersUpdated?.(n)
                }}
              />
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
          {/* Deep Search + URL Import buttons */}
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setShowDeepSearch(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              <span>🔍</span>
              <span>Deep Search</span>
            </button>
            <button
              onClick={() => setShowUrlImport(true)}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              <span>🔗</span>
              <span>Import From URL</span>
            </button>
          </div>

          {/* Series Map button — only shown when Jikan has relations */}
          {manga.mal_id && (relationsLoaded ? hasSeriesRelations : true) && (
            <button
              onClick={() => setShowSeriesMap(true)}
              className="w-full mb-4 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              <span>⬡</span>
              <span>Series Map</span>
              {relationsLoaded && jikanRelations.length > 0 && (
                <span className="text-zinc-500">· {jikanRelations.length} Related</span>
              )}
              {!relationsLoaded && <span className="text-zinc-600">Loading…</span>}
            </button>
          )}

          {manga.notes && (
            <div className="bg-zinc-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-zinc-400 leading-relaxed">{manga.notes}</p>
            </div>
          )}

          {/* MangaUpdates metadata badges */}
          {muData && (muData.release_frequency !== 'unknown' || muData.scanlation_group) && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {muData.release_frequency && muData.release_frequency !== 'unknown' && (
                <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full border ${
                  muData.release_frequency === 'weekly'   ? 'bg-emerald-900/30 text-emerald-400 border-emerald-800/50' :
                  muData.release_frequency === 'biweekly' ? 'bg-cyan-900/30 text-cyan-400 border-cyan-800/50' :
                  muData.release_frequency === 'monthly'  ? 'bg-blue-900/30 text-blue-400 border-blue-800/50' :
                  muData.release_frequency === 'completed'? 'bg-zinc-800 text-zinc-400 border-zinc-700' :
                  'bg-zinc-800 text-zinc-500 border-zinc-700'
                }`}>
                  {muData.release_frequency === 'weekly'    ? '🟢 Weekly' :
                   muData.release_frequency === 'biweekly'  ? '🔵 Biweekly' :
                   muData.release_frequency === 'monthly'   ? '📅 Monthly' :
                   muData.release_frequency === 'completed' ? '✓ Complete' :
                   '⏸ Irregular'}
                </span>
              )}
              {muData.scanlation_group && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                  👥 {muData.scanlation_group}
                </span>
              )}
            </div>
          )}

          {/* Duplicate detection banner */}
          {duplicateCandidate && !duplicateDismissed && (
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-3 mb-4">
              <p className="text-xs font-medium text-amber-300 mb-1">Possible Duplicate Detected</p>
              <p className="text-xs text-zinc-400 mb-2">
                &ldquo;{duplicateCandidate.title}&rdquo; Looks Very Similar To This Entry. Merge Them?
              </p>
              <div className="flex gap-2">
                <button onClick={mergeDuplicate} disabled={merging}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                  {merging ? 'Merging…' : 'Merge (Keep Best Progress)'}
                </button>
                <button onClick={() => { try { localStorage.setItem(dupKey, '1') } catch {} setDuplicateDismissed(true) }}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors">
                  Not A Duplicate
                </button>
              </div>
            </div>
          )}

          {/* Anime adaptation suggestion banner — enriched with MangaUpdates depth */}
          {suggestedAnime && !animeSuggestionDismissed && !animeSuggestionConfirmed && (
            <div className="bg-violet-900/20 border border-violet-500/30 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-violet-300">Anime adaptation found</p>
                {/* ANN attribution — required when ANN is the source */}
                {annAnime.length > 0 && !alManga?.relations.some(r => r.relationType === 'ADAPTATION') && (
                  <a href="https://www.animenewsnetwork.com" target="_blank" rel="noopener noreferrer"
                    className="text-[9px] text-zinc-600 hover:text-zinc-400 transition-colors">via ANN ↗</a>
                )}
              </div>
              <p className="text-xs text-zinc-400 mb-1">
                &ldquo;{suggestedAnime.title}&rdquo; — is this the anime for this manga?
              </p>
              {muData?.anime.start && (
                <div className="flex items-start gap-1.5 mb-2">
                  <span className="text-violet-500 text-[10px] mt-0.5">◈</span>
                  <p className="text-[10px] text-violet-400 leading-relaxed">
                    <span className="font-semibold">Covers:</span> {muData.anime.start}
                    {muData.anime.end && muData.anime.end !== muData.anime.start && (
                      <span className="text-zinc-500"> → {muData.anime.end}</span>
                    )}
                  </p>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={confirmAnimeSuggestion}
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors">
                  Yes, link it
                </button>
                <button onClick={() => { try { localStorage.setItem(animeKey, '1') } catch {} setAnimeSuggestionDismissed(true) }}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors">
                  Not mine
                </button>
              </div>
            </div>
          )}
          {animeSuggestionConfirmed && (
            <div className="flex items-center gap-2 bg-violet-900/20 border border-violet-500/30 rounded-xl px-3 py-2.5 mb-4">
              <span className="text-violet-400 text-sm">✓</span>
              <span className="text-xs text-violet-300">Anime adaptation linked — reload to see full info</span>
            </div>
          )}

          {/* AniList: airing countdown for adapted anime */}
          {alAnime?.nextAiringEpisode && (
            <div className="flex items-center gap-2 bg-violet-900/20 border border-violet-500/30 rounded-xl px-3 py-2.5 mb-4">
              <Tv size={13} strokeWidth={1.5} className="text-violet-400 shrink-0" />
              <div>
                <span className="text-xs font-medium text-violet-300">
                  Ep. {alAnime.nextAiringEpisode.episode} Airing In {formatCountdown(alAnime.nextAiringEpisode.timeUntilAiring)}
                </span>
                <span className="text-xs text-zinc-500 ml-2">
                  {new Date(alAnime.nextAiringEpisode.airingAt * 1000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                </span>
              </div>
            </div>
          )}

          {/* Streaming availability */}
          {alAnime && (alAnime.streamingLinks ?? []).length > 0 && (() => {
            const PLATFORM_STYLE: Record<string, { bg: string; text: string; label: string }> = {
              'Crunchyroll':        { bg: 'bg-orange-900/30', text: 'text-orange-400',  label: 'Crunchyroll' },
              'Netflix':            { bg: 'bg-red-900/30',    text: 'text-red-400',     label: 'Netflix' },
              'Amazon Prime Video': { bg: 'bg-sky-900/30',    text: 'text-sky-400',     label: 'Prime Video' },
              'Disney Plus':        { bg: 'bg-blue-900/30',   text: 'text-blue-400',    label: 'Disney+' },
              'Funimation':         { bg: 'bg-purple-900/30', text: 'text-purple-400',  label: 'Funimation' },
              'HIDIVE':             { bg: 'bg-teal-900/30',   text: 'text-teal-400',    label: 'HIDIVE' },
              'Hulu':               { bg: 'bg-green-900/30',  text: 'text-green-400',   label: 'Hulu' },
              'Apple TV':           { bg: 'bg-zinc-800',      text: 'text-zinc-300',    label: 'Apple TV+' },
              'HBO Max':            { bg: 'bg-purple-900/30', text: 'text-purple-300',  label: 'Max' },
            }
            // Group by site so we can show alternate regions under the same platform
            const grouped = (alAnime.streamingLinks ?? []).reduce<Record<string, { url: string; language: string | null }[]>>(
              (acc, l) => { (acc[l.site] ??= []).push({ url: l.url, language: l.language }); return acc }, {}
            )
            return (
              <div className="mb-4">
                <p className="text-xs font-medium text-zinc-500 mb-2">Watch the anime on</p>
                <div className="flex flex-col gap-2">
                  {Object.entries(grouped).map(([site, links]) => {
                    const style = PLATFORM_STYLE[site] ?? { bg: 'bg-zinc-800', text: 'text-zinc-300', label: site }
                    const primary = links.find(l => !l.language) ?? links[0]
                    const alternates = links.filter(l => l !== primary && l.language)
                    return (
                      <a key={site} href={primary.url} target="_blank" rel="noopener noreferrer"
                        className={`flex items-center gap-2.5 ${style.bg} border border-white/5 rounded-xl px-3 py-2.5 group hover:brightness-110 transition-all`}>
                        <span className={`text-sm font-semibold ${style.text} flex-1`}>{style.label}</span>
                        {alternates.length > 0 && (
                          <span className="text-[10px] text-zinc-500">
                            also: {alternates.map(l => l.language).join(', ')}
                          </span>
                        )}
                        <span className="text-zinc-600 text-xs group-hover:text-zinc-400 transition-colors">↗</span>
                      </a>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* AniList: ranked tags */}
          {alManga && alManga.tags.filter(t => t.rank >= 60).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-zinc-500 mb-2">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {alManga.tags.filter(t => t.rank >= 60).slice(0, 8).map(tag => (
                  <span key={tag.name}
                    className="flex items-center gap-1 px-2 py-0.5 bg-zinc-800 rounded-full text-xs text-zinc-400"
                    title={`Relevance: ${tag.rank}%`}>
                    {tag.name}
                    <span className="text-zinc-600 text-[10px]">{tag.rank}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* AniList: relations graph */}
          {alManga && alManga.relations.filter(r => RELATION_LABELS[r.relationType]).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-zinc-500 mb-2">Related works</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {alManga.relations
                  .filter(r => RELATION_LABELS[r.relationType])
                  .slice(0, 8)
                  .map((rel, i) => {
                    const malUrl = rel.node.idMal
                      ? `https://myanimelist.net/${rel.node.type === 'ANIME' ? 'anime' : 'manga'}/${rel.node.idMal}`
                      : null
                    const searchUrl = `/search?q=${encodeURIComponent(rel.node.title.romaji)}`
                    // Check if this related work is already in the user's list
                    const inList = allManga.find(m =>
                      (rel.node.idMal && m.mal_id === rel.node.idMal) ||
                      m.title.toLowerCase() === rel.node.title.romaji.toLowerCase()
                    )
                    const labelColor =
                      rel.relationType === 'SEQUEL'     ? 'text-emerald-400' :
                      rel.relationType === 'PREQUEL'    ? 'text-blue-400' :
                      rel.relationType === 'ADAPTATION' ? 'text-violet-400' :
                      'text-zinc-400'

                    return (
                      <div key={i} className="shrink-0 w-24 flex flex-col gap-1">
                        {/* Card — opens internally */}
                        <button
                          onClick={() => {
                            if (inList) { onNavigate(inList) }
                            else { window.location.href = searchUrl }
                          }}
                          className="w-24 group text-left"
                        >
                          <div className="relative w-24 h-32 rounded-xl overflow-hidden bg-zinc-800 mb-1 group-hover:opacity-80 transition-opacity">
                            {rel.node.coverImage?.medium && (
                              <Image src={rel.node.coverImage.medium} alt={rel.node.title.romaji}
                                fill className="object-cover" unoptimized />
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
                              <span className={`text-[10px] font-medium ${labelColor}`}>
                                {RELATION_LABELS[rel.relationType]}
                              </span>
                            </div>
                            {inList && (
                              <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400"
                                title="In your list" />
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">{rel.node.title.romaji}</p>
                        </button>

                        {/* Action row */}
                        <div className="flex items-center gap-1 flex-wrap">
                          {/* Merge button — only for manga type entries already in list */}
                          {inList && rel.node.type === 'MANGA' && (
                            <RelationMergeButton
                              keep={manga}
                              remove={inList}
                              onMerge={onMerge}
                            />
                          )}
                          {/* Add buttons — only when NOT in library */}
                          {!inList && (() => {
                            const isAnime = rel.node.type === 'ANIME'
                            const relMalId = rel.node.idMal ?? null
                            const relTitle = rel.node.title.romaji
                            const relCover = rel.node.coverImage?.medium ?? null
                            const libKey = `${relMalId ?? relTitle}-lib`
                            const serKey = `${relMalId ?? relTitle}-series`
                            return (
                              <>
                                <button
                                  onClick={e => { e.stopPropagation(); addRelationEntry(relMalId, relTitle, isAnime, relCover, false) }}
                                  disabled={addingRelId === libKey}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-600 transition-colors"
                                  title="Add to library"
                                >
                                  {addingRelId === libKey ? '…' : '+ Lib'}
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); addRelationEntry(relMalId, relTitle, isAnime, relCover, true) }}
                                  disabled={addingRelId === serKey}
                                  className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/40 transition-colors"
                                  title="Add to library & group with this series"
                                >
                                  {addingRelId === serKey ? '…' : '+ Series'}
                                </button>
                              </>
                            )
                          })()}
                          {/* MAL external link */}
                          {malUrl && (
                            <a href={malUrl} target="_blank" rel="noopener noreferrer"
                              title="View on MyAnimeList"
                              className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors ml-auto"
                              onClick={e => e.stopPropagation()}
                            >↗</a>
                          )}
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Related Anime — all anime-type Jikan relations for this manga */}
          {relatedAnime.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-zinc-500 mb-2">Related Anime</p>
              <div className="space-y-1.5">
                {relatedAnime.map((rel, i) => {
                  const MAL_ANIME_LABELS: Record<string, { label: string; color: string }> = {
                    'Adaptation':          { label: 'Adaptation',    color: 'text-violet-400' },
                    'Sequel':              { label: 'Sequel',        color: 'text-emerald-400' },
                    'Prequel':             { label: 'Prequel',       color: 'text-blue-400' },
                    'Side story':          { label: 'Side Story',    color: 'text-orange-400' },
                    'Spin-off':            { label: 'Spin-Off',      color: 'text-pink-400' },
                    'Alternative version': { label: 'Alt. Version',  color: 'text-zinc-400' },
                    'Summary':             { label: 'Summary',       color: 'text-zinc-500' },
                    'Other':               { label: 'Other',         color: 'text-zinc-500' },
                  }
                  const meta = MAL_ANIME_LABELS[rel.relation] ?? { label: rel.relation, color: 'text-zinc-400' }
                  const inLib = allManga.find(m => m.mal_id != null && m.mal_id === rel.mal_id)
                  const libKey = `${rel.mal_id ?? rel.name}-lib`
                  const serKey = `${rel.mal_id ?? rel.name}-series`
                  return (
                    <div key={i} className="flex items-center gap-2.5 bg-zinc-800 rounded-xl px-3 py-2">
                      <span className="text-lg shrink-0">📺</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{rel.name}</p>
                        <p className={`text-[10px] ${meta.color}`}>{meta.label}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {inLib ? (
                          <span className="text-[10px] text-emerald-400">✓ In Library</span>
                        ) : (
                          <>
                            <button
                              onClick={() => addRelationEntry(rel.mal_id, rel.name, true, null, false)}
                              disabled={addingRelId === libKey}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-600 transition-colors"
                              title="Add to library"
                            >
                              {addingRelId === libKey ? '…' : '+ Lib'}
                            </button>
                            <button
                              onClick={() => addRelationEntry(rel.mal_id, rel.name, true, null, true)}
                              disabled={addingRelId === serKey}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/40 transition-colors"
                              title="Add to library & group with this series"
                            >
                              {addingRelId === serKey ? '…' : '+ Series'}
                            </button>
                          </>
                        )}
                        <a href={`https://myanimelist.net/anime/${rel.mal_id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="text-zinc-600 text-xs hover:text-zinc-400 transition-colors ml-1"
                        >↗</a>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* AniList: community recommendations */}
          {alManga && alManga.recommendations.filter(r => r.rating > 0 && r.mediaRecommendation?.idMal).length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-zinc-500 mb-2">Community also likes</p>
              <div className="space-y-1.5">
                {alManga.recommendations.filter(r => r.rating > 0 && r.mediaRecommendation?.idMal).slice(0, 4).map((rec, i) => {
                  const m = rec.mediaRecommendation!
                  const href = `https://myanimelist.net/${m.type === 'ANIME' ? 'anime' : 'manga'}/${m.idMal}`
                  return (
                  <a key={i} href={href} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 bg-zinc-800 rounded-xl px-3 py-2 hover:opacity-80 transition-opacity"
                    style={{ textDecoration: 'none' }}>
                    {m.coverImage?.medium && (
                      <Image src={m.coverImage.medium} alt={m.title.romaji}
                        width={28} height={36} className="w-7 h-9 object-cover rounded shrink-0" unoptimized />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{m.title.romaji}</p>
                      <p className="text-xs text-zinc-600">{m.type?.toLowerCase()}</p>
                    </div>
                    <span className="text-xs text-zinc-500 shrink-0">👍 {rec.rating}</span>
                  </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Similar titles from your list */}
          {(() => {
            if (!manga.genres?.length) return null
            const myGenres = new Set(manga.genres)
            const similar = allManga
              .filter(m => m.id !== manga.id && m.genres?.length)
              .map(m => {
                const overlap = m.genres.filter(g => myGenres.has(g)).length
                const score = overlap / Math.max(myGenres.size, m.genres.length)
                return { m, score }
              })
              .filter(({ score }) => score > 0)
              .sort((a, b) => b.score - a.score)
              .slice(0, 4)
            if (!similar.length) return null
            return (
              <div className="mb-4">
                <p className="text-xs font-medium text-zinc-500 mb-2">Similar in your list</p>
                <div className="space-y-1.5">
                  {similar.map(({ m: sm, score }) => (
                    <button key={sm.id} onClick={() => onNavigate(sm)}
                      className="w-full flex items-center gap-2.5 bg-zinc-800 rounded-xl px-3 py-2 hover:bg-zinc-700 transition-colors text-left">
                      {sm.cover_url && <img src={sm.cover_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{sm.title}</p>
                        <p className="text-xs text-zinc-600">
                          {sm.genres.filter((g: string) => myGenres.has(g)).slice(0, 2).join(', ')}
                        </p>
                      </div>
                      <span className="text-xs text-violet-400 shrink-0">{Math.round(score * 100)}%</span>
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Jikan recommendations */}
          {jikanRecs.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-zinc-500 mb-2">MAL users also liked</p>
              <div className="space-y-1.5">
                {jikanRecs.map(rec => (
                  <div key={rec.mal_id} className="flex items-center gap-2.5 bg-zinc-800 rounded-xl px-3 py-2">
                    {rec.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={rec.cover_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{rec.title}</p>
                      <p className="text-[10px] text-zinc-600 capitalize">{rec.media_type ?? 'unknown'}</p>
                    </div>
                    <button
                      onClick={() => addJikanRec(rec)}
                      disabled={jikanRecAdding === rec.mal_id || (rec.mal_id !== null && jikanRecAdded.has(rec.mal_id))}
                      className={`shrink-0 text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                        rec.mal_id !== null && jikanRecAdded.has(rec.mal_id)
                          ? 'bg-emerald-600/20 text-emerald-400'
                          : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300 disabled:opacity-40'
                      }`}
                    >
                      {rec.mal_id !== null && jikanRecAdded.has(rec.mal_id) ? '✓' : jikanRecAdding === rec.mal_id ? '…' : '+ Add'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* MangaUpdates community recommendations */}
          {muData && muData.recommendations.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-zinc-500 mb-2">
                MangaUpdates recommends
                {muData.rating && <span className="text-zinc-600 ml-1 font-mono">· {muData.rating.toFixed(1)}/10</span>}
              </p>
              <div className="space-y-1.5">
                {muData.recommendations.slice(0, 4).map(rec => (
                  <a key={rec.series_id} href={rec.series_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2.5 bg-zinc-800 rounded-xl px-3 py-2 hover:bg-zinc-700 transition-colors">
                    {rec.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={rec.cover_url} alt="" referrerPolicy="no-referrer"
                        className="w-7 h-9 object-cover rounded shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{rec.series_name}</p>
                      <p className="text-[10px] text-zinc-600">MangaUpdates</p>
                    </div>
                    <span className="text-zinc-600 text-xs shrink-0">↗</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          <RereadSection
            mangaId={manga.id}
            currentChapter={manga.current_chapter}
            onStarted={onChapterReset}
            onCompleted={onChapterRestored}
          />

          {manga.has_anime && (
            <RewatchSection
              mangaId={manga.id}
              animeTitle={manga.anime_title ?? null}
              episodesWatched={manga.episodes_watched}
              onStarted={onEpisodesReset}
              onCompleted={onEpisodesRestored}
            />
          )}

          {/* Auto-tracked watch time summary */}
          {manga.auto_tracked && (
            <div className="mb-3 bg-green-950/40 border border-green-800/30 rounded-lg px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-green-400 flex items-center gap-1.5">
                🎬 <span className="font-medium">Auto-tracked via extension</span>
              </span>
              <span className="text-[11px] text-green-500 font-semibold">
                {manga.total_watch_time_minutes > 0
                  ? `${(manga.total_watch_time_minutes / 60).toFixed(1)}h watched`
                  : 'tracking active'}
              </span>
            </div>
          )}

          {/* Episode list — shown for anime / movie entries */}
          {(manga.content_type === 'anime' || manga.content_type === 'movie' || manga.has_anime) &&
            (manga.mal_id || manga.anime_mal_id) && (
            <div className="mb-4">
              <button
                onClick={() => {
                  if (!episodesExpanded) {
                    setEpisodesExpanded(true)
                    if (episodes.length === 0) loadEpisodes(1)
                  } else {
                    setEpisodesExpanded(false)
                  }
                }}
                className="w-full flex items-center justify-between py-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <span>📺 Episodes</span>
                <span className="text-zinc-700">{episodesExpanded ? '▲ hide' : '▼ show'}</span>
              </button>

              {episodesExpanded && (
                <div className="space-y-1 mt-1">
                  {episodesLoading && episodes.length === 0 && (
                    <p className="text-xs text-zinc-600 text-center py-4">Loading episodes…</p>
                  )}
                  {!episodesLoading && episodes.length === 0 && (
                    <p className="text-xs text-zinc-600 text-center py-4">No episode data available.</p>
                  )}
                  {episodes.map(ep => (
                    <div key={ep.mal_id} className="bg-zinc-800 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleEpisodeSynopsis(ep)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-700 transition-colors"
                      >
                        <span className="text-[10px] text-zinc-600 font-mono w-6 shrink-0 text-right">{ep.mal_id}</span>
                        <span className="text-xs text-zinc-300 flex-1 truncate">{ep.title ?? `Episode ${ep.mal_id}`}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {ep.filler && <span className="text-[9px] px-1 bg-amber-500/20 text-amber-400 rounded">filler</span>}
                          {ep.recap && <span className="text-[9px] px-1 bg-zinc-700 text-zinc-500 rounded">recap</span>}
                          {ep.score && ep.score > 0 && <span className="text-[10px] text-yellow-500">★ {ep.score.toFixed(1)}</span>}
                          {ep.aired && <span className="text-[10px] text-zinc-600">{ep.aired.slice(0, 10)}</span>}
                          <span className="text-zinc-700 text-[10px]">{expandedEpisodes.has(ep.mal_id) ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {expandedEpisodes.has(ep.mal_id) && (
                        <div className="px-3 pb-2.5 pt-0.5 border-t border-zinc-700/50">
                          {episodeSynopsisLoading === ep.mal_id ? (
                            <p className="text-[11px] text-zinc-600 italic">Loading synopsis…</p>
                          ) : episodeSynopses[ep.mal_id] ? (
                            <p className="text-[11px] text-zinc-400 leading-relaxed">{episodeSynopses[ep.mal_id]}</p>
                          ) : (
                            <p className="text-[11px] text-zinc-700 italic">No synopsis available.</p>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {episodeHasNext && (
                    <button
                      onClick={() => loadEpisodes(episodePage + 1)}
                      disabled={episodesLoading}
                      className="w-full mt-1 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-40"
                    >
                      {episodesLoading ? 'Loading…' : 'Load more episodes'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Chapter listing — shown for manga/manhwa/manhua/webtoon entries */}
          {(manga.content_type !== 'anime' && manga.content_type !== 'movie') && manga.title && (
            <div className="mb-4">
              <button
                onClick={async () => {
                  if (!mdxChaptersExpanded) {
                    setMdxChaptersExpanded(true)
                    if (mdxChapters.length === 0) {
                      setMdxChaptersLoading(true)
                      const result = await getMangaDexChapters(manga.title)
                      setMdxChaptersLoading(false)
                      if (result) {
                        setMdxChapters(result.chapters)
                        setMdxChaptersTotal(result.total)
                      }
                    }
                  } else {
                    setMdxChaptersExpanded(false)
                  }
                }}
                className="w-full flex items-center justify-between py-2 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                <span>📖 Chapters {mdxChaptersTotal > 0 ? `(${mdxChaptersTotal})` : ''}</span>
                <span className="text-zinc-700">{mdxChaptersExpanded ? '▲ hide' : '▼ show'}</span>
              </button>

              {mdxChaptersExpanded && (
                <div className="space-y-0.5 mt-1">
                  {mdxChaptersLoading && (
                    <p className="text-xs text-zinc-600 text-center py-4">Loading chapters…</p>
                  )}
                  {!mdxChaptersLoading && mdxChapters.length === 0 && (
                    <p className="text-xs text-zinc-600 text-center py-4">No chapter data found on MangaDex.</p>
                  )}
                  {mdxChapters.map(ch => (
                    <div key={ch.id} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded-lg">
                      <span className="text-[10px] text-zinc-600 font-mono w-8 shrink-0 text-right">
                        {ch.chapter ? `Ch.${ch.chapter}` : '—'}
                      </span>
                      {ch.volume && (
                        <span className="text-[9px] px-1 bg-zinc-700 text-zinc-500 rounded shrink-0">Vol.{ch.volume}</span>
                      )}
                      <span className="text-xs text-zinc-300 flex-1 truncate">
                        {ch.title ?? <span className="text-zinc-600 italic">Untitled</span>}
                      </span>
                      {ch.pages && <span className="text-[10px] text-zinc-600 shrink-0">{ch.pages}p</span>}
                      {ch.publishedAt && (
                        <span className="text-[10px] text-zinc-600 shrink-0">{ch.publishedAt.slice(0, 10)}</span>
                      )}
                    </div>
                  ))}
                  {mdxChapters.length > 0 && mdxChapters.length < mdxChaptersTotal && (
                    <p className="text-[10px] text-zinc-600 text-center py-1">
                      Showing {mdxChapters.length} of {mdxChaptersTotal} chapters — powered by MangaDex
                    </p>
                  )}
                  {mdxChapters.length > 0 && mdxChapters.length >= mdxChaptersTotal && (
                    <p className="text-[10px] text-zinc-600 text-center py-1">Powered by MangaDex</p>
                  )}
                </div>
              )}
            </div>
          )}

          <ArcEditor
            mangaId={manga.id}
            totalChapters={manga.total_chapters}
            currentChapter={manga.current_chapter}
          />

          {/* ── Series / Sequel grouping ────────────────────────────── */}
          <SeriesPanel
            primary={manga}
            allManga={allManga}
            onUpdated={onSeriesUpdated}
            onAdded={onSeriesEntryAdded}
          />

          {/* ── Merge panel ─────────────────────────────────────────── */}
          {(() => {
            const candidates = allManga.filter(m => m.id !== manga.id)
            const q = mergeQuery.trim().toLowerCase()
            const visible = q
              ? candidates.filter(m => m.title.toLowerCase().includes(q))
              : candidates.slice(0, 40)
            const selectedEntries = allManga.filter(m => mergeSelected.has(m.id))

            const executeMerge = async () => {
              if (mergeSelected.size === 0) return
              setMergingMulti(true)
              await onMergeMultiple([...mergeSelected])
              setMergingMulti(false)
              setMergeSelected(new Set())
              setMergeQuery('')
              setMergeOpen(false)
              onClose()
            }

            return (
              <div className="mt-4 border-t border-zinc-800 pt-4">
                <button
                  onClick={() => setMergeOpen(v => !v)}
                  className="w-full flex items-center justify-between text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors mb-1 px-1"
                >
                  <span className="flex items-center gap-1.5">
                    <GitMerge size={12} strokeWidth={1.5} />
                    Merge With Other Entries
                    {mergeSelected.size > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                        style={{ background: 'rgba(255,45,70,0.18)', color: 'var(--vermillion)' }}>
                        {mergeSelected.size} selected
                      </span>
                    )}
                  </span>
                  <span className="text-zinc-600">{mergeOpen ? '▲' : '▼'}</span>
                </button>

                {mergeOpen && (
                  <div className="mt-2 space-y-2">
                    {/* Search input */}
                    <input
                      type="text"
                      value={mergeQuery}
                      onChange={e => setMergeQuery(e.target.value)}
                      placeholder="Search your library…"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                      autoFocus
                    />

                    {/* Selected chips */}
                    {selectedEntries.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedEntries.map(m => (
                          <span key={m.id}
                            className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(255,45,70,0.15)', color: 'var(--vermillion)', border: '1px solid rgba(255,45,70,0.3)' }}>
                            {m.title.length > 24 ? m.title.slice(0, 22) + '…' : m.title}
                            <button
                              onClick={() => setMergeSelected(prev => { const n = new Set(prev); n.delete(m.id); return n })}
                              className="opacity-60 hover:opacity-100 leading-none ml-0.5"
                            >×</button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Results list */}
                    <div className="max-h-52 overflow-y-auto rounded-xl border border-zinc-800 divide-y divide-zinc-800">
                      {visible.length === 0 ? (
                        <p className="text-xs text-zinc-600 text-center py-4">No results</p>
                      ) : visible.map(m => {
                        const checked = mergeSelected.has(m.id)
                        return (
                          <button key={m.id}
                            onClick={() => setMergeSelected(prev => {
                              const n = new Set(prev)
                              checked ? n.delete(m.id) : n.add(m.id)
                              return n
                            })}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-zinc-800 ${checked ? 'bg-zinc-800/80' : ''}`}
                          >
                            {/* Checkbox indicator */}
                            <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors ${
                              checked
                                ? 'border-[var(--vermillion)] bg-[var(--vermillion)] text-white'
                                : 'border-zinc-600 bg-transparent'
                            }`}>
                              {checked && '✓'}
                            </span>

                            {m.cover_url && (
                              <img src={m.cover_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
                            )}

                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-zinc-200 truncate">{m.title}</p>
                              <p className="text-[10px] text-zinc-500">
                                Ch.{m.current_chapter}
                                {m.total_chapters ? `/${m.total_chapters}` : ''}
                                {' · '}{STATUS_LABELS[m.status]}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {/* Execute */}
                    {mergeSelected.size > 0 && (
                      <button
                        onClick={executeMerge}
                        disabled={mergingMulti}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
                        style={{ background: 'var(--vermillion)', color: '#fff' }}
                      >
                        {mergingMulti
                          ? 'Merging…'
                          : `Merge ${mergeSelected.size + 1} Entries Into This One`}
                      </button>
                    )}

                    <p className="text-[10px] text-zinc-600 text-center px-2">
                      This entry is kept. Selected entries are deleted. Best progress &amp; metadata from all sources is preserved.
                    </p>
                  </div>
                )}
              </div>
            )
          })()}

          <button onClick={onClose}
            className="w-full mt-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-colors">
            Close
          </button>
        </div>
      </div>

      {/* Series Map overlay — rendered inside the detail panel backdrop */}
      {showSeriesMap && manga.mal_id && (
        <SeriesMapModal
          malId={manga.mal_id}
          title={manga.title}
          coverUrl={manga.cover_url}
          onClose={() => setShowSeriesMap(false)}
        />
      )}

      {showDeepSearch && (
        <DeepSearchModal
          mangaId={manga.id}
          malId={manga.mal_id}
          title={manga.title}
          onClose={() => setShowDeepSearch(false)}
          onSaved={(total) => {
            setShowDeepSearch(false)
            onTotalChaptersUpdated?.(total)
          }}
        />
      )}

      {showUrlImport && (
        <UrlImportModal
          manga={manga}
          onClose={() => setShowUrlImport(false)}
          onSaved={(updates) => {
            setShowUrlImport(false)
            if (updates.total_chapters !== undefined) onTotalChaptersUpdated?.(updates.total_chapters ?? null)
          }}
        />
      )}
    </div>
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

  const STATUS_LABELS: Record<MangaStatus, string> = {
    reading: 'Reading', completed: 'Completed', on_hold: 'On Hold',
    dropped: 'Dropped', plan_to_read: 'Plan To Read', watching: 'Watching', unwatched: 'Unwatched',
  }

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
  const shareUrl = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${token}` : null
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

const TAKEOUT_ENTRIES: Array<{
  title: string; status: string; genres: string[]; notes: string
  current_chapter: number; total_chapters: number | null
  episodes_watched: number; total_episodes: number | null
  has_anime: boolean; content_type: 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'anime' | 'novel' | 'other'
}> = [
  { title: "Frieren: Beyond Journey's End", status: 'watching', genres: ['Fantasy','Adventure','Slice of Life','Drama'], notes: '[youtube_takeout_import] Most-watched series in YouTube history. Season 2 ongoing.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Bleach: Thousand-Year Blood War', status: 'watching', genres: ['Action','Supernatural','Shounen'], notes: '[youtube_takeout_import] Second most-watched. TYBW arc focus.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Jujutsu Kaisen', status: 'watching', genres: ['Action','Dark Fantasy','Supernatural','Shounen'], notes: '[youtube_takeout_import] Season 3 and manga continuation covered.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Black Clover', status: 'watching', genres: ['Action','Fantasy','Magic','Shounen'], notes: '[youtube_takeout_import] Anime + manga continuation.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'My Hero Academia', status: 'completed', genres: ['Action','Superhero','Shounen','School'], notes: '[youtube_takeout_import] Manga ending and epilogue covered.', current_chapter: 0, total_chapters: 430, episodes_watched: 0, total_episodes: 138, has_anime: true, content_type: 'manga' },
  { title: 'One Piece', status: 'watching', genres: ['Action','Adventure','Fantasy','Shounen'], notes: '[youtube_takeout_import] Devil fruit lore and Poneglyph analysis.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Demon Slayer: Kimetsu no Yaiba', status: 'watching', genres: ['Action','Supernatural','Shounen'], notes: '[youtube_takeout_import] Infinity Castle arc coverage.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Hunter x Hunter', status: 'on_hold', genres: ['Action','Adventure','Shounen'], notes: '[youtube_takeout_import] Character analysis, Nen breakdowns. Manga on hiatus.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Delicious in Dungeon', status: 'completed', genres: ['Fantasy','Comedy','Adventure','Slice of Life'], notes: '[youtube_takeout_import] Marcille/Laios focus. Food recreation content.', current_chapter: 0, total_chapters: 97, episodes_watched: 0, total_episodes: 24, has_anime: true, content_type: 'manga' },
  { title: 'Attack on Titan', status: 'completed', genres: ['Action','Dark Fantasy','Mystery','Psychological'], notes: '[youtube_takeout_import] Titan transformations, foreshadowing analysis.', current_chapter: 0, total_chapters: 139, episodes_watched: 0, total_episodes: 87, has_anime: true, content_type: 'manga' },
  { title: 'Chainsaw Man', status: 'watching', genres: ['Action','Dark Fantasy','Horror','Supernatural'], notes: '[youtube_takeout_import] Anime + manga. Reze Arc film.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Naruto Shippuden', status: 'completed', genres: ['Action','Adventure','Shounen'], notes: '[youtube_takeout_import] Clip-based. Chunin exams, Minato, Kakashi, Itachi moments.', current_chapter: 0, total_chapters: 700, episodes_watched: 0, total_episodes: 500, has_anime: true, content_type: 'manga' },
  { title: 'Tower of God', status: 'plan_to_read', genres: ['Action','Adventure','Fantasy','Mystery'], notes: '[youtube_takeout_import] Both anime seasons. WEBTOON origin.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'webtoon' },
  { title: 'That Time I Got Reincarnated as a Slime', status: 'plan_to_read', genres: ['Isekai','Fantasy','Action','Comedy'], notes: '[youtube_takeout_import] Seasons 2 & 3. Rimuru Demon Lord arc.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Mushoku Tensei: Jobless Reincarnation', status: 'plan_to_read', genres: ['Isekai','Fantasy','Adventure','Drama'], notes: '[youtube_takeout_import] Season 2 focus.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Apothecary Diaries', status: 'plan_to_read', genres: ['Mystery','Historical','Drama','Slice of Life'], notes: '[youtube_takeout_import] Maomao character moments.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Fairy Tail', status: 'plan_to_read', genres: ['Action','Fantasy','Magic','Shounen'], notes: '[youtube_takeout_import] Lucy and Wendy clips. 100 Years Quest continuation.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Dandadan', status: 'plan_to_read', genres: ['Action','Comedy','Supernatural','Romance'], notes: '[youtube_takeout_import] Season 2 trailer and OP watched.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Sakamoto Days', status: 'plan_to_read', genres: ['Action','Comedy','Thriller'], notes: '[youtube_takeout_import] Netflix Anime clips.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Tokyo Ghoul', status: 'plan_to_read', genres: ['Action','Horror','Psychological'], notes: '[youtube_takeout_import] Opening Unravel. Kaneki vs Jason.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'One Punch Man', status: 'plan_to_read', genres: ['Action','Comedy','Superhero','Parody'], notes: '[youtube_takeout_import] Boros, King, Saitama analysis.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Soul Eater', status: 'plan_to_read', genres: ['Action','Fantasy','Shounen'], notes: '[youtube_takeout_import] Demon weapons ranked. Canon manga ending.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Spy x Family', status: 'plan_to_read', genres: ['Action','Comedy','Family'], notes: '[youtube_takeout_import] Anya clips.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Witch Hat Atelier', status: 'plan_to_read', genres: ['Fantasy','Magic','Slice of Life'], notes: '[youtube_takeout_import] Crunchyroll trailer. Power system analysis.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: "Hell's Paradise", status: 'plan_to_read', genres: ['Action','Dark Fantasy','Historical'], notes: '[youtube_takeout_import] Sagiri vs Gabimaru fight clip.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Undead Unluck', status: 'plan_to_read', genres: ['Action','Supernatural','Comedy'], notes: '[youtube_takeout_import] Andy Victor personality.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Death Note', status: 'plan_to_read', genres: ['Thriller','Psychological','Mystery','Supernatural'], notes: "[youtube_takeout_import] L's realisation clips.", current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Berserk', status: 'plan_to_read', genres: ['Dark Fantasy','Action','Psychological'], notes: '[youtube_takeout_import] Manga read content. Idea of Evil, Griffith analysis.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Gachiakuta', status: 'plan_to_read', genres: ['Action','Fantasy','Shounen'], notes: '[youtube_takeout_import] Strongest Raiders / Vital Instrument analysis.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: false, content_type: 'manga' },
  { title: 'The Seven Deadly Sins', status: 'plan_to_read', genres: ['Action','Fantasy','Adventure'], notes: '[youtube_takeout_import] Meliodas and Escanor clips.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manga' },
  { title: 'Solo Leveling', status: 'plan_to_read', genres: ['Action','Fantasy','Dungeon'], notes: '[youtube_takeout_import] Manhwa origin. Anime Season 2.', current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true, content_type: 'manhwa' },
]

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
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('yomu_dismissed_pairs') ?? '[]')) } catch { return new Set() }
  })

  // Sync dismissedPairs from Supabase user metadata on mount (cross-device persistence)
  useEffect(() => {
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

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  const [animeList, setAnimeList] = useState<AnimeRow[]>([])

  const fetchManga = useCallback(async () => {
    const [{ data, error }, { data: al }] = await Promise.all([
      supabase.from('manga_list').select('*'),
      supabase.from('anime_list').select('id,title,total_watch_hours,last_watched,is_movie'),
    ])
    if (error) { showToast('Failed To Load Manga List'); return }
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

  // Fetch missing covers — tracks fetched IDs in ref to avoid re-fetching
  useEffect(() => {
    const missing = manga.filter(m => (!m.cover_url || !m.synopsis) && !fetchedIds.current.has(m.id))
    if (missing.length === 0) return

    const run = async () => {
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
    }
    run()
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
      const { error } = await supabase.from('manga_list').update({ notes }).eq('id', id)
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
    const a = document.createElement('a'); a.href = url
    a.download = filename; a.click(); URL.revokeObjectURL(url)
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

  const endSession = async (chaptersRead: number, durationMinutes: number) => {
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
  }

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
    await supabase.from('manga_list').update(updates).eq('id', keep.id)
    await supabase.from('manga_list').delete().in('id', removeIds)

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

  const filtered = manga
    .filter(m => !m.series_id || !!m.series_primary) // hide non-primary grouped entries
    .filter(m => filter === 'all' || filter === 'duplicates' || m.status === filter)
    .filter(m => typeFilter === 'all' || (m.content_type ?? 'manga') === typeFilter)
    .filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))
    .filter(m => !mood || MOODS.find(mo => mo.id === mood)?.test(m))
    .sort(sortFn)

  // Count per type for badge labels
  const typeCounts = manga.reduce((acc, m) => {
    const t = m.content_type ?? 'manga'
    acc[t] = (acc[t] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

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
                  onClick={() => { setAddContentType(ct); setSelectedJikan(null); setNewTitle(''); setAddSuggestions([]) }}
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
                  <button onClick={() => { setSelectedJikan(null); setNewTitle('') }}
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
                      if (e.key === 'Escape') { setShowAdd(false); setNewTitle(''); setAddSuggestions([]); setSelectedJikan(null) }
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
          </div>
        )}

        {/* ── Continue strip ── */}
        {(() => {
          const CONTINUE_KEY = 'yomu_last_read'
          // Derive the last-touched reading entry from loaded data
          const lastRead = manga
            .filter(m => (m.status === 'reading' || m.status === 'watching') && m.last_read_at)
            .sort((a, b) => new Date(b.last_read_at!).getTime() - new Date(a.last_read_at!).getTime())[0]

          if (!lastRead) return null

          // Persist for instant next-load
          try { localStorage.setItem(CONTINUE_KEY, JSON.stringify({ id: lastRead.id, title: lastRead.title, chapter: lastRead.current_chapter, cover: lastRead.cover_url })) } catch {}

          const mdexUrl = lastRead.mal_id
            ? `https://mangadex.org/search?q=${encodeURIComponent(lastRead.title)}`
            : null

          return (
            <div className="mb-4 flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors">
              {lastRead.cover_url && (
                <img src={lastRead.cover_url} alt="" className="w-8 h-11 object-cover rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold mb-0.5">{lastRead.status === 'watching' ? 'Continue Watching' : 'Continue Reading'}</p>
                <p className="text-sm font-semibold text-zinc-100 truncate">{lastRead.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{lastRead.status === 'watching' ? `Episode ${lastRead.episodes_watched}${lastRead.total_episodes ? ` of ${lastRead.total_episodes}` : ''}` : `Chapter ${lastRead.current_chapter}${lastRead.total_chapters ? ` of ${lastRead.total_chapters}` : ''}`}</p>
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
            {filtered.map(m => (
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
                      {m.auto_tracked && (
                        <span title={`Auto-tracked · ${m.total_watch_time_minutes > 0 ? Math.round(m.total_watch_time_minutes / 60 * 10) / 10 + 'h watched' : 'extension active'}`}
                          className="text-[10px] bg-green-950 text-green-400 border border-green-800/50 px-1.5 py-0.5 rounded-full">
                          🎬 tracked
                        </span>
                      )}
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
                            {seriesEpTotal && <span className="text-[11px] text-zinc-600 font-mono">/{seriesEpTotal}</span>}
                            <button onClick={() => updateEpisodes(activeEpMember.id, 1, activeEpMember.episodes_watched)} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">+</button>
                          </div>
                        </div>
                      </div>
                      )
                    })()}

                    {/* 4. Chapter tracker + inline stepper + progress bar — dimmed when anime is primary */}
                    {(() => {
                      const isMangaPrimary = m.content_type !== 'anime' && m.content_type !== 'movie'
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
                        <span className="text-[11px] text-zinc-500 tabular-nums">
                          Ch.&nbsp;{seriesCurrent}&nbsp;/&nbsp;{seriesTotal ?? '?'}
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
