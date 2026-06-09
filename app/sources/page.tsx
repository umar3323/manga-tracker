'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { ExternalLink, ChevronUp, Plus, Clock, Zap, CheckCircle, XCircle, Trash2, Puzzle, Globe } from 'lucide-react'

interface SourceRequest {
  id: string
  name: string
  url: string | null
  description: string | null
  votes: number
  status: 'pending' | 'in_progress' | 'live' | 'declined'
  created_at: string
}

interface CustomSite {
  id: string
  hostname: string
  display_name: string
  created_at: string
}

const LINKED_SOURCES = [
  // ── Live — direct API ──────────────────────────────────────────────────────
  {
    name: 'MyAnimeList',
    url: 'https://myanimelist.net',
    via: 'Jikan REST API v4',
    description: 'Core manga & anime metadata — titles, chapter/episode counts, cover art, scores, genres, authors, airing status, member counts.',
    features: ['Cover art', 'Chapter/episode counts', 'Genres & scores', 'Member counts'],
    status: 'live' as const,
  },
  {
    name: 'AniList',
    url: 'https://anilist.co',
    via: 'AniList GraphQL',
    description: 'Airing schedules, streaming platform links, related works, community tags, cross-site links (AniDB, Anime-Planet, Annict, Kitsu, LiveChart), and community recommendations.',
    features: ['Airing countdowns', 'Streaming links', 'Cross-site links', 'Tags & recommendations'],
    status: 'live' as const,
  },
  {
    name: 'notify.moe',
    url: 'https://notify.moe',
    via: 'notify.moe REST API',
    description: 'Anime community quality scores across four dimensions: overall, story, visuals, and soundtrack. Shown in the anime detail panel.',
    features: ['Overall score', 'Story', 'Visuals', 'Soundtrack'],
    status: 'live' as const,
  },
  {
    name: 'Kitsu',
    url: 'https://kitsu.app',
    via: 'Kitsu JSON:API',
    description: 'Community-ranked manhwa/manga catalog and MAL-ID bridge for non-MAL entries (ComicK, Webtoons). Previously known as Hummingbird.',
    features: ['Manhwa catalog', 'MAL-ID bridge', 'Community scores'],
    status: 'live' as const,
  },
  {
    name: 'MangaUpdates',
    url: 'https://www.mangaupdates.com',
    via: 'MangaUpdates API',
    description: 'Release frequency, scanlation groups, and community-sourced recommendations.',
    features: ['Release schedule', 'Scanlation groups', 'Community recs'],
    status: 'live' as const,
  },
  {
    name: 'MangaDex',
    url: 'https://mangadex.org',
    via: 'MangaDex API',
    description: 'Chapter listings, read links per card, and fallback cover art.',
    features: ['Chapter listings', 'Read links', 'Cover art'],
    status: 'live' as const,
  },
  {
    name: 'MangaPlus',
    url: 'https://mangaplus.shueisha.co.jp',
    via: 'MangaPlus feed',
    description: 'Official Shueisha chapters — latest releases from the MangaPlus platform.',
    features: ['Latest chapter feed'],
    status: 'live' as const,
  },
  {
    name: 'Shonen Jump',
    url: 'https://www.viz.com/shonenjump',
    via: 'VIZ feed',
    description: 'Weekly Shonen Jump simulpub series feed.',
    features: ['Weekly release feed'],
    status: 'live' as const,
  },
  {
    name: 'Webtoons',
    url: 'https://www.webtoons.com',
    via: 'Webtoons feed',
    description: 'Latest Webtoon series and episodes from the official platform.',
    features: ['Webtoon episode feed'],
    status: 'live' as const,
  },
  {
    name: 'Goodreads',
    url: 'https://www.goodreads.com',
    via: 'Goodreads scrape',
    description: 'Book and manga ratings — surfaced in search results.',
    features: ['Ratings in search'],
    status: 'live' as const,
  },
  {
    name: 'Anime News Network',
    url: 'https://www.animenewsnetwork.com',
    via: 'ANN XML API',
    description: 'Fallback anime adaptation detection when AniList hasn\'t updated yet.',
    features: ['Anime adaptation signals'],
    status: 'live' as const,
  },
  // ── Live — via AniList cross-references ───────────────────────────────────
  {
    name: 'AniDB',
    url: 'https://anidb.net',
    via: 'AniList cross-link',
    description: 'Precise episode database, character & staff data. AniDB deep links surface in anime detail cards automatically via AniList.',
    features: ['Episode data', 'Character & staff', 'Deep links'],
    status: 'live' as const,
  },
  {
    name: 'Anime-Planet',
    url: 'https://www.anime-planet.com',
    via: 'AniList cross-link',
    description: 'Community recommendation engine and tags. Anime-Planet deep links surface in anime detail cards automatically via AniList.',
    features: ['Deep links', 'Community recs'],
    status: 'live' as const,
  },
  {
    name: 'Annict',
    url: 'https://annict.com',
    via: 'AniList cross-link',
    description: 'Japanese anime episode-logging platform. Annict deep links surface in anime detail cards automatically via AniList.',
    features: ['Deep links', 'Episode logging'],
    status: 'live' as const,
  },
  {
    name: 'LiveChart.me',
    url: 'https://www.livechart.me',
    via: 'AniList cross-link',
    description: 'Seasonal anime charts and detailed airing schedules. Links surface in anime detail cards automatically via AniList.',
    features: ['Seasonal charts', 'Airing schedules'],
    status: 'live' as const,
  },
  // ── Planned ────────────────────────────────────────────────────────────────
  {
    name: 'menome.in.th',
    url: 'http://menome.in.th',
    via: 'Thai anime community',
    description: 'Thai-language anime community database. Integration planned for Thai-specific metadata and community lists.',
    features: ['Thai community data'],
    status: 'in_progress' as const,
  },
]

