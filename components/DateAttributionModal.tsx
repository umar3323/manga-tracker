'use client'

import { useState } from 'react'
import { Calendar, Hash, HelpCircle, X } from 'lucide-react'

export type DateAttribution =
  | { precision: 'exact'; date: string }                               // single day YYYY-MM-DD
  | { precision: 'range'; startDate: string; endDate: string }         // spread across multiple days
  | { precision: 'year_only'; year: number }
  | { precision: 'unknown' }

interface Props {
  title: string
  delta: number
  type: 'chapter' | 'episode'
  onConfirm: (attr: DateAttribution, applyToAll: boolean) => void
  onDismiss: () => void
}

const currentYear = new Date().getFullYear()
const todayISO = new Date().toISOString().slice(0, 10)

const YEARS = Array.from({ length: currentYear - 1999 }, (_, i) => currentYear - i)

type Tab = 'exact' | 'range' | 'year_only' | 'unknown'

function daysBetween(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000) + 1
}

export default function DateAttributionModal({ title, delta, type, onConfirm, onDismiss }: Props) {
  const [tab, setTab] = useState<Tab>('exact')
  const [date, setDate] = useState(todayISO)
  const [startDate, setStartDate] = useState(todayISO)
  const [endDate, setEndDate] = useState(todayISO)
  const [year, setYear] = useState(currentYear)
  const [applyToAll, setApplyToAll] = useState(false)

  const label = type === 'chapter'
    ? `+${delta} chapter${delta !== 1 ? 's' : ''}`
    : `+${delta} episode${delta !== 1 ? 's' : ''}`

  const rangeValid = tab !== 'range' || (!!startDate && !!endDate && startDate <= endDate)
  const rangeDays = tab === 'range' && startDate && endDate && startDate <= endDate
    ? daysBetween(startDate, endDate) : 0

  const confirm = () => {
    if (!rangeValid) return
    let attr: DateAttribution
    if (tab === 'exact')          attr = { precision: 'exact', date }
    else if (tab === 'range')     attr = { precision: 'range', startDate, endDate }
    else if (tab === 'year_only') attr = { precision: 'year_only', year }
    else                          attr = { precision: 'unknown' }
    onConfirm(attr, applyToAll)
  }

  const TAB_OPTIONS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'exact',     label: 'Date',       icon: <Calendar size={13} strokeWidth={1.5} /> },
    { id: 'range',     label: 'Range',      icon: <span className="text-[11px] leading-none">↔</span> },
    { id: 'year_only', label: 'Year',       icon: <Hash size={13} strokeWidth={1.5} /> },
    { id: 'unknown',   label: "Unknown",    icon: <HelpCircle size={13} strokeWidth={1.5} /> },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)' }}
      onClick={onDismiss}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button onClick={onDismiss} className="absolute top-3 right-3 text-zinc-600 hover:text-zinc-400 transition-colors">
          <X size={15} strokeWidth={1.5} />
        </button>

        {/* Header */}
        <p className="text-xs text-zinc-500 mb-0.5">When did you {type === 'chapter' ? 'read' : 'watch'} this?</p>
        <p className="font-semibold text-sm text-white truncate mb-4">
          {title} <span className="font-normal text-violet-400">{label}</span>
        </p>

        {/* Tab strip */}
        <div className="flex gap-1 bg-zinc-800 rounded-xl p-1 mb-4">
          {TAB_OPTIONS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-lg text-center transition-colors text-[10px] font-medium ${
                tab === t.id ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === 'exact' && (
          <div className="mb-4">
            <label className="text-xs text-zinc-500 block mb-1.5">Date {type === 'chapter' ? 'read' : 'watched'}</label>
            <input
              type="date"
              value={date}
              max={todayISO}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-zinc-500 cursor-pointer"
              style={{ colorScheme: 'dark' }}
            />
          </div>
        )}

        {tab === 'range' && (
          <div className="mb-4 space-y-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">From</label>
              <input
                type="date"
                value={startDate}
                max={endDate || todayISO}
                onChange={e => setStartDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-zinc-500 cursor-pointer"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1.5">To</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                max={todayISO}
                onChange={e => setEndDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-zinc-500 cursor-pointer"
                style={{ colorScheme: 'dark' }}
              />
            </div>
            {rangeDays > 0 && (
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                {delta} {type}{delta !== 1 ? 's' : ''} spread across{' '}
                <span className="text-zinc-300">{rangeDays} day{rangeDays !== 1 ? 's' : ''}</span>
                {rangeDays > 1 && (
                  <> — ~{(delta / rangeDays).toFixed(1)} per day</>
                )}
              </p>
            )}
            {startDate > endDate && (
              <p className="text-[11px] text-red-400">Start date must be before end date</p>
            )}
          </div>
        )}

        {tab === 'year_only' && (
          <div className="mb-4">
            <label className="text-xs text-zinc-500 block mb-1.5">Year</label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setYear(y => Math.max(2000, y - 1))}
                className="w-9 h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-lg transition-colors"
              >−</button>
              <span className="flex-1 text-center text-lg font-semibold tabular-nums">{year}</span>
              <button
                onClick={() => setYear(y => Math.min(currentYear, y + 1))}
                className="w-9 h-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center text-lg transition-colors"
              >+</button>
            </div>
            <input
              type="range" min={2000} max={currentYear} value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="w-full mt-2 accent-violet-500"
            />
          </div>
        )}

        {tab === 'unknown' && (
          <p className="text-xs text-zinc-500 mb-4 leading-relaxed">
            Progress will be saved without a date. It won&apos;t appear in weekly or timeline stats, but counts toward your total.
          </p>
        )}

        {/* Apply to all toggle */}
        {tab !== 'unknown' && (
          <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={applyToAll}
              onChange={e => setApplyToAll(e.target.checked)}
              className="w-3.5 h-3.5 accent-violet-500 rounded"
            />
            <span className="text-xs text-zinc-500">Apply This Date To All Future Entries This Session</span>
          </label>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={confirm}
            disabled={!rangeValid}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-40"
            style={{ backgroundColor: 'var(--vermillion)' }}
          >
            Save
          </button>
          <button
            onClick={onDismiss}
            className="px-4 py-2.5 rounded-xl text-sm text-zinc-500 hover:text-zinc-300 bg-zinc-800 transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
