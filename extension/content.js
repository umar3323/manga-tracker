// YOMU Watch Tracker — Content Script
// Dynamically injected only into known streaming/anime sites.
// Finds video elements, tracks playback, parses the anime title + episode
// from the URL/page title, and sends events to the background worker.

'use strict';

// ── Injection guard ───────────────────────────────────────────────────────
// Dynamic injection (via chrome.scripting.executeScript) can fire more than
// once on the same tab (e.g. on SPA navigations or extension reload).
// Exit immediately if this script is already running in this frame.
if (window.__yomuContentScriptLoaded) {
  // Already loaded in this frame — bail out silently
  throw new Error('YOMU content script already loaded')
}
window.__yomuContentScriptLoaded = true

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
      let epQS = null; try { epQS = new URL(url).searchParams.get('ep') } catch { /* malformed url */ }
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

  // ── Funimation ────────────────────────────────────────────────────────
  // (Funimation merged into Crunchyroll; keeping match so old URLs still work)
  {
    match: /funimation\./i,
    parse(url, title) { return fromTitle(title) }
  },

  // ── HiDive ────────────────────────────────────────────────────────────
  // URL pattern: /stream/show-name/s01e01 or /stream/show-name/s01e01/
  {
    match: /hidive\./i,
    parse(url, title) {
      const m = url.match(/\/stream\/([^/?#]+)\/s(\d+)e(\d+)/i)
      if (m) return { title: tc(m[1].replace(/-/g, ' ')), episode: +m[3], season: +m[2] }
      // Fallback: title "Show Name - Season 1, Episode 5 - HIDIVE"
      return fromTitle(title)
    }
  },

  // ── Netflix ───────────────────────────────────────────────────────────
  // Netflix tab title formats:
  //   "Show Title | Netflix"                        (show/browse page)
  //   "Show Title: Season N: Episode Title (Episode N) | Netflix"
  //   "S1:E5 Episode Title - Show Title | Netflix"  (some regions)
  // DOM scraping priority:
  //   1. Evidence overlay (pause/hover UI) — most reliable, contains h2 title + season/episode
  //   2. Older data-uia player title elements
  //   3. Tab title string parsing
  {
    match: /netflix\.com/i,
    parse(url, title) {
      const t = title.replace(/\s*[\|]\s*netflix.*/i, '').trim()

      let epFromDom = null, sFromDom = null, showFromDom = null
      try {
        // 1. Evidence overlay — shown when paused or hovering during playback.
        //    Structure: container with h2 (show title), h4[data-uia="evidence-overlay-season-title"],
        //    h3[data-uia="evidence-overlay-episode-title"] ("Episode N: Ep. N")
        const seasonEl  = document.querySelector('[data-uia="evidence-overlay-season-title"]')
        const episodeEl = document.querySelector('[data-uia="evidence-overlay-episode-title"]')

        if (seasonEl || episodeEl) {
          // Walk up to find the overlay container, then query for the h2 show title inside it
          const anchor = seasonEl || episodeEl
          const container = anchor.closest('[data-uia*="overlay"], [class*="overlay"], [class*="evidence"]')
                         || anchor.parentElement?.parentElement
                         || anchor.parentElement
          const h2 = container?.querySelector('h2') || null
          if (h2) showFromDom = h2.textContent?.trim() || null

          // "Season 1" → 1
          if (seasonEl) {
            const sm = seasonEl.textContent?.match(/Season\s*(\d+)/i)
            if (sm) sFromDom = +sm[1]
          }
          // "Episode 2: Ep. 2" or "Episode 2" → 2
          if (episodeEl) {
            const em = episodeEl.textContent?.match(/Episode\s*(\d+)/i)
            if (em) epFromDom = +em[1]
          }
        }

        // 2. Older player title elements (fallback for non-overlay state)
        if (!showFromDom) {
          const mainEl = document.querySelector(
            '[data-uia="video-title--main-title"], [data-uia="player-title-main"], ' +
            '[data-uia="video-title"], .watch-title'
          )
          if (mainEl) showFromDom = mainEl.textContent?.trim() || null
        }

        if (!epFromDom) {
          const secEl = document.querySelector(
            '[data-uia="video-title--secondary-title"], [data-uia="player-title-secondary"]'
          )
          const secText = secEl?.textContent?.trim() || ''
          const seM = secText.match(/S(\d+)[:\s]*E(\d+)/i)
          if (seM) { sFromDom = +seM[1]; epFromDom = +seM[2] }
        }

        // 3. Last resort: scan all data-uia elements for S#:E# pattern
        if (!epFromDom) {
          document.querySelectorAll('[data-uia]').forEach(el => {
            if (epFromDom) return
            const m2 = (el.textContent || '').match(/S(\d+)[:\s]*E(\d+)/i)
            if (m2) { sFromDom = +m2[1]; epFromDom = +m2[2] }
          })
        }
      } catch {}

      // 2. Use cached overlay data if available (most reliable — set by MutationObserver)
      if (_netflixCache?.title) {
        return _netflixCache
      }

      // 3. Title string parsing
      // Format A: "S1:E5 Episode Title - Show Title"
      const seM2 = t.match(/S(\d+)[:\s]*E(\d+)/i)
      // Format B: "Show Title: Season N: Episode Title (Episode N)"  ← Netflix colon format
      const colonSeasonM = t.match(/^(.+?):\s*Season\s*(\d+)\s*:/i)
      // Format C: generic episode/season patterns
      const epM = seM2 ? null : (t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i) || t.match(/\(Episode\s*(\d+)\)/i))
      const sM  = t.match(/\bseason\s*(\d+)/i) || t.match(/\bS(\d+)E?\d*\b/i)

      const ep = epFromDom ?? (seM2 ? +seM2[2] : (epM ? +epM[1] : null))
      const sn = sFromDom  ?? (seM2 ? +seM2[1] : (sM  ? +sM[1]  : null))

      // Show title: colon format gives us the cleanest extraction
      let show
      if (showFromDom) {
        show = showFromDom
      } else if (colonSeasonM) {
        // "Show Title: Season N: ..." → take everything before ": Season N"
        show = colonSeasonM[1].trim()
      } else {
        show = t
          .replace(/\s*[-–]\s*S\d+[:\s]*E\d+.*/i, '')
          .replace(/\s*[-–]\s*season\s*\d+.*/i, '')
          .replace(/\s*[-–]\s*S\d+.*/i, '')
          .replace(/\s*\(Episode\s*\d+\).*/i, '')
          .trim()
      }

      if (!show || /^netflix$/i.test(show)) return null
      return { title: show, episode: ep, season: sn }
    }
  },

  // ── Amazon Prime Video ────────────────────────────────────────────────
  // Tab title is often just "Show Name | Prime Video" with no episode.
  // Try DOM for episode label first, then title, then API increment fallback.
  {
    match: /primevideo\.com/i,
    parse(url, title) {
      const t = title.replace(/\s*[-|]\s*(prime video|amazon).*/i, '').trim()
      // DOM: Prime shows episode info in player overlays
      let epFromDom = null, sFromDom = null
      try {
        const overlays = [
          ...document.querySelectorAll('[class*="episodeTitle"], [class*="episode-title"], [class*="EpisodeTitle"]'),
          ...document.querySelectorAll('[data-testid*="episode"], [data-automation-id*="episode"]'),
        ]
        for (const el of overlays) {
          const text = el.textContent?.trim() || ''
          const seM = text.match(/S(\d+)[:\s]*E(\d+)/i) || text.match(/Season\s*(\d+).*Episode\s*(\d+)/i)
          if (seM) { sFromDom = +seM[1]; epFromDom = +seM[2]; break }
          const epOnly = text.match(/\bEp(?:isode)?\s*\.?\s*(\d+)/i)
          if (epOnly) { epFromDom = +epOnly[1]; break }
        }
      } catch {}
      const epM = epFromDom ?? (t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)?.[1] ? +t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)[1] : null)
      return { title: t, episode: epM, season: sFromDom ?? null }
    }
  },

  // ── Disney+ ───────────────────────────────────────────────────────────
  // Tab title: "Show Name | Disney+" — no episode. Try DOM scraping.
  {
    match: /disneyplus\.com/i,
    parse(url, title) {
      const t = title.replace(/\s*[|–-]\s*disney\+?.*/i, '').trim()
      let epFromDom = null, sFromDom = null
      try {
        const candidates = document.querySelectorAll(
          '[class*="episodeNumber"], [class*="episode-number"], ' +
          '[data-testid*="episode"], [class*="SubtitleText"], ' +
          '[class*="subtitle"], [class*="DetailText"]'
        )
        for (const el of candidates) {
          const text = el.textContent?.trim() || ''
          const seM = text.match(/S(\d+)[:\s]*E(\d+)/i)
          if (seM) { sFromDom = +seM[1]; epFromDom = +seM[2]; break }
          const epOnly = text.match(/^E(\d+)[\s–-]|Episode\s*(\d+)/i)
          if (epOnly) { epFromDom = +(epOnly[1] || epOnly[2]); break }
        }
      } catch {}
      return { title: t || title, episode: epFromDom, season: sFromDom }
    }
  },

  // ── Max (HBO Max) ─────────────────────────────────────────────────────
  // Tab title: "Show Name | Max" — no episode. Try URL then DOM.
  {
    match: /\bmax\.com\b/i,
    parse(url, title) {
      const t = title.replace(/\s*[|–-]\s*max.*/i, '').trim()
      // URL: /play/urn:hbo:episode:... — no readable episode number
      let epFromDom = null, sFromDom = null
      try {
        const candidates = document.querySelectorAll(
          '[class*="EpisodeNumber"], [class*="episode-number"], ' +
          '[data-testid*="episode"], [aria-label*="Episode"]'
        )
        for (const el of candidates) {
          const text = el.textContent?.trim() || el.getAttribute('aria-label') || ''
          const seM = text.match(/S(\d+)[:\s]*E(\d+)/i)
          if (seM) { sFromDom = +seM[1]; epFromDom = +seM[2]; break }
          const epOnly = text.match(/Episode\s*(\d+)/i)
          if (epOnly) { epFromDom = +epOnly[1]; break }
        }
      } catch {}
      return { title: t || title, episode: epFromDom, season: sFromDom }
    }
  },

  // ── Hulu ──────────────────────────────────────────────────────────────
  // Titles vary: "Show Name | Hulu" or "Show Name - Season 1 Ep 5 | Hulu"
  {
    match: /hulu\.com/i,
    parse(url, title) {
      const t   = title.replace(/\s*[|]\s*hulu.*/i, '').trim()
      const epM = t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i) || t.match(/\bE(\d+)\b/i)
      const sM  = t.match(/\bseason\s*(\d+)/i)
      const show = t
        .replace(/\s*[-–]\s*season\s*\d+.*/i, '')
        .replace(/\s*[-–]\s*ep(?:isode)?\s*\d+.*/i, '')
        .trim()
      return { title: show || t, episode: epM ? +epM[1] : null, season: sM ? +sM[1] : null }
    }
  },

  // ── Apple TV+ ─────────────────────────────────────────────────────────
  // Tab title: "Show Name — Apple TV+" or episode in title.
  {
    match: /tv\.apple\.com/i,
    parse(url, title) {
      const t   = title.replace(/\s*[–|—]\s*apple tv\+?.*/i, '').trim()
      const epM = t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)
      const sM  = t.match(/\bseason\s*(\d+)/i)
      const show = t
        .replace(/\s*[-–]\s*season\s*\d+.*/i, '')
        .replace(/\s*[-–]\s*ep(?:isode)?\s*\d+.*/i, '')
        .trim()
      return { title: show || t, episode: epM ? +epM[1] : null, season: sM ? +sM[1] : null }
    }
  },

  // ── Bilibili (bilibili.tv international) ─────────────────────────────
  // URL: /en/play/<showId>/<epId> — ep ID is internal, not episode number.
  // Title: "EP1 Show Name - bilibili" or "Show Name EP1 - bilibili.tv"
  {
    match: /bilibili\.(tv|com)/i,
    parse(url, title) {
      const t   = title.replace(/\s*[-|]\s*bilibili.*/i, '').trim()
      const epM = t.match(/\bEP\s*(\d+)/i) || t.match(/\bep(?:isode)?\s*\.?\s*(\d+)/i)
      const ep  = epM ? +epM[1] : null
      const show = t.replace(/\s*[-–]\s*EP\s*\d+.*/i, '').replace(/\bEP\s*\d+\s*/i, '').trim()
      return { title: show || t, episode: ep, season: null }
    }
  },

  // ── Tubi ──────────────────────────────────────────────────────────────
  {
    match: /tubitv\.com/i,
    parse(url, title) {
      // URL: /series/123456/s01e01-episode-title
      const urlM = url.match(/s(\d+)e(\d+)/i)
      if (urlM) {
        const t = title.replace(/\s*[-|]\s*tubi.*/i, '').replace(/\s*[-|]\s*watch.*/i, '').trim()
        return { title: t, episode: +urlM[2], season: +urlM[1] }
      }
      return fromTitle(title)
    }
  },

  // ── VRV / Retrocrush / HIDIVE (old domains) ──────────────────────────
  {
    match: /(vrv\.co|retrocrush\.tv)\//i,
    parse(url, title) { return fromTitle(title) }
  },

  // ── YouTube ───────────────────────────────────────────────────────────
  // Parse title + episode info but do not filter here — background.js will
  // only update local stats / NOW TRACKING if the API confirms a library match.
  {
    match: /youtube\.com/i,
    parse(url, title) { return fromTitle(title) }
  },
];

