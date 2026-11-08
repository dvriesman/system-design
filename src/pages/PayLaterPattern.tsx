import { useMemo, useState } from 'react'
import '../styles/sim.css'
import { Diagram, Legend } from './caseStudyDiagram'
import { GLOSSARY } from './payLaterGlossary'
import { CUSTOMER_STEPS, design, EXAMPLES, type Availability, type Functional, type Latency, type NonFunctional, type Requirements, type Security } from './payLaterSystem'

const FUNCTIONAL: { key: keyof Functional; label: string }[] = [
  { key: 'onboarding', label: 'New customers sign up with an ID' },
  { key: 'repayments', label: 'Customers repay installments' },
  { key: 'app', label: 'Customer mobile app' },
  { key: 'portal', label: 'Merchant portal and payouts' },
  { key: 'notifications', label: 'Reminders and messages' },
  { key: 'collections', label: 'Collections for late payments' },
  { key: 'inStore', label: 'In-store payments' },
  { key: 'marketplace', label: 'Marketplace of merchant products' },
  { key: 'deposits', label: 'Deposit accounts' },
]

function Choice<T extends string | number | boolean>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="sim-axis">
      <span className="sim-axis-label">{label}</span>
      <div className="sim-seg" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={String(o.value)} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

const customersText = (m: number) => (m < 1 ? `${Math.round(m * 1000)}K` : `${m}M`)
const rate = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US'))

