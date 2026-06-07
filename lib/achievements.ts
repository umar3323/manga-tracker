import type { Manga } from '@/lib/supabase'

// ──────────────────────────────────────────────────────────────────────────────
// Badge definitions — Shikimori-inspired: every badge encodes *meaning*,
// not just raw activity.  Three categories: Count, Genre, Milestone.
// ──────────────────────────────────────────────────────────────────────────────

export interface Badge {
  id: string
  name: string
  description: string
  emoji: string
  category: 'count' | 'genre' | 'milestone'
  /** Returns true if the user's library satisfies this badge */
  check: (manga: Manga[], totalChapters: number) => boolean
}

export const BADGES: Badge[] = [
  // ── Count badges ─────────────────────────────────────────────────────────
  {
    id: 'first_read',
    name: 'First Steps',
    description: 'Track your first manga',
    emoji: '🌱',
    category: 'count',
    check: (m) => m.length >= 1,
  },
  {
    id: 'reader_5',
    name: 'Getting Started',
    description: 'Track 5 titles',
    emoji: '📚',
    category: 'count',
    check: (m) => m.length >= 5,
  },
  {
    id: 'reader_25',
    name: 'Bookworm',
    description: 'Track 25 titles',
    emoji: '🐛',
    category: 'count',
    check: (m) => m.length >= 25,
  },
  {
    id: 'reader_100',
    name: 'The Librarian',
    description: 'Track 100 titles',
    emoji: '🏛️',
    category: 'count',
    check: (m) => m.length >= 100,
  },
  {
    id: 'chapters_100',
    name: 'Chapter Centurion',
    description: 'Read 100 chapters',
    emoji: '💯',
    category: 'count',
    check: (_, t) => t >= 100,
  },
  {
    id: 'chapters_500',
    name: 'Page Turner',
    description: 'Read 500 chapters',
    emoji: '📖',
    category: 'count',
    check: (_, t) => t >= 500,
  },
  {
    id: 'chapters_1000',
    name: 'Grand Reader',
    description: 'Read 1,000 chapters',
    emoji: '🏆',
    category: 'count',
    check: (_, t) => t >= 1000,
  },
  {
    id: 'chapters_5000',
    name: 'Legendary Otaku',
    description: 'Read 5,000 chapters',
    emoji: '⭐',
    category: 'count',
    check: (_, t) => t >= 5000,
  },

  // ── Completion badges ─────────────────────────────────────────────────────
  {
    id: 'completed_1',
    name: 'Finisher',
    description: 'Complete your first manga',
    emoji: '✅',
    category: 'milestone',
    check: (m) => m.filter(x => x.status === 'completed').length >= 1,
  },
  {
    id: 'completed_10',
    name: 'Dedicated',
    description: 'Complete 10 manga',
    emoji: '🎯',
    category: 'milestone',
    check: (m) => m.filter(x => x.status === 'completed').length >= 10,
  },
  {
    id: 'completed_50',
    name: 'Marathon Reader',
    description: 'Complete 50 manga',
    emoji: '🏅',
    category: 'milestone',
    check: (m) => m.filter(x => x.status === 'completed').length >= 50,
  },

  // ── Milestone badges ──────────────────────────────────────────────────────
  {
    id: 'anime_fan',
    name: 'Anime Fan',
    description: 'Link a manga to its anime adaptation',
    emoji: '📺',
    category: 'milestone',
    check: (m) => m.some(x => x.has_anime),
  },
  {
    id: 'rated_10',
    name: 'Critic',
    description: 'Rate 10 titles',
    emoji: '⭐',
    category: 'milestone',
    check: (m) => m.filter(x => x.user_rating !== null).length >= 10,
  },
  {
    id: 'long_haul',
    name: 'Long Haul',
    description: 'Read a manga with 200+ chapters',
    emoji: '🗺️',
    category: 'milestone',
    check: (m) => m.some(x => x.current_chapter >= 200),
  },
  {
    id: 'mega_series',
    name: 'Mega Series',
    description: 'Read a manga with 500+ chapters',
    emoji: '🌋',
    category: 'milestone',
    check: (m) => m.some(x => x.current_chapter >= 500),
  },

  // ── Genre badges ──────────────────────────────────────────────────────────
  {
    id: 'genre_action',
    name: 'Action Junkie',
    description: 'Track 5 Action titles',
    emoji: '⚔️',
    category: 'genre',
    check: (m) => m.filter(x => x.genres?.includes('Action')).length >= 5,
  },
  {
    id: 'genre_romance',
    name: 'Hopeless Romantic',
    description: 'Track 5 Romance titles',
    emoji: '💕',
    category: 'genre',
    check: (m) => m.filter(x => x.genres?.includes('Romance')).length >= 5,
  },
  {
    id: 'genre_horror',
    name: 'Horror Hound',
    description: 'Track 5 Horror titles',
    emoji: '👻',
    category: 'genre',
    check: (m) => m.filter(x => x.genres?.includes('Horror')).length >= 5,
  },
  {
    id: 'genre_fantasy',
    name: 'World Builder',
    description: 'Track 5 Fantasy titles',
    emoji: '🧙',
    category: 'genre',
    check: (m) => m.filter(x => x.genres?.includes('Fantasy')).length >= 5,
  },
  {
    id: 'genre_scifi',
    name: 'Sci-Fi Pioneer',
    description: 'Track 5 Sci-Fi titles',
    emoji: '🚀',
    category: 'genre',
    check: (m) => m.filter(x => x.genres?.includes('Sci-Fi') || x.genres?.includes('Science Fiction')).length >= 5,
  },
  {
    id: 'genre_isekai',
    name: 'Isekai Addict',
    description: 'Track 5 Isekai titles',
    emoji: '🌀',
    category: 'genre',
    check: (m) => m.filter(x => x.genres?.includes('Isekai')).length >= 5,
  },
  {
    id: 'genre_slice',
    name: 'Slice of Life',
    description: 'Track 5 Slice of Life titles',
    emoji: '☕',
    category: 'genre',
    check: (m) => m.filter(x => x.genres?.includes('Slice of Life')).length >= 5,
  },
  {
    id: 'genre_mystery',
    name: 'Detective',
    description: 'Track 5 Mystery titles',
    emoji: '🔍',
    category: 'genre',
    check: (m) => m.filter(x => x.genres?.includes('Mystery')).length >= 5,
  },
]

/** Evaluate which badges a user has earned, returns array of badge IDs */
export function evaluateAchievements(manga: Manga[]): string[] {
  const totalChapters = manga.reduce((s, m) => s + m.current_chapter, 0)
  return BADGES.filter(b => b.check(manga, totalChapters)).map(b => b.id)
}
