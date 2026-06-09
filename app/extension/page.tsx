'use client'

import Link from 'next/link'
import { ExternalLink, Puzzle, Download, Tv2, BookOpen, BarChart2, Zap, ShieldCheck, RefreshCw, Globe, CheckCircle } from 'lucide-react'

const SUPPORTED_SITES = [
  { name: 'Crunchyroll',    url: 'crunchyroll.com',   note: 'Episode from title',   tier: 'full' },
  { name: 'Netflix',        url: 'netflix.com',       note: 'DOM + count fallback', tier: 'full' },
  { name: 'Amazon Prime',   url: 'primevideo.com',    note: 'DOM + count fallback', tier: 'full' },
  { name: 'Disney+',        url: 'disneyplus.com',    note: 'DOM + count fallback', tier: 'full' },
  { name: 'Max / HBO',      url: 'max.com',           note: 'DOM + count fallback', tier: 'full' },
  { name: 'Hulu',           url: 'hulu.com',          note: 'Episode from title',   tier: 'full' },
  { name: 'Apple TV+',      url: 'tv.apple.com',      note: 'Episode from title',   tier: 'full' },
  { name: 'HiDive',         url: 'hidive.com',        note: 'Episode from URL',     tier: 'full' },
  { name: 'HiAnime / Zoro', url: 'hianime.to',        note: 'Episode from URL',     tier: 'full' },
  { name: 'GogoAnime',      url: 'gogoanime.by',      note: 'Episode from URL',     tier: 'full' },
  { name: 'Anitaku',        url: 'anitaku.pe',        note: 'Episode from URL',     tier: 'full' },
  { name: 'Aniwaves',       url: 'aniwaves.com',      note: 'Episode from URL',     tier: 'full' },
  { name: 'Aniwatch',       url: 'aniwatch.to',       note: 'Episode from URL',     tier: 'full' },
  { name: '9anime',         url: '9anime.to',         note: 'Episode from URL',     tier: 'full' },
  { name: 'Bilibili',       url: 'bilibili.tv',       note: 'Episode from title',   tier: 'full' },
  { name: 'Tubi',           url: 'tubitv.com',        note: 'Episode from URL',     tier: 'full' },
  { name: 'Any other site', url: '',                  note: 'Generic title parser', tier: 'generic' },
]

const FEATURES = [
  {
    icon: Tv2,
    title: 'Auto Episode Tracking',
    desc: 'Detects when you finish an episode and automatically increments your episode count — no manual input needed.',
  },
  {
    icon: BarChart2,
    title: 'Watch Time Stats',
    desc: 'Accumulates total watch time per series and across your whole library, shown in your Stats dashboard.',
  },
  {
    icon: BookOpen,
    title: 'Library Sync',
    desc: 'Matched episodes update the correct library card using fuzzy title matching — works even with slight title differences.',
  },
  {
    icon: Zap,
    title: 'Works on 16+ Sites',
    desc: 'Dedicated parsers for Crunchyroll, Netflix, HiAnime, GogoAnime, Disney+, Max, HiDive, and more.',
  },
  {
    icon: RefreshCw,
    title: 'Auto Status Promotion',
    desc: 'Watching a first episode moves a "Plan to Watch" title to "Watching". Watching the last episode marks it complete.',
  },
  {
    icon: ShieldCheck,
    title: 'Secure & Private',
    desc: 'Only communicates with YOMU. No third-party analytics. Your watch history stays in your own Supabase database.',
  },
]

const STEPS = [
  {
    n: '1',
    title: 'Download the extension files',
    body: 'Click the button below to open the GitHub repository. Download the repository as a ZIP (Code → Download ZIP), then unzip it on your computer.',
  },
  {
    n: '2',
    title: 'Open Chrome Extensions',
    body: 'In Chrome, navigate to chrome://extensions — you can also get there via the ⋮ menu → Extensions → Manage Extensions.',
  },
  {
    n: '3',
    title: 'Enable Developer Mode',
    body: 'Toggle on "Developer mode" in the top-right corner of the Extensions page. This lets you load unpacked extensions.',
  },
  {
    n: '4',
    title: 'Load the extension',
    body: 'Click "Load unpacked", then navigate to the unzipped folder and select the extension/ subfolder inside it.',
  },
  {
    n: '5',
    title: 'Connect to YOMU',
    body: 'Click the YOMU extension icon in Chrome\'s toolbar, then click "Connect to YOMU". You\'ll be taken to the site and connected automatically.',
  },
]

