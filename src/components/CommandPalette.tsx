import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CATEGORIES, GUIDES, KINDS, QUALITIES, categoryOf, guidePath, type Guide } from '../data/catalog'
import { Icon } from './Icons'

// Mounted fresh each time it opens, so the query always starts empty.
// Every word typed must appear somewhere in the guide's title, summary, problem, category, kind or qualities.
function matches(g: Guide, query: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return 1
  const title = g.title.toLowerCase()
  const rest = [g.summary, g.problem, g.keywords, categoryOf(g).title, KINDS[g.kind].label, ...g.qualities.map((q) => QUALITIES[q].label)].join(' ').toLowerCase()
  let score = 0
  for (const w of words) {
    if (title.includes(w)) score += title.startsWith(w) ? 3 : 2
    else if (rest.includes(w)) score += 1
    else return 0
  }
  return score
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const navigate = useNavigate()

  const results = useMemo(
    () =>
      GUIDES.map((g) => ({ g, score: matches(g, query) }))
        .filter((r) => r.score > 0)
        .sort((a, b) => b.score - a.score || CATEGORIES.findIndex((c) => c.id === a.g.category) - CATEGORIES.findIndex((c) => c.id === b.g.category))
        .map((r) => r.g),
    [query],
  )

  if (!open) return null
  const safe = Math.min(active, Math.max(0, results.length - 1))
  const go = (g: Guide) => {
    onClose()
    navigate(guidePath(g))
  }

  return (
    <div className="k-palette-wrap" role="dialog" aria-modal="true" aria-label="Search guides" onMouseDown={onClose}>
      <div className="k-palette" onMouseDown={(e) => e.stopPropagation()}>
        <div className="k-palette-input">
          <Icon name="search" />
          <input
            autoFocus
            value={query}
            placeholder="Search by pattern, problem or quality: retries, tokens, outage…"
            aria-label="Search"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive(Math.min(safe + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive(Math.max(safe - 1, 0))
              } else if (e.key === 'Enter' && results[safe]) go(results[safe])
              else if (e.key === 'Escape') onClose()
            }}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="k-palette-list" role="listbox" aria-label="Results">
          {results.length ? (
            results.map((g, i) => (
              <li key={g.slug} role="option" aria-selected={i === safe}>
                <button type="button" className={i === safe ? 'on' : ''} onMouseEnter={() => setActive(i)} onClick={() => go(g)}>
                  <span className="k-palette-title">{g.title}</span>
                  <span className="k-palette-sub">{g.problem}</span>
                  <span className="k-palette-meta">
                    {categoryOf(g).title} · {KINDS[g.kind].label}
                  </span>
                </button>
              </li>
            ))
          ) : (
            <li className="k-palette-empty">No guide matches "{query}". Try a problem, such as "duplicate" or "slow".</li>
          )}
        </ul>
        <div className="k-palette-foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
        </div>
      </div>
    </div>
  )
}
