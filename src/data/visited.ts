import { useEffect, useState } from 'react'

// Which guides this reader has opened, kept only in their browser. A convenience: the app works without it.
const KEY = 'keystone:visited'
const EVENT = 'keystone:visited'

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export function markVisited(slug: string) {
  const now = read()
  if (now.includes(slug)) return
  try {
    localStorage.setItem(KEY, JSON.stringify([...now, slug]))
  } catch {
    return
  }
  window.dispatchEvent(new Event(EVENT))
}

export function useVisited(): Set<string> {
  const [visited, setVisited] = useState(() => new Set(read()))
  useEffect(() => {
    const update = () => setVisited(new Set(read()))
    window.addEventListener(EVENT, update)
    window.addEventListener('storage', update)
    return () => {
      window.removeEventListener(EVENT, update)
      window.removeEventListener('storage', update)
    }
  }, [])
  return visited
}