// Generic title parser — last resort for any unrecognised site
function fromTitle(title) {
  if (!title) return null
  let t = title
    // Strip trailing site suffix patterns: "| SiteName", "- SiteName", "— SiteName"
    .replace(/\s*[-|–—]\s*[a-z0-9 .+]+\.(com|net|org|tv|me|to|cc|xyz|ru|io)\b.*/i, '')
    // Common branded suffixes without TLD (Netflix, Crunchyroll, Disney+, Max, Hulu, etc.)
    .replace(/\s*[-|–—]\s*(netflix|crunchyroll|funimation|hidive|disney\+?|hulu|max|prime video|amazon|hbo|peacock|tubi|vrv|bilibili|aniwatch|hianime|aniwave|9anime|gogoanime|anitaku)\b.*/i, '')
    // Strip leading "SiteName - " or "SiteName: " prefix
    .replace(/^[a-z0-9]{2,20}\s*[-–:]\s*/i, '')
    // Strip episode title after em-dash (e.g. " — The Final Battle")
    .replace(/\s*[—–]\s*:?\s*.{0,60}$/, t2 => {
      // Only strip if it doesn't contain "episode" or season info
      if (/\bep(?:isode)?\s*\d+|\bseason\s*\d+|\bS\d+E\d+/i.test(t2)) return t2
      return ''
    })
    // Strip trailing year in parens
    .replace(/\s*\(\d{4}\)\s*$/i, '')
    .trim()

  const epM = t.match(/\bep(?:isode)?\s*\.?\s*(\d+(?:\.\d+)?)\b/i)
             || t.match(/\bE(\d{1,4})\b(?!\d)/)
             || t.match(/\bEP(\d+)\b/i)
  const ep  = epM ? +epM[1] : null
  const seM = t.match(/S(\d+)[:\s]*E(\d+)/i)
  const sM  = seM ? null : (t.match(/\bseason\s*(\d+)\b/i) || t.match(/\bS(\d+)E\d+\b/i))
  const sn  = seM ? +seM[1] : (sM ? +sM[1] : null)
  const epN = seM ? +seM[2] : ep

  let show = t
    .replace(/\s*S\d+[:\s]*E\d+.*/i, '')                           // strip S1:E5 and everything after
    .replace(/\s*[-–|]\s*ep(?:isode)?\s*\.?\s*\d+(?:\.\d+)?.*/i, '')
    .replace(/\bep(?:isode)?\s*\.?\s*\d+(?:\.\d+)?/i, '')
    .replace(/\bseason\s*\d+\b/i, '')
    .replace(/\s+/g, ' ').trim()

  if (!show || show.length < 2) return null
  return { title: show, episode: epN, season: sn }
}

