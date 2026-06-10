// YOMU Watch Tracker — Background Service Worker (Manifest V3)
// Receives watch events from content scripts, authenticates with YOMU,
// and syncs data to the server.

'use strict';

const YOMU_URL    = 'https://manga-tracker-hazel.vercel.app'
const API_URL     = `${YOMU_URL}/api/watch-event`
const BATCH_URL   = `${YOMU_URL}/api/watch-event/batch`
const YOMU_HOST   = 'manga-tracker-hazel.vercel.app'
const MAX_RETRIES = 5
const IDLE_THRESHOLD_SECONDS = 900 // 15 minutes

// ── Offline-first: periodic flush alarm ──────────────────────────────────
// Wakes the MV3 service worker every 1 min to drain the pending queue,
// even if the worker was terminated mid-flush.
//
// NOTE: chrome.alarms requires the "alarms" permission in manifest.json.
// If the extension is loaded with an old manifest (before the permission was
// added) chrome.alarms will be undefined — reload the extension to fix it.
// The guard below prevents a hard crash in that case.
if (chrome.alarms) {
  chrome.runtime.onInstalled.addListener(async () => {
    // create() replaces any existing alarm with the same name — safe on update.
    chrome.alarms.create('syncFlush', { periodInMinutes: 1 })
    // Inject content script into any already-open matching tabs on install/update
    injectIntoExistingTabs()
    // Kick off a flush + site refresh now that we know the SW is alive
    const token = await getAuthToken()
    if (token) { flushPending(); fetchCustomSites(); fetchLibraryTitles(); fetchParserConfigs() }
  })

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== 'syncFlush') return
    const token = await getAuthToken()
    if (token) flushPending()
  })
} else {
  // Alarms permission not yet granted — happens only on first load before
  // manifest is reloaded. Log once and continue; reload the extension to fix.
  console.warn('[YOMU] chrome.alarms unavailable — reload the extension at chrome://extensions to apply the new "alarms" permission.')
}

// Also flush immediately when network comes back online
self.addEventListener('online', async () => {
  const token = await getAuthToken()
  if (token) flushPending()
})

// ── Fix 3: Auth token — always read from storage, never trust in-memory alone
// The MV3 service worker is terminated after ~30s idle. When it wakes up,
// all in-memory variables are reset to null. Reading from storage directly
// on every auth-dependent call eliminates the race window between SW wake
// and the async storage.get callback completing.
let _cachedToken = null

async function getAuthToken() {
  if (_cachedToken) return _cachedToken
  const d = await chrome.storage.local.get(['yomu_auth_token'])
  _cachedToken = d.yomu_auth_token || null
  return _cachedToken
}

function setAuthToken(token) {
  _cachedToken = token
  if (token) {
    chrome.storage.local.set({ yomu_auth_token: token })
  } else {
    chrome.storage.local.remove('yomu_auth_token')
  }
}

// ── Token harvest helper ──────────────────────────────────────────────────
// Runs the cookie/localStorage harvest script in a YOMU tab and updates the
// stored token. Used both on tab load and as auto-reconnect after a 401.
async function harvestTokenFromTab(tabId) {
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: () => {
        try {
          const jar = {}
          document.cookie.split(';').forEach(c => {
            const eq = c.indexOf('=')
            if (eq < 0) return
            jar[c.slice(0, eq).trim()] = c.slice(eq + 1).trim()
          })
          const parts = Object.keys(jar)
            .filter(k => k.includes('sb-') && k.includes('auth-token'))
            .sort()
          if (parts.length > 0) {
            let b64 = ''
            parts.forEach((k, i) => {
              let v = decodeURIComponent(jar[k])
              if (i === 0 && v.startsWith('base64-')) v = v.slice(7)
              b64 += v
            })
            const parsed = JSON.parse(atob(b64))
            if (parsed?.access_token) return parsed.access_token
          }
        } catch {}
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (!key) continue
          try {
            const val = JSON.parse(localStorage.getItem(key) || '')
            const token = val?.access_token || val?.currentSession?.access_token || val?.session?.access_token
            if (token && typeof token === 'string') return token
          } catch {}
        }
        return null
      },
    })
    const raw = results?.[0]?.result
    return (typeof raw === 'string' && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(raw)) ? raw : null
  } catch { return null }
}

