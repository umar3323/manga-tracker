'use client'

import DiscoverPanel from '@/components/DiscoverPanel'

export default function DiscoverPage() {
  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold">Discover</h1>
          <p className="text-zinc-500 text-xs mt-0.5">Find manga to read next</p>
        </div>
        <DiscoverPanel defaultTab="new" />
      </div>
    </main>
  )
}
