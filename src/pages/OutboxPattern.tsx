import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import {
  APP,
  AMOUNT,
  build,
  checks,
  consumerCode,
  DEFAULT_CRASH,
  EXPERIMENTS,
  lineNo,
  RELAY_CODE,
  SVC_CODE,
  verdictText,
  type Actor,
  type CodeLine,
  type Mode,
  type Step,
} from './outboxSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'after', label: '1 · Publish after commit' },
  { id: 'before', label: '2 · Publish before commit' },
  { id: 'outbox', label: '3 · Transactional outbox' },
]

const ACTOR_NAME: Record<Actor | 'system', string> = {
  svc: 'decision service',
  relay: 'outbox relay',
  cons: 'ledger consumer',
  system: 'result',
}
const ACTOR_PREFIX: Record<Actor, string> = { svc: 'S', relay: 'R', cons: 'C' }

function CodePane({ name, lines, cls, down, currentLine, crash, onToggleBreak }: {
  name: string
  lines: CodeLine[]
  cls: string
  down: boolean
  currentLine: string | null
  crash: string | null
  onToggleBreak: (id: string) => void
}) {
  return (
    <div className={`sim-pane ${cls}`}>
      <h3>
        <span>{name}</span>
        <span className="st">{down ? <span className="sim-down">process dead</span> : ''}</span>
      </h3>
      <div className="sim-code wrap">
        {lines.map((l) => (
          <div key={l.id} className={`sim-ln${currentLine === l.id ? ' cur' : ''}${l.off ? ' off' : ''}`}>
            <span className="g">
              {l.breakable ? (
                <button
                  type="button"
                  className={`sim-dot${crash === l.id ? ' on' : ''}`}
                  aria-label={`Crash before line ${lineNo(lines, l.id)}`}
                  title="Crash before this line"
                  onClick={() => onToggleBreak(l.id)}
                />
              ) : null}
            </span>
            <span className="no">{lineNo(lines, l.id)}</span>
            <pre>{l.code}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function OutboxPattern() {
  const [mode, setMode] = useState<Mode>('after')
  const [crash, setCrash] = useState<string | null>(DEFAULT_CRASH.after)
  const [dedupe, setDedupe] = useState(true)
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => build(mode, crash, dedupe), [mode, crash, dedupe])
  const safeCur = Math.min(cur, steps.length - 1)

  useEffect(() => {
    if (!running) return
    if (cur >= steps.length - 1) {
      setRunning(false)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(() => setCur((c) => Math.min(steps.length - 1, c + 1)), reduced ? 150 : 650)
    return () => clearTimeout(id)
  }, [running, cur, steps.length])

  useEffect(() => {
    const el = timelineRef.current?.querySelector('.sim-chip.cur')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cur])

  const step: Step = steps[safeCur]
  const view = debuggerView(steps, safeCur, [])
  const s = view.s
  const benchRef = useFollowExecution(safeCur, steps)

  function go(i: number) {
    setRunning(false)
    setCur(Math.max(0, Math.min(steps.length - 1, i)))
  }

  function toggleBreak(id: string) {
    setCrash((c) => (c === id ? null : id))
    setCur(0)
    setRunning(false)
  }

  function switchMode(m: Mode) {
    setMode(m)
    setCrash(DEFAULT_CRASH[m])
    setCur(0)
    setRunning(false)
  }

  function setDedupeAndReset(checked: boolean) {
    setDedupe(checked)
    setCur(0)
    setRunning(false)
  }

  function runExperiment(exp: (typeof EXPERIMENTS)[number]) {
    setMode(exp.mode)
    setCrash(exp.crash)
    setDedupe(exp.dedupe)
    setRunning(false)
    setCur(build(exp.mode, exp.crash, exp.dedupe).length - 1)
  }

  const consLines = consumerCode(dedupe)
  const svcLines = SVC_CODE[mode]
  const final = step.label === 'end'
  const invariantChecks = checks(s, final)
  const activeCheckList = checks(s, true)

  function lineLabel(st: Step): string {
    if (!st.line || !st.actor || st.actor === 'system') return st.label
    const lines = st.actor === 'svc' ? svcLines : st.actor === 'relay' ? RELAY_CODE : consLines
    return `${ACTOR_PREFIX[st.actor]}${lineNo(lines, st.line)} ${st.label}`
  }

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Data consistency · Transactional Outbox</div>
        <h1>Transactional outbox</h1>
        <p className="sim-lede">
          When a credit decision commits to Postgres, the ledger service also needs to hear about it through Kafka.
          Two systems, one fact. Step through the code below like a debugger, kill processes at any line (click the
          dot in the gutter), and watch whether the money stays consistent.
        </p>
      </div>

      <div className="sim-bench sim-debug" ref={benchRef}>
        <div className="sim-debug-head">
          <div className="sim-toolbar">
            <div className="sim-seg" role="group" aria-label="Approach">
              {MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => switchMode(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="sim-ctl">
              <label className="sim-chk">
                <input type="checkbox" checked={dedupe} onChange={(e) => setDedupeAndReset(e.target.checked)} /> Idempotent
                consumer
              </label>
              <button className="sim-btn ghost" type="button" aria-label="Back to start" onClick={() => go(0)} disabled={safeCur === 0}>
                |◀
              </button>
              <button className="sim-btn ghost" type="button" aria-label="Step back" onClick={() => go(safeCur - 1)} disabled={safeCur === 0}>
                ◀
              </button>
              <button className="sim-btn" type="button" onClick={() => go(safeCur + 1)} disabled={safeCur === steps.length - 1}>
                Step ▶
              </button>
              <button
                className="sim-btn ghost"
                type="button"
                onClick={() => {
                  if (running) {
                    setRunning(false)
                    return
                  }
                  if (safeCur === steps.length - 1) setCur(0)
                  setRunning(true)
                }}
              >
                {running ? 'Pause ❚❚' : 'Run ▶▶'}
              </button>
              <span className="sim-pos">
                {safeCur} / {steps.length - 1}
              </span>
            </div>
          </div>

          <div className="sim-timeline" ref={timelineRef} aria-label="Execution timeline">
            {steps.map((st, i) => (
              <button
                key={i}
                type="button"
                className={`sim-chip ${st.actor && st.actor !== 'system' ? st.actor : ''} ${st.crash ? 'crash' : ''} ${
                  i < safeCur ? 'done' : ''
                } ${i === safeCur ? 'cur' : ''}`}
                aria-label={`Go to step ${i}: ${st.title}`}
                onClick={() => go(i)}
              >
                {i === 0 ? 'start' : lineLabel(st)}
              </button>
            ))}
          </div>

          <div className={`sim-narr${step.crash ? ' crash' : ''}`} aria-live="polite">
            <span className="who">
              {view.pending ? 'about to run · ' : ''}
              {step.actor ? ACTOR_NAME[step.actor] : 'ready'}
              {step.crash ? ' · process killed' : ''}
            </span>
            <b className="t">{step.title}</b>
            <span>{step.text ?? ''}</span>
          </div>

        </div>

        <div className="sim-grid">
          <div className="sim-col">
            <CodePane
              name="Decision service"
              lines={svcLines}
              cls="svc"
              down={s.svcDown}
              currentLine={step.actor === 'svc' ? step.line : null}
              crash={crash}
              onToggleBreak={toggleBreak}
            />
            {mode === 'outbox' && (
              <CodePane
                name="Outbox relay"
                lines={RELAY_CODE}
                cls="relay"
                down={false}
                currentLine={step.actor === 'relay' ? step.line : null}
                crash={crash}
                onToggleBreak={toggleBreak}
              />
            )}
            <CodePane
              name="Ledger consumer"
              lines={consLines}
              cls="cons"
              down={false}
              currentLine={step.actor === 'cons' ? step.line : null}
              crash={crash}
              onToggleBreak={toggleBreak}
            />
          </div>

          <div className="sim-col">
            <div className="sim-store">
              <h3>
                <span>Decision service · Postgres</span>
                <span>
                  {s.tx ? <span className="sim-tag tx">transaction open</span> : <span className="sim-tag">no open transaction</span>}
                </span>
              </h3>
              <div className="sim-tw">
                <table>
                  <thead>
                    <tr>
                      <th>applications.id</th>
                      <th>status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={s.app.pending ? 'pend' : ''}>
                      <td>{APP}</td>
                      <td>{s.app.pending ? `PENDING → ${s.app.pending} (uncommitted)` : s.app.status}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {mode === 'outbox' && (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>outbox.id</th>
                        <th>event_id</th>
                        <th>topic</th>
                        <th>sent_at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.outbox.length ? (
                        s.outbox.map((r) => (
                          <tr key={r.id} className={r.pending ? 'pend' : ''}>
                            <td>{r.id}</td>
                            <td>{r.ev}</td>
                            <td>decision.made</td>
                            <td>{r.pending ? '(uncommitted)' : r.sent ? 'set' : 'NULL'}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={4} className="sim-empty">
                            no rows
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="sim-store">
              <h3>
                <span>Kafka · topic decision.made · partition 0</span>
              </h3>
              <div className="sim-klog">
                {s.kafka.length ? (
                  s.kafka.map((m) => (
                    <div
                      key={m.off}
                      className={`sim-msg ${m.off < s.cons.offset ? 'read' : ''} ${m.dup ? 'dupe' : ''} ${
                        s.cons.inflight === m.off ? 'ptr' : ''
                      }`}
                    >
                      <span>
                        offset {m.off}
                        {m.dup ? ' · duplicate' : ''}
                      </span>
                      <span>key={APP}</span>
                      <span>{m.ev}</span>
                    </div>
                  ))
                ) : (
                  <div className="sim-empty">empty partition</div>
                )}
              </div>
            </div>

            <div className="sim-store">
              <h3>
                <span>Ledger service · Postgres</span>
                <span className="sim-tag">committed offset: {s.cons.offset}</span>
              </h3>
              <div className="sim-tw">
                <table>
                  <thead>
                    <tr>
                      <th>ledger_entries</th>
                      <th>application</th>
                      <th>amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.cons.ledger.length ? (
                      s.cons.ledger.map((l, i) => (
                        <tr key={i} className={l.dup ? 'dupe' : ''}>
                          <td>{l.ev}</td>
                          <td>{l.app}</td>
                          <td>{AMOUNT}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="sim-empty">
                          no rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {dedupe && (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>processed_events.event_id</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.cons.processed.length ? (
                        s.cons.processed.map((e) => (
                          <tr key={e}>
                            <td>{e}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="sim-empty">no rows</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="sim-store">
              <h3>
                <span>Invariants</span>
              </h3>
              <div className="sim-inv">
                {invariantChecks.map(([name, detail, status]) => (
                  <div className="sim-chk-row" key={name}>
                    <span className={`sim-mark ${status}`}>{status === 'ok' ? 'holds' : status === 'bad' ? 'broken' : 'pending'}</span>
                    <span>
                      <b>{name}</b> <span className="sim-muted sim-small">{detail}</span>
                    </span>
                  </div>
                ))}
                <div className={`sim-verdict ${final ? (activeCheckList.some((c) => c[2] === 'bad') ? 'bad' : 'good') : 'wait'}`}>
                  {final ? verdictText(s) : 'Verdict appears when the run finishes. Press Run to skip ahead.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sim-console" aria-label="Console">
          {s.log.length ? (
            s.log.map((l, i) => (
              <div key={i} className={`c-${l.actor}`}>
                {l.text}
              </div>
            ))
          ) : (
            <div className="sim-muted">console empty</div>
          )}
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>Experiments to run</h3>
          <div className="sim-try">
            {EXPERIMENTS.map((exp) => (
              <button key={exp.label} type="button" onClick={() => runExperiment(exp)}>
                <b>{exp.label}</b>
                {exp.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section aria-labelledby="w1" className="sim-section">
        <h2 id="w1">What you just debugged</h2>
        <FlowDiagram />
        <div className="sim-cards">
          <div className="sim-card">
            <h3>The dual-write problem</h3>
            <p>
              A service writes to two systems (Postgres and Kafka) that share no transaction. Whatever order you
              pick, a crash between the two writes leaves them disagreeing. Publish after commit loses events.
              Publish before commit creates ghosts. Retries and try/catch don't fix it, because the process itself
              can die.
            </p>
          </div>
          <div className="sim-card">
            <h3>The fix: one local transaction</h3>
            <p>
              Write the business change and the event into the <b>same database</b>, in the <b>same transaction</b>.
              Now they are atomic: both or neither. A separate relay reads committed outbox rows and publishes them
              to Kafka, retrying until Kafka acknowledges.
            </p>
          </div>
          <div className="sim-card">
            <h3>The price: at-least-once</h3>
            <p>
              The relay can send and then die before recording that it sent. On restart it sends again. So the
              outbox guarantees <b>no loss</b>, but allows <b>duplicates</b>. Consumers must be idempotent: dedupe on
              <code>event_id</code> in the same transaction as the side effect — see{' '}
              <Link to="/guides/idempotency-keys">Idempotency Keys</Link> for exactly how that claim works.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Exactly-once effect = at-least-once delivery + idempotent processing</h3>
          <pre className="sim-block">{`-- Ledger consumer: the dedupe record and the side effect commit together
BEGIN;
INSERT INTO processed_events (event_id) VALUES ('evt-7f3a');   -- PK: a duplicate fails here
INSERT INTO ledger_entries (account, debit_minor, credit_minor, event_id) VALUES (...);
COMMIT;
-- then commit the Kafka offset. If we die before that, the redelivery hits the PK and is skipped.`}</pre>
        </div>
      </section>

      <section aria-labelledby="w2" className="sim-section">
        <h2 id="w2">Two ways to build the relay</h2>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Polling publisher</th>
                <th>Change data capture (CDC)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>How</b>
                </td>
                <td>
                  A job runs <code>SELECT … WHERE sent_at IS NULL … FOR UPDATE SKIP LOCKED</code> every 50–500 ms
                </td>
                <td>Debezium reads the Postgres write-ahead log (WAL) and streams outbox inserts to Kafka</td>
              </tr>
              <tr>
                <td>
                  <b>Latency</b>
                </td>
                <td>Poll interval plus query time</td>
                <td>Tens of milliseconds</td>
              </tr>
              <tr>
                <td>
                  <b>Load on DB</b>
                </td>
                <td>Constant queries and updates on the outbox table</td>
                <td>Reads the log; no extra queries</td>
              </tr>
              <tr>
                <td>
                  <b>Ops cost</b>
                </td>
                <td>Just your service. Easy to start with.</td>
                <td>Kafka Connect cluster, replication slots to watch (a stuck slot fills the disk)</td>
              </tr>
              <tr>
                <td>
                  <b>When</b>
                </td>
                <td>Few hundred events/s, small team, first version</td>
                <td>High volume, many services, a platform team owns it</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Ordering</h3>
            <p>
              Use the aggregate ID (application or customer) as the Kafka key so its events land on one partition in
              order. Parallel relays with <code>SKIP LOCKED</code> can reorder events for the same key, so either
              publish per key in order or include a version number that consumers check.
            </p>
          </div>
          <div className="sim-card">
            <h3>Housekeeping</h3>
            <p>
              Delete sent rows after a few days, or partition the outbox table by day and drop old partitions.
              Version the payload schema. Keep the event small; consumers can fetch details.
            </p>
          </div>
          <div className="sim-card">
            <h3>What to monitor</h3>
            <p>
              <b>Outbox lag</b>: age of the oldest unsent row. That's your "events are flowing" SLO, for example p99
              under 2 s. Alert on it before anyone notices the ledger is behind.
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Dual write</dt>
          <dd>Writing the same fact to two systems without a shared transaction. Always a bug waiting for a crash.</dd>
          <dt>Transaction (ACID)</dt>
          <dd>A group of writes the database applies all together or not at all. Until COMMIT, nobody else sees them.</dd>
          <dt>Outbox table</dt>
          <dd>A table in the service's own database holding events waiting to be published.</dd>
          <dt>Relay</dt>
          <dd>The process that moves outbox rows to Kafka. Also called message relay or outbox publisher.</dd>
          <dt>Ack</dt>
          <dd>Kafka's confirmation that it stored the message (with acks=all, on all in-sync replicas).</dd>
          <dt>Offset</dt>
          <dd>The position of a message in a Kafka partition. A consumer commits its offset to say "done up to here".</dd>
          <dt>At-least-once</dt>
          <dd>Every message is delivered, possibly more than once.</dd>
          <dt>Idempotent</dt>
          <dd>Doing it twice has the same effect as doing it once.</dd>
          <dt>CDC</dt>
          <dd>Change data capture: reading a database's change log to stream every insert or update elsewhere.</dd>
          <dt>WAL</dt>
          <dd>Write-ahead log. Postgres writes every change here first; CDC tools read it.</dd>
          <dt>SKIP LOCKED</dt>
          <dd>Postgres clause that skips rows another transaction has locked, so several relays can poll without blocking each other.</dd>
          <dt>Two-phase commit (2PC)</dt>
          <dd>
            The textbook alternative: a coordinator makes both systems commit together. Kafka doesn't support it
            with Postgres, and it's slow and fragile, which is why the outbox exists.
          </dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Explain it in a design review</h2>
        <div className="sim-say">
          "The decision row and the <code>decision.made</code> event are written in one Postgres transaction, using
          an outbox table. A relay, polling at first and CDC with Debezium once volume grows, publishes to Kafka
          keyed by application ID. That gives at-least-once delivery, so every consumer dedupes on event ID in the
          same transaction as its side effect. I'd put an SLO on outbox lag so we know the ledger isn't falling
          behind."
        </div>
        <p className="sim-muted sim-small">
          Questions reviewers ask. "Why not just publish to Kafka and have the service consume its own event to
          update the DB?" That's the listen-to-yourself pattern. It works, but the service can't read its own write
          right away, which hurts a synchronous checkout response.
        </p>
      </section>

      <div className="sim-footer">
        The simulation above is deterministic and simplified: the relay and consumer run one after another here,
        while in production they run continuously and concurrently.
      </div>
    </div>
  )
}

function FlowDiagram() {
  return (
    <div className="sim-flowsvg" role="img" aria-label="Dual write versus outbox diagram">
      <svg viewBox="0 0 900 250">
        <defs>
          <marker id="sim-fa" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" className="ah" />
          </marker>
        </defs>
        <text x={20} y={22} fontWeight={600}>
          Dual write: two systems, no shared transaction
        </text>
        <rect x={20} y={40} width={130} height={48} rx={8} className="box" />
        <text x={85} y={64} textAnchor="middle">
          Service
        </text>
        <rect x={220} y={34} width={150} height={32} rx={8} className="box" />
        <text x={295} y={54} textAnchor="middle">
          Postgres
        </text>
        <rect x={220} y={76} width={150} height={32} rx={8} className="box k" />
        <text x={295} y={96} textAnchor="middle" className="kt">
          Kafka
        </text>
        <polyline points="150,58 218,50" className="e" markerEnd="url(#ob-fa)" />
        <polyline points="150,70 218,92" className="e bad" markerEnd="url(#ob-fa)" />
        <text x={185} y={130} textAnchor="middle" className="badt sub">
          a crash between the two = disagreement
        </text>

        <text x={470} y={22} fontWeight={600}>
          Outbox: one transaction, publish later
        </text>
        <rect x={600} y={34} width={150} height={84} rx={10} className="box tx" />
        <text x={675} y={130} textAnchor="middle" className="sub">
          one Postgres transaction
        </text>
        <rect x={470} y={52} width={100} height={48} rx={8} className="box" />
        <text x={520} y={76} textAnchor="middle">
          Service
        </text>
        <rect x={612} y={42} width={126} height={30} rx={8} className="box" />
        <text x={675} y={61} textAnchor="middle">
          applications
        </text>
        <rect x={612} y={80} width={126} height={30} rx={8} className="box" />
        <text x={675} y={99} textAnchor="middle">
          outbox
        </text>
        <polyline points="570,70 610,58" className="e" markerEnd="url(#ob-fa)" />
        <polyline points="570,82 610,95" className="e" markerEnd="url(#ob-fa)" />
        <rect x={780} y={80} width={100} height={30} rx={8} className="box" />
        <text x={830} y={99} textAnchor="middle">
          Relay
        </text>
        <polyline points="738,95 778,95" className="e" markerEnd="url(#ob-fa)" />
        <rect x={780} y={160} width={100} height={40} rx={8} className="box k" />
        <text x={830} y={184} textAnchor="middle" className="kt">
          Kafka
        </text>
        <polyline points="830,110 830,158" className="e" markerEnd="url(#ob-fa)" />
        <rect x={600} y={160} width={140} height={40} rx={8} className="box" />
        <text x={670} y={178} textAnchor="middle">
          Ledger consumer
        </text>
        <text x={670} y={192} textAnchor="middle" className="sub">
          dedupe on event_id
        </text>
        <polyline points="780,180 742,180" className="e" markerEnd="url(#ob-fa)" />
        <text x={830} y={228} textAnchor="middle" className="sub">
          at-least-once
        </text>
      </svg>
    </div>
  )
}
