// AnimeRow matches the Supabase anime_list table schema
export interface AnimeRow {
  id: string
  title: string
  current_ep: string
  season: number | null
  episode_number: number | null
  total_watch_hours: number
  last_watched: string   // ISO date string (YYYY-MM-DD)
  is_movie: boolean
  netflix_rating: 'up' | 'down' | null
  user_rating: 'up' | 'down' | null
  cover_url: string | null
  created_at: string
  updated_at: string
}

export type AnimeStatus = 'active' | 'paused' | 'older' | 'movie'

export function getStatus(entry: Pick<AnimeRow, 'is_movie' | 'last_watched'>): AnimeStatus {
  if (entry.is_movie) return 'movie'
  const days = (Date.now() - new Date(entry.last_watched).getTime()) / 86400000
  if (days <= 90)  return 'active'
  if (days <= 365) return 'paused'
  return 'older'
}

// Kept for backward compatibility — consumers should prefer AnimeRow
export type AnimeEntry = AnimeRow
