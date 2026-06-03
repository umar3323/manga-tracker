import { createClient } from '@supabase/supabase-js'
import Image from 'next/image'

interface SharedManga {
  id: string; title: string; current_chapter: number; status: string
  cover_url: string | null; total_chapters: number | null; genres: string[]
  has_anime: boolean; anime_title: string | null; episodes_watched: number
  total_episodes: number | null; last_read_at: string | null
}

const STATUS_LABELS: Record<string, string> = {
  reading: 'Reading', completed: 'Completed', on_hold: 'On Hold',
  dropped: 'Dropped', plan_to_read: 'Plan to Read',
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
        <div className="text-center">
          <p className="text-4xl mb-4">📚</p>
          <p className="text-zinc-400">This list isn't available or sharing is disabled.</p>
        </div>
      </main>
    )
  }

  const manga = data as SharedManga[]
  const counts = manga.reduce((acc: Record<string, number>, m) => {
    acc[m.status] = (acc[m.status] ?? 0) + 1
    return acc
  }, {})
  const totalChapters = manga.reduce((s, m) => s + m.current_chapter, 0)
  const reading = manga.filter(m => m.status === 'reading')
  const completed = manga.filter(m => m.status === 'completed')

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl lg:max-w-5xl mx-auto px-4 py-10">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold mb-1">Manga List</h1>
          <p className="text-zinc-500 text-sm">Shared via Manga Tracker</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <div className="bg-zinc-900 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{manga.length}</div>
            <div className="text-xs text-zinc-500 mt-1">Titles</div>
          </div>
          <div className="bg-zinc-900 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{totalChapters.toLocaleString()}</div>
            <div className="text-xs text-zinc-500 mt-1">Chapters read</div>
          </div>
          <div className="bg-zinc-900 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{counts.reading ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-1">Reading</div>
          </div>
          <div className="bg-zinc-900 rounded-xl p-4 text-center">
            <div className="text-2xl font-bold">{counts.completed ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-1">Completed</div>
          </div>
        </div>

        {/* Currently reading */}
        {reading.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">Currently reading</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {reading.map(m => (
                <div key={m.id} className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                  {m.cover_url && (
                    <div className="relative aspect-[2/3]">
                      <Image src={m.cover_url} alt={m.title} fill className="object-cover" unoptimized />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="text-xs font-medium leading-snug line-clamp-2">{m.title}</p>
                    <p className="text-xs text-zinc-500 mt-1">Ch. {m.current_chapter}{m.total_chapters ? `/${m.total_chapters}` : ''}</p>
                    {m.has_anime && m.anime_title && (
                      <p className="text-xs text-violet-400 mt-0.5">🎬 {m.anime_title}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-4">Completed ({completed.length})</h2>
            <div className="space-y-2 lg:grid lg:grid-cols-2 lg:gap-2 lg:space-y-0">
              {completed.map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl p-3">
                  {m.cover_url && (
                    <Image src={m.cover_url} alt={m.title} width={32} height={44}
                      className="w-8 h-11 object-cover rounded shrink-0" unoptimized />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <p className="text-xs text-zinc-500">{m.current_chapter} chapters</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All other statuses */}
        {Object.entries(STATUS_LABELS)
          .filter(([s]) => s !== 'reading' && s !== 'completed')
          .map(([status, label]) => {
            const group = manga.filter(m => m.status === status)
            if (!group.length) return null
            return (
              <section key={status} className="mb-6">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wide mb-3">{label} ({group.length})</h2>
                <div className="flex flex-wrap gap-2">
                  {group.map(m => (
                    <span key={m.id} className="text-xs px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-full text-zinc-300">
                      {m.title}
                    </span>
                  ))}
                </div>
              </section>
            )
          })}

        <p className="text-center text-xs text-zinc-700 mt-12">
          Made with <a href="https://manga-tracker-hazel.vercel.app" className="hover:text-zinc-500">Manga Tracker</a>
        </p>
      </div>
    </main>
  )
}
