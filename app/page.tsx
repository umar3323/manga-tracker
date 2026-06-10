'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { supabase, type Manga, type MangaStatus, type Author } from '@/lib/supabase'
import { fetchMangaInfo, getAnimeAdaptations, searchMangaWithFilters, searchAnimeWithFiltersTyped, type JikanSearchResult } from '@/lib/jikan'
import LibraryToolbar from '@/components/LibraryToolbar'
import LibraryFilters from '@/components/LibraryFilters'
import LibraryCard from '@/components/LibraryCard'
import TrendingSection from '@/components/TrendingSection'
import DiscoverySection from '@/components/DiscoverySection'
import ReleaseCalendar from '@/components/ReleaseCalendar'
import SessionTimer, { type ActiveSession } from '@/components/SessionTimer'
import type { Arc } from '@/components/ArcEditor'
import type { Recommendation } from '@/app/api/recommend/route'
import MangaFact from '@/components/MangaFact'
import CompletionModal from '@/components/CompletionModal'
import DateAttributionModal, { type DateAttribution } from '@/components/DateAttributionModal'
import DeepSearchModal from '@/components/DeepSearchModal'
import { getStatus as getAnimeStatus, type AnimeRow } from '@/lib/anime-data'
import { DetailModal } from '@/components/DetailView'
import {
  AuthorModal,
  StudioModal,
  RecommendationModal,
  RecommendationsListModal,
  SyncResultsModal,
  ShelfPicker,
  ShareModal,
  TakeoutImportModal,
  HealthCheckModal,
} from '@/components/LibraryModals'
import {
  Tv, Timer, Play, Clapperboard, BookOpen,
  Zap, Sword, Cloud, Moon, Flame, Heart,
  GitMerge, X,
} from 'lucide-react'
import { useLibraryStore } from '@/lib/store'
import QuickPeekSheet from '@/components/QuickPeekSheet'

// EditableNumber, RelationMergeButton, SeriesPanel, and DetailModal are now in components/DetailView.tsx
// AuthorModal, StudioModal, RecommendationModal, ShelfPicker, ShareModal,
// TakeoutImportModal, HealthCheckModal are now in components/LibraryModals.tsx

const STATUS_LABELS: Record<MangaStatus, string> = {
  reading:      'Reading',
  completed:    'Completed',
  on_hold:      'On Hold',
  dropped:      'Dropped',
  plan_to_read: 'Plan To Read',
  watching:     'Watching',
  unwatched:    'Unwatched',
}

type SortKey = 'last_read' | 'title' | 'chapter'

