'use client'

import Image from 'next/image'
import { useLibraryStore } from '@/lib/store'
import type { MangaStatus } from '@/lib/supabase'

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

const TYPE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  manga:   { bg: 'rgba(113,113,122,0.18)', color: '#a1a1aa', border: '1px solid rgba(113,113,122,0.35)' },
  manhwa:  { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA', border: '1px solid rgba(167,139,250,0.3)' },
  webtoon: { bg: 'rgba(251,146,60,0.12)',  color: '#fb923c', border: '1px solid rgba(251,146,60,0.3)' },
  manhua:  { bg: 'rgba(96,165,250,0.12)',  color: '#60a5fa', border: '1px solid rgba(96,165,250,0.3)' },
  anime:   { bg: 'rgba(34,211,238,0.10)',  color: '#22d3ee', border: '1px solid rgba(34,211,238,0.3)' },
  movie:   { bg: 'rgba(251,191,36,0.12)',  color: '#fbbf24', border: '1px solid rgba(251,191,36,0.3)' },
}

interface Props {
  id: string
  onOpenDetail: (id: string) => void
}

export default function QuickPeekSheet({ id, onOpenDetail }: Props) {
  const entry = useLibraryStore(s => s.mangaList.find(m => m.id === id))
  const seriesMembers = useLibraryStore(s =>
    entry?.series_id ? s.mangaList.filter(m => m.series_id === entry.series_id) : []
  )
  const closePeek = useLibraryStore(s => s.closePeek)

  if (!entry) return null

  const ct = entry.content_type ?? 'manga'
  const typeStyle = TYPE_STYLES[ct] ?? TYPE_STYLES.manga
  const synopsis = entry.synopsis
    ? entry.synopsis.slice(0, 200) + (entry.synopsis.length > 200 ? '…' : '')
    : null
  const genres = entry.genres?.slice(0, 3) ?? []

  const isAnime = ct === 'anime' || ct === 'movie'

  const epMembers = seriesMembers.filter(e => (e.has_anime || e.content_type === 'anime' || e.content_type === 'movie'))
  const seriesEpCurrent = epMembers.length > 1 ? epMembers.reduce((s, e) => s + e.episodes_watched, 0) : entry.episodes_watched
  const seriesEpTotal = epMembers.length > 1 ? (epMembers.reduce((s, e) => s + (e.total_episodes ?? 0), 0) || null) : entry.total_episodes
  const seriesChCurrent = seriesMembers.length > 1 ? seriesMembers.reduce((s, e) => s + e.current_chapter, 0) : entry.current_chapter
  const seriesChTotal = seriesMembers.length > 1 ? (seriesMembers.reduce((s, e) => s + (e.total_chapters ?? 0), 0) || null) : entry.total_chapters

  const progressLabel = isAnime
    ? `Episode ${seriesEpCurrent}${seriesEpTotal ? ` / ${seriesEpTotal}` : ''}`
    : `Chapter ${seriesChCurrent}${seriesChTotal ? ` / ${seriesChTotal}` : ''}`

  const handleOpenDetail = () => {
    onOpenDetail(id)
    closePeek()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={closePeek}
        aria-hidden
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Quick peek: ${entry.title}`}
        className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none"
      >
        <div
          className="w-full max-w-lg pointer-events-auto bg-zinc-900 border border-zinc-700 rounded-t-2xl shadow-2xl animate-slide-up"
          onClick={e => e.stopPropagation()}
        >
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-zinc-700" />
          </div>

          <div className="px-5 pb-5 pt-2 flex flex-col gap-4">
            {/* Header row: cover + info */}
            <div className="flex gap-4">
              {/* Cover */}
              <div className="shrink-0 w-20 h-28 rounded-xl overflow-hidden bg-zinc-800">
                {entry.cover_url ? (
                  <Image
                    src={entry.cover_url}
                    alt={`Cover for ${entry.title}`}
                    width={80}
                    height={112}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xl">?</div>
                )}
              </div>

              {/* Title + meta */}
              <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-1">
                <h2 className="text-base font-bold leading-snug line-clamp-2 text-white">{entry.title}</h2>

                {/* Authors */}
                {entry.authors?.length > 0 && (
                  <p className="text-xs text-zinc-400 truncate">
                    {isAnime ? 'Studio: ' : ''}
                    {entry.authors.map((a: { name: string }) => a.name).join(', ')}
                  </p>
                )}

                {/* Badges */}
                <div className="flex flex-wrap gap-1.5 items-center">
                  <span
                    className="text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wide font-semibold"
                    style={{ background: typeStyle.bg, color: typeStyle.color, border: typeStyle.border }}
                  >
                    {ct}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[entry.status]}`}>
                    {STATUS_LABELS[entry.status]}
                  </span>
                </div>

                {/* Progress */}
                <p className="text-sm font-medium" style={{ color: 'var(--cyan, #22d3ee)' }}>{progressLabel}</p>
              </div>
            </div>

            {/* Synopsis */}
            {synopsis && (
              <p className="text-xs text-zinc-400 leading-relaxed">{synopsis}</p>
            )}

            {/* Genres */}
            {genres.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {genres.map(g => (
                  <span key={g} className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">{g}</span>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleOpenDetail}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: 'var(--vermillion, #ff2d46)' }}
              >
                Full Details
              </button>
              <button
                onClick={closePeek}
                className="px-5 py-2.5 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.22s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
      `}</style>
    </>
  )
}
