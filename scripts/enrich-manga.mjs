/**
 * Batch-enriches manga_list entries that have no mal_id.
 * Calls Jikan API → finds best title match → fetches relations for anime adaptations
 * → prints SQL UPDATEs to stdout (and writes them to /tmp/enrich-updates.sql)
 *
 * Usage: node scripts/enrich-manga.mjs
 */

import { writeFileSync } from 'fs'

const SUPABASE_URL = 'https://qbthmlojqmkfzscbisus.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFidGhtbG9qcW1rZnpzY2Jpc3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA0MDYyNjQsImV4cCI6MjA5NTk4MjI2NH0.eElnfEwj2Y1Ug7vCX2kztkhZJows1NinOfY9bHWK-Xg'

const entries = [
  { id: '7eb8b091-12ec-48e6-89d9-1ac9494429e6', title: 'Apothecary Diaries' },
  { id: 'e78d1d4a-d310-4b1e-ae8c-fee7af0e9ad4', title: 'Attack on Titan' },
  { id: '9a24d935-39b2-4aef-87b3-7dda9bebcd65', title: 'Backstabbed in a Backwater Dungeon (Infinite Gacha)' },
  { id: '057eb63f-fecd-4de9-b33c-44b3a2220fca', title: 'Berserk' },
  { id: '3306e348-ceff-4d5a-913c-1a832039642a', title: 'Bleach' },
  { id: '273b2dc1-21f3-44a2-8144-d21299261290', title: 'Code Geass' },
  { id: 'aa7293b5-beba-46ae-83ce-80f884cb402e', title: 'Demon Slayer' },
  { id: '38dd13f3-632c-41c6-a502-ef30b96aec68', title: 'Dr. Stone' },
  { id: '5729be80-da29-48b6-90ee-02aadc21e040', title: 'Dreamcide' },
  { id: 'e9915352-b929-4856-a2cd-7cac85526301', title: 'Fire Force' },
  { id: '00f63f41-c872-4582-9e20-e6e3211cc2fd', title: 'Frieren' },
  { id: 'c8ab7962-83cb-4c6b-bf3f-793cf25480d1', title: 'Gachiakuta' },
  { id: 'a1eef3ad-d518-4bd8-9a52-a5b28bb4dddc', title: "It's Not My Fault I'm Not Popular" },
  { id: '3f4e556c-d6d3-4ca8-8bb2-56609b577f4a', title: 'Joujuu Senjin Mushibugyo' },
  { id: 'bd6ca938-bf59-4aeb-9e8d-d217014385e8', title: 'Jujutsu Kaisen' },
  { id: 'dfaf3d7f-1598-4fda-a610-ac29530bc024', title: 'Kaguya-Sama' },
  { id: '3f4b0063-e944-4849-8599-1f7c348c7ac2', title: 'Kaiju No. 8' },
  { id: '781ecf09-51f1-4958-a23c-e39aa2f547ff', title: 'Kimi Ni Todoke' },
  { id: 'e96b5b60-16cd-49f6-97fe-8224d45ec9dc', title: 'Komi-San' },
  { id: '097b5eb5-62c9-44b3-af37-2195f9b9da9d', title: 'Maiko-San Chi No Makanai-San' },
  { id: '2f635fe1-2c64-47f3-bf26-d355212ec070', title: 'mirai niki' },
  { id: '58e05282-c065-460d-8928-6f92aa91412c', title: 'My Hero Academia' },
  { id: '7bd80f21-4b39-4703-859c-84de90f8e258', title: 'One Piece' },
  { id: '27b471b0-5d7f-4cfd-8b53-a0698203e6c7', title: 'Parasyte' },
  { id: 'b5a4ea95-b895-4a04-aa7d-eb700ddf9505', title: 'promised neverland' },
  { id: 'b3837e6c-4ea4-4705-955a-f288f99ed2ff', title: 'Puella Magi Madoka Magica' },
  { id: '47864e36-c55c-47bf-a574-bbe193e7bbd7', title: 'Re:Zero' },
  { id: '7d008318-9ae2-4feb-ad36-845e3ea0d57a', title: 'Sakamoto Days' },
  { id: '4c12c9fc-bf4a-4f04-8408-73f2ffd1fb42', title: 'Sweat and Soap' },
  { id: '7a167b05-5fc3-4435-97cf-d8755d8b6a9a', title: 'Terror Man' },
  { id: '2d791519-8910-441a-9d44-6879d709875f', title: 'The Eminence in Shadow' },
  { id: '29c70f29-36c8-4f1f-928f-e2fa2bd27420', title: 'The Rising of the Shield Hero' },
  { id: '67bed378-b39e-43d8-a8c4-c6b7327bf6c8', title: 'The Seven Deadly Sins' },
  { id: 'a7f69025-2323-442e-b317-e26714b34e71', title: 'Tokyo Ghoul' },
  { id: '2bb07bcc-98f5-43ee-8b39-8317f62baf0d', title: 'Tomo-chan wa Onnanoko' },
  { id: '3774a371-33ac-4382-a711-4948bf885c82', title: 'Tower of God' },
  { id: 'adc98b37-266f-4ba7-a899-124cfde93540', title: 'Uzumaki' },
  { id: 'a1b8dc11-9d5b-4ad6-90a4-14f2fa5ce6fa', title: 'Vinland Saga' },
]

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function jikan(path, attempt = 0) {
  const url = `https://api.jikan.moe/v4${path}`
  const res = await fetch(url)
  if (res.status === 429) {
    const wait = 1200 * (attempt + 1)
    console.error(`  Rate limited — waiting ${wait}ms`)
    await sleep(wait)
    return jikan(path, attempt + 1)
  }
  if (!res.ok) throw new Error(`Jikan ${res.status} for ${path}`)
  return res.json()
}

