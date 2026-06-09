// YOMU Watch Tracker — Background Service Worker (Manifest V3)
// Receives watch events from content scripts, authenticates with YOMU,
// and syncs data to the server.

'use strict';

const YOMU_URL   = 'https://manga-tracker-hazel.vercel.app'
const API_URL    = `${YOMU_URL}/api/watch-event`
const YOMU_HOST  = 'manga-tracker-hazel.vercel.app'

// ── Auth state ────────────────────────────────────────────────────────────
let authToken = null

// Load token + custom sites from storage on startup
chrome.storage.local.get(['yomu_auth_token', 'yomu_custom_sites'], d => {
  authToken = d.yomu_auth_token || null
  if (authToken) {
    flushPending()
    fetchCustomSites()
  }
})

// ── Custom streaming sites ────────────────────────────────────────────────
// Fetched from YOMU after auth; stored in chrome.storage.local so content.js
// can read them synchronously via GET_CUSTOM_SITES message.
async function fetchCustomSites() {
  if (!authToken) return
  try {
    const res = await fetch(`${YOMU_URL}/api/streaming-sites`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    })
    if (!res.ok) return
    const sites = await res.json()
    const hostnames = Array.isArray(sites) ? sites.map(s => s.hostname) : []
    chrome.storage.local.set({ yomu_custom_sites: hostnames })
  } catch { /* network error — keep last cached list */ }
}

// ── Grab auth token whenever user visits YOMU ─────────────────────────────
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return
  if (!tab.url?.includes(YOMU_HOST)) return

  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN', // access page's localStorage
      func: () => {
        // @supabase/ssr stores session in cookies (sb-*-auth-token.0 / .1)
        // split + base64-encoded. Try cookies first, fallback to localStorage.
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
        // Fallback: localStorage (non-SSR supabase-js)
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

    // Accept only valid-looking JWTs (3 base64url segments) — never full session objects
    const raw = results?.[0]?.result
    const token = (typeof raw === 'string' && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(raw)) ? raw : null
    if (token && token !== authToken) {
      authToken = token
      chrome.storage.local.set({ yomu_auth_token: token })
      // Flush any pending events now that we're authenticated
      flushPending()
      fetchCustomSites()
      // Update badge to show we're connected
      chrome.action.setBadgeText({ text: '✓' })
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000)
    }
  } catch { /* scripting permission denied on some pages */ }
})

// ── Dedup map: same title+episode = don't send more than once per 5 min ──
const recentKeys = new Map()   // key → timestamp
// Prune entries older than 10 minutes every 30 minutes to prevent unbounded growth
setInterval(() => {
  const cutoff = Date.now() - 600_000
  for (const [k, ts] of recentKeys) { if (ts < cutoff) recentKeys.delete(k) }
}, 1_800_000)

// ── Message handler ───────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case 'WATCH_EVENT':
      handleEvent(msg.payload)
      break
    case 'SET_AUTH_TOKEN': {
      // Only accept tokens sent from our own YOMU origin — reject any other page
      const senderHost = (() => { try { return new URL(_sender.tab?.url ?? _sender.url ?? '').hostname } catch { return '' } })()
      const isYomu = senderHost === YOMU_HOST || senderHost.endsWith('.' + YOMU_HOST)
      if (!isYomu) { sendResponse({ ok: false, reason: 'untrusted origin' }); return true }

      // Accept only plausible JWTs (3 dot-separated base64 segments)
      const looksLikeJwt = typeof msg.token === 'string' && /^[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+$/.test(msg.token)
      if (looksLikeJwt && msg.token !== authToken) {
        authToken = msg.token
        // Store only the access token — never the full session object
        chrome.storage.local.set({ yomu_auth_token: authToken })
        flushPending()
        fetchCustomSites()
        chrome.action.setBadgeText({ text: '✓' })
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
        setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000)
      }
      sendResponse({ ok: looksLikeJwt, connected: !!authToken })
      return true
    }
    case 'GET_STATUS':
      sendResponse({ connected: !!authToken })
      return true
    case 'DISCONNECT':
      authToken = null
      chrome.storage.local.remove('yomu_auth_token')
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
      // Content script running inside an iframe needs the parent tab's URL
      // + title so site parsers can identify the show correctly
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

// ── Dedicated anime streaming sites ─────────────────────────────────────
// For these sites we trust all content is anime — log locally immediately
// and allow auto-creating new library entries.
const DEDICATED_ANIME_SITES = new Set([
  'crunchyroll.com', 'funimation.com', 'hidive.com',
  'aniwatch.to', 'hianime.to', 'aniwatchtv.to',
  '9anime.to', '9anime.gg', '9anime.rs',
  'gogoanime.by', 'gogoanime.gg', 'gogoanimes.net',
  'anitaku.pe', 'anitaku.be',
  'aniwaves.ru', 'aniwaves.com',
  'bilibili.tv', 'vrv.co', 'retrocrush.tv',
])

// ── Known streaming platforms ─────────────────────────────────────────────
// These carry anime but also other content. We trust the title enough to
// update NOW TRACKING and local stats immediately (so the popup shows the
// right show), but we still rely on an API library-match to update the DB
// and we never auto-create new entries for these sites.
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

