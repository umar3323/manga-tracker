'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import type { JikanSearchResult } from '@/lib/jikan'

const SWIPE_THRESHOLD = 100

interface SwipeCard extends JikanSearchResult {
  swiped?: 'left' | 'right'
}

export default function DiscoverPage() {
  const [queue, setQueue] = useState<SwipeCard[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [genreProfile, setGenreProfile] = useState<string[] | null>(null)
  const [swipeCount, setSwipeCount] = useState(0)
  const [lastSwipe, setLastSwipe] = useState<'left' | 'right' | null>(null)
  const [toast, setToast] = useState('')

  // Drag state
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  const loadQueue = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/swipe-queue')
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return }
      setQueue(data.queue ?? [])
      setGenreProfile(data.genreProfile)
    } catch {
      setError('Network error — check your connection')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadQueue() }, [loadQueue])

  const current = queue[0]
  const next = queue[1]

  const commitSwipe = useCallback(async (direction: 'left' | 'right', manga: SwipeCard) => {
    setLastSwipe(direction)
    setSwipeCount(c => c + 1)

    // Remove from queue
    setQueue(prev => prev.slice(1))

    // Save to swipe_history
    await supabase.from('swipe_history').insert({
      mal_id: manga.mal_id,
      title: manga.title,
      direction,
      genres: manga.genres,
      synopsis: manga.synopsis,
    })

    // Add to list if swiped right
    if (direction === 'right') {
      const { error } = await supabase.from('manga_list').insert({
        mal_id: manga.mal_id,
        title: manga.title,
        current_chapter: 0,
        status: 'plan_to_read',
        cover_url: manga.cover_url,
        total_chapters: manga.total_chapters,
      })
      if (!error) showToast(`Added "${manga.title}" to Plan to Read`)
      else if (error.code === '23505') showToast('Already in your list!')
    }

    // Reload when queue runs low
    if (queue.length <= 2) {
      setTimeout(() => loadQueue(), 300)
    }
  }, [queue.length, loadQueue])

  // Mouse drag handlers
  const onMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    startX.current = e.clientX
  }
  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return
    setDragX(e.clientX - startX.current)
  }, [isDragging])
  const onMouseUp = useCallback(() => {
    if (!isDragging || !current) return
    setIsDragging(false)
    if (dragX > SWIPE_THRESHOLD) commitSwipe('right', current)
    else if (dragX < -SWIPE_THRESHOLD) commitSwipe('left', current)
    setDragX(0)
  }, [isDragging, dragX, current, commitSwipe])

  // Touch handlers
  const onTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true)
    startX.current = e.touches[0].clientX
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    setDragX(e.touches[0].clientX - startX.current)
  }
  const onTouchEnd = () => {
    if (!isDragging || !current) return
    setIsDragging(false)
    if (dragX > SWIPE_THRESHOLD) commitSwipe('right', current)
    else if (dragX < -SWIPE_THRESHOLD) commitSwipe('left', current)
    setDragX(0)
  }

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!current) return
      if (e.key === 'ArrowRight') commitSwipe('right', current)
      if (e.key === 'ArrowLeft')  commitSwipe('left',  current)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [current, commitSwipe])

  const rotation = dragX * 0.05
  const likeOpacity  = Math.min(1, Math.max(0, dragX  / SWIPE_THRESHOLD))
  const skipOpacity  = Math.min(1, Math.max(0, -dragX / SWIPE_THRESHOLD))

  return (
    <main
      className="min-h-screen bg-[#0d0d0d] text-white select-none"
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
    >
      <div className="max-w-sm mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">Discover</h1>
            <p className="text-zinc-500 text-xs mt-0.5">
              {genreProfile
                ? `Tuned to: ${genreProfile.slice(0, 3).join(', ')}`
                : 'Swipe to train your taste'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-zinc-500">{swipeCount} swiped</div>
            <div className="flex gap-1 mt-1 justify-end">
              {lastSwipe === 'right' && <span className="text-emerald-400 text-xs">✓ liked</span>}
              {lastSwipe === 'left'  && <span className="text-red-400 text-xs">✗ skipped</span>}
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-96 text-zinc-500 text-sm">Loading…</div>
        )}

        {error && (
          <div className="flex flex-col items-center justify-center h-96 gap-3">
            <p className="text-red-400 text-sm">{error}</p>
            <button onClick={loadQueue} className="px-4 py-2 bg-zinc-800 rounded-lg text-sm hover:bg-zinc-700">Retry</button>
          </div>
        )}

        {!loading && !error && queue.length === 0 && (
          <div className="flex flex-col items-center justify-center h-96 gap-4 text-center">
            <div className="text-4xl">🎉</div>
            <p className="text-zinc-300 font-medium">You&apos;ve seen everything!</p>
            <p className="text-zinc-500 text-sm">We&apos;ll find more manga based on your taste.</p>
            <button onClick={loadQueue} className="px-6 py-2.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200">
              Load more
            </button>
          </div>
        )}

        {!loading && !error && queue.length > 0 && (
          <>
            {/* Card stack — adapts to viewport height on mobile */}
            <div className="relative mb-5" style={{ height: 'min(520px, calc(100dvh - 260px))' }}>
              {next && (
                <div className="absolute inset-0 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 scale-95 opacity-60 pointer-events-none" />
              )}
              <div
                ref={cardRef}
                className="absolute inset-0 rounded-2xl overflow-hidden bg-zinc-900 border border-zinc-800 cursor-grab active:cursor-grabbing touch-none"
                style={{
                  transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
                  transition: isDragging ? 'none' : 'transform 0.3s ease',
                  userSelect: 'none',
                }}
                onMouseDown={onMouseDown}
                onTouchStart={onTouchStart}
                onTouchMove={onTouchMove}
                onTouchEnd={onTouchEnd}
              >
                {/* Cover — top 55% */}
                <div className="relative bg-zinc-800" style={{ height: '55%' }}>
                  {current.cover_url ? (
                    <Image src={current.cover_url} alt={current.title} fill
                      className="object-cover pointer-events-none" unoptimized />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-zinc-700">No cover</div>
                  )}
                  <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center pointer-events-none" style={{ opacity: likeOpacity }}>
                    <div className="border-4 border-emerald-400 text-emerald-400 text-4xl font-black px-4 py-1 rounded-xl -rotate-12">LIKE</div>
                  </div>
                  <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center pointer-events-none" style={{ opacity: skipOpacity }}>
                    <div className="border-4 border-red-400 text-red-400 text-4xl font-black px-4 py-1 rounded-xl rotate-12">SKIP</div>
                  </div>
                </div>
                {/* Info — bottom 45% */}
                <div className="p-4 overflow-y-auto" style={{ height: '45%' }}>
                  <div className="font-bold text-base leading-snug mb-2">{current.title}</div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {current.genres.slice(0, 5).map(g => (
                      <span key={g} className="text-xs px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded-full">{g}</span>
                    ))}
                    {current.score && <span className="text-xs px-2 py-0.5 bg-zinc-800 text-yellow-400 rounded-full">★ {current.score}</span>}
                  </div>
                  {current.synopsis && (
                    <p className="text-xs text-zinc-400 leading-relaxed">
                      {current.synopsis.slice(0, 280)}{current.synopsis.length > 280 ? '…' : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons — bigger on mobile for easier tapping */}
            <div className="flex items-center justify-center gap-8">
              <button onClick={() => commitSwipe('left', current)} aria-label="Skip"
                className="w-20 h-20 md:w-16 md:h-16 rounded-full bg-zinc-900 border-2 border-red-500/50 flex items-center justify-center text-3xl md:text-2xl hover:bg-red-500/10 hover:border-red-500 active:scale-95 transition-all">
                ✕
              </button>
              <div className="text-xs text-zinc-600 text-center leading-relaxed">
                <div>← Skip</div>
                <div>Like →</div>
              </div>
              <button onClick={() => commitSwipe('right', current)} aria-label="Like"
                className="w-20 h-20 md:w-16 md:h-16 rounded-full bg-zinc-900 border-2 border-emerald-500/50 flex items-center justify-center text-3xl md:text-2xl hover:bg-emerald-500/10 hover:border-emerald-500 active:scale-95 transition-all">
                ♥
              </button>
            </div>
            <p className="text-center text-xs text-zinc-700 mt-3">
              <span className="md:hidden">Swipe the card or tap the buttons</span>
              <span className="hidden md:inline">Drag card · Tap buttons · ← → arrows</span>
            </p>
          </>
        )}
      </div>

      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </main>
  )
}
