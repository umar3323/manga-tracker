/**
 * Anime News Network Encyclopedia API client
 * Base URL: https://cdn.animenewsnetwork.com/encyclopedia/api.xml
 * Auth: none required; attribution link to animenewsnetwork.com must appear in any UI
 * that displays ANN data.
 *
 * Rate limit: 1 req/s hard limit — enforced with 1100ms minimum gap between calls.
 * Cache: 24h per title in a module-level Map.
 * Error policy: return null on any error — never block modal render.
 *
 * NOTE: requires fast-xml-parser — run `npm install fast-xml-parser` if not present.
 */

import { XMLParser } from 'fast-xml-parser'

const ANN_BASE = 'https://cdn.animenewsnetwork.com/encyclopedia/api.xml'

// 24h per-title cache
const _titleCache = new Map<string, { data: ANNSearchResult | null; at: number }>()
const _entryCache = new Map<string, { data: ANNEntry | null; at: number }>()
const CACHE_MS = 24 * 60 * 60 * 1000

// Rate enforcer: 1100ms minimum between calls
let _lastCallAt = 0
async function annGap() {
  const wait = 1100 - (Date.now() - _lastCallAt)
  if (wait > 0) await new Promise(r => setTimeout(r, wait))
  _lastCallAt = Date.now()
}

const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  isArray: (name) => ['item', 'info', 'related-prev', 'related-next'].includes(name),
})

export interface ANNSearchResult {
  ann_id: string
  title: string
  type: 'manga' | 'anime' | 'other'
}

export interface ANNRelatedWork {
  id: string
  title: string
  type: 'manga' | 'anime' | 'other'
}

export interface ANNEntry {
  ann_id: string
  title: string
  related_anime: ANNRelatedWork[]
}

async function annFetch(url: string): Promise<string | null> {
  try {
    await annGap()
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'YOMU/1.0 (manga tracker; contact e3umar3214@gmail.com)',
        Accept: 'text/xml,application/xml',
      },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return res.text()
  } catch { return null }
}

/**
 * Search ANN for a title — returns the first matching manga entry, or null.
 * Cached 24h per title string.
 */
export async function searchANN(title: string): Promise<ANNSearchResult | null> {
  const key = title.toLowerCase().trim()
  const cached = _titleCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data

  const xml = await annFetch(`${ANN_BASE}?title=${encodeURIComponent(title)}`)
  if (!xml) { _titleCache.set(key, { data: null, at: Date.now() }); return null }

  try {
    const parsed = PARSER.parse(xml)
    const items: { '@_id': string; '@_type': string; '@_name': string }[] =
      parsed?.ann?.manga ?? parsed?.ann?.item ?? []

    // Find best manga match
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const needle = norm(title)
    const hit = items.find(i =>
      (i['@_type'] === 'manga' || i['@_type'] === 'Manga') &&
      norm(i['@_name'] ?? '') === needle
    ) ?? items.find(i => i['@_type'] === 'manga' || i['@_type'] === 'Manga')

    const result: ANNSearchResult | null = hit
      ? { ann_id: hit['@_id'], title: hit['@_name'], type: 'manga' }
      : null
    _titleCache.set(key, { data: result, at: Date.now() })
    return result
  } catch {
    _titleCache.set(key, { data: null, at: Date.now() })
    return null
  }
}

/**
 * Get full ANN encyclopedia entry — returns related anime works.
 * Cached 24h per ANN ID.
 */
export async function getANNEntry(annId: string): Promise<ANNEntry | null> {
  const cached = _entryCache.get(annId)
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.data

  const xml = await annFetch(`${ANN_BASE}?manga=${encodeURIComponent(annId)}`)
  if (!xml) { _entryCache.set(annId, { data: null, at: Date.now() }); return null }

  try {
    const parsed = PARSER.parse(xml)
    const manga = parsed?.ann?.manga

    if (!manga) { _entryCache.set(annId, { data: null, at: Date.now() }); return null }

    const title: string = manga['@_name'] ?? manga?.info?.find?.(
      (i: { '@_type': string; '#text': string }) => i['@_type'] === 'Main title'
    )?.['#text'] ?? ''

    // Extract related previous (manga source) and next (anime adaptation) items
    const related: ANNRelatedWork[] = []
    const relPrev: { '@_id': string; '@_type': string; '#text': string }[] = manga['related-prev'] ?? []
    const relNext: { '@_id': string; '@_type': string; '#text': string }[] = manga['related-next'] ?? []

    for (const r of [...relPrev, ...relNext]) {
      const t = (r['@_type'] ?? '').toLowerCase()
      related.push({
        id: r['@_id'] ?? '',
        title: r['#text'] ?? '',
        type: t === 'anime' ? 'anime' : t === 'manga' ? 'manga' : 'other',
      })
    }

    const result: ANNEntry = {
      ann_id: annId,
      title,
      related_anime: related.filter(r => r.type === 'anime'),
    }
    _entryCache.set(annId, { data: result, at: Date.now() })
    return result
  } catch {
    _entryCache.set(annId, { data: null, at: Date.now() })
    return null
  }
}
