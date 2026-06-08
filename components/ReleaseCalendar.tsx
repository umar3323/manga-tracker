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
  onAddToLibrary?: (entry: GlobalAiringEntry) => Promise<void>
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
  onAddToLibrary,
}: Props) {
  const [addingId, setAddingId] = useState<number | null>(null)
  const [justAdded, setJustAdded] = useState<Set<number>>(new Set())

  const handleAdd = async (entry: GlobalAiringEntry) => {
    if (!onAddToLibrary) return
    setAddingId(entry.mal_id)
    await onAddToLibrary(entry)
    setJustAdded(prev => new Set([...prev, entry.mal_id]))
    setAddingId(null)
  }
  // Library schedule (AniList — exact times)
  const [schedule, setSchedule] = useState<AiringEntry[]>([])
  // Global schedule (Jikan — by day, no exact time)
  const [globalEntries, setGlobalEntries] = useState<GlobalAiringEntry[]>([])
  const [globalDay, setGlobalDay] = useState<number>(-1) // which day was last fetched for global
  const [globalLoading, setGlobalLoading] = useState(false)

  const [libraryLoading, setLibraryLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const n = new Date()
    return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
  })
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
    if (animeFilter === 'all') fetchGlobal(new Date(selectedDate).getDay())
  }, [animeFilter, selectedDate, fetchGlobal])


  function localDateKey(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  // Build a 14-day window: yesterday + today (visible) + 12 future
  const today = startOfDay(new Date())
  const todayKey = localDateKey(today)
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - 1 + i)
    return d
  })

  // Group library entries by absolute date key (YYYY-MM-DD local) so past/future days are distinct
  const byDate = new Map<string, AiringEntry[]>()
  for (const day of days) byDate.set(localDateKey(day), [])
  for (const entry of schedule) {
    const d = new Date(entry.airingAt * 1000)
    const key = localDateKey(startOfDay(d))
    if (byDate.has(key)) byDate.get(key)!.push(entry)
  }

  // Legacy byDay map (by day-of-week) kept for dot counts
  const byDay = new Map<number, AiringEntry[]>()
  for (const day of days) {
    const key = localDateKey(day)
    byDay.set(day.getDay(), [...(byDay.get(day.getDay()) ?? []), ...(byDate.get(key) ?? [])])
  }

  // What to show depends on filter
  const selectedLibraryEntries = byDate.get(selectedDate) ?? []

  const watchingMalIdSet = new Set(watchingMalIds)
  const selectedWatchingEntries = selectedLibraryEntries.filter(e => watchingMalIdSet.has(e.mal_id))

  const selectedDow = new Date(selectedDate + 'T12:00:00').getDay()

  // Dot counts per day for the day strip
  function getDotCount(dateKey: string): number {
    if (animeFilter === 'all') {
      if (dateKey === selectedDate) return globalEntries.length
      return byDate.get(dateKey)?.length ?? 0
    }
    if (animeFilter === 'watching') {
      return (byDate.get(dateKey) ?? []).filter(e => watchingMalIdSet.has(e.mal_id)).length
    }
    return byDate.get(dateKey)?.length ?? 0
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const totalAiring = schedule.filter(e => e.timeUntilAiring > 0).length
  const isLoading = animeFilter === 'all' ? (libraryLoading || globalLoading) : libraryLoading

  if (!libraryLoading && schedule.length === 0 && releasingManga.length === 0) return null

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

              {/* Day strip — 14-day scrollable window */}
              <div className="flex overflow-x-auto scrollbar-none" style={{ borderBottom: 'var(--border-hair)' }}>
                {days.map((day, i) => {
                  const dateKey = localDateKey(day)
                  const dow = day.getDay()
                  const isToday = dateKey === todayKey
                  const isPast = day < today
                  const isSelected = dateKey === selectedDate
                  const count = getDotCount(dateKey)
                  return (
                    <button
                      key={dateKey}
                      data-today={isToday ? 'true' : undefined}
                      onClick={() => setSelectedDate(dateKey)}
                      className="flex shrink-0 flex-col items-center py-2.5 transition-colors relative"
                      style={{
                        width: `${100 / 7}%`,
                        minWidth: 40,
                        background: isSelected ? 'var(--vermillion-tint)' : 'transparent',
                        borderRight: i < 13 ? 'var(--border-hair)' : 'none',
                        opacity: isPast && !isSelected ? 0.6 : 1,
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
                          style={{ background: isPast ? 'var(--fg-4)' : isToday ? 'var(--vermillion)' : 'var(--cyan)' }} />
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
                        No Anime Scheduled On {DAY_LONG[selectedDow]}.
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
                              {!inLibrary && !justAdded.has(entry.mal_id) && onAddToLibrary && (
                                <button
                                  onClick={() => handleAdd(entry)}
                                  disabled={addingId === entry.mal_id}
                                  className="text-[10px] px-2 py-0.5 rounded-full font-semibold transition-opacity disabled:opacity-50"
                                  style={{ background: 'var(--cyan)', color: '#000' }}
                                >
                                  {addingId === entry.mal_id ? '…' : '+ Add'}
                                </button>
                              )}
                              {justAdded.has(entry.mal_id) && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                  style={{ background: 'rgba(34,211,238,0.15)', color: 'var(--cyan)', border: '1px solid rgba(34,211,238,0.3)' }}>
                                  ✓ Added
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
                        Nothing Airing From Your Library On {DAY_LONG[selectedDow]}.
                      </p>
                    </div>
                  ) : (
                    <LibraryEntryList entries={selectedLibraryEntries} today={today} nowSec={nowSec} />
                  )
                )}

                {/* WATCHING — subset of library entries */}
                {!isLoading && animeFilter === 'watching' && (
                  selectedWatchingEntries.length === 0 ? (
                    <div className="flex items-center gap-2 py-1">
                      <Tv size={13} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
                      <p className="text-xs" style={{ color: 'var(--fg-4)' }}>
                        No Watching-Status Anime Airing On {DAY_LONG[selectedDow]}.
                      </p>
                    </div>
                  ) : (
                    <LibraryEntryList entries={selectedWatchingEntries} today={today} nowSec={nowSec} />
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
                  <p className="text-xs" style={{ color: 'var(--fg-4)' }}>No Actively Releasing Manga In Your Reading List.</p>
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
                    <span className="text-[10px]" style={{ color: 'var(--fg-4)' }}>Serialising</span> {/* already title-case */}
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

function LibraryEntryList({ entries, today, nowSec }: { entries: AiringEntry[]; today: Date; nowSec: number }) {
  return (
    <div className="flex flex-col gap-3">
      {entries.map(entry => {
        const airingDate = new Date(entry.airingAt * 1000)
        const isToday = startOfDay(airingDate).getTime() === today.getTime()
        const hasAired = entry.airingAt < nowSec
        const timeStr = airingDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
        return (
          <div key={`${entry.mal_id}-${entry.episode}`} className="flex items-center gap-3" style={{ opacity: hasAired ? 0.65 : 1 }}>
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
              <p className="text-xs mt-0.5" style={{ color: 'var(--fg-3)' }}>
                Episode {entry.episode}
                {hasAired && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ink-600)', color: 'var(--fg-4)' }}>Aired</span>}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-mono" style={{ color: 'var(--fg-3)' }}>{timeStr}</p>
              {isToday && !hasAired && (
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--vermillion)' }}>
                  in {formatCountdown(entry.airingAt - nowSec)}
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
