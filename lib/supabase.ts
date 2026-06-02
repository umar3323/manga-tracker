import { createClient } from '@supabase/supabase-js'

export type MangaStatus = 'reading' | 'completed' | 'on_hold' | 'dropped'

export interface Manga {
  id: string
  title: string
  current_chapter: number
  status: MangaStatus
  created_at: string
  updated_at: string
}

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
