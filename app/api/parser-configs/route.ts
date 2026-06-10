import { NextResponse } from 'next/server'

/**
 * GET /api/parser-configs
 *
 * Returns an array of per-domain parser override configs for the Chrome
 * extension. When a domain has an active override, the extension's content
 * script uses the provided selectors/regexes instead of its built-in parser.
 *
 * This allows hotfixing broken CSS selectors (e.g. after a streaming site
 * UI update) without going through a Chrome Web Store review cycle.
 *
 * To fix a broken parser:
 *   1. Add/update an entry in the PARSER_CONFIGS array below.
 *   2. git push → Vercel redeploys in ~30 s.
 *   3. Extension fetches new config on next auth / page load.
 *
 * Config shape:
 * {
 *   domain:          string   — bare hostname, e.g. "crunchyroll.com"
 *   disabled:        boolean  — set true to disable tracking on this domain entirely
 *   titleSelector:   string?  — CSS selector for the show title element
 *   episodeSelector: string?  — CSS selector for the episode label element
 *   titleRegex:      string?  — regex (string form) applied to tab title; capture group 1 = title
 *   episodeRegex:    string?  — regex (string form) applied to tab title; capture group 1 = episode
 *   notes:           string?  — human-readable explanation of what was changed and why
 * }
 *
 * Auth: public (no auth required — configs contain no user data).
 */

interface ParserConfig {
  domain: string
  disabled?: boolean
  titleSelector?: string
  episodeSelector?: string
  titleRegex?: string
  episodeRegex?: string
  notes?: string
}

// ── Active parser overrides ───────────────────────────────────────────────
// Add entries here when a streaming site changes its UI and the built-in
// content.js parser breaks. Push to main — no extension update needed.
const PARSER_CONFIGS: ParserConfig[] = [
  // Example (disabled) — shows the override format:
  // {
  //   domain: 'crunchyroll.com',
  //   titleRegex: '^(.+?)\\s*[-|]\\s*Episode\\s*\\d+',
  //   episodeRegex: 'Episode\\s*(\\d+)',
  //   notes: 'Crunchyroll updated their title format on 2026-06-10 — strip new suffix',
  // },

  // All built-in parsers are currently working — no active overrides.
  // Add entries above this comment when a parser breaks.
]

export async function GET() {
  return NextResponse.json(PARSER_CONFIGS, {
    headers: {
      // Cache for 1 hour in CDN, 5 min in extension storage
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  })
}
