// A whiteboard-style architecture diagram, shared by case study pages.
import { DIAGRAM_WIDTH, layout, route, type Box, type DiagramEdge, type DiagramNode, type Kind, type Zone } from './caseStudyLayout'

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

function Shape({ kind, b }: { kind: Kind; b: Box }) {
  const { x, y, w, h } = b
  switch (kind) {
    case 'client':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx="5" />
          <line x1={x} y1={y + 11} x2={x + w} y2={y + 11} />
          {[8, 15, 22].map((dx) => (
            <circle key={dx} cx={x + dx} cy={y + 5.5} r="2" className="cs-dot" />
          ))}
        </>
      )
    case 'edge': {
      // A gateway that spans several rows is drawn as a bar, not a stretched hexagon.
      if (h > 80) return <rect x={x} y={y} width={w} height={h} rx="14" />
      const k = 12
      return <polygon points={`${x + k},${y} ${x + w - k},${y} ${x + w},${y + h / 2} ${x + w - k},${y + h} ${x + k},${y + h} ${x},${y + h / 2}`} />
    }
    case 'db':
    case 'cache':
    case 'search':
    case 'warehouse': {
      const ry = 7
      return (
        <>
          <path d={`M${x} ${y + ry} A${w / 2} ${ry} 0 0 1 ${x + w} ${y + ry} V${y + h - ry} A${w / 2} ${ry} 0 0 1 ${x} ${y + h - ry} Z`} />
          <path d={`M${x} ${y + ry} A${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry}`} className="cs-rim" />
        </>
      )
    }
    case 'queue':
    case 'stream': {
      const r = kind === 'stream' ? h / 2 : 6
      const slots = kind === 'stream' ? 10 : 4
      const start = kind === 'stream' ? x + 18 : x + w - 46
      const step = kind === 'stream' ? 9 : 10
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx={r} />
          {Array.from({ length: slots }, (_, i) => (
            <line key={i} x1={start + i * step} y1={y + 8} x2={start + i * step} y2={y + h - 8} className="cs-slot" />
          ))}
        </>
      )
    }
    case 'storage':
      return <path d={`M${x} ${y} H${x + w} L${x + w - 10} ${y + h} H${x + 10} Z`} />
    case 'security':
      return (
        <>
          <rect x={x} y={y} width={w} height={h} rx="3" />
          <rect x={x + 3} y={y + 3} width={w - 6} height={h - 6} rx="2" className="cs-inner" />
        </>
      )
    case 'external':
      return <rect x={x} y={y} width={w} height={h} rx="5" className="cs-external" />
    default:
      return <rect x={x} y={y} width={w} height={h} rx="10" />
  }
}

