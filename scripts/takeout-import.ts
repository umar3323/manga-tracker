/**
 * Takeout import script — seeds manga_list with series identified from Google Takeout.
 * Run: npx tsx scripts/takeout-import.ts
 *
 * Prerequisites:
 *   NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
 *   (or set them in your shell before running)
 *
 * What it does:
 *   1. Queries existing manga_list rows to avoid duplicates (case-insensitive title match)
 *   2. Inserts all 33 series from the Takeout analysis
 *   3. Tags each with source = 'youtube_takeout_import' in notes
 *   4. Does NOT set episode/chapter progress counts
 *   5. Prints a summary of inserted vs skipped rows
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Load .env.local manually without requiring dotenv
try {
  const env = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
  for (const line of env.split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/)
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
} catch { /* .env.local not found — fall back to existing env */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

type InsertRow = {
  title: string
  status: string
  genres: string[]
  notes: string
  current_chapter: number
  episodes_watched: number
  total_chapters: number | null
  total_episodes: number | null
  has_anime: boolean
  content_type: 'manga' | 'manhwa' | 'manhua' | 'webtoon' | 'anime' | 'novel' | 'other'
}

// Map from takeout series to tracker row
const ENTRIES: InsertRow[] = [
  // ── HEAVY series ────────────────────────────────────────────────────────────
  // Infer watch status: ongoing series with heavy presence → 'watching' if still airing, else 'completed'
  {
    title: 'Frieren: Beyond Journey\'s End',
    status: 'watching', // Season 2 ongoing at export time
    genres: ['Fantasy', 'Adventure', 'Slice of Life', 'Drama'],
    notes: '[youtube_takeout_import] Most-watched series in YouTube history. Deep-dive: fights, lore, character analysis. Season 2 ongoing.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Bleach: Thousand-Year Blood War',
    status: 'watching',
    genres: ['Action', 'Supernatural', 'Shounen'],
    notes: '[youtube_takeout_import] Second most-watched. TYBW arc focus. All Bankais and Sternritter schrifts covered.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Jujutsu Kaisen',
    status: 'watching',
    genres: ['Action', 'Dark Fantasy', 'Supernatural', 'Shounen'],
    notes: '[youtube_takeout_import] Season 3 and manga continuation (Modulo) covered. Domain expansions deep-dived.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Black Clover',
    status: 'watching',
    genres: ['Action', 'Fantasy', 'Magic', 'Shounen'],
    notes: '[youtube_takeout_import] Anime + manga continuation. Movie content. Asta vs Lucifero arc.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'My Hero Academia',
    status: 'completed', // Manga ended
    genres: ['Action', 'Superhero', 'Shounen', 'School'],
    notes: '[youtube_takeout_import] Manga ending and epilogue extensively covered. Vigilantes spin-off noted.',
    current_chapter: 0, total_chapters: 430, episodes_watched: 0, total_episodes: 138, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'One Piece',
    status: 'watching',
    genres: ['Action', 'Adventure', 'Fantasy', 'Shounen'],
    notes: '[youtube_takeout_import] Devil fruit lore and Poneglyph analysis focus. Netflix live action Season 2 noted.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Demon Slayer: Kimetsu no Yaiba',
    status: 'watching',
    genres: ['Action', 'Supernatural', 'Shounen'],
    notes: '[youtube_takeout_import] Tanjiro vs Rui (S1E19) is most-rewatched clip. Infinity Castle arc coverage.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Hunter x Hunter',
    status: 'on_hold', // Manga on long hiatus
    genres: ['Action', 'Adventure', 'Shounen'],
    notes: '[youtube_takeout_import] Character analysis, Nen breakdowns, Chimera Ant arc. Manga on hiatus.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Delicious in Dungeon',
    status: 'completed', // Manga completed
    genres: ['Fantasy', 'Comedy', 'Adventure', 'Slice of Life'],
    notes: '[youtube_takeout_import] Short clips and comedy moments. Marcille/Laios focus. Food recreation content.',
    current_chapter: 0, total_chapters: 97, episodes_watched: 0, total_episodes: 24, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Attack on Titan',
    status: 'completed',
    genres: ['Action', 'Dark Fantasy', 'Mystery', 'Psychological'],
    notes: '[youtube_takeout_import] Titan transformations, foreshadowing analysis, narrative theory.',
    current_chapter: 0, total_chapters: 139, episodes_watched: 0, total_episodes: 87, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Chainsaw Man',
    status: 'watching',
    genres: ['Action', 'Dark Fantasy', 'Horror', 'Supernatural'],
    notes: '[youtube_takeout_import] Anime + manga. Reze Arc film. Makima ability analysis.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Naruto Shippuden',
    status: 'completed',
    genres: ['Action', 'Adventure', 'Shounen'],
    notes: '[youtube_takeout_import] Clip-based. Chunin exams, Minato, Kakashi, Itachi moments.',
    current_chapter: 0, total_chapters: 700, episodes_watched: 0, total_episodes: 500, has_anime: true,
    content_type: 'manga',
  },

  // ── MODERATE series ─────────────────────────────────────────────────────────
  {
    title: 'Tower of God',
    status: 'plan_to_read',
    genres: ['Action', 'Adventure', 'Fantasy', 'Mystery'],
    notes: '[youtube_takeout_import] Both anime seasons. WEBTOON origin. Bam power progression.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'webtoon',
  },
  {
    title: 'That Time I Got Reincarnated as a Slime',
    status: 'plan_to_read',
    genres: ['Isekai', 'Fantasy', 'Action', 'Comedy'],
    notes: '[youtube_takeout_import] Seasons 2 & 3. Rimuru Demon Lord arc. Movie content.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Mushoku Tensei: Jobless Reincarnation',
    status: 'plan_to_read',
    genres: ['Isekai', 'Fantasy', 'Adventure', 'Drama'],
    notes: '[youtube_takeout_import] Season 2 focus. DID YOU KNOW series (7 lore videos).',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Apothecary Diaries',
    status: 'plan_to_read',
    genres: ['Mystery', 'Historical', 'Drama', 'Slice of Life'],
    notes: '[youtube_takeout_import] Maomao character moments. Anime edits.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Fairy Tail',
    status: 'plan_to_read',
    genres: ['Action', 'Fantasy', 'Magic', 'Shounen'],
    notes: '[youtube_takeout_import] Lucy and Wendy clips. 100 Years Quest continuation.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Dandadan',
    status: 'plan_to_read',
    genres: ['Action', 'Comedy', 'Supernatural', 'Romance'],
    notes: '[youtube_takeout_import] Season 2 trailer and OP watched. Netflix Anime.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Sakamoto Days',
    status: 'plan_to_read',
    genres: ['Action', 'Comedy', 'Thriller'],
    notes: '[youtube_takeout_import] Netflix Anime clips. Frame Flux analysis.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Tokyo Ghoul',
    status: 'plan_to_read',
    genres: ['Action', 'Horror', 'Psychological'],
    notes: '[youtube_takeout_import] Opening Unravel searched multiple times. Kaneki vs Jason.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'One Punch Man',
    status: 'plan_to_read',
    genres: ['Action', 'Comedy', 'Superhero', 'Parody'],
    notes: '[youtube_takeout_import] Boros, King, Saitama analysis.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Soul Eater',
    status: 'plan_to_read',
    genres: ['Action', 'Fantasy', 'Shounen'],
    notes: '[youtube_takeout_import] Demon weapons ranked. Canon manga ending. Excalibur.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Spy x Family',
    status: 'plan_to_read',
    genres: ['Action', 'Comedy', 'Family'],
    notes: '[youtube_takeout_import] Anya clips. Food recreation content.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Witch Hat Atelier',
    status: 'plan_to_read',
    genres: ['Fantasy', 'Magic', 'Slice of Life'],
    notes: '[youtube_takeout_import] Crunchyroll trailer. Power system analysis.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: "Hell's Paradise",
    status: 'plan_to_read',
    genres: ['Action', 'Dark Fantasy', 'Historical'],
    notes: '[youtube_takeout_import] Sagiri vs Gabimaru fight clip.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Undead Unluck',
    status: 'plan_to_read',
    genres: ['Action', 'Supernatural', 'Comedy'],
    notes: '[youtube_takeout_import] Andy Victor personality. LATLA MIRAH ability.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Death Note',
    status: 'plan_to_read',
    genres: ['Thriller', 'Psychological', 'Mystery', 'Supernatural'],
    notes: "[youtube_takeout_import] L's realisation clips.",
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Berserk',
    status: 'plan_to_read',
    genres: ['Dark Fantasy', 'Action', 'Psychological'],
    notes: '[youtube_takeout_import] Manga read content. Idea of Evil, Griffith analysis.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Gachiakuta',
    status: 'plan_to_read',
    genres: ['Action', 'Fantasy', 'Shounen'],
    notes: '[youtube_takeout_import] Strongest Raiders / Vital Instrument analysis.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: false,
    content_type: 'manga',
  },
  {
    title: 'The Seven Deadly Sins',
    status: 'plan_to_read',
    genres: ['Action', 'Fantasy', 'Adventure'],
    notes: '[youtube_takeout_import] Origin game content. Meliodas and Escanor clips.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manga',
  },
  {
    title: 'Solo Leveling',
    status: 'plan_to_read',
    genres: ['Action', 'Fantasy', 'Dungeon'],
    notes: '[youtube_takeout_import] Manhwa origin. Anime Season 2. Manhwa lore explained.',
    current_chapter: 0, total_chapters: null, episodes_watched: 0, total_episodes: null, has_anime: true,
    content_type: 'manhwa',
  },
]

