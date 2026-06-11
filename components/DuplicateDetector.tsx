'use client'

import { useState, useMemo, useEffect } from 'react'
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
  const [userId, setUserId]   = useState<string | null>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserId(user.id)
      supabase.from('user_settings').select('value')
        .eq('user_id', user.id).eq('key', 'dismissed_duplicates').single()
        .then(({ data }) => {
          if (data?.value) {
            try { setDismissed(new Set(JSON.parse(data.value))) } catch {}
          }
        })
    })
  }, [])

  const dismiss = async (key: string) => {
    const next = new Set([...dismissed, key])
    setDismissed(next)
    if (!userId) { showToast('Could not save dismissal — it will reappear on reload'); return }
    const { error } = await supabase.from('user_settings').upsert(
      { user_id: userId, key: 'dismissed_duplicates', value: JSON.stringify([...next]), updated_at: new Date().toISOString() },
      { onConflict: 'user_id,key' }
    )
    if (error) showToast('Could not save dismissal — it will reappear on reload')
  }

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

  const pairKey = (p: Pair) => [p.a.id, p.b.id].sort().join('::')

  const visible = pairs.filter(p => !dismissed.has(pairKey(p)) && !merged.has(pairKey(p)))

  const keepAndDelete = async (keep: Manga, remove: Manga, pair: Pair) => {
    setDeleting(keep.id + remove.id)
    const { error } = await supabase.from('manga_list').delete().eq('id', remove.id)
    setDeleting(null)
    if (error) { showToast('Failed to delete — try again'); return }
    setMerged(prev => new Set([...prev, pairKey(pair)]))
    onDeleted(remove.id)
    showToast(`Kept "${keep.title}", removed duplicate`)
  }

  // Smart merge: keep entry with more progress, pull best fields from both
  const smartMerge = async (pair: Pair) => {
    const keep   = pair.a.current_chapter >= pair.b.current_chapter ? pair.a : pair.b
    const remove = keep.id === pair.a.id ? pair.b : pair.a
    const mergeKey = keep.id + remove.id

    // Combine the best of both
    const updates: Record<string, unknown> = {
      current_chapter: Math.max(pair.a.current_chapter, pair.b.current_chapter),
      cover_url:       keep.cover_url ?? remove.cover_url,
      total_chapters:  keep.total_chapters ?? remove.total_chapters,
      has_anime:       keep.has_anime || remove.has_anime,
      anime_mal_id:    keep.anime_mal_id ?? remove.anime_mal_id,
      anime_title:     keep.anime_title ?? remove.anime_title,
      user_rating:     keep.user_rating ?? remove.user_rating,
    }
    // Merge notes — append non-duplicate note from the discarded entry
    if (remove.notes?.trim()) {
      const keepNote   = keep.notes?.trim() ?? ''
      const removeNote = remove.notes.trim()
      if (!keepNote.includes(removeNote)) {
        updates.notes = keepNote ? `${keepNote}\n---\n${removeNote}` : removeNote
      }
    }

    setDeleting(mergeKey)
    const [updateRes, deleteRes] = await Promise.all([
      supabase.from('manga_list').update(updates).eq('id', keep.id),
      supabase.from('manga_list').delete().eq('id', remove.id),
    ])
    setDeleting(null)
    if (updateRes.error || deleteRes.error) { showToast('Merge failed — try again'); return }
    setMerged(prev => new Set([...prev, pairKey(pair)]))
    onDeleted(remove.id)
    showToast(`Merged into "${keep.title}" — best data from both kept`)
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
                const isBusy = !!deleting

                return (
                  <div key={key} className="bg-zinc-800 rounded-xl px-4 py-3 space-y-3">
                    {/* Header row */}
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          backgroundColor: pair.score >= 0.9 ? 'rgba(255,45,70,0.15)' : 'rgba(255,176,46,0.15)',
                          color: pair.score >= 0.9 ? 'var(--vermillion)' : '#FFB02E',
                        }}>
                        {Math.round(pair.score * 100)}% match
                      </span>
                      <button
                        onClick={() => dismiss(key)}
                        className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        Not a duplicate
                      </button>
                    </div>

                    {/* Side-by-side entries */}
                    <div className="grid grid-cols-2 gap-2">
                      {[pair.a, pair.b].map(m => (
                        <div key={m.id} className="rounded-lg px-3 py-2.5 border border-zinc-700 bg-zinc-900/60">
                          <p className="text-xs font-medium text-zinc-200 truncate">{m.title}</p>
                          <p className="text-[10px] text-zinc-500 mt-0.5">Ch.{m.current_chapter}</p>
                          <p className="text-[10px] text-zinc-600">{m.status.replace(/_/g, ' ')}</p>
                          {m.notes && (
                            <p className="text-[10px] text-zinc-600 mt-1 line-clamp-1 italic">"{m.notes.slice(0, 40)}"</p>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Three merge actions */}
                    <div className="grid grid-cols-3 gap-1.5">
                      {/* Keep A */}
                      <button
                        onClick={() => keepAndDelete(pair.a, pair.b, pair)}
                        disabled={isBusy}
                        title={`Keep "${pair.a.title}", delete "${pair.b.title}"`}
                        className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-40"
                        style={{ backgroundColor: 'rgba(47,207,122,0.10)', color: '#2FCF7A' }}
                      >
                        {isBusy ? '…' : (
                          <>
                            <span>← Keep A</span>
                            <span className="text-zinc-600 truncate w-full text-center">{pair.a.title.split(':')[0].slice(0, 14)}</span>
                          </>
                        )}
                      </button>

                      {/* Smart merge */}
                      <button
                        onClick={() => smartMerge(pair)}
                        disabled={isBusy}
                        title="Merge both — keeps highest chapter, combines notes and cover"
                        className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-40"
                        style={{ backgroundColor: 'rgba(43,230,220,0.10)', color: 'var(--cyan)' }}
                      >
                        {isBusy ? '…' : (
                          <>
                            <span>⟷ Merge</span>
                            <span className="text-zinc-600 text-center">Best Of Both</span>
                          </>
                        )}
                      </button>

                      {/* Keep B */}
                      <button
                        onClick={() => keepAndDelete(pair.b, pair.a, pair)}
                        disabled={isBusy}
                        title={`Keep "${pair.b.title}", delete "${pair.a.title}"`}
                        className="flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-[10px] font-medium transition-colors disabled:opacity-40"
                        style={{ backgroundColor: 'rgba(47,207,122,0.10)', color: '#2FCF7A' }}
                      >
                        {isBusy ? '…' : (
                          <>
                            <span>Keep B →</span>
                            <span className="text-zinc-600 truncate w-full text-center">{pair.b.title.split(':')[0].slice(0, 14)}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )
              })}

              {pairs.filter(p => merged.has(pairKey(p))).map(p => (
                <div key={pairKey(p)} className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-950/30 rounded-lg px-4 py-2">
                  ✓ Resolved — <span className="text-zinc-400 ml-1 truncate">{p.a.title}</span>
                </div>
              ))}

              <button
                onClick={async () => {
                  setChecked(false); setDismissed(new Set()); setMerged(new Set())
                  if (userId) await supabase.from('user_settings').upsert(
                    { user_id: userId, key: 'dismissed_duplicates', value: '[]', updated_at: new Date().toISOString() },
                    { onConflict: 'user_id,key' }
                  )
                }}
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
