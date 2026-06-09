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
      chrome.storage.local.get(['yomu_session_stats'], d => sendResponse(d.yomu_session_stats || {}))
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

// ── Core event handler ────────────────────────────────────────────────────
async function handleEvent(payload) {
  // Dedup: same title+episode+is_complete within 5 minutes
  const dedupKey = `${payload.title}||${payload.episode}||${payload.is_complete}`
  const now = Date.now()
  if (recentKeys.has(dedupKey) && now - recentKeys.get(dedupKey) < 300_000) return
  recentKeys.set(dedupKey, now)

  // Track locally regardless of auth state
  chrome.storage.local.set({ yomu_last_tracked: { ...payload, receivedAt: new Date().toISOString() } })
  updateSessionStats(payload)

  if (!authToken) {
    queuePending(payload)
    return
  }

  await sendToAPI(payload)
}

async function sendToAPI(payload) {
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
      queuePending(payload)
      return
    }

    const data = await res.json().catch(() => ({}))

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
    // Network error — queue for later
    queuePending(payload)
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
    chrome.storage.local.remove('yomu_pending')
    for (const payload of queue) {
      await sendToAPI(payload)
      await delay(300) // gentle rate limiting
    }
  })
}

// ── Local stats aggregation ───────────────────────────────────────────────
function updateSessionStats(payload) {
  chrome.storage.local.get(['yomu_session_stats'], d => {
    const stats = d.yomu_session_stats || {
      total_watch_minutes: 0,
      episodes_completed: 0,
      titles_seen: [],
      sites_used: [],
    }
    stats.total_watch_minutes += Math.round((payload.watched_seconds || 0) / 60)
    if (payload.is_complete) stats.episodes_completed++
    if (!stats.titles_seen.includes(payload.title)) stats.titles_seen.push(payload.title)
    if (!stats.sites_used.includes(payload.site)) stats.sites_used.push(payload.site)
    chrome.storage.local.set({ yomu_session_stats: stats })
  })
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
