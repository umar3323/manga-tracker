'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Rewatch {
  id: string
  manga_id: string
  rewatch_number: number
  started_at: string | null
  finished_at: string | null
  notes: string
  rating: number | null
  episodes_at_start: number | null
  episodes_at_end: number | null
  created_at: string
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
  mangaId: string
  animeTitle: string | null
  episodesWatched: number
  onStarted: (episodesAtStart: number) => void
}

export default function RewatchSection({ mangaId, animeTitle, episodesWatched, onStarted }: Props) {
  const [rewatches, setRewatches] = useState<Rewatch[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [rating, setRating] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('rewatches').select('*').eq('manga_id', mangaId)
      .order('rewatch_number', { ascending: true })
      .then(({ data }) => { if (data) setRewatches(data as Rewatch[]); setLoading(false) })
  }, [mangaId])

  const active = rewatches.find(r => r.started_at && !r.finished_at)
  const completed = rewatches.filter(r => r.finished_at)

  const startRewatch = async () => {
    setSaving(true)
    const nextNum = (rewatches.length > 0 ? Math.max(...rewatches.map(r => r.rewatch_number)) : 0) + 1
    const { data, error } = await supabase.from('rewatches').insert({
      manga_id: mangaId,
      rewatch_number: nextNum,
      started_at: new Date().toISOString(),
      episodes_at_start: episodesWatched,
    }).select().single()
    if (!error && data) {
      setRewatches(prev => [...prev, data as Rewatch])
      // Reset parent episodes to 0
      await supabase.from('manga_list').update({ episodes_watched: 0 }).eq('id', mangaId)
      onStarted(episodesWatched)
    }
    setShowForm(false)
    setSaving(false)
  }

  const completeRewatch = async () => {
    if (!completingId) return
    setSaving(true)
    const { data, error } = await supabase.from('rewatches')
      .update({
        finished_at: new Date().toISOString(),
        rating: rating ? parseInt(rating) : null,
        notes: notes.trim(),
        episodes_at_end: episodesWatched,
      })
      .eq('id', completingId)
      .select().single()
    if (!error && data) {
      setRewatches(prev => prev.map(r => r.id === completingId ? data as Rewatch : r))
      setCompletingId(null); setRating(''); setNotes('')
    }
    setSaving(false)
  }

  const deleteRewatch = async (id: string) => {
    setRewatches(prev => prev.filter(r => r.id !== id))
    await supabase.from('rewatches').delete().eq('id', id)
  }

  if (loading) return null

  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
          <span>📺</span>
          Re-Watches {rewatches.length > 0 && `(${rewatches.length})`}
        </h3>
        {animeTitle && (
          <span className="text-[10px] text-zinc-700 truncate max-w-[160px]">{animeTitle}</span>
        )}
      </div>

      {/* Active re-watch */}
      {active && (
        <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-cyan-300">
              Re-Watch #{active.rewatch_number} In Progress
            </p>
            <div className="flex items-center gap-2">
              {active.episodes_at_start != null && (
                <span className="text-[10px] text-zinc-500">
                  Started At Ep.&nbsp;{active.episodes_at_start} · Now Ep.&nbsp;{episodesWatched}
                </span>
              )}
              <p className="text-xs text-zinc-600">{fmtDate(active.started_at)}</p>
            </div>
          </div>
          {completingId === active.id ? (
            <div className="space-y-2">
              <input type="number" min={1} max={10} value={rating} onChange={e => setRating(e.target.value)}
                placeholder="Rating 1–10"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
              />
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notes on this re-watch…" rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none resize-none placeholder:text-zinc-600"
              />
              <p className="text-[10px] text-zinc-600">
                Will record progress as Ep.&nbsp;{active.episodes_at_start ?? 0} → Ep.&nbsp;{episodesWatched}
              </p>
              <div className="flex gap-2">
                <button onClick={completeRewatch} disabled={saving}
                  className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium disabled:opacity-40">
                  {saving ? '…' : 'Mark Complete'}
                </button>
                <button onClick={() => setCompletingId(null)} className="px-4 py-2 bg-zinc-700 rounded-lg text-xs text-zinc-300">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setCompletingId(active.id)}
              className="w-full py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs text-zinc-300 transition-colors">
              ✓ Mark Complete
            </button>
          )}
        </div>
      )}

      {/* Completed re-watches */}
      {completed.length > 0 && (
        <div className="space-y-2 mb-3">
          {completed.map(r => (
            <div key={r.id} className="flex items-start gap-3 px-3 py-2.5 bg-zinc-800 rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-300">Re-Watch #{r.rewatch_number}</span>
                  {r.rating && (
                    <span className="text-xs text-yellow-400">★ {r.rating}/10</span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {fmtDate(r.started_at)} → {fmtDate(r.finished_at)}
                </p>
                {(r.episodes_at_start != null || r.episodes_at_end != null) && (
                  <p className="text-[10px] text-cyan-400/70 mt-0.5">
                    Ep.&nbsp;{r.episodes_at_start ?? 0} → Ep.&nbsp;{r.episodes_at_end ?? '?'}
                  </p>
                )}
                {r.notes && <p className="text-xs text-zinc-500 mt-1 italic">{r.notes}</p>}
              </div>
              <button onClick={() => deleteRewatch(r.id)} className="text-zinc-700 hover:text-red-400 text-sm shrink-0">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Start new re-watch */}
      {!active && (
        showForm ? (
          <div className="bg-zinc-800 rounded-xl p-3">
            <p className="text-xs text-zinc-400 mb-1">
              {rewatches.length > 0
                ? `Start Re-Watch #${Math.max(...rewatches.map(r => r.rewatch_number)) + 1}`
                : 'Log Your First Re-Watch'}
            </p>
            <p className="text-[10px] text-zinc-600 mb-3">
              Current progress (Ep.&nbsp;{episodesWatched}) will be saved, then reset to 0.
            </p>
            <div className="flex gap-2">
              <button onClick={startRewatch} disabled={saving}
                className="flex-1 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-medium disabled:opacity-40">
                {saving ? '…' : 'Start Now'}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-zinc-700 rounded-lg text-xs text-zinc-300">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)}
            className="w-full py-2 border border-dashed border-zinc-700 rounded-xl text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors">
            + Start Re-Watch
          </button>
        )
      )}
    </div>
  )
}
