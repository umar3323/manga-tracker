'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import type { AiringEntry } from '@/app/api/airing-schedule/route'
import { formatCountdown } from '@/lib/anilist'
import { Calendar, Tv, BookOpen } from 'lucide-react'
import type { Manga } from '@/lib/supabase'

interface Props {
  animeMalIds: number[]
  releasingManga?: Manga[]
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LONG   = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

function startOfDay(d: Date) {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c
}

export default function ReleaseCalendar({ animeMalIds, releasingManga = [] }: Props) {
  const [schedule, setSchedule] = useState<AiringEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDay())
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    if (!animeMalIds.length) { setLoading(false); return }
    fetch('/api/airing-schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mal_ids: animeMalIds }),
    })
      .then(r => r.json())
      .then(j => { setSchedule(j.schedule ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [animeMalIds.join(',')])

  // Build a 7-day window starting from today
  const today = startOfDay(new Date())
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() + i)
    return d
  })

  // Group entries by day-of-week within the 7-day window
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

  const selectedEntries = byDay.get(selectedDay) ?? []
  const totalAiring = schedule.length
  const [activeTab, setActiveTab] = useState<'anime' | 'manga'>('anime')

  if (!loading && totalAiring === 0 && releasingManga.length === 0) return null

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
          {/* Tab strip */}
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
              {/* Day strip */}
              <div className="flex" style={{ borderBottom: 'var(--border-hair)' }}>
                {days.map((day, i) => {
                  const dow = day.getDay()
                  const isToday = i === 0
                  const isSelected = dow === selectedDay
                  const count = byDay.get(dow)?.length ?? 0
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
                {loading && (
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
                {!loading && selectedEntries.length === 0 && (
                  <div className="flex items-center gap-2 py-1">
                    <Tv size={13} strokeWidth={1.5} style={{ color: 'var(--fg-4)' }} />
                    <p className="text-xs" style={{ color: 'var(--fg-4)' }}>
                      Nothing airing from your list on {DAY_LONG[selectedDay]}.
                    </p>
                  </div>
                )}
                {!loading && selectedEntries.length > 0 && (
                  <div className="flex flex-col gap-3">
                    {selectedEntries.map(entry => {
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
