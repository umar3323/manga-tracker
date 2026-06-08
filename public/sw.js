const CACHE = 'yomu-v1'
const STATIC = [
  '/',
  '/manifest.json',
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e
  const url = new URL(request.url)

  // Skip non-GET, cross-origin, and API/Supabase requests — always network
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/') ||
    url.hostname.includes('supabase')
  ) {
    return
  }

  // Next.js static assets: cache-first
  if (url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.match(request).then(cached => cached ?? fetch(request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(request, clone))
        return res
      }))
    )
    return
  }

  // Everything else: network-first, fall back to cache
  e.respondWith(
    fetch(request).then(res => {
      if (res.ok) {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(request, clone))
      }
      return res
    }).catch(() => caches.match(request))
  )
})

// Push notification handler
self.addEventListener('push', e => {
  const data = e.data?.json() ?? {}
  e.waitUntil(
    self.registration.showNotification(data.title ?? 'YOMU', {
      body: data.body ?? '',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: data.url ? { url: data.url } : {},
    })
  )
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const url = e.notification.data?.url ?? '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
      const existing = cs.find(c => c.url === url)
      return existing ? existing.focus() : clients.openWindow(url)
    })
  )
})
