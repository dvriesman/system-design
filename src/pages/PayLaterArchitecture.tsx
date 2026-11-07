import { useMemo, useState } from 'react'
import { designFor, LEVELS, NODE_DETAILS, type AvailabilityTarget, type DesignNode, type LatencyTarget, type NodeId, type Requirements } from './payLaterDesign'

type Box = { x: number; y: number; w: number; h: number }
const W = 165
const H = 56

// Columns leave free lanes at x=350, x=780, x=977 and x=990, so that routed lines never pass behind a box.
const BOXES: Record<NodeId, Box> = {
  merchant: { x: 20, y: 85, w: 140, h: H },
  buyer: { x: 20, y: 175, w: 140, h: H },
  edge: { x: 190, y: 130, w: 145, h: H },
  cache: { x: 190, y: 225, w: 145, h: H },
  deposits: { x: 190, y: 320, w: 145, h: H },
  monolith: { x: 370, y: 100, w: W, h: 150 },
  checkout: { x: 370, y: 100, w: W, h: H },
  credit: { x: 370, y: 195, w: W, h: H },
  repayments: { x: 370, y: 290, w: W, h: H },
  settlement: { x: 370, y: 385, w: W, h: H },
  events: { x: 370, y: 480, w: 385, h: 50 },
  collections: { x: 370, y: 570, w: W, h: H },
  bureau: { x: 590, y: 15, w: W, h: H },
  decision: { x: 590, y: 100, w: W, h: H },
  provider: { x: 590, y: 290, w: W, h: H },
  replica: { x: 590, y: 385, w: W, h: H },
  features: { x: 800, y: 100, w: W, h: H },
  db: { x: 800, y: 195, w: W, h: H },
  standby: { x: 800, y: 290, w: W, h: H },
  region: { x: 800, y: 385, w: W, h: H },
  lake: { x: 800, y: 477, w: W, h: H },
}

type Point = { x: number; y: number }

// Lines that would otherwise run behind another box.
const ROUTES: Record<string, { points: Point[]; label?: Point }> = {
  'db-replica': {
    points: [
      { x: 800, y: 235 },
      { x: 780, y: 235 },
      { x: 780, y: 413 },
      { x: 755, y: 413 },
    ],
  },
  'db-region': {
    points: [
      { x: 965, y: 223 },
      { x: 977, y: 223 },
      { x: 977, y: 413 },
      { x: 965, y: 413 },
    ],
    label: { x: 958, y: 370 },
  },
  'lake-features': {
    points: [
      { x: 965, y: 505 },
      { x: 990, y: 505 },
      { x: 990, y: 128 },
      { x: 965, y: 128 },
    ],
    label: { x: 958, y: 465 },
  },
  'credit-events': {
    points: [
      { x: 370, y: 235 },
      { x: 350, y: 235 },
      { x: 350, y: 505 },
      { x: 370, y: 505 },
    ],
  },
  'monolith-events': {
    points: [
      { x: 452, y: 250 },
      { x: 452, y: 480 },
    ],
  },
  'decision-bureau': {
    points: [
      { x: 672, y: 100 },
      { x: 672, y: 71 },
    ],
    label: { x: 664, y: 90 },
  },
  'settlement-replica': {
    points: [
      { x: 535, y: 413 },
      { x: 590, y: 413 },
    ],
  },
}

const EXTERNAL = new Set<NodeId>(['bureau', 'provider', 'merchant', 'buyer'])
const DATA = new Set<NodeId>(['db', 'standby', 'replica', 'region', 'cache', 'features', 'lake', 'deposits'])

function center(b: Box) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

// Where the straight line from the centre of one box leaves that box.
function borderPoint(b: Box, toward: { x: number; y: number }) {
  const c = center(b)
  const dx = toward.x - c.x
  const dy = toward.y - c.y
  if (dx === 0 && dy === 0) return c
  const scale = Math.min(dx === 0 ? Infinity : b.w / 2 / Math.abs(dx), dy === 0 ? Infinity : b.h / 2 / Math.abs(dy))
  return { x: c.x + dx * scale, y: c.y + dy * scale }
}

