'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { getTopManga, getTrendingThisYear, type JikanSearchResult } from '@/lib/jikan'
import type { Recommendation } from '@/app/api/recommend/route'

type Tab = 'now' | 'year' | 'alltime'

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'now',     label: 'Trending Now', emoji: '🔥' },
  { id: 'year',    label: 'This Year',    emoji: '📅' },
  { id: 'alltime', label: 'All Time',     emoji: '👑' },
]

interface Props {
  onSelect: (rec: Recommendation) => void
}

export default function TrendingSection({ onSelect }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('now')
  const [data, setData] = useState<Partial<Record<Tab, JikanSearchResult[]>>>({})
  const [loading, setLoading] = useState<Partial<Record<Tab, boolean>>>({})
  const [collapsed, setCollapsed] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fetched = useRef<Set<Tab>>(new Set())

  const fetchTab = async (tab: Tab) => {
    if (fetched.current.has(tab)) return
    fetched.current.add(tab)
    setLoading(prev => ({ ...prev, [tab]: true }))

    let results: JikanSearchResult[] = []
    if (tab === 'now')     results = await getTopManga('publishing')
    if (tab === 'year')    results = await getTrendingThisYear()
    if (tab === 'alltime') results = await getTopManga('bypopularity')

    setData(prev => ({ ...prev, [tab]: results }))
    setLoading(prev => ({ ...prev, [tab]: false }))
  }

  useEffect(() => { fetchTab('now') }, [])

  const handleTab = (tab: Tab) => {
    setActiveTab(tab)
    fetchTab(tab)
    scrollRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
  }

  const handleSelect = (manga: JikanSearchResult) => {
    onSelect({
      title: manga.title,
      mal_id: manga.mal_id,
      confidence: 0,   // hidden in this context
      reason: '',
      isAnime: false,
    })
  }

  const items = data[activeTab] ?? []
  const isLoading = loading[activeTab]

  return (
    <div className="mb-6 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-base">📈</span>
          <span className="text-sm font-semibold">Trending</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab pills */}
          <div className="flex gap-1 bg-zinc-800 p-0.5 rounded-lg">
            {TABS.map(t => (
              <button key={t.id} onClick={() => handleTab(t.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  activeTab === t.id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                }`}>
                {t.emoji} {t.label}
              </button>
            ))}
          </div>
          <button onClick={() => setCollapsed(v => !v)} aria-label={collapsed ? 'Expand' : 'Collapse'}
            className="text-zinc-600 hover:text-zinc-400 transition-colors text-lg leading-none ml-1">
            {collapsed ? '▸' : '▾'}
          </button>
        </div>
      </div>

      {/* Card scroll */}
      {!collapsed && (
        <div ref={scrollRef} className="flex gap-3 overflow-x-auto px-4 py-4 scrollbar-hide"
          style={{ scrollbarWidth: 'none' }}>
          {isLoading && Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="shrink-0 w-[88px]">
              <div className="w-[88px] h-[124px] bg-zinc-800 rounded-xl animate-pulse" />
              <div className="h-3 bg-zinc-800 rounded mt-2 animate-pulse" />
              <div className="h-3 bg-zinc-800 rounded mt-1 w-2/3 animate-pulse" />
            </div>
          ))}

          {!isLoading && items.map((manga, i) => (
            <button key={manga.mal_id} onClick={() => handleSelect(manga)}
              className="shrink-0 w-[88px] text-left group">
              {/* Cover */}
              <div className="relative w-[88px] h-[124px] rounded-xl overflow-hidden bg-zinc-800">
                {manga.cover_url ? (
                  <Image src={manga.cover_url} alt={manga.title} fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs p-1 text-center">
                    {manga.title}
                  </div>
                )}
                {/* Rank badge */}
                <div className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-yellow-400 text-black' :
                  i === 1 ? 'bg-zinc-300 text-black' :
                  i === 2 ? 'bg-amber-600 text-white' :
                  'bg-black/60 text-white'
                }`}>
                  {i + 1}
                </div>
                {/* Score badge */}
                {manga.score && (
                  <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-yellow-400 text-[10px] font-medium px-1.5 py-0.5 rounded">
                    ★{manga.score}
                  </div>
                )}
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-violet-600/0 group-hover:bg-violet-600/10 transition-colors rounded-xl" />
              </div>
              {/* Title */}
              <p className="text-xs text-zinc-400 group-hover:text-white transition-colors mt-2 leading-tight line-clamp-2">
                {manga.title}
              </p>
            </button>
          ))}

          {!isLoading && items.length === 0 && (
            <p className="text-sm text-zinc-600 py-4">Nothing loaded — check your connection.</p>
          )}
        </div>
      )}
    </div>
  )
}
