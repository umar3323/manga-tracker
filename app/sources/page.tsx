'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { ExternalLink, ChevronUp, Plus, Clock, Zap, CheckCircle, XCircle } from 'lucide-react'

interface SourceRequest {
  id: string
  name: string
  url: string | null
  description: string | null
  votes: number
  status: 'pending' | 'in_progress' | 'live' | 'declined'
  created_at: string
}

const LINKED_SOURCES = [
  {
    name: 'MyAnimeList',
    url: 'https://myanimelist.net',
    via: 'Jikan API',
    description: 'Manga & anime metadata — titles, chapter counts, cover art, scores, genres, authors.',
    features: ['Cover art', 'Chapter counts', 'Genres & scores', 'Anime adaptations'],
    status: 'live' as const,
    color: '#2e51a2',
  },
  {
    name: 'AniList',
    url: 'https://anilist.co',
    via: 'AniList GraphQL',
    description: 'Airing schedules, streaming links, related works, tags, and community recommendations.',
    features: ['Airing countdowns', 'Streaming links', 'Related works', 'Tags & recommendations'],
    status: 'live' as const,
    color: '#02a9ff',
  },
  {
    name: 'MangaUpdates',
    url: 'https://www.mangaupdates.com',
    via: 'MangaUpdates API',
    description: 'Release frequency, scanlation groups, and community-sourced recommendations.',
    features: ['Release schedule', 'Scanlation groups', 'Community recs'],
    status: 'live' as const,
    color: '#e8870a',
  },
  {
    name: 'MangaDex',
    url: 'https://mangadex.org',
    via: 'Direct links',
    description: 'Read button on each card links directly to the closest MangaDex search result.',
    features: ['Read links from cards'],
    status: 'live' as const,
    color: '#f47041',
  },
  {
    name: 'MangaPlus',
    url: 'https://mangaplus.shueisha.co.jp',
    via: 'MangaPlus feed',
    description: 'Official Shueisha chapters — latest releases from the MangaPlus platform.',
    features: ['Latest chapter feed'],
    status: 'live' as const,
    color: '#e40026',
  },
  {
    name: 'Shonen Jump',
    url: 'https://www.viz.com/shonenjump',
    via: 'VIZ feed',
    description: 'Weekly Shonen Jump simulpub series feed.',
    features: ['Weekly release feed'],
    status: 'live' as const,
    color: '#f68b1e',
  },
  {
    name: 'Webtoons',
    url: 'https://www.webtoons.com',
    via: 'Webtoons feed',
    description: 'Latest Webtoon series and episodes from the official platform.',
    features: ['Webtoon episode feed'],
    status: 'live' as const,
    color: '#00d564',
  },
  {
    name: 'Goodreads',
    url: 'https://www.goodreads.com',
    via: 'Goodreads API',
    description: 'Book and manga ratings from Goodreads — surfaced in search results.',
    features: ['Ratings in search'],
    status: 'live' as const,
    color: '#553b08',
  },
  {
    name: 'Anime News Network',
    url: 'https://www.animenewsnetwork.com',
    via: 'ANN API',
    description: 'Fallback anime adaptation detection when AniList hasn\'t updated yet.',
    features: ['Anime adaptation signals'],
    status: 'live' as const,
    color: '#005bac',
  },
]

const STATUS_CONFIG = {
  live:        { label: 'Live',        icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  in_progress: { label: 'In progress', icon: Zap,         color: 'text-yellow-400',  bg: 'bg-yellow-500/10 border-yellow-500/20' },
  pending:     { label: 'Requested',   icon: Clock,       color: 'text-zinc-400',    bg: 'bg-zinc-700/30 border-zinc-700' },
  declined:    { label: 'Declined',    icon: XCircle,     color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/20' },
}

export default function SourcesPage() {
  const [requests, setRequests] = useState<SourceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [votedIds, setVotedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('yomu_voted_sources') ?? '[]')) } catch { return new Set() }
  })
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    supabase.from('source_requests')
      .select('*')
      .order('votes', { ascending: false })
      .then(({ data }) => { if (data) setRequests(data as SourceRequest[]); setLoading(false) })
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
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Linked sources</h2>
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

        {/* Request form */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Request a source</h2>
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
            Community requests
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
                    {/* Vote */}
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

                    {/* Content */}
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
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}
    </main>
  )
}
