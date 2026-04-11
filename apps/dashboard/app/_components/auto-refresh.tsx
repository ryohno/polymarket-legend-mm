'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Polls the Next.js router to refresh the current page every N ms.
 * Drops into any route to give server-components auto-updating data.
 */
export function AutoRefresh({ intervalMs = 2000 }: { intervalMs?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])
  return null
}