const TC_LOWER = new Set(['of','and','the','a','an','in','on','at','to','for','nor','but','or','yet','so','with','by'])
function tc(s) {
  return s.replace(/\b\w+/g, (w, offset) => {
    // Always capitalise the first word; lowercase connectives elsewhere
    if (offset === 0) return w[0].toUpperCase() + w.slice(1)
    return TC_LOWER.has(w.toLowerCase()) ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1)
  })
}

// Custom sites loaded from YOMU DB (user-added via Sources page).
// Populated async; stored in _customHostnames so getBestParser can use it.
let _customHostnames = []
try {
  chrome.runtime.sendMessage({ type: 'GET_CUSTOM_SITES' }, res => {
    if (Array.isArray(res)) _customHostnames = res
  })
} catch { }

// ── Item 5: External parser config overrides ──────────────────────────────
// Fetched from /api/parser-configs and cached in chrome.storage.local as
// yomu_parser_configs. When a domain has an override, its selectors/regexes
// take precedence over the built-in parser — allowing hotfixes without a
// Chrome Web Store update cycle.
let _parserConfigs = []
try {
  chrome.storage.local.get(['yomu_parser_configs'], d => {
    if (Array.isArray(d.yomu_parser_configs)) _parserConfigs = d.yomu_parser_configs
  })
} catch { }

