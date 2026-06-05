'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Image from 'next/image'
import { supabase, type MangaStatus } from '@/lib/supabase'
import {
  searchMangaWithFilters, searchPeople, getAnimeAdaptations, getMangaById,
  MANGA_GENRES, type JikanSearchResult, type SearchFilters,
} from '@/lib/jikan'
import type { GoodreadsBook } from '@/app/api/goodreads/route'
import DiscoverPanel from '@/components/DiscoverPanel'

const STATUS_OPTIONS: { value: MangaStatus; label: string }[] = [
  { value: 'reading',      label: 'Currently Reading' },
  { value: 'plan_to_read', label: 'Plan to Read'      },
  { value: 'completed',    label: 'Completed'          },
  { value: 'on_hold',      label: 'On Hold'            },
  { value: 'dropped',      label: 'Dropped'            },
]

const MAL_STATUS: Record<string, MangaStatus> = {
  'Reading': 'reading', 'Completed': 'completed',
  'On-Hold': 'on_hold', 'Dropped': 'dropped', 'Plan to Read': 'plan_to_read',
}

type GenreState = 'neutral' | 'include' | 'exclude'

export default function SearchPage() {
  // ── Search state ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JikanSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [grResults, setGrResults] = useState<GoodreadsBook[]>([])
  const [grLoading, setGrLoading] = useState(false)
  const [addingGr, setAddingGr] = useState<string | null>(null)

  // ── Filter state ──────────────────────────────────────────────────────────
  const [showFilters, setShowFilters] = useState(false)
  const [genreStates, setGenreStates] = useState<Record<number, GenreState>>({})
  const [mangaStatus, setMangaStatus] = useState<SearchFilters['status'] | ''>('')
  const [orderBy, setOrderBy] = useState<SearchFilters['orderBy']>('score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [minChapters, setMinChapters] = useState('')
  const [maxChapters, setMaxChapters] = useState('')
  const [minScore, setMinScore] = useState('')

  // ── Recent searches ───────────────────────────────────────────────────────
  const RECENT_KEY = 'yomu_recent_searches'
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    if (typeof window === 'undefined') return []
    try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') } catch { return [] }
  })
  const [inputFocused, setInputFocused] = useState(false)
  const saveRecentSearch = (q: string) => {
    if (!q.trim()) return
    setRecentSearches(prev => {
      const next = [q, ...prev.filter(s => s !== q)].slice(0, 6)
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  // ── Autocomplete suggestions ──────────────────────────────────────────────
  const [suggestions, setSuggestions] = useState<JikanSearchResult[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [suggestLoading, setSuggestLoading] = useState(false)
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchBarRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (suggestTimer.current) clearTimeout(suggestTimer.current)
    if (!query.trim() || query.length < 2) { setSuggestions([]); setShowSuggestions(false); return }
    suggestTimer.current = setTimeout(async () => {
      setSuggestLoading(true)
      const res = await searchMangaWithFilters({ query: query.trim(), orderBy: 'score', sort: 'desc' })
      setSuggestions(res.slice(0, 8))
      setShowSuggestions(true)
      setSuggestLoading(false)
    }, 350)
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current) }
  }, [query])

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchBarRef.current && !searchBarRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selectSuggestion = (s: JikanSearchResult) => {
    setQuery(s.title)
    setShowSuggestions(false)
    setSuggestions([])
    saveRecentSearch(s.title)
    setResults([s])
  }

  // ── Author search ─────────────────────────────────────────────────────────
  const [authorQuery, setAuthorQuery] = useState('')
  const [authorSuggestions, setAuthorSuggestions] = useState<{ id: number; name: string }[]>([])
  const [selectedAuthor, setSelectedAuthor] = useState<{ id: number; name: string } | null>(null)
  const [authorLoading, setAuthorLoading] = useState(false)
  const authorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── MAL import ────────────────────────────────────────────────────────────
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ added: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  // Computed genre lists
  const includeGenreIds = Object.entries(genreStates).filter(([, s]) => s === 'include').map(([id]) => Number(id))
  const excludeGenreIds = Object.entries(genreStates).filter(([, s]) => s === 'exclude').map(([id]) => Number(id))
  const hasFilters = includeGenreIds.length > 0 || excludeGenreIds.length > 0 ||
    mangaStatus || minChapters || maxChapters || minScore || selectedAuthor

  const cycleGenre = (id: number) => {
    setGenreStates(prev => {
      const cur = prev[id] ?? 'neutral'
      const next: GenreState = cur === 'neutral' ? 'include' : cur === 'include' ? 'exclude' : 'neutral'
      const updated = { ...prev, [id]: next }
      if (next === 'neutral') delete updated[id]
      // Persist excluded genres so Trending section on My List page respects them
      const excluded = Object.entries(updated).filter(([, s]) => s === 'exclude').map(([id]) => Number(id))
      localStorage.setItem('excluded_genres', JSON.stringify(excluded))
      return updated
    })
  }

  const removeGenre = (id: number) =>
    setGenreStates(prev => { const n = { ...prev }; delete n[id]; return n })

  // Author lookup with debounce
  useEffect(() => {
    if (!authorQuery.trim() || authorQuery.length < 2) { setAuthorSuggestions([]); return }
    if (authorTimer.current) clearTimeout(authorTimer.current)
    authorTimer.current = setTimeout(async () => {
      setAuthorLoading(true)
      const people = await searchPeople(authorQuery)
      setAuthorSuggestions(people)
      setAuthorLoading(false)
    }, 500)
  }, [authorQuery])

  const doSearch = useCallback(async () => {
    if (!query.trim() && !hasFilters) return
    if (query.trim()) saveRecentSearch(query.trim())
    setLoading(true)
    setResults([])
    setGrResults([])

    // Detect MAL URL
    const malMatch = query.match(/myanimelist\.net\/manga\/(\d+)/i)
    if (malMatch) {
      const manga = await getMangaById(parseInt(malMatch[1], 10))
      setResults(manga ? [manga] : [])
      setLoading(false)
      return
    }

    const filters: SearchFilters = {
      query: query.trim() || undefined,
      includeGenres: includeGenreIds.length ? includeGenreIds : undefined,
      excludeGenres: excludeGenreIds.length ? excludeGenreIds : undefined,
      status: mangaStatus || undefined,
      orderBy,
      sort: sortDir,
      minScore: minScore ? parseFloat(minScore) : undefined,
      minChapters: minChapters ? parseInt(minChapters) : undefined,
      maxChapters: maxChapters ? parseInt(maxChapters) : undefined,
      authorId: selectedAuthor?.id,
    }

    // Run Jikan + Goodreads in parallel
    const [jikanRes] = await Promise.all([
      searchMangaWithFilters(filters),
      // Kick off Goodreads search in background if there's a text query
      query.trim() ? (async () => {
        setGrLoading(true)
        try {
          const r = await fetch(`/api/goodreads?q=${encodeURIComponent(query.trim())}`)
          if (r.ok) {
            const j = await r.json()
            // Filter out GR results whose MAL ID already appears in Jikan results
            setGrResults(j.books ?? [])
          }
        } catch { /* non-critical */ }
        finally { setGrLoading(false) }
      })() : Promise.resolve(),
    ])

    setResults(jikanRes)
    setLoading(false)
  }, [query, includeGenreIds, excludeGenreIds, mangaStatus, orderBy, sortDir, minScore, minChapters, maxChapters, selectedAuthor, hasFilters])

  const addManga = async (manga: JikanSearchResult, status: MangaStatus) => {
    setAdding(manga.mal_id)
    try {
      const adaptations = manga.mal_id ? await getAnimeAdaptations(manga.mal_id) : []
      const anim = adaptations[0]
      const { error } = await supabase.from('manga_list').insert({
        mal_id: manga.mal_id, title: manga.title, current_chapter: 0, status,
        cover_url: manga.cover_url, total_chapters: manga.total_chapters,
        authors: manga.authors ?? [], genres: manga.genres ?? [],
        has_anime: !!anim, anime_mal_id: anim?.mal_id ?? null,
        anime_title: anim?.title ?? null, total_episodes: anim?.episodes ?? null,
      })
      if (error?.code === '23505') showToast(`"${manga.title}" is already in your list`)
      else if (error) showToast('Failed to add manga')
      else {
        setAdded(prev => new Set([...prev, manga.mal_id ?? -1]))
        showToast(`Added "${manga.title}"${anim ? ' — 🎬 anime found!' : ''}`)
      }
    } finally { setAdding(null) }
  }

  /** Add a Goodreads book — looks up Jikan first to get full MAL data */
  const addFromGoodreads = async (book: GoodreadsBook, status: MangaStatus) => {
    setAddingGr(book.goodreadsId)
    try {
      let malId = book.malId
      let title = book.title
      let cover = book.coverUrl
      let totalCh: number | null = null
      let authors: { id: number; name: string }[] = book.author ? [{ id: 0, name: book.author }] : []

      // If we have a MAL ID already (from enrichment), fetch full data
      if (malId) {
        const full = await getMangaById(malId)
        if (full) {
          title = full.title; cover = full.cover_url ?? cover
          totalCh = full.total_chapters; authors = full.authors
        }
      } else {
        // Try a Jikan title search
        const clean = title.replace(/,?\s+(vol|volume|tome)\.?\s*\d+.*/i, '').trim()
        const res = await fetch(`/api/goodreads?q=${encodeURIComponent(clean)}`) // reuse enrichment
        // Fall back: search Jikan directly
        const jRes = await fetch(`https://api.jikan.moe/v4/manga?q=${encodeURIComponent(clean)}&limit=1`)
        if (jRes.ok) {
          const jJson = await jRes.json()
          const hit = jJson.data?.[0]
          if (hit) { malId = hit.mal_id; title = hit.title; cover = hit.images?.jpg?.image_url ?? cover; totalCh = hit.chapters }
        }
      }

      const adaptations = malId ? await getAnimeAdaptations(malId) : []
      const anim = adaptations[0]

      const { error } = await supabase.from('manga_list').insert({
        mal_id: malId ?? null, title, current_chapter: 0, status,
        cover_url: cover, total_chapters: totalCh,
        authors, genres: [],
        has_anime: !!anim, anime_mal_id: anim?.mal_id ?? null,
        anime_title: anim?.title ?? null, total_episodes: anim?.episodes ?? null,
      })
      if (error?.code === '23505') showToast(`"${title}" is already in your list`)
      else if (error) showToast('Failed to add manga')
      else {
        setAdded(prev => new Set([...prev, malId ?? -Date.now()]))
        showToast(`Added "${title}" from Goodreads`)
        // Mark as added in grResults
        setGrResults(prev => prev.map(b => b.goodreadsId === book.goodreadsId ? { ...b, malId: malId ?? b.malId } : b))
      }
    } finally { setAddingGr(null) }
  }

  const importMALFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true); setImportResults(null)
    try {
      const text = await file.text()
      const doc = new DOMParser().parseFromString(text, 'text/xml')
      const entries = Array.from(doc.querySelectorAll('manga'))
      let addedCount = 0, skippedCount = 0
      for (const entry of entries) {
        const title = entry.querySelector('manga_title')?.textContent?.trim()
        const malId = parseInt(entry.querySelector('manga_mangadb_id')?.textContent ?? '0', 10)
        const rawStatus = entry.querySelector('my_status')?.textContent?.trim() ?? ''
        const chapters = parseInt(entry.querySelector('my_read_chapters')?.textContent ?? '0', 10)
        const status: MangaStatus = MAL_STATUS[rawStatus] ?? 'plan_to_read'
        if (!title || !malId) { skippedCount++; continue }
        const { error } = await supabase.from('manga_list').insert({ mal_id: malId, title, current_chapter: chapters, status })
        if (error?.code === '23505') skippedCount++
        else if (error) skippedCount++
        else addedCount++
      }
      setImportResults({ added: addedCount, skipped: skippedCount })
      showToast(`Imported ${addedCount} manga${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`)
    } catch { showToast('Failed to parse MAL export file') }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }

  const clearFilters = () => {
    setGenreStates({}); setMangaStatus(''); setOrderBy('score'); setSortDir('desc')
    setMinChapters(''); setMaxChapters(''); setMinScore('')
    setSelectedAuthor(null); setAuthorQuery(''); setAuthorSuggestions([])
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Search & Discover</h1>

        {/* Search bar with live autocomplete */}
        <div className="flex gap-2 mb-3" ref={searchBarRef}>
          <div className="relative flex-1">
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }}
              onKeyDown={e => {
                if (e.key === 'Enter') { setShowSuggestions(false); setInputFocused(false); doSearch() }
                if (e.key === 'Escape') { setShowSuggestions(false); setInputFocused(false) }
              }}
              onFocus={() => { setInputFocused(true); if (suggestions.length > 0) setShowSuggestions(true) }}
              onBlur={() => setTimeout(() => setInputFocused(false), 150)}
              placeholder="Search by title, or paste a MAL URL…"
              autoFocus
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
            {/* Recent searches — shown when focused and no query */}
            {inputFocused && !query && recentSearches.length > 0 && (
              <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl">
                <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
                  <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Recent</span>
                  <button
                    onMouseDown={e => { e.preventDefault(); setRecentSearches([]); try { localStorage.removeItem(RECENT_KEY) } catch {} }}
                    className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
                  >Clear</button>
                </div>
                {recentSearches.map(s => (
                  <button key={s}
                    onMouseDown={e => { e.preventDefault(); setQuery(s); setInputFocused(false); setTimeout(doSearch, 0) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left text-sm text-zinc-300 border-b border-zinc-800 last:border-0"
                  >
                    <span className="text-zinc-600 text-xs">🕐</span> {s}
                  </button>
                ))}
              </div>
            )}
            {/* Suggestions dropdown */}
            {showSuggestions && (query.length >= 2) && (
              <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl">
                {suggestLoading && (
                  <div className="px-4 py-3 text-xs text-zinc-500">Searching…</div>
                )}
                {!suggestLoading && suggestions.length === 0 && (
                  <div className="px-4 py-3 text-xs text-zinc-500">No matches — try a different spelling</div>
                )}
                {!suggestLoading && suggestions.map(s => (
                  <button
                    key={s.mal_id}
                    onMouseDown={e => { e.preventDefault(); selectSuggestion(s) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left border-b border-zinc-800 last:border-0"
                  >
                    {s.cover_url && (
                      <img src={s.cover_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-zinc-200 truncate">{s.title}</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {s.authors.length > 0 ? `by ${s.authors[0].name}` : ''}
                        {s.score ? ` · ★ ${s.score}` : ''}
                        {s.total_chapters ? ` · ${s.total_chapters} ch` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] text-zinc-600 shrink-0">Select →</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button onClick={() => { setShowSuggestions(false); doSearch() }} disabled={loading || (!query.trim() && !hasFilters)}
            className="px-6 py-3 bg-white text-black rounded-xl text-sm font-medium hover:bg-zinc-200 disabled:opacity-40 transition-colors">
            {loading ? '…' : 'Search'}
          </button>
        </div>

        {/* Filter toggle + active count */}
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setShowFilters(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-colors ${
              showFilters || hasFilters
                ? 'bg-violet-600/20 border-violet-500/50 text-violet-300'
                : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white'
            }`}>
            <span>⚙️</span>
            <span>Filters</span>
            {hasFilters && (
              <span className="bg-violet-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                {includeGenreIds.length + excludeGenreIds.length + (mangaStatus ? 1 : 0) + (selectedAuthor ? 1 : 0)}
              </span>
            )}
          </button>
          {hasFilters && (
            <button onClick={clearFilters} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
              Clear all
            </button>
          )}
          <div className="ml-auto flex items-center gap-3 text-xs text-zinc-600">
            <label className={`flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl cursor-pointer hover:border-zinc-600 transition-colors ${importing ? 'opacity-40 pointer-events-none' : ''}`}>
              <span>📥</span>
              {importing ? 'Importing…' : 'MAL XML import'}
              <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={importMALFile} />
            </label>
            {importResults && <span className="text-emerald-400">{importResults.added} added</span>}
          </div>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-6 space-y-5">

            {/* Genre chips — 3-state toggle */}
            <div>
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
                Genres <span className="normal-case font-normal text-zinc-600">· click = include · click again = exclude · click again = off</span>
              </p>
              <div className="flex flex-wrap gap-1.5">
                {MANGA_GENRES.map(g => {
                  const state = genreStates[g.id] ?? 'neutral'
                  return (
                    <button key={g.id} onClick={() => cycleGenre(g.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        state === 'include' ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' :
                        state === 'exclude' ? 'bg-red-500/20 border-red-500/50 text-red-400 line-through' :
                        'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
                      }`}>
                      {state === 'include' && '✓ '}
                      {state === 'exclude' && '✗ '}
                      {g.name}
                    </button>
                  )
                })}
              </div>
              {/* Active selections summary */}
              {(includeGenreIds.length > 0 || excludeGenreIds.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {includeGenreIds.map(id => {
                    const g = MANGA_GENRES.find(g => g.id === id)!
                    return (
                      <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-emerald-900/30 border border-emerald-700/40 rounded-full text-xs text-emerald-400">
                        ✓ {g.name}
                        <button onClick={() => removeGenre(id)} className="hover:text-white">×</button>
                      </span>
                    )
                  })}
                  {excludeGenreIds.map(id => {
                    const g = MANGA_GENRES.find(g => g.id === id)!
                    return (
                      <span key={id} className="flex items-center gap-1 px-2 py-0.5 bg-red-900/30 border border-red-700/40 rounded-full text-xs text-red-400">
                        ✗ {g.name}
                        <button onClick={() => removeGenre(id)} className="hover:text-white">×</button>
                      </span>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Row 2: Status + Sort + Score */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5">Status</label>
                <select value={mangaStatus} onChange={e => setMangaStatus(e.target.value as SearchFilters['status'] | '')}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none cursor-pointer">
                  <option value="">Any</option>
                  <option value="publishing">Ongoing</option>
                  <option value="complete">Finished</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="hiatus">On Hiatus</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5">Sort by</label>
                <select value={orderBy} onChange={e => setOrderBy(e.target.value as SearchFilters['orderBy'])}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none cursor-pointer">
                  <option value="score">Rating</option>
                  <option value="members">Most Read</option>
                  <option value="popularity">Popularity</option>
                  <option value="favorites">Favourites</option>
                  <option value="chapters">Chapter Count</option>
                  <option value="title">Title A–Z</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5">Order</label>
                <select value={sortDir} onChange={e => setSortDir(e.target.value as 'asc' | 'desc')}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none cursor-pointer">
                  <option value="desc">High → Low</option>
                  <option value="asc">Low → High</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5">Min score</label>
                <input type="number" min={1} max={10} step={0.5} value={minScore}
                  onChange={e => setMinScore(e.target.value)} placeholder="e.g. 7.5"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none placeholder:text-zinc-600"
                />
              </div>
            </div>

            {/* Row 3: Chapter range + Author */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5">Min chapters</label>
                <input type="number" min={0} value={minChapters}
                  onChange={e => setMinChapters(e.target.value)} placeholder="e.g. 50"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none placeholder:text-zinc-600"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 block mb-1.5">Max chapters</label>
                <input type="number" min={0} value={maxChapters}
                  onChange={e => setMaxChapters(e.target.value)} placeholder="e.g. 200"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none placeholder:text-zinc-600"
                />
              </div>
              <div className="col-span-2 md:col-span-1 relative">
                <label className="text-xs text-zinc-500 block mb-1.5">Author / artist</label>
                {selectedAuthor ? (
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-zinc-800 border border-violet-500/40 rounded-xl">
                    <span className="text-sm text-violet-300 flex-1 truncate">{selectedAuthor.name}</span>
                    <button onClick={() => { setSelectedAuthor(null); setAuthorQuery('') }}
                      className="text-zinc-500 hover:text-white">×</button>
                  </div>
                ) : (
                  <>
                    <input value={authorQuery} onChange={e => setAuthorQuery(e.target.value)}
                      placeholder="Search author name…"
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-300 outline-none placeholder:text-zinc-600"
                    />
                    {authorLoading && <p className="text-xs text-zinc-600 mt-1">Searching…</p>}
                    {authorSuggestions.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden z-20 shadow-xl">
                        {authorSuggestions.map(p => (
                          <button key={p.id} onClick={() => { setSelectedAuthor(p); setAuthorQuery(''); setAuthorSuggestions([]) }}
                            className="w-full px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-700 text-left transition-colors">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <button onClick={doSearch} disabled={loading}
              className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium disabled:opacity-40 transition-colors">
              {loading ? 'Searching…' : 'Apply filters & search'}
            </button>
          </div>
        )}

        {/* Results */}
        {loading && <div className="text-zinc-500 text-sm py-4">Searching…</div>}
        {!loading && results.length === 0 && (query || hasFilters) && (
          <div className="text-zinc-500 text-sm py-4">No results found — try adjusting the filters.</div>
        )}

        {/* Discovery — shown when no search is active */}
        {!loading && !query.trim() && !hasFilters && results.length === 0 && (
          <div className="mt-2">
            <p className="text-xs text-zinc-600 uppercase tracking-widest font-semibold mb-4">Discover</p>
            <DiscoverPanel defaultTab="similar" />
          </div>
        )}

        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {results.map(manga => (
            <div key={manga.mal_id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex gap-4 p-4">
                <div className="shrink-0 w-16 rounded-lg overflow-hidden bg-zinc-800" style={{ height: '88px' }}>
                  {manga.cover_url ? (
                    <Image src={manga.cover_url} alt={manga.title} width={64} height={88}
                      className="w-full h-full object-cover" unoptimized />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">?</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-snug">{manga.title}</div>
                  {manga.authors.length > 0 && (
                    <div className="text-xs text-zinc-500 mt-0.5">by {manga.authors.map(a => a.name).join(', ')}</div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {manga.genres.slice(0, 3).map(g => (
                      <span key={g} className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">{g}</span>
                    ))}
                    {manga.score && <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-yellow-400 rounded">★ {manga.score}</span>}
                    {manga.total_chapters && <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">{manga.total_chapters} ch</span>}
                    {manga.status && <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">{manga.status}</span>}
                  </div>
                  {manga.synopsis && (
                    <button onClick={() => setExpandedId(expandedId === manga.mal_id ? null : manga.mal_id)}
                      className="mt-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
                      {expandedId === manga.mal_id ? 'Hide ↑' : 'Synopsis ↓'}
                    </button>
                  )}
                </div>
                <div className="shrink-0">
                  {manga.mal_id !== null && added.has(manga.mal_id) ? (
                    <span className="text-emerald-400 text-sm font-medium">✓ Added</span>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {STATUS_OPTIONS.map(opt => (
                        <button key={opt.value} onClick={() => addManga(manga, opt.value)}
                          disabled={adding === manga.mal_id}
                          className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 hover:text-white transition-colors disabled:opacity-40 text-left whitespace-nowrap">
                          {adding === manga.mal_id ? '…' : opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {expandedId === manga.mal_id && manga.synopsis && (
                <div className="border-t border-zinc-800 px-4 py-3">
                  <p className="text-xs text-zinc-400 leading-relaxed">{manga.synopsis}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Goodreads results */}
        {(grLoading || grResults.length > 0) && (
          <div className="mt-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-lg">📗</span>
                <div>
                  <p className="text-sm font-bold">Also on Goodreads</p>
                  <p className="text-[10px] text-zinc-500">via goodreads.com · {grResults.length} results</p>
                </div>
              </div>
            </div>

            {grLoading && (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-20 bg-zinc-900 rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {!grLoading && (
              <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
                {grResults
                  // De-duplicate against already-shown Jikan results
                  .filter(b => !results.some(r => r.mal_id === b.malId))
                  .map(book => {
                    const isAdded = book.malId ? added.has(book.malId) : false
                    const isAdding = addingGr === book.goodreadsId
                    return (
                      <div key={book.goodreadsId} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                        <div className="flex gap-4 p-4">
                          <div className="shrink-0 w-14 h-20 rounded-lg overflow-hidden bg-zinc-800">
                            {book.coverUrl ? (
                              // Goodreads covers need a referrer; use img (not next/image) for external CDN
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={book.coverUrl} alt={book.title}
                                className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">?</div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm leading-snug line-clamp-2">{book.title}</div>
                            {book.author && <div className="text-xs text-zinc-500 mt-0.5">by {book.author}</div>}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {book.rating && (
                                <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-yellow-400 rounded">★ {book.rating}</span>
                              )}
                              {book.ratingsCount && (
                                <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">{book.ratingsCount} ratings</span>
                              )}
                              <span className="text-xs px-1.5 py-0.5 bg-emerald-900/30 border border-emerald-800/40 text-emerald-500 rounded">Goodreads</span>
                            </div>
                          </div>
                          <div className="shrink-0 flex flex-col gap-1">
                            {isAdded ? (
                              <span className="text-emerald-400 text-sm font-medium">✓ Added</span>
                            ) : (
                              <>
                                <button onClick={() => addFromGoodreads(book, 'plan_to_read')} disabled={isAdding}
                                  className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap">
                                  {isAdding ? '…' : '+ Plan to Read'}
                                </button>
                                <button onClick={() => addFromGoodreads(book, 'reading')} disabled={isAdding}
                                  className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 hover:text-white transition-colors disabled:opacity-40 whitespace-nowrap">
                                  {isAdding ? '…' : '+ Reading'}
                                </button>
                                <a href={book.goodreadsUrl} target="_blank" rel="noopener noreferrer"
                                  className="px-3 py-1 text-xs bg-zinc-900 border border-zinc-700 hover:border-zinc-500 rounded-lg text-zinc-500 hover:text-zinc-300 transition-colors text-center">
                                  Goodreads ↗
                                </a>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </div>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </main>
  )
}
