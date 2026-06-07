'use client'

import { takeoutSeries } from '@/lib/data/takeout-series'

// Aggregate genre counts across all 33 identified series
function buildGenreMap(): Map<string, number> {
  const map = new Map<string, number>()
  for (const s of takeoutSeries) {
    for (const g of s.genres) {
      const normalised = normaliseGenre(g)
      map.set(normalised, (map.get(normalised) ?? 0) + 1)
    }
  }
  return map
}

// Collapse near-synonyms so the chart doesn't fragment
function normaliseGenre(g: string): string {
  const lower = g.toLowerCase()
  if (lower.includes('dark fantasy') || lower === 'horror') return 'Dark / Mature'
  if (lower === 'fantasy' || lower === 'magic') return 'Fantasy'
  if (lower === 'action') return 'Action'
  if (lower === 'supernatural') return 'Supernatural'
  if (lower === 'adventure') return 'Adventure'
  if (lower.includes('slice of life') || lower.includes('drama') || lower === 'family') return 'Slice Of Life'
  if (lower === 'isekai') return 'Isekai'
  if (lower.includes('shonen') || lower.includes('shounen') || lower === 'school') return 'Shounen'
  if (lower === 'comedy' || lower === 'parody') return 'Comedy'
  if (lower === 'mystery' || lower.includes('psychological') || lower === 'thriller') return 'Mystery / Psychological'
  if (lower === 'historical' || lower === 'ninja' || lower === 'spy') return 'Historical / Period'
  if (lower === 'superhero' || lower === 'sci-fi' || lower === 'monster' || lower === 'dungeon' || lower.includes('overpowered')) return 'Sci-Fi / Power'
  if (lower === 'romance' || lower.includes('magical girl')) return 'Romance'
  return g // keep as-is for anything else
}

const BAR_COLORS = [
  'var(--vermillion)',
  'var(--cyan)',
  '#FFB02E',
  '#A78BFA',
  'var(--success)',
  '#FB923C',
  '#38BDF8',
  '#F472B6',
  '#A3E635',
  '#E879F9',
]

export default function GenreProfile() {
  const genreMap = buildGenreMap()
  const sorted = [...genreMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
  const max = sorted[0]?.[1] ?? 1

  if (!sorted.length) return null

  return (
    <div className="bg-zinc-900 rounded-xl p-5">
      <h2 className="text-sm font-semibold mb-0.5">Genre profile</h2>
      <p className="text-xs text-zinc-500 mb-4">Across 33 Series Identified From YouTube Watch History</p>
      <div className="space-y-2.5">
        {sorted.map(([genre, count], i) => {
          const pct = Math.round((count / max) * 100)
          return (
            <div key={genre} className="flex items-center gap-3">
              <span className="text-xs text-zinc-400 w-36 shrink-0 truncate">{genre}</span>
              <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: BAR_COLORS[i % BAR_COLORS.length] }}
                />
              </div>
              <span className="text-xs text-zinc-600 w-6 text-right shrink-0">{count}</span>
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-zinc-700 mt-4">Series Count — One Series May Span Multiple Genres</p>
    </div>
  )
}
