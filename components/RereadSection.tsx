'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Reread {
  id: string
  manga_id: string
  reread_number: number
  started_at: string | null
  finished_at: string | null
  notes: string
  rating: number | null
  chapter_at_start: number | null
  chapter_at_end: number | null
  created_at: string
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

interface Props {
  mangaId: string
  currentChapter: number
  onStarted: (chapterAtStart: number) => void
  onCompleted: (restoredChapter: number) => void
}

export default function RereadSection({ mangaId, currentChapter, onStarted, onCompleted }: Props) {
  const [rereads, setRereads] = useState<Reread[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [rating, setRating] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('rereads').select('*').eq('manga_id', mangaId)
      .order('reread_number', { ascending: true })
      .then(({ data }) => { if (data) setRereads(data as Reread[]); setLoading(false) })
  }, [mangaId])

  const active = rereads.find(r => r.started_at && !r.finished_at)
  const completed = rereads.filter(r => r.finished_at)

  const startReread = async () => {
    setSaving(true)
    const nextNum = (rereads.length > 0 ? Math.max(...rereads.map(r => r.reread_number)) : 0) + 1
    const { data, error } = await supabase.from('rereads').insert({
      manga_id: mangaId,
      reread_number: nextNum,
      started_at: new Date().toISOString(),
      chapter_at_start: currentChapter,
    }).select().single()
    if (!error && data) {
      setRereads(prev => [...prev, data as Reread])
      // Reset parent chapter to 0
      await supabase.from('manga_list').update({ current_chapter: 0 }).eq('id', mangaId)
      onStarted(currentChapter)
    }
    setShowForm(false)
    setSaving(false)
  }

  const completeReread = async () => {
    if (!completingId) return
    setSaving(true)
    const { data, error } = await supabase.from('rereads')
      .update({
        finished_at: new Date().toISOString(),
        rating: rating ? parseInt(rating) : null,
        notes: notes.trim(),
        chapter_at_end: currentChapter,
      })
      .eq('id', completingId)
      .select().single()
    if (!error && data) {
      setRereads(prev => prev.map(r => r.id === completingId ? data as Reread : r))
      // Restore current_chapter to where the user was before the re-read started
      const restored = active?.chapter_at_start ?? 0
      await supabase.from('manga_list').update({ current_chapter: restored }).eq('id', mangaId)
      onCompleted(restored)
      setCompletingId(null); setRating(''); setNotes('')
    }
    setSaving(false)
  }

  const deleteReread = async (id: string) => {
    setRereads(prev => prev.filter(r => r.id !== id))
    await supabase.from('rereads').delete().eq('id', id)
  }

  if (loading) return null

  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Re-Reads {rereads.length > 0 && `(${rereads.length})`}
        </h3>
      </div>

      {/* Active re-read */}
      {active && (
        <div className="bg-violet-900/20 border border-violet-500/30 rounded-xl p-3 mb-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-medium text-violet-300">
              Re-Read #{active.reread_number} In Progress
            </p>
            <div className="flex items-center gap-2">
              {active.chapter_at_start != null && (
                <span className="text-[10px] text-zinc-500">
                  Started At Ch.&nbsp;{active.chapter_at_start} · Now Ch.&nbsp;{currentChapter}
                </span>
              )}
              <p className="text-xs text-zinc-600">{fmtDate(active.started_at)}</p>
            </div>
          </div>
          {completingId === active.id ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input type="number" min={1} max={10} value={rating} onChange={e => setRating(e.target.value)}
                  placeholder="Rating 1–10"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
                />
              </div>
              <textarea value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Notes on this re-read…" rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none resize-none placeholder:text-zinc-600"
              />
              <p className="text-[10px] text-zinc-600">
                Will record progress as Ch.&nbsp;{active.chapter_at_start ?? 0} → Ch.&nbsp;{currentChapter}
              </p>
              <div className="flex gap-2">
                <button onClick={completeReread} disabled={saving}
                  className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium disabled:opacity-40">
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

      {/* Completed re-reads */}
      {completed.length > 0 && (
        <div className="space-y-2 mb-3">
          {completed.map(r => (
            <div key={r.id} className="flex items-start gap-3 px-3 py-2.5 bg-zinc-800 rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-zinc-300">Re-Read #{r.reread_number}</span>
                  {r.rating && (
                    <span className="text-xs text-yellow-400">★ {r.rating}/10</span>
                  )}
                </div>
                <p className="text-xs text-zinc-600 mt-0.5">
                  {fmtDate(r.started_at)} → {fmtDate(r.finished_at)}
                </p>
                {(r.chapter_at_start != null || r.chapter_at_end != null) && (
                  <p className="text-[10px] text-violet-400/70 mt-0.5">
                    Ch.&nbsp;{r.chapter_at_start ?? 0} → Ch.&nbsp;{r.chapter_at_end ?? '?'}
                  </p>
                )}
                {r.notes && <p className="text-xs text-zinc-500 mt-1 italic">{r.notes}</p>}
              </div>
              <button onClick={() => deleteReread(r.id)} className="text-zinc-700 hover:text-red-400 text-sm shrink-0">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Start new re-read */}
      {!active && (
        showForm ? (
          <div className="bg-zinc-800 rounded-xl p-3">
            <p className="text-xs text-zinc-400 mb-1">
              {rereads.length > 0
                ? `Start Re-Read #${Math.max(...rereads.map(r => r.reread_number)) + 1}`
                : 'Log Your First Re-Read'}
            </p>
            <p className="text-[10px] text-zinc-600 mb-3">
              Current progress (Ch.&nbsp;{currentChapter}) will be saved, then reset to 0.
            </p>
            <div className="flex gap-2">
              <button onClick={startReread} disabled={saving}
                className="flex-1 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-xs font-medium disabled:opacity-40">
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
            + Start Re-Read
          </button>
        )
      )}
    </div>
  )
}
