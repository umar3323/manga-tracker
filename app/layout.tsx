import type { Metadata, Viewport } from 'next'
import Nav from '@/components/Nav'
import Sidebar from '@/components/Sidebar'
import { FeatureRequestButton } from '@/components/FeatureRequestModal'
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
        {/* Mobile top nav hidden on lg (sidebar replaces it) */}
        <Nav />
        <div className="flex">
          {/* Persistent sidebar — lg+ only */}
          <Sidebar />
          {/* Main content — pb for mobile bottom nav */}
          <main className="flex-1 min-w-0 pb-20 lg:pb-0">
            {children}
          </main>
        </div>
        <FeatureRequestButton />
      </body>
    </html>
  )
}
