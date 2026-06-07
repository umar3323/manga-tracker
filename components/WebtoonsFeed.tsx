'use client'

import { useState, useEffect } from 'react'
import type { WebtoonSeries } from '@/app/api/webtoons/route'
import type { JikanSearchResult } from '@/lib/jikan'
import { supabase } from '@/lib/supabase'
import type { MangaStatus } from '@/lib/supabase'
import { getAnimeAdaptations } from '@/lib/jikan'

interface WebtoonsFeedProps {
  trackedTitles: Set<string>
  /** Called when a series is tapped — passes a JikanSearchResult for DiscoverCardModal */
  onSelect: (m: JikanSearchResult) => void
}

export default function WebtoonsFeed({ trackedTitles, onSelect }: WebtoonsFeedProps) {
  const [series, setSeries] = useState<WebtoonSeries[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'tracked'>('all')
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch('/api/webtoons')
      .then(r => r.json())
      .then(j => { setSeries(j.series ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const isTracked = (s: WebtoonSeries) => {
    const n = norm(s.title)
    return [...trackedTitles].some(t => norm(t).includes(n) || n.includes(norm(t)))
  }

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  /** Add from Webtoons — try ComicK search first, then Jikan, then insert without MAL ID */
  const addFromWebtoons = async (s: WebtoonSeries, status: MangaStatus) => {
    setAdding(s.titleNo)
    try {
      let malId: number | null = null
      let title = s.title
      let cover = s.thumbnailUrl
      let authors: { id: number; name: string }[] = s.author ? [{ id: 0, name: s.author }] : []

      // 1. Try ComicK search by title to get MAL ID
      try {
        const ckRes = await fetch(`/api/catalog`)  // ComicK is already in catalog; search by title
        if (ckRes.ok) {
          const ckJson = await ckRes.json()
          const match = (ckJson.catalog as JikanSearchResult[])?.find(
            m => norm(m.title) === norm(title) && m.mal_id
          )
          if (match?.mal_id) malId = match.mal_id
        }
      } catch { /* continue */ }

      // 2. Try Jikan title search as fallback
      if (!malId) {
        try {
          const jRes = await fetch(
            `https://api.jikan.moe/v4/manga?q=${encodeURIComponent(title)}&limit=1`
          )
          if (jRes.ok) {
            const jJson = await jRes.json()
            const hit = jJson.data?.[0]
            if (hit) {
              malId = hit.mal_id
              title = hit.title ?? title
              cover = hit.images?.jpg?.image_url ?? cover
              authors = (hit.authors ?? []).map((a: { mal_id: number; name: string }) => ({ id: a.mal_id, name: a.name }))
            }
          }
        } catch { /* continue */ }
      }

      const adaptations = malId ? await getAnimeAdaptations(malId) : []
      const anim = adaptations[0]

      const { error } = await supabase.from('manga_list').insert({
        mal_id: malId,
        title,
        current_chapter: 0,
        status,
        cover_url: cover,
        total_chapters: null,
        authors,
        genres: s.genre ? [s.genre] : [],
        has_anime: !!anim,
        anime_mal_id: anim?.mal_id ?? null,
        anime_title: anim?.title ?? null,
        total_episodes: anim?.episodes ?? null,
      })

      if (error?.code === '23505') showToast(`"${title}" is already in your list`)
      else if (error) showToast('Failed to add')
      else {
        setAdded(prev => new Set([...prev, s.titleNo]))
        showToast(`Added "${title}"`)
      }
    } finally { setAdding(null) }
  }

  const STATUS_ADD_OPTIONS: { value: MangaStatus; label: string }[] = [
    { value: 'reading',      label: 'Reading' },
    { value: 'plan_to_read', label: 'Plan To Read' },
  ]

  const visible = filter === 'tracked' ? series.filter(isTracked) : series

  if (loading) return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="bg-zinc-900 rounded-xl overflow-hidden animate-pulse">
          <div className="aspect-[2/3] bg-zinc-800" />
          <div className="p-2 space-y-1">
            <div className="h-3 bg-zinc-800 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )

  if (!series.length) return (
    <p className="text-zinc-500 text-sm text-center py-12">Could not load Webtoons data.</p>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">📱</span>
          <div>
            <p className="text-sm font-bold text-zinc-100">Webtoons</p>
            <p className="text-[10px] text-zinc-500">via webtoons.com · {series.length} series</p>
          </div>
        </div>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 rounded-lg p-0.5">
          {(['all', 'tracked'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                filter === f ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}>
              {f === 'all' ? 'All' : 'Tracking'}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && filter === 'tracked' && (
        <p className="text-zinc-500 text-sm text-center py-8">None of your tracked manga are on Webtoons.</p>
      )}

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
        {visible.map(s => {
          const tracked = isTracked(s)
          const isAdded = added.has(s.titleNo)
          const isAdding = adding === s.titleNo
          return (
            <div key={s.titleNo}
              className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group hover:border-zinc-600 transition-colors">
              {/* Cover */}
              <div className="relative aspect-[2/3] bg-zinc-800">
                {s.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.thumbnailUrl} alt={s.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs p-2 text-center">{s.title}</div>
                )}
                {tracked && (
                  <div className="absolute top-1.5 left-1.5 bg-emerald-500 w-1.5 h-1.5 rounded-full" title="Tracking" />
                )}
                {s.isFree && (
                  <div className="absolute top-1.5 right-1.5 bg-black/70 text-emerald-400 text-[9px] font-bold px-1 py-0.5 rounded">FREE</div>
                )}
              </div>
              {/* Info */}
              <div className="p-2">
                <p className="text-xs font-medium text-zinc-200 line-clamp-2 leading-snug">{s.title}</p>
                {s.genre && <p className="text-[10px] text-zinc-600 mt-0.5">{s.genre}</p>}
                {s.likesCount && <p className="text-[10px] text-zinc-600">♥ {s.likesCount}</p>}

                <div className="mt-1.5 flex flex-col gap-1">
                  {isAdded ? (
                    <span className="text-[10px] text-emerald-400 font-medium">✓ Added</span>
                  ) : (
                    STATUS_ADD_OPTIONS.map(opt => (
                      <button key={opt.value}
                        onClick={() => addFromWebtoons(s, opt.value)}
                        disabled={isAdding}
                        className="text-[9px] px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded transition-colors disabled:opacity-40 text-left">
                        {isAdding ? '…' : `+ ${opt.label}`}
                      </button>
                    ))
                  )}
                  <a href={s.seriesUrl} target="_blank" rel="noopener noreferrer"
                    className="text-[9px] px-1.5 py-0.5 bg-zinc-900 border border-zinc-700 hover:border-zinc-500 text-zinc-600 hover:text-zinc-400 rounded transition-colors text-center">
                    Read ↗
                  </a>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-[10px] text-zinc-700 mt-4">
        Data sourced from{' '}
        <a href="https://www.webtoons.com" target="_blank" rel="noopener noreferrer"
          className="hover:text-zinc-500 transition-colors underline">
          webtoons.com
        </a>
        {' '}· refreshes every 2 hours
      </p>

      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
