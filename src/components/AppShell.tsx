import { useEffect, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { CATEGORIES, KINDS, isNew, guidePath, guidesIn } from '../data/catalog'
import { useVisited } from '../data/visited'
import '../styles/shell.css'
import { CommandPalette } from './CommandPalette'
import { Icon, Logo } from './Icons'
import { ThemeToggle } from './ThemeToggle'

const COLLAPSED_KEY = 'keystone:collapsed'

function readCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
  } catch {
    return []
  }
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const visited = useVisited()
  const { pathname } = useLocation()
  const [collapsed, setCollapsed] = useState<string[]>(readCollapsed)
  const toggle = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter((x) => x !== id) : [...collapsed, id]
    setCollapsed(next)
    try {
      localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next))
    } catch {
      /* a convenience only */
    }
  }
  return (
    <nav className="k-nav" aria-label="Guides">
      <NavLink to="/" end onClick={onNavigate} className={({ isActive }) => `k-nav-top${isActive ? ' on' : ''}`}>
        <Icon name="home" size={16} /> Overview
      </NavLink>
      <Link to="/#paths" onClick={onNavigate} className="k-nav-top">
        <Icon name="path" size={16} /> Learning paths
      </Link>
      {CATEGORIES.map((c) => {
        const items = guidesIn(c.id)
        const open = !collapsed.includes(c.id) || items.some((g) => pathname === guidePath(g))
        return (
          <div className="k-nav-group" key={c.id}>
            <button type="button" className="k-nav-head" aria-expanded={open} onClick={() => toggle(c.id)} title={c.question}>
              <Icon name={c.icon} size={16} />
              <span>{c.title}</span>
              <span className="k-nav-count">{items.length}</span>
              <Icon name="chevron" size={14} className={`k-nav-chev${open ? '' : ' shut'}`} />
            </button>
            {open ? (
              <ul>
                {items.map((g) => (
                  <li key={g.slug}>
                    <NavLink to={guidePath(g)} onClick={onNavigate} className={({ isActive }) => `k-nav-item${isActive ? ' on' : ''}`}>
                      <span className={`k-kind-dot ${g.kind}`} title={KINDS[g.kind].label} />
                      <span className="k-nav-title">{g.title}</span>
                      {isNew(g) ? <span className="k-new">new</span> : null}
                      {visited.has(g.slug) ? <Icon name="check" size={13} className="k-visited" /> : null}
                    </NavLink>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )
      })}
      <div className="k-nav-legend">
        {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => (
          <span key={k} title={KINDS[k].hint}>
            <span className={`k-kind-dot ${k}`} /> {KINDS[k].label}
          </span>
        ))}
      </div>
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [drawer, setDrawer] = useState(false)
  const [palette, setPalette] = useState(0)
  const { pathname, hash } = useLocation()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setPalette((n) => (n > 0 ? n : -n + 1))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // A new page starts at the top, unless the link points at a section.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView()
    else window.scrollTo(0, 0)
  }, [pathname, hash])

  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <div className="k-app">
      <header className="k-top">
        <button type="button" className="k-icon-btn k-only-mobile" onClick={() => setDrawer(true)} aria-label="Open navigation">
          <Icon name="menu" />
        </button>
        <Link to="/" className="k-brand" aria-label="Keystone, home">
          <Logo />
          <span className="k-brand-name">Keystone</span>
          <span className="k-brand-tag">Architecture guidelines you can step through</span>
        </Link>
        <button type="button" className="k-search" onClick={() => setPalette((n) => -n + 1)} aria-label="Search guides">
          <Icon name="search" size={16} />
          <span className="k-search-text">Search guides</span>
          <kbd>{mac ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <ThemeToggle />
        <a href="https://linkedin.com/in/dvriesman" target="_blank" rel="noopener noreferrer" className="k-author" aria-label="Denny Richard San Vriesman on LinkedIn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM3.56 20.452h3.554V9H3.56v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          <span className="k-author-name">Denny Richard San Vriesman</span>
        </a>
      </header>

      <div className="k-body">
        <aside className="k-side">
          <Sidebar />
        </aside>
        {drawer ? (
          <div className="k-drawer" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="k-drawer-shade" onClick={() => setDrawer(false)} />
            <aside className="k-drawer-panel">
              <div className="k-drawer-head">
                <span className="k-brand-name">Keystone</span>
                <button type="button" className="k-icon-btn" onClick={() => setDrawer(false)} aria-label="Close navigation">
                  <Icon name="close" />
                </button>
              </div>
              <Sidebar onNavigate={() => setDrawer(false)} />
            </aside>
          </div>
        ) : null}
        <main className="k-main">{children}</main>
      </div>

      {/* A positive count is open; each opening uses a new number, so the palette mounts fresh. */}
      <CommandPalette key={palette} open={palette > 0} onClose={() => setPalette((n) => -n)} />
    </div>
  )
}