// ── Core event handler ────────────────────────────────────────────────────
async function handleEvent(payload) {
  // Dedup: same title+episode+is_complete within 5 minutes
  const dedupKey = `${payload.title}||${payload.episode}||${payload.is_complete}`
  const now = Date.now()
  if (recentKeys.has(dedupKey) && now - recentKeys.get(dedupKey) < 300_000) return
  recentKeys.set(dedupKey, now)

  const dedicated = isDedicatedAnimeSite(payload.site)
  const streaming = !dedicated && isKnownStreamingPlatform(payload.site)

  if (dedicated || streaming) {
    // Log locally straight away so the popup shows NOW TRACKING immediately.
    // For streaming platforms this is optimistic — the DB update still requires
    // an API library match. YouTube and other unknowns are still fully gated.
    chrome.storage.local.set({ yomu_last_tracked: { ...payload, receivedAt: new Date().toISOString() } })
    updateSessionStats(payload)
  }

  if (!authToken) {
    if (!dedicated) {
      // No auth — skip DB update (streaming platforms already got local stats above)
      return
    }
    queuePending(payload)
    return
  }

  await sendToAPI(payload, dedicated)
}

async function sendToAPI(payload, dedicated = true) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    })

    if (res.status === 401) {
      // Token expired
      authToken = null
      chrome.storage.local.remove('yomu_auth_token')
      if (dedicated) queuePending(payload)
      return
    }

    const data = await res.json().catch(() => ({}))

    // For non-dedicated, non-streaming sites (YouTube, unknown sites) only log
    // locally if the API confirmed a library match. Streaming platforms
    // (Netflix, Prime, etc.) already got optimistic local tracking in handleEvent
    // so we skip the double-update here to avoid double-counting stats.
    const isStreaming = isKnownStreamingPlatform(payload.site)
    if (!dedicated && !isStreaming && (data.action === 'updated' || data.action === 'created')) {
      chrome.storage.local.set({ yomu_last_tracked: { ...payload, receivedAt: new Date().toISOString() } })
      updateSessionStats(payload)
    }

    if (data.action === 'created') {
      // New anime detected — notify user
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: '📦 YOMU — New Anime Added',
        message: `"${payload.title}"${payload.episode ? ` (Ep. ${payload.episode})` : ''} was added to your library from ${payload.site}.`,
        silent: false,
      })
    }

    if (data.action === 'updated' || data.action === 'created') {
      // Green flash on badge
      chrome.action.setBadgeText({ text: '●' })
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e' })
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2500)
    }

  } catch {
    // Network error — queue for later (dedicated sites only)
    if (dedicated) queuePending(payload)
  }
}

// ── Pending queue (offline / not logged in yet) ───────────────────────────
function queuePending(payload) {
  chrome.storage.local.get(['yomu_pending'], d => {
    const queue = (d.yomu_pending || []).filter(e =>
      // Deduplicate queue too
      !(e.title === payload.title && e.episode === payload.episode && e.is_complete === payload.is_complete)
    )
    queue.push(payload)
    chrome.storage.local.set({ yomu_pending: queue.slice(-100) })
  })
}

function flushPending() {
  chrome.storage.local.get(['yomu_pending'], async d => {
    const queue = d.yomu_pending || []
    if (queue.length === 0) return
    // Process one-by-one and remove from storage only after each successful send.
    // Do NOT bulk-remove upfront: if the MV3 service worker is terminated mid-flush,
    // any remaining items stay in storage and are retried on the next SW wake.
    for (const payload of queue) {
      await sendToAPI(payload)
      // Remove this specific payload from the stored queue
      await new Promise(resolve => {
        chrome.storage.local.get(['yomu_pending'], d2 => {
          const remaining = (d2.yomu_pending || []).filter(e =>
            !(e.title === payload.title && e.episode === payload.episode && e.is_complete === payload.is_complete)
          )
          chrome.storage.local.set({ yomu_pending: remaining }, resolve)
        })
      })
      await delay(300)
    }
  })
}

// ── Local stats aggregation ───────────────────────────────────────────────
function todayKey() {
  // Returns 'YYYY-MM-DD' in local time
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
    // session_progress: tracks last-seen watched_seconds per session key so we
    // can compute deltas instead of re-adding the full cumulative total each tick.
    // completed_keys: prevents double-counting episodes_completed when 85%-done
    // fires before the actual "ended" event.
    session_progress: {},
    completed_keys: [],
  }
}

function updateSessionStats(payload) {
  chrome.storage.local.get(['yomu_session_stats'], d => {
    let stats = d.yomu_session_stats
    // Reset if it's a new day
    if (!stats || stats.date !== todayKey()) stats = freshStats()
    // Ensure fields added after initial schema exist
    if (!stats.session_progress) stats.session_progress = {}
    if (!stats.completed_keys)   stats.completed_keys   = []

    // Delta tracking: payload.watched_seconds is cumulative (grows every heartbeat).
    // Only add the increase since the last reported value to avoid counting the same
    // time repeatedly across multiple heartbeat pings.
    const sessionKey = `${payload.title}||${payload.episode ?? 'null'}`
    const prev    = stats.session_progress[sessionKey] ?? 0
    const current = Math.max(0, payload.watched_seconds || 0)
    const delta   = Math.max(0, current - prev)
    stats.session_progress[sessionKey] = Math.max(prev, current)
    stats.total_watch_minutes += Math.round(delta / 60)

    // Count each completed episode only once (85%-threshold and "ended" can both fire)
    if (payload.is_complete && !stats.completed_keys.includes(sessionKey)) {
      stats.completed_keys.push(sessionKey)
      stats.episodes_completed++
    }

    if (!stats.titles_seen.includes(payload.title)) stats.titles_seen.push(payload.title)
    if (!stats.sites_used.includes(payload.site))   stats.sites_used.push(payload.site)
    chrome.storage.local.set({ yomu_session_stats: stats })
  })
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