export default function ExtensionPage() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-8 md:py-12">

        {/* Hero */}
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center">
              <Puzzle size={20} className="text-violet-400" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight">YOMU Watch Tracker</h1>
              <p className="text-zinc-500 text-sm">Chrome Extension</p>
            </div>
          </div>
          <p className="text-zinc-400 text-base leading-relaxed max-w-2xl mb-6">
            A Chrome extension that watches what you watch. It detects video playback on streaming sites,
            identifies the anime, and automatically updates your YOMU library — episode count, watch time,
            and status — without you lifting a finger.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="https://github.com/umar3323/manga-tracker"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Download size={15} strokeWidth={2} />
              Download Extension
            </a>
            <Link
              href="/sources"
              className="flex items-center gap-2 px-5 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-semibold transition-colors"
            >
              <Globe size={15} strokeWidth={1.5} />
              Manage Streaming Sites
            </Link>
          </div>
        </div>

        {/* Features */}
        <section className="mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-5">What It Does</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FEATURES.map(f => {
              const Icon = f.icon
              return (
                <div key={f.title} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-3">
                  <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/15 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon size={15} className="text-violet-400" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">{f.title}</p>
                    <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {/* Supported sites */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500">Supported Streaming Sites</h2>
            <Link href="/sources" className="text-xs text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1">
              Add a site <ExternalLink size={10} strokeWidth={2} />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {SUPPORTED_SITES.map(s => (
              <div
                key={s.name}
                className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border ${
                  s.tier === 'generic'
                    ? 'bg-zinc-900/50 border-zinc-800/50 border-dashed'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle
                    size={13}
                    strokeWidth={2}
                    className={s.tier === 'generic' ? 'text-zinc-600 shrink-0' : 'text-emerald-500 shrink-0'}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{s.name}</p>
                    {s.url && <p className="text-[10px] text-zinc-600 font-mono truncate">{s.url}</p>}
                  </div>
                </div>
                <span className="text-[10px] text-zinc-600 shrink-0">{s.note}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-600 mt-3">
            You can add any other streaming site in{' '}
            <Link href="/sources" className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors">
              Sources → Streaming Sites
            </Link>
            {' '}— the extension will track episodes on it automatically.
          </p>
        </section>

        {/* How it works */}
        <section className="mb-12">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-5">How Episode Detection Works</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4 text-sm text-zinc-400 leading-relaxed">
            <p>
              The extension injects a lightweight script into every page. When it detects a{' '}
              <code className="text-violet-300 bg-violet-500/10 px-1 py-0.5 rounded text-xs">&lt;video&gt;</code>{' '}
              element playing for more than 3 minutes, it starts a watch session.
            </p>
            <p>
              It reads the page title and URL to extract the show name and episode number. For sites
              like Netflix or Disney+ where the title doesn't include an episode number, it scrapes the
              player overlay UI. If the episode number still can't be found, it counts each completed
              watch as +1 episode automatically.
            </p>
            <p>
              When you reach 85% of the video's duration (or it ends), a <em>complete</em> event is sent to
              YOMU. The server fuzzy-matches the title to your library and updates the episode counter,
              watch time, and status — promoting "Plan to Watch" → "Watching" and "Watching" → "Completed"
              when you finish the last episode.
            </p>
            <p>
              A heartbeat ping is sent every 30 seconds during playback so partial watches are recorded
              even if you close the tab mid-episode.
            </p>
          </div>
        </section>

        {/* Install steps */}
        <section className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-5">Installation</h2>
          <div className="space-y-3">
            {STEPS.map(s => (
              <div key={s.n} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex gap-4">
                <div className="w-7 h-7 rounded-full bg-violet-500/15 border border-violet-500/25 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-xs font-bold text-violet-400">{s.n}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold mb-0.5">{s.title}</p>
                  <p className="text-xs text-zinc-500 leading-relaxed">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex">
            <a
              href="https://github.com/umar3323/manga-tracker"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Download size={15} strokeWidth={2} />
              Open GitHub Repository
            </a>
          </div>
        </section>

      </div>
    </main>
  )
}
