# YOMU — Code Review & Health Check

**Date:** 2026-06-09
**Scope:** `manga-tracker` (YOMU) — full repository
**Stack:** Next.js 16.2.7 (Turbopack) · React 19.2.4 · Supabase (SSR) · Vercel
**Method:** Production build, standalone TypeScript check, ESLint (full + source-scoped), manual read of auth/middleware, the three known-broken features, and the database migration baseline.

---

## 1. Verdict

**The application builds and runs.** A clean production build compiles successfully, passes Next's own TypeScript pass, and generates all 40 routes with no errors. No secrets are tracked in git.

The problems found are **not** build-breakers. They are: silent runtime failures (cron behind auth), a schema-reproducibility gap, two persistence traps in the duplicate detector, and tooling/hygiene noise that hides real signal. None of them stop the app from serving today.

| Check | Result |
|---|---|
| `next build` | Pass — compiled 4.8s, TS 7.3s, 40/40 routes generated |
| `tsc --noEmit` (standalone) | 8 errors, **all** in sync-duplicate `.next/types/*.d 3.ts` — none in source |
| ESLint (source only) | 56 errors / 55 warnings — **none block the build** |
| Secrets in git | None tracked — `.env*` ignored, verified clean |

---

## 2. Findings by severity

### 🔴 HIGH — Cron jobs never execute (chapter-alert is silently dead)

**Files:** `proxy.ts`, `vercel.json`, `app/api/cron/check-chapters/route.ts`, `app/api/warmup/route.ts`

`vercel.json` registers two scheduled jobs:

```json
{ "path": "/api/cron/check-chapters", "schedule": "0 9 * * 1" }   // weekly, Mon 09:00
{ "path": "/api/warmup",             "schedule": "0 8 * * *" }    // daily, 08:00
```

But the auth middleware in `proxy.ts` only whitelists a single API path:

```ts
const isPublicApi = request.nextUrl.pathname === '/api/feature-request'
if (!user && !isLoginPage && !isCallback && !isPublicShare && !isPublicApi) {
  return NextResponse.redirect(new URL('/login', request.url))
}
```

Vercel Cron sends requests with **no Supabase session cookie**, so `getUser()` returns `null` and the request is 307-redirected to `/login`. The route handler body never runs. The cron "succeeds" (it gets a 3xx) while doing nothing — which is exactly why chapter alerts never fire.

`/api/warmup` is broken twice over: even if it were reachable, it fan-out-fetches `/api/catalog`, `/api/shonenjump`, `/api/goodreads`, `/api/webtoons`, `/api/mangaplus` — all of which are *also* behind the auth wall, so those sub-fetches redirect too.

The handler code itself is **correct and well-written** — `check-chapters` validates `CRON_SECRET` via Bearer header, initialises VAPID at runtime (not module load), rate-limits Jikan at 450ms, and cleans up expired (410) push subscriptions. The bug is purely that the middleware blocks the request before any of that runs.

**Fix:** exempt the cron + warmup paths in `proxy.ts`. The routes secure themselves (`CRON_SECRET`), so this does not weaken auth.

```ts
const p = request.nextUrl.pathname
const isPublicApi =
  p === '/api/feature-request' ||
  p.startsWith('/api/cron/') ||
  p === '/api/warmup'
```

> Note: for `/api/warmup` to actually warm the caches, the data routes it calls (`/api/catalog`, etc.) must also be reachable without a user session. Those serve public catalog data, so either add them to the exempt list or have warmup pass a shared secret. Decide based on whether any of them read per-user data.

---

### 🟠 MEDIUM-HIGH — Duplicate-dismissal persistence depends on an undocumented table

**Files:** `components/DuplicateDetector.tsx`, `scripts/migrations.sql`

The detector persists dismissals to a `user_settings` row (`key = 'dismissed_duplicates'`), loading on mount and upserting on dismiss — so the feature *is* wired up. Two problems:

1. **The table is not in `migrations.sql`.** That file defines `push_subscriptions`, `user_achievements`, and some `manga_list` column additions — but **not** `user_settings`, **not** `chapter_notifications` (used by the cron), and **not** the base `manga_list` table itself. These exist only if they were created by hand in the Supabase console. A fresh project cannot be bootstrapped from this repo.

