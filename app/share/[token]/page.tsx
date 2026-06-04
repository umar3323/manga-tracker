import { createClient } from '@supabase/supabase-js'
import Image from 'next/image'

interface SharedManga {
  id: string; title: string; current_chapter: number; status: string
  cover_url: string | null; total_chapters: number | null; genres: string[]
  has_anime: boolean; anime_title: string | null; episodes_watched: number
  total_episodes: number | null; last_read_at: string | null; user_rating: 'up' | 'down' | null
}

const STATUS_META: Record<string, { label: string; colour: string; dot: string }> = {
  reading:      { label: 'Reading',      colour: 'text-red-400',     dot: 'bg-red-400'     },
  completed:    { label: 'Completed',    colour: 'text-emerald-400', dot: 'bg-emerald-400' },
  on_hold:      { label: 'On Hold',      colour: 'text-amber-400',   dot: 'bg-amber-400'   },
  dropped:      { label: 'Dropped',      colour: 'text-zinc-500',    dot: 'bg-zinc-500'    },
  plan_to_read: { label: 'Plan to Read', colour: 'text-sky-400',     dot: 'bg-sky-400'     },
}

function pct(m: SharedManga) {
  if (!m.total_chapters || !m.current_chapter) return null
  return Math.min(100, Math.round((m.current_chapter / m.total_chapters) * 100))
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data, error } = await supabase.rpc('get_shared_manga_list', { p_token: token })

  if (error || !data || data.length === 0) {
    return (
      <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-5xl">📚</p>
          <p className="text-white font-semibold">List not found</p>
          <p className="text-zinc-500 text-sm">This list isn't available or sharing has been disabled.</p>
        </div>
      </main>
    )
  }

  const manga = data as SharedManga[]
  const totalChapters = manga.reduce((s, m) => s + m.current_chapter, 0)
  const reading      = manga.filter(m => m.status === 'reading')
  const completed    = manga.filter(m => m.status === 'completed')
  const planToRead   = manga.filter(m => m.status === 'plan_to_read')
  const onHold       = manga.filter(m => m.status === 'on_hold')
  const dropped      = manga.filter(m => m.status === 'dropped')
  const withAnime    = manga.filter(m => m.has_anime)
  const liked        = manga.filter(m => m.user_rating === 'up')

  // Top genres
  const genreCount: Record<string, number> = {}
  manga.forEach(m => (m.genres ?? []).forEach(g => { genreCount[g] = (genreCount[g] ?? 0) + 1 }))
  const topGenres = Object.entries(genreCount).sort((a, b) => b[1] - a[1]).slice(0, 8)

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Hero */}
      <div className="border-b border-zinc-800 bg-zinc-950">
        <div className="max-w-4xl mx-auto px-4 py-12 text-center">
          <p className="text-4xl mb-4">📚</p>
          <h1 className="text-3xl font-bold tracking-tight mb-1">Manga List</h1>
          <p className="text-zinc-500 text-sm">Shared via Manga Tracker</p>

          {/* Hero stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8 text-left">
            {[
              { value: manga.length,                      label: 'Titles tracked' },
              { value: totalChapters.toLocaleString(),    label: 'Chapters read'  },
              { value: completed.length,                  label: 'Completed'      },
              { value: `${withAnime.length}`,             label: 'With anime'     },
            ].map(s => (
              <div key={s.label} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="text-xs text-zinc-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">

        {/* Genre fingerprint */}
        {topGenres.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">Genre profile</h2>
            <div className="flex flex-wrap gap-2">
              {topGenres.map(([g, n]) => (
                <span key={g}
                  className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-xs text-zinc-300 flex items-center gap-1.5">
                  {g}
                  <span className="text-zinc-600">{n}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Currently reading */}
        {reading.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
              Currently reading <span className="text-zinc-700">· {reading.length}</span>
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {reading.map(m => (
                <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden group">
                  <div className="relative aspect-[2/3] bg-zinc-800">
                    {m.cover_url
                      ? <Image src={m.cover_url} alt={m.title} fill className="object-cover" unoptimized />
                      : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-2xl font-bold">{m.title[0]}</div>
                    }
                    {m.user_rating === 'up' && (
                      <div className="absolute top-1.5 right-1.5 text-sm">👍</div>
                    )}
                    {m.has_anime && (
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                        <p className="text-[10px] text-violet-300 truncate">🎬 {m.anime_title ?? 'Anime'}</p>
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <p className="text-xs font-medium text-zinc-200 line-clamp-2 leading-snug mb-1.5">{m.title}</p>
                    {pct(m) !== null ? (
                      <>
                        <div className="h-1 bg-zinc-800 rounded-full overflow-hidden mb-1">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${pct(m)}%` }} />
                        </div>
                        <p className="text-[10px] text-zinc-600">Ch. {m.current_chapter} / {m.total_chapters}</p>
                      </>
                    ) : (
                      <p className="text-[10px] text-zinc-600">Ch. {m.current_chapter}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
              Completed <span className="text-zinc-700">· {completed.length}</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {completed.map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  <div className="relative w-10 h-[52px] rounded-lg overflow-hidden bg-zinc-800 shrink-0">
                    {m.cover_url
                      ? <Image src={m.cover_url} alt={m.title} fill className="object-cover" unoptimized />
                      : <div className="w-full h-full flex items-center justify-center text-zinc-600 text-xs font-bold">{m.title[0]}</div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-200 truncate">{m.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">{m.current_chapter} chapters{m.user_rating === 'up' ? ' · 👍' : m.user_rating === 'down' ? ' · 👎' : ''}</p>
                  </div>
                  <span className="text-emerald-400 text-xs shrink-0">✓</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Liked titles */}
        {liked.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
              Favourites 👍 <span className="text-zinc-700">· {liked.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {liked.map(m => (
                <div key={m.id} className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-emerald-800/30 rounded-full">
                  <span className="text-xs text-zinc-300">{m.title}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Plan to read */}
        {planToRead.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
              Plan to read <span className="text-zinc-700">· {planToRead.length}</span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {planToRead.map(m => (
                <span key={m.id} className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-400">{m.title}</span>
              ))}
            </div>
          </section>
        )}

        {/* On hold + dropped */}
        {(onHold.length > 0 || dropped.length > 0) && (
          <section className="grid sm:grid-cols-2 gap-6">
            {onHold.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
                  On hold <span className="text-zinc-700">· {onHold.length}</span>
                </h2>
                <div className="space-y-1">
                  {onHold.map(m => (
                    <p key={m.id} className="text-xs text-zinc-400 truncate">• {m.title} <span className="text-zinc-600">ch.{m.current_chapter}</span></p>
                  ))}
                </div>
              </div>
            )}
            {dropped.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-3">
                  Dropped <span className="text-zinc-700">· {dropped.length}</span>
                </h2>
                <div className="space-y-1">
                  {dropped.map(m => (
                    <p key={m.id} className="text-xs text-zinc-400 truncate">• {m.title} <span className="text-zinc-600">ch.{m.current_chapter}</span></p>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Footer */}
        <div className="pt-6 border-t border-zinc-900 text-center">
          <p className="text-xs text-zinc-700">
            Created with{' '}
            <a href="https://manga-tracker-hazel.vercel.app" className="hover:text-zinc-500 transition-colors underline underline-offset-2">
              Manga Tracker
            </a>
          </p>
        </div>
      </div>
    </main>
  )
}
