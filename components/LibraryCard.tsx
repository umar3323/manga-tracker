'use client'

import Image from 'next/image'
import {
  Timer, Play, Clapperboard, PenLine, Flag, Tv, Search,
  RefreshCw, MapPin,
} from 'lucide-react'
import { supabase, type Manga, type MangaStatus, type Author } from '@/lib/supabase'
import { EditableNumber } from '@/components/DetailView'
import { deepDiveSeries } from '@/lib/data/takeout-series'
import type { Arc } from '@/components/ArcEditor'
import type { ActiveSession } from '@/components/SessionTimer'

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

export interface LibraryCardProps {
  m: Manga
  /** All members of this card's series (empty if not in a series) */
  seriesMembers: Manga[]
  arcs: Arc[]
  rereadCount: number
  rewatchCount: number
  expandedNotes: boolean
  expandedSynopsis: boolean
  deepSelectMode: boolean
  deepSelected: boolean
  refreshingId: string | null
  watchPromptId: string | null
  watchPromptInput: string
  activeSession: ActiveSession | null
  finishEstimate: string | null
  onStatusChange: (id: string, status: MangaStatus) => void
  onChapterUpdate: (id: string, delta: number, current: number) => void
  onEpisodeUpdate: (id: string, delta: number, current: number) => void
  onTotalChaptersUpdate: (id: string, n: number, malId?: number | null, contentType?: string | null) => void
  onTotalEpisodesUpdate: (id: string, n: number, malId?: number | null, contentType?: string | null) => void
  onNotesToggle: (id: string) => void
  onNotesChange: (id: string, notes: string) => void
  onSynopsisToggle: (id: string) => void
  onDelete: (id: string) => void
  onRefresh: (m: Manga) => void
  onOpenDetail: (m: Manga) => void
  onAuthorClick: (a: Author) => void
  onStudioClick: (a: Author) => void
  onShelfPick: (m: Manga) => void
  onStartSession: (m: Manga) => void
  onStopSession: () => void
  onDeepSelectToggle: (id: string) => void
  onRatingChange: (id: string, rating: 'up' | 'down' | null) => void
  onPublicReviewToggle: (id: string, val: boolean) => void
  onWatchPromptInputChange: (id: string, val: string) => void
  onWatchPromptConfirm: () => void
  onWatchPromptCancel: () => void
}

