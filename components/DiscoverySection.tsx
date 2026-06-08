'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { getTopManga, getNewManga, searchMangaWithFilters, MANGA_GENRES, type JikanSearchResult } from '@/lib/jikan'
import { Star, Calendar, Sparkles, TrendingUp, ExternalLink } from 'lucide-react'

const FILTER_GENRES = MANGA_GENRES.filter(g =>
  [1, 2, 4, 8, 10, 14, 7, 22, 24, 36, 37, 27, 42, 40].includes(g.id)
)

// Hourly featured pick — changes each hour
function hourlySeed(): number {
  const d = new Date()
  return d.getFullYear() * 1000000 + (d.getMonth() + 1) * 10000 + d.getDate() * 100 + d.getHours()
}

function pickFeatured(items: JikanSearchResult[]): JikanSearchResult | null {
  if (!items.length) return null
  return items[hourlySeed() % items.length]
}

interface Props {
  onSelect: (mal_id: number | null, title: string) => void
}

export default function DiscoverySection({ onSelect }: Props) {
  const [featured, setFeatured] = useState<JikanSearchResult | null>(null)
  const [popular, setPopular] = useState<JikanSearchResult[]>([])
  const [newReleases, setNewReleases] = useState<JikanSearchResult[]>([])
  const [popularGenre, setPopularGenre] = useState<number | null>(null)
  const [newGenre, setNewGenre] = useState<number | null>(null)
  const [loadingPopular, setLoadingPopular] = useState(true)
  const [loadingNew, setLoadingNew] = useState(true)
  const [collapsed, setCollapsed] = useState(false)

  const popularCache = useRef<Map<number | 'all', JikanSearchResult[]>>(new Map())
  const newCache = useRef<Map<number | 'all', JikanSearchResult[]>>(new Map())

  // Featured — load once from top manga
  useEffect(() => {
    getTopManga('bypopularity', 20).then(items => {
      setFeatured(pickFeatured(items.filter(m => m.cover_url && m.synopsis)))
    })
  }, [])

  // Popular Today
  useEffect(() => {
    const key = popularGenre ?? 'all'
    if (popularCache.current.has(key)) {
      setPopular(popularCache.current.get(key)!)
      return
    }
    setLoadingPopular(true)
    const fn = popularGenre
      ? searchMangaWithFilters({ includeGenres: [popularGenre], status: 'publishing', orderBy: 'members', sort: 'desc' })
      : getTopManga('publishing', 16)
    fn.then(items => {
      popularCache.current.set(key, items)
      setPopular(items)
      setLoadingPopular(false)
    })
  }, [popularGenre])

  // New Releases
  useEffect(() => {
    const key = newGenre ?? 'all'
    if (newCache.current.has(key)) {
      setNewReleases(newCache.current.get(key)!)
      return
    }
    setLoadingNew(true)
    getNewManga(16, newGenre).then(items => {
      newCache.current.set(key, items)
      setNewReleases(items)
      setLoadingNew(false)
    })
  }, [newGenre])

  return (
    <div className="mb-6 rounded-2xl overflow-hidden" style={{ background: 'var(--ink-700)', border: 'var(--border-hair)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: 'var(--border-hair)' }}>
        <div className="flex items-center gap-2">
          <Sparkles size={15} strokeWidth={1.5} style={{ color: 'var(--cyan)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--fg-1)' }}>Discover</span>
        </div>
        <button onClick={() => setCollapsed(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)', fontSize: 16, lineHeight: 1, padding: '4px 2px' }}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div className="divide-y" style={{ borderColor: 'var(--ink-500)' }}>

          {/* ── Featured ── */}
          {featured && (
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: 'var(--fg-4)' }}>
                <Star size={10} strokeWidth={2} style={{ color: 'var(--screen-yellow)' }} /> Featured today
              </p>
              <div className="flex gap-4 rounded-xl overflow-hidden relative" style={{ background: 'var(--ink-600)' }}>
                {/* Blurred bg */}
                {featured.cover_url && (
                  <div className="absolute inset-0 opacity-20" style={{
                    backgroundImage: `url(${featured.cover_url})`,
                    backgroundSize: 'cover', backgroundPosition: 'center',
                    filter: 'blur(24px)', transform: 'scale(1.2)',
                  }} />
                )}
                <div className="relative flex gap-4 p-4 w-full">
                  {featured.cover_url && (
                    <div className="shrink-0 w-24 h-36 rounded-lg overflow-hidden shadow-2xl">
                      <Image src={featured.cover_url} alt={featured.title} width={96} height={144}
                        className="w-full h-full object-cover" unoptimized />
                    </div>
                  )}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h3 className="font-bold text-base leading-snug mb-1" style={{ color: 'var(--fg-1)' }}>{featured.title}</h3>
                      {featured.authors.length > 0 && (
                        <p className="text-xs mb-2" style={{ color: 'var(--fg-4)' }}>
                          {featured.authors.map(a => a.name).join(', ')}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-1 mb-2">
                        {featured.genres.slice(0, 4).map(g => (
                          <span key={g} className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: 'var(--ink-500)', color: 'var(--fg-3)' }}>{g}</span>
                        ))}
                        {featured.score && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold"
                            style={{ background: 'rgba(255,200,60,0.15)', color: 'var(--screen-yellow)' }}>
                            ★ {featured.score}
                          </span>
                        )}
                      </div>
                      {featured.synopsis && (
                        <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--fg-3)' }}>
                          {featured.synopsis}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => onSelect(featured.mal_id, featured.title)}
                        className="px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors hover:opacity-90"
                        style={{ background: 'var(--vermillion)', color: '#fff' }}>
                        + Add to list
                      </button>
                      {featured.mal_id && (
                        <a href={`https://myanimelist.net/manga/${featured.mal_id}`}
                          target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs transition-colors hover:opacity-80"
                          style={{ background: 'var(--ink-500)', color: 'var(--fg-3)' }}>
                          <ExternalLink size={10} strokeWidth={1.5} /> MAL
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Popular Today ── */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--fg-4)' }}>
                <TrendingUp size={10} strokeWidth={2} style={{ color: 'var(--vermillion)' }} /> Popular today
              </p>
            </div>
            {/* Genre pills */}
            <div className="flex gap-1.5 overflow-x-auto mb-3 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <GenrePill label="All" active={popularGenre === null} onClick={() => setPopularGenre(null)} />
              {FILTER_GENRES.map(g => (
                <GenrePill key={g.id} label={g.name} active={popularGenre === g.id} onClick={() => setPopularGenre(g.id)} />
              ))}
            </div>
            <HorizontalScroll items={popular} loading={loadingPopular} onSelect={onSelect} showScore />
          </div>

          {/* ── New Releases ── */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--fg-4)' }}>
                <Calendar size={10} strokeWidth={2} style={{ color: 'var(--cyan)' }} /> New releases
              </p>
            </div>
            {/* Genre pills */}
            <div className="flex gap-1.5 overflow-x-auto mb-3 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <GenrePill label="All" active={newGenre === null} onClick={() => setNewGenre(null)} />
              {FILTER_GENRES.map(g => (
                <GenrePill key={g.id} label={g.name} active={newGenre === g.id} onClick={() => setNewGenre(g.id)} />
              ))}
            </div>
            <HorizontalScroll items={newReleases} loading={loadingNew} onSelect={onSelect} showDate />
          </div>

        </div>
      )}
    </div>
  )
}

function GenrePill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="shrink-0 text-[11px] px-2.5 py-1 rounded-full font-semibold transition-all border"
      style={{
        background: active ? 'var(--vermillion)' : 'var(--ink-600)',
        borderColor: active ? 'var(--vermillion)' : 'var(--ink-500)',
        color: active ? '#fff' : 'var(--fg-3)',
      }}>
      {label}
    </button>
  )
}

