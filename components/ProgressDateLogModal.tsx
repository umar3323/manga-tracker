'use client'

import { useEffect, useState } from 'react'
import { supabase, type Manga } from '@/lib/supabase'
import Modal from '@/components/Modal'

interface LogEntry {
  id: string
  from_progress: number | null
  to_progress: number | null
  chapters_read: number
  progress_date: string | null
  progress_date_end: string | null
  date_precision: string | null
  media_type: string | null
  logged_at: string
}

interface Props {
  manga: Manga
  onClose: () => void
}

const todayISO = () => new Date().toISOString().slice(0, 10)

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ProgressDateLogModal({ manga, onClose }: Props) {
  const isAnime = manga.content_type === 'anime' || manga.has_anime
  const unit = isAnime ? 'episode' : 'chapter'
  const unitPlural = isAnime ? 'episodes' : 'chapters'
  const currentMax = isAnime
    ? (manga.episodes_watched ?? 0)
    : (manga.current_chapter ?? 0)
  const totalMax = isAnime
    ? (manga.total_episodes ?? undefined)
    : (manga.total_chapters ?? undefined)

  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Form state
  const [fromN, setFromN] = useState('1')
  const [toN, setToN] = useState(currentMax > 0 ? String(currentMax) : '1')
  const [dateMode, setDateMode] = useState<'exact' | 'range'>('exact')
  const [dateFrom, setDateFrom] = useState(todayISO())
  const [dateTo, setDateTo]   = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    supabase
      .from('reading_log')
      .select('id, from_progress, to_progress, chapters_read, progress_date, progress_date_end, date_precision, media_type, logged_at')
      .eq('manga_id', manga.id)
      .not('from_progress', 'is', null)
      .order('from_progress', { ascending: true })
      .then(({ data }) => { setEntries(data ?? []); setLoading(false) })
  }, [manga.id])

  const handleSave = async () => {
    const from = parseInt(fromN, 10)
    const to   = parseInt(toN,   10)
    if (isNaN(from) || isNaN(to) || from < 1 || to < from) {
      showToast(`"To" must be ≥ "From" and both must be ≥ 1`)
      return
    }
    if (dateMode === 'range' && dateFrom > dateTo) {
      showToast('Start date must be on or before end date')
      return
    }

    setSaving(true)
    const row: Record<string, unknown> = {
      manga_id:       manga.id,
      from_progress:  from,
      to_progress:    to,
      chapters_read:  to - from + 1,
      media_type:     isAnime ? 'anime' : 'manga',
      date_precision: dateMode === 'range' ? 'range' : 'exact',
      progress_date:  dateFrom,
      ...(dateMode === 'range' ? { progress_date_end: dateTo } : {}),
    }
    const { data, error } = await supabase.from('reading_log').insert(row).select().single()
    setSaving(false)
    if (error) { showToast('Save failed — try again'); return }
    setEntries(prev => [...prev, data as LogEntry].sort((a, b) => (a.from_progress ?? 0) - (b.from_progress ?? 0)))
    // Reset form: next batch starts after the last entry
    setFromN(String(to + 1))
    setToN(String(to + 1))
    showToast(`Saved ${unit}s ${from}–${to}`)
  }

  const handleDelete = async (id: string) => {
    await supabase.from('reading_log').delete().eq('id', id)
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  return (
    <Modal onClose={onClose} containerClass="items-end sm:items-center justify-center p-4" labelledBy="pdl-modal-title">
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 id="pdl-modal-title" className="font-semibold text-sm">Progress Date Log</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{manga.title}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors text-xl leading-none">×</button>
        </div>

        {/* Existing entries */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2 min-h-0">
          {loading && <p className="text-xs text-zinc-500 text-center py-4">Loading…</p>}
          {!loading && entries.length === 0 && (
            <p className="text-xs text-zinc-600 text-center py-4">No date entries yet — add one below.</p>
          )}
          {entries.map(e => {
            const from = e.from_progress!
            const to   = e.to_progress ?? from
            const label = from === to ? `${unit[0].toUpperCase() + unit.slice(1)} ${from}` : `${unitPlural[0].toUpperCase() + unitPlural.slice(1)} ${from}–${to}`
            const dateLabel = e.date_precision === 'range' && e.progress_date_end
              ? `${fmtDate(e.progress_date!)} → ${fmtDate(e.progress_date_end)}`
              : e.progress_date ? fmtDate(e.progress_date) : '—'
            return (
              <div key={e.id} className="flex items-center justify-between gap-3 bg-zinc-800 rounded-xl px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-zinc-200">{label}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{dateLabel}</p>
                </div>
                <button onClick={() => handleDelete(e.id)}
                  className="text-zinc-600 hover:text-red-400 transition-colors text-lg leading-none shrink-0">×</button>
              </div>
            )
          })}
        </div>

        {/* Add form */}
        <div className="border-t border-zinc-800 px-5 py-4 space-y-3 shrink-0 bg-zinc-900/80">
          <p className="text-[11px] text-zinc-500 font-medium uppercase tracking-wide">Add entry</p>

          {/* Range: from → to */}
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-zinc-600 block mb-1">
                From {unit} {totalMax ? `(max ${totalMax})` : ''}
              </label>
              <input type="number" value={fromN} min={1} max={totalMax}
                onChange={e => setFromN(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                style={{ colorScheme: 'dark' }} />
            </div>
            <span className="text-zinc-600 mt-4">→</span>
            <div className="flex-1">
              <label className="text-[10px] text-zinc-600 block mb-1">To {unit}</label>
              <input type="number" value={toN} min={fromN} max={totalMax}
                onChange={e => setToN(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-violet-500"
                style={{ colorScheme: 'dark' }} />
            </div>
          </div>

          {/* Date mode toggle */}
          <div className="flex gap-1 bg-zinc-800 rounded-xl p-1">
            {(['exact', 'range'] as const).map(m => (
              <button key={m} onClick={() => setDateMode(m)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  dateMode === m ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}>
                {m === 'exact' ? 'Single date' : 'Date range'}
              </button>
            ))}
          </div>

          {/* Date picker(s) */}
          {dateMode === 'exact' ? (
            <div>
              <label className="text-[10px] text-zinc-600 block mb-1">Date watched / read</label>
              <input type="date" value={dateFrom} max={todayISO()}
                onChange={e => setDateFrom(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-violet-500 cursor-pointer"
                style={{ colorScheme: 'dark' }} />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-zinc-600 block mb-1">Started</label>
                <input type="date" value={dateFrom} max={dateTo || todayISO()}
                  onChange={e => setDateFrom(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-violet-500 cursor-pointer"
                  style={{ colorScheme: 'dark' }} />
              </div>
              <div>
                <label className="text-[10px] text-zinc-600 block mb-1">Finished</label>
                <input type="date" value={dateTo} min={dateFrom} max={todayISO()}
                  onChange={e => setDateTo(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-violet-500 cursor-pointer"
                  style={{ colorScheme: 'dark' }} />
              </div>
            </div>
          )}

          <p className="text-[10px] text-zinc-600 leading-relaxed">
            Use a date range when you watched over multiple sittings. The total time won&apos;t be counted as continuous — it just marks when this batch started and ended.
          </p>

          <button onClick={handleSave} disabled={saving}
            className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: 'var(--vermillion)' }}>
            {saving ? 'Saving…' : `Save ${unit[0].toUpperCase() + unit.slice(1)}s ${fromN || '?'}–${toN || '?'}`}
          </button>
        </div>

        {toast && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-zinc-700 text-xs text-white px-3 py-2 rounded-lg whitespace-nowrap z-10">
            {toast}
          </div>
        )}
      </div>
    </Modal>
  )
}
