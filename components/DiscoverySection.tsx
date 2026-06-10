'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import {
  getTopManga, getNewManga, searchMangaWithFilters,
  getTopAnime, getNewAnime,
  MANGA_GENRES, type JikanSearchResult,
} from '@/lib/jikan'
import { supabase } from '@/lib/supabase'
import { Star, Calendar, Sparkles, TrendingUp, ExternalLink, X, Clapperboard, BookOpen } from 'lucide-react'

const FILTER_GENRES = MANGA_GENRES.filter(g =>
  [1, 2, 4, 8, 10, 14, 7, 22, 24, 36, 37, 27, 42, 40].includes(g.id)
)

// Current hour key — used for cache busting so data refreshes each hour
function hourKey(): string {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`
}

function pickFeatured(items: JikanSearchResult[]): JikanSearchResult | null {
  if (!items.length) return null
  const seed = parseInt(hourKey().replace(/-/g, ''), 10)
  return items[seed % items.length]
}

function fmtMembers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`
  return String(n)
}

interface Props {
  onSelect: (mal_id: number | null, title: string) => void
}

export default function DiscoverySection({ onSelect }: Props) {
  const [featured, setFeatured] = useState<JikanSearchResult | null>(null)
  const [popular, setPopular] = useState<JikanSearchResult[]>([])
  const [newReleases, setNewReleases] = useState<JikanSearchResult[]>([])
  const [popularAnime, setPopularAnime] = useState<JikanSearchResult[]>([])
  const [newAnime, setNewAnime] = useState<JikanSearchResult[]>([])
  const [popularGenre, setPopularGenre] = useState<number | null>(null)
  const [newGenre, setNewGenre] = useState<number | null>(null)
  const [animePopularGenre, setAnimePopularGenre] = useState<number | null>(null)
  const [animeNewGenre, setAnimeNewGenre] = useState<number | null>(null)
  const [loadingPopular, setLoadingPopular] = useState(true)
  const [loadingNew, setLoadingNew] = useState(true)
  const [loadingAnimePopular, setLoadingAnimePopular] = useState(true)
  const [loadingAnimeNew, setLoadingAnimeNew] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set())
  const userIdRef = useRef<string | null>(null)

  // Cache keyed by `${hourKey()}-${genreId}` so data refreshes each hour
  const popularCache    = useRef<Map<string, JikanSearchResult[]>>(new Map())
  const newCache        = useRef<Map<string, JikanSearchResult[]>>(new Map())
  const animePopCache   = useRef<Map<string, JikanSearchResult[]>>(new Map())
  const animeNewCache   = useRef<Map<string, JikanSearchResult[]>>(new Map())

  // Load user + dismissed IDs on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id ?? null
      userIdRef.current = uid
      if (!uid) return
      supabase.from('swipe_history')
        .select('mal_id')
        .eq('direction', 'skip')
        .eq('user_id', uid)
        .then(({ data: rows }) => {
          if (rows) setDismissedIds(new Set(rows.map((r: { mal_id: number }) => r.mal_id)))
        })
    })
  }, [])

  const dismiss = useCallback(async (item: JikanSearchResult, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!item.mal_id) return
    // Optimistic — hide immediately
    setDismissedIds(prev => new Set([...prev, item.mal_id!]))
    const uid = userIdRef.current
    if (!uid) return
    const { error } = await supabase.from('swipe_history').insert({
      user_id: uid,
      mal_id: item.mal_id,
      title: item.title,
      direction: 'skip',
      genres: item.genres ?? [],
      swiped_at: new Date().toISOString(),
    })
    if (error) {
      console.error('[DiscoverySection] dismiss insert failed:', error)
      // Roll back optimistic hide so the item doesn't silently vanish without being saved
      setDismissedIds(prev => { const next = new Set(prev); next.delete(item.mal_id!); return next })
    }
  }, [])

  // Featured — hourly
  useEffect(() => {
    getTopManga('bypopularity', 20).then(items => {
      setFeatured(pickFeatured(items.filter(m => m.cover_url && m.synopsis)))
    })
  }, [])

  // Deduplicate a list against a set of already-seen mal_ids (mutates seenIds)
  function dedupeAgainst(items: JikanSearchResult[], seenIds: Set<number>): JikanSearchResult[] {
    const out: JikanSearchResult[] = []
    for (const item of items) {
      if (!item.mal_id || !seenIds.has(item.mal_id)) {
        if (item.mal_id) seenIds.add(item.mal_id)
        out.push(item)
      }
    }
    return out
  }

  // Popular manga — hourly cache, fetch 25 so dismissed items have replacements
  useEffect(() => {
    const key = `${hourKey()}-${popularGenre ?? 'all'}`
    if (popularCache.current.has(key)) {
      setPopular(popularCache.current.get(key)!); return
    }
    setLoadingPopular(true)
    const fn = popularGenre
      ? searchMangaWithFilters({ includeGenres: [popularGenre], status: 'publishing', orderBy: 'members', sort: 'desc' })
      : getTopManga('publishing', 25)
    fn.then(items => {
      popularCache.current.set(key, items)
      setPopular(items)
      setLoadingPopular(false)
    })
  }, [popularGenre])

  // New manga — deduplicated against popular, fetch 25
  useEffect(() => {
    const key = `${hourKey()}-${newGenre ?? 'all'}`
    if (newCache.current.has(key)) {
      setNewReleases(newCache.current.get(key)!); return
    }
    setLoadingNew(true)
    getNewManga(25, newGenre).then(items => {
      // Remove any title that's already in popular manga
      const popularIds = new Set(popular.map(m => m.mal_id).filter(Boolean) as number[])
      const deduped = dedupeAgainst(items, popularIds)
      newCache.current.set(key, deduped)
      setNewReleases(deduped)
      setLoadingNew(false)
    })
  }, [newGenre, popular])

  // Popular anime — hourly cache, fetch 25
  useEffect(() => {
    const key = `${hourKey()}-${animePopularGenre ?? 'all'}`
    if (animePopCache.current.has(key)) {
      setPopularAnime(animePopCache.current.get(key)!); return
    }
    setLoadingAnimePopular(true)
    const fn = animePopularGenre
      ? (async () => {
          const res = await fetch(`/api/jikan?path=${encodeURIComponent(`/anime?genres=${animePopularGenre}&order_by=members&sort=desc&limit=25&status=airing`)}`)
          const j = await res.json(); return (j.data ?? []).map((a: Record<string, unknown>) => ({
            mal_id: a.mal_id, title: (a as any).title_english ?? (a as any).title,
            cover_url: (a as any).images?.jpg?.large_image_url ?? null,
            score: a.score ?? null, genres: ((a as any).genres ?? []).map((g: {name:string}) => g.name),
            total_chapters: null, episodes: a.episodes ?? null, status: a.status ?? null, authors: [],
            members: a.members ?? null, media_type: 'anime' as const,
          }))
        })()
      : getTopAnime('airing', 25)
    fn.then(items => {
      animePopCache.current.set(key, items)
      setPopularAnime(items)
      setLoadingAnimePopular(false)
    })
  }, [animePopularGenre])

  // New anime — deduplicated against popular anime, fetch 25
  useEffect(() => {
    const key = `${hourKey()}-${animeNewGenre ?? 'all'}`
    if (animeNewCache.current.has(key)) {
      setNewAnime(animeNewCache.current.get(key)!); return
    }
    setLoadingAnimeNew(true)
    getNewAnime(25, animeNewGenre).then(items => {
      const popularAnimeIds = new Set(popularAnime.map(m => m.mal_id).filter(Boolean) as number[])
      const deduped = dedupeAgainst(items, popularAnimeIds)
      animeNewCache.current.set(key, deduped)
      setNewAnime(deduped)
      setLoadingAnimeNew(false)
    })
  }, [animeNewGenre, popularAnime])

  // Re-fetch when hour changes (poll every 5 min, bust cache only when hour actually flips)
  useEffect(() => {
    const interval = setInterval(() => {
      const key = `${hourKey()}-${popularGenre ?? 'all'}`
      if (!popularCache.current.has(key)) {
        setLoadingPopular(true)
        const fn = popularGenre
          ? searchMangaWithFilters({ includeGenres: [popularGenre], status: 'publishing', orderBy: 'members', sort: 'desc' })
          : getTopManga('publishing', 25)
        fn.then(items => { popularCache.current.set(key, items); setPopular(items); setLoadingPopular(false) })
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [popularGenre])

  return (
    <div className="mb-6 rounded-2xl overflow-hidden" style={{ background: 'var(--ink-700)', border: 'var(--border-hair)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: 'var(--border-hair)' }}>
        <div className="flex items-center gap-2">
          <Sparkles size={15} strokeWidth={1.5} style={{ color: 'var(--cyan)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--fg-1)' }}>Discover</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--ink-500)', color: 'var(--fg-4)' }}>
            Updates hourly
          </span>
        </div>
        <button onClick={() => setCollapsed(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--fg-4)', fontSize: 16, lineHeight: 1, padding: '4px 2px' }}>
          {collapsed ? '▸' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <div className="divide-y" style={{ borderColor: 'var(--ink-500)' }}>

          {/* ── Featured ── */}
          {featured && !dismissedIds.has(featured.mal_id!) && (
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3 flex items-center gap-1.5" style={{ color: 'var(--fg-4)' }}>
                <Star size={10} strokeWidth={2} style={{ color: 'var(--screen-yellow)' }} /> Featured today
              </p>
              <div className="flex gap-4 rounded-xl overflow-hidden relative" style={{ background: 'var(--ink-600)' }}>
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
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-bold text-base leading-snug mb-1" style={{ color: 'var(--fg-1)' }}>{featured.title}</h3>
                        <button onClick={e => dismiss(featured, e)} title="Not interested"
                          className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center hover:bg-red-900/40 transition-colors"
                          style={{ color: 'var(--fg-4)' }}>
                          <X size={12} strokeWidth={2} />
                        </button>
                      </div>
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
                        {featured.members && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{ background: 'rgba(34,211,238,0.10)', color: 'var(--cyan)' }}>
                            👥 {fmtMembers(featured.members)}
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
                      <button onClick={() => onSelect(featured.mal_id, featured.title)}
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

          {/* ── Popular Manga Today ── */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={10} strokeWidth={2} style={{ color: 'var(--vermillion)' }} />
              <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--fg-4)' }}>
                <TrendingUp size={10} strokeWidth={2} style={{ color: 'var(--vermillion)' }} /> Popular manga today
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto mb-3 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <GenrePill label="All" active={popularGenre === null} onClick={() => setPopularGenre(null)} />
              {FILTER_GENRES.map(g => (
                <GenrePill key={g.id} label={g.name} active={popularGenre === g.id} onClick={() => setPopularGenre(g.id)} />
              ))}
            </div>
            <HorizontalScroll items={popular.filter(m => !m.mal_id || !dismissedIds.has(m.mal_id))}
              loading={loadingPopular} onSelect={onSelect} onDismiss={dismiss} showScore showMembers />
          </div>

          {/* ── New Manga Releases ── */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={10} strokeWidth={2} style={{ color: 'var(--cyan)' }} />
              <p className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5" style={{ color: 'var(--fg-4)' }}>
                New manga releases
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto mb-3 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <GenrePill label="All" active={newGenre === null} onClick={() => setNewGenre(null)} />
              {FILTER_GENRES.map(g => (
                <GenrePill key={g.id} label={g.name} active={newGenre === g.id} onClick={() => setNewGenre(g.id)} />
              ))}
            </div>
            <HorizontalScroll items={newReleases.filter(m => !m.mal_id || !dismissedIds.has(m.mal_id))}
              loading={loadingNew} onSelect={onSelect} onDismiss={dismiss} showDate showMembers />
          </div>

          {/* ── Popular Anime Today ── */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clapperboard size={10} strokeWidth={2} style={{ color: '#a78bfa' }} />
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--fg-4)' }}>
                Popular anime today
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto mb-3 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <GenrePill label="All" active={animePopularGenre === null} onClick={() => setAnimePopularGenre(null)} />
              {FILTER_GENRES.map(g => (
                <GenrePill key={g.id} label={g.name} active={animePopularGenre === g.id} onClick={() => setAnimePopularGenre(g.id)} />
              ))}
            </div>
            <HorizontalScroll items={popularAnime.filter(m => !m.mal_id || !dismissedIds.has(m.mal_id))}
              loading={loadingAnimePopular} onSelect={onSelect} onDismiss={dismiss} showScore showMembers isAnime />
          </div>

          {/* ── New Anime ── */}
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Calendar size={10} strokeWidth={2} style={{ color: '#a78bfa' }} />
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--fg-4)' }}>
                New anime this season
              </p>
            </div>
            <div className="flex gap-1.5 overflow-x-auto mb-3 pb-0.5" style={{ scrollbarWidth: 'none' }}>
              <GenrePill label="All" active={animeNewGenre === null} onClick={() => setAnimeNewGenre(null)} />
              {FILTER_GENRES.map(g => (
                <GenrePill key={g.id} label={g.name} active={animeNewGenre === g.id} onClick={() => setAnimeNewGenre(g.id)} />
              ))}
            </div>
            <HorizontalScroll items={newAnime.filter(m => !m.mal_id || !dismissedIds.has(m.mal_id))}
              loading={loadingAnimeNew} onSelect={onSelect} onDismiss={dismiss} showEpisodes isAnime />
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
  items, loading, onSelect, onDismiss, showScore, showDate, showMembers, showEpisodes, isAnime,
}: {
  items: JikanSearchResult[]
  loading: boolean
  onSelect: (mal_id: number | null, title: string) => void
  onDismiss: (item: JikanSearchResult, e: React.MouseEvent) => void
  showScore?: boolean
  showDate?: boolean
  showMembers?: boolean
  showEpisodes?: boolean
  isAnime?: boolean
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
        <div key={m.mal_id ?? m.hid ?? m.title} className="shrink-0 w-20 relative group">
          {/* Dismiss button */}
          <button
            onClick={e => onDismiss(m, e)}
            title="Not interested"
            className="absolute -top-1.5 -right-1.5 z-10 w-5 h-5 rounded-full flex items-center justify-center
              opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ background: '#18181b', border: '1px solid #3f3f46', color: '#a1a1aa' }}>
            <X size={9} strokeWidth={2.5} />
          </button>

          <button onClick={() => onSelect(m.mal_id, m.title)} className="w-full text-left">
            <div className="relative w-20 h-28 rounded-lg overflow-hidden" style={{ background: 'var(--ink-600)' }}>
              {m.cover_url ? (
                <Image src={m.cover_url} alt={m.title} fill
                  className="object-cover group-hover:scale-105 transition-transform duration-300" unoptimized />
              ) : (
                <div className="w-full h-full flex items-center justify-center p-2 text-center text-[9px]"
                  style={{ color: 'var(--fg-4)' }}>{m.title}</div>
              )}
              {/* Score badge */}
              {showScore && m.score && (
                <div className="absolute bottom-1 right-1 text-[9px] font-bold px-1 py-0.5 rounded"
                  style={{ background: 'rgba(0,0,0,0.75)', color: 'var(--screen-yellow)' }}>
                  ★{m.score}
                </div>
              )}
              {/* Date badge */}
              {showDate && m.published_from && (
                <div className="absolute bottom-1 left-1 right-1 text-[8px] font-mono text-center px-1 py-0.5 rounded"
                  style={{ background: 'rgba(0,0,0,0.75)', color: 'var(--cyan)' }}>
                  {new Date(m.published_from).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })}
                </div>
              )}
              {/* Episode count */}
              {showEpisodes && m.episodes && (
                <div className="absolute bottom-1 right-1 text-[8px] font-mono px-1 py-0.5 rounded"
                  style={{ background: 'rgba(0,0,0,0.75)', color: '#a78bfa' }}>
                  {m.episodes}ep
                </div>
              )}
              {/* Anime badge */}
              {isAnime && (
                <div className="absolute top-1 left-1 text-[8px] px-1 py-0.5 rounded"
                  style={{ background: 'rgba(167,139,250,0.85)', color: '#fff' }}>
                  anime
                </div>
              )}
            </div>
            <p className="text-[10px] mt-1.5 leading-tight line-clamp-2" style={{ color: 'var(--fg-3)' }}>{m.title}</p>
            {/* Members count */}
            {showMembers && m.members && (
              <p className="text-[9px] mt-0.5" style={{ color: 'var(--fg-4)' }}>
                👥 {fmtMembers(m.members)}
              </p>
            )}
          </button>
        </div>
      ))}
      {!loading && items.length === 0 && (
        <p className="text-xs py-4" style={{ color: 'var(--fg-4)' }}>No results — try another genre.</p>
      )}
    </div>
  )
}