// Attempt to re-harvest a fresh token from any open YOMU tab.
// Called on API 401 responses so the extension reconnects automatically
// without the user having to navigate back to YOMU.
async function tryRefreshToken() {
  try {
    const tabs = await chrome.tabs.query({ url: `*://${YOMU_HOST}/*` })
    if (tabs.length === 0) return
    const token = await harvestTokenFromTab(tabs[0].id)
    if (token && token !== _cachedToken) {
      setAuthToken(token)
      flushPending()
      fetchCustomSites()
    }
  } catch { /* no accessible YOMU tab */ }
}

// ── Fix 3 (Gemini): No top-level network calls ────────────────────────────
// MV3 service workers must complete their synchronous init phase immediately.
// Any network I/O or storage reads at the top level can block worker
// registration and cause "Service Worker termination" errors in DevTools.
// All startup work (flush, custom-site fetch) is deferred to event handlers
// (onInstalled above, onAlarm, onMessage) — never executed at module scope.

// ── Library title cache (bug c fix) ──────────────────────────────────────
// For mixed platforms (Netflix, Prime, Disney+, etc.) we must verify the
// scraped title is an anime the user actually tracks before recording stats.
// This prevents live-action shows from polluting watch-time and episode counts.
// Cache is a Set of normalised titles stored in chrome.storage.local.
// Refreshed on every auth and when a new entry is created via the API.

function normaliseTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '')
}

