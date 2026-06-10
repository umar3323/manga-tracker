'use client'

/**
 * DetailView — extracted from app/page.tsx
 *
 * Contains:
 *  - RelationMergeButton   (helper used inside DetailModal)
 *  - DetailModal           (the right-panel detail view for a library entry)
 *
 * Each external-API section has its own loading state so one slow source
 * never blocks the rest of the view (isolated loading boundaries).
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import useSWR from 'swr'
import Image from 'next/image'
import { supabase, type Manga, type MangaStatus } from '@/lib/supabase'
import {
  getMangaAllRelations,
  getSeriesEntryDetail,
  getJikanRecommendations,
  getJikanEpisodes,
  getJikanEpisodeSynopsis,
  getMangaDexChapters,
  searchMangaWithFilters,
  searchAnimeWithFiltersTyped,
  type JikanSearchResult,
  type JikanEpisode,
  type SeriesRelation,
  type MangaDexChapter,
} from '@/lib/jikan'
import ArcEditor from '@/components/ArcEditor'
import SeriesMapModal from '@/components/SeriesMapModal'
import DeepSearchModal from '@/components/DeepSearchModal'
import UrlImportModal from '@/components/UrlImportModal'
import RereadSection from '@/components/RereadSection'
import RewatchSection from '@/components/RewatchSection'
import { RELATION_LABELS, formatCountdown } from '@/lib/anilist'
import type { AniListMangaData, AniListAnimeData } from '@/lib/anilist'
import type { MUSeriesData } from '@/lib/mangaupdates'
import type { ANNRelatedWork } from '@/lib/ann'
import { GitMerge, Tv } from 'lucide-react'

// ─── Re-exported constants (page.tsx still owns STATUS_LABELS / STATUS_COLORS) ─
// We only need the type here — actual values stay in page.tsx to avoid duplication.

// ─── Skeleton helper ────────────────────────────────────────────────────────────
function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-zinc-800 rounded ${className}`}
      aria-hidden="true"
    />
  )
}

// ─── EditableNumber (moved here from page.tsx to be co-located) ─────────────
export function EditableNumber({
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

// ─── RelationMergeButton ────────────────────────────────────────────────────────
export function RelationMergeButton({
  keep,
  remove,
  onMerge,
}: {
  keep: Manga
  remove: Manga
  onMerge: (removedId: string) => void
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
    <>
      <div className="text-[10px] text-zinc-400 mb-1 grid grid-cols-2 gap-2">
        <div>
          <div className="text-zinc-300 font-medium truncate">{keep.title}</div>
          {keep.current_chapter > 0 || keep.total_chapters ? (
            <div>Ch. {keep.current_chapter}/{keep.total_chapters ?? '?'}</div>
          ) : null}
          {(keep.has_anime && (keep.episodes_watched > 0 || keep.total_episodes)) ? (
            <div>Ep. {keep.episodes_watched}/{keep.total_episodes ?? '?'}</div>
          ) : null}
        </div>
        <div>
          <div className="text-zinc-300 font-medium truncate">{remove.title}</div>
          {remove.current_chapter > 0 || remove.total_chapters ? (
            <div>Ch. {remove.current_chapter}/{remove.total_chapters ?? '?'}</div>
          ) : null}
          {(remove.has_anime && (remove.episodes_watched > 0 || remove.total_episodes)) ? (
            <div>Ep. {remove.episodes_watched}/{remove.total_episodes ?? '?'}</div>
          ) : null}
        </div>
      </div>
      <button
        onClick={handleMerge}
        disabled={merging}
        title={`Merge "${remove.title}" into this entry`}
        className="text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors disabled:opacity-40"
        style={{ backgroundColor: 'rgba(43,230,220,0.12)', color: 'var(--cyan)' }}
      >
        {merging ? '…' : '⟷'}
      </button>
    </>
  )
}

// ─── SeriesPanel (moved here; was inline in page.tsx above DetailModal) ────────
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
    if (isPrimary) {
      const remaining = members.filter(e => e.id !== m.id)
      if (remaining.length > 0) {
        const newPrimary = remaining[0]
        await supabase.from('manga_list').update({ series_primary: true }).eq('id', newPrimary.id)
        onUpdated({ [newPrimary.id]: { series_primary: true } })
      } else {
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
    await supabase.from('manga_list').update({ series_primary: false }).eq('id', primary.id)
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

  // Suppress unused-variable warnings for helpers only used by library members
  void addMember
  void updateMemberChapter
  void updateMemberEpisode

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
                    {!m.series_primary && (
                      <button
                        onClick={() => setPrimary(m)}
                        disabled={savingId === m.id}
                        className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/40 transition-colors"
                        title="Set as primary"
                      >
                        {savingId === m.id ? '…' : '★'}
                      </button>
                    )}
                    <button
                      onClick={() => removeMember(m)}
                      disabled={savingId === m.id}
                      className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-500 hover:text-red-400 hover:bg-zinc-600 transition-colors"
                      title="Remove from series"
                    >
                      {savingId === m.id ? '…' : '✕'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Search to add from library or Jikan */}
          <div>
            <input
              type="text"
              value={addQuery}
              onChange={e => setAddQuery(e.target.value)}
              placeholder="Add part from library or search Jikan…"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
            {searchingJikan && (
              <p className="text-[10px] text-zinc-600 text-center mt-1">Searching…</p>
            )}
            {jikanResults.length > 0 && (
              <div className="mt-1 rounded-xl border border-zinc-800 divide-y divide-zinc-800 max-h-40 overflow-y-auto">
                {jikanResults.map(j => (
                  <button
                    key={j.mal_id}
                    onClick={() => addJikanMember(j)}
                    disabled={adding}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 text-left transition-colors"
                  >
                    {j.cover_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={j.cover_url} alt="" className="w-6 h-8 object-cover rounded shrink-0" />
                    )}
                    <span className="text-xs text-zinc-300 flex-1 truncate">{j.title}</span>
                    <span className="text-[10px] text-zinc-600 shrink-0">+ Add</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Per-section skeleton components ────────────────────────────────────────────

function ScoresSkeleton() {
  return (
    <div className="mb-4">
      <Skeleton className="h-3 w-32 mb-2" />
      <div className="bg-zinc-900 rounded-xl p-3 space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-1.5 flex-1" />
            <Skeleton className="h-2.5 w-7" />
          </div>
        ))}
      </div>
    </div>
  )
}

function WikiSkeleton() {
  return (
    <div className="mb-4">
      <Skeleton className="h-3 w-24 mb-2" />
      <Skeleton className="h-10 w-full" />
    </div>
  )
}

function RelationsSkeleton() {
  return (
    <div className="mb-4">
      <Skeleton className="h-3 w-28 mb-2" />
      <div className="flex gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="shrink-0 w-24">
            <Skeleton className="w-24 h-32 rounded-xl mb-1" />
            <Skeleton className="h-2.5 w-full" />
          </div>
        ))}
      </div>
    </div>
  )
}

