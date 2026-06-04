'use client'

import { useState, useEffect } from 'react'
import type { MPChapter } from '@/app/api/mangaplus/route'

export default function MangaPlusFeed({ trackedTitles }: { trackedTitles: Set<string> }) {
  const [chapters, setChapters] = useState<MPChapter[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'tracked'>('all')

  useEffect(() => {
    fetch('/api/mangaplus')
      .then(r => r.json())
      .then(j => { setChapters(j.chapters ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const isTracked = (ch: MPChapter) => {
    const n = norm(ch.title)
    return [...trackedTitles].some(t => norm(t).includes(n) || n.includes(norm(t)))
  }

  const visible = filter === 'tracked' ? chapters.filter(isTracked) : chapters

  if (loading) return (
    <div className="space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-16 bg-zinc-900 rounded-xl animate-pulse" />
      ))}
    </div>
  )

  if (!chapters.length) return (
    <p className="text-zinc-500 text-sm text-center py-12">Could not load MangaPlus data.</p>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">📖</span>
          <div>
            <p className="text-sm font-bold text-zinc-100">MangaPlus by Shueisha</p>
            <p className="text-[10px] text-zinc-500">via mangaplus.shueisha.co.jp · {chapters.length} series</p>
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
        <p className="text-zinc-500 text-sm text-center py-8">None of your tracked manga are on MangaPlus.</p>
      )}

      <div className="space-y-1.5">
        {visible.map((ch, idx) => {
          const tracked = isTracked(ch)
          return (
            <div key={`${ch.titleId || idx}`}
              className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5 group hover:border-zinc-600 transition-colors">
              <div className={`w-1.5 h-8 rounded-full shrink-0 ${tracked ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-100 truncate">{ch.title}</p>
                  {ch.isFree && (
                    <span className="shrink-0 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 border border-emerald-800/50">
                      FREE
                    </span>
                  )}
                  {tracked && (
                    <span className="shrink-0 text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-900/40 text-blue-400 border border-blue-800/50">
                      TRACKING
                    </span>
                  )}
                </div>
                {ch.chapter !== '—' && (
                  <p className="text-xs text-zinc-500 mt-0.5">Chapter {ch.chapter}</p>
                )}
              </div>
              <div className="flex gap-1.5 shrink-0">
                <a href={ch.url} target="_blank" rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-red-700 hover:bg-red-600 text-white text-[11px] font-bold rounded-lg transition-colors">
                  Read ↗
                </a>
                <a href={ch.seriesUrl} target="_blank" rel="noopener noreferrer"
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium rounded-lg transition-colors">
                  Series
                </a>
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-center text-[10px] text-zinc-700 mt-4">
        Data sourced from{' '}
        <a href="https://mangaplus.shueisha.co.jp" target="_blank" rel="noopener noreferrer"
          className="hover:text-zinc-500 transition-colors underline">
          mangaplus.shueisha.co.jp
        </a>
        {' '}· refreshes hourly
      </p>
    </div>
  )
}