2. **All client errors are swallowed.** The load uses `.then(...)` with an empty `catch {}` and the dismiss upsert is never error-checked:

```ts
const dismiss = async (key: string) => {
  const next = new Set([...dismissed, key])
  setDismissed(next)                                   // optimistic — UI updates
  await supabase.from('user_settings').upsert({ ... }) // error never inspected
}
```

If `user_settings` is missing, lacks RLS, or has no `user_id` default, every upsert fails **silently**. The pair disappears for the session (optimistic state) and returns on reload — the precise "dismissal not persisting" symptom.

**Fix:**
- Add `user_settings` (and `chapter_notifications`) to `migrations.sql` with RLS keyed on `auth.uid()`, so the schema is reproducible.
- Check the upsert result and surface failures via the existing `showToast`.

---

### 🟠 MEDIUM — `pairKey` is order-dependent (second persistence trap)

**File:** `components/DuplicateDetector.tsx`

```ts
const pairKey = (p: Pair) => `${p.a.id}::${p.b.id}`
```

Pairs are generated positionally (`i < j` over the `manga` array), so the key encodes *list order*, not the logical pair. If the library re-sorts between sessions (by last-read, rating, etc.), the same two titles produce `b.id::a.id` instead of `a.id::b.id`. A previously-saved dismissal then fails to match and the pair reappears. This can cause "not persisting" **even if the table works perfectly.**

**Fix — canonicalise the key so it is order-independent:**

```ts
const pairKey = (p: Pair) => [p.a.id, p.b.id].sort().join('::')
```

(Apply the same ordering wherever `merged` keys are built, for consistency.)

---

### 🟡 LOW-MEDIUM — ESLint lints your build output, drowning real signal

**File:** `eslint.config.mjs`

`npm run lint` reports **3,067 problems (117 errors / 2,950 warnings)** — but roughly 98% is noise from minified JS bundles and launcher files in `.vercel/output/`. The flat config ignores `.next/**` but not `.vercel/**`:

```js
globalIgnores([
  ".next/**",
  "out/**",
  "build/**",
  "next-env.d.ts",
  // missing: ".vercel/**"
])
```

Scoped to actual source, the true numbers are **56 errors / 55 warnings** — a manageable list that the noise currently hides.

**Fix:** add `".vercel/**"` to `globalIgnores`.

---

### 🟡 LOW — Real source lint (none block the build)

After excluding build artifacts, by rule:

| Count | Severity | Rule | Nature |
|------:|---|---|---|
| 25 | error | `react-hooks/set-state-in-effect` | React 19 strictness; perf, non-blocking |
| 23 | warn | `@next/next/no-img-element` | use `next/image`; cosmetic/perf |
| 22 | error | `react/no-unescaped-entities` | unescaped `'`/`"` in JSX; cosmetic |
| 18 | warn | `@typescript-eslint/no-unused-vars` | dead identifiers |
| 8 | warn | `react-hooks/exhaustive-deps` | dependency arrays |
| 4 | error | `@typescript-eslint/no-explicit-any` | type safety |
| 2 | error | `react-hooks/refs` | ref read/write during render |
| 1 | error | `react-hooks/purity` | impure render |
| 1 | error | `react-hooks/immutability` | mutating tracked value |
| 1 | error | `react-hooks/preserve-manual-memoization` | memoization correctness |

The React-Compiler-family correctness flags are the only ones worth eventual attention:

- `app/page.tsx:4561`, `app/page.tsx:5200` — `react-hooks/refs`
- `app/page.tsx:3278` — `react-hooks/preserve-manual-memoization`
- `app/stats/page.tsx:192` — `react-hooks/immutability`
- `components/ReleaseCalendar.tsx:244` — `react-hooks/purity` (calls `Date.now()` during render)
- `components/DiscoverySection.tsx:131–133` — `no-explicit-any`

All are build-safe today. They flag patterns the React Compiler may mis-optimise later, not current breakage.

---

### 🟡 LOW — `app/page.tsx` is 5,200+ lines

