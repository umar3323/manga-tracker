'use client'

import { useState } from 'react'
import NotificationBell from '@/components/NotificationBell'

export interface LibraryToolbarProps {
  mangaCount: number
  loadingRec: boolean
  syncing: boolean
  deepSelectMode: boolean
  deepSelectedCount: number
  onRecommend: () => void
  onAdd: () => void
  onSync: () => void
  onHealthCheck: () => void
  /** Called both from "Deep Search" button (starts mode) and from the "Search N Cards" button (launches search) */
  onDeepSearchLaunch: () => void
  onDeepSelectCancel: () => void
  onExportCSV: () => void
  onExportMAL: () => void
  onExportAniList: () => void
  onShare: () => void
  onTakeoutImport: () => void
  onSignOut: () => void
}

function MobileMenu({
  onRecommend, onSync, onSignOut, onExportCSV, onExportMAL, onExportAniList,
  onShare, onCheckCards, onTakeoutImport, loadingRec, syncing,
}: {
  onRecommend: () => void; onSync: () => void; onSignOut: () => void
  onExportCSV: () => void; onExportMAL: () => void; onExportAniList: () => void
  onShare: () => void; onCheckCards: () => void; onTakeoutImport: () => void
  loadingRec: boolean; syncing: boolean
}) {
  const [open, setOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  return (
    <div className="relative">
      <button onClick={() => setOpen(v => !v)} aria-label="More actions"
        className="w-10 h-10 rounded-xl bg-zinc-800 text-zinc-300 text-xl flex items-center justify-center hover:bg-zinc-700">
        ⋮
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setExportOpen(false) }} />
          <div className="absolute right-0 top-12 z-20 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl w-48">
            <button onClick={() => { onRecommend(); setOpen(false) }} disabled={loadingRec}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-40">
              <span>✦</span> {loadingRec ? 'Thinking…' : 'Recommend'}
            </button>
            <button onClick={() => { onSync(); setOpen(false) }} disabled={syncing}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 disabled:opacity-40 border-t border-zinc-700">
              <span>⟳</span> {syncing ? 'Syncing…' : 'Sync from MAL'}
            </button>
            <button onClick={() => setExportOpen(v => !v)}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center justify-between gap-2 border-t border-zinc-700">
              <span className="flex items-center gap-2"><span>↓</span> Export</span>
              <span className="text-zinc-500 text-xs">{exportOpen ? '▲' : '▼'}</span>
            </button>
            {exportOpen && (
              <>
                <button onClick={() => { onExportCSV(); setOpen(false) }}
                  className="w-full px-6 py-2.5 text-xs text-left text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700/50">
                  CSV
                </button>
                <button onClick={() => { onExportMAL(); setOpen(false) }}
                  className="w-full px-6 py-2.5 text-xs text-left text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700/50">
                  MAL XML
                </button>
                <button onClick={() => { onExportAniList(); setOpen(false) }}
                  className="w-full px-6 py-2.5 text-xs text-left text-zinc-300 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700/50">
                  AniList JSON
                </button>
              </>
            )}
            <button onClick={() => { onCheckCards(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>🩺</span> Check Cards
            </button>
            <button onClick={() => { onTakeoutImport(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>📦</span> Takeout Import
            </button>
            <button onClick={() => { onShare(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-200 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>🔗</span> Share List
            </button>
            <button onClick={() => { onSignOut(); setOpen(false) }}
              className="w-full px-4 py-3 text-sm text-left text-zinc-400 hover:bg-zinc-700 flex items-center gap-2 border-t border-zinc-700">
              <span>↩</span> Sign Out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default function LibraryToolbar({
  mangaCount,
  loadingRec,
  syncing,
  deepSelectMode,
  deepSelectedCount,
  onRecommend,
  onAdd,
  onSync,
  onHealthCheck,
  onDeepSearchLaunch,
  onDeepSelectCancel,
  onExportCSV,
  onExportMAL,
  onExportAniList,
  onShare,
  onTakeoutImport,
  onSignOut,
}: LibraryToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Manga Tracker</h1>
        <p className="text-zinc-500 text-xs md:text-sm mt-0.5">{mangaCount} Titles</p>
      </div>

      {/* Desktop actions */}
      <div className="hidden md:flex gap-2">
        <button onClick={onRecommend} disabled={mangaCount === 0 || loadingRec} aria-label="Get AI recommendations"
          className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors">
          {loadingRec ? 'Thinking…' : '✦ Recommend'}
        </button>
        <button onClick={onAdd} aria-label="Add manga"
          className="px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-zinc-200 transition-colors">
          + Add
        </button>
        <button onClick={onSync} disabled={syncing} aria-label="Sync from MAL"
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white disabled:opacity-40 transition-colors">
          {syncing ? '⟳ Syncing…' : '⟳ Sync'}
        </button>
        <button onClick={onHealthCheck} aria-label="Check card health"
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
          🩺 Check Cards
        </button>
        {deepSelectMode ? (
          <div className="flex gap-2">
            <button
              onClick={onDeepSearchLaunch}
              disabled={deepSelectedCount === 0}
              className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-500 disabled:opacity-40 transition-colors"
            >
              🔍 Search {deepSelectedCount > 0 ? `${deepSelectedCount} Card${deepSelectedCount > 1 ? 's' : ''}` : '…'}
            </button>
            <button
              onClick={onDeepSelectCancel}
              className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={onDeepSearchLaunch} aria-label="Deep search cards"
            className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
            🔍 Deep Search
          </button>
        )}
        <div className="relative group">
          <button aria-label="Export list"
            className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
            ↓ Export
          </button>
          <div className="absolute right-0 top-10 z-20 hidden group-hover:flex flex-col bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl w-36">
            <button onClick={onExportCSV} className="px-4 py-2.5 text-xs text-left text-zinc-200 hover:bg-zinc-700">CSV</button>
            <button onClick={onExportMAL} className="px-4 py-2.5 text-xs text-left text-zinc-200 hover:bg-zinc-700 border-t border-zinc-700/50">MAL XML</button>
            <button onClick={onExportAniList} className="px-4 py-2.5 text-xs text-left text-zinc-200 hover:bg-zinc-700 border-t border-zinc-700/50">AniList JSON</button>
          </div>
        </div>
        <NotificationBell />
        <button onClick={onShare} aria-label="Share my list"
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
          🔗 Share
        </button>
        <button onClick={onTakeoutImport} aria-label="Takeout import"
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
          📦 Import
        </button>
        <button onClick={onSignOut} aria-label="Sign out"
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 text-sm font-medium hover:bg-zinc-700 hover:text-white transition-colors">
          Sign Out
        </button>
      </div>

      {/* Mobile actions */}
      <div className="flex md:hidden gap-2">
        <button onClick={onAdd} aria-label="Add manga"
          className="w-10 h-10 rounded-xl bg-white text-black text-lg font-medium hover:bg-zinc-200 transition-colors flex items-center justify-center">
          +
        </button>
        <MobileMenu
          onRecommend={onRecommend}
          onSync={onSync}
          onSignOut={onSignOut}
          onExportCSV={onExportCSV}
          onExportMAL={onExportMAL}
          onExportAniList={onExportAniList}
          onShare={onShare}
          onCheckCards={onHealthCheck}
          onTakeoutImport={onTakeoutImport}
          loadingRec={loadingRec}
          syncing={syncing}
        />
      </div>
    </div>
  )
}
