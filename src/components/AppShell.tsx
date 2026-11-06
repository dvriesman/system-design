import { useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { patternGroups } from '../data/patterns'
import { ThemeToggle } from './ThemeToggle'

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-4 p-4">
      {patternGroups.map((group) => (
        <div key={group.slug}>
          <div className="px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {group.title}
          </div>
          <ul className="mt-1 flex flex-col gap-0.5">
            {group.patterns.map((pattern) => (
              <li key={pattern.slug}>
                <NavLink
                  to={`/patterns/${group.slug}/${pattern.slug}`}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `block rounded-md px-2 py-1.5 text-sm transition-colors ${
                      isActive
                        ? 'bg-purple-100 font-medium text-purple-800 dark:bg-purple-900/40 dark:text-purple-200'
                        : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                    }`
                  }
                >
                  {pattern.title}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      <header className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-200 px-4 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setMobileNavOpen((open) => !open)}
          className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
          aria-label="Toggle navigation"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
          </svg>
        </button>
        <span className="min-w-0 flex-1 truncate text-base font-semibold sm:flex-initial">System Design: Interactive Learning</span>
        <ThemeToggle />
        <a
          href="https://linkedin.com/in/dvriesman"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-purple-700 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-purple-300"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="flex-shrink-0">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM3.56 20.452h3.554V9H3.56v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
          </svg>
          <span className="hidden sm:inline">Denny Richard San Vriesman</span>
        </a>
      </header>

      <div className="flex flex-1">
        <aside className="hidden w-64 flex-shrink-0 border-r border-gray-200 md:block dark:border-gray-800">
          <SidebarContent />
        </aside>

        {mobileNavOpen && (
          <div className="fixed inset-0 z-20 flex md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <aside className="relative z-30 h-full w-64 bg-white dark:bg-gray-950">
              <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
            </aside>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  )
}
