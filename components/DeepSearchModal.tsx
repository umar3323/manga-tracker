'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { DeepSearchResult, Arc } from '@/app/api/deep-search/route'

interface Props {
  mangaId: string
  malId?: number | null
  title: string
  onClose: () => void
  onSaved: (totalChapters: number | null) => void
}

export default function DeepSearchModal({ mangaId, malId, title, onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<'searching' | 'review' | 'saving' | 'done'>('searching')
  const [result, setResult] = useState<DeepSearchResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Editable fields
  const [totalChapters, setTotalChapters] = useState<string>('')
  const [arcs, setArcs] = useState<Arc[]>([])

  const runSearch = async () => {
    setPhase('searching')
    setError(null)
    try {
      const res = await fetch('/api/deep-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: malId ?? null, title }),
      })
      if (!res.ok) throw new Error('Search failed')
      const data: DeepSearchResult = await res.json()
      setResult(data)
      setTotalChapters(data.total_chapters != null ? String(data.total_chapters) : '')
      setArcs(data.arcs.length > 0 ? data.arcs : [{ name: '', start_chapter: 1, end_chapter: 1 }])
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setPhase('review')
    }
  }

  // Trigger search on first render
  useState(() => { runSearch() })

  const addArc = () => setArcs(prev => [...prev, { name: '', start_chapter: 1, end_chapter: 1 }])
  const removeArc = (i: number) => setArcs(prev => prev.filter((_, j) => j !== i))
  const updateArc = (i: number, field: keyof Arc, value: string | number) =>
    setArcs(prev => prev.map((a, j) => j === i ? { ...a, [field]: value } : a))

  const handleSave = async () => {
    setPhase('saving')
    const total = totalChapters !== '' ? parseInt(totalChapters, 10) : null

    // Update manga_list
    const updates: Record<string, unknown> = {}
    if (total != null && !isNaN(total)) updates.total_chapters = total
    if (Object.keys(updates).length > 0) {
      await supabase.from('manga_list').update(updates).eq('id', mangaId)
    }

    // Replace arcs
    await supabase.from('arcs').delete().eq('manga_id', mangaId)
    const validArcs = arcs.filter(a => a.name.trim())
    if (validArcs.length > 0) {
      await supabase.from('arcs').insert(validArcs.map(a => ({
        manga_id: mangaId,
        name: a.name.trim(),
        start_chapter: a.start_chapter,
        end_chapter: a.end_chapter,
      })))
    }

    setPhase('done')
    onSaved(total ?? null)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-bold text-base">Deep Search</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xs">{title}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {phase === 'searching' && (
            <div className="flex flex-col items-center gap-3 py-8 text-zinc-400">
              <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              <p className="text-sm">Searching Jikan + Claude AI…</p>
            </div>
          )}

          {phase === 'saving' && (
            <div className="flex flex-col items-center gap-3 py-8 text-zinc-400">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
              <p className="text-sm">Saving…</p>
            </div>
          )}

          {phase === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8 text-emerald-400">
              <span className="text-3xl">✓</span>
              <p className="text-sm font-semibold">Saved Successfully</p>
            </div>
          )}

          {(phase === 'review') && (
            <>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-xs text-red-400">
                  {error} — you can still enter data manually below.
                </div>
              )}

              {result && (
                <div className="bg-zinc-800/50 rounded-lg px-3 py-2 text-xs text-zinc-400">
                  Source: <span className="text-zinc-200">{result.source}</span>
                  {result.score != null && <> · Score: <span className="text-zinc-200">{result.score}</span></>}
                </div>
              )}

              {/* Total chapters */}
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Total Chapters</label>
                <input
                  type="number"
                  min={0}
                  value={totalChapters}
                  onChange={e => setTotalChapters(e.target.value)}
                  placeholder="Unknown"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>

              {/* Arcs */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-zinc-400">Story Arcs</label>
                  <button onClick={addArc} className="text-xs text-violet-400 hover:text-violet-300 transition-colors">+ Add Arc</button>
                </div>
                <div className="space-y-2">
                  {arcs.map((arc, i) => (
                    <div key={i} className="bg-zinc-800 rounded-lg p-3 flex gap-2 items-start">
                      <div className="flex-1 space-y-2">
                        <input
                          value={arc.name}
                          onChange={e => updateArc(i, 'name', e.target.value)}
                          placeholder="Arc name…"
                          className="w-full bg-zinc-700 border border-zinc-600 rounded px-2.5 py-1.5 text-xs text-white outline-none focus:border-violet-500"
                        />
                        <div className="flex gap-2">
                          <div className="flex-1">
                            <label className="text-[10px] text-zinc-500 block mb-0.5">Start Ch.</label>
                            <input
                              type="number"
                              min={1}
                              value={arc.start_chapter}
                              onChange={e => updateArc(i, 'start_chapter', parseInt(e.target.value, 10) || 1)}
                              className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <div className="flex-1">
                            <label className="text-[10px] text-zinc-500 block mb-0.5">End Ch.</label>
                            <input
                              type="number"
                              min={1}
                              value={arc.end_chapter}
                              onChange={e => updateArc(i, 'end_chapter', parseInt(e.target.value, 10) || 1)}
                              className="w-full bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-violet-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                        </div>
                      </div>
                      <button onClick={() => removeArc(i)} className="text-zinc-600 hover:text-red-400 transition-colors mt-0.5 text-sm">✕</button>
                    </div>
                  ))}
                  {arcs.length === 0 && (
                    <button onClick={addArc} className="w-full py-3 rounded-lg border border-dashed border-zinc-700 text-xs text-zinc-600 hover:border-zinc-500 hover:text-zinc-400 transition-colors">
                      + Add First Arc
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {(phase === 'review') && (
          <div className="px-5 py-4 border-t border-zinc-800 flex gap-3">
            <button
              onClick={runSearch}
              className="flex-1 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
            >
              Re-Search
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 transition-colors"
            >
              Apply & Save
            </button>
          </div>
        )}

        {phase === 'done' && (
          <div className="px-5 py-4 border-t border-zinc-800">
            <button onClick={onClose} className="w-full py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
