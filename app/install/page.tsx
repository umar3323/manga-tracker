'use client'

import { Smartphone, Apple, Monitor, Globe, CheckCircle } from 'lucide-react'

const STEPS_IOS = [
  {
    step: 1,
    icon: '🌐',
    title: 'Open in Safari',
    body: 'Navigate to manga-tracker-hazel.vercel.app in Safari on your iPhone or iPad. YOMU must be opened in Safari — Chrome and Firefox on iOS cannot add sites to the home screen.',
  },
  {
    step: 2,
    icon: '⬆️',
    title: 'Tap the Share button',
    body: 'Tap the Share icon at the bottom of the screen (a box with an arrow pointing up). On iPad, it is in the toolbar at the top.',
  },
  {
    step: 3,
    icon: '➕',
    title: 'Add To Home Screen',
    body: 'Scroll down in the share sheet and tap "Add to Home Screen". You can rename it — it defaults to "YOMU".',
  },
  {
    step: 4,
    icon: '✅',
    title: 'Tap Add',
    body: 'Tap "Add" in the top-right corner. YOMU will appear on your home screen like a native app with a full-screen layout and no browser chrome.',
  },
]

const STEPS_ANDROID = [
  {
    step: 1,
    icon: '🌐',
    title: 'Open in Chrome',
    body: 'Navigate to manga-tracker-hazel.vercel.app in Chrome on your Android phone or tablet.',
  },
  {
    step: 2,
    icon: '⋮',
    title: 'Tap the menu',
    body: 'Tap the three-dot menu (⋮) in the top-right corner of Chrome.',
  },
  {
    step: 3,
    icon: '➕',
    title: 'Add to Home Screen',
    body: 'Tap "Add to Home Screen" (or "Install App" if Chrome shows an install banner). Chrome may prompt you directly with a banner at the bottom of the screen.',
  },
  {
    step: 4,
    icon: '✅',
    title: 'Install',
    body: 'Confirm the install prompt. YOMU installs as a standalone app and appears in your app drawer and home screen.',
  },
]

const WHAT_YOU_GET = [
  'Full-screen layout — no browser address bar',
  'Home screen icon (YOMU lettermark)',
  'Swipe navigation between library, search, stats, and shelves',
  'Automatic login — your session persists',
  'Works on slow connections — the library loads from cache',
]

function StepCard({ step, icon, title, body }: { step: number; icon: string; title: string; body: string }) {
  return (
    <div style={{
      display: 'flex', gap: 16, padding: '16px 0',
      borderBottom: '1px solid var(--ink-700)',
    }}>
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: 10,
        background: 'var(--ink-700)', display: 'grid', placeItems: 'center',
        fontSize: 18,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--vermillion)',
            fontFamily: 'var(--font-sans)',
          }}>Step {step}</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--fg-1)' }}>{title}</span>
        </div>
        <p style={{ fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.6, margin: 0 }}>{body}</p>
      </div>
    </div>
  )
}

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--ink-900)', border: '1px solid var(--ink-700)',
      borderRadius: 16, padding: '20px 20px 4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{
          width: 32, height: 32, borderRadius: 9,
          background: 'var(--vermillion-tint)', display: 'grid', placeItems: 'center',
        }}>
          <Icon size={16} color="var(--vermillion)" />
        </div>
        <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg-1)', margin: 0 }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

export default function InstallPage() {
  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 16px 64px' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'var(--vermillion)', display: 'grid', placeItems: 'center',
            boxShadow: '0 0 0 1px rgba(255,45,70,0.4), 0 0 16px rgba(255,45,70,0.2)',
          }}>
            <Smartphone size={20} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--fg-1)', margin: 0 }}>Add YOMU To Your Home Screen</h1>
            <p style={{ fontSize: 13, color: 'var(--fg-4)', margin: 0 }}>Install as an app on iOS or Android — no App Store required</p>
          </div>
        </div>
      </div>

      {/* What You Get */}
      <div style={{
        background: 'var(--ink-800)', border: '1px solid var(--ink-600)',
        borderRadius: 14, padding: '16px 20px', marginBottom: 24,
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', margin: '0 0 12px', fontFamily: 'var(--font-sans)' }}>What you get</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {WHAT_YOU_GET.map(item => (
            <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, color: 'var(--fg-2)' }}>
              <CheckCircle size={14} color="var(--vermillion)" style={{ flexShrink: 0, marginTop: 1 }} />
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* iOS Instructions */}
      <div style={{ marginBottom: 20 }}>
        <SectionCard icon={Apple} title="iPhone & iPad (iOS / iPadOS)">
          {STEPS_IOS.map(s => <StepCard key={s.step} {...s} />)}
          <div style={{ padding: '12px 0 8px' }}>
            <p style={{ fontSize: 12, color: 'var(--fg-4)', margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--fg-3)' }}>Safari only.</strong> Chrome, Firefox, and other iOS browsers cannot add to the home screen — this is an Apple restriction. Make sure you are in Safari before tapping Share.
            </p>
          </div>
        </SectionCard>
      </div>

      {/* Android Instructions */}
      <div style={{ marginBottom: 20 }}>
        <SectionCard icon={Globe} title="Android (Chrome)">
          {STEPS_ANDROID.map(s => <StepCard key={s.step} {...s} />)}
          <div style={{ padding: '12px 0 8px' }}>
            <p style={{ fontSize: 12, color: 'var(--fg-4)', margin: 0, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--fg-3)' }}>Chrome recommended.</strong> Firefox for Android supports "Install" too — look for the same "Add to Home Screen" option in its menu. Samsung Internet also works.
            </p>
          </div>
        </SectionCard>
      </div>

      {/* Desktop */}
      <div style={{ marginBottom: 32 }}>
        <SectionCard icon={Monitor} title="Desktop (Chrome / Edge)">
          <div style={{ padding: '16px 0 8px' }}>
            <p style={{ fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.6, margin: '0 0 12px' }}>
              Chrome and Edge show an install icon in the address bar when a PWA is available. Click it and select "Install YOMU". The app opens in its own window without browser tabs.
            </p>
            <p style={{ fontSize: 12, color: 'var(--fg-4)', margin: 0, lineHeight: 1.5 }}>
              Safari on macOS does not support PWA install from the address bar — use Chrome or Edge on desktop.
            </p>
          </div>
        </SectionCard>
      </div>

      {/* Troubleshooting */}
      <div style={{
        background: 'var(--ink-850)', border: '1px solid var(--ink-700)',
        borderRadius: 14, padding: '16px 20px',
      }}>
        <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--fg-4)', margin: '0 0 12px', fontFamily: 'var(--font-sans)' }}>Troubleshooting</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { q: '"Add to Home Screen" is missing on iOS', a: 'Make sure you are using Safari, not Chrome or Firefox. The option is only visible in Safari on iOS.' },
            { q: 'The icon looks wrong or shows a screenshot', a: 'This can happen on iOS if the site has been visited before the icon was set up. Remove the existing shortcut and add it again fresh.' },
            { q: 'Session expired — I have to log in again', a: 'YOMU uses Supabase session tokens that last around 1 hour of inactivity. If you are prompted to log in, your credentials are saved — just sign in again.' },
            { q: 'The library did not load', a: 'Check your internet connection. YOMU requires a network connection to load your library data from Supabase.' },
          ].map(({ q, a }) => (
            <div key={q} style={{ paddingBottom: 10, borderBottom: '1px solid var(--ink-800)' }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--fg-2)', margin: '0 0 4px' }}>{q}</p>
              <p style={{ fontSize: 12, color: 'var(--fg-4)', margin: 0, lineHeight: 1.5 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
