'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type State = 'loading' | 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed'

export default function NotificationBell() {
  const [state, setState] = useState<State>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setState('unsupported'); return
    }
    if (Notification.permission === 'denied') {
      setState('denied'); return
    }
    navigator.serviceWorker.ready.then(async reg => {
      const sub = await reg.pushManager.getSubscription()
      setState(sub ? 'subscribed' : 'unsubscribed')
    })
  }, [])

  const toggle = async () => {
    if (busy || state === 'unsupported' || state === 'denied') return
    setBusy(true)

    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) { setBusy(false); return }

    try {
      const reg = await navigator.serviceWorker.ready

      if (state === 'subscribed') {
        // Unsubscribe
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          await fetch('/api/push/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ subscription: sub.toJSON(), action: 'unsubscribe' }),
          })
          await sub.unsubscribe()
        }
        setState('unsubscribed')
      } else {
        // Request permission then subscribe
        const perm = await Notification.requestPermission()
        if (perm !== 'granted') { setState('denied'); setBusy(false); return }

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!) as unknown as ArrayBuffer,
        })
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ subscription: sub.toJSON(), action: 'subscribe' }),
        })
        setState('subscribed')
      }
    } catch (e) {
      console.error('Push toggle failed', e)
    }
    setBusy(false)
  }

  if (state === 'loading' || state === 'unsupported') return null

  const label = state === 'subscribed' ? 'Chapter Alerts On' : state === 'denied' ? 'Notifications Blocked' : 'Get Chapter Alerts'
  const icon  = state === 'subscribed' ? '🔔' : '🔕'

  return (
    <button
      onClick={toggle}
      disabled={busy || state === 'denied'}
      title={state === 'denied' ? 'Allow Notifications In Browser Settings' : label}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50
        ${state === 'subscribed'
          ? 'bg-emerald-900/30 border border-emerald-800/40 text-emerald-400 hover:bg-emerald-900/50'
          : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
    >
      <span>{icon}</span>
      <span>{busy ? '…' : label}</span>
    </button>
  )
}

// Helper: convert a VAPID public key from base64url to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}
