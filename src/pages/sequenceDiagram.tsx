// A sequence diagram: who talks to whom, in order. Shared by case study pages.

export type Participant = { id: string; label: string; kind: 'client' | 'edge' | 'service' | 'store' | 'external' }
// call: a request, solid arrow. reply: an answer, dashed arrow back. async: fire and forget, dashed open arrow. self: work inside one participant.
export type Message = { from: string; to: string; label: string; kind?: 'call' | 'reply' | 'async' | 'self' }
export type Sequence = { id: string; title: string; summary: string; participants: Participant[]; messages: Message[] }

const COL = 128
const LEFT = 14
const HEAD = 46
const STEP = 36

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

// current highlights one step and fades the later ones; onPick makes each step clickable.
export function SequenceDiagram({ sequence, current, onPick }: { sequence: Sequence; current?: number; onPick?: (index: number) => void }) {
  const { participants, messages } = sequence
  const x = (id: string) => LEFT + participants.findIndex((p) => p.id === id) * COL + COL / 2
  const width = LEFT * 2 + participants.length * COL
  const top = HEAD + 22
  const height = top + messages.length * STEP + 18
  return (
    <div className="sim-diagram">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Sequence diagram: ${sequence.title}`} className="sq" style={{ minWidth: Math.max(420, participants.length * 108) }}>
        <defs>
          <marker id="sq-solid" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="sq-head" />
          </marker>
          <marker id="sq-open" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10" className="sq-open" />
          </marker>
        </defs>
        {participants.map((p) => {
          const cx = x(p.id)
          const lines = wrap(p.label, 15)
          return (
            <g key={p.id} className={`sq-part ${p.kind}`}>
              <line x1={cx} y1={HEAD} x2={cx} y2={height - 6} className="sq-life" />
              <rect x={cx - COL / 2 + 6} y={6} width={COL - 12} height={HEAD - 6} rx="6" />
              {lines.map((line, i) => (
                <text key={line} x={cx} y={6 + (HEAD - 6) / 2 + 4 - ((lines.length - 1) * 13) / 2 + i * 13} textAnchor="middle">
                  {line}
                </text>
              ))}
            </g>
          )
        })}
        {messages.map((m, i) => {
          const y = top + i * STEP + 14
          const x1 = x(m.from)
          const x2 = x(m.to)
          const n = i + 1
          const state = current === undefined ? '' : i === current ? ' cur' : i > current ? ' future' : ''
          const pick = onPick ? { onClick: () => onPick(i), role: 'button', tabIndex: 0, style: { cursor: 'pointer' }, 'aria-label': `Step ${n}: ${m.label}` } : {}
          if (m.kind === 'self' || m.from === m.to) {
            return (
              <g key={i} className={`sq-msg self${state}`} {...pick}>
                <path d={`M${x1} ${y - 6} h22 v12 h-22`} markerEnd="url(#sq-solid)" />
                {/* Near the right edge, the label goes to the left of the lifeline so it isn't cut off. */}
                <text x={x1 > width - 230 ? x1 - 6 : x1 + 28} y={y + 3} textAnchor={x1 > width - 230 ? 'end' : 'start'} className="sq-label">
                  <tspan className="sq-n">{n}</tspan> {m.label}
                </text>
              </g>
            )
          }
          const left = Math.min(x1, x2)
          const right = Math.max(x1, x2)
          return (
            <g key={i} className={`sq-msg ${m.kind ?? 'call'}${state}`} {...pick}>
              <rect x={left} y={y - 20} width={Math.max(30, right - left)} height={26} className="sq-hit" />
              <line x1={x1} y1={y} x2={x2 + (x2 > x1 ? -2 : 2)} y2={y} markerEnd={m.kind === 'async' ? 'url(#sq-open)' : 'url(#sq-solid)'} />
              <text x={(left + right) / 2} y={y - 6} textAnchor="middle" className="sq-label">
                <tspan className="sq-n">{n}</tspan> {m.label}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
