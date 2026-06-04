'use client'

import { useState } from 'react'
import { Lightbulb } from 'lucide-react'

const CATEGORIES = ['Feature', 'Bug report', 'Improvement', 'Content', 'Other']

interface Props {
  onClose: () => void
}

export function FeatureRequestModal({ onClose }: Props) {
  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory]     = useState('Feature')
  const [status, setStatus]         = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg]     = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setStatus('loading')
    try {
      const res = await fetch('/api/feature-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, category }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? 'Failed') }
      setStatus('success')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
      setStatus('error')
    }
  }

  return (
    /* backdrop */
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(9,9,12,0.75)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 16px',
      }}
    >
      {/* panel */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
          background: 'var(--ink-700)', border: 'var(--border-hair)',
          borderRadius: 'var(--r-xl)', overflow: 'hidden',
          boxShadow: 'var(--shadow-3)',
        }}
      >
        {/* header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: 'var(--border-hair)',
        }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--fg-1)' }}>Request a Feature</div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 2 }}>Your idea goes straight to the roadmap.</div>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--fg-3)', fontSize: 20, lineHeight: 1, padding: 4,
          }}>✕</button>
        </div>

        {status === 'success' ? (
          /* success state */
          <div style={{ padding: '40px 22px', textAlign: 'center' }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--success-tint)', border: '2px solid var(--success)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, margin: '0 auto 16px',
            }}>✓</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg-1)', marginBottom: 6 }}>Request submitted!</div>
            <div style={{ fontSize: 13, color: 'var(--fg-3)', marginBottom: 24 }}>It&apos;s been logged to the roadmap spreadsheet.</div>
            <button onClick={onClose} style={{
              padding: '10px 28px', borderRadius: 'var(--r-md)',
              background: 'var(--vermillion)', color: '#fff',
              border: 'none', cursor: 'pointer', fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14,
            }}>Done</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* category pills */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                Category
              </label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {CATEGORIES.map(c => (
                  <button
                    key={c} type="button" onClick={() => setCategory(c)}
                    style={{
                      padding: '5px 13px', borderRadius: 'var(--r-pill)',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      fontFamily: 'var(--font-sans)', border: '1px solid',
                      transition: 'all 120ms ease',
                      background: category === c ? 'var(--vermillion-tint)' : 'var(--ink-600)',
                      borderColor: category === c ? 'var(--vermillion)' : 'var(--ink-500)',
                      color: category === c ? 'var(--vermillion-bright)' : 'var(--fg-2)',
                    }}
                  >{c}</button>
                ))}
              </div>
            </div>

            {/* title */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                What do you want? <span style={{ color: 'var(--vermillion)' }}>*</span>
              </label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Dark mode for the reader"
                maxLength={120}
                required
                style={{
                  width: '100%', background: 'var(--ink-600)',
                  border: `1px solid ${title ? 'var(--ink-500)' : 'var(--ink-500)'}`,
                  borderRadius: 'var(--r-md)', padding: '10px 13px',
                  color: 'var(--fg-1)', fontFamily: 'var(--font-sans)', fontSize: 14,
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 120ms',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--vermillion)')}
                onBlur={e => (e.target.style.borderColor = 'var(--ink-500)')}
              />
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--fg-4)', marginTop: 4 }}>{title.length}/120</div>
            </div>

            {/* description */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--fg-3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                More detail <span style={{ color: 'var(--fg-4)' }}>(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Why would this be useful? Any specific behaviour you have in mind?"
                rows={3}
                maxLength={500}
                style={{
                  width: '100%', background: 'var(--ink-600)',
                  border: '1px solid var(--ink-500)', borderRadius: 'var(--r-md)',
                  padding: '10px 13px', color: 'var(--fg-1)',
                  fontFamily: 'var(--font-sans)', fontSize: 14,
                  outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                  transition: 'border-color 120ms',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--vermillion)')}
                onBlur={e => (e.target.style.borderColor = 'var(--ink-500)')}
              />
              <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--fg-4)', marginTop: 4 }}>{description.length}/500</div>
            </div>

            {status === 'error' && (
              <div style={{ fontSize: 13, color: 'var(--danger)', background: 'var(--danger-tint)', border: '1px solid var(--danger)', borderRadius: 'var(--r-md)', padding: '8px 12px' }}>
                {errorMsg}
              </div>
            )}

            {/* actions */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
              <button type="button" onClick={onClose} style={{
                padding: '10px 18px', borderRadius: 'var(--r-md)',
                background: 'var(--ink-600)', border: 'var(--border-hair)',
                color: 'var(--fg-2)', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 14,
              }}>Cancel</button>
              <button type="submit" disabled={status === 'loading' || !title.trim()} style={{
                padding: '10px 22px', borderRadius: 'var(--r-md)',
                background: title.trim() ? 'var(--vermillion)' : 'var(--ink-500)',
                color: title.trim() ? '#fff' : 'var(--fg-4)',
                border: 'none', cursor: title.trim() ? 'pointer' : 'not-allowed',
                fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 14,
                transition: 'all 120ms',
                opacity: status === 'loading' ? 0.7 : 1,
              }}>
                {status === 'loading' ? 'Sending…' : 'Submit request'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/** Floating trigger button — drop this anywhere in your layout */
export function FeatureRequestButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Request a feature"
        style={{
          position: 'fixed', bottom: 80, right: 20, zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 16px', borderRadius: 'var(--r-pill)',
          background: 'var(--ink-700)', border: 'var(--border-hair)',
          color: 'var(--fg-2)', cursor: 'pointer',
          fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 13,
          boxShadow: 'var(--shadow-2)',
          transition: 'all var(--dur-fast) var(--ease-out)',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLElement
          el.style.background = 'var(--vermillion)'
          el.style.borderColor = 'var(--vermillion)'
          el.style.color = '#fff'
          el.style.boxShadow = 'var(--glow-vermillion)'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLElement
          el.style.background = 'var(--ink-700)'
          el.style.borderColor = 'var(--ink-500)'
          el.style.color = 'var(--fg-2)'
          el.style.boxShadow = 'var(--shadow-2)'
        }}
      >
        <Lightbulb size={15} strokeWidth={1.5} />
        <span className="hidden md:inline">Request a feature</span>
      </button>
      {open && <FeatureRequestModal onClose={() => setOpen(false)} />}
    </>
  )
}
