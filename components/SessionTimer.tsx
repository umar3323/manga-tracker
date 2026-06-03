'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface ActiveSession {
  mangaId: string
  mangaTitle: string
  startChapter: number
  startTime: number  // Date.now()
  coverUrl: string | null
}

interface Props {
  session: ActiveSession
  currentChapter: number
  onEnd: (chaptersRead: number, durationMinutes: number) => void
  onCancel: () => void
}

function pad(n: number) { return String(Math.floor(n)).padStart(2, '0') }

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`
}

export default function SessionTimer({ session, currentChapter, onEnd, onCancel }: Props) {
  const [elapsed, setElapsed] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const [chaptersInput, setChaptersInput] = useState('')
  const [minimised, setMinimised] = useState(false)
  const pausedAt = useRef<number | null>(null)
  const totalPaused = useRef(0)

  useEffect(() => {
    const tick = setInterval(() => {
      if (paused) return
      const now = Date.now()
      const raw = Math.floor((now - session.startTime - totalPaused.current) / 1000)
      setElapsed(Math.max(0, raw))
    }, 500)
    return () => clearInterval(tick)
  }, [paused, session.startTime])

  const togglePause = () => {
    if (paused) {
      totalPaused.current += Date.now() - (pausedAt.current ?? Date.now())
      pausedAt.current = null
    } else {
      pausedAt.current = Date.now()
    }
    setPaused(p => !p)
  }

  const openDone = () => {
    const gained = Math.max(0, currentChapter - session.startChapter)
    setChaptersInput(String(gained || 1))
    setShowDone(true)
  }

  const commit = () => {
    const ch = parseInt(chaptersInput, 10)
    const mins = Math.round(elapsed / 60)
    if (!isNaN(ch) && ch >= 0) onEnd(ch, mins)
  }

  const durationMins = Math.round(elapsed / 60)
  const chPerHour = elapsed > 60
    ? Math.round((Math.max(0, currentChapter - session.startChapter) / elapsed) * 3600)
    : null

  if (minimised) {
    return (
      <button
        onClick={() => setMinimised(false)}
        className="fixed bottom-24 lg:bottom-6 right-4 z-50 flex items-center gap-2 bg-zinc-900 border border-violet-500/50 rounded-full px-4 py-2 shadow-xl text-sm text-violet-300 hover:border-violet-400"
      >
        <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
        {formatTime(elapsed)}
      </button>
    )
  }

  return (
    <div className="fixed bottom-24 lg:bottom-6 right-4 z-50 w-72 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-zinc-800">
        {session.coverUrl && (
          <img src={session.coverUrl} alt="" className="w-8 h-10 object-cover rounded shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-white truncate">{session.mangaTitle}</p>
          <p className="text-xs text-zinc-500">Reading session</p>
        </div>
        <button onClick={() => setMinimised(true)} className="text-zinc-600 hover:text-zinc-400 text-sm">—</button>
      </div>

      {/* Timer */}
      <div className="px-4 py-4 text-center">
        <div className={`text-4xl font-mono font-bold tabular-nums tracking-tight ${paused ? 'text-zinc-500' : 'text-white'}`}>
          {formatTime(elapsed)}
        </div>
        {chPerHour !== null && chPerHour > 0 && (
          <p className="text-xs text-zinc-600 mt-1">{chPerHour} ch/hr</p>
        )}

        {/* Controls */}
        <div className="flex gap-2 mt-4">
          <button onClick={togglePause}
            className="flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm text-zinc-300 transition-colors">
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
          <button onClick={openDone}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-sm text-white font-medium transition-colors">
            ✓ Done
          </button>
        </div>
        <button onClick={onCancel} className="mt-2 text-xs text-zinc-700 hover:text-zinc-500">Cancel session</button>
      </div>

      {/* Done modal overlay */}
      {showDone && (
        <div className="absolute inset-0 bg-zinc-900/95 flex flex-col justify-center p-5">
          <p className="text-sm font-semibold text-white mb-1">Session complete!</p>
          <p className="text-xs text-zinc-500 mb-4">{formatTime(elapsed)} · {durationMins} min</p>
          <label className="text-xs text-zinc-400 mb-1.5">Chapters read this session</label>
          <input
            type="number" min={0} value={chaptersInput}
            onChange={e => setChaptersInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && commit()}
            autoFocus
            className="bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-3 text-lg font-bold text-center outline-none focus:border-violet-500 text-white mb-4"
          />
          <button onClick={commit}
            className="w-full py-3 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-medium">
            Log session
          </button>
          <button onClick={() => setShowDone(false)} className="mt-2 text-xs text-zinc-600 hover:text-zinc-400">Back</button>
        </div>
      )}
    </div>
  )
}
