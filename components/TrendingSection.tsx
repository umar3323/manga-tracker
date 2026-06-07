'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { getTopManga, getTrendingThisYear, searchMangaWithFilters, MANGA_GENRES, type JikanSearchResult } from '@/lib/jikan'
import type { Recommendation } from '@/app/api/recommend/route'

type Tab = 'now' | 'year' | 'alltime'

const TABS: { id: Tab; label: string }[] = [
  { id: 'now',     label: 'Trending Now' },
  { id: 'year',    label: 'This Year'    },
  { id: 'alltime', label: 'All Time'     },
]

// Most commonly searched genres — keep the pill row concise
const FILTER_GENRES = MANGA_GENRES.filter(g =>
  [1, 2, 4, 8, 10, 14, 7, 22, 24, 36, 37, 27, 42, 40, 49].includes(g.id)
)

interface CacheKey { tab: Tab; genreId: number | null }

interface Props {
  onSelect: (rec: Recommendation) => void
  excludeGenreIds?: number[]
}

export default function TrendingSection({ onSelect, excludeGenreIds = [] }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('now')
  const [selectedGenre, setSelectedGenre] = useState<number | null>(null)
  const [data, setData] = useState<Map<string, JikanSearchResult[]>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const genreScrollRef = useRef<HTMLDivElement>(null)
  const inFlight = useRef<Set<string>>(new Set())

  const cacheKey = (tab: Tab, genreId: number | null) => `${tab}:${genreId ?? 'all'}`

  const fetchData = async (tab: Tab, genreId: number | null) => {
    const key = cacheKey(tab, genreId)
    if (data.has(key) || inFlight.current.has(key)) return
    inFlight.current.add(key)
    setIsLoading(true)

    let results: JikanSearchResult[] = []
    try {
      if (genreId !== null) {
        // Genre-filtered: use searchMangaWithFilters with include + order by score
        const filter = tab === 'alltime' ? { orderBy: 'popularity' as const } :
                       tab === 'now'     ? { status: 'publishing' as const, orderBy: 'members' as const } :
                                           { orderBy: 'members' as const }
        results = await searchMangaWithFilters({
          includeGenres: [genreId],
          excludeGenres: excludeGenreIds,
          ...filter,
          sort: 'desc',
        })
      } else {
        if (tab === 'now')     results = await getTopManga('publishing',   12, excludeGenreIds)
        if (tab === 'year')    results = await getTrendingThisYear(         12, excludeGenreIds)
        if (tab === 'alltime') results = await getTopManga('bypopularity', 12, excludeGenreIds)
      }
    } catch { /* network error — leave empty */ }

    setData(prev => new Map(prev).set(key, results))
    setIsLoading(false)
    inFlight.current.delete(key)
  }

  // Clear cache when excluded genres change
  useEffect(() => {
    setData(new Map())
    inFlight.current.clear()
    fetchData(activeTab, selectedGenre)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(excludeGenreIds)])

  // Initial load
  useEffect(() => { fetchData('now', null) }, [])

  const handleTab = (tab: Tab) => {
    setActiveTab(tab)
    fetchData(tab, selectedGenre)
    scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }

  const handleGenre = (genreId: number | null) => {
    setSelectedGenre(genreId)
    fetchData(activeTab, genreId)
    scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }

  const handleSelect = (manga: JikanSearchResult) => {
    onSelect({ title: manga.title, mal_id: manga.mal_id, confidence: 0, reason: '', isAnime: false })
  }

  const items = data.get(cacheKey(activeTab, selectedGenre)) ?? []

  return (
    <div style={{ marginBottom: 24, background: 'var(--ink-700)', border: 'var(--border-hair)', borderRadius: 'var(--r-xl)', overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: 'var(--border-hair)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--vermillion)', fontSize: 16 }}>▲</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg-1)' }}>Trending</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Time tab pills */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--ink-600)', padding: 3, borderRadius: 'var(--r-md)' }}>
            {TABS.map(t => (
              <button key={t.id} onClick={() => handleTab(t.id)} style={{
                padding: '5px 10px', borderRadius: 'var(--r-sm)',
                fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', whiteSpace: 'nowrap', transition: 'all var(--dur-fast) var(--ease-out)',
                background: activeTab === t.id ? 'var(--vermillion)' : 'transparent',
                color: activeTab === t.id ? '#fff' : 'var(--fg-3)',
              }}>
                {t.label}
              </button>
            ))}
          </div>

          <button onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Expand' : 'Collapse'} style={{
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)',
            fontSize: 16, lineHeight: 1, padding: '4px 2px',
            transition: 'color var(--dur-fast)',
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-2)'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--fg-4)'}>
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {/* Genre filter pills */}
          <div ref={genreScrollRef} style={{
            display: 'flex', gap: 6, overflowX: 'auto', padding: '10px 16px 10px',
            scrollbarWidth: 'none', borderBottom: 'var(--border-hair)',
          }}>
            {/* "All" pill */}
            <button onClick={() => handleGenre(null)} style={{
              flexShrink: 0, padding: '5px 13px', borderRadius: 'var(--r-pill)',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'var(--font-sans)', border: '1px solid',
              transition: 'all var(--dur-fast) var(--ease-out)',
              background: selectedGenre === null ? 'var(--vermillion)' : 'var(--ink-600)',
              borderColor: selectedGenre === null ? 'var(--vermillion)' : 'var(--ink-500)',
              color: selectedGenre === null ? '#fff' : 'var(--fg-2)',
            }}>All</button>

            {FILTER_GENRES.map(g => {
              const active = selectedGenre === g.id
              return (
                <button key={g.id} onClick={() => handleGenre(g.id)} style={{
                  flexShrink: 0, padding: '5px 13px', borderRadius: 'var(--r-pill)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  fontFamily: 'var(--font-sans)', border: '1px solid',
                  transition: 'all var(--dur-fast) var(--ease-out)',
                  background: active ? 'var(--vermillion-tint)' : 'var(--ink-600)',
                  borderColor: active ? 'var(--vermillion)' : 'var(--ink-500)',
                  color: active ? 'var(--vermillion-bright)' : 'var(--fg-2)',
                }}>
                  {g.name}
                </button>
              )
            })}
          </div>

          {/* Card scroll */}
          <div ref={scrollRef} style={{
            display: 'flex', gap: 12, overflowX: 'auto', padding: '14px 16px',
            scrollbarWidth: 'none',
          }}>
            {isLoading && Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{ flexShrink: 0, width: 88 }}>
                <div style={{ width: 88, height: 124, background: 'var(--ink-600)', borderRadius: 'var(--r-md)', animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 10, background: 'var(--ink-600)', borderRadius: 4, marginTop: 8, animation: 'pulse 1.5s ease-in-out infinite' }} />
                <div style={{ height: 10, background: 'var(--ink-600)', borderRadius: 4, marginTop: 4, width: '66%', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            ))}

            {!isLoading && items.map((manga, i) => (
              <button key={manga.mal_id} onClick={() => handleSelect(manga)} style={{
                flexShrink: 0, width: 88, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}>
                <div style={{ position: 'relative', width: 88, height: 124, borderRadius: 'var(--r-md)', overflow: 'hidden', background: 'var(--ink-600)' }}>
                  {manga.cover_url ? (
                    <Image src={manga.cover_url} alt={manga.title} fill
                      style={{ objectFit: 'cover', transition: 'transform var(--dur-med) var(--ease-out)' }}
                      className="group-hover:scale-105"
                      unoptimized />
                  ) : (
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--fg-4)', fontSize: 11, padding: 4, textAlign: 'center' }}>
                      {manga.title}
                    </div>
                  )}
                  {/* Rank badge */}
                  <div style={{
                    position: 'absolute', top: 6, left: 6, width: 22, height: 22,
                    borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 800, fontFamily: 'var(--font-mono)',
                    background: i === 0 ? '#FFC93D' : i === 1 ? '#d4d4d8' : i === 2 ? '#92400e' : 'rgba(0,0,0,0.7)',
                    color: i < 3 ? '#000' : '#fff',
                  }}>
                    {i + 1}
                  </div>
                  {/* Score badge */}
                  {manga.score && (
                    <div style={{
                      position: 'absolute', bottom: 6, right: 6,
                      background: 'rgba(0,0,0,0.75)', color: 'var(--screen-yellow)',
                      fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                      padding: '2px 5px', borderRadius: 4,
                    }}>★{manga.score}</div>
                  )}
                </div>
                <p style={{ fontSize: 11.5, color: 'var(--fg-2)', marginTop: 7, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {manga.title}
                </p>
              </button>
            ))}

            {!isLoading && items.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--fg-4)', padding: '16px 0' }}>
                {selectedGenre ? 'No Results For This Genre — Try Another.' : 'Nothing Loaded — Check Your Connection.'}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
