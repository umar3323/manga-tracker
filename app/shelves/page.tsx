'use client'

import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { supabase, type Manga } from '@/lib/supabase'

interface Shelf { id: string; name: string; manga: Manga[] }

export default function ShelvesPage() {
  const [shelves, setShelves] = useState<Shelf[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const load = useCallback(async () => {
    const { data: shelfData } = await supabase.from('shelves').select('id, name').order('created_at')
    if (!shelfData) { setLoading(false); return }

    const withManga: Shelf[] = await Promise.all(
      shelfData.map(async shelf => {
        const { data: items } = await supabase
          .from('shelf_manga')
          .select('manga_id, manga_list(id, title, cover_url, current_chapter, status, mal_id, authors, has_anime, anime_mal_id, anime_title, episodes_watched, total_episodes, notes, total_chapters, last_read_at, created_at, updated_at)')
          .eq('shelf_id', shelf.id)
          .limit(10)
        const manga = (items ?? []).map((i: Record<string, unknown>) => i.manga_list as Manga).filter(Boolean)
        return { ...shelf, manga }
      })
    )
    setShelves(withManga)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const createShelf = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const { data, error } = await supabase.from('shelves').insert({ name: newName.trim() }).select().single()
    if (error) { showToast('Failed to create shelf'); setCreating(false); return }
    setShelves(prev => [...prev, { ...data, manga: [] }])
    setNewName('')
    setShowCreate(false)
    setCreating(false)
  }

  const deleteShelf = async (id: string) => {
    setShelves(prev => prev.filter(s => s.id !== id))
    await supabase.from('shelves').delete().eq('id', id)
  }

  const removeFromShelf = async (shelfId: string, mangaId: string) => {
    setShelves(prev => prev.map(s =>
      s.id === shelfId ? { ...s, manga: s.manga.filter(m => m.id !== mangaId) } : s
    ))
    await supabase.from('shelf_manga').delete().eq('shelf_id', shelfId).eq('manga_id', mangaId)
  }

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">My Shelves</h1>
            <p className="text-zinc-500 text-xs mt-0.5">Custom collections beyond status</p>
          </div>
          <button onClick={() => setShowCreate(v => !v)}
            className="px-4 py-2 bg-white text-black rounded-xl text-sm font-medium hover:bg-zinc-200">
            + New shelf
          </button>
        </div>

        {showCreate && (
          <div className="flex gap-2 mb-6">
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') createShelf(); if (e.key === 'Escape') { setShowCreate(false); setNewName('') } }}
              placeholder="Shelf name… e.g. 'Read with Potato'"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
            />
            <button onClick={createShelf} disabled={creating || !newName.trim()}
              className="px-5 py-3 bg-white text-black rounded-xl text-sm font-medium disabled:opacity-40">
              {creating ? '…' : 'Create'}
            </button>
          </div>
        )}

        {loading && <p className="text-zinc-500 text-sm">Loading…</p>}
        {!loading && shelves.length === 0 && (
          <div className="text-center py-16">
            <p className="text-2xl mb-3">📂</p>
            <p className="text-zinc-400 font-medium">No shelves yet</p>
            <p className="text-zinc-600 text-sm mt-1">Create a shelf to organise your manga beyond status.</p>
            <p className="text-zinc-600 text-xs mt-4">Examples: "Read with Potato" · "Anime adaptation watchlist" · "Comfort re-reads"</p>
          </div>
        )}

        <div className="space-y-6">
          {shelves.map(shelf => (
            <div key={shelf.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-semibold">{shelf.name}</h2>
                  <p className="text-xs text-zinc-500 mt-0.5">{shelf.manga.length} title{shelf.manga.length !== 1 ? 's' : ''}</p>
                </div>
                <button onClick={() => deleteShelf(shelf.id)}
                  className="text-xs text-zinc-700 hover:text-red-400 transition-colors px-2 py-1">
                  Delete shelf
                </button>
              </div>

              {shelf.manga.length === 0 ? (
                <p className="text-xs text-zinc-600 italic">Empty — add manga from My List using the ⋮ menu on each card.</p>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {shelf.manga.map(m => (
                    <div key={m.id} className="relative group">
                      <div className="aspect-[2/3] rounded-xl overflow-hidden bg-zinc-800">
                        {m.cover_url
                          ? <Image src={m.cover_url} alt={m.title} fill className="object-cover" unoptimized />
                          : <div className="w-full h-full flex items-center justify-center text-zinc-700 text-xs p-2 text-center">{m.title}</div>
                        }
                        <button onClick={() => removeFromShelf(shelf.id, m.id)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/70 rounded-full text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center text-xs">
                          ×
                        </button>
                      </div>
                      <p className="text-xs text-zinc-400 mt-1.5 truncate">{m.title}</p>
                      <p className="text-xs text-zinc-600">Ch. {m.current_chapter}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {toast && (
        <div role="alert" className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-800 border border-zinc-700 text-sm text-white px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </main>
  )
}
