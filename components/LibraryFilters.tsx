'use client'

import { GitMerge } from 'lucide-react'
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

type SortKey = 'last_read' | 'title' | 'chapter'

const TYPE_TABS = [
  { id: 'all',     label: 'All Types' },
  { id: 'manga',   label: 'Manga' },
  { id: 'manhwa',  label: 'Manhwa' },
  { id: 'webtoon', label: 'Webtoon' },
  { id: 'manhua',  label: 'Manhua' },
  { id: 'anime',   label: 'Anime' },
  { id: 'movie',   label: 'Movie' },
]

export interface LibraryFiltersProps {
  filter: MangaStatus | 'all' | 'duplicates'
  typeFilter: string
  search: string
  sort: SortKey
  duplicateCount: number
  typeCounts: Record<string, number>
  totalCount: number
  onFilterChange: (f: MangaStatus | 'all' | 'duplicates') => void
  onTypeFilterChange: (t: string) => void
  onSearchChange: (s: string) => void
  onSortChange: (s: SortKey) => void
}

export default function LibraryFilters({
  filter,
  typeFilter,
  search,
  sort,
  duplicateCount,
  typeCounts,
  totalCount,
  onFilterChange,
  onTypeFilterChange,
  onSearchChange,
  onSortChange,
}: LibraryFiltersProps) {
  return (
    <>
      {/* Type filter — only show if there's more than one type in the library */}
      {Object.keys(typeCounts).length > 1 && (
        <div className="flex gap-1.5 flex-wrap mb-3">
          {TYPE_TABS
            .filter(t => t.id === 'all' || typeCounts[t.id] > 0)
            .map(t => {
              const count = t.id === 'all' ? totalCount : (typeCounts[t.id] ?? 0)
              const active = typeFilter === t.id
              const activeColor = t.id === 'all' ? '' :
                t.id === 'manga' ? 'bg-zinc-700 border-zinc-500 text-white' :
                t.id === 'manhwa' ? 'bg-violet-600/30 border-violet-500/50 text-violet-300' :
                t.id === 'webtoon' ? 'bg-orange-600/30 border-orange-500/50 text-orange-300' :
                t.id === 'manhua' ? 'bg-blue-600/30 border-blue-500/50 text-blue-300' :
                t.id === 'anime' ? 'bg-cyan-600/30 border-cyan-500/50 text-cyan-300' :
                t.id === 'movie' ? 'bg-yellow-600/30 border-yellow-500/50 text-yellow-300' : ''
              return (
                <button key={t.id}
                  onClick={() => onTypeFilterChange(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    active
                      ? (activeColor || 'bg-white/10 border-white/20 text-white')
                      : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
                  }`}>
                  {t.label}
                  <span className={`text-[10px] px-1 rounded ${active ? 'opacity-70' : 'text-zinc-700'}`}>
                    {count}
                  </span>
                </button>
              )
            })
          }
        </div>
      )}

      {/* Controls — stacked on mobile */}
      <div className="flex flex-col gap-2 mb-5 md:flex-row md:items-center md:flex-wrap md:gap-3">
        {/* Filter tabs — horizontal scroll on mobile */}
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <div className="flex gap-1 bg-zinc-900 p-1 rounded-xl w-fit min-w-full md:min-w-0" role="group" aria-label="Filter by status">
            {(['all', ...Object.keys(STATUS_LABELS)] as (MangaStatus | 'all')[]).map(s => (
              <button key={s} onClick={() => onFilterChange(s)} aria-pressed={filter === s}
                className={`px-3 py-2 rounded-lg text-base whitespace-nowrap transition-colors ${filter === s ? 'bg-white text-black font-medium' : 'text-zinc-300 hover:text-white'}`}>
                {s === 'all' ? 'All' : STATUS_LABELS[s as MangaStatus]}
              </button>
            ))}
            <button onClick={() => onFilterChange('duplicates')} aria-pressed={filter === 'duplicates'}
              className={`px-3 py-2 rounded-lg text-base whitespace-nowrap transition-colors flex items-center gap-1.5 ${filter === 'duplicates' ? 'bg-amber-500 text-black font-medium' : 'text-zinc-300 hover:text-white'}`}>
              <GitMerge size={13} strokeWidth={1.5} />
              Duplicates
              {duplicateCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${filter === 'duplicates' ? 'bg-black/20 text-black' : 'bg-amber-500/20 text-amber-400'}`}>
                  {duplicateCount}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input value={search} onChange={e => onSearchChange(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && onSearchChange('')}
            placeholder="Search…" aria-label="Search manga"
            className="flex-1 md:w-36 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none focus:border-zinc-600 placeholder:text-zinc-600"
          />
          <select value={sort} onChange={e => onSortChange(e.target.value as SortKey)} aria-label="Sort order"
            className="bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-300 outline-none cursor-pointer">
            <option value="last_read">Recent</option>
            <option value="title">A → Z</option>
            <option value="chapter">Chapters</option>
          </select>
        </div>
      </div>
    </>
  )
}