Not a bug, but the single largest maintainability risk in the repo. Every `refs`/memoization lint hit lives here. Worth decomposing into route-level components and hooks — both for your own sanity and to make the compiler-correctness warnings tractable.

---

### 🟡 LOW — `/api/feature-request` is a public unauthenticated write endpoint

It is (correctly) the one path exempted from auth so the feature-request modal works pre-login — but it has no rate-limiting and writes directly to your Google Sheet, so it is an open spam vector. Low priority for a personal app; worth a basic rate-limit or a hidden token if it ever gets traffic.

> The previously-noted "corrupted env var" issue here appears **resolved** — the handler now strips surrounding quotes and normalises `\n`/`\r` escaping in `GOOGLE_PRIVATE_KEY`, and accepts either full-JSON or split credentials. Remaining risk is purely whether the values are set correctly in Vercel.

---

### ⚠️ INFRASTRUCTURE — The repo lives in a file-synced folder (this can corrupt git)

This is the issue with the worst long-term tail risk.

Throughout the tree there are sync-artifact duplicates with " 2" / " 3" suffixes:

- `.git/index 2`, `.git/index 3` ← **a sync daemon writing inside a live `.git`**
- `.next/` — 6 duplicate generated files (the `*.d 3.ts` files that break standalone `tsc`)
- `.vercel/output/static/manifest 2.json`, `sw 2.js`

The source tree (`app/`, `components/`, `lib/`, `scripts/`) is clean, and `.next`/`.vercel` are git-ignored — so none of this is committed. But a sync client (Google Drive/iCloud/Dropbox) duplicating files inside `.git` can corrupt the repository: a half-synced `index` or packed-refs file is how repos get bricked.

**Recommendation:** move the working copy out of the synced path, **or** exclude `.git`, `.next`, `node_modules`, and `.vercel` from the sync client's scope. Then delete the stray `index 2` / `index 3` files.

---

## 3. What is already healthy

- **Auth middleware** uses `getUser()` (server-validates the JWT) rather than `getSession()` — the correct, secure pattern. Cookie `getAll`/`setAll` follow the Supabase SSR contract.
- **Cron handler logic** is genuinely solid: runtime VAPID init, `CRON_SECRET` gate, Jikan rate-limiting, grouped per-user push, 410-subscription cleanup.
- **RLS** on `push_subscriptions` and `user_achievements` is correctly scoped to `auth.uid()`.
- **Secrets** are not tracked; `.gitignore` covers `.env*`.
- **Feature-request** credential handling is now robust to the common `\n`-escaping pitfall.
- The build is fast and fully green.

---

## 4. Action list (suggested order)

| # | Action | Severity | Effort | File |
|---|---|---|---|---|
| 1 | Exempt `/api/cron/*` + `/api/warmup` in middleware | 🔴 High | 2 min | `proxy.ts` |
| 2 | Add `user_settings` + `chapter_notifications` to migrations, with RLS | 🟠 Med-High | 15 min | `scripts/migrations.sql` |
| 3 | Verify those tables actually exist in Supabase | 🟠 Med-High | 5 min | Supabase console |
| 4 | Canonicalise `pairKey` with `.sort()` | 🟠 Med | 1 min | `DuplicateDetector.tsx` |
| 5 | Surface upsert errors in dismiss/merge (stop swallowing) | 🟠 Med | 10 min | `DuplicateDetector.tsx` |
| 6 | Add `".vercel/**"` to ESLint ignores | 🟡 Low | 1 min | `eslint.config.mjs` |
| 7 | Move repo out of synced folder / exclude `.git` | ⚠️ Infra | 10 min | filesystem |
| 8 | Decompose `app/page.tsx` (5,200+ lines) | 🟡 Low | large | `app/page.tsx` |
| 9 | Rate-limit `/api/feature-request` | 🟡 Low | 20 min | route |

Items 1, 4, and 6 are one-to-two-line changes that fix or unblock real behaviour. Items 2–3 are the most likely true cause of the dismissal bug and should be verified together.

---

*Generated from a build + lint + manual review pass. No source files were modified during this review.*
