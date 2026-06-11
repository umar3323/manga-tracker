'use client'

import { useState, useEffect, useRef } from 'react'
import { Sparkles, Star, X } from 'lucide-react'
import { supabase, type Manga, type MangaStatus } from '@/lib/supabase'

interface Props {
  manga: Manga
  onClose: () => void
  onSaved: (id: string, rating: 'up' | 'down' | null, note: string, statusOverride?: MangaStatus) => void
}

interface Particle {
  id: number; x: number; y: number; color: string
  size: number; angle: number; speed: number; opacity: number
}

const COLORS = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6BD6', '#FFA500']

const todayISO = new Date().toISOString().slice(0, 10)
const currentYear = new Date().getFullYear()
const YEARS = Array.from({ length: currentYear - 1999 }, (_, i) => currentYear - i)

type CompletedType = 'manga' | 'anime' | 'both'
type DateTab = 'today' | 'exact' | 'range' | 'year' | 'unknown'

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1
}

function useParticles(active: boolean) {
  const [particles, setParticles] = useState<Particle[]>([])
  const frameRef = useRef<number>(0)

  useEffect(() => {
    if (!active) return
    const initial: Particle[] = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      y: 10 + Math.random() * 40,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 4 + Math.random() * 6,
      angle: Math.random() * 360,
      speed: 0.3 + Math.random() * 0.8,
      opacity: 1,
    }))
    setParticles(initial)
    const tick = () => {
      setParticles(prev =>
        prev
          .map(p => ({ ...p, y: p.y + p.speed, x: p.x + Math.sin((p.y / 20) + p.id) * 0.4, opacity: p.opacity - 0.008 }))
          .filter(p => p.opacity > 0)
      )
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [active])

  return particles
}