async function fetchLibraryTitles() {
  const token = await getAuthToken()
  if (!token) return
  try {
    const res = await fetch(`${YOMU_URL}/api/library-titles`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return
    const data = await res.json()
    const titles = Array.isArray(data.titles) ? data.titles : []
    // Store normalised forms for fast matching
    chrome.storage.local.set({ yomu_library_titles: titles.map(normaliseTitle) })
  } catch { /* keep stale cache */ }
}

// Returns true if title fuzzy-matches any entry in the cached library.
// Uses normalised substring matching — good enough to catch "Spy x Family"
// matching "spy x family" or "Spy × Family".
async function matchesLibraryTitle(title) {
  const needle = normaliseTitle(title)
  if (!needle) return false
  const d = await chrome.storage.local.get(['yomu_library_titles'])
  const haystack = d.yomu_library_titles || []
  // Accept if any stored title contains needle or needle contains it
  return haystack.some(h => h.includes(needle) || needle.includes(h))
}

// ── Parser config overrides (item 5) ─────────────────────────────────────
// Fetches per-domain parser overrides from the YOMU server. These override
// built-in CSS selectors / regexes without needing a Chrome Web Store update.
// Format: [{ domain, titleSelector, episodeSelector, titleRegex, episodeRegex, disabled }]
async function fetchParserConfigs() {
  try {
    const res = await fetch(`${YOMU_URL}/api/parser-configs`)
    if (!res.ok) return
    const configs = await res.json()
    if (Array.isArray(configs)) {
      chrome.storage.local.set({ yomu_parser_configs: configs })
    }
  } catch { /* keep stale cache */ }
}

// ── Fribb anime-check fallback (item 3) ──────────────────────────────────
// When a title doesn't match the user's library cache, query the server to
// check if it's a known anime title (via Fribb/anime-lists database).
// Returns true if the title resolves to an anime — allows the watch-event
// API to attempt a server-side pg_trgm match even for recently-added titles.
async function isKnownAnimeTitle(title) {
  const token = await getAuthToken()
  if (!token) return false
  try {
    const params = new URLSearchParams({ title })
    const res = await fetch(`${YOMU_URL}/api/anime-check?${params}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return false
    const data = await res.json()
    return !!data.isAnime
  } catch { return false }
}

// ── Custom streaming sites ────────────────────────────────────────────────
async function fetchCustomSites() {
  const token = await getAuthToken()
  if (!token) return
  try {
    const res = await fetch(`${YOMU_URL}/api/streaming-sites`, {
      headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return
    const sites = await res.json()
    const hostnames = Array.isArray(sites) ? sites.map(s => s.hostname) : []
    chrome.storage.local.set({ yomu_custom_sites: hostnames })
  } catch { /* network error — keep last cached list */ }
}

// ── Fix 2: Dynamic content script injection ───────────────────────────────
// Instead of injecting content.js into EVERY page (<all_urls> static match),
// we only inject when a tab navigates to a known anime/streaming site or a
// user-added custom site. This stops content.js from running on bank sites,
// Google Docs, email, etc.

const DEDICATED_ANIME_SITES = new Set([
  'crunchyroll.com', 'funimation.com', 'hidive.com',
  'aniwatch.to', 'hianime.to', 'aniwatchtv.to',
  '9anime.to', '9anime.gg', '9anime.rs',
  'gogoanime.by', 'gogoanime.gg', 'gogoanimes.net',
  'anitaku.pe', 'anitaku.be',
  'aniwaves.ru', 'aniwaves.com',
  'bilibili.tv', 'vrv.co', 'retrocrush.tv',
])

const KNOWN_STREAMING_PLATFORMS = new Set([
  'netflix.com', 'primevideo.com', 'disneyplus.com',
  'max.com', 'hulu.com', 'tv.apple.com',
  'tubi.tv', 'tubitv.com',
])

function isDedicatedAnimeSite(site) {
  const lower = (site || '').toLowerCase()
  return [...DEDICATED_ANIME_SITES].some(s => lower === s || lower.endsWith('.' + s) || lower.includes(s))
}

function isKnownStreamingPlatform(site) {
  const lower = (site || '').toLowerCase()
  return [...KNOWN_STREAMING_PLATFORMS].some(s => lower === s || lower.endsWith('.' + s) || lower.includes(s))
}

async function shouldInjectContentScript(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    if (isDedicatedAnimeSite(host) || isKnownStreamingPlatform(host)) return true
    const d = await chrome.storage.local.get(['yomu_custom_sites'])
    const custom = d.yomu_custom_sites || []
    return custom.some(h => host === h || host.endsWith('.' + h))
  } catch { return false }
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js'],
    })
  } catch { /* tab may have closed or be a chrome:// URL */ }
}

// Inject into any already-open tabs on extension install/update
async function injectIntoExistingTabs() {
  const tabs = await chrome.tabs.query({})
  for (const tab of tabs) {
    if (tab.url && await shouldInjectContentScript(tab.url)) {
      await injectContentScript(tab.id)
    }
  }
}

// ── Grab auth token + inject content script when user visits any tracked site
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return

  // ── Token harvest: when user visits YOMU ──────────────────────────────
  if (tab.url.includes(YOMU_HOST)) {
    try {
      const token = await harvestTokenFromTab(tabId)
      if (token && token !== _cachedToken) {
        setAuthToken(token)
        flushPending()
        fetchCustomSites()
        fetchLibraryTitles()
        fetchParserConfigs()
        chrome.action.setBadgeText({ text: '✓' })
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000)
      }
    } catch { /* scripting permission denied on some pages */ }

    // ── Fix 4: Inject auth-push + library-refresh listeners on YOMU tabs.
    // • YOMU_PUSH_TOKEN  — Next.js app pushes fresh JWT on login (existing)
    // • YOMU_REFRESH_LIBRARY — background calls chrome.tabs.sendMessage after a
    //   confirmed watch event; we relay it as a CustomEvent into the page so
    //   app/page.tsx can call fetchManga() immediately (bug e fix).
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          if (window.__yomuAuthListenerActive) return
          window.__yomuAuthListenerActive = true
          // Auth token push from Next.js app
          window.addEventListener('message', e => {
            if (e.source !== window) return
            if (e.data?.type !== 'YOMU_PUSH_TOKEN') return
            const t = e.data.token
            if (!t || typeof t !== 'string') return
            chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token: t }).catch(() => {})
          })
          // Library-refresh relay from background service worker
          chrome.runtime.onMessage.addListener(msg => {
            if (msg?.type === 'YOMU_REFRESH_LIBRARY') {
              window.dispatchEvent(new CustomEvent('yomu:watch-event'))
            }
          })
        },
      })
    } catch {}
  }

  // ── Dynamic content script injection for streaming sites ─────────────
  if (await shouldInjectContentScript(tab.url)) {
    await injectContentScript(tabId)
  }
})

// ── Fix 1: Dedup via chrome.storage.session ───────────────────────────────
// Two separate dedup windows:
//   • Completion events (is_complete=true):  300 000ms — once-per-episode, idempotent
//   • Progress pings   (is_complete=false):   10 000ms — only block rapid-fire true duplicates;
//     a 300 s window was suppressing ~9 of every 10 legitimate 30 s progress updates (bug b).
async function isDuplicate(key, isComplete) {
  const d = await chrome.storage.session.get(['yomu_dedup'])
  const dedup = d.yomu_dedup || {}
  const now   = Date.now()
  const window = isComplete ? 300_000 : 10_000
  if (dedup[key] && now - dedup[key] < window) return true
  // Not a duplicate — record and prune stale entries while we're here
  dedup[key] = now
  for (const k of Object.keys(dedup)) {
    if (now - dedup[k] > 600_000) delete dedup[k]
  }
  await chrome.storage.session.set({ yomu_dedup: dedup })
  return false
}

// ── Message handler ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'WATCH_EVENT':
      handleEvent(msg.payload)
      break
    case 'SET_AUTH_TOKEN': {
      const senderHost = (() => { try { return new URL(_sender.tab?.url ?? _sender.url ?? '').hostname } catch { return '' } })()
      const isYomu = senderHost === YOMU_HOST || senderHost.endsWith('.' + YOMU_HOST)
      if (!isYomu) { sendResponse({ ok: false, reason: 'untrusted origin' }); return true }
      const looksLikeJwt = typeof msg.token === 'string' && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(msg.token)
      if (looksLikeJwt && msg.token !== _cachedToken) {
        setAuthToken(msg.token)
        flushPending()
        fetchCustomSites()
        fetchLibraryTitles()
        fetchParserConfigs()
        chrome.action.setBadgeText({ text: '✓' })
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000)
      }
      sendResponse({ ok: looksLikeJwt, connected: !!_cachedToken })
      return true
    }
    case 'GET_STATUS':
      getAuthToken().then(t => sendResponse({ connected: !!t }))
      return true
    case 'DISCONNECT':
      setAuthToken(null)
      sendResponse({ ok: true })
      return true
    case 'GET_LAST_TRACKED':
      chrome.storage.local.get(['yomu_last_tracked'], d => sendResponse(d.yomu_last_tracked || null))
      return true
    case 'GET_SESSION_STATS':
      chrome.storage.local.get(['yomu_session_stats'], d => {
        let stats = d.yomu_session_stats
        if (!stats || stats.date !== todayKey()) {
          stats = freshStats()
          chrome.storage.local.set({ yomu_session_stats: stats })
        }
        sendResponse(stats)
      })
      return true
    case 'GET_CUSTOM_SITES':
      chrome.storage.local.get(['yomu_custom_sites'], d => sendResponse(d.yomu_custom_sites || []))
      return true
    case 'GET_TAB_CONTEXT': {
      const tabId = _sender.tab?.id
      if (!tabId) { sendResponse(null); return true }
      chrome.tabs.get(tabId, tab => {
        if (chrome.runtime.lastError || !tab) { sendResponse(null); return }
        sendResponse({ url: tab.url || '', title: tab.title || '' })
      })
      return true
    }
  }
})

// ── Fix 5: Idle detection ─────────────────────────────────────────────────
// Before processing a watch event, check if the user has been idle for more
// than 15 minutes. If so, skip accumulating watch time — this prevents
// autoplay from silently tracking an entire season while the user is asleep.
function checkIdleState() {
  return new Promise(resolve => {
    chrome.idle.queryState(IDLE_THRESHOLD_SECONDS, state => resolve(state))
  })
}

// ── Core event handler ────────────────────────────────────────────────────
async function handleEvent(payload) {
  // Fix 5: Bail out if user is idle / screen locked
  const idleState = await checkIdleState()
  if (idleState !== 'active') return

  // Fix 1: Dedup via storage.session (survives SW restarts)
  // Pass is_complete so completion events use 300s window, progress pings use 10s (bug b fix)
  const dedupKey = `${payload.title}||${payload.episode}||${payload.is_complete}`
  if (await isDuplicate(dedupKey, payload.is_complete)) return

  const dedicated = isDedicatedAnimeSite(payload.site)
  const streaming = !dedicated && isKnownStreamingPlatform(payload.site)

  // Bug (c) fix: for mixed platforms (Netflix, Prime, etc.) verify the title
  // resolves to an anime in the user's library before recording anything.
  // Fribb fallback (item 3): if the title isn't in the library cache but the
  // server-side Fribb database recognises it as anime, let it through anyway —
  // the watch-event API's pg_trgm match may still find a library entry, and
  // if not it returns action:'ignored' harmlessly.
  if (streaming) {
    const inLibrary = await matchesLibraryTitle(payload.title)
    if (!inLibrary) {
      const knownAnime = await isKnownAnimeTitle(payload.title)
      if (!knownAnime) return
    }
  }

  if (dedicated || streaming) {
    chrome.storage.local.set({ yomu_last_tracked: { ...payload, receivedAt: new Date().toISOString() } })
    updateSessionStats(payload)
  }

  const token = await getAuthToken()  // Fix 3: always read from storage
  if (!token) {
    if (!dedicated) return
    queuePending(payload)
    return
  }

  await sendToAPI(payload, dedicated)
}

async function sendToAPI(payload, dedicated = true) {
  const token = await getAuthToken()  // Fix 3
  if (!token) { if (dedicated) queuePending(payload); return }
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    if (res.status === 401) {
      tryRefreshToken()
      if (dedicated) queuePending(payload)
      return
    }

    const data = await res.json().catch(() => ({}))
    const isStreaming = isKnownStreamingPlatform(payload.site)
    if (!dedicated && !isStreaming && (data.action === 'updated' || data.action === 'created')) {
      chrome.storage.local.set({ yomu_last_tracked: { ...payload, receivedAt: new Date().toISOString() } })
      updateSessionStats(payload)
    }
    if (data.action === 'created') {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '📦 YOMU — New Anime Added',
        message: `"${payload.title}"${payload.episode ? ` (Ep. ${payload.episode})` : ''} was added to your library from ${payload.site}.`,
        silent: false,
      })
    }
    if (data.action === 'updated' || data.action === 'created') {
      chrome.action.setBadgeText({ text: '●' })
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500)
      // Bug (e) fix: push an immediate library-refresh signal to any open YOMU tab.
      // This replaces the 60 s poll in app/page.tsx for the "extension in foreground" case.
      notifyYomuTabs()
    }
  } catch {
    if (dedicated) queuePending(payload)
  }
}

// ── Bug (e): Instant YOMU tab refresh ────────────────────────────────────
// After a confirmed watch event, push a refresh signal to any open YOMU tabs
// so the library card updates immediately without waiting for the 60 s poll.
// Uses chrome.tabs.sendMessage → content script → CustomEvent into the page.
// Gemini: skip tab.discarded tabs — sending to a discarded tab either fails
// silently or wastefully re-activates a suspended tab, consuming RAM/CPU.
function notifyYomuTabs() {
  chrome.tabs.query({ url: `*://${YOMU_HOST}/*` }, tabs => {
    for (const tab of tabs) {
      if (tab.discarded) continue  // skip suspended/discarded tabs
      chrome.tabs.sendMessage(tab.id, { type: 'YOMU_REFRESH_LIBRARY' }).catch(() => {})
    }
  })
}

// ── Pending queue (offline / not logged in yet) ───────────────────────────
function queuePending(payload) {
  chrome.storage.local.get(['yomu_pending'], d => {
    const queue = (d.yomu_pending || []).filter(e =>
      !(e.title === payload.title && e.episode === payload.episode && e.is_complete === payload.is_complete)
    )
    const item = {
      ...payload,
      idempotency_key: payload.idempotency_key ?? crypto.randomUUID(),
      retryCount: 0,
    }
    queue.push(item)
    chrome.storage.local.set({ yomu_pending: queue.slice(-100) })
  })
}

async function flushPending() {
  if (!navigator.onLine) return
  const token = await getAuthToken()  // Fix 3
  if (!token) return
  chrome.storage.local.get(['yomu_pending'], async d => {
    const queue = d.yomu_pending || []
    if (queue.length === 0) return
    try {
      const res = await fetch(BATCH_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ events: queue }),
      })
      if (res.ok) {
        const flushedKeys = new Set(queue.map(e => e.idempotency_key))
        chrome.storage.local.get(['yomu_pending'], d2 => {
          const remaining = (d2.yomu_pending || []).filter(e => !flushedKeys.has(e.idempotency_key))
          chrome.storage.local.set({ yomu_pending: remaining })
        })
      } else if (res.status >= 500) {
        chrome.storage.local.get(['yomu_pending'], d2 => {
          const updated = (d2.yomu_pending || [])
            .map(e => queue.find(q => q.idempotency_key === e.idempotency_key)
              ? { ...e, retryCount: (e.retryCount || 0) + 1 } : e)
            .filter(e => (e.retryCount || 0) <= MAX_RETRIES)
          chrome.storage.local.set({ yomu_pending: updated })
        })
      } else if (res.status === 401) {
        tryRefreshToken()
      }
    } catch { /* network failure — leave queue intact, alarm will retry in 1 min */ }
  })
}