function HorizontalScroll({
  items, loading, onSelect, showScore, showDate,
}: {
  items: JikanSearchResult[]
  loading: boolean
  onSelect: (mal_id: number | null, title: string) => void
  showScore?: boolean
  showDate?: boolean
}) {
  return (
    <div className="flex gap-3 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
      {loading && Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="shrink-0 w-20">
          <div className="w-20 h-28 rounded-lg animate-pulse" style={{ background: 'var(--ink-600)' }} />
          <div className="h-2.5 rounded mt-2 animate-pulse" style={{ background: 'var(--ink-600)' }} />
          <div className="h-2.5 rounded mt-1 w-2/3 animate-pulse" style={{ background: 'var(--ink-600)' }} />
        </div>
      ))}
      {!loading && items.map(m => (
        <button key={m.mal_id ?? m.hid ?? m.title} onClick={() => onSelect(m.mal_id, m.title)}
          className="shrink-0 w-20 text-left group">
          <div className="relative w-20 h-28 rounded-lg overflow-hidden" style={{ background: 'var(--ink-600)' }}>
            {m.cover_url ? (
              <Image src={m.cover_url} alt={m.title} fill
                className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center p-2 text-center text-[9px]"
                style={{ color: 'var(--fg-4)' }}>{m.title}</div>
            )}
            {showScore && m.score && (
              <div className="absolute bottom-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded"
                style={{ background: 'rgba(0,0,0,0.75)', color: 'var(--screen-yellow)' }}>
                ★{m.score}
              </div>
            )}
            {showDate && m.published_from && (
              <div className="absolute bottom-1 left-1 right-1 text-[8px] font-mono text-center px-1 py-0.5 rounded"
                style={{ background: 'rgba(0,0,0,0.75)', color: 'var(--cyan)' }}>
                {new Date(m.published_from).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
              </div>
            )}
          </div>
          <p className="text-[10px] mt-1.5 leading-tight line-clamp-2" style={{ color: 'var(--fg-3)' }}>{m.title}</p>
        </button>
      ))}
      {!loading && items.length === 0 && (
        <p className="text-xs py-4" style={{ color: 'var(--fg-4)' }}>No results — try another genre.</p>
      )}
    </div>
  )
}
