import { createBrowserClient } from '@supabase/ssr'

export type MangaStatus = 'reading' | 'completed' | 'on_hold' | 'dropped'

export interface Manga {
  id: string
  title: string
  current_chapter: number
  status: MangaStatus
  cover_url: string | null
  total_chapters: number | null
  notes: string | null
  last_read_at: string | null
  created_at: string
  updated_at: string
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createBrowserClient(url, key)
