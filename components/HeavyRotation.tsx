'use client'

import { heavySeries } from '@/lib/data/takeout-series'

// Type badge colours matching the site palette
const TYPE_STYLES: Record<string, { bg: string; color: string }> = {
  anime: { bg: 'rgba(43,230,220,0.12)', color: 'var(--cyan)' },
  manga: { bg: 'rgba(255,45,70,0.12)', color: 'var(--vermillion)' },
  manhwa: { bg: 'rgba(167,139,250,0.12)', color: '#A78BFA' },
  webtoon: { bg: 'rgba(251,146,60,0.12)', color: '#FB923C' },
}

export default function HeavyRotation() {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-1.5">
            🔥 Heavy rotation
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Hundreds Of Clips, Analysis &amp; Lore Videos Consumed On YouTube
          </p>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded-full border border-zinc-700 text-zinc-600">
          From YouTube Takeout
        </span>
      </div>

      {/* Horizontally scrollable strip */}
      <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        {heavySeries.map((s, i) => {
          const typeSt = TYPE_STYLES[s.type] ?? TYPE_STYLES.anime
          return (
            <div
              key={s.title}
              className="shrink-0 w-36 bg-zinc-900 border border-zinc-800 rounded-xl p-3 flex flex-col gap-2"
            >
              {/* Rank + fire indicator */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-zinc-600">#{i + 1}</span>
                <span className="text-[10px]" style={{ color: 'var(--vermillion)' }}>🔥 Heavy</span>
              </div>

              {/* Title */}
              <p className="text-xs font-semibold leading-snug text-white line-clamp-3 flex-1">
                {s.title}
              </p>

              {/* Type badge */}
              <span
                className="self-start text-[9px] px-1.5 py-0.5 rounded-full uppercase tracking-wide font-medium"
                style={{ background: typeSt.bg, color: typeSt.color, border: `1px solid ${typeSt.color}33` }}
              >
                {s.type}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