export default function LibraryCard({
  m,
  seriesMembers,
  arcs,
  rereadCount,
  rewatchCount,
  expandedNotes,
  expandedSynopsis,
  deepSelectMode,
  deepSelected,
  refreshingId,
  watchPromptId,
  watchPromptInput,
  activeSession,
  finishEstimate,
  onStatusChange,
  onChapterUpdate,
  onEpisodeUpdate,
  onTotalChaptersUpdate,
  onTotalEpisodesUpdate,
  onNotesToggle,
  onNotesChange,
  onSynopsisToggle,
  onDelete,
  onRefresh,
  onOpenDetail,
  onAuthorClick,
  onStudioClick,
  onShelfPick,
  onStartSession,
  onStopSession,
  onDeepSelectToggle,
  onRatingChange,
  onPublicReviewToggle,
  onWatchPromptInputChange,
  onWatchPromptConfirm,
  onWatchPromptCancel,
}: LibraryCardProps) {
  const currentArc = arcs.find(a => m.current_chapter >= a.chapter_start && m.current_chapter <= a.chapter_end) ?? null

  // Series-aware episode totals
  const epMembers = seriesMembers.filter(e => e.has_anime)
  const seriesEpCurrent = epMembers.length > 1 ? epMembers.reduce((s, e) => s + e.episodes_watched, 0) : m.episodes_watched
  const seriesEpTotal = epMembers.length > 1 ? (epMembers.reduce((s, e) => s + (e.total_episodes ?? 0), 0) || null) : m.total_episodes
  const activeEpMember = epMembers.length > 1
    ? epMembers.find(e => !e.total_episodes || e.episodes_watched < e.total_episodes) ?? m
    : m

  // Series-aware chapter totals
  const members = seriesMembers
  const seriesCurrent = members.length > 1 ? members.reduce((s, e) => s + e.current_chapter, 0) : m.current_chapter
  const seriesTotal = members.length > 1 ? members.reduce((s, e) => s + (e.total_chapters ?? 0), 0) || null : m.total_chapters
  const partCount = members.length
  const activeMember = members.length > 1
    ? members.find(e => !e.total_chapters || e.current_chapter < e.total_chapters) ?? m
    : m

  const ct = m.content_type ?? 'manga'
  const isAnimePrimary = ct === 'anime'
  const isMangaPrimary = ct !== 'anime'

  const SITE_LABEL_MAP: Record<string, string> = {
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

  const typeStyles: Record<string, { bg: string; color: string; border: string }> = {
    manga:   { bg: 'rgba(113,113,122,0.18)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.35)' },
    manhwa:  { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.3)' },
    webtoon: { bg: 'rgba(251,146,60,0.12)',  color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' },
    manhua:  { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' },
    anime:   { bg: 'rgba(34,211,238,0.10)',  color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' },
    movie:   { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' },
  }
  const typeStyle = typeStyles[ct] ?? typeStyles.manga
  const animeStyle = typeStyles.anime
  const showAnimeBadge = m.has_anime && ct !== 'anime' && ct !== 'movie'

  return (
    <div
      className={`bg-zinc-900 border rounded-xl overflow-hidden flex flex-col h-full transition-colors ${deepSelectMode ? (deepSelected ? 'border-violet-500 ring-1 ring-violet-500/40' : 'border-zinc-700 cursor-pointer hover:border-zinc-600') : 'border-zinc-800'}`}
      onClick={deepSelectMode ? () => onDeepSelectToggle(m.id) : undefined}
    >
      {deepSelectMode && (
        <div className="px-3 pt-2.5 pb-0 flex items-center gap-2 text-xs text-zinc-400">
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${deepSelected ? 'bg-violet-600 border-violet-600 text-white' : 'border-zinc-600'}`}>
            {deepSelected && <span className="text-[10px] leading-none">✓</span>}
          </div>
          <span className="truncate">{m.title}</span>
        </div>
      )}

      <div className="flex gap-3 p-3 flex-1" onClick={deepSelectMode ? e => e.stopPropagation() : undefined}>

        {/* Cover */}
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

        {/* Info */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">

          {/* 1. Title + author */}
          <div>
            <div className="flex items-start gap-1.5 min-w-0">
              {m.publishing_status && m.status === 'reading' && (
                <span title={m.publishing_status} className="shrink-0 w-2 h-2 rounded-full mt-[5px]"
                  style={{ backgroundColor: m.publishing_status === 'Publishing' ? '#2FCF7A' : m.publishing_status === 'On Hiatus' ? '#FFB02E' : '#52525b' }} />
              )}
              <button onClick={() => onOpenDetail(m)}
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
              <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide font-semibold whitespace-nowrap"
                style={{ background: typeStyle.bg, color: typeStyle.color, border: typeStyle.border }}>
                {ct}
              </span>
              {showAnimeBadge && (
                <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide font-semibold whitespace-nowrap"
                  style={{ background: animeStyle.bg, color: animeStyle.color, border: animeStyle.border }}>
                  anime
                </span>
              )}
            </div>

            {m.authors?.length > 0 ? (
              <div className="flex gap-1 flex-wrap mt-0.5 items-center">
                {(ct === 'anime' || ct === 'movie') && (
                  <span className="text-[10px] text-zinc-500 mr-0.5">Studio:</span>
                )}
                {m.authors.map((a: Author) => (
                  <button key={a.id}
                    onClick={() => (ct === 'anime' || ct === 'movie') ? onStudioClick(a) : onAuthorClick(a)}
                    className="text-[11px] text-zinc-500 hover:text-violet-400 transition-colors">
                    {a.name}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500 mt-0.5 italic">Unknown {(ct === 'anime' || ct === 'movie') ? 'studio' : 'author'}</p>
            )}
          </div>

          {/* 2. Status dropdown + action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <select value={m.status} onChange={e => onStatusChange(m.id, e.target.value as MangaStatus)}
              aria-label={`Status for ${m.title}`}
              className={`text-xs px-2 py-0.5 rounded-full border bg-transparent cursor-pointer outline-none ${STATUS_COLORS[m.status]}`}>
              {(Object.keys(STATUS_LABELS) as MangaStatus[]).filter(s => (s !== 'watching' && s !== 'unwatched') || m.has_anime).map(s => (
                <option key={s} value={s} className="bg-zinc-900 text-white">{STATUS_LABELS[s]}</option>
              ))}
            </select>
            <span className="text-[11px] text-zinc-600" suppressHydrationWarning>{timeAgo(m.last_read_at)}</span>
            {m.auto_tracked && (() => {
              const sk = m.last_watched_site?.toLowerCase() ?? ''
              const sn = SITE_LABEL_MAP[sk] ?? (m.last_watched_site ? m.last_watched_site.replace(/\.com$/, '') : null)
              const watchHrs = m.total_watch_time_minutes > 0 ? Math.round(m.total_watch_time_minutes / 60 * 10) / 10 + 'h' : null
              return (
                <span title={`Auto-tracked${sn ? ` on ${sn}` : ''}${watchHrs ? ` · ${watchHrs} watched` : ''}`}
                  className="text-[10px] bg-green-950 text-green-400 border border-green-800/50 px-1.5 py-0.5 rounded-full">
                  🎬 {sn ?? 'tracked'}
                </span>
              )
            })()}
            {m.status === 'reading' && finishEstimate && (
              <span className="text-[11px] text-zinc-600 flex items-center gap-1">
                <Flag size={10} strokeWidth={1.5} /> {finishEstimate}
              </span>
            )}
            <button onClick={() => onNotesToggle(m.id)}
              className={`transition-colors ${expandedNotes || m.notes ? 'text-violet-400' : 'text-zinc-700 hover:text-zinc-400'}`}>
              <PenLine size={12} strokeWidth={1.5} />
            </button>
            <div className="ml-auto flex items-center gap-1.5">
              {m.status === 'reading' && (
                <button onClick={() => activeSession?.mangaId === m.id ? onStopSession() : onStartSession(m)}
                  title={activeSession?.mangaId === m.id ? 'Stop session' : 'Start reading session'}
                  className={`transition-colors ${activeSession?.mangaId === m.id ? 'text-violet-400 animate-pulse' : 'text-zinc-700 hover:text-violet-400'}`}>
                  {activeSession?.mangaId === m.id ? <Timer size={13} strokeWidth={1.5} /> : <Play size={13} strokeWidth={1.5} />}
                </button>
              )}
              <button onClick={() => onShelfPick(m)} title="Add to shelf" className="text-zinc-700 hover:text-violet-400 transition-colors">
                {/* Folder icon inline — avoid importing another lucide icon */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
              </button>
              <a href={`/search?q=${encodeURIComponent(m.title)}`} title="Search for more info" className="text-zinc-700 hover:text-cyan-400 transition-colors">
                <Search size={12} strokeWidth={1.5} />
              </a>
              <button onClick={() => onRefresh(m)} disabled={refreshingId === m.id} title="Refresh info"
                className={`transition-colors ${refreshingId === m.id ? 'text-cyan-400 animate-spin' : 'text-zinc-700 hover:text-cyan-400'}`}>
                <RefreshCw size={12} strokeWidth={1.5} />
              </button>
              <button onClick={() => onDelete(m.id)} aria-label={`Delete ${m.title}`} className="text-zinc-700 hover:text-red-400 transition-colors text-lg leading-none">×</button>
            </div>
          </div>

          {/* 3. Description */}
          <p className={`text-[11px] leading-[1.5] ${m.synopsis ? 'text-zinc-500' : 'text-zinc-700 italic'} ${expandedSynopsis ? '' : 'line-clamp-3'}`}
            style={{ minHeight: '3.375rem', cursor: m.synopsis ? 'pointer' : 'default' }}
            onClick={() => m.synopsis && onSynopsisToggle(m.id)}>
            {m.synopsis ?? 'No Description Available.'}
          </p>

          {/* Arc / re-read / re-watch badges */}
          {(currentArc || rereadCount > 0 || rewatchCount > 0) && (
            <div className="flex items-center gap-2">
              {currentArc && <span className="text-[11px] text-zinc-600 truncate flex items-center gap-1"><MapPin size={10} strokeWidth={1.5} /> {currentArc.label}</span>}
              {rereadCount > 0 && <span className="text-[11px] text-violet-500 shrink-0">×{rereadCount} Re-Read</span>}
              {rewatchCount > 0 && <span className="text-[11px] text-cyan-600 shrink-0">×{rewatchCount} Re-Watch</span>}
            </div>
          )}

          {/* Anime episode tracker */}
          {m.has_anime && ct !== 'movie' && (
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
                  <button onClick={() => onEpisodeUpdate(activeEpMember.id, -1, activeEpMember.episodes_watched)} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">−</button>
                  <EditableNumber value={seriesEpCurrent} onSave={n => onEpisodeUpdate(m.id, n - m.episodes_watched, m.episodes_watched)} label={`Episodes for ${m.title}`} className="w-8 text-xs py-0.5" />
                  <span className="text-[11px] text-zinc-600 font-mono">/</span>
                  <EditableNumber
                    value={epMembers.length <= 1 ? (m.total_episodes ?? 0) : (seriesEpTotal ?? 0)}
                    label={`Total episodes for ${m.title}`}
                    className="w-8 text-[11px] text-zinc-500 py-0.5"
                    onSave={async n => {
                      if (epMembers.length > 1) {
                        await onTotalEpisodesUpdate(m.id, n, m.anime_mal_id ?? m.mal_id, m.content_type)
                        for (const mem of epMembers.filter(e => e.id !== m.id)) {
                          await supabase.from('manga_list').update({ total_episodes: null }).eq('id', mem.id)
                        }
                      } else {
                        onTotalEpisodesUpdate(activeEpMember.id, n, activeEpMember.anime_mal_id ?? activeEpMember.mal_id, activeEpMember.content_type)
                      }
                    }}
                  />
                  <button onClick={() => onEpisodeUpdate(activeEpMember.id, 1, activeEpMember.episodes_watched)} className="w-5 h-5 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">+</button>
                </div>
              </div>
            </div>
          )}

          {/* Movie runtime gauge */}
          {ct === 'movie' && (() => {
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
                    onSave={n => onTotalEpisodesUpdate(m.id, n, m.anime_mal_id ?? m.mal_id, m.content_type)}
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

          {/* Chapter tracker */}
          {ct !== 'movie' && (() => {
            if (ct === 'anime' && !m.total_chapters && m.current_chapter === 0) return null
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
                  <span className="text-[11px] text-zinc-300 tabular-nums flex items-center gap-0.5">
                    Ch.&nbsp;{seriesCurrent}&nbsp;/&nbsp;
                    <EditableNumber
                      value={members.length <= 1 ? (m.total_chapters ?? 0) : (seriesTotal ?? 0)}
                      label={`Total chapters for ${m.title}`}
                      className="w-9 text-[11px] text-zinc-500 py-0"
                      onSave={n => onTotalChaptersUpdate(activeMember.id, n, activeMember.mal_id, activeMember.content_type)}
                    />
                    {isMangaPrimary && seriesTotal && seriesTotal > 0 && <span className="text-zinc-700 ml-1">{Math.min(100, Math.round((seriesCurrent / seriesTotal) * 100))}%</span>}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onChapterUpdate(activeMember.id, -1, activeMember.current_chapter)} aria-label={`Decrease chapter for ${m.title}`}
                      className="w-6 h-6 rounded bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-xs transition-colors">−</button>
                    <EditableNumber value={seriesCurrent} onSave={n => onChapterUpdate(m.id, n - m.current_chapter, m.current_chapter)}
                      label={`Chapter for ${m.title}`} className="w-9 text-xs py-0.5" />
                    <button onClick={() => onChapterUpdate(activeMember.id, 1, activeMember.current_chapter)} aria-label={`Increase chapter for ${m.title}`}
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
              ? m.genres.slice(0, 3).map(g => <span key={g} className="text-[10px] px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">{g}</span>)
              : <span className="text-[10px] text-zinc-500 italic">No Genres Listed</span>
            }
          </div>

          {/* 6. Rating row */}
          <div className="flex items-center gap-2 pt-1.5 border-t border-zinc-800/70 mt-auto">
            <span className="text-[10px] text-zinc-500 uppercase tracking-widest">Rating</span>
            <div className="flex items-center gap-1.5 ml-auto">
              <button onClick={async (e) => {
                  e.stopPropagation()
                  const next = m.user_rating === 'up' ? null : 'up' as const
                  onRatingChange(m.id, next)
                  const { error } = await supabase.from('manga_list').update({ user_rating: next }).eq('id', m.id)
                  if (error) onRatingChange(m.id, m.user_rating ?? null)
                }}
                title={m.user_rating === 'up' ? 'Remove like' : 'Like'}
                className={`transition-colors ${m.user_rating === 'up' ? 'text-emerald-400' : 'text-zinc-500 hover:text-emerald-400'}`}>
                {/* ThumbsUp inline SVG */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
                  <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                </svg>
              </button>
              <button onClick={async (e) => {
                  e.stopPropagation()
                  const next = m.user_rating === 'down' ? null : 'down' as const
                  onRatingChange(m.id, next)
                  const { error } = await supabase.from('manga_list').update({ user_rating: next }).eq('id', m.id)
                  if (error) onRatingChange(m.id, m.user_rating ?? null)
                }}
                title={m.user_rating === 'down' ? 'Remove dislike' : 'Dislike'}
                className={`transition-colors ${m.user_rating === 'down' ? 'text-red-400' : 'text-zinc-500 hover:text-red-400'}`}>
                {/* ThumbsDown inline SVG */}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
                  <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
                </svg>
              </button>
              <span className={`text-[10px] ml-1 ${m.user_rating === 'up' ? 'text-emerald-400' : m.user_rating === 'down' ? 'text-red-400' : 'text-zinc-500'}`}>
                {m.user_rating === 'up' ? 'Liked' : m.user_rating === 'down' ? 'Disliked' : 'Not Rated'}
              </span>
            </div>
          </div>

        </div>
      </div>

      {/* Watching episode prompt */}
      {watchPromptId === m.id && (
        <div className="border-t border-zinc-800 px-3 py-3 bg-violet-900/10">
          <p className="text-xs text-violet-300 font-medium mb-2 flex items-center gap-1.5"><Tv size={12} strokeWidth={1.5} /> How Many Episodes Have You Watched?</p>
          <div className="flex gap-2 items-center">
            <input
              type="number" min={0}
              value={watchPromptInput}
              onChange={e => onWatchPromptInputChange(m.id, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onWatchPromptConfirm(); if (e.key === 'Escape') onWatchPromptCancel() }}
              autoFocus
              placeholder="0"
              className="w-24 bg-zinc-800 border border-zinc-600 rounded-lg px-3 py-2 text-sm text-center outline-none focus:border-violet-500 text-white"
            />
            {m.total_episodes && (
              <span className="text-xs text-zinc-500">/ {m.total_episodes} eps</span>
            )}
            <button onClick={onWatchPromptConfirm}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium transition-colors">
              Confirm
            </button>
            <button onClick={onWatchPromptCancel}
              className="text-xs text-zinc-600 hover:text-zinc-400">Cancel</button>
          </div>
        </div>
      )}

      {/* Notes */}
      {(expandedNotes || m.notes) && (
        <div className="border-t border-zinc-800 px-3 pb-3 pt-2">
          <textarea
            value={m.notes ?? ''}
            onChange={e => onNotesChange(m.id, e.target.value)}
            placeholder="Add a note… (supports [spoiler]text[/spoiler])"
            aria-label={`Notes for ${m.title}`}
            rows={2}
            className="w-full bg-transparent text-xs text-zinc-400 placeholder:text-zinc-700 outline-none resize-none"
          />
          {m.notes && m.notes.trim().length > 10 && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none w-fit">
              <div className={`relative w-7 h-4 rounded-full transition-colors ${m.is_public_review ? 'bg-violet-600' : 'bg-zinc-700'}`}>
                <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${m.is_public_review ? 'left-3.5' : 'left-0.5'}`} />
              </div>
              <input type="checkbox" className="sr-only"
                checked={m.is_public_review ?? false}
                onChange={async e => {
                  const val = e.target.checked
                  onPublicReviewToggle(m.id, val)
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
  )
}
