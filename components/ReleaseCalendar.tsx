'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import type { AiringEntry } from '@/app/api/airing-schedule/route'
import type { GlobalAiringEntry } from '@/app/api/airing-schedule-global/route'
import { formatCountdown } from '@/lib/anilist'
import { Calendar, Tv, BookOpen } from 'lucide-react'
import type { Manga } from '@/lib/supabase'

type AnimeFilter = 'all' | 'library' | 'watching'

interface Props {
  animeMalIds: number[]       // all library anime MAL IDs (has_anime entries)
  watchingMalIds: number[]    // anime MAL IDs where status === 'watching'
  libraryMalIdSet: Set<number>
  releasingManga?: Manga[]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LONG   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_JIKAN  = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const FILTER_LABELS: Record<AnimeFilter, string> = {
  all:      'All Anime',
  library:  'My Library',
  watching: 'Watching',
}

function startOfDay(d: Date) {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c
}

export default function ReleaseCalendar({
  animeMalIds,
  watchingMalIds,
  libraryMalIdSet,
  releasingManga = [],
}: Props) {
  // Library schedule (AniList — exact times)
  const [schedule, setSchedule] = useState<AiringEntry[]>([])
  // Global schedule (Jikan — by day, no exact time)
  const [globalEntries, setGlobalEntries] = useState<GlobalAiringEntry[]>([])
  const [globalDay, setGlobalDay] = useState<number>(-1) // which day was last fetched for global
  const [globalLoading, setGlobalLoading] = useState(false)

  const [libraryLoading, setLibraryLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay())
  const [collapsed, setCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'anime' | 'manga'>('anime')
  const [animeFilter, setAnimeFilter] = useState<AnimeFilter>('library')

  // Fetch library schedule (once, on mount)
  useEffect(() => {
    if (!animeMalIds.length) { setLibraryLoading(false); return }
    fetch('/api/airing-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mal_ids: animeMalIds }),
    })
      .then(r => r.json())
      .then(j => { setSchedule(j.schedule ?? []); setLibraryLoading(false) })
      .catch(() => setLibraryLoading(false))
  }, [animeMalIds.join(',')])

  // Fetch global schedule from Jikan when 'all' filter is selected
  const fetchGlobal = useCallback((dow: number) => {
    if (globalDay === dow) return
    setGlobalLoading(true)
    fetch(`/api/airing-schedule-global?day=${DAY_JIKAN[dow]}`)
      .then(r => r.json())
      .then(j => {
        setGlobalEntries(j.entries ?? [])
        setGlobalDay(dow)
        setGlobalLoading(false)
      })
      .catch(() => setGlobalLoading(false))
  }, [globalDay])

  useEffect(() => {
    if (animeFilter === 'all') fetchGlobal(selectedDay)
  }, [animeFilter, selectedDay, fetchGlobal])

  // Build a 7-day window starting from today
  const today = startOfDay(new Date())
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i)
    return d
  })

  // Group library entries by day-of-week
  const byDay = new Map<number, AiringEntry[]>()
  for (const day of days) byDay.set(day.getDay(), [])
  for (const entry of schedule) {
    const d = new Date(entry.airingAt * 1000)
    const startD = startOfDay(d)
    const diffDays = Math.round((startD.getTime() - today.getTime()) / 86400000)
    if (diffDays >= 0 && diffDays < 7) {
      const dow = d.getDay()
      byDay.get(dow)?.push(entry)
    }
  }

  // What to show depends on filter
  const selectedLibraryEntries = byDay.get(selectedDay) ?? []

  const watchingMalIdSet = new Set(watchingMalIds)
  const selectedWatchingEntries = selectedLibraryEntries.filter(e => watchingMalIdSet.has(e.mal_id))

  // Dot counts per day for the day strip
  function getDotCount(dow: number): number {
    if (animeFilter === 'all') {
      // We only have global data for the currently-selected day
      if (dow === selectedDay) return globalEntries.length
      return byDay.get(dow)?.length ?? 0 // fallback to library count for other days
    }
    if (animeFilter === 'watching') {
      return (byDay.get(dow) ?? []).filter(e => watchingMalIdSet.has(e.mal_id)).length
    }
    return byDay.get(dow)?.length ?? 0
  }

  const totalAiring = schedule.length
  const isLoading = animeFilter === 'all' ? (libraryLoading || globalLoading) : libraryLoading

  if (!libraryLoading && totalAiring === 0 && releasingManga.length === 0) return null

  return (
    <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: 'var(--ink-700)', border: 'var(--border-hair)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: 'var(--border-hair)' }}>
        <div className="flex items-center gap-2">
          <Calendar size={15} strokeWidth={1.5} style={{ color: 'var(--vermillion)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--fg-1)' }}>Airing This Week</span>
          {totalAiring > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: 'var(--vermillion)', color: '#fff' }}>
              {totalAiring}
            </span>
          )}
        </div>
        <button onClick={() => setCollapsed(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)', fontSize: 16, lineHeight: 1, padding: '4px 2px' }}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Anime / Manga tab strip */}
          {releasingManga.length > 0 && (
            <div className="flex" style={{ borderBottom: 'var(--border-hair)' }}>
              <button
                onClick={() => setActiveTab('anime')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
                style={{
                  color: activeTab === 'anime' ? 'var(--fg-1)' : 'var(--fg-4)',
                  borderBottom: activeTab === 'anime' ? '2px solid var(--vermillion)' : '2px solid transparent',
                }}
              >
                <Tv size={11} strokeWidth={1.5} /> Anime {totalAiring > 0 && `(${totalAiring})`}
              </button>
              <button
                onClick={() => setActiveTab('manga')}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors"
                style={{
                  color: activeTab === 'manga' ? 'var(--fg-1)' : 'var(--fg-4)',
                  borderBottom: activeTab === 'manga' ? '2px solid var(--cyan)' : '2px solid transparent',
                }}
              >
                <BookOpen size={11} strokeWidth={1.5} /> Manga ({releasingManga.length})
              </button>
            </div>
          )}

          {/* Anime tab */}
          {activeTab === 'anime' && (
            <>
              {/* Filter pills */}
              <div className="flex gap-2 px-4 py-2.5" style={{ borderBottom: 'var(--border-hair)' }}>
                {(['library', 'watching', 'all'] as AnimeFilter[]).map(f => (
                  <button
                    key={f}
                    onClick={() => setAnimeFilter(f)}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors"
                    style={{
                      background: animeFilter === f ? 'var(--vermillion)' : 'var(--ink-600)',
                      color: animeFilter === f ? '#fff' : 'var(--fg-3)',
                      border: animeFilter === f ? '1px solid var(--vermillion)' : '1px solid transparent',
                    }}
                  >
                    {FILTER_LABELS[f]}
                  </button>
                ))}
              </div>

              {/* Day strip */}
              <div className="flex" style={{ borderBottom: 'var(--border-hair)' }}>
                {days.map((day, i) => {
                  const dow = day.getDay()
                  const isToday = i === 0
                  const isSelected = dow === selectedDay
                  const count = getDotCount(dow)
                  return (
                    <button
                      key={dow}
                      onClick={() => setSelectedDay(dow)}
                      className="flex-1 flex flex-col items-center py-2.5 transition-colors relative"
                      style={{
                        background: isSelected ? 'var(--vermillion-tint)' : 'transparent',
                        borderRight: i < 6 ? 'var(--border-hair)' : 'none',
                      }}
                    >
                      <span className="text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: isToday ? 'var(--vermillion)' : isSelected ? 'var(--fg-2)' : 'var(--fg-4)' }}>
                        {DAY_LABELS[dow]}
                      </span>
                      <span className="text-xs font-mono mt-0.5"
                        style={{ color: isSelected ? 'var(--fg-1)' : 'var(--fg-3)' }}>
                        {day.getDate()}
                      </span>
                      {count > 0 && (
                        <span className="mt-1 w-1.5 h-1.5 rounded-full"
                          style={{ background: isToday ? 'var(--vermillion)' : 'var(--cyan)' }} />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Entries for selected day */}
              <div className="p-4">
                {isLoading && (
                  <div className="flex gap-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center gap-2 flex-1 animate-pulse">
                        <div className="w-9 h-12 rounded shrink-0" style={{ background: 'var(--ink-600)' }} />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-2.5 rounded" style={{ background: 'var(--ink-600)' }} />
                          <div className="h-2.5 rounded w-2/3" style={{ background: 'var(--ink-600)' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ALL ANIME — Jikan global schedule */}
                {!isLoading && animeFilter === 'all' && (
                  globalEntries.length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                      <Tv size={13} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
                      <p className="text-xs" style={{ color: 'var(--fg-4)' }}>
                        No anime scheduled on {DAY_LONG[selectedDay]}.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {globalEntries.map(entry => {
                        const inLibrary = libraryMalIdSet.has(entry.mal_id)
                        const isWatching = watchingMalIdSet.has(entry.mal_id)
                        return (
                          <div key={entry.mal_id} className="flex items-center gap-3">
                            {entry.cover ? (
                              <div className="relative w-9 h-12 rounded overflow-hidden shrink-0" style={{ background: 'var(--ink-600)' }}>
                                <Image src={entry.cover} alt={entry.title} fill className="object-cover" unoptimized />
                              </div>
                            ) : (
                              <div className="w-9 h-12 rounded shrink-0 flex items-center justify-center"
                                style={{ background: 'var(--ink-600)' }}>
                                <Tv size={14} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg-1)' }}>{entry.title}</p>
                              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                {entry.broadcast_time && (
                                  <span className="text-xs font-mono" style={{ color: 'var(--fg-3)' }}>{entry.broadcast_time} JST</span>
                                )}
                                {entry.score && (
                                  <span className="text-[10px]" style={{ color: 'var(--fg-4)' }}>★ {entry.score.toFixed(1)}</span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              {isWatching && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                  style={{ background: 'var(--vermillion)', color: '#fff' }}>
                                  Watching
                                </span>
                              )}
                              {inLibrary && !isWatching && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                  style={{ background: 'var(--ink-600)', color: 'var(--fg-3)' }}>
                                  In Library
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                )}

                {/* LIBRARY — exact airing times from AniList */}
                {!isLoading && animeFilter === 'library' && (
                  selectedLibraryEntries.length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                      <Tv size={13} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
                      <p className="text-xs" style={{ color: 'var(--fg-4)' }}>
                        Nothing airing from your library on {DAY_LONG[selectedDay]}.
                      </p>
                    </div>
                  ) : (
                    <LibraryEntryList entries={selectedLibraryEntries} today={today} />
                  )
                )}

                {/* WATCHING — subset of library entries */}
                {!isLoading && animeFilter === 'watching' && (
                  selectedWatchingEntries.length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                      <Tv size={13} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
                      <p className="text-xs" style={{ color: 'var(--fg-4)' }}>
                        No watching-status anime airing on {DAY_LONG[selectedDay]}.
                      </p>
                    </div>
                  ) : (
                    <LibraryEntryList entries={selectedWatchingEntries} today={today} />
                  )
                )}
              </div>
            </>
          )}

          {/* Manga tab — actively serialising titles you're reading */}
          {activeTab === 'manga' && (
            <div className="p-4 flex flex-col gap-3">
              {releasingManga.length === 0 ? (
                <div className="flex items-center gap-2 py-1">
                  <BookOpen size={13} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
                  <p className="text-xs" style={{ color: 'var(--fg-4)' }}>No actively releasing manga in your reading list.</p>
                </div>
              ) : releasingManga.map(m => (
                <div key={m.id} className="flex items-center gap-3">
                  {m.cover_url ? (
                    <div className="relative w-9 h-12 rounded overflow-hidden shrink-0" style={{ background: 'var(--ink-600)' }}>
                      <Image src={m.cover_url} alt={m.title} fill className="object-cover" unoptimized />
                    </div>
                  ) : (
                    <div className="w-9 h-12 rounded shrink-0 flex items-center justify-center"
                      style={{ background: 'var(--ink-600)' }}>
                      <BookOpen size={14} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg-1)' }}>{m.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>
                      Ch. {m.current_chapter}{m.total_chapters ? ` / ${m.total_chapters}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[10px]" style={{ color: 'var(--fg-4)' }}>Serialising</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function LibraryEntryList({ entries, today }: { entries: AiringEntry[]; today: Date }) {
  return (
    <div className="flex flex-col gap-3">
      {entries.map(entry => {
        const airingDate = new Date(entry.airingAt * 1000)
        const isToday = startOfDay(airingDate).getTime() === today.getTime()
        const timeStr = airingDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        return (
          <div key={entry.mal_id} className="flex items-center gap-3">
            {entry.cover ? (
              <div className="relative w-9 h-12 rounded overflow-hidden shrink-0" style={{ background: 'var(--ink-600)' }}>
                <Image src={entry.cover} alt={entry.title} fill className="object-cover" unoptimized />
              </div>
            ) : (
              <div className="w-9 h-12 rounded shrink-0 flex items-center justify-center"
                style={{ background: 'var(--ink-600)' }}>
                <Tv size={14} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: 'var(--fg-1)' }}>{entry.title}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>Episode {entry.episode}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-mono" style={{ color: 'var(--fg-3)' }}>{timeStr}</p>
              {isToday && entry.timeUntilAiring > 0 && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--vermillion)' }}>
                  in {formatCountdown(entry.timeUntilAiring)}
                </p>
              )}
              {!isToday && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--fg-4)' }}>
                  {airingDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
