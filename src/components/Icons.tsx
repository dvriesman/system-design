import type { Icon as CategoryIcon } from '../data/catalog'

type Name = CategoryIcon | 'search' | 'menu' | 'close' | 'left' | 'right' | 'check' | 'chevron' | 'path' | 'home' | 'list'

const PATHS: Record<Name, string> = {
  ledger: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  scale: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  key: 'M8 19a4 4 0 100-8 4 4 0 000 8zM11 12l9-9M16 7l3 3M18 5l2 2',
  lock: 'M6 11h12a1 1 0 011 1v8a1 1 0 01-1 1H6a1 1 0 01-1-1v-8a1 1 0 011-1zM8 11V7a4 4 0 018 0v4',
  blueprint: 'M4 3h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4a1 1 0 011-1zM3 9h18M9 21V9',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM20 20l-4-4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  close: 'M6 6l12 12M18 6L6 18',
  left: 'M15 6l-6 6 6 6',
  right: 'M9 6l6 6-6 6',
  check: 'M5 12l5 5 9-10',
  chevron: 'M6 9l6 6 6-6',
  path: 'M5 19a2 2 0 100-4 2 2 0 000 4zM19 9a2 2 0 100-4 2 2 0 000 4zM5 15V9a4 4 0 014-4h8',
  home: 'M3 11l9-7 9 7M5 10v10h14V10',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
}

export function Icon({ name, size = 18, className }: { name: Name; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d={PATHS[name]} />
    </svg>
  )
}

// An arch, held together by its keystone.
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="k-logo">
      <rect width="32" height="32" rx="8" className="k-logo-bg" />
      <path d="M7 25v-8a9 9 0 0118 0v8" fill="none" strokeWidth="3.2" strokeLinecap="round" className="k-logo-arch" />
      <path d="M13.6 5.6h4.8l-1 5.2h-2.8z" className="k-logo-stone" />
    </svg>
  )
}