// Sites with full dedicated parsers in the extension
const BUILTIN_STREAMING = [
  { name: 'Crunchyroll',    hostname: 'crunchyroll.com',   method: 'Episode from title' },
  { name: 'Netflix',        hostname: 'netflix.com',        method: 'DOM scrape + fallback' },
  { name: 'Amazon Prime',   hostname: 'primevideo.com',     method: 'DOM scrape + fallback' },
  { name: 'Disney+',        hostname: 'disneyplus.com',     method: 'DOM scrape + fallback' },
  { name: 'Max / HBO',      hostname: 'max.com',            method: 'DOM scrape + fallback' },
  { name: 'Hulu',           hostname: 'hulu.com',           method: 'Episode from title' },
  { name: 'Apple TV+',      hostname: 'tv.apple.com',       method: 'Episode from title' },
  { name: 'HiDive',         hostname: 'hidive.com',         method: 'Episode from URL' },
  { name: 'HiAnime / Zoro', hostname: 'hianime.to',         method: 'Episode from URL' },
  { name: 'GogoAnime',      hostname: 'gogoanime.by',       method: 'Episode from URL' },
  { name: 'Anitaku',        hostname: 'anitaku.pe',         method: 'Episode from URL' },
  { name: 'Aniwaves',       hostname: 'aniwaves.com',       method: 'Episode from URL' },
  { name: 'Aniwatch',       hostname: 'aniwatch.to',        method: 'Episode from URL' },
  { name: '9anime',         hostname: '9anime.to',          method: 'Episode from URL' },
  { name: 'Bilibili',       hostname: 'bilibili.tv',        method: 'Episode from title' },
  { name: 'Tubi',           hostname: 'tubitv.com',         method: 'Episode from URL' },
]