export default function CompletionModal({ manga, onClose, onSaved }: Props) {
  const [stars, setStars] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const particles = useParticles(true)

  // Is this a mixed entry (has both readable chapters AND watchable anime)?
  const isMixed = !!(manga.has_anime && (manga.total_chapters || manga.current_chapter > 0))
  const isAnimeOnly = (manga.content_type === 'anime' || manga.has_anime) && !manga.total_chapters && manga.current_chapter === 0
  // Show type selector for any entry that involves anime
  const showTypeSelector = isMixed || isAnimeOnly

  const defaultType: CompletedType = isMixed ? 'both' : isAnimeOnly ? 'anime' : 'manga'
  const [completedType, setCompletedType] = useState<CompletedType>(defaultType)
  // null = not answered yet, true = more coming, false = fully done
  const [moreAnimePlanned, setMoreAnimePlanned] = useState<boolean | null>(null)

  const [dateTab, setDateTab] = useState<DateTab>('today')
  const [date, setDate] = useState(todayISO)
  const [startDate, setStartDate] = useState(todayISO)
  const [endDate, setEndDate] = useState(todayISO)
  const [year, setYear] = useState(currentYear)

  const rangeValid = dateTab !== 'range' || (!!startDate && !!endDate && startDate <= endDate)
  const rangeDays = dateTab === 'range' && startDate && endDate && startDate <= endDate
    ? daysBetween(startDate, endDate) : 0

  const resolvedTimestamp = (): string => {
    if (dateTab === 'exact') return new Date(date + 'T12:00:00').toISOString()
    if (dateTab === 'range') return new Date(endDate + 'T12:00:00').toISOString()
    return new Date().toISOString()
  }

  const animeInvolved = completedType === 'anime' || completedType === 'both'
  // Status to revert to when the manga portion is still ongoing
  const statusOverride: MangaStatus | undefined = (() => {
    if (!showTypeSelector) return undefined
    if (completedType === 'manga') return undefined // manga done → keep 'completed'
    if (completedType === 'anime' && isMixed) return 'on_hold' // manga still ongoing
    if (completedType === 'anime' && isAnimeOnly) return moreAnimePlanned ? 'on_hold' : undefined
    if (completedType === 'both') return moreAnimePlanned ? 'on_hold' : undefined
    return undefined
  })()

  const handleSave = async () => {
    if (!rangeValid) return
    setSaving(true)

    const rating: 'up' | 'down' | null = stars >= 3 ? 'up' : stars > 0 ? 'down' : null
    const ts = resolvedTimestamp()

    const updates: Record<string, unknown> = {
      user_rating: rating,
      last_read_at: dateTab === 'unknown' ? undefined : ts,
    }
    if (dateTab === 'unknown') delete updates.last_read_at

    if (statusOverride) updates.status = statusOverride

    if (note.trim()) {
      const existing = manga.notes ? manga.notes.trim() + '\n' : ''
      updates.notes = existing + `[Completed] ${note.trim()}`
    }

    // Auto-fill progress gauges to max where applicable
    const fillManga = !showTypeSelector || completedType === 'manga' || completedType === 'both'
    const fillAnime = showTypeSelector ? (completedType === 'anime' || completedType === 'both') : true

    if (fillManga && !isAnimeOnly && manga.total_chapters) {
      updates.current_chapter = manga.total_chapters
    }
    // Only fill episodes to max if the anime is fully done (not just caught up)
    if (fillAnime && (isAnimeOnly || isMixed) && manga.total_episodes && !moreAnimePlanned) {
      updates.episodes_watched = manga.total_episodes
    }

    await supabase.from('manga_list').update(updates).eq('id', manga.id)
    setSaving(false)
    onSaved(manga.id, rating, note.trim(), statusOverride)
    onClose()
  }

  const DATE_TABS: { id: DateTab; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'exact', label: 'Date' },
    { id: 'range', label: 'Range' },
    { id: 'year',  label: 'Year' },
    { id: 'unknown', label: "Don't Know" },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {particles.map(p => (
          <div key={p.id} className="absolute rounded-full" style={{
            left: `${p.x}%`, top: `${p.y}%`, width: p.size, height: p.size,
            backgroundColor: p.color, opacity: p.opacity, transform: `rotate(${p.angle}deg)`,
          }} />
        ))}
      </div>

      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        <button onClick={onClose} className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 transition-colors z-10">
          <X size={16} strokeWidth={1.5} />
        </button>

        {/* Cover banner */}
        {manga.cover_url && (
          <div className="relative h-28 overflow-hidden">
            <img src={manga.cover_url} alt="" className="w-full h-full object-cover" style={{ filter: 'blur(2px) brightness(0.4)' }} />
            <img src={manga.cover_url} alt="" className="absolute inset-0 w-full h-full object-contain" />
          </div>
        )}

        <div className="px-6 py-5">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} strokeWidth={1.5} className="icon-glow-cyan" />
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Completed</span>
          </div>
          <h2 className="text-lg font-bold text-white mb-4 leading-tight">{manga.title}</h2>

          {/* What did you complete? — shown for any has_anime entry */}
          {showTypeSelector && (
            <div className="mb-4">
              <p className="text-xs text-zinc-500 mb-2">What did you complete?</p>
              <div className="flex gap-2">
                {(isMixed ? (['manga', 'anime', 'both'] as CompletedType[]) : (['anime'] as CompletedType[])).map(t => (
                  <button
                    key={t}
                    onClick={() => { setCompletedType(t as CompletedType); setMoreAnimePlanned(null) }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors capitalize ${
                      completedType === t
                        ? 'bg-violet-500/20 border-violet-500 text-violet-300'
                        : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {/* More episodes planned? — shown when anime is part of completion */}
              {animeInvolved && (
                <div className="mt-3">
                  <p className="text-xs text-zinc-500 mb-2">Are there more episodes or seasons planned?</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMoreAnimePlanned(true)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        moreAnimePlanned === true
                          ? 'bg-amber-500/20 border-amber-500 text-amber-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      Yes — caught up
                    </button>
                    <button
                      onClick={() => setMoreAnimePlanned(false)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        moreAnimePlanned === false
                          ? 'bg-green-500/20 border-green-500 text-green-300'
                          : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
                      }`}
                    >
                      No — fully done
                    </button>
                  </div>
                  {moreAnimePlanned === true && (
                    <p className="text-[10px] text-amber-400/70 mt-2 leading-relaxed">
                      {completedType === 'anime' && isMixed
                        ? 'Status set to On Hold — the manga may still be ongoing.'
                        : 'Status set to On Hold until the next season arrives.'}
                    </p>
                  )}
                  {completedType === 'anime' && isMixed && moreAnimePlanned === false && (
                    <p className="text-[10px] text-zinc-600 mt-2 leading-relaxed">
                      Anime logged as complete. The manga portion is tracked separately.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* When did you finish? */}
          <div className="mb-4">
            <p className="text-xs text-zinc-500 mb-2">When did you finish?</p>

            {/* Tab strip */}
            <div className="flex gap-0.5 bg-zinc-800 rounded-xl p-1 mb-3">
              {DATE_TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setDateTab(t.id)}
                  className={`flex-1 py-1.5 rounded-lg text-center text-[10px] font-medium transition-colors ${
                    dateTab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {dateTab === 'today' && (
              <p className="text-xs text-zinc-400 text-center py-1">
                {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}

            {dateTab === 'exact' && (
              <input
                type="date" value={date} max={todayISO}
                onChange={e => setDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-zinc-500 cursor-pointer"
                style={{ colorScheme: 'dark' }}
              />
            )}

            {dateTab === 'range' && (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <label className="text-[10px] text-zinc-600 block mb-1">From</label>
                    <input type="date" value={startDate} max={endDate || todayISO}
                      onChange={e => setStartDate(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-zinc-500 cursor-pointer"
                      style={{ colorScheme: 'dark' }} />
                  </div>
                  <span className="text-zinc-600 text-sm mt-4">→</span>
                  <div className="flex-1">
                    <label className="text-[10px] text-zinc-600 block mb-1">To</label>
                    <input type="date" value={endDate} min={startDate} max={todayISO}
                      onChange={e => setEndDate(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-xs text-white outline-none focus:border-zinc-500 cursor-pointer"
                      style={{ colorScheme: 'dark' }} />
                  </div>
                </div>
                {rangeDays > 1 && (
                  <p className="text-[10px] text-zinc-500 text-center">Finished over {rangeDays} days</p>
                )}
                {startDate > endDate && (
                  <p className="text-[10px] text-red-400 text-center">Start must be before end</p>
                )}
              </div>
            )}

            {dateTab === 'year' && (
              <div className="flex items-center gap-2">
                <button onClick={() => setYear(y => Math.max(2000, y - 1))}
                  className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-lg transition-colors">−</button>
                <span className="flex-1 text-center font-semibold tabular-nums">{year}</span>
                <button onClick={() => setYear(y => Math.min(currentYear, y + 1))}
                  className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-lg transition-colors">+</button>
              </div>
            )}

            {dateTab === 'unknown' && (
              <p className="text-[10px] text-zinc-600 text-center py-1 leading-relaxed">
                Completion logged without a date — it won&apos;t appear on the timeline.
              </p>
            )}
          </div>

          {/* Stars */}
          <p className="text-xs text-zinc-500 mb-2">How was it?</p>
          <div className="flex gap-1 mb-4">
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s} onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}
                onClick={() => setStars(s === stars ? 0 : s)} className="transition-transform hover:scale-110">
                <Star size={24} strokeWidth={1.5}
                  fill={(hovered || stars) >= s ? '#FFD93D' : 'none'}
                  className={(hovered || stars) >= s ? 'text-yellow-400' : 'text-zinc-700'} />
              </button>
            ))}
            {stars > 0 && (
              <span className="text-xs text-zinc-500 self-center ml-2">
                {['', 'Not for me', 'Meh', 'Good', 'Great', 'Masterpiece'][stars]}
              </span>
            )}
          </div>

          {/* Note */}
          <p className="text-xs text-zinc-500 mb-2">One thought? (optional)</p>
          <input
            value={note} onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="e.g. The ending hit different"
            maxLength={120}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-zinc-500 mb-5 placeholder-zinc-600"
          />

          {/* Actions */}
          <div className="flex gap-3">
            <button onClick={handleSave} disabled={saving || !rangeValid}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: 'var(--vermillion)', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : 'Done'}
            </button>
            <button onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 bg-zinc-800 transition-colors">
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