function getParserOverride(testUrl) {
  if (!_parserConfigs.length) return null
  try {
    const host = new URL(testUrl).hostname.replace(/^www\./, '')
    const cfg = _parserConfigs.find(c =>
      !c.disabled && (host === c.domain || host.endsWith('.' + c.domain))
    )
    if (!cfg) return null
    // Build a parser from the config's selectors/regexes
    return {
      parse(url, title) {
        let show = null, ep = null
        // Title extraction: DOM selector takes priority, then regex on tab title
        if (cfg.titleSelector) {
          try { show = document.querySelector(cfg.titleSelector)?.textContent?.trim() || null } catch {}
        }
        if (!show && cfg.titleRegex) {
          try { const m = title.match(new RegExp(cfg.titleRegex, 'i')); show = m?.[1] || null } catch {}
        }
        // Episode extraction: DOM selector, then regex on tab title, then URL
        if (cfg.episodeSelector) {
          try {
            const text = document.querySelector(cfg.episodeSelector)?.textContent?.trim() || ''
            const m = text.match(/(\d+)/)
            ep = m ? +m[1] : null
          } catch {}
        }
        if (ep == null && cfg.episodeRegex) {
          try { const m = title.match(new RegExp(cfg.episodeRegex, 'i')); ep = m ? +m[1] : null } catch {}
        }
        // Fall back to built-in fromTitle for anything we couldn't extract
        if (!show) return fromTitle(title)
        return { title: show, episode: ep, season: null }
      }
    }
  } catch { return null }
}

