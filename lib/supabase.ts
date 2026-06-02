import { createClient } from '@supabase/supabase-js'

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

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
