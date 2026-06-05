'use client'

import { useState, useEffect, useRef } from 'react'
import { Sparkles, Star, X } from 'lucide-react'
import { supabase, type Manga } from '@/lib/supabase'

interface Props {
  manga: Manga
  onClose: () => void
  onSaved: (id: string, rating: 'up' | 'down' | null, note: string) => void
}

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  angle: number
  speed: number
  opacity: number
}

const COLORS = ['#FF6B6B', '#FFD93D', '#6BCB77', '#4D96FF', '#FF6BD6', '#FFA500']

function useParticles(active: boolean) {
  const [particles, setParticles] = useState<Particle[]>([])
  const frameRef = useRef<number>(0)
  const counterRef = useRef(0)

  useEffect(() => {
    if (!active) return
    const initial: Particle[] = Array.from({ length: 40 }, (_, i) => ({
      id: i,
      x: 20 + Math.random() * 60,
      y: 10 + Math.random() * 40,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 4 + Math.random() * 6,
      angle: Math.random() * 360,
      speed: 0.3 + Math.random() * 0.8,
      opacity: 1,
    }))
    setParticles(initial)

    const tick = () => {
      setParticles(prev =>
        prev
          .map(p => ({
            ...p,
            y: p.y + p.speed,
            x: p.x + Math.sin((p.y / 20) + p.id) * 0.4,
            opacity: p.opacity - 0.008,
          }))
          .filter(p => p.opacity > 0)
      )
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frameRef.current)
  }, [active])

  return particles
}

export default function CompletionModal({ manga, onClose, onSaved }: Props) {
  const [stars, setStars] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const particles = useParticles(true)

  const handleSave = async () => {
    setSaving(true)
    const rating: 'up' | 'down' | null = stars >= 3 ? 'up' : stars > 0 ? 'down' : null
    const updates: Record<string, unknown> = { user_rating: rating }
    if (note.trim()) {
      const existing = manga.notes ? manga.notes.trim() + '\n' : ''
      updates.notes = existing + `[Completed] ${note.trim()}`
    }
    await supabase.from('manga_list').update(updates).eq('id', manga.id)
    setSaving(false)
    onSaved(manga.id, rating, note.trim())
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Particles */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute rounded-full"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              opacity: p.opacity,
              transform: `rotate(${p.angle}deg)`,
            }}
          />
        ))}
      </div>

      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 transition-colors z-10"
        >
          <X size={16} strokeWidth={1.5} />
        </button>

        {/* Cover banner */}
        {manga.cover_url && (
          <div className="relative h-28 overflow-hidden">
            <img src={manga.cover_url} alt="" className="w-full h-full object-cover" style={{ filter: 'blur(2px) brightness(0.4)' }} />
            <img src={manga.cover_url} alt="" className="absolute inset-0 w-full h-full object-contain" />
          </div>
        )}

        <div className="px-6 py-5">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={16} strokeWidth={1.5} className="icon-glow-cyan" />
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-widest">Completed</span>
          </div>
          <h2 className="text-lg font-bold text-white mb-4 leading-tight">{manga.title}</h2>

          {/* Stars */}
          <p className="text-xs text-zinc-500 mb-2">How was it?</p>
          <div className="flex gap-1 mb-5">
            {[1, 2, 3, 4, 5].map(s => (
              <button
                key={s}
                onMouseEnter={() => setHovered(s)}
                onMouseLeave={() => setHovered(0)}
                onClick={() => setStars(s === stars ? 0 : s)}
                className="transition-transform hover:scale-110"
              >
                <Star
                  size={24}
                  strokeWidth={1.5}
                  fill={(hovered || stars) >= s ? '#FFD93D' : 'none'}
                  className={(hovered || stars) >= s ? 'text-yellow-400' : 'text-zinc-700'}
                />
              </button>
            ))}
            {stars > 0 && (
              <span className="text-xs text-zinc-500 self-center ml-2">
                {['', 'Not for me', 'Meh', 'Good', 'Great', 'Masterpiece'][stars]}
              </span>
            )}
          </div>

          {/* Note */}
          <p className="text-xs text-zinc-500 mb-2">One thought? (optional)</p>
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            placeholder="e.g. The ending hit different"
            maxLength={120}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-zinc-500 mb-5 placeholder-zinc-600"
            autoFocus={!manga.cover_url}
          />

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity"
              style={{ backgroundColor: 'var(--vermillion)', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Saving…' : 'Done'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 bg-zinc-800 transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
