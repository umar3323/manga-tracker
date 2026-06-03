'use client'

import { useState, useCallback, useRef } from 'react'
import Image from 'next/image'
import { supabase, type MangaStatus } from '@/lib/supabase'
import { searchManga, getAnimeAdaptations, getMangaById, type JikanSearchResult } from '@/lib/jikan'

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

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JikanSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [adding, setAdding] = useState<number | null>(null)
  const [added, setAdded] = useState<Set<number>>(new Set())
  const [toast, setToast] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResults, setImportResults] = useState<{ added: number; skipped: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 4000)
  }

  // Detect if query is a MAL URL and resolve it directly
  const doSearch = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setResults([])

    // Detect MAL URL: myanimelist.net/manga/11977/...
    const malMatch = query.match(/myanimelist\.net\/manga\/(\d+)/i)
    if (malMatch) {
      const manga = await getMangaById(parseInt(malMatch[1], 10))
      setResults(manga ? [manga] : [])
      setLoading(false)
      return
    }

    const res = await searchManga(query.trim())
    setResults(res)
    setLoading(false)
  }, [query])

  const importMALFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setImportResults(null)

    try {
      const text = await file.text()
      const parser = new DOMParser()
      const doc = parser.parseFromString(text, 'text/xml')
      const entries = Array.from(doc.querySelectorAll('manga'))

      let addedCount = 0; let skippedCount = 0

      for (const entry of entries) {
        const title = entry.querySelector('manga_title')?.textContent?.trim()
        const malId = parseInt(entry.querySelector('manga_mangadb_id')?.textContent ?? '0', 10)
        const rawStatus = entry.querySelector('my_status')?.textContent?.trim() ?? ''
        const chapters = parseInt(entry.querySelector('my_read_chapters')?.textContent ?? '0', 10)
        const status: MangaStatus = MAL_STATUS[rawStatus] ?? 'plan_to_read'

        if (!title || !malId) { skippedCount++; continue }

        const { error } = await supabase.from('manga_list').insert({
          mal_id: malId, title, current_chapter: chapters, status,
        })
        if (error?.code === '23505') skippedCount++  // already exists
        else if (error) skippedCount++
        else addedCount++
      }

      setImportResults({ added: addedCount, skipped: skippedCount })
      showToast(`Imported ${addedCount} manga${skippedCount > 0 ? `, ${skippedCount} skipped (already in list)` : ''}`)
    } catch {
      showToast('Failed to parse MAL export file')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const addManga = async (manga: JikanSearchResult, status: MangaStatus) => {
    setAdding(manga.mal_id)
    try {
      // Check for anime adaptations
      let has_anime = false
      let anime_mal_id: number | null = null
      let anime_title: string | null = null
      let total_episodes: number | null = null

      const adaptations = await getAnimeAdaptations(manga.mal_id)
      if (adaptations.length > 0) {
        has_anime = true
        anime_mal_id = adaptations[0].mal_id
        anime_title = adaptations[0].title
        total_episodes = adaptations[0].episodes ?? null
      }

      const { error } = await supabase.from('manga_list').insert({
        mal_id: manga.mal_id,
        title: manga.title,
        current_chapter: 0,
        status,
        cover_url: manga.cover_url,
        total_chapters: manga.total_chapters,
        authors: manga.authors ?? [],
        has_anime,
        anime_mal_id,
        anime_title,
        total_episodes,
      })

      if (error) {
        if (error.code === '23505') {
          showToast(`"${manga.title}" is already in your list`)
        } else {
          showToast('Failed to add manga')
        }
      } else {
        setAdded(prev => new Set([...prev, manga.mal_id]))
        showToast(`Added "${manga.title}"${has_anime ? ' — 🎬 anime found!' : ''}`)
      }
    } finally {
      setAdding(null)
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Search Manga</h1>


        {/* Search bar */}
        <div className="flex gap-2 mb-3">
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
            placeholder="Title or paste a MAL URL…" autoFocus
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <button onClick={doSearch} disabled={loading || !query.trim()}
            className="px-6 py-3 bg-white text-black rounded-xl text-sm font-medium hover:bg-zinc-200 disabled:opacity-40 transition-colors">
            {loading ? '…' : 'Search'}
          </button>
        </div>

        {/* MAL import */}
        <div className="flex items-center gap-3 mb-8">
          <span className="text-xs text-zinc-600">or</span>
          <label className={`flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 cursor-pointer transition-colors ${importing ? 'opacity-40 pointer-events-none' : ''}`}>
            <span>📥</span>
            {importing ? 'Importing…' : 'Import MAL export (XML)'}
            <input ref={fileRef} type="file" accept=".xml" className="hidden" onChange={importMALFile} />
          </label>
          {importResults && (
            <span className="text-xs text-emerald-400">{importResults.added} added · {importResults.skipped} skipped</span>
          )}
          <a href="https://myanimelist.net/panel.php?go=export" target="_blank" rel="noopener noreferrer"
            className="text-xs text-zinc-700 hover:text-zinc-500 ml-auto transition-colors">
            Get MAL export ↗
          </a>
        </div>

        {/* Results */}
        {loading && (
          <div className="text-zinc-500 text-sm">Searching…</div>
        )}

        {!loading && results.length === 0 && query && (
          <div className="text-zinc-500 text-sm">No results found.</div>
        )}

        <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
          {results.map(manga => (
            <div key={manga.mal_id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex gap-4 p-4">
                {/* Cover */}
                <div className="shrink-0 w-16 h-22 rounded-lg overflow-hidden bg-zinc-800">
                  {manga.cover_url ? (
                    <Image
                      src={manga.cover_url}
                      alt={manga.title}
                      width={64}
                      height={88}
                      className="w-full h-full object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs">?</div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm leading-snug">{manga.title}</div>

                  {manga.authors.length > 0 && (
                    <div className="text-xs text-zinc-500 mt-1">
                      by {manga.authors.map(a => a.name).join(', ')}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {manga.genres.slice(0, 4).map(g => (
                      <span key={g} className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-400 rounded">
                        {g}
                      </span>
                    ))}
                    {manga.score && (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-yellow-400 rounded">
                        ★ {manga.score}
                      </span>
                    )}
                    {manga.total_chapters && (
                      <span className="text-xs px-1.5 py-0.5 bg-zinc-800 text-zinc-500 rounded">
                        {manga.total_chapters} ch
                      </span>
                    )}
                  </div>

                  {/* Synopsis toggle */}
                  {manga.synopsis && (
                    <button
                      onClick={() => setExpandedId(expandedId === manga.mal_id ? null : manga.mal_id)}
                      className="mt-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-left"
                    >
                      {expandedId === manga.mal_id ? 'Hide synopsis ↑' : 'Show synopsis ↓'}
                    </button>
                  )}
                </div>

                {/* Add button */}
                <div className="shrink-0">
                  {added.has(manga.mal_id) ? (
                    <span className="text-emerald-400 text-sm font-medium">✓ Added</span>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {STATUS_OPTIONS.map(opt => (
                        <button
                          key={opt.value}
                          onClick={() => addManga(manga, opt.value)}
                          disabled={adding === manga.mal_id}
                          className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 rounded-lg text-zinc-300 hover:text-white transition-colors disabled:opacity-40 text-left whitespace-nowrap"
                        >
                          {adding === manga.mal_id ? '…' : opt.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Expanded synopsis */}
              {expandedId === manga.mal_id && manga.synopsis && (
                <div className="border-t border-zinc-800 px-4 py-3">
                  <p className="text-xs text-zinc-400 leading-relaxed">{manga.synopsis}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </main>
  )
}