function esc(str) {
  if (str == null) return 'NULL'
  return `'${String(str).replace(/'/g, "''")}'`
}

function escArr(arr) {
  if (!arr || arr.length === 0) return "'{}'::text[]"
  const items = arr.map(s => `"${String(s).replace(/"/g, '""')}"`)
  return `ARRAY[${items.map(i => `'${i.replace(/'/g, "''")}'`).join(',')}]::text[]`
}

async function getAnimeAdaptation(mangaMalId) {
  try {
    const data = await jikan(`/manga/${mangaMalId}/relations`)
    await sleep(400)
    const adaptations = (data.data || [])
      .filter(r => r.relation === 'Adaptation')
      .flatMap(r => r.entry)
      .filter(e => e.type === 'anime')

    if (!adaptations.length) return null

    // Fetch the first anime entry to get episodes
    const animeData = await jikan(`/anime/${adaptations[0].mal_id}`)
    await sleep(400)
    const a = animeData.data
    return {
      anime_mal_id: a.mal_id,
      anime_title: a.title,
      total_episodes: a.episodes ?? null,
    }
  } catch (e) {
    console.error(`  Failed to get anime adaptation for MAL ${mangaMalId}: ${e.message}`)
    return null
  }
}

const results = []
const failed = []

for (const entry of entries) {
  console.log(`\nSearching: ${entry.title}`)
  try {
    await sleep(400) // ~2.5 req/s — within Jikan limit
    const data = await jikan(`/manga?q=${encodeURIComponent(entry.title)}&limit=3&type=manga`)
    const items = data.data || []

    if (!items.length) {
      console.log(`  ❌ No results`)
      failed.push({ ...entry, reason: 'no results' })
      continue
    }

    // Pick best match: prefer exact title match (case-insensitive), else first result
    const normalise = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const needle = normalise(entry.title)
    let best = items.find(i =>
      normalise(i.title) === needle ||
      normalise(i.title_english || '') === needle ||
      (i.titles || []).some(t => normalise(t.title) === needle)
    ) || items[0]

    const m = best
    const authors = (m.authors || []).map(a => a.name)
    const genres = [
      ...(m.genres || []).map(g => g.name),
      ...(m.themes || []).map(t => t.name),
      ...(m.demographics || []).map(d => d.name),
    ]
    const coverUrl = m.images?.jpg?.large_image_url || m.images?.jpg?.image_url || null
    const synopsis = m.synopsis || null
    const totalChapters = m.chapters || null

    console.log(`  ✅ Matched: ${m.title} (MAL ${m.mal_id}) — ${authors.join(', ')}`)

    // Check anime adaptations
    const anime = await getAnimeAdaptation(m.mal_id)
    if (anime) console.log(`  📺 Anime: ${anime.anime_title}`)

    results.push({
      id: entry.id,
      originalTitle: entry.title,
      mal_id: m.mal_id,
      title: m.title,
      cover_url: coverUrl,
      authors,
      genres,
      synopsis,
      total_chapters: totalChapters,
      has_anime: !!anime,
      anime_mal_id: anime?.anime_mal_id ?? null,
      anime_title: anime?.anime_title ?? null,
      total_episodes: anime?.total_episodes ?? null,
    })
  } catch (e) {
    console.error(`  ❌ Error: ${e.message}`)
    failed.push({ ...entry, reason: e.message })
  }
}

// Generate SQL
const sqls = results.map(r => {
  const authorsArr = escArr(r.authors)
  const genresArr = escArr(r.genres)
  return `UPDATE manga_list SET
  mal_id = ${r.mal_id},
  cover_url = ${esc(r.cover_url)},
  authors = ${authorsArr},
  genres = ${genresArr},
  synopsis = ${esc(r.synopsis)},
  total_chapters = ${r.total_chapters ?? 'NULL'},
  has_anime = ${r.has_anime},
  anime_mal_id = ${r.anime_mal_id ?? 'NULL'},
  anime_title = ${esc(r.anime_title)},
  total_episodes = ${r.total_episodes ?? 'NULL'}
WHERE id = '${r.id}';
-- [${r.originalTitle}] → ${r.title} (MAL ${r.mal_id})
`
}).join('\n')

writeFileSync('/tmp/enrich-updates.sql', sqls)
console.log('\n\n=== DONE ===')
console.log(`Enriched: ${results.length}/${entries.length}`)
if (failed.length) console.log('Failed:', failed.map(f => `${f.title} (${f.reason})`).join(', '))
console.log('\nSQL written to /tmp/enrich-updates.sql')
console.log('\n--- SQL PREVIEW ---')
console.log(sqls.substring(0, 3000))
