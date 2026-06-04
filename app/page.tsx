'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import Image from 'next/image'
import { supabase, type Manga, type MangaStatus, type Author } from '@/lib/supabase'
import { fetchMangaInfo, getAuthorWorks, getAuthorInfo, getMangaById, getAnimeAdaptations, type JikanSearchResult } from '@/lib/jikan'
import TrendingSection from '@/components/TrendingSection'
import ArcEditor from '@/components/ArcEditor'
import SessionTimer, { type ActiveSession } from '@/components/SessionTimer'
import RereadSection from '@/components/RereadSection'
import type { Arc } from '@/components/ArcEditor'
import type { Recommendation } from '@/app/api/recommend/route'
import type { AniListMangaData, AniListAnimeData } from '@/lib/anilist'
import { RELATION_LABELS, formatCountdown } from '@/lib/anilist'
import type { MUSeriesData } from '@/lib/mangaupdates'
import type { ANNRelatedWork } from '@/lib/ann'
import MangaFact from '@/components/MangaFact'

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
  watching:     'Watching',
}

const STATUS_COLORS: Record<MangaStatus, string> = {
  reading:      'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  completed:    'bg-blue-500/20 text-blue-300 border-blue-500/30',
  on_hold:      'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  dropped:      'bg-red-500/20 text-red-300 border-red-500/30',
  plan_to_read: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30',
  watching:     'bg-violet-500/20 text-violet-300 border-violet-500/30',
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
function DetailModal({ manga, allManga, onClose, onStatusChange, onMerge }: {
  manga: Manga
  allManga: Manga[]
  onClose: () => void
  onStatusChange: (id: string, status: MangaStatus) => void
  /** Called with the ID of the entry that was deleted during a merge */
  onMerge: (removedId: string) => void
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
  }, [manga.mal_id, manga.anime_mal_id, manga.has_anime, manga.title])

  // Duplicate detection: derived via useMemo to avoid setState-in-effect
  const duplicateCandidate = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const tokens = (s: string) => new Set(normalize(s).split(/\s+/).filter(Boolean))
    const myTokens = tokens(manga.title)
    return allManga.find(m => {
      if (m.id === manga.id) return false
      const theirTokens = tokens(m.title)
      const overlap = [...myTokens].filter(t => theirTokens.has(t)).length
      const jaccard = overlap / (myTokens.size + theirTokens.size - overlap)
      return jaccard >= 0.7
    }) ?? null
  }, [manga.id, manga.title, allManga])

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
    // Keep the one with more reading progress; use the other's data to fill gaps
    const keeper = manga.current_chapter >= duplicateCandidate.current_chapter ? manga : duplicateCandidate
    const removed = keeper.id === manga.id ? duplicateCandidate : manga
    await supabase.from('manga_list').update({
      current_chapter: Math.max(manga.current_chapter, duplicateCandidate.current_chapter),
      total_chapters: manga.total_chapters ?? duplicateCandidate.total_chapters,
      genres: manga.genres?.length ? manga.genres : duplicateCandidate.genres,
      authors: manga.authors?.length ? manga.authors : duplicateCandidate.authors,
      notes: manga.notes ?? duplicateCandidate.notes,
    }).eq('id', keeper.id)
    await supabase.from('manga_list').delete().eq('id', removed.id)
    setMerging(false)
    onMerge(removed.id)  // parent removes the deleted entry from allManga state immediately
    onClose()
  }

  const STATUS_LABELS: Record<MangaStatus, string> = {
    reading: 'Reading', completed: 'Completed', on_hold: 'On Hold',
    dropped: 'Dropped', plan_to_read: 'Plan to Read', watching: 'Watching',
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
              <p className="text-xs font-medium text-amber-300 mb-1">Possible duplicate detected</p>
              <p className="text-xs text-zinc-400 mb-2">
                &ldquo;{duplicateCandidate.title}&rdquo; looks very similar to this entry. Merge them?
              </p>
              <div className="flex gap-2">
                <button onClick={mergeDuplicate} disabled={merging}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition-colors">
                  {merging ? 'Merging…' : 'Merge (keep best progress)'}
                </button>
                <button onClick={() => { try { localStorage.setItem(dupKey, '1') } catch {} setDuplicateDismissed(true) }}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors">
                  Not a duplicate
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
              <span className="text-violet-400 text-sm">📺</span>
              <div>
                <span className="text-xs font-medium text-violet-300">
                  Ep. {alAnime.nextAiringEpisode.episode} airing in {formatCountdown(alAnime.nextAiringEpisode.timeUntilAiring)}
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
                    return (
                    <a key={i} href={malUrl ?? '#'} target={malUrl ? '_blank' : undefined}
                      rel="noopener noreferrer"
                      className="shrink-0 w-24 group"
                      style={{ textDecoration: 'none', cursor: malUrl ? 'pointer' : 'default' }}>
                      <div className="relative w-24 h-32 rounded-xl overflow-hidden bg-zinc-800 mb-1.5 group-hover:opacity-80 transition-opacity">
                        {rel.node.coverImage?.medium && (
                          <Image src={rel.node.coverImage.medium} alt={rel.node.title.romaji}
                            fill className="object-cover" unoptimized />
                        )}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/70 px-1.5 py-1">
                          <span className={`text-[10px] font-medium ${
                            rel.relationType === 'SEQUEL' ? 'text-emerald-400' :
                            rel.relationType === 'PREQUEL' ? 'text-blue-400' :
                            rel.relationType === 'ADAPTATION' ? 'text-violet-400' :
                            'text-zinc-400'
                          }`}>{RELATION_LABELS[rel.relationType]}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-zinc-500 leading-tight line-clamp-2">{rel.node.title.romaji}</p>
                    </a>
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
                  {similar.map(({ m, score }) => (
                    <div key={m.id} className="flex items-center gap-2.5 bg-zinc-800 rounded-xl px-3 py-2">
                      {m.cover_url && <img src={m.cover_url} alt="" className="w-7 h-9 object-cover rounded shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{m.title}</p>
                        <p className="text-xs text-zinc-600">
                          {m.genres.filter(g => myGenres.has(g)).slice(0, 2).join(', ')}
                        </p>
                      </div>
                      <span className="text-xs text-violet-400 shrink-0">{Math.round(score * 100)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })()}

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

          <RereadSection mangaId={manga.id} />

          <ArcEditor
            mangaId={manga.id}
            totalChapters={manga.total_chapters}
            currentChapter={manga.current_chapter}
          />

          <button onClick={onClose}
            className="w-full mt-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl text-sm text-zinc-300 transition-colors">
            Close
          </button>
        </div>
      </div>
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
    else if (error.code === '23505') setToast('Already in your list')
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
    dropped: 'Dropped', plan_to_read: 'Plan to Read', watching: 'Watching',
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
      setToast(error?.code === '23505' ? 'Already in your list' : 'Added to your list!')
    } else {
      setToast('Failed to add — try again')
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
                ✓ {toast || 'Added to your list'}
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
          </div>
        )}
        <button onClick={onClose} className="mt-4 w-full py-2 text-xs text-zinc-600 hover:text-zinc-400">Close</button>
      </div>
    </div>
  )
}