async function run() {
  console.log('Fetching existing titles from manga_list…')
  const { data: existing, error: fetchErr } = await supabase
    .from('manga_list')
    .select('title')

  if (fetchErr) {
    console.error('Failed to fetch existing entries:', fetchErr.message)
    process.exit(1)
  }

  const existingTitles = new Set((existing ?? []).map((r: { title: string }) => r.title.toLowerCase().trim()))

  const toInsert = ENTRIES.filter(e => !existingTitles.has(e.title.toLowerCase().trim()))
  const skipped  = ENTRIES.filter(e =>  existingTitles.has(e.title.toLowerCase().trim()))

  console.log(`Skipping ${skipped.length} already-present titles:`)
  skipped.forEach(e => console.log(`  ✓ ${e.title}`))

  if (toInsert.length === 0) {
    console.log('\nNothing to insert — all series already exist.')
    return
  }

  console.log(`\nInserting ${toInsert.length} new titles…`)
  const { error: insertErr } = await supabase.from('manga_list').insert(toInsert)

  if (insertErr) {
    console.error('Insert failed:', insertErr.message)
    process.exit(1)
  }

  toInsert.forEach(e => console.log(`  + ${e.title} (${e.status})`))
  console.log(`\nDone. ${toInsert.length} series imported, ${skipped.length} skipped.`)
}

run()