function getBestParser() {
  // When inside an iframe, match parsers against the parent page URL (which
  // has the recognisable site hostname), not the iframe's CDN URL.
  const testUrl = (isIframe() && _parentContext?.url) ? _parentContext.url : location.href

  // 0. Check server-pushed parser overrides first (item 5) — allows hotfixing
  //    broken CSS selectors without a Chrome Web Store update cycle.
  const override = getParserOverride(testUrl)
  if (override) return override

  // 1. Check dedicated parsers
  const dedicated = PARSERS.find(p => p.match.test(testUrl))
  if (dedicated) return dedicated

  // 2. Check user-added custom sites — use generic fromTitle() for them
  try {
    const host = new URL(testUrl).hostname.replace(/^www\./, '')
    if (_customHostnames.some(h => host === h || host.endsWith('.' + h))) {
      return { parse: (u, t) => fromTitle(t) }
    }
  } catch { }

  // 3. Fallback: fromTitle() on any site (catches everything else)
  return { parse: (u, t) => fromTitle(t) }
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

// ── Netflix evidence overlay cache ───────────────────────────────────────
// The evidence overlay (pause/hover info panel) contains the most reliable
// show/season/episode data, but only exists in the DOM while visible.
// A MutationObserver watches for it to appear and caches the extracted values
// so the parser can use them even when the overlay is hidden.
let _netflixCache = null // { title, episode, season } | null

function _extractNetflixOverlay() {
  const seasonEl  = document.querySelector('[data-uia="evidence-overlay-season-title"]')
  const episodeEl = document.querySelector('[data-uia="evidence-overlay-episode-title"]')
  if (!seasonEl && !episodeEl) return

  const anchor    = seasonEl || episodeEl
  const container = anchor.closest('[data-uia*="overlay"], [class*="overlay"], [class*="evidence"]')
                 || anchor.parentElement?.parentElement
                 || anchor.parentElement
  const h2 = container?.querySelector('h2') || null
  const showTitle = h2?.textContent?.trim() || null
  if (!showTitle) return

  const sm = seasonEl?.textContent?.match(/Season\s*(\d+)/i)
  const em = episodeEl?.textContent?.match(/Episode\s*(\d+)/i)
  _netflixCache = {
    title:   showTitle,
    season:  sm ? +sm[1] : null,
    episode: em ? +em[1] : null,
  }
}

function _startNetflixOverlayObserver() {
  if (!/netflix\.com/i.test(location.hostname)) return
  const obs = new MutationObserver(() => { try { _extractNetflixOverlay() } catch {} })
  obs.observe(document.documentElement, { childList: true, subtree: true })
  // Also try immediately in case the overlay is already visible on inject
  try { _extractNetflixOverlay() } catch {}
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
      // Gemini (item 2): skip heartbeat when tab is hidden — the user isn't
      // actively watching so there's nothing meaningful to accumulate.
      // Prevents autoplay in background tabs from silently inflating watch time.
      if (document.visibilityState !== 'visible') return
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

// ── Fix 1: Robust send with retry ────────────────────────────────────────
// "Could not establish connection. Receiving end does not exist." happens when
// the MV3 service worker is in the process of spinning up after being
// terminated. A single retry after 1 s is not enough — the worker may need
// up to ~2–3 s to fully register. We retry up to 3 times with a 1 s delay.
async function sendWithRetry(message, retries = 3, delayMs = 1000) {
  for (let i = 0; i < retries; i++) {
    try {
      if (!chrome.runtime?.id) return  // extension context invalidated
      await chrome.runtime.sendMessage(message)
      return  // success
    } catch (err) {
      const msg = String(err)
      // Don't retry on context-invalidated or hard permission errors
      if (msg.includes('Extension context invalidated') || msg.includes('runtime.id')) return
      if (i < retries - 1) {
        await new Promise(r => setTimeout(r, delayMs))
      }
      // On final attempt, swallow silently — best-effort delivery
    }
  }
}

function send(isComplete) {
  if (!session) return
  if (isComplete && session.reportedComplete) return
  if (isComplete) session.reportedComplete = true
  try { if (!chrome.runtime?.id) return } catch { return }

  const payload = {
    title:            session.title,
    episode:          session.episode,
    season:           session.season,
    site:             session.site,
    source:           session.site,  // item 4: pass raw site so API can apply episode_offset
    duration_seconds: Math.round(session.videoDuration || 0),
    watched_seconds:  Math.round(session.totalPlaySec),
    is_complete:      isComplete,
    timestamp:        new Date().toISOString(),
  }

  sendWithRetry({ type: 'WATCH_EVENT', payload })
}

// ── DOM scanning ──────────────────────────────────────────────────────────
function scanForVideos() {
  document.querySelectorAll('video').forEach(v => {
    // Skip very short clips (ads, previews, avatars, etc.)
    const dur = v.duration
    if (!isNaN(dur) && dur > 0 && dur < 180) return  // skip < 3 min
    if (v.videoWidth === 0 && v.videoHeight === 0) {
      // Video not yet loaded — wait for dimensions then re-scan.
      // Guard with a flag to avoid accumulating multiple listeners when the
      // MutationObserver fires scanForVideos several times before the event fires.
      if (!v._yomuWaiting) {
        v._yomuWaiting = true
        v.addEventListener('loadedmetadata', () => { delete v._yomuWaiting; scheduleScan() }, { once: true })
      }
      return
    }
    attachVideo(v)
  })
}

// Watch for dynamically injected video elements (most SPA streaming sites).
// Debounced via rAF so rapid DOM mutations don't spam querySelectorAll.
let _scanPending = false
function scheduleScan() {
  if (_scanPending) return
  _scanPending = true
  requestAnimationFrame(() => { _scanPending = false; scanForVideos() })
}
const domObserver = new MutationObserver(scheduleScan)
domObserver.observe(document.documentElement, { childList: true, subtree: true })
_startNetflixOverlayObserver()
scanForVideos()

// ── SPA navigation detection ──────────────────────────────────────────────
// Use the Navigation API where available (Chrome 102+), fall back to polling.
function handleNavigation() {
  if (location.href !== lastUrlCheck) {
    lastUrlCheck = location.href
    session = null
    _netflixCache = null
    detachVideo()
    setTimeout(scanForVideos, 1000)
  }
}
if (typeof navigation !== 'undefined' && navigation.addEventListener) {
  navigation.addEventListener('navigate', handleNavigation)
} else {
  setInterval(handleNavigation, 1000)
}

// ── YOMU auth token harvesting ────────────────────────────────────────────
// Token harvesting from YOMU cookies is now handled entirely in background.js
// via chrome.scripting.executeScript (runs in MAIN world with cookie access)
// when the user visits the YOMU tab, and via the explicit window.postMessage
// push from the Next.js app (ExtensionAuthPush component).
// content.js no longer needs to run on the YOMU domain at all.
