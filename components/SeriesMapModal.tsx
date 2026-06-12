'use client'

import { useState, useEffect } from 'react'
import {
  getMangaAllRelations,
  getSeriesEntryDetail,
  type SeriesRelation,
  type SeriesEntryDetail,
} from '@/lib/jikan'

// ── Relation metadata ──────────────────────────────────────────────────────

const RELATION_META: Record<string, { label: string; color: string; short: string }> = {
  'Prequel':              { label: 'Prequel',            color: 'bg-blue-900/50 border-blue-600/40 text-blue-300',     short: '⬆' },
  'Sequel':               { label: 'Sequel',             color: 'bg-emerald-900/50 border-emerald-600/40 text-emerald-300', short: '⬇' },
  'Parent story':         { label: 'Parent Story',       color: 'bg-amber-900/50 border-amber-600/40 text-amber-300',  short: '↑' },
  'Adaptation':           { label: 'Adaptation',         color: 'bg-violet-900/50 border-violet-600/40 text-violet-300', short: '🎬' },
  'Alternative version':  { label: 'Alt. Version',       color: 'bg-zinc-800 border-zinc-600/40 text-zinc-300',        short: '≈' },
  'Alternative setting':  { label: 'Alt. Setting',       color: 'bg-zinc-800 border-zinc-600/40 text-zinc-300',        short: '≈' },
  'Side story':           { label: 'Side Story',         color: 'bg-orange-900/50 border-orange-600/40 text-orange-300', short: '↳' },
  'Spin-off':             { label: 'Spin-Off',           color: 'bg-pink-900/50 border-pink-600/40 text-pink-300',     short: '↗' },
  'Summary':              { label: 'Summary',            color: 'bg-zinc-800 border-zinc-600/40 text-zinc-400',        short: '∑' },
  'Character':            { label: 'Character',          color: 'bg-zinc-800 border-zinc-600/40 text-zinc-400',        short: '👤' },
  'Other':                { label: 'Other',              color: 'bg-zinc-800 border-zinc-600/40 text-zinc-400',        short: '•' },
}

// Relations that form the main vertical chain
const CHAIN_RELS = ['Parent story', 'Prequel', 'Sequel']
// Relations shown as side branches
const BRANCH_RELS = ['Adaptation', 'Alternative version', 'Alternative setting', 'Side story', 'Spin-off', 'Summary', 'Character', 'Other']

// Chain sort order (index = vertical position relative to CURRENT)
const CHAIN_SORT: Record<string, number> = {
  'Parent story': -2,
  'Prequel':      -1,
  'Sequel':        1,
}

type EnrichedEntry = SeriesRelation & Partial<SeriesEntryDetail> & { loading?: boolean }
type View = 'flowchart' | 'timeline'
type TimelineSort = 'release' | 'story'

interface Props {
  malId: number
  title: string
  coverUrl: string | null
  onClose: () => void
}