// ── Local stats aggregation ───────────────────────────────────────────────
function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function freshStats() {
  return {
    total_watch_minutes: 0,
    episodes_completed: 0,
    titles_seen: [],
    sites_used: [],
    date: todayKey(),
    session_progress: {},
    completed_keys: [],
  }
}

function updateSessionStats(payload) {
  chrome.storage.local.get(['yomu_session_stats'], d => {
    let stats = d.yomu_session_stats
    if (!stats || stats.date !== todayKey()) stats = freshStats()
    if (!stats.session_progress) stats.session_progress = {}
    if (!stats.completed_keys)   stats.completed_keys   = []

    const sessionKey = `${payload.title}||${payload.episode ?? 'null'}`
    const prev    = stats.session_progress[sessionKey] ?? 0
    const current = Math.max(0, payload.watched_seconds || 0)
    // Clamp delta to 2× the heartbeat interval (~60 s) so seeks/skips don't inflate watch time.
    // Never call Math.round here — accumulate fractional minutes to avoid the ×2 doubling
    // that Math.round(30/60)=1 per heartbeat caused (bug a fix). Round only at display time.
    const raw   = Math.max(0, current - prev)
    const delta = Math.min(raw, 60)   // MAX_DELTA clamp: 2 × 30 s heartbeat
    stats.session_progress[sessionKey] = Math.max(prev, current)
    stats.total_watch_minutes = (stats.total_watch_minutes || 0) + delta / 60

    if (payload.is_complete && !stats.completed_keys.includes(sessionKey)) {
      stats.completed_keys.push(sessionKey)
      stats.episodes_completed++
    }
    if (!stats.titles_seen.includes(payload.title)) stats.titles_seen.push(payload.title)
    if (!stats.sites_used.includes(payload.site))   stats.sites_used.push(payload.site)
    chrome.storage.local.set({ yomu_session_stats: stats })
  })
}
