import { createClient } from '@supabase/supabase-js'

interface SharedManga {
  id: string; title: string; current_chapter: number; status: string
  cover_url: string | null; total_chapters: number | null; genres: string[]
  has_anime: boolean; anime_title: string | null; user_rating: 'up' | 'down' | null
}

const STATUS_DOT: Record<string, string> = {
  reading: 'bg-red-400', completed: 'bg-emerald-400',
  on_hold: 'bg-amber-400', dropped: 'bg-zinc-500', plan_to_read: 'bg-sky-400',
}

function topGenres(list: SharedManga[], n = 6) {
  const acc: Record<string, number> = {}
  list.forEach(m => (m.genres ?? []).forEach(g => { acc[g] = (acc[g] ?? 0) + 1 }))
  return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, n)
}

function compatibilityScore(a: SharedManga[], b: SharedManga[]) {
  const aGenres = new Set(a.flatMap(m => m.genres ?? []))
  const bGenres = new Set(b.flatMap(m => m.genres ?? []))
  const shared = [...aGenres].filter(g => bGenres.has(g)).length
  const union = new Set([...aGenres, ...bGenres]).size
  return union === 0 ? 0 : Math.round((shared / union) * 100)
}

export default async function ComparePage({
  params,
}: {
  params: Promise<{ tokenA: string; tokenB: string }>
}) {
  const { tokenA, tokenB } = await params
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [resA, resB] = await Promise.all([
    supabase.rpc('get_shared_manga_list', { p_token: tokenA }),
    supabase.rpc('get_shared_manga_list', { p_token: tokenB }),
  ])

  if (resA.error || !resA.data?.length || resB.error || !resB.data?.length) {
    return (
      <main className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-white font-semibold">One or both lists not found</p>
          <p className="text-zinc-500 text-sm">Make sure both share links are active.</p>
        </div>
      </main>
    )
  }

  const listA = resA.data as SharedManga[]
  const listB = resB.data as SharedManga[]

  const titlesA = new Set(listA.map(m => m.title.toLowerCase()))
  const titlesB = new Set(listB.map(m => m.title.toLowerCase()))

  const both    = listA.filter(m => titlesB.has(m.title.toLowerCase()))
  const onlyA   = listA.filter(m => !titlesB.has(m.title.toLowerCase()))
  const onlyB   = listB.filter(m => !titlesA.has(m.title.toLowerCase()))
  const score   = compatibilityScore(listA, listB)
  const genresA = topGenres(listA)
  const genresB = topGenres(listB)

  const scoreLabel =
    score >= 75 ? 'Kindred spirits' :
    score >= 50 ? 'Plenty in common' :
    score >= 30 ? 'Some overlap' :
    'Very different tastes'

  const scoreColor =
    score >= 75 ? '#2FCF7A' : score >= 50 ? '#2BE6DC' : score >= 30 ? '#FFB02E' : '#FF2D46'

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-xs text-zinc-500 uppercase tracking-widest mb-2">List comparison</p>

        {/* Score hero */}
        <div className="flex flex-col items-center py-8 mb-8">
          <div className="text-7xl font-black mb-2" style={{ color: scoreColor }}>{score}%</div>
          <p className="text-lg font-semibold text-white mb-1">{scoreLabel}</p>
          <p className="text-sm text-zinc-500">
            {both.length} titles in common · {listA.length + listB.length - both.length * 2} unique between you
          </p>
        </div>

        {/* Genre comparison */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {[
            { label: 'List A', genres: genresA, color: '#FF2D46' },
            { label: 'List B', genres: genresB, color: '#2BE6DC' },
          ].map(({ label, genres, color }) => (
            <div key={label} className="bg-zinc-900 rounded-xl p-4">
              <p className="text-xs font-semibold mb-3" style={{ color }}>{label} top genres</p>
              <div className="space-y-1.5">
                {genres.map(([g, n]) => (
                  <div key={g} className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 flex-1 truncate">{g}</span>
                    <span className="text-xs text-zinc-600">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Shared titles */}
        {both.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              Both reading ({both.length})
            </h2>
            <div className="space-y-2">
              {both.map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-zinc-900 rounded-xl px-4 py-3">
                  {m.cover_url && (
                    <img src={m.cover_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      A: Ch.{m.current_chapter} · B: Ch.{listB.find(b => b.title.toLowerCase() === m.title.toLowerCase())?.current_chapter ?? '?'}
                    </p>
                  </div>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[m.status] ?? 'bg-zinc-500'}`} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Only in A */}
        {onlyA.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: '#FF2D46' }} />
              Only in List A ({onlyA.length})
            </h2>
            <div className="space-y-2">
              {onlyA.slice(0, 10).map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-zinc-900 rounded-xl px-4 py-3">
                  {m.cover_url && (
                    <img src={m.cover_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Ch.{m.current_chapter}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[m.status] ?? 'bg-zinc-500'}`} />
                </div>
              ))}
              {onlyA.length > 10 && <p className="text-xs text-zinc-600 px-1">+{onlyA.length - 10} more</p>}
            </div>
          </section>
        )}

        {/* Only in B */}
        {onlyB.length > 0 && (
          <section className="mb-8">
            <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ background: '#2BE6DC' }} />
              Only in List B ({onlyB.length})
            </h2>
            <div className="space-y-2">
              {onlyB.slice(0, 10).map(m => (
                <div key={m.id} className="flex items-center gap-3 bg-zinc-900 rounded-xl px-4 py-3">
                  {m.cover_url && (
                    <img src={m.cover_url} alt="" className="w-7 h-10 object-cover rounded shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Ch.{m.current_chapter}</p>
                  </div>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[m.status] ?? 'bg-zinc-500'}`} />
                </div>
              ))}
              {onlyB.length > 10 && <p className="text-xs text-zinc-600 px-1">+{onlyB.length - 10} more</p>}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