export default function SeriesMapModal({ malId, title, coverUrl, onClose }: Props) {
  const [entries, setEntries] = useState<EnrichedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('flowchart')
  const [timelineSort, setTimelineSort] = useState<TimelineSort>('story')

  // ── Load relations then progressively enrich ────────────────────────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const relations = await getMangaAllRelations(malId)
      if (cancelled) return

      // Seed with just names (instant render)
      const seed: EnrichedEntry[] = relations.map(r => ({ ...r, loading: true }))
      setEntries(seed)
      setLoading(false)

      // Enrich each entry progressively (respect ~2 req/s)
      for (let i = 0; i < relations.length; i++) {
        if (cancelled) break
        const rel = relations[i]
        const detail = await getSeriesEntryDetail(rel.mal_id, rel.type)
        if (cancelled) break
        setEntries(prev =>
          prev.map(e =>
            e.mal_id === rel.mal_id && e.relation === rel.relation
              ? { ...e, ...detail, loading: false }
              : e,
          ),
        )
        if (i < relations.length - 1) await new Promise(r => setTimeout(r, 500))
      }
    }
    load()
    return () => { cancelled = true }
  }, [malId])

  const chainEntries = entries.filter(e => CHAIN_RELS.includes(e.relation))
  const branchEntries = entries.filter(e => BRANCH_RELS.includes(e.relation))

  // Build vertical chain order
  const above = chainEntries
    .filter(e => CHAIN_SORT[e.relation] < 0)
    .sort((a, b) => CHAIN_SORT[a.relation] - CHAIN_SORT[b.relation])
  const below = chainEntries
    .filter(e => CHAIN_SORT[e.relation] > 0)
    .sort((a, b) => CHAIN_SORT[a.relation] - CHAIN_SORT[b.relation])

  // Story-order list for timeline
  const storyOrder: EnrichedEntry[] = [
    ...above.slice().reverse(),       // parent → prequel (closest to current first → reverse for chronological)
    ...below,                          // sequels
    ...branchEntries,
  ]

  // Release-date order
  const releaseOrder = [...entries]
    .filter(e => e.year)
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999))

  const malUrl = (id: number, type: 'manga' | 'anime') =>
    `https://myanimelist.net/${type}/${id}`

  return (
    <div
      className="fixed inset-0 bg-black/85 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white truncate">Series Map</h2>
            <p className="text-[11px] text-zinc-500 truncate mt-0.5">{title}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white text-xl leading-none ml-3 shrink-0">×</button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-zinc-800 shrink-0">
          {(['flowchart', 'timeline'] as View[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                view === v
                  ? 'text-white border-b-2 border-violet-500'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {v === 'flowchart' ? '⬡ Flowchart' : '⏱ Timeline'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-zinc-600 text-sm">Loading relations…</div>
          ) : entries.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-zinc-600 text-sm">No Related Entries Found</div>
          ) : view === 'flowchart' ? (
            <FlowchartView
              above={above}
              below={below}
              branches={branchEntries}
              currentTitle={title}
              currentCover={coverUrl}
              malUrl={malUrl}
            />
          ) : (
            <TimelineView
              storyOrder={storyOrder}
              releaseOrder={releaseOrder}
              sort={timelineSort}
              onSortChange={setTimelineSort}
              currentTitle={title}
              currentYear={null}
              malUrl={malUrl}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Flowchart view ─────────────────────────────────────────────────────────

function FlowchartView({
  above, below, branches, currentTitle, currentCover, malUrl,
}: {
  above: EnrichedEntry[]
  below: EnrichedEntry[]
  branches: EnrichedEntry[]
  currentTitle: string
  currentCover: string | null
  malUrl: (id: number, type: 'manga' | 'anime') => string
}) {
  return (
    <div className="px-4 py-4 space-y-0">
      {/* Legend */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {Object.entries(RELATION_META)
          .filter(([k]) => [...above, ...below, ...branches].some(e => e.relation === k))
          .map(([k, v]) => (
            <span key={k} className={`text-[10px] px-2 py-0.5 rounded-full border ${v.color}`}>{v.label}</span>
          ))}
      </div>

      {/* Above chain (Parent Story, Prequel) */}
      {above.length > 0 && (
        <>
          <div className="space-y-2">
            {above.map((e, i) => (
              <FlowNode key={i} entry={e} malUrl={malUrl} />
            ))}
          </div>
          <Arrow />
        </>
      )}

      {/* Current entry */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-3 bg-violet-900/25 border-2 border-violet-500/60 rounded-xl p-3">
          {currentCover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentCover} alt="" className="w-10 h-14 object-cover rounded-lg shrink-0" />
          ) : (
            <div className="w-10 h-14 bg-zinc-800 rounded-lg shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-violet-300 truncate">{currentTitle}</p>
            <span className="text-[10px] text-violet-400 bg-violet-900/40 border border-violet-700/40 rounded-full px-2 py-0.5 mt-1 inline-block">
              ★ Current
            </span>
          </div>
        </div>

        {/* Side branches attached to current */}
        {branches.length > 0 && (
          <div className="flex flex-col gap-1.5 justify-center w-28">
            {branches.slice(0, 4).map((e, i) => (
              <MiniNode key={i} entry={e} malUrl={malUrl} />
            ))}
            {branches.length > 4 && (
              <span className="text-[10px] text-zinc-600 text-center">+{branches.length - 4} more</span>
            )}
          </div>
        )}
      </div>

      {/* Below chain (Sequel, Sequel 2…) */}
      {below.length > 0 && (
        <>
          <Arrow />
          <div className="space-y-2">
            {below.map((e, i) => (
              <FlowNode key={i} entry={e} malUrl={malUrl} />
            ))}
          </div>
        </>
      )}

      {/* All branches as full list if too many to show inline */}
      {branches.length > 4 && (
        <div className="mt-4 pt-4 border-t border-zinc-800 space-y-2">
          <p className="text-[11px] text-zinc-500 mb-2 uppercase tracking-wide font-medium">Side Works</p>
          {branches.map((e, i) => (
            <FlowNode key={i} entry={e} malUrl={malUrl} />
          ))}
        </div>
      )}
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex justify-center py-1">
      <div className="flex flex-col items-center gap-0">
        <div className="w-px h-4 bg-zinc-600" />
        <div className="text-zinc-500 text-sm leading-none">▼</div>
      </div>
    </div>
  )
}

function FlowNode({
  entry,
  malUrl,
}: {
  entry: EnrichedEntry
  malUrl: (id: number, type: 'manga' | 'anime') => string
}) {
  const meta = RELATION_META[entry.relation] ?? RELATION_META['Other']
  const url = malUrl(entry.mal_id, entry.type)
  const isAnime = entry.type === 'anime'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 bg-zinc-800/60 border border-zinc-700/40 rounded-xl p-3 hover:bg-zinc-800 transition-colors"
      onClick={e => e.stopPropagation()}
    >
      {entry.loading ? (
        <div className="w-10 h-14 bg-zinc-700 rounded-lg shrink-0 animate-pulse" />
      ) : entry.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={entry.cover_url} alt="" className="w-10 h-14 object-cover rounded-lg shrink-0" />
      ) : (
        <div className="w-10 h-14 bg-zinc-700 rounded-lg shrink-0 flex items-center justify-center text-zinc-500 text-lg">
          {isAnime ? '📺' : '📖'}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">{entry.name}</p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${meta.color}`}>
            {meta.label}
          </span>
          {isAnime && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-cyan-900/30 border-cyan-700/40 text-cyan-400">
              Anime
            </span>
          )}
          {entry.year && (
            <span className="text-[10px] text-zinc-500">{entry.year}</span>
          )}
          {entry.episodes != null && (
            <span className="text-[10px] text-zinc-500">{entry.episodes} ep</span>
          )}
          {entry.chapters != null && (
            <span className="text-[10px] text-zinc-500">{entry.chapters} ch</span>
          )}
          {entry.score != null && (
            <span className="text-[10px] text-yellow-500">★ {entry.score.toFixed(1)}</span>
          )}
        </div>
      </div>

      <span className="text-zinc-600 text-xs shrink-0">↗</span>
    </a>
  )
}

function MiniNode({
  entry,
  malUrl,
}: {
  entry: EnrichedEntry
  malUrl: (id: number, type: 'manga' | 'anime') => string
}) {
  const meta = RELATION_META[entry.relation] ?? RELATION_META['Other']
  const url = malUrl(entry.mal_id, entry.type)
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] truncate hover:opacity-80 transition-opacity ${meta.color}`}
      onClick={e => e.stopPropagation()}
      title={entry.name}
    >
      <span>{meta.short}</span>
      <span className="truncate">{entry.name}</span>
    </a>
  )
}

// ── Timeline view ──────────────────────────────────────────────────────────

function TimelineView({
  storyOrder, releaseOrder, sort, onSortChange, currentTitle, currentYear, malUrl,
}: {
  storyOrder: EnrichedEntry[]
  releaseOrder: EnrichedEntry[]
  sort: TimelineSort
  onSortChange: (s: TimelineSort) => void
  currentTitle: string
  currentYear: number | null
  malUrl: (id: number, type: 'manga' | 'anime') => string
}) {
  const items = sort === 'release' ? releaseOrder : storyOrder

  return (
    <div className="px-4 py-4">
      {/* Sort toggle */}
      <div className="flex gap-2 mb-5">
        {(['story', 'release'] as TimelineSort[]).map(s => (
          <button
            key={s}
            onClick={() => onSortChange(s)}
            className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${
              sort === s
                ? 'bg-violet-600 border-violet-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {s === 'story' ? '📖 Story Order' : '📅 Release Order'}
          </button>
        ))}
      </div>

      {sort === 'release' && items.length === 0 && (
        <p className="text-xs text-zinc-600 text-center py-8">Release Dates Not Yet Loaded — Wait A Moment</p>
      )}

      {/* Timeline rail */}
      <div className="relative pl-6">
        {/* Vertical rail */}
        <div className="absolute left-2 top-0 bottom-0 w-px bg-zinc-700" />

        {/* Current entry first in story order */}
        {sort === 'story' && (
          <TimelineItem
            isCurrent
            title={currentTitle}
            year={currentYear}
            relation="Current"
            type="manga"
            url=""
          />
        )}

        {items.map((e, i) => (
          <TimelineItem
            key={i}
            title={e.name}
            year={e.year ?? null}
            relation={RELATION_META[e.relation]?.label ?? e.relation}
            relationColor={RELATION_META[e.relation]?.color}
            type={e.type}
            url={malUrl(e.mal_id, e.type)}
            episodes={e.episodes}
            chapters={e.chapters}
            score={e.score}
          />
        ))}
      </div>
    </div>
  )
}

function TimelineItem({
  isCurrent = false,
  title,
  year,
  relation,
  relationColor,
  type,
  url,
  episodes,
  chapters,
  score,
}: {
  isCurrent?: boolean
  title: string
  year: number | null
  relation: string
  relationColor?: string
  type: 'manga' | 'anime'
  url: string
  episodes?: number | null
  chapters?: number | null
  score?: number | null
}) {
  const inner = (
    <div
      className={`mb-4 flex items-start gap-3 ${
        isCurrent ? '' : 'hover:opacity-80 transition-opacity'
      }`}
    >
      {/* Dot on rail */}
      <div
        className={`absolute left-0 w-4 h-4 rounded-full border-2 mt-0.5 ${
          isCurrent
            ? 'bg-violet-500 border-violet-300'
            : 'bg-zinc-700 border-zinc-500'
        }`}
        style={{ marginLeft: '-1px' }}
      />

      {/* Content */}
      <div
        className={`flex-1 rounded-xl px-3 py-2.5 border ${
          isCurrent
            ? 'bg-violet-900/25 border-violet-500/40'
            : 'bg-zinc-800/60 border-zinc-700/40'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <p className={`text-xs font-medium leading-tight ${isCurrent ? 'text-violet-200' : 'text-white'}`}>
            {title}
          </p>
          {year && <span className="text-[10px] text-zinc-500 shrink-0 font-mono">{year}</span>}
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
            isCurrent ? 'bg-violet-900/40 border-violet-700/40 text-violet-400' : (relationColor ?? 'bg-zinc-800 border-zinc-600 text-zinc-400')
          }`}>
            {isCurrent ? '★ Current' : relation}
          </span>
          {type === 'anime' && !isCurrent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full border bg-cyan-900/30 border-cyan-700/40 text-cyan-400">
              Anime
            </span>
          )}
          {episodes != null && <span className="text-[10px] text-zinc-500">{episodes} ep</span>}
          {chapters != null && <span className="text-[10px] text-zinc-500">{chapters} ch</span>}
          {score != null && <span className="text-[10px] text-yellow-500">★ {score.toFixed(1)}</span>}
        </div>
      </div>
    </div>
  )

  return (
    <div className="relative">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  )
}