export default function PayLaterPattern() {
  const [example, setExample] = useState<number | null>(0)
  const [req, setReq] = useState<Requirements>(EXAMPLES[0].req)
  const [selected, setSelected] = useState<string | null>(null)
  const system = useMemo(() => design(req), [req])
  const [previous, setPrevious] = useState(() => new Map(design(EXAMPLES[0].req).nodes.map((x) => [x.id, x.title])))
  const fresh = useMemo(() => new Set(system.nodes.filter((x) => previous.get(x.id) !== x.title).map((x) => x.id)), [system, previous])
  const node = system.nodes.find((x) => x.id === selected) ?? null
  const m = system.metrics
  const latency = m.latencyParts.reduce((sum, p) => sum + p.ms, 0)

  function apply(next: Requirements, index: number | null) {
    setPrevious(new Map(system.nodes.map((x) => [x.id, x.title])))
    setReq(next)
    setExample(index)
  }
  const setF = (patch: Partial<Functional>) => apply({ ...req, f: { ...req.f, ...patch } }, null)
  const setN = (patch: Partial<NonFunctional>) => apply({ ...req, n: { ...req.n, ...patch } }, null)

  return (
    <div className="sim mx-auto max-w-6xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Case Studies · Pay-Later Checkout</div>
        <h1>Pay-Later Checkout</h1>
        <p className="sim-lede">
          <b>The problem:</b> design a buy-now-pay-later network. Customers with no credit card buy from partner merchants and pay in installments. Merchants are paid in full, minus a fee, and the lender takes the risk that
          customers don't pay.
        </p>
      </div>

      <div className="sim-bench">
        <div className="sim-toolbar">
          <div className="sim-seg" role="group" aria-label="Example designs">
            {EXAMPLES.map((e, i) => (
              <button key={e.name} type="button" aria-pressed={example === i} onClick={() => apply(e.req, i)}>
                {e.name}
              </button>
            ))}
          </div>
        </div>
        <p className="sim-small cs-story">{example === null ? 'Your own requirements. Highlighted boxes are new or changed.' : EXAMPLES[example].story}</p>

        <div className="cs-panels">
          <div className="sim-store">
            <h3>
              <span>Functional requirements</span>
            </h3>
            <label className="cs-check disabled">
              <input type="checkbox" checked disabled /> Online checkout for merchants
            </label>
            {FUNCTIONAL.map(({ key, label }) => (
              <label key={key} className="cs-check">
                <input type="checkbox" checked={req.f[key]} onChange={(e) => setF({ [key]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>

          <div className="sim-store">
            <h3>
              <span>Non-functional requirements</span>
            </h3>
            <div className="sim-sliders">
              <label className="sim-slider">
                <span>
                  Volume: active customers <b>{customersText(req.n.customersM)}</b>
                </span>
                <input type="range" min={0} max={CUSTOMER_STEPS.length - 1} value={CUSTOMER_STEPS.indexOf(req.n.customersM)} onChange={(e) => setN({ customersM: CUSTOMER_STEPS[Number(e.target.value)] })} />
              </label>
              <label className="sim-slider">
                <span>
                  Throughput: peak compared with average <b>{req.n.peakFactor}×</b>
                </span>
                <input type="range" min={5} max={100} step={5} value={req.n.peakFactor} onChange={(e) => setN({ peakFactor: Number(e.target.value) })} />
              </label>
              <label className="sim-slider">
                <span>
                  Isolation: largest merchant's share of peak <b>{req.n.largestMerchant}%</b>
                </span>
                <input type="range" min={5} max={60} step={5} value={req.n.largestMerchant} onChange={(e) => setN({ largestMerchant: Number(e.target.value) })} />
              </label>
              <label className="sim-slider">
                <span>
                  Maintainability: engineering teams <b>{req.n.teams}</b>
                </span>
                <input type="range" min={1} max={30} value={req.n.teams} onChange={(e) => setN({ teams: Number(e.target.value) })} />
              </label>
            </div>
            <div className="sim-axes">
              <Choice<Latency> label="Latency: decision, p99" value={req.n.latency} options={[{ value: 1000, label: '1 s' }, { value: 300, label: '300 ms' }, { value: 100, label: '100 ms' }]} onChange={(v) => setN({ latency: v })} />
              <Choice<Availability> label="Availability" value={req.n.availability} options={[{ value: 99.5, label: '99.5%' }, { value: 99.9, label: '99.9%' }, { value: 99.99, label: '99.99%' }]} onChange={(v) => setN({ availability: v })} />
              <Choice<boolean> label="Durability: lose data in a disaster" value={req.n.noDataLoss} options={[{ value: true, label: 'never' }, { value: false, label: 'a few seconds' }]} onChange={(v) => setN({ noDataLoss: v })} />
              <Choice<Security> label="Security" value={req.n.security} options={[{ value: 'baseline', label: 'baseline' }, { value: 'hardened', label: 'hardened' }, { value: 'regulated', label: 'regulated' }]} onChange={(v) => setN({ security: v })} />
              <Choice<boolean> label="UX: returning customers" value={req.n.instantApproval} options={[{ value: false, label: 'can wait' }, { value: true, label: 'approved instantly' }]} onChange={(v) => setN({ instantApproval: v })} />
              <Choice<boolean> label="UX: app status" value={req.n.liveUpdates} options={[{ value: false, label: 'on refresh' }, { value: true, label: 'live' }]} onChange={(v) => setN({ liveUpdates: v })} />
              <Choice<boolean> label="Freshness: portal data" value={req.n.freshReads} options={[{ value: true, label: 'up to the second' }, { value: false, label: 'seconds old is fine' }]} onChange={(v) => setN({ freshReads: v })} />
            </div>
          </div>
        </div>

        <div className="cs-metrics">
          <div>
            <span>Peak checkouts</span>
            <b>{rate(m.peakCheckouts)}/s</b>
          </div>
          <div>
            <span>Peak API requests</span>
            <b>{rate(m.peakRequests)}/s</b>
          </div>
          <div>
            <span>Ledger rows a year</span>
            <b>{m.ledgerRowsPerYear >= 1e9 ? `${(m.ledgerRowsPerYear / 1e9).toFixed(1)} billion` : `${Math.round(m.ledgerRowsPerYear / 1e6)} million`}</b>
          </div>
          <div>
            <span>Allowed downtime a year</span>
            <b>{m.downtimeMinutes >= 120 ? `${(m.downtimeMinutes / 60).toFixed(1)} hours` : `${Math.round(m.downtimeMinutes)} minutes`}</b>
          </div>
          <div className={latency <= req.n.latency ? 'ok' : 'bad'} title={m.latencyParts.map((p) => `${p.name}: ${p.ms}ms`).join('\n')}>
            <span>Decision latency</span>
            <b>
              {latency} of {req.n.latency} ms
            </b>
          </div>
          <div className={m.availability >= req.n.availability ? 'ok' : 'bad'}>
            <span>Estimated availability</span>
            <b>{m.availability.toFixed(req.n.availability >= 99.9 ? 3 : 2)}%</b>
          </div>
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

        <div className="sim-store">
          <h3>
            <span>Glossary</span>
            <span className="sim-tag">terms in this diagram</span>
          </h3>
          <dl className="gl">
            {GLOSSARY.filter((g) => !g.ids || g.ids.some((id) => system.nodes.some((x) => x.id === id)))
              .filter((g) => g.term !== 'Private network and mTLS' || system.zones.some((z) => z.id === 'private'))
              .filter((g) => g.term !== 'Regulated zone' || system.zones.some((z) => z.id === 'regulated'))
              .filter((g) => g.term !== 'Sharding' || system.nodes.some((x) => x.id === 'db' && x.title.includes('shards')))
              .filter((g) => g.term !== 'WAF' || system.nodes.some((x) => x.title.includes('WAF')))
              .filter((g) => g.term !== 'API gateway' || system.nodes.some((x) => x.title.includes('API gateway')))
              .filter((g) => g.term !== 'Load balancer' || system.nodes.some((x) => x.title === 'Load balancer'))
              .filter((g) => g.term !== 'Rate limit' || system.nodes.some((x) => (x.sub ?? '').includes('per-merchant')))
              .filter((g) => g.term !== 'Queue' || system.nodes.some((x) => x.kind === 'queue'))
              .filter((g) => g.term !== 'Event stream (Kafka)' || system.nodes.some((x) => x.kind === 'stream'))
              .map((g) => (
                <div key={g.term}>
                  <dt>{g.term}</dt>
                  <dd>{g.meaning}</dd>
                </div>
              ))}
          </dl>
        </div>
      </div>

      <div className="sim-footer">A hypothetical design for a generic pay-later lender. Thresholds, timings and availability figures are rules of thumb for teaching, not measurements.</div>
    </div>
  )
}