function RecsSkeleton() {
  return (
    <div className="mb-4">
      <Skeleton className="h-3 w-32 mb-2" />
      <div className="space-y-1.5">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex items-center gap-2.5 bg-zinc-800 rounded-xl px-3 py-2">
            <Skeleton className="w-7 h-9 rounded shrink-0" />
            <Skeleton className="h-3 flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── DetailModal ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<MangaStatus, string> = {
  reading:      'Reading',
  completed:    'Completed',
  on_hold:      'On Hold',
  dropped:      'Dropped',
  plan_to_read: 'Plan To Read',
  watching:     'Watching',
  unwatched:    'Unwatched',
}

export interface DetailModalProps {
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
  onSync?: (id: string) => void
}

export function DetailModal({
  manga,
  allManga,
  onClose,
  onStatusChange,
  onMerge,
  onMergeMultiple,
  onNavigate,
  onChapterReset,
  onEpisodesReset,
  onChapterRestored,
  onEpisodesRestored,
  onTotalChaptersUpdated,
  onSeriesUpdated,
  onSeriesEntryAdded,
  onSync,
}: DetailModalProps) {

  // ── SWR options shared across all detail fetches ─────────────────────────
  const SWR_OPTS = {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 300_000, // 5 minutes
  } as const

  // ── SWR: AniList (manga) ──────────────────────────────────────────────────
  const alMangaKey = manga.mal_id ? `/api/anilist?mal_id=${manga.mal_id}&type=MANGA` : null
  const { data: alMangaRaw, isLoading: alMangaLoading, error: alMangaError } = useSWR<{ data: AniListMangaData | null }>(
    alMangaKey,
    (url: string) => fetch(url).then(r => r.json()),
    SWR_OPTS,
  )
  const alManga = alMangaRaw?.data ?? null

  // ── SWR: AniList (anime) ──────────────────────────────────────────────────
  const animeMalIdForAl = manga.anime_mal_id
    ?? ((manga.content_type === 'anime' || manga.content_type === 'movie') ? manga.mal_id : null)
  const alAnimeKey = animeMalIdForAl ? `/api/anilist?mal_id=${animeMalIdForAl}&type=ANIME` : null
  const { data: alAnimeRaw, isLoading: alAnimeLoading, error: alAnimeError } = useSWR<{ data: AniListAnimeData | null }>(
    alAnimeKey,
    (url: string) => fetch(url).then(r => r.json()),
    SWR_OPTS,
  )
  const alAnime = alAnimeRaw?.data ?? null

  // Combined alLoading for sections that depend on either AniList source
  const alLoading = alMangaLoading || alAnimeLoading

  // ── SWR: notify.moe ──────────────────────────────────────────────────────
  const notifyTitle = manga.anime_title ?? manga.title
  const animeMalIdForNotify = manga.anime_mal_id
    ?? ((manga.content_type === 'anime' || manga.content_type === 'movie') ? manga.mal_id : null)
  const notifyKey = animeMalIdForNotify
    ? `/api/notifymoe?mal_id=${animeMalIdForNotify}&title=${encodeURIComponent(notifyTitle)}`
    : null
  const { data: notifyRaw, isLoading: notifyLoading, error: notifyError } = useSWR<{
    data: { id: string; rating: { overall: number; story: number; visuals: number; soundtrack: number } | null; url: string } | null
  }>(
    notifyKey,
    (url: string) => fetch(url).then(r => r.json()),
    SWR_OPTS,
  )
  const notifyMoe = notifyRaw?.data ?? null

  // ── SWR: Wikipedia ───────────────────────────────────────────────────────
  const wikiKey = manga.title
    ? `/api/wikipedia?title=${encodeURIComponent(manga.title)}&mal_id=${manga.mal_id ?? ''}`
    : null
  const { data: wikiRaw, isLoading: wikiLoading, error: wikiError } = useSWR<{
    data: {
      title: string; url: string; summary: string; thumbnail?: string
      author?: string; illustrator?: string; publisher?: string; serializedIn?: string
      originalRun?: string; volumes?: string; episodes?: string; directed?: string
      studio?: string; genres?: string[]; arcSummary?: string
    } | null
  }>(
    wikiKey,
    (url: string) => fetch(url).then(r => r.json()),
    SWR_OPTS,
  )
  const wikiData = wikiRaw?.data ?? null
  const [wikiExpanded, setWikiExpanded] = useState(false)

  // ── SWR: MangaUpdates ────────────────────────────────────────────────────
  const muKey = manga.title ? `/api/mangaupdates?title=${encodeURIComponent(manga.title)}` : null
  const { data: muRaw, isLoading: muLoading, error: muError } = useSWR<{ data: MUSeriesData | null }>(
    muKey,
    (url: string) => fetch(url).then(r => r.json()),
    SWR_OPTS,
  )
  const muData = muRaw?.data ?? null

  // ── SWR: ANN ─────────────────────────────────────────────────────────────
  const annKey = (manga.title && !manga.has_anime) ? `/api/ann?title=${encodeURIComponent(manga.title)}` : null
  const { data: annRaw } = useSWR<{ related_anime?: ANNRelatedWork[] }>(
    annKey,
    (url: string) => fetch(url).then(r => r.json()),
    SWR_OPTS,
  )
  const annAnime: ANNRelatedWork[] = annRaw?.related_anime ?? []

  // ── SWR: Jikan recommendations ────────────────────────────────────────────
  const recMalId = (manga.content_type === 'anime' || manga.content_type === 'movie')
    ? manga.mal_id
    : manga.anime_mal_id
  const recType: 'anime' | 'manga' = (manga.content_type === 'anime' || manga.content_type === 'movie')
    ? 'anime' : 'manga'
  const jikanRecsKey = recMalId ? `jikan-recs-${recMalId}-${recType}` : null
  const { data: jikanRecsData, isLoading: jikanRecsLoading, error: jikanRecsError } = useSWR<JikanSearchResult[]>(
    jikanRecsKey,
    () => recMalId ? getJikanRecommendations(recMalId, recType) : Promise.resolve([]),
    SWR_OPTS,
  )
  const jikanRecs = jikanRecsData ?? []
  const [jikanRecAdded, setJikanRecAdded] = useState<Set<number>>(new Set())
  const [jikanRecAdding, setJikanRecAdding] = useState<number | null>(null)

  // ── SWR: OMDB / IMDb ─────────────────────────────────────────────────────
  const omdbStoredKey = (() => { try { return localStorage.getItem('yomu_omdb_key') } catch { return null } })()
  const omdbFetchKey = (omdbStoredKey && manga.title)
    ? `omdb-${manga.title}-${manga.content_type}`
    : null
  const { data: omdbRaw } = useSWR<{ imdbRating?: string; imdbID?: string; Response: string }>(
    omdbFetchKey,
    () => {
      const q = encodeURIComponent(manga.title)
      return fetch(
        `https://www.omdbapi.com/?t=${q}&apikey=${omdbStoredKey}&type=${manga.content_type === 'movie' ? 'movie' : 'series'}`
      ).then(r => r.json())
    },
    SWR_OPTS,
  )
  const imdbRatingFromSwr = omdbRaw?.Response === 'True' ? omdbRaw.imdbRating ?? null : null
  const imdbIdFromSwr = omdbRaw?.Response === 'True' ? omdbRaw.imdbID ?? null : null
  const [omdbKeyInput, setOmdbKeyInput] = useState('')
  const [showOmdbInput, setShowOmdbInput] = useState(false)
  // Local override for when user enters a new OMDB key mid-session (SWR won't re-run until remount)
  const [omdbOverride, setOmdbOverride] = useState<{ imdbRating: string | null; imdbID: string | null } | null>(null)
  const imdbRating = omdbOverride?.imdbRating ?? imdbRatingFromSwr
  const imdbId = omdbOverride?.imdbID ?? imdbIdFromSwr

  // ── SWR: Jikan relations ──────────────────────────────────────────────────
  const relationsKey = manga.mal_id ? `jikan-relations-${manga.mal_id}` : null
  const { data: relationsData, isLoading: relationsLoading } = useSWR<SeriesRelation[]>(
    relationsKey,
    () => manga.mal_id ? getMangaAllRelations(manga.mal_id) : Promise.resolve([]),
    SWR_OPTS,
  )
  const jikanRelations = relationsData ?? []
  const relationsLoaded = !relationsLoading && relationsData !== undefined

  // ── Anime suggestion — derived from SWR data ──────────────────────────────
  const [suggestedAnime, setSuggestedAnime] = useState<{ idMal: number; title: string } | null>(null)

  // Sync suggestedAnime from AniList manga data
  useEffect(() => {
    if (!alManga || manga.has_anime) return
    const adaptRel = alManga.relations.find(
      r => r.relationType === 'ADAPTATION' && r.node.type === 'ANIME' && r.node.idMal
    )
    if (adaptRel) {
      setSuggestedAnime({ idMal: adaptRel.node.idMal!, title: adaptRel.node.title.romaji })
    }
  }, [alManga, manga.has_anime])

  // Sync suggestedAnime from ANN data
  useEffect(() => {
    if (annAnime.length === 0) return
    setSuggestedAnime(prev => prev ? prev : { idMal: 0, title: annAnime[0].title })
  }, [annAnime])

  // ── Anime suggestion / duplicate dismissal (localStorage) ─────────────────
  const dupKey   = `yomu_dismissed_dup_${manga.id}`
  const animeKey = `yomu_dismissed_anime_${manga.mal_id ?? manga.id}`
  const [animeSuggestionDismissed, setAnimeSuggestionDismissed] = useState(false)
  const [animeSuggestionConfirmed, setAnimeSuggestionConfirmed] = useState(false)
  const [duplicateDismissed, setDuplicateDismissed] = useState(false)
  useEffect(() => {
    try {
      if (localStorage.getItem(animeKey)) setAnimeSuggestionDismissed(true)
      if (localStorage.getItem(dupKey))   setDuplicateDismissed(true)
    } catch { /* localStorage unavailable */ }
  }, [animeKey, dupKey])

  // ── Episode list ──────────────────────────────────────────────────────────
  const [episodes, setEpisodes] = useState<JikanEpisode[]>([])
  const [episodesLoading, setEpisodesLoading] = useState(false)
  const [episodesExpanded, setEpisodesExpanded] = useState(false)
  const [episodeHasNext, setEpisodeHasNext] = useState(false)
  const [episodePage, setEpisodePage] = useState(1)
  const [episodeSynopses, setEpisodeSynopses] = useState<Record<number, string | null>>({})
  const [episodeSynopsisLoading, setEpisodeSynopsisLoading] = useState<number | null>(null)
  const [expandedEpisodes, setExpandedEpisodes] = useState<Set<number>>(new Set())

  // ── MangaDex chapters ─────────────────────────────────────────────────────
  const [mdxChapters, setMdxChapters] = useState<MangaDexChapter[]>([])
  const [mdxChaptersLoading, setMdxChaptersLoading] = useState(false)
  const [mdxChaptersExpanded, setMdxChaptersExpanded] = useState(false)
  const [mdxChaptersTotal, setMdxChaptersTotal] = useState(0)

  // ── Merge panel ───────────────────────────────────────────────────────────
  const [merging, setMerging] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeSelected, setMergeSelected] = useState<Set<string>>(new Set())
  const [mergingMulti, setMergingMulti] = useState(false)

  // ── Modals ────────────────────────────────────────────────────────────────
  const [showSeriesMap, setShowSeriesMap] = useState(false)
  const [showDeepSearch, setShowDeepSearch] = useState(false)
  const [showUrlImport, setShowUrlImport] = useState(false)
  const [addingRelId, setAddingRelId] = useState<string | null>(null)

  const relatedAnime = jikanRelations.filter(r => r.type === 'anime')
  const hasSeriesRelations = jikanRelations.length > 0

  // ── Duplicate detection (derived, no setState-in-effect) ─────────────────
  const duplicateCandidate = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const tokens = (s: string) => new Set(normalize(s).split(/\s+/).filter(Boolean))
    const myTokens = tokens(manga.title)
    return allManga.find(m => {
      if (m.id === manga.id) return false
      if (manga.series_id && m.series_id === manga.series_id) return false
      const theirTokens = tokens(m.title)
      const overlap = [...myTokens].filter(t => theirTokens.has(t)).length
      const jaccard = overlap / (myTokens.size + theirTokens.size - overlap)
      return jaccard >= 0.7
    }) ?? null
  }, [manga.id, manga.title, manga.series_id, allManga])

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const confirmAnimeSuggestion = async () => {
    if (!suggestedAnime) return
    await supabase.from('manga_list').update({
      has_anime: true,
      anime_mal_id: suggestedAnime.idMal || null,
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

  const loadEpisodes = useCallback(async (page = 1) => {
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
  }, [manga.content_type, manga.mal_id, manga.anime_mal_id])

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

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-end lg:items-stretch lg:justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl lg:rounded-l-2xl lg:rounded-t-none w-full lg:w-[380px] max-h-[90vh] lg:max-h-none overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Drag handle on mobile */}
        <div className="flex justify-center pt-3 pb-1 md:hidden">
          <div className="w-10 h-1 bg-zinc-700 rounded-full" />
        </div>

        <div className="p-5">
          {/* ── Header: cover + title + status ─────────────────────────── */}
          <div className="flex gap-4 mb-4">
            {manga.cover_url && (
              // eslint-disable-next-line @next/next/no-img-element
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

              {/* IMDb rating — isolated loading (no skeleton; shows nothing until ready) */}
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
                            .then(r => r.json()).then(j => { if (j.Response === 'True') { setOmdbOverride({ imdbRating: j.imdbRating ?? null, imdbID: j.imdbID ?? null }) } }).catch(() => {})
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
                          .then(r => r.json()).then(j => { if (j.Response === 'True') { setOmdbOverride({ imdbRating: j.imdbRating ?? null, imdbID: j.imdbID ?? null }) } }).catch(() => {})
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

          {/* ── Progress stats ─────────────────────────────────────────── */}
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
                  if (manga.mal_id) {
                    fetch('/api/community-totals', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ mal_id: manga.mal_id, content_type: manga.content_type ?? 'manga', total_chapters: n }),
                    }).catch(() => {})
                  }
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
              <div className="flex items-center gap-1 ml-auto">
                <EditableNumber
                  value={manga.total_episodes ?? 0}
                  label="Total episodes"
                  className="text-xs text-zinc-400 w-10"
                  onSave={async (n) => {
                    await supabase.from('manga_list').update({ total_episodes: n }).eq('id', manga.id)
                    const epMalId = manga.anime_mal_id ?? manga.mal_id
                    if (epMalId) {
                      fetch('/api/community-totals', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mal_id: epMalId, content_type: 'anime', total_episodes: n }),
                      }).catch(() => {})
                    }
                  }}
                />
                <span className="text-xs text-zinc-500">eps</span>
              </div>
            </div>
          )}

          {/* ── Action buttons ─────────────────────────────────────────── */}
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

          {/* Series Map button */}
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
              {relationsLoading && <span className="text-zinc-600">Loading…</span>}
            </button>
          )}

          {manga.notes && (
            <div className="bg-zinc-800 rounded-lg p-3 mb-4">
              <p className="text-xs text-zinc-400 leading-relaxed">{manga.notes}</p>
            </div>
          )}

          {/* ── MangaUpdates badges (isolated loading) ─────────────────── */}
          {muLoading && <Skeleton className="h-6 w-32 mb-4" />}
          {!muLoading && muError && muKey && (
            <p className="text-[10px] text-zinc-600 mb-4">Could not load MangaUpdates data.</p>
          )}
          {!muLoading && muData && (muData.release_frequency !== 'unknown' || muData.scanlation_group) && (
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

          {/* ── Duplicate detection banner ─────────────────────────────── */}
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

          {/* ── Anime adaptation suggestion banner ────────────────────── */}
          {suggestedAnime && !animeSuggestionDismissed && !animeSuggestionConfirmed && (
            <div className="bg-violet-900/20 border border-violet-500/30 rounded-xl p-3 mb-4">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-violet-300">Anime adaptation found</p>
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

          {/* ── Airing countdown (AniList anime) ─────────────────────── */}
          {alLoading && !alAnime && manga.has_anime && (
            <Skeleton className="h-10 rounded-xl mb-4" />
          )}
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

          {/* ── Streaming links (AniList) — isolated loading ──────────── */}
          {alLoading && manga.has_anime && (
            <Skeleton className="h-20 rounded-xl mb-4" />
          )}
          {!alLoading && alAnime && (alAnime.streamingLinks ?? []).length > 0 && (() => {
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

          {/* ── notify.moe scores — isolated loading + skeleton ───────── */}
          {notifyLoading && <ScoresSkeleton />}
          {!notifyLoading && notifyError && notifyKey && (
            <p className="text-[10px] text-zinc-600 mb-4">Could not load notify.moe scores.</p>
          )}
          {!animeMalIdForNotify && (manga.has_anime || manga.content_type === 'anime' || manga.content_type === 'movie') && onSync && (
            <button
              onClick={() => onSync(manga.id)}
              className="text-xs text-zinc-400 hover:text-white underline italic px-1"
            >
              Sync to load anime scores &amp; streaming links →
            </button>
          )}
          {!notifyLoading && notifyMoe?.rating && (() => {
            const r = notifyMoe.rating
            const bars: { label: string; value: number; color: string }[] = [
              { label: 'Overall',    value: r.overall,    color: '#2BE6DC' },
              { label: 'Story',      value: r.story,      color: '#a78bfa' },
              { label: 'Visuals',    value: r.visuals,    color: '#FF8C42' },
              { label: 'Soundtrack', value: r.soundtrack, color: '#2FCF7A' },
            ]
            return (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-zinc-500">notify.moe Community Scores</p>
                  <a href={notifyMoe.url} target="_blank" rel="noopener noreferrer"
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1">
                    View on notify.moe ↗
                  </a>
                </div>
                <div className="bg-zinc-900 rounded-xl p-3 space-y-2">
                  {bars.map(b => (
                    <div key={b.label} className="flex items-center gap-3">
                      <span className="text-[10px] text-zinc-500 w-20 shrink-0">{b.label}</span>
                      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${Math.min(100, b.value * 10)}%`, backgroundColor: b.color }} />
                      </div>
                      <span className="text-[10px] text-zinc-400 w-7 text-right shrink-0 font-mono">{b.value.toFixed(1)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── AniList external links ────────────────────────────────── */}
          {alAnime && alAnime.externalLinks && alAnime.externalLinks.length > 0 && (() => {
            const SITE_ICONS: Record<string, string> = {
              'AniDB': '🗄️', 'Anime-Planet': '🪐', 'Annict': '📺',
              'Kitsu': '🐱', 'LiveChart.me': '📊', 'AllCinema': '🎬',
              'Syoboi': '📅', 'ANN': '📰', 'Wikipedia': '📖',
            }
            const infoLinks = alAnime.externalLinks.filter(l => l.type === 'INFO' || l.type === 'OTHER')
            if (!infoLinks.length) return null
            return (
              <div className="mb-4">
                <p className="text-xs font-medium text-zinc-500 mb-2">Also on</p>
                <div className="flex flex-wrap gap-1.5">
                  {infoLinks.map(l => (
                    <a key={l.site} href={l.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors">
                      <span>{SITE_ICONS[l.site] ?? '🔗'}</span>
                      <span>{l.site}</span>
                      <span className="text-zinc-600 text-[10px]">↗</span>
                    </a>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* ── Wikipedia — isolated loading + skeleton ───────────────── */}
          {wikiLoading && <WikiSkeleton />}
          {!wikiLoading && wikiError && wikiKey && (
            <p className="text-[10px] text-zinc-600 mb-4">Could not load Wikipedia data.</p>
          )}
          {!wikiLoading && wikiData && (
            <div className="mb-4">
              <button
                onClick={() => setWikiExpanded(p => !p)}
                className="flex items-center justify-between w-full text-left mb-2 group"
              >
                <p className="text-xs font-medium text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  📖 Wikipedia
                </p>
                <span className="text-zinc-600 text-xs">{wikiExpanded ? '▲' : '▼'}</span>
              </button>
              <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                {wikiData.summary}
              </p>
              {wikiExpanded && (
                <div className="mt-3 space-y-2">
                  {[
                    { label: 'Author', value: wikiData.author },
                    { label: 'Illustrator', value: wikiData.illustrator },
                    { label: 'Publisher', value: wikiData.publisher },
                    { label: 'Serialized in', value: wikiData.serializedIn },
                    { label: 'Original run', value: wikiData.originalRun },
                    { label: 'Volumes', value: wikiData.volumes },
                    { label: 'Episodes', value: wikiData.episodes },
                    { label: 'Directed by', value: wikiData.directed },
                    { label: 'Studio', value: wikiData.studio },
                  ].filter(f => f.value).map(f => (
                    <div key={f.label} className="flex gap-2 text-xs">
                      <span className="text-zinc-500 shrink-0 w-24">{f.label}</span>
                      <span className="text-zinc-300">{f.value}</span>
                    </div>
                  ))}
                  {wikiData.genres && wikiData.genres.length > 0 && (
                    <div className="flex gap-2 text-xs">
                      <span className="text-zinc-500 shrink-0 w-24">Genres</span>
                      <span className="text-zinc-300">{wikiData.genres.join(', ')}</span>
                    </div>
                  )}
                  {wikiData.arcSummary && (
                    <div className="mt-2">
                      <p className="text-xs text-zinc-500 mb-1">Story arcs / chapters</p>
                      <p className="text-xs text-zinc-400 leading-relaxed">{wikiData.arcSummary}</p>
                    </div>
                  )}
                  <a href={wikiData.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors mt-1">
                    Read on Wikipedia ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* ── AniList tags ─────────────────────────────────────────── */}
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

          {/* ── AniList relations — isolated loading + skeleton ───────── */}
          {alLoading && <RelationsSkeleton />}
          {!alLoading && (alMangaError || alAnimeError) && alMangaKey && (
            <p className="text-[10px] text-zinc-600 mb-4">Could not load AniList data.</p>
          )}
          {!alLoading && alManga && alManga.relations.filter(r => RELATION_LABELS[r.relationType]).length > 0 && (
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
                        <div className="flex items-center gap-1 flex-wrap">
                          {inList && rel.node.type === 'MANGA' && (
                            <RelationMergeButton keep={manga} remove={inList} onMerge={onMerge} />
                          )}
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

          {/* ── Related anime (Jikan) ─────────────────────────────────── */}
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
                            >
                              {addingRelId === libKey ? '…' : '+ Lib'}
                            </button>
                            <button
                              onClick={() => addRelationEntry(rel.mal_id, rel.name, true, null, true)}
                              disabled={addingRelId === serKey}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 hover:bg-violet-500/40 transition-colors"
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

          {/* ── AniList community recs ────────────────────────────────── */}
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

          {/* ── Similar in your list ──────────────────────────────────── */}
          {(() => {
            if (!manga.genres?.length) return null
            const myGenres = new Set(manga.genres)
            const similar = allManga
              .filter(m => m.id !== manga.id && m.genres?.length)
              .map(m => {
                const overlap = m.genres.filter((g: string) => myGenres.has(g)).length
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
                      {sm.cover_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={sm.cover_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />
                      )}
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

          {/* ── Jikan recommendations — isolated loading + skeleton ───── */}
          {jikanRecsLoading && <RecsSkeleton />}
          {!jikanRecsLoading && jikanRecsError && jikanRecsKey && (
            <p className="text-[10px] text-zinc-600 mb-4">Could not load MAL recommendations.</p>
          )}
          {!jikanRecsLoading && jikanRecs.length > 0 && (
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

          {/* ── MangaUpdates recs ─────────────────────────────────────── */}
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

          {/* ── Re-read / Re-watch ────────────────────────────────────── */}
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

          {/* ── Auto-tracked badge ────────────────────────────────────── */}
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

          {/* ── Episode list (Jikan) — isolated loading ───────────────── */}
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

          {/* ── MangaDex chapters — isolated loading ──────────────────── */}
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

          {/* ── Series grouping ───────────────────────────────────────── */}
          <SeriesPanel
            primary={manga}
            allManga={allManga}
            onUpdated={onSeriesUpdated}
            onAdded={onSeriesEntryAdded}
          />

          {/* ── Merge panel ───────────────────────────────────────────── */}
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
                    <input
                      type="text"
                      value={mergeQuery}
                      onChange={e => setMergeQuery(e.target.value)}
                      placeholder="Search your library…"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                      autoFocus
                    />
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
                            <span className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] transition-colors ${
                              checked
                                ? 'border-[var(--vermillion)] bg-[var(--vermillion)] text-white'
                                : 'border-zinc-600 bg-transparent'
                            }`}>
                              {checked && '✓'}
                            </span>
                            {m.cover_url && (
                              // eslint-disable-next-line @next/next/no-img-element
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

      {/* ── Sub-modals ─────────────────────────────────────────────── */}
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
