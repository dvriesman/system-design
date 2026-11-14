import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../components/Icons'
import { CATEGORIES, GUIDES, KINDS, LEARNING_PATHS, isNew, QUALITIES, categoryOf, findGuide, guidePath, guidesIn, type Guide, type Kind, type Quality } from '../data/catalog'
import { useVisited } from '../data/visited'

const STEPS = [
  { n: '1', title: 'Understand it', text: 'The mechanism from scratch, one idea per tab, with something real to try: a real hash, a real token, a real breaker.' },
  { n: '2', title: 'Decide when', text: 'Concrete cases, including when the answer is "no" or "use something else", and the myths worth dropping.' },
  { n: '3', title: 'Break it', text: 'A debugger: competing designs side by side, the state of every system at every line, and the invariants that hold or break.' },
  { n: '4', title: 'Build it', text: 'How real products do it, the production pitfalls, and how to explain the decision in a design review.' },
]

function GuideCard({ g, visited }: { g: Guide; visited: boolean }) {
  return (
    <Link to={guidePath(g)} className="k-card">
      <span className="k-card-top">
        <span className={`k-kind ${g.kind}`}>{KINDS[g.kind].label}</span>
        {isNew(g) ? <span className="k-new">new</span> : null}
        {visited ? (
          <span className="k-card-visited">
            <Icon name="check" size={13} /> opened
          </span>
        ) : null}
      </span>
      <b>{g.title}</b>
      <span>{g.summary}</span>
      <span className="k-card-tags">
        {g.qualities.map((q) => (
          <span key={q} className="k-quality">
            {QUALITIES[q].label}
          </span>
        ))}
      </span>
    </Link>
  )
}

export default function Home() {
  const visited = useVisited()
  const [quality, setQuality] = useState<Quality | null>(null)
  const [kind, setKind] = useState<Kind | null>(null)
  const [text, setText] = useState('')

  const shown = useMemo(() => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean)
    return new Set(
      GUIDES.filter((g) => (!quality || g.qualities.includes(quality)) && (!kind || g.kind === kind))
        .filter((g) => {
          const hay = `${g.title} ${g.summary} ${g.problem} ${g.keywords}`.toLowerCase()
          return words.every((w) => hay.includes(w))
        })
        .map((g) => g.slug),
    )
  }, [quality, kind, text])
  const filtering = !!quality || !!kind || !!text
  const live = GUIDES.length
  const planned = CATEGORIES.reduce((n, c) => n + c.planned.length, 0)

  return (
    <div className="k-home">
      <section className="k-hero">
        <div className="k-hero-eyebrow">
          <span className="k-pulse" /> {live} interactive guides · {planned} more planned
        </div>
        <h1>
          Architecture decisions
          <br />
          you can step through.
        </h1>
        <p>
          Keystone is a field guide for engineers who design systems. Each guide explains a pattern from scratch, says when it's worth it and when it isn't, and lets you
          step through it failing, line by line, so you can choose with confidence before you build.
        </p>
        <div className="k-hero-actions">
          <a href="#catalog" className="k-btn primary">
            Browse the catalog
          </a>
          <a href="#paths" className="k-btn">
            Follow a learning path
          </a>
        </div>
        <ul className="k-hero-facts">
          <li>
            <b>Checked</b> against the RFCs, standards and product docs each guide relies on
          </li>
          <li>
            <b>Hands-on</b>: real cryptography, real state machines, real trade-offs
          </li>
          <li>
            <b>Honest</b> about what each fix costs, and where the responsibility moves
          </li>
        </ul>
      </section>

      <section className="k-sec" aria-labelledby="problems">
        <h2 id="problems">Start from the problem</h2>
        <p className="k-sec-lede">Choose a pattern for the problem you have, not the technology you want to use.</p>
        <div className="k-problems">
          {GUIDES.filter((g) => g.kind !== 'architecture').map((g) => (
            <Link key={g.slug} to={guidePath(g)} className="k-problem">
              <span className="k-problem-q">{g.problem}</span>
              <span className="k-problem-a">
                {g.title} <Icon name="right" size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="k-sec" aria-labelledby="how">
        <h2 id="how">How every guide works</h2>
        <div className="k-steps">
          {STEPS.map((s) => (
            <div key={s.n} className="k-step">
              <span className="k-step-n">{s.n}</span>
              <b>{s.title}</b>
              <span>{s.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="k-sec" id="catalog" aria-labelledby="catalog-h">
        <h2 id="catalog-h">The catalog</h2>
        <div className="k-filters">
          <label className="k-filter-text">
            <Icon name="search" size={16} />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter guides" aria-label="Filter guides" />
          </label>
          <div className="k-chips" role="group" aria-label="Quality">
            {(Object.keys(QUALITIES) as Quality[]).map((q) => (
              <button key={q} type="button" className="k-chip" aria-pressed={quality === q} title={QUALITIES[q].hint} onClick={() => setQuality(quality === q ? null : q)}>
                {QUALITIES[q].label}
              </button>
            ))}
          </div>
          <div className="k-chips" role="group" aria-label="Kind">
            {(Object.keys(KINDS) as Kind[]).map((k) => (
              <button key={k} type="button" className="k-chip" aria-pressed={kind === k} title={KINDS[k].hint} onClick={() => setKind(kind === k ? null : k)}>
                <span className={`k-kind-dot ${k}`} /> {KINDS[k].label}
              </button>
            ))}
          </div>
          {filtering ? (
            <button
              type="button"
              className="k-clear"
              onClick={() => {
                setQuality(null)
                setKind(null)
                setText('')
              }}
            >
              Clear · {shown.size} of {live}
            </button>
          ) : null}
        </div>

        {CATEGORIES.map((c) => {
          const items = guidesIn(c.id).filter((g) => shown.has(g.slug))
          if (filtering && !items.length) return null
          return (
            <div key={c.id} id={c.id} className="k-cat">
              <div className="k-cat-head">
                <span className="k-cat-icon">
                  <Icon name={c.icon} size={20} />
                </span>
                <div>
                  <h3>{c.title}</h3>
                  <p className="k-cat-q">{c.question}</p>
                </div>
              </div>
              <div className="k-grid">
                {items.map((g) => (
                  <GuideCard key={g.slug} g={g} visited={visited.has(g.slug)} />
                ))}
              </div>
              {!filtering && c.planned.length ? (
                <p className="k-planned">
                  <span>Planned:</span> {c.planned.join(' · ')}
                </p>
              ) : null}
            </div>
          )
        })}
      </section>

      <section className="k-sec" id="paths" aria-labelledby="paths-h">
        <h2 id="paths-h">Learning paths</h2>
        <p className="k-sec-lede">Each guide stands alone. These orders build one idea on the last.</p>
        <div className="k-paths">
          {LEARNING_PATHS.map((p) => {
            const guides = p.slugs.map(findGuide).filter((g): g is Guide => !!g)
            const done = guides.filter((g) => visited.has(g.slug)).length
            return (
              <div key={p.id} className="k-path">
                <div className="k-path-head">
                  <b>{p.title}</b>
                  <span className="k-path-progress">
                    {done} of {guides.length} opened
                  </span>
                </div>
                <p>{p.text}</p>
                <ol>
                  {guides.map((g, i) => (
                    <li key={g.slug}>
                      <Link to={guidePath(g)} className={visited.has(g.slug) ? 'done' : ''}>
                        <span className="k-path-n">{visited.has(g.slug) ? <Icon name="check" size={12} /> : i + 1}</span>
                        <span>{g.title}</span>
                        <span className="k-path-cat">{categoryOf(g).title}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
