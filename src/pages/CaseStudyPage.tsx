import { useMemo, useState, type ReactNode } from 'react'
import '../styles/sim.css'
import { Diagram, Legend } from './caseStudyDiagram'
import { SequenceDiagram, type Sequence } from './sequenceDiagram'
import type { DiagramEdge, DiagramNode, Zone } from './caseStudyLayout'

// The shared page for every case study: problem, requirement controls, example designs, diagram, inspector and glossary.

export type Drawn = { nodes: DiagramNode[]; edges: DiagramEdge[]; zones: Zone[] }
export type Metric = { label: string; value: string; status?: 'ok' | 'bad'; title?: string }
export type Term = { term: string; meaning: string; ids?: string[]; when?: (drawn: Drawn) => boolean }

type Primitive = string | number | boolean
export type Control<N> =
  | { kind: 'slider'; key: keyof N; label: string; steps: number[]; format: (v: number) => string; when?: (f: Record<string, boolean>, n: N) => boolean }
  | { kind: 'choice'; key: keyof N; label: string; options: { value: Primitive; label: string }[]; when?: (f: Record<string, boolean>, n: N) => boolean }

export type Example<F, N> = { name: string; story: string; req: { f: F; n: N } }

export type CaseStudy<F extends Record<string, boolean>, N extends Record<string, Primitive>, S extends Drawn> = {
  eyebrow: string
  title: string
  problem: ReactNode
  fixedFunctional: string
  functional: { key: keyof F; label: string }[]
  controls: Control<N>[]
  examples: Example<F, N>[]
  design: (req: { f: F; n: N }) => S
  metrics: (req: { f: F; n: N }, system: S) => Metric[]
  glossary: Term[]
  // Optional step-by-step flows, drawn as sequence diagrams under the architecture.
  sequences?: (req: { f: F; n: N }) => Sequence[]
  footer: string
}

