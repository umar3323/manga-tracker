'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { supabase, type Manga } from '@/lib/supabase'
import type { AnimeRow } from '@/lib/anime-data'

// ── Jikan anime search ────────────────────────────────────────────────────────
interface JikanAnime { mal_id: number; title: string; images?: { jpg?: { image_url?: string } } }

async function searchJikanAnime(q: string): Promise<JikanAnime[]> {
  try {
    const res = await fetch(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=8&order_by=score&sort=desc`,
      { signal: AbortSignal.timeout(6000) }
    )
    if (!res.ok) return []
    return (await res.json()).data ?? []
  } catch { return [] }
}

// ── Fuzzy matching ────────────────────────────────────────────────────────────
function normalise(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function similarity(a: string, b: string): number {
  const na = normalise(a)
  const nb = normalise(b)
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.9
  // word overlap score
  const wa = new Set(na.split(' '))
  const wb = new Set(nb.split(' '))
  const inter = [...wa].filter(w => wb.has(w) && w.length > 2).length
  const union = new Set([...wa, ...wb]).size
  return inter / union
}

interface Match {
  manga: Manga
  animeTitle: string
  score: number
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AnimeLinker({ manga, watchedAnime }: { manga: Manga[]; watchedAnime: AnimeRow[] }) {
  const [open, setOpen] = useState(false)
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [manualLinks, setManualLinks] = useState<Record<string, string>>({}) // manga.id → anime title
  const [searchQuery, setSearchQuery] = useState<Record<string, string>>({})
  const [jikanResults, setJikanResults] = useState<Record<string, JikanAnime[]>>({})
  const [jikanLoading, setJikanLoading] = useState<Record<string, boolean>>({})
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Auto-detect matches (score ≥ 0.5, not already linked)
  const autoMatches = useMemo<Match[]>(() => {
    if (!checked) return []
    const unlinked = manga.filter(m => !m.has_anime)
    const results: Match[] = []
    for (const m of unlinked) {
      let best: { animeTitle: string; score: number } | null = null
      for (const a of watchedAnime) {
        const score = similarity(m.title, a.title)
        if (score >= 0.5 && (!best || score > best.score)) {
          best = { animeTitle: a.title, score }
        }
      }
      if (best) results.push({ manga: m, animeTitle: best.animeTitle, score: best.score })
    }
    return results.sort((a, b) => b.score - a.score)
  }, [checked, manga, watchedAnime])

  // Manga without any match (for manual linking)
  const unmatched = useMemo<Manga[]>(() => {
    if (!checked) return []
    const matchedIds = new Set(autoMatches.map(m => m.manga.id))
    return manga
      .filter(m => !m.has_anime && !matchedIds.has(m.id))
      .sort((a, b) => a.title.localeCompare(b.title))
  }, [checked, autoMatches, manga])

  const runCheck = () => {
    setLoading(true)
    setTimeout(() => { setChecked(true); setLoading(false) }, 300)
  }

  const saveLink = async (mangaId: string, animeTitle: string) => {
    setSaving(mangaId)
    const { error } = await supabase
      .from('manga_list')
      .update({ has_anime: true, anime_title: animeTitle })
      .eq('id', mangaId)
    setSaving(null)
    if (error) { showToast('Failed to save link'); return }
    setSaved(prev => new Set([...prev, mangaId]))
    showToast(`Linked to "${animeTitle}"`)
  }

  const saveManualLink = async (manga: Manga) => {
    const title = manualLinks[manga.id]
    if (!title) return
    await saveLink(manga.id, title)
  }

  const visibleMatches = autoMatches.filter(m => !dismissed.has(m.manga.id) && !saved.has(m.manga.id))
  const alreadyLinked = manga.filter(m => m.has_anime)

  const handleManualSearch = (mangaId: string, q: string) => {
    setSearchQuery(prev => ({ ...prev, [mangaId]: q }))
    setManualLinks(prev => ({ ...prev, [mangaId]: '' })) // clear confirmed pick when typing
    if (searchTimers.current[mangaId]) clearTimeout(searchTimers.current[mangaId])
    if (!q.trim() || q.length < 2) { setJikanResults(prev => ({ ...prev, [mangaId]: [] })); return }
    setJikanLoading(prev => ({ ...prev, [mangaId]: true }))
    searchTimers.current[mangaId] = setTimeout(async () => {
      const results = await searchJikanAnime(q)
      setJikanResults(prev => ({ ...prev, [mangaId]: results }))
      setJikanLoading(prev => ({ ...prev, [mangaId]: false }))
    }, 400)
  }

  return (
    <div className="bg-zinc-900 rounded-xl mb-6">
      {/* Header / trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <h3 className="text-sm font-semibold">Anime–Manga linker</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {alreadyLinked.length} linked · {manga.filter(m => !m.has_anime).length} unlinked
          </p>
        </div>
        <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-zinc-800 pt-4">

          {/* Check button */}
          {!checked && (
            <button
              onClick={runCheck}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ backgroundColor: 'var(--vermillion)', color: '#fff', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Scanning…' : '🔍 Check for matches'}
            </button>
          )}

          {checked && (
            <div className="space-y-6">

              {/* Already linked */}
              {alreadyLinked.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
                    Already linked ({alreadyLinked.length})
                  </h4>
                  <div className="space-y-1">
                    {alreadyLinked.map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-xs text-zinc-500 py-1">
                        <span className="text-emerald-500">✓</span>
                        <span className="text-zinc-300">{m.title}</span>
                        <span className="text-zinc-600">→</span>
                        <span>{m.anime_title ?? '(linked)'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Auto-detected matches */}
              {visibleMatches.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
                    Suggested matches ({visibleMatches.length})
                  </h4>
                  <div className="space-y-2">
                    {visibleMatches.map(({ manga: m, animeTitle, score }) => (
                      <div key={m.id}
                        className="flex items-center gap-3 bg-zinc-800 rounded-xl px-4 py-3">
                        {/* Confidence badge */}
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          style={{
                            backgroundColor: score >= 0.9 ? 'rgba(47,207,122,0.15)' : 'rgba(255,176,46,0.15)',
                            color: score >= 0.9 ? '#2FCF7A' : '#FFB02E',
                          }}>
                          {Math.round(score * 100)}%
                        </span>

                        {/* Titles */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-zinc-200 truncate">{m.title}</p>
                          <p className="text-[10px] text-zinc-500 truncate">→ {animeTitle}</p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => saveLink(m.id, animeTitle)}
                            disabled={saving === m.id}
                            className="px-3 py-1 text-xs rounded-lg font-medium transition-colors"
                            style={{ backgroundColor: 'rgba(47,207,122,0.15)', color: '#2FCF7A' }}
                          >
                            {saving === m.id ? '…' : 'Link'}
                          </button>
                          <button
                            onClick={() => setDismissed(prev => new Set([...prev, m.id]))}
                            className="px-3 py-1 text-xs rounded-lg text-zinc-500 hover:text-zinc-300 bg-zinc-700 transition-colors"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No auto-matches */}
              {checked && visibleMatches.length === 0 && autoMatches.length === 0 && unmatched.length > 0 && (
                <p className="text-xs text-zinc-500">No automatic matches found. Link manually below.</p>
              )}

              {/* Saved matches (confirmed) */}
              {autoMatches.filter(m => saved.has(m.manga.id)).map(({ manga: m, animeTitle }) => (
                <div key={m.id} className="flex items-center gap-2 text-xs text-emerald-500 bg-emerald-950/30 rounded-lg px-4 py-2">
                  <span>✓</span>
                  <span className="text-zinc-300">{m.title}</span>
                  <span className="text-zinc-600">→</span>
                  <span>{animeTitle}</span>
                </div>
              ))}

              {/* Manual linking section */}
              {unmatched.filter(m => !saved.has(m.id)).length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-1">
                    Manual link ({unmatched.filter(m => !saved.has(m.id)).length} unmatched)
                  </h4>
                  <p className="text-[10px] text-zinc-600 mb-3">Searches all anime on MyAnimeList</p>
                  <div className="space-y-2">
                    {unmatched.filter(m => !saved.has(m.id)).map(m => (
                      <div key={m.id} className="bg-zinc-800 rounded-xl px-4 py-3">
                        <p className="text-xs font-medium text-zinc-200 mb-2">{m.title}</p>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            {manualLinks[m.id] ? (
                              /* Confirmed pick chip */
                              <div className="flex items-center gap-2 bg-zinc-700 border border-emerald-600/40 rounded-lg px-3 py-1.5">
                                <span className="text-xs text-zinc-200 flex-1 truncate">{manualLinks[m.id]}</span>
                                <button onClick={() => { setManualLinks(prev => ({ ...prev, [m.id]: '' })); setSearchQuery(prev => ({ ...prev, [m.id]: '' })) }}
                                  className="text-zinc-500 hover:text-white text-sm">×</button>
                              </div>
                            ) : (
                              <>
                                <input
                                  value={searchQuery[m.id] ?? ''}
                                  onChange={e => handleManualSearch(m.id, e.target.value)}
                                  placeholder="Search any anime title…"
                                  className="w-full bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-zinc-400"
                                />
                                {/* Jikan dropdown */}
                                {(jikanLoading[m.id] || (jikanResults[m.id]?.length ?? 0) > 0) && (
                                  <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-zinc-800 border border-zinc-600 rounded-lg overflow-hidden shadow-xl">
                                    {jikanLoading[m.id] && (
                                      <div className="px-3 py-2 text-xs text-zinc-500">Searching…</div>
                                    )}
                                    {!jikanLoading[m.id] && (jikanResults[m.id] ?? []).map(a => (
                                      <button key={a.mal_id}
                                        onMouseDown={e => { e.preventDefault(); setManualLinks(prev => ({ ...prev, [m.id]: a.title })); setSearchQuery(prev => ({ ...prev, [m.id]: '' })); setJikanResults(prev => ({ ...prev, [m.id]: [] })) }}
                                        className="w-full flex items-center gap-2 text-left text-xs px-3 py-2 hover:bg-zinc-700 text-zinc-200 transition-colors border-b border-zinc-700 last:border-0">
                                        {a.images?.jpg?.image_url && (
                                          <img src={a.images.jpg.image_url} alt="" className="w-6 h-8 object-cover rounded shrink-0" />
                                        )}
                                        <span className="truncate">{a.title}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                          {manualLinks[m.id] && (
                            <button
                              onClick={() => saveManualLink(m)}
                              disabled={saving === m.id}
                              className="px-3 py-1.5 text-xs rounded-lg font-medium shrink-0"
                              style={{ backgroundColor: 'rgba(47,207,122,0.15)', color: '#2FCF7A' }}
                            >
                              {saving === m.id ? '…' : 'Link'}
                            </button>
                          )}
                        </div>
                        {manualLinks[m.id] && (
                          <p className="text-[10px] text-zinc-500 mt-1">→ {manualLinks[m.id]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* All done state */}
              {visibleMatches.length === 0 && unmatched.filter(m => !saved.has(m.id)).length === 0 && (
                <p className="text-xs text-emerald-400">All manga accounted for.</p>
              )}

              {/* Re-run */}
              <button
                onClick={() => { setChecked(false); setDismissed(new Set()); setSaved(new Set()) }}
                className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                Reset &amp; re-check
              </button>
            </div>
          )}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm px-4 py-2 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