export function Diagram({
  nodes,
  edges,
  zones,
  selected,
  fresh,
  onSelect,
}: {
  nodes: DiagramNode[]
  edges: DiagramEdge[]
  zones: Zone[]
  selected: string | null
  fresh: Set<string>
  onSelect: (id: string) => void
}) {
  const { boxes, height } = layout(nodes)
  const routed = route(edges, boxes, height)
  // With a box selected, everything it doesn't talk to fades out.
  const linked = new Set(selected ? [selected, ...edges.filter((e) => e.from === selected || e.to === selected).flatMap((e) => [e.from, e.to])] : [])
  return (
    <div className="sim-diagram">
      <svg viewBox={`0 0 ${DIAGRAM_WIDTH} ${height}`} role="group" aria-label="Architecture diagram">
        <defs>
          <marker id="cs-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="cs-arrowhead" />
          </marker>
        </defs>
        {zones.map((zone, i) => {
          const members = zone.members.map((id) => boxes.get(id)).filter((b): b is Box => !!b)
          if (!members.length) return null
          if (zone.outline) {
            return (
              <g key={zone.id} className="cs-zone marked">
                {members.map((b) => (
                  <rect key={`${b.x}-${b.y}`} x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx="10" />
                ))}
              </g>
            )
          }
          const pad = 12 + i * 6
          const x = Math.min(...members.map((b) => b.x)) - pad
          const y = Math.min(...members.map((b) => b.y)) - pad - 12
          const w = Math.max(...members.map((b) => b.x + b.w)) + pad - x
          const h = Math.max(...members.map((b) => b.y + b.h)) + pad - y
          return (
            <g key={zone.id} className="cs-zone">
              <rect x={x} y={y} width={w} height={h} rx="12" />
              <text x={x + 10} y={y + 13}>
                {zone.title}
              </text>
            </g>
          )
        })}
        {routed.map(({ edge, points }) => {
          const longest = points.slice(1).reduce(
            (acc, p, i) => {
              const length = Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y)
              return length > acc.length ? { length, mid: { x: (p.x + points[i].x) / 2, y: (p.y + points[i].y) / 2 } } : acc
            },
            { length: -1, mid: points[0] },
          )
          return (
            <g key={`${edge.from}-${edge.to}`} className={`cs-edge${edge.async ? ' async' : ''}${selected && edge.from !== selected && edge.to !== selected ? ' dim' : ''}${selected && (edge.from === selected || edge.to === selected) ? ' lit' : ''}`}>
              <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} markerEnd="url(#cs-arrow)" />
              {edge.label ? (
                <text x={longest.mid.x} y={longest.mid.y - 4} textAnchor="middle" className="cs-edge-label">
                  {edge.label}
                </text>
              ) : null}
            </g>
          )
        })}
        {nodes.map((node) => {
          const b = boxes.get(node.id)!
          const chars = Math.max(10, Math.floor(b.w / 7.2))
          const titleLines = wrap(node.title, Math.max(10, Math.floor(b.w / 8.2)))
          const sub = node.sub ? wrap(node.sub, chars).slice(0, Math.max(1, Math.floor((b.h - 12) / 13) - titleLines.length)) : []
          const lines = titleLines.length + sub.length
          const firstY = b.y + b.h / 2 - ((lines - 1) * 13) / 2 + 4 + (node.kind === 'client' ? 5 : 0)
          return (
            <g
              key={node.id}
              className={`cs-node ${node.kind}${selected === node.id ? ' selected' : ''}${fresh.has(node.id) ? ' fresh' : ''}${selected && !linked.has(node.id) ? ' dim' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${node.title}${node.sub ? `: ${node.sub}` : ''}`}
              aria-pressed={selected === node.id}
              onClick={() => onSelect(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(node.id)
                }
              }}
            >
              <Shape kind={node.kind} b={b} />
              {titleLines.map((line, i) => (
                <text key={line} x={b.x + b.w / 2} y={firstY + i * 14} textAnchor="middle" className="cs-title">
                  {line}
                </text>
              ))}
              {sub.map((line, i) => (
                <text key={line} x={b.x + b.w / 2} y={firstY + titleLines.length * 14 + i * 13} textAnchor="middle" className="cs-sub">
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

const LEGEND: { kind: Kind; label: string }[] = [
  { kind: 'client', label: 'Frontend or client' },
  { kind: 'edge', label: 'Gateway, CDN, load balancer' },
  { kind: 'service', label: 'Service' },
  { kind: 'db', label: 'Database' },
  { kind: 'cache', label: 'Cache' },
  { kind: 'queue', label: 'Queue' },
  { kind: 'stream', label: 'Event stream' },
  { kind: 'storage', label: 'Object storage' },
  { kind: 'security', label: 'Security component' },
  { kind: 'external', label: 'External system' },
]

export function Legend({ zones }: { zones: Zone[] }) {
  return (
    <div className="cs-legend">
      {zones.map((zone) => (
        <span key={zone.id}>
          <svg viewBox="0 0 64 30" aria-hidden="true" className={`cs-zone${zone.outline ? ' marked' : ''}`}>
            <rect x="2" y="2" width="60" height="26" rx="6" />
          </svg>
          {zone.outline ? zone.title : zone.title.split(':')[0]}
        </span>
      ))}
      {LEGEND.map(({ kind, label }) => (
        <span key={kind}>
          <svg viewBox="0 0 64 30" aria-hidden="true" className={`cs-node ${kind}`}>
            <Shape kind={kind} b={{ x: 2, y: 2, w: 60, h: 26 }} />
          </svg>
          {label}
        </span>
      ))}
      <span>
        <svg viewBox="0 0 64 30" aria-hidden="true" className="cs-edge">
          <polyline points="2,15 56,15" markerEnd="url(#cs-arrow)" />
        </svg>
        Synchronous call
      </span>
      <span>
        <svg viewBox="0 0 64 30" aria-hidden="true" className="cs-edge async">
          <polyline points="2,15 56,15" />
        </svg>
        Asynchronous
      </span>
    </div>
  )
}