export default function CaseStudyPage<F extends Record<string, boolean>, N extends Record<string, Primitive>, S extends Drawn>({ study }: { study: CaseStudy<F, N, S> }) {
  const [example, setExample] = useState<number | null>(0)
  const [req, setReq] = useState(study.examples[0].req)
  const [selected, setSelected] = useState<string | null>(null)
  const system = useMemo(() => study.design(req), [study, req])
  const [previous, setPrevious] = useState(() => new Map(study.design(study.examples[0].req).nodes.map((x) => [x.id, x.title])))
  const fresh = useMemo(() => new Set(system.nodes.filter((x) => previous.get(x.id) !== x.title).map((x) => x.id)), [system, previous])
  const node = system.nodes.find((x) => x.id === selected) ?? null
  const metrics = study.metrics(req, system)
  const flows = useMemo(() => (study.sequences ? study.sequences(req) : []), [study, req])
  const [flowId, setFlowId] = useState<string | null>(null)
  const flow = flows.find((x) => x.id === flowId) ?? flows[0]

  function apply(next: { f: F; n: N }, index: number | null) {
    setPrevious(new Map(system.nodes.map((x) => [x.id, x.title])))
    setReq(next)
    setExample(index)
  }
  const setF = (key: keyof F, value: boolean) => apply({ ...req, f: { ...req.f, [key]: value } }, null)
  const setN = (key: keyof N, value: Primitive) => apply({ ...req, n: { ...req.n, [key]: value } }, null)

  const sliders = study.controls.filter((c) => c.kind === 'slider' && (!c.when || c.when(req.f, req.n)))
  const choices = study.controls.filter((c) => c.kind === 'choice' && (!c.when || c.when(req.f, req.n)))
  const terms = study.glossary.filter((g) => (!g.ids || g.ids.some((id) => system.nodes.some((x) => x.id === id))) && (!g.when || g.when(system)))

  return (
    <div className="sim mx-auto max-w-6xl">
      <div className="sim-header">
        <div className="sim-eyebrow">{study.eyebrow}</div>
        <h1>{study.title}</h1>
        <p className="sim-lede">
          <b>The problem:</b> {study.problem}
        </p>
      </div>

      <div className="sim-bench">
        <div className="sim-toolbar">
          <div className="sim-seg" role="group" aria-label="Example designs">
            {study.examples.map((e, i) => (
              <button key={e.name} type="button" aria-pressed={example === i} onClick={() => apply(e.req, i)}>
                {e.name}
              </button>
            ))}
          </div>
        </div>
        <p className="sim-small cs-story">{example === null ? 'Your own requirements. Highlighted boxes are new or changed.' : study.examples[example].story}</p>

        <div className="cs-panels">
          <div className="sim-store">
            <h3>
              <span>Functional requirements</span>
            </h3>
            <label className="cs-check disabled">
              <input type="checkbox" checked disabled /> {study.fixedFunctional}
            </label>
            {study.functional.map(({ key, label }) => (
              <label key={String(key)} className="cs-check">
                <input type="checkbox" checked={req.f[key]} onChange={(e) => setF(key, e.target.checked)} /> {label}
              </label>
            ))}
          </div>

          <div className="sim-store">
            <h3>
              <span>Non-functional requirements</span>
            </h3>
            {sliders.length ? (
              <div className="sim-sliders">
                {sliders.map((c) =>
                  c.kind === 'slider' ? (
                    <label key={String(c.key)} className="sim-slider">
                      <span>
                        {c.label} <b>{c.format(req.n[c.key] as number)}</b>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={c.steps.length - 1}
                        value={Math.max(0, c.steps.indexOf(req.n[c.key] as number))}
                        onChange={(e) => setN(c.key, c.steps[Number(e.target.value)])}
                      />
                    </label>
                  ) : null,
                )}
              </div>
            ) : null}
            <div className="sim-axes">
              {choices.map((c) =>
                c.kind === 'choice' ? (
                  <div className="sim-axis" key={String(c.key)}>
                    <span className="sim-axis-label">{c.label}</span>
                    <div className="sim-seg" role="group" aria-label={c.label}>
                      {c.options.map((o) => (
                        <button key={String(o.value)} type="button" aria-pressed={req.n[c.key] === o.value} onClick={() => setN(c.key, o.value)}>
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          </div>
        </div>

        <div className="cs-metrics">
          {metrics.map((m) => (
            <div key={m.label} className={m.status ?? ''} title={m.title}>
              <span>{m.label}</span>
              <b>{m.value}</b>
            </div>
          ))}
        </div>

        <Diagram nodes={system.nodes} edges={system.edges} zones={system.zones} selected={selected} fresh={fresh} onSelect={setSelected} />
        <Legend zones={system.zones} />

        {node ? (
          <div className="sim-card cs-inspect">
            <h3>
              {node.title}
              {node.sub ? <span className="sim-muted sim-small"> · {node.sub}</span> : null}
            </h3>
            <p>
              <b>Why it's here:</b> {node.why}
            </p>
            <p>
              <b>Trade-off:</b> {node.tradeoff}
            </p>
            <p>
              <b>Connections:</b>
            </p>
            <ul className="t">
              {system.edges
                .filter((e) => e.from === node.id || e.to === node.id)
                .map((e) => {
                  const other = system.nodes.find((x) => x.id === (e.from === node.id ? e.to : e.from))!
                  return (
                    <li key={`${e.from}-${e.to}`}>
                      {e.from === node.id ? '→' : '←'} <b>{other.title}</b>
                      {e.async ? ' (asynchronous)' : ''}: {e.purpose ?? ''}
                    </li>
                  )
                })}
            </ul>
          </div>
        ) : (
          <p className="sim-small">Click any box to see why it's there, what it costs, and what flows along each of its lines.</p>
        )}

        {flow ? (
          <div className="sim-store">
            <h3>
              <span>Sequence diagrams</span>
              <span className="sim-tag">one per channel, following the requirements</span>
            </h3>
            <div className="sim-seg" role="group" aria-label="Flow">
              {flows.map((x) => (
                <button key={x.id} type="button" aria-pressed={flow.id === x.id} onClick={() => setFlowId(x.id)}>
                  {x.title}
                </button>
              ))}
            </div>
            <p className="sim-small cs-story">{flow.summary}</p>
            <SequenceDiagram sequence={flow} />
            <div className="cs-legend">
              <span>
                <svg viewBox="0 0 64 30" aria-hidden="true" className="sq-key call">
                  <line x1="2" y1="15" x2="56" y2="15" />
                </svg>
                Request
              </span>
              <span>
                <svg viewBox="0 0 64 30" aria-hidden="true" className="sq-key reply">
                  <line x1="2" y1="15" x2="56" y2="15" />
                </svg>
                Reply
              </span>
              <span>
                <svg viewBox="0 0 64 30" aria-hidden="true" className="sq-key async">
                  <line x1="2" y1="15" x2="56" y2="15" />
                </svg>
                Message sent without waiting
              </span>
            </div>
          </div>
        ) : null}

        <div className="sim-store">
          <h3>
            <span>Glossary</span>
            <span className="sim-tag">terms in this diagram</span>
          </h3>
          <dl className="gl">
            {terms.map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd>{g.meaning}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="sim-footer">{study.footer}</div>
    </div>
  )
}
