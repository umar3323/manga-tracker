import type { Metadata, Viewport } from 'next'
import Nav from '@/components/Nav'
import Sidebar from '@/components/Sidebar'
import { FeatureRequestButton } from '@/components/FeatureRequestModal'
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Manga Tracker',
  description: 'Track your manga reading and anime watching progress',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Manga' },
  icons: { apple: '/icon.svg', icon: '/icon.svg' },
}

export const viewport: Viewport = {
  themeColor: '#0d0d0d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full" style={{ background: 'var(--ink-850)', color: 'var(--fg-1)' }}>
        {/* Flex row: tablet rail (md) | sidebar (lg) | content */}
        <div className="flex">
          <Nav />
          <Sidebar />
          {/* pb-24 on mobile clears the floating bottom bar */}
          <main className="flex-1 min-w-0 pb-24 md:pb-0">
            {children}
          </main>
        </div>
        <FeatureRequestButton />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  )
}
