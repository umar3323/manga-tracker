'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { UrlAnalysisResult } from '@/app/api/analyze-url/route'
import type { Manga } from '@/lib/supabase'

interface Props {
  manga: Manga
  onClose: () => void
  onSaved: (updates: Partial<Manga>) => void
}

const FIELD_LABELS: Partial<Record<keyof UrlAnalysisResult, string>> = {
  title: 'Title',
  total_chapters: 'Total Chapters',
  total_episodes: 'Total Episodes',
  score: 'Score',
  synopsis: 'Synopsis',
  genres: 'Genres',
  authors: 'Authors',
  cover_url: 'Cover URL',
  published_from: 'Published From',
  published_to: 'Published To',
  content_type: 'Content Type',
  mal_id: 'MAL ID',
}

export default function UrlImportModal({ manga, onClose, onSaved }: Props) {
  const [url, setUrl] = useState('')
  const [phase, setPhase] = useState<'input' | 'loading' | 'review' | 'saving' | 'done'>('input')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<UrlAnalysisResult | null>(null)
  // Which fields to apply (all enabled by default)
  const [enabled, setEnabled] = useState<Set<string>>(new Set())

  const analyze = async () => {
    if (!url.trim()) return
    setPhase('loading')
    setError(null)
    try {
      const res = await fetch('/api/analyze-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Analysis failed')
      setResult(data as UrlAnalysisResult)
      // Enable all non-null fields by default
      const auto = new Set<string>()
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && k !== 'source_site' && (Array.isArray(v) ? (v as unknown[]).length > 0 : true)) {
          auto.add(k)
        }
      }
      setEnabled(auto)
      setPhase('review')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setPhase('input')
    }
  }

  const handleSave = async () => {
    if (!result) return
    setPhase('saving')

    const updates: Record<string, unknown> = {}

    if (enabled.has('title') && result.title) updates.title = result.title
    if (enabled.has('total_chapters') && result.total_chapters != null) updates.total_chapters = result.total_chapters
    if (enabled.has('total_episodes') && result.total_episodes != null) updates.total_episodes = result.total_episodes
    if (enabled.has('score') && result.score != null) updates.score = result.score
    if (enabled.has('synopsis') && result.synopsis) updates.synopsis = result.synopsis
    if (enabled.has('genres') && result.genres.length > 0) updates.genres = result.genres
    if (enabled.has('cover_url') && result.cover_url) updates.cover_url = result.cover_url
    if (enabled.has('published_from') && result.published_from) updates.published_from = result.published_from
    if (enabled.has('published_to') && result.published_to) updates.published_to = result.published_to
    if (enabled.has('content_type') && result.content_type) updates.content_type = result.content_type
    if (enabled.has('mal_id') && result.mal_id != null) updates.mal_id = result.mal_id
    if (enabled.has('authors') && result.authors.length > 0) {
      // authors stored as JSON array in DB via the authors column (array of Author objects or strings)
      // keep as strings, the DB stores them differently; just skip if complex
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('manga_list').update(updates).eq('id', manga.id)
    }

    setPhase('done')
    onSaved(updates as Partial<Manga>)
  }

  const toggle = (key: string) =>
    setEnabled(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s })

  const displayValue = (key: string, val: unknown): string => {
    if (Array.isArray(val)) return (val as string[]).join(', ')
    if (typeof val === 'number') return String(val)
    if (typeof val === 'string') return val.length > 120 ? val.slice(0, 120) + '…' : val
    return String(val)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <h2 className="font-bold text-base">Import From URL</h2>
            <p className="text-xs text-zinc-500 mt-0.5 truncate max-w-xs">{manga.title}</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {(phase === 'input' || phase === 'loading') && (
            <div className="space-y-3">
              <p className="text-xs text-zinc-400">
                Paste a URL from MyAnimeList, MangaUpdates, AniList, MangaDex, or any other site. Claude AI will extract the series info.
              </p>
              <input
                type="url"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && analyze()}
                placeholder="https://myanimelist.net/manga/…"
                disabled={phase === 'loading'}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-white outline-none focus:border-violet-500 placeholder:text-zinc-600 disabled:opacity-50"
              />
              {error && (
                <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
              )}
              {phase === 'loading' && (
                <div className="flex items-center gap-3 text-zinc-400 text-sm py-2">
                  <div className="w-5 h-5 rounded-full border-2 border-violet-500 border-t-transparent animate-spin shrink-0" />
                  Fetching page and analysing with Claude AI…
                </div>
              )}
            </div>
          )}

          {(phase === 'review' || phase === 'saving' || phase === 'done') && result && (
            <div className="space-y-3">
              <div className="bg-zinc-800/60 rounded-lg px-3 py-2 text-xs text-zinc-400">
                Source: <span className="text-zinc-200">{result.source_site}</span>
              </div>

              {phase === 'saving' && (
                <div className="flex items-center gap-3 text-zinc-400 text-sm py-2">
                  <div className="w-5 h-5 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin shrink-0" />
                  Saving…
                </div>
              )}
              {phase === 'done' && (
                <div className="flex items-center gap-2 text-emerald-400 text-sm py-2">
                  <span className="text-xl">✓</span> Saved successfully
                </div>
              )}

              <p className="text-xs text-zinc-500">Toggle which fields to apply:</p>

              {(Object.keys(FIELD_LABELS) as Array<keyof UrlAnalysisResult>).map(key => {
                const val = result[key]
                const hasValue = val !== null && val !== undefined && !(Array.isArray(val) && val.length === 0)
                if (!hasValue) return null
                const isOn = enabled.has(key)
                return (
                  <button
                    key={key}
                    onClick={() => toggle(key)}
                    disabled={phase === 'saving' || phase === 'done'}
                    className={`w-full flex items-start gap-3 text-left rounded-lg px-3 py-2.5 border transition-colors ${
                      isOn
                        ? 'bg-violet-600/10 border-violet-500/40 text-violet-200'
                        : 'bg-zinc-800/40 border-zinc-700/40 text-zinc-500'
                    }`}
                  >
                    <div className={`w-4 h-4 mt-0.5 shrink-0 rounded border flex items-center justify-center transition-colors ${isOn ? 'bg-violet-600 border-violet-600' : 'border-zinc-600'}`}>
                      {isOn && <span className="text-[10px] leading-none text-white">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold mb-0.5">{FIELD_LABELS[key]}</div>
                      <div className="text-xs opacity-70 break-words">{displayValue(key, val)}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-zinc-800 flex gap-3">
          {phase === 'input' && (
            <>
              <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={analyze}
                disabled={!url.trim()}
                className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 disabled:opacity-40 transition-colors"
              >
                Analyse URL
              </button>
            </>
          )}
          {phase === 'loading' && (
            <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-zinc-800 text-zinc-400 text-xs hover:bg-zinc-700 transition-colors">
              Cancel
            </button>
          )}
          {phase === 'review' && (
            <>
              <button
                onClick={() => setPhase('input')}
                className="flex-1 py-2 rounded-xl bg-zinc-800 border border-zinc-700 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                Try Another URL
              </button>
              <button
                onClick={handleSave}
                disabled={enabled.size === 0}
                className="flex-1 py-2 rounded-xl bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 disabled:opacity-40 transition-colors"
              >
                Apply {enabled.size} Field{enabled.size !== 1 ? 's' : ''}
              </button>
            </>
          )}
          {(phase === 'saving' || phase === 'done') && (
            <button onClick={onClose} className="w-full py-2 rounded-xl bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition-colors">
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
