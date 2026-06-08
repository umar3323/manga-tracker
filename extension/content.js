// YOMU Watch Tracker — Content Script
// Injected into every page. Finds video elements, tracks playback,
// parses the anime title + episode from the URL/page title,
// and sends events to the background worker.

'use strict';

// ── Site parsers ──────────────────────────────────────────────────────────
// Each parser: { match: RegExp, parse(url, title, doc) → {title, episode, season} | null }

const PARSERS = [
  // ── aniwaves.ru / aniwaves.com ─────────────────────────────────────────
  {
    match: /aniwaves\./i,
    parse(url, title) {
      // URL patterns: /watch/one-piece-episode-1100
      //               /anime/one-piece/1/1100
      // Episode from /ep-N path segment (aniwaves uses /watch/slug-ID/ep-N)
      const epPath = url.match(/\/ep-(\d+(?:\.\d+)?)/i)
      const epFromPath = epPath ? +epPath[1] : null

      let m = url.match(/\/watch\/([^/?#]+)/i)
      if (m) {
        const slug = m[1]
        // Old pattern: slug itself contains -episode-N
        const epSlug = slug.match(/-episode-(\d+(?:\.\d+)?)/i)
        const ep = epSlug ? +epSlug[1] : epFromPath
        // Strip trailing numeric ID (e.g. -79380) and -episode-N
        const name = slug
          .replace(/-episode-\d+(?:\.\d+)?$/i, '')
          .replace(/-\d+$/i, '')                  // strip aniwaves show ID
          .replace(/-/g, ' ').trim()
        if (name.length > 1) return { title: tc(name), episode: ep, season: null }
      }
      // /anime/slug/season/episode
      m = url.match(/\/anime\/([^/?#]+)\/(\d+)\/(\d+)/i)
      if (m) return { title: tc(m[1].replace(/-/g, ' ')), episode: +m[3], season: +m[2] }

      // Tab title fallback: "Aniwave - Show Name (Year) — Episode N: Episode Title"
      if (title) {
        let t = title
          .replace(/^aniwave\s*[-–]\s*/i, '')      // strip "Aniwave - " prefix
          .replace(/\s*[—–]\s*.*$/i, '')            // strip " — Episode N: Title"
          .replace(/\s*\(\d{4}\)\s*$/i, '')         // strip trailing " (2003)"
          .trim()
        const epM2 = title.match(/episode\s*(\d+)/i) || title.match(/\/ep-(\d+)/i)
        const ep2  = epM2 ? +epM2[1] : epFromPath
        if (t.length > 1) return { title: t, episode: ep2, season: null }
      }
      return fromTitle(title)
    }
  },

  // ── GogoAnime / Anitaku / Gogoanime.by ────────────────────────────────
  {
    match: /(gogoanime|anitaku|gogotaku|gogocdn|gogoanimes)\./i,
    parse(url, title) {
      const m = url.match(/\/([^/?#]+)-episode-(\d+(?:\.\d+)?)/i)
      if (m) return { title: tc(m[1].replace(/-/g, ' ')), episode: +m[2], season: null }
      return fromTitle(title)
    }
  },

  // ── Aniwatch / Zoro / HiAnime ─────────────────────────────────────────
  {
    match: /(aniwatch|zoro\.to|hianime|aniwatchtv)\./i,
    parse(url, title) {
      // /watch/title-12345?ep=678
      const m    = url.match(/\/watch\/([^/?#]+)/i)
      const epQS = new URL(url).searchParams.get('ep')
      const name = m ? m[1].replace(/-\d+$/, '').replace(/-/g, ' ').trim() : null
      const ep   = epQS ? +epQS : (title.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)?.[1] ? +title.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)[1] : null)
      if (name) return { title: tc(name), episode: ep, season: null }
      return fromTitle(title)
    }
  },

  // ── 9anime ────────────────────────────────────────────────────────────
  {
    match: /9anime\./i,
    parse(url, title) {
      const m = url.match(/\/watch\/([^/?#.]+)/i)
      if (m) {
        const name = m[1].replace(/-[a-z0-9]+$/, '').replace(/-/g, ' ').trim()
        const ep   = title.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)?.[1]
        return { title: tc(name), episode: ep ? +ep : null, season: null }
      }
      return fromTitle(title)
    }
  },

  // ── Crunchyroll ───────────────────────────────────────────────────────
  {
    match: /crunchyroll\.com/i,
    parse(url, title) {
      // Title format: "Show Name - Episode 5 | Crunchyroll"
      const t    = title.replace(/\s*[|–-]\s*crunchyroll.*/i, '').trim()
      const epM  = t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)
      const ep   = epM ? +epM[1] : null
      const show = t.split(/\s*[–-]\s*ep(?:isode)?\s*\d+/i)[0]?.trim() ||
                   t.split(/\s*ep(?:isode)?\s*\d+/i)[0]?.trim() || t
      return { title: show, episode: ep, season: null }
    }
  },

  // ── Funimation / HiDive ──────────────────────────────────────────────
  {
    match: /(funimation|hidive)\./i,
    parse(url, title) { return fromTitle(title) }
  },

  // ── Netflix ───────────────────────────────────────────────────────────
  // Netflix titles: "Show Name | Netflix" or "Show Name - Season 1 Episode 3 - Netflix"
  {
    match: /netflix\.com/i,
    parse(url, title) {
      const t   = title.replace(/\s*[-|]\s*netflix.*/i, '').trim()
      const epM = t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i) || t.match(/\bE(\d+)\b/)
      const sM  = t.match(/\bseason\s*(\d+)/i) || t.match(/\bS(\d+)\b/i)
      const show = t
        .replace(/\s*[-–]\s*season\s*\d+.*/i, '')
        .replace(/\s*[-–]\s*S\d+.*/i, '')
        .trim()
      return { title: show || t, episode: epM ? +epM[1] : null, season: sM ? +sM[1] : null }
    }
  },

  // ── Amazon Prime Video ────────────────────────────────────────────────
  {
    match: /primevideo\.com/i,
    parse(url, title) {
      const t   = title.replace(/\s*[-|]\s*(prime video|amazon).*/i, '').trim()
      const epM = t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)
      return { title: t, episode: epM ? +epM[1] : null, season: null }
    }
  },
];

// Generic title parser — last resort
function fromTitle(title) {
  if (!title) return null
  let t = title
    // Strip leading "SiteName - " prefix (e.g. "Aniwave - ", "9anime - ")
    .replace(/^[a-z0-9]+\s*[-–]\s*/i, '')
    // Strip common site suffixes
    .replace(/\s*[-|]\s*(watch|stream|anime|free|hd|eng(?:lish)?(?:\s+sub)?|sub(?:bed)?|dub(?:bed)?)\b.*/i, '')
    .replace(/\s*[-|]\s*[a-z0-9-]+\.(com|ru|net|org|tv|me|to|cc|xyz)\b.*/i, '')
    // Strip episode title after em-dash (e.g. " — : House of Flame")
    .replace(/\s*[—–]\s*:?.*/i, '')
    // Strip trailing year in parens
    .replace(/\s*\(\d{4}\)\s*$/i, '')
    .trim()

  const epM = t.match(/\bep(?:isode)?\s*\.?\s*(\d+(?:\.\d+)?)\b/i)
  const ep  = epM ? +epM[1] : null
  const sM  = t.match(/\bseason\s*(\d+)\b/i) || t.match(/\bS(\d+)E\d+\b/i)
  const sn  = sM ? +sM[1] : null

  let show = t
    .replace(/\s*[-–|]\s*ep(?:isode)?\s*\.?\s*\d+(?:\.\d+)?.*/i, '')
    .replace(/\bep(?:isode)?\s*\.?\s*\d+(?:\.\d+)?/i, '')
    .replace(/\bseason\s*\d+\b/i, '')
    .replace(/\s+/g, ' ').trim()

  if (!show || show.length < 2) return null
  return { title: show, episode: ep, season: sn }
}

function tc(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

function getBestParser() {
  // When inside an iframe, match parsers against the parent page URL (which
  // has the recognisable site hostname), not the iframe's CDN URL.
  const testUrl = (isIframe() && _parentContext?.url) ? _parentContext.url : location.href
  return PARSERS.find(p => p.match.test(testUrl))
    || { parse: (u, t) => fromTitle(t) }
}

// When running inside an iframe (e.g. video player hosted on a CDN domain),
// we can't directly read the parent page's URL/title due to cross-origin
// restrictions. However, the background worker can ask the parent tab for
// its title via chrome.tabs API. We request it via message, then cache it.
let _parentContext = null // { url, title } — populated async for iframes

function isIframe() {
  try { return window.self !== window.top } catch { return true }
}

if (isIframe()) {
  // Ask background for the top-frame context of this tab
  chrome.runtime.sendMessage({ type: 'GET_TAB_CONTEXT' }, res => {
    if (res?.url && res?.title) _parentContext = res
  })
}

function parseCurrentPage() {
  if (isIframe() && _parentContext) {
    // Use parent page URL/title so site parsers work correctly
    return getBestParser().parse(_parentContext.url, _parentContext.title)
      || fromTitle(_parentContext.title)
  }
  return getBestParser().parse(location.href, document.title)
}

function siteName() {
  if (isIframe() && _parentContext) {
    try { return new URL(_parentContext.url).hostname.replace(/^www\./, '') } catch {}
  }
  return location.hostname.replace(/^www\./, '')
}

// ── Session state ─────────────────────────────────────────────────────────
let session     = null   // current watch session
let heartbeat   = null   // interval id
let watched     = null   // current <video> element
let lastUrlCheck = location.href

/*
session shape: {
  title, episode, season, site,
  startedAt, lastTick,
  totalPlaySec,
  videoDuration,
  reportedComplete
}
*/


// ── Video tracking ────────────────────────────────────────────────────────
function attachVideo(video) {
  if (watched === video) return
  if (watched) detachVideo()
  watched = video
  video.addEventListener('play',       onPlay,       { passive: true })
  video.addEventListener('pause',      onPause,      { passive: true })
  video.addEventListener('ended',      onEnded,      { passive: true })
  video.addEventListener('timeupdate', onTimeUpdate, { passive: true })
  if (!video.paused) onPlay()
}

function detachVideo() {
  if (!watched) return
  watched.removeEventListener('play',       onPlay)
  watched.removeEventListener('pause',      onPause)
  watched.removeEventListener('ended',      onEnded)
  watched.removeEventListener('timeupdate', onTimeUpdate)
  watched = null
}

function onPlay() {
  const info = parseCurrentPage()
  if (!info) return

  // New show / episode → new session
  if (!session || session.title !== info.title || session.episode !== info.episode) {
    session = {
      title: info.title,
      episode: info.episode,
      season: info.season,
      site: siteName(),
      startedAt: Date.now(),
      lastTick: Date.now(),
      totalPlaySec: 0,
      videoDuration: watched?.duration || 0,
      reportedComplete: false,
    }
  } else {
    session.lastTick = Date.now()
  }
  startHeartbeat()
}

function onPause() {
  accum()
  stopHeartbeat()
  send(false)
}

function onEnded() {
  accum()
  stopHeartbeat()
  send(true)
}

let _lastTimeUpdate = 0
function onTimeUpdate() {
  if (!session || !watched) return
  const now = Date.now()
  if (now - _lastTimeUpdate < 4000) return
  _lastTimeUpdate = now

  session.videoDuration = watched.duration || session.videoDuration
  const pct = session.videoDuration > 0 ? watched.currentTime / session.videoDuration : 0

  // Treat 85 %+ as "complete" (handles credits skip, abrupt close, etc.)
  if (pct >= 0.85 && !session.reportedComplete) {
    accum()
    send(true)
  }
}

function accum() {
  if (!session) return
  const elapsed = (Date.now() - (session.lastTick || Date.now())) / 1000
  session.totalPlaySec += Math.max(0, elapsed)
  session.lastTick = Date.now()
}

function startHeartbeat() {
  stopHeartbeat()
  heartbeat = setInterval(() => {
    // Guard: extension may have been reloaded — context becomes invalid
    // If so, stop the interval silently instead of throwing
    try {
      if (!chrome.runtime?.id) { stopHeartbeat(); return }
      accum()
      send(false) // progress ping every 30 s
    } catch (e) {
      if (String(e).includes('Extension context invalidated') || String(e).includes('runtime.id')) {
        stopHeartbeat()
      }
    }
  }, 30_000)
}

function stopHeartbeat() {
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null }
}

function send(isComplete) {
  if (!session) return
  if (isComplete && session.reportedComplete) return
  if (isComplete) session.reportedComplete = true
  // Bail out silently if extension context was invalidated (e.g. after reload)
  try { if (!chrome.runtime?.id) return } catch { return }

  const payload = {
    title:            session.title,
    episode:          session.episode,
    season:           session.season,
    site:             session.site,
    duration_seconds: Math.round(session.videoDuration || 0),
    watched_seconds:  Math.round(session.totalPlaySec),
    is_complete:      isComplete,
    timestamp:        new Date().toISOString(),
  }

  chrome.runtime.sendMessage({ type: 'WATCH_EVENT', payload }).catch(() => {})
}

// ── DOM scanning ──────────────────────────────────────────────────────────
function scanForVideos() {
  document.querySelectorAll('video').forEach(v => {
    // Skip very short clips (ads, previews, avatars, etc.)
    const dur = v.duration
    if (!isNaN(dur) && dur > 0 && dur < 180) return  // skip < 3 min
    if (v.videoWidth === 0 && v.videoHeight === 0) return // invisible
    attachVideo(v)
  })
}

// Watch for dynamically injected video elements (most SPA streaming sites)
const domObserver = new MutationObserver(scanForVideos)
domObserver.observe(document.documentElement, { childList: true, subtree: true })
scanForVideos()

// ── SPA navigation detection ──────────────────────────────────────────────
setInterval(() => {
  if (location.href !== lastUrlCheck) {
    lastUrlCheck = location.href
    // New page / episode — reset but keep video detection running
    session = null
    detachVideo()
    setTimeout(scanForVideos, 500) // slight delay for SPA render
  }
}, 1000)

// ── YOMU auth token harvesting ────────────────────────────────────────────
// @supabase/ssr (used by this project) stores the session in COOKIES, not
// localStorage. The cookie is split across two parts:
//   sb-<ref>-auth-token.0  →  "base64-<first-half-of-base64>"
//   sb-<ref>-auth-token.1  →  "<second-half-of-base64>"
// We reassemble them, decode, and extract access_token.
if (!isIframe() && location.hostname.includes('manga-tracker-hazel')) {
  function grabToken() {
    try {
      // ── Cookie approach (supabase/ssr) ──────────────────────────────────
      const jar = {}
      document.cookie.split(';').forEach(c => {
        const eq = c.indexOf('=')
        if (eq < 0) return
        jar[c.slice(0, eq).trim()] = c.slice(eq + 1).trim()
      })

      // Collect all sb-*-auth-token.N parts and sort them
      const PREFIX = 'sb-'
      const SUFFIX = '-auth-token'
      const parts = Object.keys(jar)
        .filter(k => k.startsWith(PREFIX) && k.includes(SUFFIX))
        .sort() // .0 before .1

      if (parts.length > 0) {
        // Reconstruct the base64 payload: strip leading "base64-" from part 0,
        // then concatenate all parts' values
        let b64 = ''
        parts.forEach((k, i) => {
          let v = decodeURIComponent(jar[k])
          if (i === 0 && v.startsWith('base64-')) v = v.slice(7)
          b64 += v
        })
        try {
          const parsed = JSON.parse(atob(b64))
          const token = parsed?.access_token
          if (token && typeof token === 'string' && token.length > 100) return token
        } catch { /* bad base64 */ }
      }

      // ── localStorage fallback (supabase-js v1/v2 non-SSR) ───────────────
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key) continue
        try {
          const val = JSON.parse(localStorage.getItem(key) || '')
          const token = val?.access_token || val?.currentSession?.access_token || val?.session?.access_token
          if (token && typeof token === 'string' && token.length > 100) return token
        } catch { /* not JSON */ }
      }
    } catch { /* sandboxed */ }
    return null
  }

  function tryHarvest() {
    const token = grabToken()
    if (token) {
      chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token }).catch(() => {})
      return true
    }
    return false
  }

  // Try immediately, then retry a few times to handle async Supabase restore
  if (!tryHarvest()) {
    let attempts = 0
    const retryTimer = setInterval(() => {
      attempts++
      if (tryHarvest() || attempts >= 10) clearInterval(retryTimer)
    }, 800)
  }
}
