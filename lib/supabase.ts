import { createBrowserClient } from '@supabase/ssr'

export type MangaStatus = 'reading' | 'completed' | 'on_hold' | 'dropped' | 'plan_to_read' | 'watching'

export interface Author {
  id: number
  name: string
}

export interface Manga {
  id: string
  mal_id: number | null
  title: string
  authors: Author[]
  genres: string[]
  current_chapter: number
  status: MangaStatus
  cover_url: string | null
  total_chapters: number | null
  notes: string | null
  synopsis: string | null
  last_read_at: string | null
  user_rating: 'up' | 'down' | null
  publishing_status: 'Publishing' | 'Finished' | 'On Hiatus' | 'Discontinued' | null
  has_anime: boolean
  anime_mal_id: number | null
  anime_title: string | null
  episodes_watched: number
  total_episodes: number | null
  created_at: string
  updated_at: string
  // Sprint 5: public review
  is_public_review: boolean | null
  review_md: string | null
  // Takeout import: content type
  content_type: 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'anime' | 'novel' | 'other' | null
}

export interface SwipeRecord {
  id: string
  mal_id: number
  title: string
  direction: 'right' | 'left'
  genres: string[]
  synopsis: string | null
  swiped_at: string
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createBrowserClient(url, key)
