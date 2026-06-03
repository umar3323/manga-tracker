'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface Arc {
  id: string
  manga_id: string
  label: string
  chapter_start: number
  chapter_end: number
  tag: 'essential' | 'skip-safe' | 'filler'
  notes: string
  created_at: string
}

const TAG_CONFIG = {
  essential:  { label: 'Essential',  colour: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/40' },
  'skip-safe': { label: 'Skip-safe', colour: 'bg-yellow-400',  text: 'text-yellow-400',  border: 'border-yellow-500/40' },
  filler:     { label: 'Filler',     colour: 'bg-zinc-500',    text: 'text-zinc-400',    border: 'border-zinc-600' },
} as const

interface Props {
  mangaId: string
  totalChapters: number | null
  currentChapter: number
}

export default function ArcEditor({ mangaId, totalChapters, currentChapter }: Props) {
  const [arcs, setArcs] = useState<Arc[]>([])
  const [showForm, setShowForm] = useState(false)
  const [label, setLabel] = useState('')
  const [chStart, setChStart] = useState('')
  const [chEnd, setChEnd] = useState('')
  const [tag, setTag] = useState<Arc['tag']>('essential')
  const [arcNotes, setArcNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('arcs').select('*').eq('manga_id', mangaId)
      .order('chapter_start', { ascending: true })
      .then(({ data }) => { if (data) setArcs(data as Arc[]) })
  }, [mangaId])

  const addArc = async () => {
    if (!label.trim() || !chStart || !chEnd) return
    setSaving(true)
    const { data, error } = await supabase.from('arcs').insert({
      manga_id: mangaId,
      label: label.trim(),
      chapter_start: parseInt(chStart),
      chapter_end: parseInt(chEnd),
      tag,
      notes: arcNotes.trim(),
    }).select().single()
    if (!error && data) {
      setArcs(prev => [...prev, data as Arc].sort((a, b) => a.chapter_start - b.chapter_start))
      setLabel(''); setChStart(''); setChEnd(''); setArcNotes(''); setTag('essential')
      setShowForm(false)
    }
    setSaving(false)
  }

  const deleteArc = async (id: string) => {
    setArcs(prev => prev.filter(a => a.id !== id))
    await supabase.from('arcs').delete().eq('id', id)
  }

  const exportArcs = () => {
    const blob = new Blob([JSON.stringify(arcs, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url
    a.download = `arcs-${mangaId.slice(0, 8)}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const importArcs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    const text = await file.text()
    const parsed: Arc[] = JSON.parse(text)
    for (const arc of parsed) {
      await supabase.from('arcs').insert({
        manga_id: mangaId, label: arc.label,
        chapter_start: arc.chapter_start, chapter_end: arc.chapter_end,
        tag: arc.tag, notes: arc.notes ?? '',
      })
    }
    // Refresh
    const { data } = await supabase.from('arcs').select('*').eq('manga_id', mangaId).order('chapter_start')
    if (data) setArcs(data as Arc[])
    if (e.target) e.target.value = ''
  }

  const maxCh = totalChapters ?? Math.max(...arcs.map(a => a.chapter_end), currentChapter, 1)

  return (
    <div className="mt-4 border-t border-zinc-800 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
          Arc annotations {arcs.length > 0 && `(${arcs.length})`}
        </h3>
        <div className="flex gap-2">
          {arcs.length > 0 && (
            <>
              <button onClick={exportArcs} className="text-xs text-zinc-600 hover:text-zinc-400">↓ Export</button>
              <span className="text-zinc-700">·</span>
            </>
          )}
          <label className="text-xs text-zinc-600 hover:text-zinc-400 cursor-pointer">
            ↑ Import
            <input type="file" accept=".json" className="hidden" onChange={importArcs} />
          </label>
        </div>
      </div>

      {/* Timeline bar */}
      {arcs.length > 0 && (
        <div className="mb-3 relative h-4 bg-zinc-800 rounded-full overflow-hidden" title="Arc timeline">
          {arcs.map(arc => {
            const left  = ((arc.chapter_start - 1) / maxCh) * 100
            const width = ((arc.chapter_end - arc.chapter_start + 1) / maxCh) * 100
            return (
              <div key={arc.id}
                className={`absolute h-full ${TAG_CONFIG[arc.tag].colour} opacity-75 hover:opacity-100 transition-opacity`}
                style={{ left: `${left}%`, width: `${Math.max(width, 1)}%` }}
                title={`${arc.label} (ch.${arc.chapter_start}–${arc.chapter_end}) · ${arc.tag}`}
              />
            )
          })}
          {/* Current chapter marker */}
          <div className="absolute top-0 h-full w-0.5 bg-white/80 shadow"
            style={{ left: `${Math.min((currentChapter / maxCh) * 100, 100)}%` }}
            title={`Current: ch.${currentChapter}`}
          />
        </div>
      )}

      {/* Arc list */}
      {arcs.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {arcs.map(arc => (
            <div key={arc.id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${TAG_CONFIG[arc.tag].border} bg-zinc-800/50`}>
              <div className={`w-2 h-2 rounded-full shrink-0 ${TAG_CONFIG[arc.tag].colour}`} />
              <span className="text-xs font-medium flex-1 truncate">{arc.label}</span>
              <span className="text-xs text-zinc-600 shrink-0">ch.{arc.chapter_start}–{arc.chapter_end}</span>
              <span className={`text-xs shrink-0 ${TAG_CONFIG[arc.tag].text}`}>{TAG_CONFIG[arc.tag].label}</span>
              <button onClick={() => deleteArc(arc.id)} className="text-zinc-700 hover:text-red-400 text-sm leading-none shrink-0">×</button>
            </div>
          ))}
        </div>
      )}

      {/* Add arc form */}
      {showForm ? (
        <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Arc name…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" value={chStart} onChange={e => setChStart(e.target.value)} placeholder="Start ch."
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
            />
            <input type="number" value={chEnd} onChange={e => setChEnd(e.target.value)} placeholder="End ch."
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-zinc-600"
            />
            <select value={tag} onChange={e => setTag(e.target.value as Arc['tag'])}
              className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none cursor-pointer text-zinc-300">
              <option value="essential">Essential</option>
              <option value="skip-safe">Skip-safe</option>
              <option value="filler">Filler</option>
            </select>
          </div>
          <input value={arcNotes} onChange={e => setArcNotes(e.target.value)} placeholder="Notes (optional)…"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-500 placeholder:text-zinc-600"
          />
          <div className="flex gap-2">
            <button onClick={addArc} disabled={saving || !label.trim() || !chStart || !chEnd}
              className="flex-1 py-2 bg-white text-black rounded-lg text-xs font-medium disabled:opacity-40">
              {saving ? '…' : 'Add arc'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 bg-zinc-700 rounded-lg text-xs text-zinc-300">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full py-2 border border-dashed border-zinc-700 rounded-xl text-xs text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-colors">
          + Add arc
        </button>
      )}
    </div>
  )
}