function wrap(text: string, max: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (line && `${line} ${word}`.length > max) {
      lines.push(line)
      line = word
    } else line = line ? `${line} ${word}` : word
  }
  if (line) lines.push(line)
  return lines
}

function Diagram({ nodes, edges, selected, fresh, onSelect }: { nodes: DesignNode[]; edges: ReturnType<typeof designFor>['edges']; selected: NodeId | null; fresh: Set<NodeId>; onSelect: (id: NodeId) => void }) {
  const height = Math.max(...nodes.map((node) => BOXES[node.id].y + BOXES[node.id].h)) + 15
  return (
    <div className="sim-diagram">
      <svg viewBox={`0 0 1000 ${height}`} role="group" aria-label="Architecture diagram">
        <defs>
          <marker id="pl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="pl-arrowhead" />
          </marker>
        </defs>
        {edges.map((edge) => {
          const key = `${edge.from}-${edge.to}`
          const route = ROUTES[key]
          const a = BOXES[edge.from]
          const b = BOXES[edge.to]
          const points = route ? route.points : [borderPoint(a, center(b)), borderPoint(b, center(a))]
          const label = route?.label ?? { x: (points[0].x + points[points.length - 1].x) / 2, y: (points[0].y + points[points.length - 1].y) / 2 - 5 }
          return (
            <g key={key} className={`pl-edge${edge.async ? ' async' : ''}`}>
              <polyline points={points.map((point) => `${point.x},${point.y}`).join(' ')} markerEnd="url(#pl-arrow)" />
              {edge.label ? (
                <text x={label.x} y={label.y} textAnchor={route?.label ? 'end' : 'middle'} className="pl-edge-label">
                  {edge.label}
                </text>
              ) : null}
            </g>
          )
        })}
        {nodes.map((node) => {
          const b = BOXES[node.id]
          const sub = wrap(node.sub, node.id === 'events' ? 60 : Math.floor(b.w / 7))
          const kind = EXTERNAL.has(node.id) ? 'external' : DATA.has(node.id) ? 'data' : 'app'
          return (
            <g
              key={node.id}
              className={`pl-node ${kind}${selected === node.id ? ' selected' : ''}${fresh.has(node.id) ? ' fresh' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${node.title}: ${node.sub}`}
              aria-pressed={selected === node.id}
              onClick={() => onSelect(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(node.id)
                }
              }}
            >
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="8" />
              <text x={b.x + b.w / 2} y={b.y + (b.h > 60 ? 28 : 21)} textAnchor="middle" className="pl-title">
                {node.title}
              </text>
              {sub.map((line, i) => (
                <text key={line} x={b.x + b.w / 2} y={b.y + (b.h > 60 ? 50 : 37) + i * 13} textAnchor="middle" className="pl-sub">
                  {line}
                </text>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const CUSTOMER_STEPS = [0.05, 0.1, 0.5, 1, 2, 4, 8, 20, 50, 100]

function customersText(m: number) {
  return m < 1 ? `${Math.round(m * 1000).toLocaleString('en-US')}K` : `${m}M`
}

export default function PayLaterArchitecture() {
  const [levelIndex, setLevelIndex] = useState<number | null>(0)
  const [req, setReq] = useState<Requirements>(LEVELS[0].requirements)
  const [selected, setSelected] = useState<NodeId | null>(null)
  const [previous, setPrevious] = useState(() => new Map(designFor(LEVELS[0].requirements).nodes.map((n) => [n.id, n.title])))

  const design = useMemo(() => designFor(req), [req])
  const fresh = useMemo(() => new Set(design.nodes.filter((n) => previous.get(n.id) !== n.title).map((n) => n.id)), [design, previous])
  const selectedNode = design.nodes.find((n) => n.id === selected) ?? null
  const latencyOk = design.latencyTotal <= req.latency

  function apply(next: Requirements, level: number | null) {
    setPrevious(new Map(design.nodes.map((n) => [n.id, n.title])))
    setReq(next)
    setLevelIndex(level)
  }
  function change(patch: Partial<Requirements>) {
    apply({ ...req, ...patch }, null)
  }

  const level = levelIndex === null ? null : LEVELS[levelIndex]

  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Architecture level">
          {LEVELS.map((l, i) => (
            <button key={l.name} type="button" aria-pressed={levelIndex === i} onClick={() => apply(l.requirements, i)}>
              {l.name}
            </button>
          ))}
        </div>
      </div>

      <div className="sim-narr" aria-live="polite">
        <b className="t">{level ? level.name : 'Your own requirements'}</b>
        <span>{level ? level.story : 'You changed a requirement. New boxes are highlighted, so you can see exactly what that decision cost.'}</span>
      </div>

      <div className="sim-store">
        <h3>
          <span>Change the requirements</span>
          <span className="sim-tag">the diagram redraws</span>
        </h3>
        <div className="sim-sliders">
          <label className="sim-slider">
            <span>
              Active customers <b>{customersText(req.customersM)}</b>
            </span>
            <input type="range" min={0} max={CUSTOMER_STEPS.length - 1} step={1} value={CUSTOMER_STEPS.indexOf(req.customersM)} onChange={(e) => change({ customersM: CUSTOMER_STEPS[Number(e.target.value)] })} />
          </label>
          <label className="sim-slider">
            <span>
              Peak compared with average <b>{req.peakFactor}×</b>
            </span>
            <input type="range" min={5} max={100} step={5} value={req.peakFactor} onChange={(e) => change({ peakFactor: Number(e.target.value) })} />
          </label>
          <label className="sim-slider">
            <span>
              Largest merchant, share of peak <b>{req.largestMerchant}%</b>
            </span>
            <input type="range" min={5} max={60} step={5} value={req.largestMerchant} onChange={(e) => change({ largestMerchant: Number(e.target.value) })} />
          </label>
          <label className="sim-slider">
            <span>
              Engineering teams <b>{req.teams}</b>
            </span>
            <input type="range" min={1} max={30} step={1} value={req.teams} onChange={(e) => change({ teams: Number(e.target.value) })} />
          </label>
        </div>
        <div className="sim-axes">
          <div className="sim-axis">
            <span className="sim-axis-label">Decision latency, p99</span>
            <div className="sim-seg" role="group" aria-label="Decision latency target">
              {([1000, 300, 100] as LatencyTarget[]).map((v) => (
                <button key={v} type="button" aria-pressed={req.latency === v} onClick={() => change({ latency: v })}>
                  {v === 1000 ? '1 second' : `${v}ms`}
                </button>
              ))}
            </div>
          </div>
          <div className="sim-axis">
            <span className="sim-axis-label">Availability</span>
            <div className="sim-seg" role="group" aria-label="Availability target">
              {([99.5, 99.9, 99.99] as AvailabilityTarget[]).map((v) => (
                <button key={v} type="button" aria-pressed={req.availability === v} onClick={() => change({ availability: v })}>
                  {v}%
                </button>
              ))}
            </div>
          </div>
          <div className="sim-axis">
            <span className="sim-axis-label">In a region disaster, lose</span>
            <div className="sim-seg" role="group" aria-label="Data loss in a disaster">
              <button type="button" aria-pressed={req.dataLoss === 'none'} onClick={() => change({ dataLoss: 'none' })}>
                no data
              </button>
              <button type="button" aria-pressed={req.dataLoss === 'seconds'} onClick={() => change({ dataLoss: 'seconds' })}>
                a few seconds
              </button>
            </div>
          </div>
          <div className="sim-axis">
            <span className="sim-axis-label">Takes deposits</span>
            <div className="sim-seg" role="group" aria-label="Takes deposits">
              <button type="button" aria-pressed={!req.deposits} onClick={() => change({ deposits: false })}>
                no
              </button>
              <button type="button" aria-pressed={req.deposits} onClick={() => change({ deposits: true })}>
                yes
              </button>
            </div>
          </div>
        </div>
      </div>

      <Diagram nodes={design.nodes} edges={design.edges} selected={selected} fresh={fresh} onSelect={setSelected} />
      <div className="sim-tx-legend pl-legend">
        <span className="pl-key solid">synchronous call</span>
        <span className="pl-key dashed">asynchronous</span>
        <span className="pl-key fresh">new with this change</span>
        <span className="pl-key">click any box</span>
      </div>

      {selectedNode ? (
        <div className="sim-card">
          <h3>{selectedNode.title}</h3>
          <p>
            <b>Why it's here:</b> {selectedNode.reason}
          </p>
          <p>
            <b>What it owns:</b> {NODE_DETAILS[selectedNode.id].owns}
          </p>
          <p>
            <b>How it fails:</b> {NODE_DETAILS[selectedNode.id].fails}
          </p>
          <p>
            <b>The trade-off:</b> {NODE_DETAILS[selectedNode.id].tradeoff}
          </p>
        </div>
      ) : null}

      <div className="sim-tx-stage">
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Peak checkouts</span>
          <span className="sim-lab-value">
            {design.peak < 10 ? design.peak.toFixed(1) : Math.round(design.peak).toLocaleString('en-US')} per second
          </span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Allowed downtime</span>
          <span className="sim-lab-value">
            {design.downtimeHoursPerYear >= 1 ? `${design.downtimeHoursPerYear.toFixed(1)} hours` : `${Math.round(design.downtimeHoursPerYear * 60)} minutes`} per year
          </span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Ledger rows yearly</span>
          <span className="sim-lab-value">{design.ledgerBillionsPerYear < 1 ? `${Math.round(design.ledgerBillionsPerYear * 1000)} million` : `${design.ledgerBillionsPerYear.toFixed(1)} billion`}</span>
        </div>
      </div>

      <div className="sim-grid">
        <div className="sim-store">
          <h3>
            <span>Latency budget, returning customer</span>
          </h3>
          <div className={`sim-tx-reader ${latencyOk ? 'ok' : 'short'}`}>
            {design.latencyTotal}ms of {req.latency}ms
            <span>{latencyOk ? 'This design fits the target.' : 'This design misses the target.'}</span>
          </div>
          <div className="sim-tw">
            <table>
              <tbody>
                {design.latencyParts.map((part) => (
                  <tr key={part.name}>
                    <td>{part.name}</td>
                    <td>{part.ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="sim-small">A first purchase adds identity checks and a credit bureau call, so it gets a separate, much longer target.</p>
        </div>
        <div className="sim-store">
          <h3>
            <span>Availability, multiplied along the path</span>
          </h3>
          <div className={`sim-tx-reader ${design.availabilityReturning >= req.availability ? 'ok' : 'short'}`}>
            Returning customer: about {design.availabilityReturning.toFixed(req.availability >= 99.9 ? 3 : 2)}%<span>Target: {req.availability}%</span>
          </div>
          <div className="sim-tx-reader wait">
            First purchase: about {design.availabilityFirst.toFixed(2)}%<span>It also depends on the credit bureau, assumed here at 99.5%.</span>
          </div>
          <p className="sim-small">
            A request needs every part on its path, so their availabilities multiply. That's why a first purchase can't be more available than the bureau, whatever you build, unless you have a fallback.
          </p>
        </div>
      </div>

      <div className="sim-grid">
        <div className="sim-store">
          <h3>
            <span>What you pay for this design</span>
          </h3>
          <ul className="t">
            {design.costs.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {level ? (
            <p className="sim-small">
              <b>What breaks it next:</b> {level.breaks}
            </p>
          ) : null}
        </div>
        <div className="sim-store">
          <h3>
            <span>What would change it next</span>
          </h3>
          {design.nextChanges.length ? (
            <ul className="t">
              {design.nextChanges.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          ) : (
            <div className="sim-empty">Every rule on this page is already in use. Beyond this, you'd consider separate cells per country or product.</div>
          )}
        </div>
      </div>

      <div className="sim-store">
        <h3>
          <span>Draw it on the whiteboard in this order</span>
        </h3>
        <ol className="sim-draw">
          {design.nodes.map((n) => (
            <li key={n.id}>
              <button type="button" onClick={() => setSelected(n.id)}>
                {n.title}
              </button>{' '}
              <span className="sim-small">{n.reason}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