const STATUS_CONFIG = {
  live:        { label: 'Live',        icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  in_progress: { label: 'In Progress', icon: Zap,         color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20' },
  pending:     { label: 'Requested',   icon: Clock,       color: 'text-zinc-400',    bg: 'bg-zinc-700/30 border-zinc-700' },
  declined:    { label: 'Declined',    icon: XCircle,     color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
}

export default function SourcesPage() {
  const [requests, setRequests]       = useState<SourceRequest[]>([])
  const [loading, setLoading]         = useState(true)
  const [name, setName]               = useState('')
  const [url, setUrl]                 = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting]   = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [votedIds, setVotedIds]       = useState<Set<string>>(new Set())
  const [toast, setToast]             = useState('')

  // Streaming sites state
  const [customSites, setCustomSites]       = useState<CustomSite[]>([])
  const [sitesLoading, setSitesLoading]     = useState(true)
  const [siteInput, setSiteInput]           = useState('')
  const [siteNameInput, setSiteNameInput]   = useState('')
  const [siteAdding, setSiteAdding]         = useState(false)
  const [showAddForm, setShowAddForm]       = useState(false)
  const siteInputRef = useRef<HTMLInputElement>(null)

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    try { setVotedIds(new Set(JSON.parse(localStorage.getItem('yomu_voted_sources') ?? '[]'))) } catch {}
    supabase.from('source_requests')
      .select('*')
      .order('votes', { ascending: false })
      .then(({ data }) => { if (data) setRequests(data as SourceRequest[]); setLoading(false) })

    fetch('/api/streaming-sites')
      .then(r => r.ok ? r.json() : [])
      .then((data: CustomSite[]) => { setCustomSites(data); setSitesLoading(false) })
      .catch(() => setSitesLoading(false))
  }, [])

  const submit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    const { data, error } = await supabase.from('source_requests').insert({
      name: name.trim(),
      url: url.trim() || null,
      description: description.trim() || null,
    }).select().single()
    if (!error && data) {
      setRequests(prev => [data as SourceRequest, ...prev])
      setName(''); setUrl(''); setDescription('')
      setSubmitted(true)
      showToast('Request submitted — thanks!')
      setTimeout(() => setSubmitted(false), 4000)
    } else {
      showToast('Failed to submit — try again')
    }
    setSubmitting(false)
  }

  const vote = async (req: SourceRequest) => {
    if (votedIds.has(req.id)) return
    const next = req.votes + 1
    const { error } = await supabase.from('source_requests').update({ votes: next }).eq('id', req.id)
    if (!error) {
      setRequests(prev => prev.map(r => r.id === req.id ? { ...r, votes: next } : r).sort((a, b) => b.votes - a.votes))
      setVotedIds(prev => {
        const s = new Set(prev); s.add(req.id)
        try { localStorage.setItem('yomu_voted_sources', JSON.stringify([...s])) } catch {}
        return s
      })
    }
  }

  const addSite = async () => {
    if (!siteInput.trim()) return
    setSiteAdding(true)
    try {
      const res = await fetch('/api/streaming-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname: siteInput.trim(), display_name: siteNameInput.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) {
        showToast(data.error ?? 'Failed to add site')
      } else {
        setCustomSites(prev => [data as CustomSite, ...prev])
        setSiteInput(''); setSiteNameInput('')
        setShowAddForm(false)
        showToast(`${data.display_name} added — extension will use it on next startup`)
      }
    } catch {
      showToast('Failed to add site — try again')
    }
    setSiteAdding(false)
  }

  const removeSite = async (site: CustomSite) => {
    const res = await fetch('/api/streaming-sites', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: site.id }),
    })
    if (res.ok) {
      setCustomSites(prev => prev.filter(s => s.id !== site.id))
      showToast(`${site.display_name} removed`)
    }
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-6 md:py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Sources</h1>
          <p className="text-zinc-500 text-sm mt-1">Websites and APIs powering YOMU data — and requests for new ones.</p>
        </div>

        {/* Linked sources grid */}
        <section className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Linked Sources</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {LINKED_SOURCES.map(s => (
              <div key={s.name} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{s.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1">
                        <CheckCircle size={9} strokeWidth={2} /> Live
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-600 font-mono">{s.via}</span>
                  </div>
                  <a href={s.url} target="_blank" rel="noopener noreferrer"
                    className="text-zinc-600 hover:text-zinc-400 transition-colors shrink-0 mt-0.5">
                    <ExternalLink size={13} strokeWidth={1.5} />
                  </a>
                </div>
                <p className="text-xs text-zinc-500 leading-relaxed flex-1">{s.description}</p>
                <div className="flex flex-wrap gap-1">
                  {s.features.map(f => (
                    <span key={f} className="text-[10px] px-2 py-0.5 bg-zinc-800 text-zinc-500 rounded-full">{f}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Extension Streaming Sites ────────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <Puzzle size={11} className="text-violet-400" strokeWidth={2} />
                Extension Streaming Sites
              </h2>
              <p className="text-[11px] text-zinc-600 mt-0.5">
                Sites the Chrome extension tracks automatically. Add any site and the extension will track episodes there on its next startup.
              </p>
            </div>
            <Link href="/extension" className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1 shrink-0">
              About extension <ExternalLink size={10} strokeWidth={2} />
            </Link>
          </div>

          {/* Built-in sites */}
          <div className="mb-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-2">Built-in (always active)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              {BUILTIN_STREAMING.map(s => (
                <div key={s.hostname} className="flex items-center justify-between gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg">
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle size={11} strokeWidth={2} className="text-emerald-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate">{s.name}</p>
                      <p className="text-[10px] text-zinc-600 font-mono truncate">{s.hostname}</p>
                    </div>
                  </div>
                  <span className="text-[9px] text-zinc-600 shrink-0 text-right">{s.method}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Custom sites */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Custom sites
                {customSites.length > 0 && (
                  <span className="ml-1.5 font-mono normal-case text-zinc-700">{customSites.length}</span>
                )}
              </p>
              <button
                onClick={() => { setShowAddForm(v => !v); setTimeout(() => siteInputRef.current?.focus(), 50) }}
                className="flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 transition-colors font-medium"
              >
                <Plus size={12} strokeWidth={2} />
                Add site
              </button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="bg-zinc-900 border border-violet-500/25 rounded-xl p-4 mb-3 space-y-3">
                <div>
                  <label className="text-[10px] text-zinc-500 font-medium block mb-1">
                    Site URL or hostname <span className="text-red-400">*</span>
                  </label>
                  <input
                    ref={siteInputRef}
                    value={siteInput}
                    onChange={e => setSiteInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSite()}
                    placeholder="e.g. animepahe.ru or https://animepahe.ru"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500/60 placeholder:text-zinc-600 font-mono"
                  />
                  <p className="text-[10px] text-zinc-600 mt-1">
                    Just paste the URL — the extension uses the generic episode parser on it automatically.
                  </p>
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 font-medium block mb-1">Display name (optional)</label>
                  <input
                    value={siteNameInput}
                    onChange={e => setSiteNameInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addSite()}
                    placeholder="e.g. AnimePahe"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500/60 placeholder:text-zinc-600"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addSite}
                    disabled={siteAdding || !siteInput.trim()}
                    className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    <Globe size={12} strokeWidth={2} />
                    {siteAdding ? 'Adding…' : 'Add Site'}
                  </button>
                  <button
                    onClick={() => { setShowAddForm(false); setSiteInput(''); setSiteNameInput('') }}
                    className="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-xs transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {sitesLoading ? (
              <p className="text-zinc-600 text-xs py-2">Loading…</p>
            ) : customSites.length === 0 ? (
              <div className="border border-dashed border-zinc-800 rounded-xl p-5 text-center">
                <Globe size={20} className="text-zinc-700 mx-auto mb-2" strokeWidth={1.5} />
                <p className="text-xs text-zinc-600">No custom sites yet.</p>
                <p className="text-[11px] text-zinc-700 mt-0.5">
                  Add any streaming site URL — the extension will track episodes there automatically using generic title parsing.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {customSites.map(site => (
                  <div key={site.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-zinc-900 border border-zinc-800 rounded-lg group">
                    <div className="flex items-center gap-2 min-w-0">
                      <Globe size={12} className="text-violet-400 shrink-0" strokeWidth={1.5} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{site.display_name}</p>
                        <p className="text-[10px] text-zinc-600 font-mono truncate">{site.hostname}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[9px] text-zinc-700">
                        {new Date(site.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </span>
                      <button
                        onClick={() => removeSite(site)}
                        className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all"
                        title="Remove site"
                      >
                        <Trash2 size={13} strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Request form */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Request a Source</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
            {submitted ? (
              <div className="flex items-center gap-3 py-2">
                <CheckCircle size={18} strokeWidth={1.5} className="text-emerald-400 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-emerald-300">Request submitted!</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Others can upvote it. High-voted requests get prioritised.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-zinc-500 font-medium block mb-1">Website name <span className="text-red-400">*</span></label>
                  <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Crunchyroll, Kitsu, LiveChart"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 font-medium block mb-1">Website URL</label>
                  <input
                    value={url}
                    onChange={e => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 font-medium block mb-1">What data or feature would it add?</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Crunchyroll watch history sync, episode progress tracking…"
                    rows={3}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600 resize-none"
                  />
                </div>
                <button
                  onClick={submit}
                  disabled={submitting || !name.trim()}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-black rounded-xl text-sm font-medium disabled:opacity-40 hover:bg-zinc-200 transition-colors"
                >
                  <Plus size={14} strokeWidth={2} />
                  {submitting ? 'Submitting…' : 'Submit request'}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Community requests */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">
            Community Requests
            {requests.length > 0 && <span className="ml-2 text-zinc-600 font-mono normal-case">{requests.length}</span>}
          </h2>
          {loading ? (
            <p className="text-zinc-600 text-sm">Loading…</p>
          ) : requests.length === 0 ? (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
              <p className="text-zinc-600 text-sm">No requests yet — be the first!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {requests.map(req => {
                const cfg = STATUS_CONFIG[req.status]
                const StatusIcon = cfg.icon
                const voted = votedIds.has(req.id)
                return (
                  <div key={req.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4 items-start">
                    <button
                      onClick={() => vote(req)}
                      disabled={voted}
                      title={voted ? 'Already voted' : 'Upvote'}
                      className={`flex flex-col items-center gap-0.5 shrink-0 pt-0.5 transition-colors ${
                        voted ? 'text-violet-400 cursor-default' : 'text-zinc-600 hover:text-violet-400'
                      }`}
                    >
                      <ChevronUp size={16} strokeWidth={2} />
                      <span className="text-xs font-bold font-mono leading-none">{req.votes}</span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{req.name}</span>
                        {req.url && (
                          <a href={req.url.startsWith('http') ? req.url : `https://${req.url}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-zinc-600 hover:text-zinc-400 transition-colors">
                            <ExternalLink size={11} strokeWidth={1.5} />
                          </a>
                        )}
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex items-center gap-1 ${cfg.bg} ${cfg.color}`}>
                          <StatusIcon size={9} strokeWidth={2} /> {cfg.label}
                        </span>
                      </div>
                      {req.description && (
                        <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{req.description}</p>
                      )}
                      <p className="text-[10px] text-zinc-700 mt-1.5 font-mono">
                        {new Date(req.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

      </div>

      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </main>
  )
}