function MobileMenu({ onRecommend, onSync, onSignOut, onExport, onShare, loadingRec, syncing }: {
  onRecommend: () => void; onSync: () => void; onSignOut: () => void; onExport: () => void; onShare: () => void
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
            <button onClick={() => { onShare(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>🔗</span> Share list
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
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState('')
  const [showRecModal, setShowRecModal] = useState(false)
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null)
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<{ updated: number; results: { title: string; changes: string[] }[]; timestamp: string } | null>(null)
  const [notifications, setNotifications] = useState<{ id: string; title: string; new_chapters: number; previous_chapters: number }[]>([])
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null)
  const [shelfPickerManga, setShelfPickerManga] = useState<Manga | null>(null)
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null)
  const [mood, setMood] = useState<string | null>(null)
  const [watchPrompt, setWatchPrompt] = useState<{ id: string; epInput: string } | null>(null)
  const [pacePerDay, setPacePerDay] = useState(0)
  const [shareModal, setShareModal] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [arcsMap, setArcsMap] = useState<Record<string, Arc[]>>({})
  const [rereadCounts, setRereadCounts] = useState<Record<string, number>>({})

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
  }, [])

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
    // Intercept "watching" — ask for episode count first
    if (status === 'watching') {
      const m = manga.find(m => m.id === id)
      setWatchPrompt({ id, epInput: String(m?.episodes_watched ?? 0) })
      return
    }
    const prev_status = manga.find(m => m.id === id)?.status
    setManga(prev => prev.map(m => m.id === id ? { ...m, status } : m))
    const { error } = await supabase.from('manga_list').update({ status }).eq('id', id)
    if (error) {
      showToast('Failed to update status')
      if (prev_status) setManga(prev => prev.map(m => m.id === id ? { ...m, status: prev_status } : m))
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
    showToast(`Now watching — ep. ${ep} logged`)
    setWatchPrompt(null)
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
    // Update chapter count
    if (chaptersRead > 0) {
      const m = manga.find(m => m.id === activeSession.mangaId)
      if (m) await updateChapter(activeSession.mangaId, chaptersRead, m.current_chapter)
    }
    // Log with duration
    await supabase.from('reading_log').insert({
      manga_id: activeSession.mangaId,
      chapters_read: chaptersRead,
      duration_minutes: durationMinutes,
      logged_at: now,
    })
    showToast(`Session logged — ${chaptersRead} ch in ${durationMinutes} min`)
    setActiveSession(null)
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
    setRecommendations([])
    setRecError('')
    setShowRecModal(true)   // open modal immediately so user sees "Asking Claude…"
    try {
      // Include genres so the algorithm can match preferences
      const payload = manga.map(m => ({
        title: m.title,
        current_chapter: m.current_chapter,
        status: m.status,
        genres: m.genres ?? [],
        mal_id: m.mal_id,
      }))

      // Also send right-swiped genre preferences from Discover history
      const { data: swipeData } = await supabase
        .from('swipe_history')
        .select('genres')
        .eq('direction', 'right')
        .limit(200)
      const likedGenres = [...new Set((swipeData ?? []).flatMap(s => s.genres))]
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manga: payload, likedGenres }),
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

  const MOODS: { id: string; label: string; test: (m: Manga) => boolean }[] = [
    { id: 'quick',     label: '⚡ Quick',      test: m => !!m.total_chapters && m.total_chapters <= 100 },
    { id: 'epic',      label: '⚔️ Epic',        test: m => !!m.total_chapters && m.total_chapters >= 300 },
    { id: 'light',     label: '☁️ Light',       test: m => m.genres.some(g => ['Comedy','Slice of Life'].includes(g)) },
    { id: 'dark',      label: '🌑 Dark',        test: m => m.genres.some(g => ['Horror','Psychological','Thriller'].includes(g)) },
    { id: 'action',    label: '💥 Action',      test: m => m.genres.some(g => ['Action','Martial Arts'].includes(g)) },
    { id: 'heartfelt', label: '💙 Heartfelt',   test: m => m.genres.some(g => ['Romance','Drama'].includes(g)) },
  ]

  const filtered = manga
    .filter(m => filter === 'all' || m.status === filter)
    .filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))
    .filter(m => !mood || MOODS.find(mo => mo.id === mood)?.test(m))
    .sort(sortFn)

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-6 md:py-10">

        {/* Header — responsive */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Manga Tracker</h1>
            <p className="text-zinc-500 text-xs md:text-sm mt-0.5">{manga.length} titles</p>
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
            <button onClick={exportCSV} aria-label="Export list as CSV"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
              ↓ Export
            </button>
            <button onClick={() => setShareModal(true)} aria-label="Share my list"
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
              🔗 Share
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
              onShare={() => setShareModal(true)}
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

        {/* Trending section — reads excluded genres from localStorage (set on Search page) */}
        <TrendingSection
          onSelect={rec => setSelectedRec(rec)}
          excludeGenreIds={(() => {
            try { return JSON.parse(localStorage.getItem('excluded_genres') ?? '[]') } catch { return [] }
          })()}
        />

        {/* Stats — 2 cols on mobile, responsive on desktop (hide watching if 0) */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-5">
          {(Object.keys(STATUS_LABELS) as MangaStatus[]).filter(s => s !== 'watching' || (counts.watching ?? 0) > 0).map(s => (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`rounded-xl p-3 text-center transition-colors ${filter === s ? 'bg-white text-black' : 'bg-zinc-900 hover:bg-zinc-800'}`}>
              <div className="text-xl font-bold">{counts[s] ?? 0}</div>
              <div className={`text-xs mt-0.5 ${filter === s ? 'text-zinc-600' : 'text-zinc-500'}`}>{STATUS_LABELS[s]}</div>
            </button>
          ))}
        </div>

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
                  <span className="text-sm">📚</span>
                  <span className="text-sm font-medium">
                    {totalUnread.toLocaleString()} unread chapters
                  </span>
                  <span className="text-xs text-zinc-500">across {reading.length} series</span>
                </div>
                {weeksLeft !== null && (
                  <span className="text-xs text-zinc-500">
                    ~{weeksLeft < 1 ? 'this week' : weeksLeft === 1 ? '1 week' : `${weeksLeft} weeks`} at your pace
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
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                mood === mo.id
                  ? 'bg-violet-600/30 border-violet-500/50 text-violet-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
              }`}>
              {mo.label}
            </button>
          ))}
          {mood && <button onClick={() => setMood(null)} className="text-xs text-zinc-600 hover:text-zinc-400 px-2">✕ clear</button>}
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
          <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
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

                    {/* Authors — clickable */}
                    {m.authors?.length > 0 && (
                      <div className="flex gap-1 flex-wrap mt-0.5 mb-1">
                        {m.authors.map((a: Author) => (
                          <button key={a.id} onClick={() => setSelectedAuthor(a)}
                            className="text-xs text-zinc-500 hover:text-violet-400 transition-colors">
                            {a.name}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <select
                        value={m.status}
                        onChange={e => updateStatus(m.id, e.target.value as MangaStatus)}
                        aria-label={`Status for ${m.title}`}
                        className={`text-xs px-2 py-0.5 rounded-full border bg-transparent cursor-pointer outline-none ${STATUS_COLORS[m.status]}`}
                      >
                        {(Object.keys(STATUS_LABELS) as MangaStatus[])
                          .filter(s => s !== 'watching' || m.has_anime)
                          .map(s => (
                            <option key={s} value={s} className="bg-zinc-900 text-white">{STATUS_LABELS[s]}</option>
                          ))}
                      </select>
                      <span className="text-xs text-zinc-600" aria-label={`Last read ${timeAgo(m.last_read_at)}`}>{timeAgo(m.last_read_at)}</span>
                      {m.status === 'reading' && finishEstimate(m) && (
                        <span className="text-xs text-zinc-600" title="Estimated finish at your current reading pace">
                          🏁 {finishEstimate(m)}
                        </span>
                      )}
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
                    {/* Arc-aware progress */}
                    {(() => {
                      const arc = currentArc(m)
                      const rereadCount = rereadCounts[m.id] ?? 0
                      if (!arc && !rereadCount) return null
                      return (
                        <div className="flex items-center gap-2 mt-1">
                          {arc && (
                            <span className="text-xs text-zinc-600 truncate" title={`${arc.tag} arc`}>
                              📍 {arc.label}
                            </span>
                          )}
                          {rereadCount > 0 && (
                            <span className="text-xs text-violet-500 shrink-0">×{rereadCount} re-read</span>
                          )}
                        </div>
                      )
                    })()}

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
                        {m.status === 'reading' && (
                          <button
                            onClick={() => activeSession?.mangaId === m.id ? setActiveSession(null) : startSession(m)}
                            aria-label={activeSession?.mangaId === m.id ? 'Stop session' : `Start reading session for ${m.title}`}
                            title={activeSession?.mangaId === m.id ? 'Stop session' : 'Start reading session'}
                            className={`ml-1 text-sm leading-none transition-colors ${
                              activeSession?.mangaId === m.id
                                ? 'text-violet-400 animate-pulse'
                                : 'text-zinc-700 hover:text-violet-400'
                            }`}
                          >
                            {activeSession?.mangaId === m.id ? '⏱' : '▶'}
                          </button>
                        )}
                        <button
                          onClick={() => setShelfPickerManga(m)}
                          aria-label={`Add ${m.title} to shelf`}
                          title="Add to shelf"
                          className="ml-1 text-zinc-700 hover:text-violet-400 transition-colors text-sm leading-none"
                        >
                          📂
                        </button>
                        <button
                          onClick={() => confirmDelete(m.id)}
                          aria-label={`Delete ${m.title}`}
                          className="text-zinc-700 hover:text-red-400 transition-colors text-lg leading-none"
                        >
                          ×
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Watching episode prompt */}
                {watchPrompt?.id === m.id && (
                  <div className="border-t border-zinc-800 px-3 py-3 bg-violet-900/10">
                    <p className="text-xs text-violet-300 font-medium mb-2">📺 How many episodes have you watched?</p>
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
                    Try again
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
                            {r.isAnime && <span className="text-xs px-1.5 py-0.5 bg-violet-500/20 text-violet-400 rounded-full">anime</span>}
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