export default function Home() {
  const { mangaList: manga, setLibrary, activePeekId, openPeek, openDetail: openDetailStore, closeDetail, patchEntry } = useLibraryStore()
  const activeDetailId = useLibraryStore(s => s.activeDetailId)
  const selectedManga = useLibraryStore(s => s.mangaList.find(m => m.id === s.activeDetailId) ?? null)
  const setManga = (updater: Manga[] | ((prev: Manga[]) => Manga[])) => {
    const next = typeof updater === 'function' ? updater(manga) : updater
    useLibraryStore.getState().setLibrary(next)
  }
  const [filter, setFilter] = useState<MangaStatus | 'all' | 'duplicates'>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('last_read')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [newTitle, setNewTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [addSuggestions, setAddSuggestions] = useState<JikanSearchResult[]>([])
  const [showAddSuggestions, setShowAddSuggestions] = useState(false)
  const [addSuggestLoading, setAddSuggestLoading] = useState(false)
  const [selectedJikan, setSelectedJikan] = useState<JikanSearchResult | null>(null)
  const [addContentType, setAddContentType] = useState<'manga' | 'anime' | 'movie'>('manga')
  const addSuggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const addBarRef = useRef<HTMLDivElement>(null)
  // Quick-details fields shown after a title is confirmed
  const [addShowDetails, setAddShowDetails] = useState(false)
  const [addDetailStatus, setAddDetailStatus] = useState<MangaStatus | null>(null)
  const [addDetailProgress, setAddDetailProgress] = useState<string>('')
  const [addDetailDate, setAddDetailDate] = useState<string>('')
  const [addDetailNotes, setAddDetailNotes] = useState<string>('')
  const [addDetailRating, setAddDetailRating] = useState<'up' | 'down' | null>(null)
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set())
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loadingRec, setLoadingRec] = useState(false)
  const [recError, setRecError] = useState('')
  const [showRecModal, setShowRecModal] = useState(false)
  const [selectedAuthor, setSelectedAuthor] = useState<Author | null>(null)
  const [selectedStudio, setSelectedStudio] = useState<Author | null>(null)
  const [toast, setToast] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncResults, setSyncResults] = useState<{ updated: number; results: { title: string; changes: string[] }[]; timestamp: string } | null>(null)
  const [notifications, setNotifications] = useState<{ id: string; title: string; new_chapters: number; previous_chapters: number }[]>([])
  const [shelfPickerManga, setShelfPickerManga] = useState<Manga | null>(null)
  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null)
  const [mood, setMood] = useState<string | null>(null)

  // ── Incremental rendering ──────────────────────────────────────────────
  // Only render the first N cards in the DOM; an IntersectionObserver sentinel
  // at the bottom of the grid loads the next batch when it scrolls into view.
  // This keeps the DOM lean (≈40 nodes max) without any extra dependency.
  const INITIAL_BATCH = 40
  const BATCH_SIZE    = 20
  const [renderCount, setRenderCount] = useState(INITIAL_BATCH)
  const gridSentinelRef = useRef<HTMLDivElement>(null)

  // Reset to first batch whenever the visible set changes
  useEffect(() => { setRenderCount(INITIAL_BATCH) }, [filter, typeFilter, search, mood])

  // Load next batch when sentinel scrolls into view
  useEffect(() => {
    const el = gridSentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setRenderCount(c => c + BATCH_SIZE) },
      { rootMargin: '400px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const [watchPrompt, setWatchPrompt] = useState<{ id: string; epInput: string } | null>(null)
  const [completionManga, setCompletionManga] = useState<Manga | null>(null)
  const [progressPrompt, setProgressPrompt] = useState<{
    id: string; delta: number; current: number; type: 'chapter' | 'episode'; title: string
  } | null>(null)
  const sessionAttrRef = useRef<DateAttribution | null>(null)
  const [pacePerDay, setPacePerDay] = useState(0)
  const [shareModal, setShareModal] = useState(false)
  const [shareToken, setShareToken] = useState<string | null>(null)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [activeSession, setActiveSession] = useState<ActiveSession | null>(null)
  const [arcsMap, setArcsMap] = useState<Record<string, Arc[]>>({})
  const [rereadCounts, setRereadCounts] = useState<Record<string, number>>({})
  const [rewatchCounts, setRewatchCounts] = useState<Record<string, number>>({})
  const [expandedSynopsis, setExpandedSynopsis] = useState<Set<string>>(new Set())
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [showHealthCheck, setShowHealthCheck] = useState(false)
  const [showTakeoutImport, setShowTakeoutImport] = useState(false)
  const [deepSelectMode, setDeepSelectMode] = useState(false)
  const [deepSelected, setDeepSelected] = useState<Set<string>>(new Set())
  const [deepSearchTarget, setDeepSearchTarget] = useState<Manga | null>(null)
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set())

  // Sync dismissedPairs from localStorage + Supabase user metadata on mount
  useEffect(() => {
    let local: Set<string> = new Set()
    try { local = new Set(JSON.parse(localStorage.getItem('yomu_dismissed_pairs') ?? '[]')) } catch {}
    if (local.size > 0) setDismissedPairs(local)
    supabase.auth.getUser().then(({ data }) => {
      const remote: string[] = data?.user?.user_metadata?.dismissed_pairs ?? []
      if (remote.length === 0) return
      setDismissedPairs(prev => {
        const merged = new Set([...prev, ...remote])
        try { localStorage.setItem('yomu_dismissed_pairs', JSON.stringify([...merged])) } catch {}
        return merged
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Cover fetch tracking — prevents re-fetching on every render
  const fetchedIds = useRef<Set<string>>(new Set())
  // Notes debounce timers
  const notesTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const toastTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel pending notes saves and toast on unmount
  useEffect(() => {
    return () => {
      notesTimers.current.forEach(t => clearTimeout(t))
      if (toastTimer.current) clearTimeout(toastTimer.current)
    }
  }, [])

  const showToast = (msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(''), 3000)
  }

  const [animeList, setAnimeList] = useState<AnimeRow[]>([])

  const fetchManga = useCallback(async () => {
    const [{ data, error }, { data: al }] = await Promise.all([
      supabase.from('manga_list').select('*'),
      supabase.from('anime_list').select('id,title,total_watch_hours,last_watched,is_movie'),
    ])
    if (error) { showToast('Failed To Load Manga List'); setLoading(false); return }
    if (data) { setLibrary(data as Manga[]) }
    if (al) setAnimeList(al as AnimeRow[])
    setLoading(false)
    // Fetch unseen chapter notifications
    const { data: notifs } = await supabase
      .from('chapter_notifications')
      .select('id, title, new_chapters, previous_chapters')
      .eq('seen', false)
      .order('created_at', { ascending: false })
    if (notifs?.length) setNotifications(notifs)
  }, [])

  useEffect(() => { fetchManga() }, [fetchManga])

  // Re-fetch when user switches back to this tab — ensures episode-count updates from the
  // extension (which fire while watching in another tab) are reflected immediately on return.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fetchManga() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [fetchManga])

  // Periodic refresh every 60s while the tab is visible — catches extension-logged
  // episode updates when YOMU is already in the foreground (visibilitychange won't fire).
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') fetchManga()
    }, 60_000)
    return () => clearInterval(id)
  }, [fetchManga])

  // Pace tracking: avg chapters/day over last 30 days
  useEffect(() => {
    const ago = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    supabase.from('reading_log').select('chapters_read').gte('logged_at', ago)
      .then(({ data }) => {
        if (!data?.length) return
        const total = data.reduce((s, l) => s + l.chapters_read, 0)
        setPacePerDay(total / 30)
      })
    // Public share token
    supabase.from('public_shares').select('token, enabled').limit(1).single()
      .then(({ data }) => { if (data) { setShareToken(data.token); setShareEnabled(data.enabled) } })
    // Bulk fetch all arcs for arc-aware progress display
    supabase.from('arcs').select('*').order('chapter_start')
      .then(({ data }) => {
        if (!data) return
        const map: Record<string, Arc[]> = {}
        for (const arc of data as Arc[]) {
          if (!map[arc.manga_id]) map[arc.manga_id] = []
          map[arc.manga_id].push(arc)
        }
        setArcsMap(map)
      })
    // Re-read counts per manga
    supabase.from('rereads').select('manga_id')
      .then(({ data }) => {
        if (!data) return
        const counts: Record<string, number> = {}
        for (const r of data as { manga_id: string }[]) {
          counts[r.manga_id] = (counts[r.manga_id] ?? 0) + 1
        }
        setRereadCounts(counts)
      })
    // Re-watch counts per manga
    supabase.from('rewatches').select('manga_id')
      .then(({ data }) => {
        if (!data) return
        const counts: Record<string, number> = {}
        for (const r of data as { manga_id: string }[]) {
          counts[r.manga_id] = (counts[r.manga_id] ?? 0) + 1
        }
        setRewatchCounts(counts)
      })
  }, [])

  // Fetch missing covers — guard against concurrent runs with a ref flag
  const fetchRunning = useRef(false)
  useEffect(() => {
    const missing = manga.filter(m => (!m.cover_url || !m.synopsis) && !fetchedIds.current.has(m.id))
    if (missing.length === 0 || fetchRunning.current) return

    fetchRunning.current = true
    ;(async () => {
      for (const m of missing) {
        fetchedIds.current.add(m.id)
        const info = await fetchMangaInfo(m.title)
        if (info.coverUrl || info.totalChapters || info.synopsis) {
          const updates: Partial<Manga> = {}
          if (info.coverUrl) updates.cover_url = info.coverUrl
          if (info.totalChapters) updates.total_chapters = info.totalChapters
          if (info.synopsis && !m.synopsis) updates.synopsis = info.synopsis
          await supabase.from('manga_list').update(updates).eq('id', m.id)
          setManga(prev => prev.map(x => x.id === m.id ? { ...x, ...updates } : x))
        }
        await new Promise(r => setTimeout(r, 400))
      }
      fetchRunning.current = false
    })()
  }, [manga])

  const commitChapterProgress = useCallback(async (id: string, delta: number, current: number, attr: DateAttribution) => {
    const next = Math.max(0, current + delta)
    const now = new Date().toISOString()
    const timestamp = attr.precision === 'exact' && attr.date ? new Date(attr.date).toISOString() : now
    const patch = { current_chapter: next, last_read_at: timestamp }

    await patchEntry(id, patch, showToast)

    if (delta > 0) {
      const logRow: Record<string, unknown> = {
        manga_id: id,
        chapters_read: delta,
        media_type: 'manga',
        date_precision: attr.precision,
      }
      if (attr.precision === 'exact') logRow.progress_date = attr.date
      if (attr.precision === 'year_only') logRow.progress_year = attr.year
      await supabase.from('reading_log').insert(logRow)
    }
  }, [patchEntry, showToast])

  const updateChapter = (id: string, delta: number, current: number) => {
    if (delta <= 0) {
      commitChapterProgress(id, delta, current, { precision: 'unknown' })
      return
    }
    if (sessionAttrRef.current) {
      commitChapterProgress(id, delta, current, sessionAttrRef.current)
      return
    }
    const m = manga.find(x => x.id === id)
    setProgressPrompt({ id, delta, current, type: 'chapter', title: m?.title ?? '' })
  }

  const updateStatus = async (id: string, status: MangaStatus) => {
    // Intercept "watching" — ask for episode count first
    if (status === 'watching') {
      const m = manga.find(m => m.id === id)
      setWatchPrompt({ id, epInput: String(m?.episodes_watched ?? 0) })
      return
    }
    const prev_status = manga.find(m => m.id === id)?.status
    const now = new Date().toISOString()
    setManga(prev => prev.map(m => m.id === id ? { ...m, status, last_read_at: now } : m))
    const { error } = await supabase.from('manga_list').update({ status, last_read_at: now }).eq('id', id)
    if (error) {
      showToast('Failed To Update Status')
      if (prev_status) setManga(prev => prev.map(m => m.id === id ? { ...m, status: prev_status } : m))
      return
    }
    // Intercept "completed" — show ceremony modal
    if (status === 'completed' && prev_status !== 'completed') {
      const m = manga.find(m => m.id === id)
      if (m) setCompletionManga({ ...m, status: 'completed' })
    }
  }

  const confirmWatching = async () => {
    if (!watchPrompt) return
    const ep = Math.max(0, parseInt(watchPrompt.epInput, 10) || 0)
    const m = manga.find(m => m.id === watchPrompt.id)
    if (!m) return
    setManga(prev => prev.map(x => x.id === watchPrompt.id
      ? { ...x, status: 'watching', episodes_watched: ep } : x))
    await supabase.from('manga_list')
      .update({ status: 'watching', episodes_watched: ep })
      .eq('id', watchPrompt.id)
    if (ep > 0) await supabase.from('reading_log').insert({ manga_id: watchPrompt.id, chapters_read: 0 })
    showToast(`Now Watching — Ep. ${ep} Logged`)
    setWatchPrompt(null)
  }

  // Debounced notes save — fires 500ms after last keystroke
  const updateNotes = (id: string, notes: string) => {
    setManga(prev => prev.map(m => m.id === id ? { ...m, notes } : m))
    const existing = notesTimers.current.get(id)
    if (existing) clearTimeout(existing)
    const timer = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showToast('Failed To Save Note'); return }
      const { error } = await supabase.from('manga_list').update({ notes }).eq('id', id).eq('user_id', user.id)
      if (error) showToast('Failed To Save Note')
      notesTimers.current.delete(id)
    }, 500)
    notesTimers.current.set(id, timer)
  }

  const runSync = async () => {
    setSyncing(true)
    setSyncResults(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Sync Failed'); return }
      setSyncResults(data)
      showToast(data.updated > 0 ? `Sync Complete — ${data.updated} Updates` : 'Sync Complete — Everything Up To Date')
    } catch {
      showToast('Sync Failed — Check Your Connection')
    } finally {
      setSyncing(false)
    }
  }

  const syncEntry = async (id: string) => {
    setSyncing(true)
    try {
      const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      const data = await res.json()
      if (!res.ok) { showToast(data.error ?? 'Sync Failed'); return }
      // Refresh library after sync so new anime_mal_id etc. are reflected
      const { data: updated } = await supabase.from('manga_list').select('*').eq('id', id).single()
      if (updated) {
        setManga(prev => prev.map(m => m.id === id ? { ...m, ...updated } : m))
      }
      showToast('Sync Complete')
    } catch {
      showToast('Sync Failed — Check Your Connection')
    } finally {
      setSyncing(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const exportCSV = () => {
    const headers = ['Title', 'Status', 'Current Chapter', 'Total Chapters', 'Has Anime', 'Episodes Watched', 'Last Read', 'Notes']
    const rows = manga.map(m => [
      `"${m.title.replace(/"/g, '""')}"`,
      m.status,
      m.current_chapter,
      m.total_chapters ?? '',
      m.has_anime ? 'Yes' : 'No',
      m.episodes_watched,
      m.last_read_at ? new Date(m.last_read_at).toLocaleDateString() : '',
      `"${(m.notes ?? '').replace(/"/g, '""')}"`,
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    triggerDownload(new Blob([csv], { type: 'text/csv' }), `yomu-${new Date().toISOString().slice(0, 10)}.csv`)
  }

  // MAL XML format — compatible with MyAnimeList import
  // Generates two files if both manga and anime entries exist (MAL has separate import pages)
  const exportMALXML = () => {
    const date = new Date().toISOString().slice(0, 10)
    const scoreOf = (m: { score: number | null; user_rating: 'up' | 'down' | null }) =>
      m.score != null ? Math.round(m.score) : m.user_rating === 'up' ? 8 : m.user_rating === 'down' ? 4 : 0
    const finishDate = (m: { status: string; last_read_at: string | null }) =>
      m.status === 'completed' && m.last_read_at ? m.last_read_at.slice(0, 10) : '0000-00-00'

    const isAnime = (m: { content_type: string | null }) =>
      m.content_type === 'anime' || m.content_type === 'movie'

    const mangaEntries = manga.filter(m => !isAnime(m))
    const animeEntries = manga.filter(m => isAnime(m))

    if (mangaEntries.length > 0) {
      const mangaStatusMap: Record<string, string> = {
        reading: 'Reading', completed: 'Completed', on_hold: 'On-Hold',
        dropped: 'Dropped', plan_to_read: 'Plan To Read', watching: 'Reading', unwatched: 'Plan To Read',
      }
      const entries = mangaEntries.map(m => `  <manga>
    <manga_mangadb_id>${m.mal_id ?? 0}</manga_mangadb_id>
    <manga_title><![CDATA[${m.title}]]></manga_title>
    <manga_volumes>0</manga_volumes>
    <manga_chapters>${m.current_chapter}</manga_chapters>
    <my_id>0</my_id>
    <my_read_volumes>0</my_read_volumes>
    <my_read_chapters>${m.current_chapter}</my_read_chapters>
    <my_start_date>0000-00-00</my_start_date>
    <my_finish_date>${finishDate(m)}</my_finish_date>
    <my_score>${scoreOf(m)}</my_score>
    <my_status>${mangaStatusMap[m.status] ?? 'Reading'}</my_status>
    <my_reread_value></my_reread_value>
    <my_comments><![CDATA[${m.notes ?? ''}]]></my_comments>
    <update_on_import>1</update_on_import>
  </manga>`).join('\n')
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<myanimelist>\n  <myinfo>\n    <user_export_type>2</user_export_type>\n  </myinfo>\n${entries}\n</myanimelist>`
      triggerDownload(new Blob([xml], { type: 'application/xml' }), `yomu-mal-manga-${date}.xml`)
    }

    if (animeEntries.length > 0) {
      const animeStatusMap: Record<string, string> = {
        watching: 'Watching', completed: 'Completed', on_hold: 'On-Hold',
        dropped: 'Dropped', unwatched: 'Plan to Watch', plan_to_read: 'Plan to Watch', reading: 'Watching',
      }
      const entries = animeEntries.map(m => `  <anime>
    <series_animedb_id>${m.anime_mal_id ?? m.mal_id ?? 0}</series_animedb_id>
    <series_title><![CDATA[${m.anime_title ?? m.title}]]></series_title>
    <my_id>0</my_id>
    <my_watched_episodes>${m.episodes_watched}</my_watched_episodes>
    <my_start_date>0000-00-00</my_start_date>
    <my_finish_date>${finishDate(m)}</my_finish_date>
    <my_score>${scoreOf(m)}</my_score>
    <my_status>${animeStatusMap[m.status] ?? 'Watching'}</my_status>
    <my_rewatching>0</my_rewatching>
    <my_rewatching_ep>0</my_rewatching_ep>
    <my_comments><![CDATA[${m.notes ?? ''}]]></my_comments>
    <update_on_import>1</update_on_import>
  </anime>`).join('\n')
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<myanimelist>\n  <myinfo>\n    <user_export_type>1</user_export_type>\n  </myinfo>\n${entries}\n</myanimelist>`
      triggerDownload(new Blob([xml], { type: 'application/xml' }), `yomu-mal-anime-${date}.xml`)
    }
  }

  // AniList JSON format — compatible with AniList import
  const exportAniListJSON = () => {
    const mangaStatusMap: Record<string, string> = {
      reading: 'CURRENT', completed: 'COMPLETED', on_hold: 'PAUSED',
      dropped: 'DROPPED', plan_to_read: 'PLANNING', watching: 'CURRENT', unwatched: 'PLANNING',
    }
    const animeStatusMap: Record<string, string> = {
      watching: 'CURRENT', completed: 'COMPLETED', on_hold: 'PAUSED',
      dropped: 'DROPPED', unwatched: 'PLANNING', plan_to_read: 'PLANNING', reading: 'CURRENT',
    }
    const scoreOf = (m: { score: number | null; user_rating: 'up' | 'down' | null }) =>
      m.score != null ? Math.round(m.score) : m.user_rating === 'up' ? 8 : m.user_rating === 'down' ? 4 : 0
    const isAnime = (m: { content_type: string | null }) =>
      m.content_type === 'anime' || m.content_type === 'movie'

    const mangaLists: Record<string, object[]> = {}
    const animeLists: Record<string, object[]> = {}

    for (const m of manga) {
      if (isAnime(m)) {
        const s = animeStatusMap[m.status] ?? 'CURRENT'
        if (!animeLists[s]) animeLists[s] = []
        animeLists[s].push({
          mediaId: m.anime_mal_id ?? m.mal_id ?? null,
          title: m.anime_title ?? m.title,
          status: s,
          score: scoreOf(m),
          progress: m.episodes_watched,
          completedAt: m.status === 'completed' && m.last_read_at ? m.last_read_at.slice(0, 10) : null,
          notes: m.notes ?? '',
          genres: m.genres,
        })
      } else {
        const s = mangaStatusMap[m.status] ?? 'CURRENT'
        if (!mangaLists[s]) mangaLists[s] = []
        mangaLists[s].push({
          mediaId: m.mal_id ?? null,
          title: m.title,
          status: s,
          score: scoreOf(m),
          progress: m.current_chapter,
          progressVolumes: 0,
          completedAt: m.status === 'completed' && m.last_read_at ? m.last_read_at.slice(0, 10) : null,
          notes: m.notes ?? '',
          genres: m.genres,
        })
      }
    }
    const json = JSON.stringify({
      manga: mangaLists,
      anime: animeLists,
      exportedAt: new Date().toISOString(),
      source: 'YOMU',
    }, null, 2)
    triggerDownload(new Blob([json], { type: 'application/json' }), `yomu-anilist-${new Date().toISOString().slice(0, 10)}.json`)
  }

  const toggleShare = async () => {
    if (!shareToken) {
      const { data } = await supabase.from('public_shares').insert({}).select('token, enabled').single()
      if (data) { setShareToken(data.token); setShareEnabled(true) }
    } else {
      const next = !shareEnabled
      await supabase.from('public_shares').update({ enabled: next }).eq('token', shareToken)
      setShareEnabled(next)
    }
  }

  const finishEstimate = (m: Manga): string | null => {
    if (!pacePerDay || !m.total_chapters || m.current_chapter >= m.total_chapters) return null
    const days = Math.ceil((m.total_chapters - m.current_chapter) / pacePerDay)
    if (days > 365) return null
    if (days < 1) return 'today'
    if (days < 7) return `~${days}d`
    if (days < 60) return `~${Math.ceil(days / 7)}w`
    return `~${Math.ceil(days / 30)}mo`
  }

  const startSession = (m: Manga) => {
    setActiveSession({
      mangaId: m.id,
      mangaTitle: m.title,
      startChapter: m.current_chapter,
      startTime: Date.now(),
      coverUrl: m.cover_url,
    })
  }

  const endSession = useCallback(async (chaptersRead: number, durationMinutes: number) => {
    if (!activeSession) return
    const now = new Date().toISOString()
    const todayDate = now.slice(0, 10)
    // Update chapter count with today's exact date (session = real-time, date is known)
    if (chaptersRead > 0) {
      const m = manga.find(m => m.id === activeSession.mangaId)
      if (m) await commitChapterProgress(activeSession.mangaId, chaptersRead, m.current_chapter, { precision: 'exact', date: todayDate })
    }
    // Also log duration separately
    await supabase.from('reading_log').insert({
      manga_id: activeSession.mangaId,
      chapters_read: chaptersRead,
      duration_minutes: durationMinutes,
      logged_at: now,
      media_type: 'manga',
      date_precision: 'exact',
      progress_date: todayDate,
    })
    showToast(`Session Logged — ${chaptersRead} Ch In ${durationMinutes} Min`)
    setActiveSession(null)
  }, [activeSession, manga, commitChapterProgress, showToast])

  const dismissNotifications = async () => {
    const ids = notifications.map(n => n.id)
    setNotifications([])
    await supabase.from('chapter_notifications').update({ seen: true }).in('id', ids)
  }

  const commitEpisodeProgress = useCallback(async (id: string, delta: number, current: number, attr: DateAttribution) => {
    const next = Math.max(0, current + delta)
    const now = new Date().toISOString()
    const timestamp = attr.precision === 'exact' && attr.date ? new Date(attr.date).toISOString() : now
    const patch = { episodes_watched: next, last_read_at: timestamp }

    await patchEntry(id, patch, showToast)

    if (delta > 0) {
      const logRow: Record<string, unknown> = {
        manga_id: id,
        chapters_read: 0,
        media_type: 'anime',
        date_precision: attr.precision,
      }
      if (attr.precision === 'exact') logRow.progress_date = attr.date
      if (attr.precision === 'year_only') logRow.progress_year = attr.year
      await supabase.from('reading_log').insert(logRow)
    }
  }, [patchEntry, showToast])

  const updateEpisodes = (id: string, delta: number, current: number) => {
    if (delta <= 0) {
      commitEpisodeProgress(id, delta, current, { precision: 'unknown' })
      return
    }
    if (sessionAttrRef.current) {
      commitEpisodeProgress(id, delta, current, sessionAttrRef.current)
      return
    }
    const m = manga.find(x => x.id === id)
    setProgressPrompt({ id, delta, current, type: 'episode', title: m?.title ?? '' })
  }

  // Community totals — write to manga_list + community_totals table
  const updateTotalChapters = async (id: string, n: number, malId?: number | null, contentType?: string | null) => {
    await supabase.from('manga_list').update({ total_chapters: n }).eq('id', id)
    setManga(prev => prev.map(x => x.id === id ? { ...x, total_chapters: n } : x))
    if (malId) {
      await fetch('/api/community-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: malId, content_type: contentType ?? 'manga', total_chapters: n }),
      })
      showToast('Total chapters shared with community ✓')
    }
  }

  const updateTotalEpisodes = async (id: string, n: number, malId?: number | null, contentType?: string | null) => {
    await supabase.from('manga_list').update({ total_episodes: n }).eq('id', id)
    setManga(prev => prev.map(x => x.id === id ? { ...x, total_episodes: n } : x))
    if (malId) {
      await fetch('/api/community-totals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mal_id: malId, content_type: contentType ?? 'anime', total_episodes: n }),
      })
      showToast('Total episodes shared with community ✓')
    }
  }

  const confirmDelete = (id: string) => setPendingDelete(id)
  const cancelDelete = () => setPendingDelete(null)

  const deleteManga = async (id: string) => {
    setPendingDelete(null)
    const removed = manga.find(m => m.id === id)
    setManga(prev => prev.filter(m => m.id !== id))
    const { error } = await supabase.from('manga_list').delete().eq('id', id)
    if (error) {
      showToast('Failed To Delete')
      if (removed) setManga(prev => [...prev, removed].sort((a, b) => a.title.localeCompare(b.title)))
    }
  }

  const resetAddDetails = () => {
    setAddShowDetails(false)
    setAddDetailStatus(null)
    setAddDetailProgress('')
    setAddDetailDate('')
    setAddDetailNotes('')
    setAddDetailRating(null)
  }

  const addManga = async () => {
    if (!selectedJikan && !newTitle.trim()) return
    setAdding(true)
    try {
      const isAnime = addContentType === 'anime'
      const isMovie = addContentType === 'movie'
      let insertPayload: Record<string, unknown>
      if (selectedJikan) {
        if (isMovie) {
          insertPayload = {
            mal_id: selectedJikan.mal_id,
            title: selectedJikan.title,
            current_chapter: 0,
            episodes_watched: 0,
            status: 'unwatched',
            content_type: 'movie',
            cover_url: selectedJikan.cover_url ?? null,
            total_chapters: null,
            total_episodes: null,
            authors: selectedJikan.authors ?? [],
            genres: selectedJikan.genres ?? [],
            has_anime: false,
            synopsis: selectedJikan.synopsis ?? null,
            score: selectedJikan.score ?? null,
          }
        } else if (isAnime) {
          // Adding anime directly — store as anime content type
          insertPayload = {
            mal_id: null,
            anime_mal_id: selectedJikan.mal_id,
            title: selectedJikan.title,
            current_chapter: 0,
            episodes_watched: 0,
            status: 'watching',
            content_type: 'anime',
            cover_url: selectedJikan.cover_url ?? null,
            total_chapters: null,
            total_episodes: (selectedJikan as JikanSearchResult & { episodes?: number | null }).episodes ?? null,
            authors: selectedJikan.authors ?? [],
            genres: selectedJikan.genres ?? [],
            has_anime: true,
            anime_title: selectedJikan.title,
          }
        } else {
          // Adding manga — fetch anime adaptations too
          const adaptations = selectedJikan.mal_id ? await getAnimeAdaptations(selectedJikan.mal_id) : []
          const anim = adaptations[0]
          insertPayload = {
            mal_id: selectedJikan.mal_id,
            title: selectedJikan.title,
            current_chapter: 0,
            status: 'reading',
            content_type: (selectedJikan as JikanSearchResult & { media_type?: string }).media_type === 'anime' ? 'anime' : 'manga',
            cover_url: selectedJikan.cover_url ?? null,
            total_chapters: selectedJikan.total_chapters ?? null,
            authors: selectedJikan.authors ?? [],
            genres: selectedJikan.genres ?? [],
            has_anime: !!anim,
            anime_mal_id: anim?.mal_id ?? null,
            anime_title: anim?.title ?? null,
            total_episodes: anim?.episodes ?? null,
          }
        }
      } else {
        insertPayload = {
          title: newTitle.trim(),
          current_chapter: 0,
          status: isMovie ? 'unwatched' : isAnime ? 'watching' : 'reading',
          content_type: isMovie ? 'movie' : isAnime ? 'anime' : 'manga',
          ...(isAnime ? { episodes_watched: 0, has_anime: true } : {}),
          ...(isMovie ? { has_anime: false } : {}),
        }
      }
      // Apply quick-detail overrides from the expanded details panel
      if (addDetailStatus) insertPayload.status = addDetailStatus
      const progressNum = parseInt(addDetailProgress, 10)
      if (!isNaN(progressNum) && progressNum > 0) {
        if (isAnime || isMovie) insertPayload.episodes_watched = progressNum
        else insertPayload.current_chapter = progressNum
      }
      if (addDetailNotes.trim()) insertPayload.notes = addDetailNotes.trim()
      if (addDetailRating) insertPayload.user_rating = addDetailRating
      if (addDetailDate) insertPayload.last_read_at = new Date(addDetailDate).toISOString()

      const { data, error } = await supabase
        .from('manga_list')
        .insert(insertPayload)
        .select()
        .single()
      if (error?.code === '23505') { showToast(`"${insertPayload.title}" Is Already In Your List`); setAdding(false); return }
      if (error) { showToast('Failed To Add'); return }
      if (data) {
        const newEntry = data as Manga
        setManga(prev => [...prev, newEntry])
        setNewTitle('')
        setSelectedJikan(null)
        setShowAdd(false)
        setAddSuggestions([])
        setShowAddSuggestions(false)
        resetAddDetails()
        // Check community totals to fill in missing totals (runs async after add)
        const malIdForCommunity = newEntry.mal_id ?? newEntry.anime_mal_id
        if (malIdForCommunity) {
          const ct = newEntry.content_type === 'anime' ? 'anime' : 'manga'
          fetch(`/api/community-totals?mal_id=${malIdForCommunity}&content_type=${ct}`)
            .then(r => r.json())
            .then(async (communityData: { total_chapters?: number | null; total_episodes?: number | null } | null) => {
              if (!communityData) return
              const updates: Partial<Manga> = {}
              if (communityData.total_chapters && !newEntry.total_chapters) updates.total_chapters = communityData.total_chapters
              if (communityData.total_episodes && !newEntry.total_episodes) updates.total_episodes = communityData.total_episodes
              if (Object.keys(updates).length > 0) {
                await supabase.from('manga_list').update(updates).eq('id', newEntry.id)
                setManga(prev => prev.map(x => x.id === newEntry.id ? { ...x, ...updates } : x))
              }
            }).catch(() => {})
        }
        if (!selectedJikan && !isAnime) {
          fetchMangaInfo(newEntry.title).then(async info => {
            if (info.coverUrl || info.totalChapters) {
              const updates: Partial<Manga> = {}
              if (info.coverUrl) updates.cover_url = info.coverUrl
              if (info.totalChapters) updates.total_chapters = info.totalChapters
              await supabase.from('manga_list').update(updates).eq('id', newEntry.id)
              setManga(prev => prev.map(x => x.id === newEntry.id ? { ...x, ...updates } : x))
            }
          })
        }
      }
    } finally {
      setAdding(false)
    }
  }

  const getRecommendations = async () => {
    setLoadingRec(true)
    setRecommendations([])
    setRecError('')
    setShowRecModal(true)   // open modal immediately so user sees "Asking Claude…"
    try {
      // Include genres + ratings so the algorithm can match and weight preferences
      const payload = manga.map(m => ({
        title: m.title,
        current_chapter: m.current_chapter,
        status: m.status,
        genres: m.genres ?? [],
        mal_id: m.mal_id,
        user_rating: m.user_rating ?? null,
      }))

      // Anime ratings from localStorage
      // Build anime ratings map from Supabase data (user_rating overrides netflix_rating)
      const animeRatings: Record<string, 'up' | 'down'> = {}
      for (const a of animeList) {
        const r = a.user_rating ?? a.netflix_rating
        if (r) animeRatings[a.title] = r
      }

      // Send both right-swipes (liked) and left-swipes (disliked) from Discover history
      const [{ data: swipeData }, { data: dislikeData }] = await Promise.all([
        supabase.from('swipe_history').select('genres').eq('direction', 'right').limit(200),
        supabase.from('swipe_history').select('genres').eq('direction', 'left').limit(200),
      ])
      const likedGenres    = [...new Set((swipeData   ?? []).flatMap(s => s.genres))]
      const dislikedGenres = [...new Set((dislikeData ?? []).flatMap(s => s.genres))]
      const res = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manga: payload, likedGenres, dislikedGenres, animeRatings, watchedAnimeTitles: animeList.map(a => a.title) }),
      })
      const data = await res.json()
      if (!res.ok) { setRecError(data.error ?? 'Something went wrong'); return }
      const recs = data.recommendations ?? []
      if (recs.length === 0) {
        setRecError("Couldn't generate recommendations — please try again")
      } else {
        setRecommendations(recs)
      }
    } catch {
      setRecError('Network error — check your connection')
    } finally {
      setLoadingRec(false)
    }
  }

  const toggleNotes = (id: string) =>
    setExpandedNotes(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const toggleSynopsis = (id: string) =>
    setExpandedSynopsis(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const refreshCardInfo = async (m: Manga) => {
    setRefreshingId(m.id)
    try {
      const info = await fetchMangaInfo(m.title)
      const updates: Partial<Manga> = {}
      if (info.coverUrl) updates.cover_url = info.coverUrl
      if (info.totalChapters) updates.total_chapters = info.totalChapters
      if (info.synopsis) updates.synopsis = info.synopsis
      if (Object.keys(updates).length > 0) {
        await supabase.from('manga_list').update(updates).eq('id', m.id)
        setManga(prev => prev.map(x => x.id === m.id ? { ...x, ...updates } : x))
        showToast('Info Updated')
      } else {
        showToast('No New Info Found')
      }
    } catch {
      showToast('Failed To Fetch Info')
    } finally {
      setRefreshingId(null)
    }
  }

  // Duplicate detection across all manga
  const duplicatePairs = useMemo(() => {
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const tokens = (s: string) => new Set(normalize(s).split(/\s+/).filter(Boolean))
    const synTokens = (s: string | null) => s ? new Set(normalize(s).split(/\s+/).filter(Boolean)) : null
    const jaccard = (a: Set<string>, b: Set<string>) => {
      const overlap = [...a].filter(t => b.has(t)).length
      return overlap / (a.size + b.size - overlap)
    }
    const pairs: { a: Manga; b: Manga; score: number; reason: string }[] = []
    const seen = new Set<string>()
    for (let i = 0; i < manga.length; i++) {
      for (let j = i + 1; j < manga.length; j++) {
        const a = manga[i], b = manga[j]
        const key = [a.id, b.id].sort().join('|')
        if (seen.has(key) || dismissedPairs.has(key)) continue
        // Skip pairs already grouped in the same series
        if (a.series_id && a.series_id === b.series_id) continue
        const titleScore = jaccard(tokens(a.title), tokens(b.title))
        const aS = synTokens(a.synopsis), bS = synTokens(b.synopsis)
        const synScore = (aS && bS && aS.size > 10 && bS.size > 10) ? jaccard(aS, bS) : 0
        const best = Math.max(titleScore, synScore * 0.8)
        if (best >= 0.55) {
          seen.add(key)
          pairs.push({
            a, b, score: best,
            reason: titleScore >= synScore * 0.8 ? 'Similar title' : 'Similar synopsis',
          })
        }
      }
    }
    return pairs.sort((x, y) => y.score - x.score)
  }, [manga, dismissedPairs])

  const dismissPair = (a: Manga, b: Manga) => {
    const key = [a.id, b.id].sort().join('|')
    setDismissedPairs(prev => {
      const next = new Set(prev)
      next.add(key)
      const arr = [...next]
      try { localStorage.setItem('yomu_dismissed_pairs', JSON.stringify(arr)) } catch {}
      // Persist cross-device via Supabase user metadata
      supabase.auth.updateUser({ data: { dismissed_pairs: arr } }).catch(() => {})
      return next
    })
  }

  // Status rank: higher = more progress made
  const STATUS_RANK: Record<string, number> = {
    completed: 6, reading: 4, watching: 4, on_hold: 3, dropped: 2, plan_to_read: 1, unwatched: 1,
  }

  /** Pick the entry with the best overall progress to keep as the primary card. */
  const pickKeeper = (entries: Manga[]): Manga => {
    return entries.reduce((best, m) => {
      const bScore = (STATUS_RANK[best.status] ?? 0) * 1000
        + (best.current_chapter ?? 0) + (best.episodes_watched ?? 0)
      const mScore = (STATUS_RANK[m.status] ?? 0) * 1000
        + (m.current_chapter ?? 0) + (m.episodes_watched ?? 0)
      return mScore > bScore ? m : best
    })
  }

  /** Merge any number of entries into `keep`. Best-of-all logic across every field. */
  const mergeMultiple = async (keep: Manga, toRemove: Manga[]) => {
    const all = [keep, ...toRemove]

    // ── Progress fields (take max) ─────────────────────────────────────────
    const bestChapter    = Math.max(...all.map(m => m.current_chapter ?? 0))
    const bestEpisodes   = Math.max(...all.map(m => m.episodes_watched ?? 0))
    const bestWatchTime  = all.reduce((s, m) => s + (m.total_watch_time_minutes ?? 0), 0)

    // ── Status (most advanced) ─────────────────────────────────────────────
    const bestStatus = all.reduce((best, m) =>
      (STATUS_RANK[m.status] ?? 0) > (STATUS_RANK[best.status] ?? 0) ? m : best
    ).status

    // ── Timestamps (most recent) ───────────────────────────────────────────
    const lastReadDates = all.map(m => m.last_read_at).filter(Boolean) as string[]
    const bestLastRead  = lastReadDates.length
      ? lastReadDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
      : keep.last_read_at

    // ── Scalar fields (first non-null wins, prefer keeper) ─────────────────
    const firstOf = <T,>(field: keyof Manga): T | null =>
      (all.map(m => m[field]).find(v => v != null) ?? null) as T | null

    const bestTotal       = firstOf<number>('total_chapters')
    const bestTotalEp     = firstOf<number>('total_episodes')
    const bestSynopsis    = firstOf<string>('synopsis')
    const bestCover       = firstOf<string>('cover_url')
    const bestMalId       = firstOf<number>('mal_id')
    const bestAnimeMal    = firstOf<number>('anime_mal_id')
    const bestAnimeTitle  = firstOf<string>('anime_title')
    const bestRating      = firstOf<'up'|'down'>('user_rating')
    const bestScore       = firstOf<number>('score')
    const bestContentType = firstOf<Manga['content_type']>('content_type')
    const bestPubStatus   = firstOf<Manga['publishing_status']>('publishing_status')
    const bestSeriesId    = firstOf<string>('series_id')
    const bestSeriesPrim  = all.some(m => m.series_primary)
    const bestReviewMd    = firstOf<string>('review_md')
    const bestPublicRev   = firstOf<boolean>('is_public_review')

    // ── Array fields (union) ───────────────────────────────────────────────
    const genreSet  = new Set(all.flatMap(m => m.genres ?? []))
    const authorSet = new Set(all.flatMap(m => (m.authors ?? []).map((a: { name: string }) => JSON.stringify(a))))
    const bestGenres  = [...genreSet]
    const bestAuthors = [...authorSet].map(s => JSON.parse(s))

    // ── Booleans (OR) ─────────────────────────────────────────────────────
    const bestHasAnime   = all.some(m => m.has_anime)
    const bestAutoTracked = all.some(m => m.auto_tracked)

    // ── Notes (concat unique) ──────────────────────────────────────────────
    const notesParts: string[] = []
    for (const m of all) {
      if (m.notes?.trim() && !notesParts.some(p => p.includes(m.notes!.trim()))) {
        notesParts.push(m.notes.trim())
      }
    }
    const bestNotes = notesParts.join('\n---\n') || null

    const updates = {
      current_chapter:         bestChapter,
      episodes_watched:        bestEpisodes,
      total_watch_time_minutes: bestWatchTime,
      status:                  bestStatus,
      last_read_at:            bestLastRead,
      total_chapters:          bestTotal,
      total_episodes:          bestTotalEp,
      synopsis:                bestSynopsis,
      cover_url:               bestCover,
      mal_id:                  bestMalId,
      anime_mal_id:            bestAnimeMal,
      anime_title:             bestAnimeTitle,
      user_rating:             bestRating,
      score:                   bestScore,
      content_type:            bestContentType,
      publishing_status:       bestPubStatus,
      series_id:               bestSeriesId,
      series_primary:          bestSeriesPrim,
      review_md:               bestReviewMd,
      is_public_review:        bestPublicRev,
      has_anime:               bestHasAnime,
      auto_tracked:            bestAutoTracked,
      genres:                  bestGenres,
      authors:                 bestAuthors,
      notes:                   bestNotes,
    }

    const removeIds = toRemove.map(r => r.id)

    // 1. Update the kept entry with merged data
    const { error: updateErr } = await supabase.from('manga_list').update(updates).eq('id', keep.id)
    if (updateErr) { showToast('Merge failed — could not update entry'); return }

    // 2. Atomically reassign watch_sessions + delete duplicates via RPC
    // (single DB transaction — prevents orphaned records if the connection drops)
    const { error: mergeErr } = await supabase.rpc('merge_entries', {
      keep_id:  keep.id,
      drop_ids: removeIds,
    })
    if (mergeErr) { showToast('Merge failed — could not remove duplicates'); return }

    setManga(prev =>
      prev
        .filter(m => !removeIds.includes(m.id))
        .map(m => m.id === keep.id ? { ...m, ...updates } : m)
    )
    showToast(toRemove.length === 1
      ? 'Merged — All Data Integrated'
      : `Merged ${toRemove.length + 1} Entries — All Data Integrated`)
  }

  /** Auto-pick the best keeper and merge the rest into it. */
  const mergePair = (a: Manga, b: Manga) => {
    const keep = pickKeeper([a, b])
    const remove = keep.id === a.id ? b : a
    return mergeMultiple(keep, [remove])
  }

  const counts = manga.reduce((acc, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const sortFn = (a: Manga, b: Manga): number => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    if (sort === 'chapter') return b.current_chapter - a.current_chapter
    if (!a.last_read_at && !b.last_read_at) return a.title.localeCompare(b.title)
    if (!a.last_read_at) return 1
    if (!b.last_read_at) return -1
    return new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime()
  }

  const currentArc = (m: Manga): Arc | null => {
    const arcs = arcsMap[m.id] ?? []
    return arcs.find(a => m.current_chapter >= a.chapter_start && m.current_chapter <= a.chapter_end) ?? null
  }

  const MOODS: { id: string; label: string; icon: React.ReactNode; test: (m: Manga) => boolean }[] = [
    { id: 'quick',     label: 'Quick',     icon: <Zap    size={11} strokeWidth={1.5} />, test: m => !!m.total_chapters && m.total_chapters <= 100 },
    { id: 'epic',      label: 'Epic',      icon: <Sword  size={11} strokeWidth={1.5} />, test: m => !!m.total_chapters && m.total_chapters >= 300 },
    { id: 'light',     label: 'Light',     icon: <Cloud  size={11} strokeWidth={1.5} />, test: m => m.genres.some(g => ['Comedy','Slice of Life'].includes(g)) },
    { id: 'dark',      label: 'Dark',      icon: <Moon   size={11} strokeWidth={1.5} />, test: m => m.genres.some(g => ['Horror','Psychological','Thriller'].includes(g)) },
    { id: 'action',    label: 'Action',    icon: <Flame  size={11} strokeWidth={1.5} />, test: m => m.genres.some(g => ['Action','Martial Arts'].includes(g)) },
    { id: 'heartfelt', label: 'Heartfelt', icon: <Heart  size={11} strokeWidth={1.5} />, test: m => m.genres.some(g => ['Romance','Drama'].includes(g)) },
  ]

  // Series grouping: map series_id → all members
  const seriesMap = useMemo(() => {
    const map = new Map<string, Manga[]>()
    for (const m of manga) {
      if (m.series_id) {
        if (!map.has(m.series_id)) map.set(m.series_id, [])
        map.get(m.series_id)!.push(m)
      }
    }
    return map
  }, [manga])

  // An entry "belongs" to the anime tab if its content_type is anime/movie OR it has an anime adaptation.
  // This lets manga entries with has_anime=true show up in both their primary type tab AND the anime tab.
  const matchesTypeFilter = (m: Manga) => {
    if (typeFilter === 'all') return true
    const ct = m.content_type ?? 'manga'
    if (typeFilter === 'anime') return ct === 'anime' || ct === 'movie' || !!m.has_anime
    return ct === typeFilter
  }

  const filtered = useMemo(() => manga
    .filter(m => !m.series_id || !!m.series_primary) // hide non-primary grouped entries
    .filter(m => filter === 'all' || filter === 'duplicates' || m.status === filter)
    .filter(matchesTypeFilter)
    .filter(m => !search || m.title.toLowerCase().includes(search.toLowerCase()))
    .filter(m => !mood || MOODS.find(mo => mo.id === mood)?.test(m))
    .sort(sortFn),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [manga, filter, typeFilter, search, mood, sortFn])

  // Count per type for badge labels.
  // Anime tab count includes entries where has_anime=true so it reflects what the tab will show.
  const typeCounts = useMemo(() => {
    const acc: Record<string, number> = {}
    manga.forEach(m => {
      const t = m.content_type ?? 'manga'
      acc[t] = (acc[t] ?? 0) + 1
      // also count has_anime entries toward the anime tab (unless they already are anime)
      if (m.has_anime && t !== 'anime' && t !== 'movie') {
        acc['anime'] = (acc['anime'] ?? 0) + 1
      }
    })
    return acc
  }, [manga])

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-[1800px] mx-auto px-6 py-6 md:py-10">

        {/* Header — responsive */}
        <LibraryToolbar
          mangaCount={manga.length}
          loadingRec={loadingRec}
          syncing={syncing}
          deepSelectMode={deepSelectMode}
          deepSelectedCount={deepSelected.size}
          onRecommend={getRecommendations}
          onAdd={() => setShowAdd(v => !v)}
          onSync={runSync}
          onHealthCheck={() => setShowHealthCheck(true)}
          onDeepSearchLaunch={() => {
            if (deepSelectMode) {
              if (deepSelected.size === 0) return
              const first = manga.find(m => deepSelected.has(m.id))
              if (first) setDeepSearchTarget(first)
            } else {
              setDeepSelectMode(true)
            }
          }}
          onDeepSelectCancel={() => { setDeepSelectMode(false); setDeepSelected(new Set()) }}
          onExportCSV={exportCSV}
          onExportMAL={exportMALXML}
          onExportAniList={exportAniListJSON}
          onShare={() => setShareModal(true)}
          onTakeoutImport={() => setShowTakeoutImport(true)}
          onSignOut={signOut}
        />

        {/* Stats — 2 cols on mobile, responsive on desktop (hide watching if 0) */}
        <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-2">
          {(Object.keys(STATUS_LABELS) as MangaStatus[]).filter(s => (s !== 'watching' && s !== 'unwatched') || (counts[s] ?? 0) > 0).map(s => (
            <button key={s} onClick={() => setFilter(filter === s ? 'all' : s)}
              className={`rounded-xl p-3 text-center transition-colors ${filter === s ? 'bg-white text-black' : 'bg-zinc-900 hover:bg-zinc-800'}`}>
              <div className="text-xl font-bold">{counts[s] ?? 0}</div>
              <div className={`text-xs mt-0.5 ${filter === s ? 'text-zinc-600' : 'text-zinc-500'}`}>{STATUS_LABELS[s]}</div>
            </button>
          ))}
        </div>

        {/* Anime stats row */}
        {(() => {
          const trackedMinutes = manga.reduce((s, m) => s + (m.total_watch_time_minutes || 0), 0)
          const totalHours  = animeList.reduce((s, e) => s + e.total_watch_hours, 0) + trackedMinutes / 60
          const totalSeries = animeList.filter(e => !e.is_movie).length
          const totalMovies = animeList.filter(e =>  e.is_movie).length
          const activeCount = animeList.filter(e => getAnimeStatus(e) === 'active').length
          const stats = [
            { value: totalSeries,                 label: 'Anime series',  icon: <Tv          size={16} strokeWidth={1.5} className="icon-primary"   /> },
            { value: `${totalHours.toFixed(0)}h`, label: 'Hours watched', icon: <Timer       size={16} strokeWidth={1.5} className="icon-secondary" /> },
            { value: activeCount,                 label: 'Active',        icon: <Play        size={16} strokeWidth={1.5} className="icon-primary"   /> },
            { value: totalMovies,                 label: 'Movies',        icon: <Clapperboard size={16} strokeWidth={1.5} className="icon-muted"    /> },
          ] as { value: string | number; label: string; icon: React.ReactNode }[]
          return (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
              {stats.map(s => (
                <div key={s.label} className="bg-zinc-900 rounded-xl p-3 flex items-center gap-3">
                  <span className="shrink-0">{s.icon}</span>
                  <div>
                    <div className="text-lg font-bold leading-tight" style={{ color: 'var(--cyan)' }}>{s.value}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )
        })()}

        {/* Chapter notifications banner */}
        {notifications.length > 0 && (
          <div className="mb-5 bg-violet-900/30 border border-violet-500/40 rounded-xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-violet-300 mb-1">📬 New chapters available!</p>
                <div className="space-y-0.5">
                  {notifications.map(n => (
                    <p key={n.id} className="text-xs text-zinc-400">
                      <span className="text-white">{n.title}</span>
                      {n.previous_chapters && <span> · {n.previous_chapters} → </span>}
                      <span className="text-emerald-400">{n.new_chapters} chapters</span>
                    </p>
                  ))}
                </div>
              </div>
              <button onClick={dismissNotifications} aria-label="Dismiss notifications"
                className="text-zinc-600 hover:text-zinc-400 shrink-0 text-lg">×</button>
            </div>
          </div>
        )}

        {/* Add form with live autocomplete */}
        {showAdd && (
          <div className="mb-5 flex flex-col gap-2" ref={addBarRef}>
            {/* Manga / Anime toggle */}
            <div className="flex gap-1 p-1 bg-zinc-900 border border-zinc-800 rounded-xl w-fit">
              {(['manga', 'anime', 'movie'] as const).map(ct => (
                <button
                  key={ct}
                  onClick={() => { setAddContentType(ct); setSelectedJikan(null); setNewTitle(''); setAddSuggestions([]); resetAddDetails() }}
                  className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors ${addContentType === ct ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                  {ct === 'manga' ? '📚 Manga / Manhwa' : ct === 'anime' ? '🎌 Anime' : '🎬 Movie'}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
            <div className="relative flex-1">
              {selectedJikan ? (
                /* Confirmed selection chip */
                <div className="flex items-center gap-3 bg-zinc-900 border border-emerald-600/50 rounded-xl px-4 py-3">
                  {selectedJikan.cover_url && (
                    <img src={selectedJikan.cover_url} alt="" className="w-6 h-9 object-cover rounded shrink-0" />
                  )}
                  <span className="text-sm text-zinc-200 flex-1 truncate">{selectedJikan.title}</span>
                  <button onClick={() => { setSelectedJikan(null); setNewTitle(''); resetAddDetails() }}
                    className="text-zinc-500 hover:text-white text-lg shrink-0">×</button>
                </div>
              ) : (
                <>
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => {
                      const v = e.target.value
                      setNewTitle(v)
                      setSelectedJikan(null)
                      setShowAddSuggestions(true)
                      if (addSuggestTimer.current) clearTimeout(addSuggestTimer.current)
                      if (!v.trim() || v.length < 2) { setAddSuggestions([]); setShowAddSuggestions(false); return }
                      addSuggestTimer.current = setTimeout(async () => {
                        setAddSuggestLoading(true)
                        let results: JikanSearchResult[] = []
                        if (addContentType === 'anime' || addContentType === 'movie') {
                          const r = await searchAnimeWithFiltersTyped({ query: v.trim(), orderBy: 'score', sort: 'desc' })
                          results = r.ok ? r.results.filter(x => addContentType === 'movie' ? (x as JikanSearchResult & { media_type?: string }).media_type === 'movie' : (x as JikanSearchResult & { media_type?: string }).media_type !== 'movie') : []
                        } else {
                          results = await searchMangaWithFilters({ query: v.trim(), orderBy: 'score', sort: 'desc' })
                        }
                        setAddSuggestions(results.slice(0, 8))
                        setShowAddSuggestions(true)
                        setAddSuggestLoading(false)
                      }, 350)
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { setShowAddSuggestions(false); addManga() }
                      if (e.key === 'Escape') { setShowAdd(false); setNewTitle(''); setAddSuggestions([]); setSelectedJikan(null); resetAddDetails() }
                    }}
                    placeholder={addContentType === 'anime' ? 'Search for an anime title…' : addContentType === 'movie' ? 'Search for a movie title…' : 'Search for a manga / manhwa title…'}
                    aria-label={addContentType === 'anime' ? 'New anime title' : addContentType === 'movie' ? 'New movie title' : 'New manga title'}
                    className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
                  />
                  {/* Dropdown */}
                  {showAddSuggestions && newTitle.length >= 2 && (
                    <div className="absolute z-30 top-full mt-1 left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl">
                      {addSuggestLoading && (
                        <div className="px-4 py-3 text-xs text-zinc-500">Searching…</div>
                      )}
                      {!addSuggestLoading && addSuggestions.length === 0 && (
                        <div className="px-4 py-3 text-xs text-zinc-500">No matches — try a different spelling</div>
                      )}
                      {!addSuggestLoading && addSuggestions.map(s => (
                        <button
                          key={s.mal_id}
                          onMouseDown={e => { e.preventDefault(); setSelectedJikan(s); setNewTitle(s.title); setShowAddSuggestions(false) }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-left border-b border-zinc-800 last:border-0"
                        >
                          {s.cover_url && (
                            <img src={s.cover_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-zinc-200 truncate">{s.title}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              {s.authors.length > 0 ? `by ${s.authors[0].name}` : ''}
                              {s.score ? ` · ★ ${s.score}` : ''}
                              {s.total_chapters ? ` · ${s.total_chapters} ch` : ''}
                            </p>
                          </div>
                          <span className="text-[10px] text-zinc-600 shrink-0">Select →</span>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <button onClick={addManga} disabled={adding || (!selectedJikan && !newTitle.trim())}
              className="px-5 py-3 rounded-xl bg-white text-black text-sm font-medium disabled:opacity-40 shrink-0">
              {adding ? '…' : 'Add'}
            </button>
            </div>

            {/* ── Quick Details (shown once a title is confirmed) ── */}
            {(selectedJikan || newTitle.trim()) && (
              <div className="border border-zinc-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setAddShowDetails(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900/50 transition-colors"
                >
                  <span className="font-medium">{addShowDetails ? '▲ Hide details' : '▼ Add details (status, progress, date, notes…)'}</span>
                  {/* Show a summary of filled fields when collapsed */}
                  {!addShowDetails && (addDetailStatus || addDetailProgress || addDetailDate || addDetailNotes || addDetailRating) && (
                    <span className="text-zinc-600 text-[10px] gap-1.5 flex items-center">
                      {addDetailStatus && <span className="bg-zinc-800 rounded px-1.5 py-0.5">{addDetailStatus.replace('_', ' ')}</span>}
                      {addDetailProgress && <span className="bg-zinc-800 rounded px-1.5 py-0.5">{addContentType === 'manga' ? `Ch.${addDetailProgress}` : `Ep.${addDetailProgress}`}</span>}
                      {addDetailDate && <span className="bg-zinc-800 rounded px-1.5 py-0.5">{addDetailDate}</span>}
                      {addDetailRating && <span>{addDetailRating === 'up' ? '👍' : '👎'}</span>}
                    </span>
                  )}
                </button>

                {addShowDetails && (
                  <div className="px-4 pb-4 pt-1 flex flex-col gap-4 bg-zinc-900/40">
                    {/* Status */}
                    <div>
                      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">Status</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(addContentType === 'manga'
                          ? (['reading', 'completed', 'plan_to_read', 'on_hold', 'dropped'] as MangaStatus[])
                          : addContentType === 'anime'
                          ? (['watching', 'completed', 'plan_to_read', 'on_hold', 'dropped'] as MangaStatus[])
                          : (['unwatched', 'watching', 'completed'] as MangaStatus[])
                        ).map(s => (
                          <button
                            key={s}
                            onClick={() => setAddDetailStatus(prev => prev === s ? null : s)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors capitalize ${
                              addDetailStatus === s
                                ? 'bg-white text-black'
                                : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {s.replace(/_/g, ' ')}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress + Date row */}
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">
                          {addContentType === 'manga' ? 'Current Chapter' : 'Episodes Watched'}
                        </p>
                        <input
                          type="number"
                          min={0}
                          value={addDetailProgress}
                          onChange={e => setAddDetailProgress(e.target.value)}
                          placeholder="0"
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 text-zinc-200 placeholder:text-zinc-600"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">
                          {addContentType === 'manga' ? 'Date Read' : 'Date Watched'}
                        </p>
                        <input
                          type="date"
                          value={addDetailDate}
                          onChange={e => setAddDetailDate(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 text-zinc-200 [color-scheme:dark]"
                        />
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">Notes</p>
                      <textarea
                        value={addDetailNotes}
                        onChange={e => setAddDetailNotes(e.target.value)}
                        placeholder="Your thoughts, where you left off, reminders…"
                        rows={2}
                        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 text-zinc-200 placeholder:text-zinc-600 resize-none"
                      />
                    </div>

                    {/* Rating */}
                    <div>
                      <p className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider mb-2">Rating</p>
                      <div className="flex gap-2">
                        {(['up', 'down'] as const).map(r => (
                          <button
                            key={r}
                            onClick={() => setAddDetailRating(prev => prev === r ? null : r)}
                            className={`px-4 py-1.5 rounded-lg text-sm transition-colors ${
                              addDetailRating === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                            }`}
                          >
                            {r === 'up' ? '👍 Liked' : '👎 Didn\'t like'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Continue strip ── */}
        {(() => {
          const CONTINUE_KEY = 'yomu_last_read'
          // Derive the last-touched reading/watching entry from loaded data
          const lastRead = manga
            .filter(m => (m.status === 'reading' || m.status === 'watching') && m.last_read_at)
            .sort((a, b) => new Date(b.last_read_at!).getTime() - new Date(a.last_read_at!).getTime())[0]

          if (!lastRead) return null

          // Persist for instant next-load
          try { localStorage.setItem(CONTINUE_KEY, JSON.stringify({ id: lastRead.id, title: lastRead.title, chapter: lastRead.current_chapter, cover: lastRead.cover_url })) } catch {}

          const isWatching = lastRead.status === 'watching'
          const site = lastRead.last_watched_site

          // Site name display helpers
          const SITE_DISPLAY: Record<string, string> = {
            'netflix.com': 'Netflix', 'netflix': 'Netflix',
            'crunchyroll.com': 'Crunchyroll', 'crunchyroll': 'Crunchyroll',
            'funimation.com': 'Funimation', 'funimation': 'Funimation',
            'hidive.com': 'HiDive', 'hidive': 'HiDive',
            'disneyplus.com': 'Disney+', 'disney+': 'Disney+',
            'max.com': 'Max', 'hbomax.com': 'Max', 'max': 'Max',
            'hulu.com': 'Hulu', 'hulu': 'Hulu',
            'vrv.co': 'VRV', 'vrv': 'VRV',
            'bilibili.tv': 'Bilibili', 'bilibili': 'Bilibili',
            'tubi.tv': 'Tubi', 'tubi': 'Tubi',
            'appletv.apple.com': 'Apple TV+', 'apple tv+': 'Apple TV+',
          }
          const SITE_COLORS: Record<string, string> = {
            'Netflix': '#e50914',
            'Crunchyroll': '#ff6400',
            'Disney+': '#113ccf',
            'Max': '#002be0',
            'Hulu': '#3dba00',
            'HiDive': '#00b4d8',
            'VRV': '#f5c400',
            'Funimation': '#410099',
            'Bilibili': '#00aeec',
            'Tubi': '#fa4616',
            'Apple TV+': '#555',
          }
          const siteKey = site?.toLowerCase() ?? ''
          const siteName = SITE_DISPLAY[siteKey] ?? (site ? site.replace(/\.com$/, '') : null)
          const siteColor = siteName ? (SITE_COLORS[siteName] ?? '#555') : null

          const mdexUrl = !isWatching && lastRead.mal_id
            ? `https://mangadex.org/search?q=${encodeURIComponent(lastRead.title)}`
            : null

          return (
            <div className="mb-4 flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 hover:border-zinc-700 transition-colors">
              {lastRead.cover_url && (
                <img src={lastRead.cover_url} alt="" className="w-8 h-11 object-cover rounded shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-widest font-semibold">{isWatching ? 'Continue Watching' : 'Continue Reading'}</p>
                  {isWatching && siteName && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: siteColor + '25', color: siteColor!, border: `1px solid ${siteColor}55` }}>
                      {siteName}
                    </span>
                  )}
                </div>
                <p className="text-sm font-semibold text-zinc-100 truncate">{lastRead.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {isWatching
                    ? `Episode ${lastRead.episodes_watched}${lastRead.total_episodes ? ` of ${lastRead.total_episodes}` : ''}`
                    : `Chapter ${lastRead.current_chapter}${lastRead.total_chapters ? ` of ${lastRead.total_chapters}` : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {mdexUrl && (
                  <a href={mdexUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--vermillion)', color: '#fff' }}>
                    <Play size={11} strokeWidth={2} /> Read
                  </a>
                )}
                <button onClick={() => openDetailStore(lastRead.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors">
                  Details
                </button>
              </div>
            </div>
          )
        })()}

        {/* Release calendar — anime airing this week + currently-releasing manga */}
        <ReleaseCalendar
          animeMalIds={manga.filter(m => m.anime_mal_id).map(m => m.anime_mal_id!)}
          watchingMalIds={manga.filter(m => m.anime_mal_id && m.status === 'watching').map(m => m.anime_mal_id!)}
          libraryMalIdSet={new Set(manga.filter(m => m.anime_mal_id).map(m => m.anime_mal_id!))}
          releasingManga={manga.filter(m => m.status === 'reading' && m.publishing_status === 'Publishing')}
          onAddToLibrary={async (entry) => {
            const payload = {
              title: entry.title,
              current_chapter: 0,
              episodes_watched: 0,
              status: 'watching' as const,
              content_type: 'anime',
              mal_id: null,
              anime_mal_id: entry.mal_id,
              anime_title: entry.title,
              cover_url: entry.cover ?? null,
              total_episodes: entry.episodes ?? null,
              genres: entry.genres ?? [],
              has_anime: true,
            }
            const { data, error } = await supabase.from('manga_list').insert(payload).select().single()
            if (error?.code === '23505') { showToast(`"${entry.title}" Is Already In Your Library`); return }
            if (error) { showToast('Failed To Add To Library'); return }
            if (data) {
              setManga(prev => [...prev, data as Manga])
              showToast(`"${entry.title}" Added To Library`)
            }
          }}
        />

        {/* Trending section — reads excluded genres from localStorage (set on Search page) */}
        <TrendingSection
          onSelect={rec => setSelectedRec(rec)}
          excludeGenreIds={(() => {
            try { return JSON.parse(localStorage.getItem('excluded_genres') ?? '[]') } catch { return [] }
          })()}
        />

        {/* Discovery — Featured / Popular Today / New Releases */}
        <DiscoverySection
          onSelect={(mal_id, title) => setSelectedRec({ title, mal_id, confidence: 0, reason: '', isAnime: false })}
        />


        <MangaFact />

        {/* Backlog pressure score */}
        {(() => {
          const reading = manga.filter(m => m.status === 'reading' && m.total_chapters)
          const totalUnread = reading.reduce((s, m) => s + Math.max(0, (m.total_chapters ?? 0) - m.current_chapter), 0)
          if (totalUnread === 0) return null
          const weeksLeft = pacePerDay > 0 ? Math.ceil(totalUnread / (pacePerDay * 7)) : null
          const pressurePct = Math.min(100, Math.round((totalUnread / 2000) * 100)) // 2000 = "full"
          const colour = pressurePct < 30 ? 'bg-emerald-500' : pressurePct < 60 ? 'bg-yellow-500' : 'bg-red-500'
          return (
            <div className="mb-5 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} strokeWidth={1.5} className="icon-muted shrink-0" />
                  <span className="text-sm font-medium">
                    {totalUnread.toLocaleString()} unread chapters
                  </span>
                  <span className="text-xs text-zinc-500">across {reading.length} series</span>
                </div>
                {weeksLeft !== null && (
                  <span className="text-xs text-zinc-500">
                    ~{weeksLeft < 1 ? 'This Week' : weeksLeft === 1 ? '1 Week' : `${weeksLeft} Weeks`} At Your Pace
                  </span>
                )}
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${colour}`} style={{ width: `${pressurePct}%` }} />
              </div>
            </div>
          )
        })()}

        {/* Mood filter */}
        <div className="flex gap-1.5 flex-wrap mb-4">
          {MOODS.map(mo => (
            <button key={mo.id} onClick={() => setMood(mood === mo.id ? null : mo.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                mood === mo.id
                  ? 'bg-violet-600/30 border-violet-500/50 text-violet-300'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
              }`}>
              {mo.icon}{mo.label}
            </button>
          ))}
          {mood && <button onClick={() => setMood(null)} className="text-xs text-zinc-600 hover:text-zinc-400 px-2">✕ clear</button>}
        </div>

        <LibraryFilters
          filter={filter}
          typeFilter={typeFilter}
          search={search}
          sort={sort}
          duplicateCount={duplicatePairs.length}
          typeCounts={typeCounts}
          totalCount={manga.length}
          onFilterChange={setFilter}
          onTypeFilterChange={setTypeFilter}
          onSearchChange={setSearch}
          onSortChange={setSort}
        />

        {/* Duplicates view */}
        {filter === 'duplicates' && !loading && (
          <div className="space-y-3">
            {duplicatePairs.length === 0 ? (
              <div className="text-center py-12">
                <GitMerge size={32} strokeWidth={1} className="mx-auto mb-3 text-zinc-700" />
                <p className="text-zinc-500 text-sm">No suspected duplicates found.</p>
              </div>
            ) : duplicatePairs.map(({ a, b, score, reason }) => {
              const key = [a.id, b.id].sort().join('|')
              return (
                <div key={key} className="bg-zinc-900 border border-amber-500/20 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
                      <GitMerge size={12} strokeWidth={1.5} /> {reason} — {Math.round(score * 100)}% match
                    </span>
                    <button onClick={() => dismissPair(a, b)} className="text-zinc-600 hover:text-zinc-400 transition-colors">
                      <X size={14} strokeWidth={1.5} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    {[a, b].map(m => (
                      <div key={m.id} className="bg-zinc-800 rounded-lg p-3">
                        <div className="flex gap-2 mb-2">
                          {m.cover_url && <img src={m.cover_url} alt="" className="w-8 h-11 object-cover rounded shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-xs font-semibold leading-snug truncate">{m.title}</p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">{STATUS_LABELS[m.status]}</p>
                            <p className="text-[10px] text-zinc-600">Ch. {m.current_chapter}{m.total_chapters ? `/${m.total_chapters}` : ''}</p>
                          </div>
                        </div>
                        {m.synopsis && <p className="text-[10px] text-zinc-600 line-clamp-2 leading-relaxed">{m.synopsis}</p>}
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => mergePair(a, b)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors">
                      <GitMerge size={12} strokeWidth={1.5} /> Merge &amp; Integrate All Data
                    </button>
                    <button onClick={() => dismissPair(a, b)}
                      className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs rounded-lg transition-colors">
                      Not A Duplicate
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* List */}
        {filter !== 'duplicates' && (loading ? (
          <div className="text-zinc-500 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="text-zinc-500 text-sm">Nothing here.</div>
        ) : (
          <div className="@container">
          <div className="grid grid-cols-1 @[740px]:grid-cols-2 @[1120px]:grid-cols-3 gap-3">
            {filtered.slice(0, renderCount).map(m => (
              <LibraryCard
                key={m.id}
                m={m}
                seriesMembers={m.series_id ? (seriesMap.get(m.series_id) ?? []) : []}
                arcs={arcsMap[m.id] ?? []}
                rereadCount={rereadCounts[m.id] ?? 0}
                rewatchCount={rewatchCounts[m.id] ?? 0}
                expandedNotes={expandedNotes.has(m.id)}
                expandedSynopsis={expandedSynopsis.has(m.id)}
                deepSelectMode={deepSelectMode}
                deepSelected={deepSelected.has(m.id)}
                refreshingId={refreshingId}
                watchPromptId={watchPrompt?.id ?? null}
                watchPromptInput={watchPrompt?.id === m.id ? watchPrompt.epInput : ''}
                activeSession={activeSession}
                finishEstimate={finishEstimate(m)}
                onStatusChange={updateStatus}
                onChapterUpdate={updateChapter}
                onEpisodeUpdate={updateEpisodes}
                onTotalChaptersUpdate={updateTotalChapters}
                onTotalEpisodesUpdate={updateTotalEpisodes}
                onNotesToggle={toggleNotes}
                onNotesChange={updateNotes}
                onSynopsisToggle={toggleSynopsis}
                onDelete={confirmDelete}
                onRefresh={refreshCardInfo}
                onOpenPeek={(id) => openPeek(id)}
                onOpenDetail={(m) => openDetailStore(m.id)}
                onAuthorClick={setSelectedAuthor}
                onStudioClick={setSelectedStudio}
                onShelfPick={setShelfPickerManga}
                onStartSession={startSession}
                onStopSession={() => setActiveSession(null)}
                onDeepSelectToggle={id => setDeepSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })}
                onRatingChange={(id, rating) => setManga(prev => prev.map(x => x.id === id ? { ...x, user_rating: rating } : x))}
                onPublicReviewToggle={(id, val) => setManga(prev => prev.map(x => x.id === id ? { ...x, is_public_review: val } : x))}
                onWatchPromptInputChange={(id, val) => setWatchPrompt(p => p ? { ...p, epInput: val } : { id, epInput: val })}
                onWatchPromptConfirm={confirmWatching}
                onWatchPromptCancel={() => setWatchPrompt(null)}
              />
            ))}
          </div>
          </div>
        ))}

        {/* Recommendations modal — rendered below, triggered via showRecModal */}
      </div>

      {/* Recommendations modal */}
      {showRecModal && (
        <RecommendationsListModal
          loading={loadingRec}
          error={recError}
          recommendations={recommendations}
          renderCount={renderCount}
          filteredLength={filtered.length}
          sentinelRef={gridSentinelRef}
          onClose={() => { setShowRecModal(false); setRecommendations([]); setRecError('') }}
          onRetry={getRecommendations}
          onSelectRec={setSelectedRec}
        />
      )}

      {/* Session timer */}
      {activeSession && (
        <SessionTimer
          session={activeSession}
          currentChapter={manga.find(m => m.id === activeSession.mangaId)?.current_chapter ?? activeSession.startChapter}
          onEnd={endSession}
          onCancel={() => setActiveSession(null)}
        />
      )}

      {/* Share modal */}
      {shareModal && (
        <ShareModal token={shareToken} enabled={shareEnabled} onToggle={toggleShare} onClose={() => setShareModal(false)} />
      )}

      {/* Takeout Import modal */}
      {showTakeoutImport && (
        <TakeoutImportModal
          existingTitles={new Set(manga.map(m => m.title.toLowerCase().trim()))}
          onClose={() => setShowTakeoutImport(false)}
          onImported={(count) => { showToast(`Imported ${count} series from Takeout`); fetchManga() }}
        />
      )}

      {/* Health Check modal */}
      {showHealthCheck && (
        <HealthCheckModal
          manga={manga}
          onClose={() => setShowHealthCheck(false)}
          onEnriched={(updated) => setManga(prev => prev.map(m => m.id === updated.id ? updated : m))}
        />
      )}

      {/* Recommendation detail modal */}
      {selectedRec && (
        <RecommendationModal rec={selectedRec} onClose={() => setSelectedRec(null)} />
      )}

      {/* Shelf picker */}
      {shelfPickerManga && (
        <ShelfPicker manga={shelfPickerManga} onClose={() => setShelfPickerManga(null)} />
      )}

      {/* Author modal */}
      {selectedAuthor && (
        <AuthorModal author={selectedAuthor} onClose={() => setSelectedAuthor(null)} />
      )}

      {selectedStudio && (
        <StudioModal studio={selectedStudio} onClose={() => setSelectedStudio(null)} />
      )}

      {/* Detail modal */}
      {selectedManga && (
        <DetailModal
          manga={selectedManga}
          allManga={manga}
          onClose={closeDetail}
          onStatusChange={(id, status) => {
            updateStatus(id, status)
          }}
          onMerge={(removedId) => {
            setManga(prev => prev.filter(m => m.id !== removedId))
          }}
          onMergeMultiple={async (removeIds) => {
            const candidates = [selectedManga!, ...manga.filter(m => removeIds.includes(m.id))]
            const keep = pickKeeper(candidates)
            const toRemove = candidates.filter(m => m.id !== keep.id)
            await mergeMultiple(keep, toRemove)
            if (keep.id !== selectedManga!.id) openDetailStore(keep.id)
          }}
          onNavigate={(m) => openDetailStore(m.id)}
          onChapterReset={(chapterAtStart) => {
            setManga(prev => prev.map(m => m.id === activeDetailId ? { ...m, current_chapter: 0 } : m))
            showToast(`Re-Read Started — Ch. ${chapterAtStart} Saved, Reset To 0`)
          }}
          onEpisodesReset={(episodesAtStart) => {
            setManga(prev => prev.map(m => m.id === activeDetailId ? { ...m, episodes_watched: 0 } : m))
            showToast(`Re-Watch Started — Ep. ${episodesAtStart} Saved, Reset To 0`)
          }}
          onChapterRestored={(restored) => {
            setManga(prev => prev.map(m => m.id === activeDetailId ? { ...m, current_chapter: restored } : m))
            showToast(`Re-Read Complete — Progress Restored To Ch. ${restored}`)
          }}
          onEpisodesRestored={(restored) => {
            setManga(prev => prev.map(m => m.id === activeDetailId ? { ...m, episodes_watched: restored } : m))
            showToast(`Re-Watch Complete — Progress Restored To Ep. ${restored}`)
          }}
          onTotalChaptersUpdated={(n) => {
            const tc = n ?? null
            setManga(prev => prev.map(m => m.id === activeDetailId ? { ...m, total_chapters: tc } : m))
            if (tc != null) showToast(`Total Chapters Updated To ${tc}`)
          }}
          onSeriesUpdated={(patches) => {
            setManga(prev => prev.map(m => patches[m.id] ? { ...m, ...patches[m.id] } : m))
          }}
          onSeriesEntryAdded={(entry) => {
            setManga(prev => [...prev, entry])
          }}
          onSync={syncEntry}
        />
      )}

      {/* Delete confirmation modal */}
      {pendingDelete && (() => {
        const target = manga.find(m => m.id === pendingDelete)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={cancelDelete}>
            <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="text-base font-semibold text-white mb-1">Remove From Library?</div>
              <div className="text-sm text-zinc-400 mb-5">
                <span className="text-white font-medium">{target?.title}</span> will be permanently deleted.
              </div>
              <div className="flex gap-3 justify-end">
                <button onClick={cancelDelete}
                  className="px-4 py-2 rounded-lg text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
                <button onClick={() => deleteManga(pendingDelete)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Toast */}
      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg">
          {toast}
        </div>
      )}

      {progressPrompt && (
        <DateAttributionModal
          title={progressPrompt.title}
          delta={progressPrompt.delta}
          type={progressPrompt.type}
          onConfirm={(attr, applyToAll) => {
            const p = progressPrompt
            setProgressPrompt(null)
            if (applyToAll) sessionAttrRef.current = attr
            if (p.type === 'chapter') commitChapterProgress(p.id, p.delta, p.current, attr)
            else commitEpisodeProgress(p.id, p.delta, p.current, attr)
          }}
          onDismiss={() => {
            const p = progressPrompt
            setProgressPrompt(null)
            // Dismissed = save as unknown date
            if (p.type === 'chapter') commitChapterProgress(p.id, p.delta, p.current, { precision: 'unknown' })
            else commitEpisodeProgress(p.id, p.delta, p.current, { precision: 'unknown' })
          }}
        />
      )}

      {completionManga && (
        <CompletionModal
          manga={completionManga}
          onClose={() => setCompletionManga(null)}
          onSaved={(id, rating, note) => {
            setManga(prev => prev.map(m => m.id === id
              ? { ...m, user_rating: rating, notes: note ? (m.notes ? m.notes.trim() + '\n' : '') + `[Completed] ${note}` : m.notes }
              : m
            ))
            showToast(`"${completionManga.title}" Logged ✓`)
          }}
        />
      )}

      {/* Deep Search Modal — library multi-select */}
      {deepSearchTarget && (
        <DeepSearchModal
          mangaId={deepSearchTarget.id}
          malId={deepSearchTarget.mal_id}
          title={deepSearchTarget.title}
          contentType={deepSearchTarget.content_type}
          onClose={() => {
            const remaining = [...deepSelected].filter(id => id !== deepSearchTarget.id)
            setDeepSelected(new Set(remaining))
            if (remaining.length === 0) {
              setDeepSelectMode(false)
              setDeepSearchTarget(null)
            } else {
              const next = manga.find(m => remaining[0] === m.id)
              setDeepSearchTarget(next ?? null)
            }
          }}
          onSaved={(total) => {
            setManga(prev => prev.map(m => m.id === deepSearchTarget.id ? { ...m, total_chapters: total } : m))
            showToast(`Deep Search Saved — ${deepSearchTarget.title}`)
            const remaining = [...deepSelected].filter(id => id !== deepSearchTarget.id)
            setDeepSelected(new Set(remaining))
            if (remaining.length === 0) {
              setDeepSelectMode(false)
              setDeepSearchTarget(null)
            } else {
              const next = manga.find(m => remaining[0] === m.id)
              setDeepSearchTarget(next ?? null)
            }
          }}
        />
      )}

      {/* Sync Results Modal */}
      {syncResults && (
        <SyncResultsModal
          syncResults={syncResults}
          malTrackedCount={manga.filter(m => m.mal_id).length}
          onClose={() => setSyncResults(null)}
        />
      )}

      {/* Quick Peek Sheet */}
      {activePeekId && (
        <QuickPeekSheet
          id={activePeekId}
          onOpenDetail={openDetailStore}
        />
      )}
    </main>
  )
}
