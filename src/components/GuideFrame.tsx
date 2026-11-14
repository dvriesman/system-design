import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { KINDS, ORDERED, QUALITIES, categoryOf, findGuide, guidePath, type Guide } from '../data/catalog'
import { markVisited } from '../data/visited'
import { Icon } from './Icons'

type Heading = { id: string; text: string }

// The page's own sections, read from the rendered page: every h2 with an id.
function useHeadings(root: React.RefObject<HTMLDivElement | null>, key: string): Heading[] {
  const [headings, setHeadings] = useState<Heading[]>([])
  useEffect(() => {
    const el = root.current
    if (!el) return
    const read = () =>
      setHeadings(
        Array.from(el.querySelectorAll<HTMLElement>('h2[id]'))
          .map((h) => ({ id: h.id, text: h.textContent?.trim() ?? '' }))
          .filter((h) => h.text),
      )
    const raf = requestAnimationFrame(read)
    return () => cancelAnimationFrame(raf)
  }, [root, key])
  return headings
}

function OnThisPage({ headings }: { headings: Heading[] }) {
  const [open, setOpen] = useState(false)
  if (!headings.length) return null
  return (
    <div className="k-toc">
      <button type="button" className="k-chip-btn" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Icon name="list" size={14} /> On this page <Icon name="chevron" size={12} />
      </button>
      {open ? (
        <ol className="k-toc-menu" onClick={() => setOpen(false)}>
          {headings.map((h) => (
            <li key={h.id}>
              <a href={`#${h.id}`}>{h.text}</a>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

export function GuideFrame({ guide, children }: { guide: Guide; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const headings = useHeadings(root, guide.slug)
  const category = categoryOf(guide)
  const index = ORDERED.findIndex((g) => g.slug === guide.slug)
  const prev = ORDERED[index - 1]
  const next = ORDERED[index + 1]
  const related = guide.related.map(findGuide).filter((g): g is Guide => !!g)

  useEffect(() => markVisited(guide.slug), [guide.slug])

  return (
    <div className="k-guide">
      <div className="k-crumbs">
        <nav aria-label="Breadcrumb" className="k-crumb-trail">
          <Link to="/">Catalog</Link>
          <Icon name="right" size={12} />
          <Link to={`/#${category.id}`}>{category.title}</Link>
          <Icon name="right" size={12} />
          <span aria-current="page">{guide.title}</span>
        </nav>
        <div className="k-crumb-tags">
          <span className={`k-kind ${guide.kind}`} title={KINDS[guide.kind].hint}>
            {KINDS[guide.kind].label}
          </span>
          {guide.qualities.map((q) => (
            <span key={q} className="k-quality" title={QUALITIES[q].hint}>
              {QUALITIES[q].label}
            </span>
          ))}
          <OnThisPage headings={headings} />
        </div>
      </div>

      <div ref={root}>{children}</div>

      <footer className="k-guide-foot">
        {related.length ? (
          <div className="k-related">
            <h2>Related guides</h2>
            <div className="k-related-grid">
              {related.map((g) => (
                <Link key={g.slug} to={guidePath(g)} className="k-card small">
                  <span className="k-card-cat">{categoryOf(g).title}</span>
                  <b>{g.title}</b>
                  <span>{g.summary}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}
        <div className="k-prevnext">
          {prev ? (
            <Link to={guidePath(prev)} className="k-pn">
              <span className="k-pn-dir">
                <Icon name="left" size={14} /> Previous
              </span>
              <b>{prev.title}</b>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to={guidePath(next)} className="k-pn right">
              <span className="k-pn-dir">
                Next <Icon name="right" size={14} />
              </span>
              <b>{next.title}</b>
            </Link>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
