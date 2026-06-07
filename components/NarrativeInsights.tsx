'use client'

import type { Manga } from '@/lib/supabase'

interface LogEntry {
  chapters_read: number
  logged_at: string
  progress_date?: string | null
  date_precision?: 'exact' | 'year_only' | 'unknown' | null
}

interface Insight {
  emoji: string
  headline: string
  body: string
  accent: string
  detail?: string
}

function computeInsights(manga: Manga[], log: LogEntry[]): Insight[] {
  const insights: Insight[] = []
  if (manga.length < 3) return []

  // ── 1. Genre sweet spot ───────────────────────────────────────────────────
  const genreTotal: Record<string, number> = {}
  const genreDone:  Record<string, number> = {}
  for (const m of manga) {
    for (const g of (m.genres ?? [])) {
      genreTotal[g] = (genreTotal[g] ?? 0) + 1
      if (m.status === 'completed') genreDone[g] = (genreDone[g] ?? 0) + 1
    }
  }
  const ratedGenres = Object.entries(genreTotal)
    .filter(([, n]) => n >= 2)
    .map(([g, n]) => ({ g, pct: Math.round(((genreDone[g] ?? 0) / n) * 100), total: n }))
    .sort((a, b) => b.pct - a.pct)

  const best  = ratedGenres[0]
  const worst = [...ratedGenres].sort((a, b) => a.pct - b.pct)[0]

  if (best && worst && best.g !== worst.g) {
    insights.push({
      emoji: '🎯',
      headline: `You finish ${best.g} — almost never finish ${worst.g}`,
      body: `${best.pct}% of your ${best.g} titles reach completed. ${worst.g} sits at ${worst.pct}% — you keep starting them and walking away.`,
      accent: 'var(--success)',
      detail: `Based on ${ratedGenres.length} genres with ≥2 titles`,
    })
  }

  // ── 2. Drop-off chapter ───────────────────────────────────────────────────
  const dropped = manga.filter(m => m.status === 'dropped' || m.status === 'on_hold')
  if (dropped.length >= 3) {
    const buckets: Record<string, number> = { '1–25': 0, '26–75': 0, '76–150': 0, '151+': 0 }
    for (const m of dropped) {
      const ch = m.current_chapter
      if (ch <= 25)       buckets['1–25']++
      else if (ch <= 75)  buckets['26–75']++
      else if (ch <= 150) buckets['76–150']++
      else                buckets['151+']++
    }
    const danger = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]
    const pct    = Math.round((danger[1] / dropped.length) * 100)
    insights.push({
      emoji: '⚠️',
      headline: `Ch. ${danger[0]} is where things die for you`,
      body: `${pct}% of your dropped/on-hold titles stall out in the ${danger[0]} chapter range. If you haven't hooked by then, you probably won't.`,
      accent: 'var(--vermillion)',
      detail: `Across ${dropped.length} abandoned or paused titles`,
    })
  }

  // ── 3. Reading day of week ────────────────────────────────────────────────
  const dayBuckets = [0, 0, 0, 0, 0, 0, 0] // Sun→Sat
  for (const l of log) {
    const d = new Date(l.progress_date ?? l.logged_at).getDay()
    dayBuckets[d] += l.chapters_read
  }
  const peakDay = dayBuckets.indexOf(Math.max(...dayBuckets))
  const DAYS    = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const weekPct = Math.round((dayBuckets[peakDay] / (dayBuckets.reduce((s, v) => s + v, 1))) * 100)
  if (log.length >= 10 && weekPct > 20) {
    insights.push({
      emoji: '📅',
      headline: `${DAYS[peakDay]} is your reading day`,
      body: `${weekPct}% of all chapters you've logged landed on a ${DAYS[peakDay]}. Your week builds up to it.`,
      accent: 'var(--cyan)',
      detail: `From ${log.length} logged reading sessions`,
    })
  }

  // ── 4. Longest active series ──────────────────────────────────────────────
  const active = manga.filter(m => m.status === 'reading' && m.current_chapter > 0)
    .sort((a, b) => b.current_chapter - a.current_chapter)
  if (active.length > 0) {
    const top = active[0]
    const pct  = top.total_chapters
      ? Math.round((top.current_chapter / top.total_chapters) * 100)
      : null
    insights.push({
      emoji: '📖',
      headline: `${top.title} has your longest commitment`,
      body: pct !== null
        ? `${top.current_chapter} chapters in — ${pct}% of the way through. ${pct >= 80 ? "You're nearly there." : pct >= 50 ? "Past the halfway point." : "Just getting started."}`
        : `You're ${top.current_chapter} chapters deep — and still going.`,
      accent: '#a78bfa',
      detail: top.total_chapters ? `${top.total_chapters} total chapters` : 'Ongoing series',
    })
  }

  // ── 5. Completion rate vs rating ─────────────────────────────────────────
  const liked    = manga.filter(m => m.user_rating === 'up')
  const disliked = manga.filter(m => m.user_rating === 'down')
  const likedComp    = liked.length    ? Math.round(liked.filter(m => m.status === 'completed').length    / liked.length    * 100) : null
  const dislikedComp = disliked.length ? Math.round(disliked.filter(m => m.status === 'completed').length / disliked.length * 100) : null
  if (likedComp !== null && dislikedComp !== null && liked.length + disliked.length >= 4) {
    insights.push({
      emoji: '👍',
      headline: likedComp > dislikedComp
        ? `You finish what you like — ${likedComp}% vs ${dislikedComp}%`
        : `You rate things after suffering through them`,
      body: likedComp > dislikedComp
        ? `Liked titles have a ${likedComp}% completion rate. Disliked ones only ${dislikedComp}%. Your ratings track your commitment.`
        : `Disliked titles actually finish at ${dislikedComp}% — higher than liked (${likedComp}%). You push through things you don't enjoy.`,
      accent: likedComp > dislikedComp ? 'var(--success)' : '#FFB02E',
      detail: `${liked.length} liked · ${disliked.length} disliked`,
    })
  }

  // ── 6. On-hold comeback rate ──────────────────────────────────────────────
  const onHold  = manga.filter(m => m.status === 'on_hold').length
  const totalAbandoned = manga.filter(m => m.status === 'on_hold' || m.status === 'dropped').length
  if (totalAbandoned >= 4) {
    const holdPct = Math.round((onHold / totalAbandoned) * 100)
    insights.push({
      emoji: '⏸️',
      headline: holdPct > 60
        ? `You pause, not abandon — ${holdPct}% of stalls are on hold`
        : `${100 - holdPct}% of paused series got dropped, not resumed`,
      body: holdPct > 60
        ? `Most of your paused titles are on hold rather than dropped. You give series a second chance more than you admit.`
        : `Of ${totalAbandoned} series you stopped reading, most turned into permanent drops. You know early when something isn't for you.`,
      accent: '#FFB02E',
      detail: `${onHold} on hold · ${totalAbandoned - onHold} dropped`,
    })
  }

  return insights.slice(0, 5)
}

export default function NarrativeInsights({ manga, log }: { manga: Manga[]; log: LogEntry[] }) {
  const insights = computeInsights(manga, log)
  if (insights.length === 0) return null

  return (
    <div className="mb-6">
      <h2 className="text-sm font-semibold mb-0.5">What Your Data Says About You</h2>
      <p className="text-xs text-zinc-500 mb-4">Patterns pulled from your reading history</p>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {insights.map((ins, i) => (
          <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-2"
            style={{ borderLeftWidth: 3, borderLeftColor: ins.accent }}>
            <div className="flex items-start gap-2">
              <span className="text-lg leading-none shrink-0">{ins.emoji}</span>
              <p className="text-sm font-semibold text-white leading-snug">{ins.headline}</p>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">{ins.body}</p>
            {ins.detail && (
              <p className="text-[10px] text-zinc-700 mt-auto pt-1 border-t border-zinc-800">
                {ins.detail}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
