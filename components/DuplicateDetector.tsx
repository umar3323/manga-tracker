'use client'

import { useState, useMemo } from 'react'
import { supabase, type Manga } from '@/lib/supabase'

function normalise(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
}

function similarity(a: string, b: string): number {
  const na = normalise(a)
  const nb = normalise(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  const wa = new Set(na.split(' '))
  const wb = new Set(nb.split(' '))
  const inter = [...wa].filter(w => wb.has(w) && w.length > 2).length
  const union = new Set([...wa, ...wb]).size
  return inter / union
}

interface Pair { a: Manga; b: Manga; score: number }

export default function DuplicateDetector({
  manga,
  onDeleted,
}: {
  manga: Manga[]
  onDeleted: (id: string) => void
}) {
  const [open, setOpen]       = useState(false)
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [merged, setMerged]   = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState<string | null>(null)
  const [toast, setToast]     = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const pairs = useMemo<Pair[]>(() => {
    if (!checked) return []
    const results: Pair[] = []
    for (let i = 0; i < manga.length; i++) {
      for (let j = i + 1; j < manga.length; j++) {
        const score = similarity(manga[i].title, manga[j].title)
        if (score >= 0.7) results.push({ a: manga[i], b: manga[j], score })
      }
    }
    return results.sort((a, b) => b.score - a.score)
  }, [checked, manga])

  const pairKey = (p: Pair) => `${p.a.id}::${p.b.id}`

  const visible = pairs.filter(p => !dismissed.has(pairKey(p)) && !merged.has(pairKey(p)))

  const keepAndDelete = async (keep: Manga, remove: Manga, pair: Pair) => {
    setDeleting(remove.id)
    const { error } = await supabase.from('manga_list').delete().eq('id', remove.id)
    setDeleting(null)
    if (error) { showToast('Failed to delete — try again'); return }
    setMerged(prev => new Set([...prev, pairKey(pair)]))
    onDeleted(remove.id)
    showToast(`Kept "${keep.title}", removed duplicate`)
  }

  return (
    <div className="bg-zinc-900 rounded-xl mb-4">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold">Duplicate title detector</h3>
          <p className="text-xs text-zinc-500 mt-0.5">{manga.length} titles in your list</p>
        </div>
        <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-zinc-800 pt-4">

          {!checked && (
            <button
              onClick={() => { setLoading(true); setTimeout(() => { setChecked(true); setLoading(false) }, 200) }}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--vermillion)', color: '#fff', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Scanning…' : '🔍 Check for duplicates'}
            </button>
          )}

          {checked && (
            <div className="space-y-3">
              {visible.length === 0 && (
                <p className="text-xs text-emerald-400">
                  {pairs.length === 0 ? 'No duplicates found.' : 'All pairs resolved.'}
                </p>
              )}

              {visible.map(pair => {
                const key = pairKey(pair)
                // Pick default "keep" as the one with more chapters or more recent
                const suggested = pair.a.current_chapter >= pair.b.current_chapter ? pair.a : pair.b
                const other     = suggested.id === pair.a.id ? pair.b : pair.a

                return (
                  <div key={key} className="bg-zinc-800 rounded-xl px-4 py-3 space-y-3">
                    {/* Confidence */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: pair.score >= 0.9 ? 'rgba(255,45,70,0.15)' : 'rgba(255,176,46,0.15)',
                          color: pair.score >= 0.9 ? 'var(--vermillion)' : '#FFB02E',
                        }}>
                        {Math.round(pair.score * 100)}% match
                      </span>
                      <button
                        onClick={() => setDismissed(prev => new Set([...prev, key]))}
                        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Not a duplicate
                      </button>
                    </div>

                    {/* The two entries */}
                    <div className="space-y-2">
                      {[pair.a, pair.b].map(m => (
                        <div key={m.id}
                          className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 border ${
                            m.id === suggested.id
                              ? 'border-emerald-700/40 bg-emerald-950/20'
                              : 'border-zinc-700 bg-zinc-900/60'
                          }`}>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-zinc-200 truncate">{m.title}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              Ch.{m.current_chapter} · {m.status.replace(/_/g, ' ')}
                              {m.id === suggested.id && <span className="text-emerald-500 ml-2">← keep</span>}
                            </p>
                          </div>
                          <button
                            onClick={() => keepAndDelete(m, m.id === pair.a.id ? pair.b : pair.a, pair)}
                            disabled={deleting === (m.id === pair.a.id ? pair.b.id : pair.a.id)}
                            className="shrink-0 px-3 py-1 text-xs rounded-lg font-medium transition-colors"
                            style={{ backgroundColor: 'rgba(47,207,122,0.12)', color: '#2FCF7A' }}
                          >
                            {deleting ? '…' : 'Keep this'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}

              {pairs.filter(p => merged.has(pairKey(p))).map(p => (
                <div key={pairKey(p)} className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-950/30 rounded-lg px-4 py-2">
                  <span>✓</span> Merged — kept <span className="text-zinc-300 mx-1">{p.a.title}</span> or <span className="text-zinc-300 mx-1">{p.b.title}</span>
                </div>
              ))}

              <button
                onClick={() => { setChecked(false); setDismissed(new Set()); setMerged(new Set()) }}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Reset &amp; re-check
              </button>
            </div>
          )}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm px-4 py-2 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
