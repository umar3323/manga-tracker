'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { BADGES, type Badge } from '@/lib/achievements'

interface EarnedBadge extends Badge {
  unlocked_at: string
}

export default function AchievementsPanel() {
  const [earned, setEarned] = useState<EarnedBadge[]>([])
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [newlyUnlocked, setNewlyUnlocked] = useState<string[]>([])

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const res = await fetch('/api/achievements', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const json = await res.json()
      setEarned(json.badges ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const evaluate = async () => {
    setEvaluating(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setEvaluating(false); return }

    const res = await fetch('/api/achievements', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
    if (res.ok) {
      const json = await res.json()
      if (json.new?.length) setNewlyUnlocked(json.new)
      await load()
    }
    setEvaluating(false)
  }

  const earnedIds = new Set(earned.map(b => b.id))

  const categories: { key: Badge['category']; label: string }[] = [
    { key: 'count', label: 'Reading Count' },
    { key: 'milestone', label: 'Milestones' },
    { key: 'genre', label: 'Genre Explorer' },
  ]

  return (
    <div className="bg-zinc-900 rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold">Achievements</h2>
          <p className="text-xs text-zinc-500 mt-0.5">{earned.length} / {BADGES.length} unlocked</p>
        </div>
        <button onClick={evaluate} disabled={evaluating}
          className="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 hover:text-white transition-colors disabled:opacity-50">
          {evaluating ? 'Checking…' : 'Check new'}
        </button>
      </div>

      {/* Newly unlocked toast */}
      {newlyUnlocked.length > 0 && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-900/30 border border-emerald-800/40 text-xs text-emerald-400">
          🎉 Unlocked: {newlyUnlocked.map(id => BADGES.find(b => b.id === id)?.name).filter(Boolean).join(', ')}
        </div>
      )}

      {loading ? (
        <div className="text-xs text-zinc-600 text-center py-4">Loading…</div>
      ) : (
        <div className="space-y-5">
          {categories.map(({ key, label }) => {
            const catBadges = BADGES.filter(b => b.category === key)
            return (
              <div key={key}>
                <p className="text-[10px] font-medium text-zinc-600 uppercase tracking-widest mb-2">{label}</p>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {catBadges.map(badge => {
                    const isEarned = earnedIds.has(badge.id)
                    return (
                      <div key={badge.id} title={`${badge.name} — ${badge.description}`}
                        className={`flex flex-col items-center gap-1 p-2 rounded-xl cursor-default transition-all
                          ${isEarned ? 'bg-zinc-800 shadow-md' : 'opacity-30 grayscale'}`}>
                        <span className="text-2xl leading-none">{badge.emoji}</span>
                        <span className="text-[9px] text-center text-zinc-400 leading-tight">{badge.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
