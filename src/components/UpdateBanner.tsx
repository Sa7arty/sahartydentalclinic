import { useEffect, useRef, useState } from 'react'

function extractAssetPaths(html: string): string[] {
  return [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]).sort()
}

/**
 * A browser tab left open across a deploy keeps running the old JavaScript
 * bundle indefinitely — a normal reload only fetches new code on demand, and
 * nothing else tells a person sitting on that tab that a fix has shipped.
 * This polls the page's own asset list (Vite's content-hashed /assets/ files)
 * against what's actually live, and offers a one-click refresh once they differ.
 * Mounted once in Layout so every signed-in page, for every account, is covered.
 */
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false)
  const currentRef = useRef<string[] | null>(null)

  useEffect(() => {
    currentRef.current = extractAssetPaths(document.documentElement.innerHTML)

    async function check() {
      try {
        const res = await fetch('/', { cache: 'no-store' })
        const latest = extractAssetPaths(await res.text())
        // Dev server has no hashed /assets/ files at all — nothing to compare, skip.
        if (!currentRef.current?.length || !latest.length) return
        if (JSON.stringify(latest) !== JSON.stringify(currentRef.current)) setAvailable(true)
      } catch {
        // Offline or a network blip — just try again next interval.
      }
    }

    const interval = setInterval(check, 5 * 60 * 1000)
    window.addEventListener('focus', check)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', check)
    }
  }, [])

  if (!available) return null

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 flex flex-wrap items-center justify-center gap-3 bg-navy-900 px-4 py-3 text-sm text-white shadow-xl">
      <span>An update is ready — refresh to get the latest fixes.</span>
      <button onClick={() => window.location.reload()} className="rounded-lg bg-gold-500 px-3 py-1.5 font-medium text-navy-950 hover:bg-gold-400">
        Refresh now
      </button>
    </div>
  )
}
