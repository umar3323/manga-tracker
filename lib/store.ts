import { create } from 'zustand'
import { supabase, type Manga } from '@/lib/supabase'

interface LibraryStore {
  mangaList: Manga[]
  isLoading: boolean
  activePeekId: string | null
  activeDetailId: string | null

  setLibrary: (list: Manga[]) => void
  openPeek: (id: string) => void
  closePeek: () => void
  openDetail: (id: string) => void
  closeDetail: () => void
  patchEntry: (id: string, patch: Partial<Manga>, showToast?: (msg: string) => void) => Promise<void>
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  mangaList: [],
  isLoading: true,
  activePeekId: null,
  activeDetailId: null,

  setLibrary: (list) => set({ mangaList: list, isLoading: false }),

  openPeek: (id) => set({ activePeekId: id }),

  closePeek: () => set({ activePeekId: null }),

  openDetail: (id) => set({ activeDetailId: id, activePeekId: null }),

  closeDetail: () => set({ activeDetailId: null }),

  patchEntry: async (id, patch, showToast) => {
    const snapshot = get().mangaList
    // Optimistic update
    set({ mangaList: snapshot.map(m => m.id === id ? { ...m, ...patch } : m) })
    const { error } = await supabase.from('manga_list').update(patch).eq('id', id)
    if (error) {
      // Rollback
      set({ mangaList: snapshot })
      showToast?.('Failed To Update Entry')
    }
  },
}))
