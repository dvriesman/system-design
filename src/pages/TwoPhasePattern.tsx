import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import TwoPhaseLab from './TwoPhaseLab'
import {
  AMOUNT,
  build,
  checks,
  DEFAULT_CRASH,
  EXPERIMENTS,
  fmt,
  FROM,
  lineNo,
  PANES,
  readerView,
  TO,
  TOTAL,
  verdictIsBad,
  verdictText,
  type Actor,
  type LedgerState,
  type Mode,
  type Pane,
  type Step,
} from './twoPhaseSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'twowrites', label: '1 · Two writes' },
  { id: 'tpc', label: '2 · Two-phase commit' },
  { id: 'tpcha', label: '3 · 2PC + replicated log' },
  { id: 'async', label: '4 · Eventual: outbox' },
  { id: 'safe', label: '5 · Eventual: + dedupe + refund' },
]

const PREFIX: Record<Actor, string> = { svc: 'C', cons: 'A', migrator: 'B', relay: 'R' }

function CodePane({
  pane,
  currentLine,
  crash,
  onToggleBreak,
}: {
  pane: Pane
  currentLine: string | null
  crash: string | null
  onToggleBreak: (id: string) => void
}) {
  return (
    <div className={`sim-pane ${pane.actor}`}>
      <h3>
        <span>{pane.name}</span>
      </h3>
      <div className="sim-code wrap">
        {pane.lines.map((l) => (
          <div key={l.id} className={`sim-ln${currentLine === l.id ? ' cur' : ''}`}>
            <span className="g">
              {l.breakable ? (
                <button
                  type="button"
                  className={`sim-dot${crash === l.id ? ' on' : ''}`}
                  aria-label={`Crash ${pane.name} before line ${lineNo(pane.lines, l.id)}`}
                  title="Crash before this line"
                  onClick={() => onToggleBreak(l.id)}
                />
              ) : null}
            </span>
            <span className="no">{lineNo(pane.lines, l.id)}</span>
            <pre>{l.code}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}

function LedgerPanel({ name, acct, ledger, closed }: { name: string; acct: string; ledger: LedgerState; closed?: boolean }) {
  return (
    <div className="sim-store">
      <h3>
        <span>{name} · accounts</span>
        {ledger.locked ? <span className="sim-tag tx">row locked</span> : null}
      </h3>
      <div className="sim-tw">
        <table>
          <thead>
            <tr>
              <th>acct_id</th>
              <th>balance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr className={ledger.locked ? 'pend' : ''}>
              <td>{acct}</td>
              <td>{fmt(ledger.bal)}</td>
              <td>{closed ? 'closed' : ledger.locked ? 'locked' : ''}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {ledger.uncommitted.length ? (
        <div className="sim-empty">open transaction, not visible yet: {ledger.uncommitted.join(' · ')}</div>
      ) : null}
    </div>
  )
}

export default function TwoPhasePattern() {
  const [mode, setMode] = useState<Mode>('twowrites')
  const [crash, setCrash] = useState<string | null>(DEFAULT_CRASH.twowrites)
  const [closed, setClosed] = useState(false)
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => build(mode, crash, closed), [mode, crash, closed])
  const safeCur = Math.min(cur, steps.length - 1)
  const panes = PANES[mode]
  const is2pc = mode === 'tpc' || mode === 'tpcha'
  const isEventual = mode === 'async' || mode === 'safe'

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
  const debug = debuggerView(steps, safeCur, panes.map((pane) => pane.lines))
  const s = debug.s
  const benchRef = useFollowExecution(safeCur, steps)
  const final = step.label === 'end'
  const invariantChecks = checks(s)
  const view = readerView(s)

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

  function runExperiment(exp: (typeof EXPERIMENTS)[number]) {
    setMode(exp.mode)
    setCrash(exp.crash)
    setClosed(exp.closed)
    setRunning(false)
    setCur(build(exp.mode, exp.crash, exp.closed).length - 1)
  }

  function lineLabel(st: Step): string {
    if (!st.line || !st.actor || st.actor === 'system') return st.label
    const pane = panes.find((p) => p.actor === st.actor)
    return pane ? `${PREFIX[st.actor]}${lineNo(pane.lines, st.line)} ${st.label}` : st.label
  }

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Data consistency · Two-Phase Commit vs Eventual Consistency</div>
        <h1>Two-phase commit vs eventual consistency</h1>
        <p className="sim-lede">
          Moving $100 between two accounts is easy inside one database. Put those accounts in two databases, as{' '}
          <Link to="/guides/sharding">sharding</Link> eventually does, and no single commit can cover both. This page
          takes that problem one question at a time.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">What are the two answers?</a> Scrub through one transfer each way, with nothing failing.
          </li>
          <li>
            <a href="#part2">Which one should you use?</a> Concrete finance cases, and how to avoid the problem altogether.
          </li>
          <li>
            <a href="#part3">What happens when things fail?</a> A step-by-step debugger where you choose what crashes, then{' '}
            <a href="#real">how to build it for real</a>.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 3</div>
        <h2 id="p1">What are the two answers?</h2>
        <p className="sim-lede">
          Commit on two machines can't happen at the same instant, so there's always a moment when the transfer is half-done.
          The two approaches differ in who has to deal with that moment. Nothing fails here. Go through the tabs in order, and
          watch the two colored strips: they show the whole trade-off.
        </p>
        <TwoPhaseLab />
        <div className="sim-say">
          <b>The trade-off in one sentence.</b> Two-phase commit makes everyone <em>wait</em> so that nobody sees the half-done
          moment. Eventual consistency lets everyone <em>see</em> the half-done moment so that nobody waits.
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Two separate writes</th>
                <th>Two-phase commit</th>
                <th>Eventual consistency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Who ties the two sides together</b>
                </td>
                <td>Nothing</td>
                <td>A coordinator and its decision log</td>
                <td>A durable record of what's owed, delivered until it lands</td>
              </tr>
              <tr>
                <td>
                  <b>A reader during the transfer</b>
                </td>
                <td>Sees a wrong total</td>
                <td>Waits</td>
                <td>Sees a wrong total, for longer, but expectedly</td>
              </tr>
              <tr>
                <td>
                  <b>When the client gets an answer</b>
                </td>
                <td>After both commits</td>
                <td>After both commit, with several extra round trips</td>
                <td>After one local commit</td>
              </tr>
              <tr>
                <td>
                  <b>What the answer means</b>
                </td>
                <td>Done, if nothing failed</td>
                <td>Done</td>
                <td>Accepted, and on its way</td>
              </tr>
              <tr>
                <td>
                  <b>Locks held across the network</b>
                </td>
                <td>No</td>
                <td>Yes</td>
                <td>No</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="part2" aria-labelledby="p2" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 3</div>
        <h2 id="p2">Which one should you use?</h2>
        <p className="sim-lede">
          Start by asking whether you need either one. A distributed transaction you avoid is always cheaper than one you run
          well.
        </p>
        <div className="sim-card">
          <h3>Try first: don't split the transaction</h3>
          <p>
            If two rows are usually updated together, keep them in the same database. Sharding by customer means moving money
            between one customer's own accounts stays an ordinary local transaction, and that may cover most of your transfers.
            Only the remaining cases need what's on this page.
          </p>
        </div>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Case: paying someone at another bank</h3>
            <p>
              <b>Eventual consistency, with no real alternative.</b> You can't hold a lock inside another institution's database,
              and it won't vote in your protocol. So payment networks work by messages, settlement and reconciliation. Your side
              debits, the payment is "pending" in the app, and it either lands or gets returned.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: customers on two shards of one bank</h3>
            <p>
              <b>Often eventual, sometimes 2PC.</b> You own both sides, so either can work. If transfers are frequent and show as
              "pending" for a moment anyway, the outbox flow avoids holding locks across shards. Debit first, so the visible error
              is "less money than expected", never money you could spend twice.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: delivery versus payment</h3>
            <p>
              <b>Atomic, usually 2PC or a single system of record.</b> A security changing hands against cash must not leave one
              leg done and the other not. A half-done state here can't be shown as "pending" and fixed later, because a
              counterparty is exposed to real risk in the meantime.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: moving a limit between two internal systems</h3>
            <p>
              <b>Often 2PC.</b> Both sides are yours, it's infrequent, and the rows aren't contended. If a brief wrong value would
              let someone exceed a risk limit, a short wait costs far less than a breach. Two-phase commit is at its best when
              it's rare, short and internal.
            </p>
          </div>
        </div>
        <h3>The questions that decide it</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>Ask</th>
                <th>Leans two-phase commit</th>
                <th>Leans eventual consistency</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Do you control both systems?</td>
                <td>Yes, and both support prepare</td>
                <td>No, or one is a third party</td>
              </tr>
              <tr>
                <td>Can people see the in-between state?</td>
                <td>No: that state would cause real harm</td>
                <td>Yes: "pending" is acceptable</td>
              </tr>
              <tr>
                <td>How contended are these rows?</td>
                <td>Rarely touched by anything else</td>
                <td>Hot rows, where held locks would queue up</td>
              </tr>
              <tr>
                <td>Can the action be undone later?</td>
                <td>No, or undoing is very costly</td>
                <td>Yes: a refund or reversal is a normal event</td>
              </tr>
              <tr>
                <td>What's more acceptable during an outage?</td>
                <td>Refusing work</td>
                <td>Accepting work and finishing it later</td>
              </tr>
              <tr>
                <td>How far apart are the systems?</td>
                <td>Same region: round trips are cheap</td>
                <td>Across regions: every lock is held for much longer</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="sim-muted sim-small">
          Most large finance systems use both, with atomic commits inside a boundary they own and eventual consistency across
          boundaries they don't. Some distributed SQL databases run a form of two-phase commit under the hood, so you may already
          be using it, with the coordinator replicated as in mode 3 below.
        </p>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 3 of 3</div>
        <h2 id="p3">What happens when things fail?</h2>
        <p className="sim-lede">
          Same transfer, now in real code. Modes 2 and 3 are the two-phase commit family, and modes 4 and 5 are the eventual
          family. Click a gutter dot to kill a process just before that line, and use the switch to close the payee's account.
          Those are two different failures: a crash is temporary, while a refusal never goes away.
        </p>
      </section>

      <div className="sim-bench sim-debug" ref={benchRef}>
        <div className="sim-debug-head">
          <div className="sim-toolbar">
            <div className="sim-axes">
              <div className="sim-seg" role="group" aria-label="Approach">
                {MODES.map((m) => (
                  <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => switchMode(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
              <label className="sim-chk">
                <input
                  type="checkbox"
                  checked={closed}
                  onChange={(e) => {
                    setClosed(e.target.checked)
                    setCur(0)
                    setRunning(false)
                  }}
                />
                Payee account is closed (Ledger B will refuse the credit)
              </label>
            </div>
            <div className="sim-ctl">
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

          {crash && !steps.some((st) => st.crash) ? (
            <div className="sim-empty">The line you picked never runs in this scenario, so nothing crashes. Pick another dot, or change the payee switch.</div>
          ) : null}

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
              {debug.pending ? 'about to run · ' : ''}
              {step.actor && step.actor !== 'system' ? panes.find((p) => p.actor === step.actor)?.name : step.actor ? 'system' : 'ready'}
              {step.crash ? ' · process killed' : ''}
            </span>
            <b className="t">{step.title}</b>
            <span>{step.text ?? ''}</span>
          </div>

        </div>

        <div className="sim-grid">
          <div className="sim-col">
            {panes.map((pane) => (
              <CodePane
                key={pane.name}
                pane={pane}
                currentLine={step.actor === pane.actor ? step.line : null}
                crash={crash}
                onToggleBreak={toggleBreak}
              />
            ))}

            <div className="sim-store sim-vars">
              <h3>
                <span>
                  Variables · {step.actor && step.actor !== 'system' ? panes.find((p) => p.actor === step.actor)?.name : 'no process running'}
                </span>
              </h3>
              {Object.keys(debug.locals).length ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>name</th>
                        <th>value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(debug.locals).map(([name, value]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">nothing declared yet in this step</div>
              )}
            </div>

            <div className="sim-store">
              <h3>
                <span>What the client waited for</span>
                <span className="sim-tag">{s.answered ? `answered: ${s.answered}` : 'no answer yet'}</span>
              </h3>
              <div className="sim-tw">
                <table>
                  <tbody>
                    <tr>
                      <td>calls to the ledgers</td>
                      <td>{s.roundTrips}</td>
                    </tr>
                    <tr>
                      <td>durable writes</td>
                      <td>{s.durableWrites}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="sim-col">
            <div className="sim-store">
              <h3>
                <span>A reader adding both balances</span>
              </h3>
              <div className={`sim-tx-reader ${view.kind === 'wait' ? 'wait' : view.kind === 'ok' ? 'ok' : 'short'}`}>
                {view.kind === 'wait' ? `Waits behind a lock on ${view.on}` : fmt(view.total)}
                <span>
                  {view.kind === 'wait'
                    ? 'a correct total has to read both rows'
                    : view.total === TOTAL
                      ? 'the correct total'
                      : `off by ${fmt(Math.abs(view.total - TOTAL))}: the correct total is ${fmt(TOTAL)}`}
                </span>
              </div>
            </div>

            <LedgerPanel name="Ledger A" acct={FROM} ledger={s.a} />
            <LedgerPanel name="Ledger B" acct={TO} ledger={s.b} closed={closed} />

            {is2pc ? (
              <>
                <div className="sim-store">
                  <h3>
                    <span>Prepared · promises on disk</span>
                  </h3>
                  {s.a.prepared.length + s.b.prepared.length ? (
                    <div className="sim-tw">
                      <table>
                        <thead>
                          <tr>
                            <th>ledger</th>
                            <th>txId</th>
                            <th>change</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.a.prepared.map((p) => (
                            <tr key={`a${p.txId}`} className="pend">
                              <td>A</td>
                              <td>{p.txId}</td>
                              <td>{p.change}</td>
                            </tr>
                          ))}
                          {s.b.prepared.map((p) => (
                            <tr key={`b${p.txId}`} className="pend">
                              <td>B</td>
                              <td>{p.txId}</td>
                              <td>{p.change}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="sim-empty">no rows</div>
                  )}
                </div>
                <div className="sim-store">
                  <h3>
                    <span>Coordinator decision log</span>
                    {mode === 'tpcha' ? <span className="sim-tag">replicated</span> : null}
                  </h3>
                  {s.decisionLog.length ? (
                    <div className="sim-tw">
                      <table>
                        <thead>
                          <tr>
                            <th>txId</th>
                            <th>decision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {s.decisionLog.map((d) => (
                            <tr key={d.txId}>
                              <td>{d.txId}</td>
                              <td>{d.decision}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="sim-empty">no rows</div>
                  )}
                </div>
              </>
            ) : null}

            {isEventual ? (
              <>
                <div className="sim-store">
                  <h3>
                    <span>Outbox rows</span>
                  </h3>
                  {s.a.outbox.length + s.b.outbox.length ? (
                    <div className="sim-tw">
                      <table>
                        <thead>
                          <tr>
                            <th>ledger</th>
                            <th>txId</th>
                            <th>kind</th>
                            <th>status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...s.a.outbox.map((o) => ({ ...o, on: 'A' })), ...s.b.outbox.map((o) => ({ ...o, on: 'B' }))].map((o) => (
                            <tr key={`${o.on}${o.kind}`} className={o.sent ? '' : 'pend'}>
                              <td>{o.on}</td>
                              <td>{o.txId}</td>
                              <td>{o.kind}</td>
                              <td>{o.sent ? 'sent' : 'unsent'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="sim-empty">no rows</div>
                  )}
                </div>
                <div className="sim-store">
                  <h3>
                    <span>Queue</span>
                    <span className="sim-tag">at-least-once delivery</span>
                  </h3>
                  {s.queue.length ? (
                    <div className="sim-klog">
                      {s.queue.map((m) => (
                        <div key={m.seq} className={`sim-msg ${m.status === 'acked' ? 'read' : ''} ${m.status === 'dead' || (m.seq > 1 && m.kind === 'credit') ? 'dupe' : ''}`}>
                          <span>
                            #{m.seq} {m.kind} {fmt(AMOUNT)}
                          </span>
                          <span>{m.status === 'dead' ? 'dead letter' : m.status}</span>
                          {m.seq > 1 && m.kind === 'credit' ? <span>duplicate</span> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="sim-empty">no messages</div>
                  )}
                </div>
                {mode === 'safe' ? (
                  <div className="sim-store">
                    <h3>
                      <span>Processed · dedupe tables</span>
                    </h3>
                    {s.a.processed.length + s.b.processed.length ? (
                      <div className="sim-tw">
                        <table>
                          <thead>
                            <tr>
                              <th>ledger</th>
                              <th>txId</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.b.processed.map((p) => (
                              <tr key={`b${p}`}>
                                <td>B</td>
                                <td>{p}</td>
                              </tr>
                            ))}
                            {s.a.processed.map((p) => (
                              <tr key={`a${p}`}>
                                <td>A</td>
                                <td>{p}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="sim-empty">no rows</div>
                    )}
                  </div>
                ) : null}
              </>
            ) : null}

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
                <div className={`sim-verdict ${final ? (verdictIsBad(mode, s) ? 'bad' : 'good') : 'wait'}`}>
                  {final ? verdictText(mode, s) : 'Verdict appears when the run finishes. Press Run to skip ahead.'}
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
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Two writes fail because nothing remembers</h3>
            <p>
              When the process dies between commits, the fact that a credit is still owed existed only in its memory. Both real
              fixes start by making that fact durable: a decision log in one, an outbox row in the other.
            </p>
          </div>
          <div className="sim-card">
            <h3>Two-phase commit: promise, then decide once</h3>
            <p>
              Each ledger first promises that it can commit, in a way that survives a crash. Then one durable write decides the
              outcome for both. Every failure has a clear answer: no decision logged means abort, a decision logged means carry
              it out.
            </p>
          </div>
          <div className="sim-card">
            <h3>Its price: a ledger that voted YES can't move</h3>
            <p>
              After voting YES, a ledger may not decide alone, because it could disagree with the other. So it holds its lock
              until it hears the decision, and if the coordinator is gone, everything touching that row waits. You pay some of
              this even when nothing fails: extra round trips with locks held, on every transfer.
            </p>
          </div>
          <div className="sim-card">
            <h3>Replicating the log shrinks that price, but doesn't remove it</h3>
            <p>
              With the decision stored on a majority of replicas, a standby can finish the job in seconds, with no human involved.
              Locks are still held during failover, and the normal-case cost goes up, because each log write now needs a majority
              of replicas to acknowledge it.
            </p>
          </div>
          <div className="sim-card">
            <h3>Eventual consistency: the debt is the record</h3>
            <p>
              The debit and a durable "this is owed" row commit together, so a crash can delay the credit but never lose it. That
              gives you delivery at least once, which means duplicates, so it needs a dedupe check on the receiving side. See{' '}
              <Link to="/guides/outbox">Transactional Outbox</Link> and{' '}
              <Link to="/guides/idempotency-keys">Idempotency Keys</Link> for each half in depth.
            </p>
          </div>
          <div className="sim-card">
            <h3>Its price: there's no vote, so a refusal comes late</h3>
            <p>
              Two-phase commit asks before anything changes. Eventual consistency finds out afterwards, when the debit has already
              committed and been seen. So you can't roll back. You need a new, visible, opposite entry: a compensation. Every step
              that can be refused needs one designed for it, and that is what the Saga pattern is about.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Each fix moves the responsibility somewhere</h3>
          <ul className="t">
            <li>
              <b>Two-phase commit</b> trusts every participant to implement a durable prepare. A system that can't, such as most
              third-party APIs, can't take part at all.
            </li>
            <li>
              <b>The dedupe check</b> trusts the same transaction to cover the credit and the dedupe record. If the record is
              written separately, the race from{' '}
              <Link to="/guides/idempotency-keys">Idempotency Keys</Link> comes straight back.
            </li>
            <li>
              <b>"Eventually"</b> trusts someone to be watching. If the relay or consumer is stuck, nothing looks wrong, and the
              gap just stays open. It needs lag alerts and reconciliation to catch what automation misses.
            </li>
            <li>
              <b>"No half-done reads"</b> in modes 2 and 3 depends on readers using locks. A reader using a plain snapshot on each
              ledger can still catch Ledger A committed and Ledger B not. Atomic means all-or-nothing in the end, and it doesn't
              give you a consistent view by itself. For that, you need read locks or globally ordered timestamps.
            </li>
          </ul>
        </div>
        <div className="sim-card">
          <h3>Showing the gap honestly</h3>
          <p>In eventual systems, the fix for a confusing total is usually to model the in-flight state, not to hide it.</p>
          <pre className="sim-block">{`-- money in flight is a real balance, not an error
SELECT sum(balance) AS settled,
       (SELECT coalesce(sum(amount), 0) FROM outbox WHERE status <> 'delivered') AS in_flight
  FROM accounts;
-- settled + in_flight is correct at every moment, and the UI can say "$100 pending"`}</pre>
        </div>
      </section>

      <section id="real" aria-labelledby="r1" className="sim-section">
        <h2 id="r1">How do you build this for real?</h2>
        <p className="sim-lede">
          The debugger shows the protocol as pseudocode. In a real system, <code>ledgerA.prepare(...)</code> is usually a gRPC or
          HTTP call to the service that owns Ledger A, and that service opens a real database transaction and takes a real row
          lock. The unusual part is what happens to that transaction when the call returns, and there are two common answers.
        </p>

        <h3>Each line of the debugger, in a real system</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>In the debugger</th>
                <th>Using the database's own 2PC</th>
                <th>Using holds in your own tables</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>ledgerA.prepare(...)</code>
                </td>
                <td colSpan={2}>A gRPC or HTTP call with a deadline</td>
              </tr>
              <tr>
                <td>
                  <code>lock(change.acct)</code>
                </td>
                <td>
                  The <code>UPDATE</code> takes a row lock, held across the network calls
                </td>
                <td>
                  The <code>UPDATE</code> takes a row lock only until its short local transaction commits
                </td>
              </tr>
              <tr>
                <td>
                  <code>allowed(change)</code>
                </td>
                <td colSpan={2}>
                  A condition such as <code>balance &gt;= amount</code>. Zero rows updated means vote NO
                </td>
              </tr>
              <tr>
                <td>
                  <code>prepared.write(...)</code>
                </td>
                <td>
                  <code>PREPARE TRANSACTION</code>
                </td>
                <td>
                  Commit a row in a <code>holds</code> table
                </td>
              </tr>
              <tr>
                <td>
                  <code>log.write(txId, decision)</code>
                </td>
                <td colSpan={2}>
                  A conditional <code>UPDATE</code> on the coordinator's own table, committed before any <code>finish</code> goes out
                </td>
              </tr>
              <tr>
                <td>
                  <code>apply</code>, <code>delete</code>, <code>unlock</code>
                </td>
                <td>
                  <code>COMMIT PREPARED</code> or <code>ROLLBACK PREPARED</code>
                </td>
                <td>Confirm or cancel the hold, in one local transaction</td>
              </tr>
              <tr>
                <td>
                  <code>onRestart</code>
                </td>
                <td colSpan={2}>A recovery job that scans the coordinator's table for unfinished transfers</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="sim-card">
          <h3>Option 1: the database's own two-phase commit</h3>
          <p>
            Postgres has <code>PREPARE TRANSACTION</code>, and MySQL has XA. Here is the Ledger A service, using Postgres:
          </p>
          <pre className="sim-block">{`// gRPC handler on the Ledger A service
fun prepare(req: PrepareRequest): Vote {
  requireValidUuid(req.txId)   // PREPARE takes a literal, not a bound parameter
  db.connection().use { conn ->
    if (isAlreadyPrepared(conn, req.txId)) return Vote.YES   // a retried call

    conn.execute("BEGIN")
    conn.execute("SET LOCAL lock_timeout = '200ms'")   // fail fast rather than queue

    // takes a real row lock, held until the transaction ends
    val updated = conn.execute(
      "UPDATE accounts SET balance = balance - ? WHERE id = ? AND balance >= ?",
      req.amount, req.account, req.amount)

    if (updated == 0) {        // not enough money
      conn.execute("ROLLBACK")
      return Vote.NO
    }

    // the durable promise: flushed to disk, survives a crash
    conn.execute("PREPARE TRANSACTION '\${req.txId}'")
    return Vote.YES
  }                            // the connection goes back to the pool
}

fun finish(req: FinishRequest) {
  requireValidUuid(req.txId)
  val sql = if (req.decision == COMMIT) "COMMIT PREPARED" else "ROLLBACK PREPARED"
  try {
    db.execute("$sql '\${req.txId}'")   // can run on any connection
  } catch (e: UndefinedObject) {
    // no such prepared transaction: an earlier attempt finished it, so this succeeded
  }
}`}</pre>
          <p>
            <code>PREPARE TRANSACTION</code> is the key line. It detaches the transaction from the connection, so the gRPC call can
            return while the transaction stays open, even across a database restart. Its row locks stay held, which is why another
            transfer on this account waits, and its changes stay invisible until <code>COMMIT PREPARED</code>.
          </p>
        </div>

        <div className="sim-card">
          <h3>The coordinator is an ordinary service with its own table</h3>
          <p>
            It needs one thing the debugger leaves out. If it only logged decisions, a crash before deciding would leave prepared
            transactions it has no record of, holding their locks forever. So it records the transfer <em>before</em> the first
            prepare.
          </p>
          <pre className="sim-block">{`fun transfer(txId, from, to, amt): Decision {
  db.execute("INSERT INTO transfers (tx_id, status) VALUES (?, 'STARTED')", txId)

  // no reply before the deadline counts as NO
  val voteA = withDeadline(1.seconds) { ledgerA.prepare(txId, debit(from, amt)) } ?: NO
  val voteB = withDeadline(1.seconds) { ledgerB.prepare(txId, credit(to, amt)) } ?: NO
  val wanted = if (voteA == YES && voteB == YES) COMMIT else ABORT

  // THE COMMIT POINT. Conditional, so recovery and this code can't both decide.
  db.execute("UPDATE transfers SET status = ? WHERE tx_id = ? AND status = 'STARTED'", wanted, txId)
  val decision = db.query("SELECT status FROM transfers WHERE tx_id = ?", txId)

  retryUntilAcknowledged { ledgerA.finish(txId, decision) }
  retryUntilAcknowledged { ledgerB.finish(txId, decision) }
  db.execute("UPDATE transfers SET status = 'DONE', decision = ? WHERE tx_id = ?", decision, txId)
  return decision
}

// runs on startup and on a timer, on whichever instance is alive
fun recover() {
  // nothing decided after a while: abort. Safe, because nobody was told COMMIT.
  db.execute("""UPDATE transfers SET status = 'ABORT'
                 WHERE status = 'STARTED' AND started_at < now() - interval '1 minute'""")
  for (t in db.query("SELECT tx_id, status FROM transfers WHERE status IN ('COMMIT', 'ABORT')")) {
    retryUntilAcknowledged { ledgerA.finish(t.txId, t.status) }
    retryUntilAcknowledged { ledgerB.finish(t.txId, t.status) }
    db.execute("UPDATE transfers SET status = 'DONE', decision = ? WHERE tx_id = ?", t.status, t.txId)
  }
}`}</pre>
        </div>

        <div className="sim-card">
          <h3>Option 2: holds in your own tables (try, confirm, cancel)</h3>
          <p>
            This option keeps no database transaction open between the calls. Prepare is a short local transaction that writes a
            hold, so the "lock" is just your own data. Card authorization holds work much like this. The coordinator stays the same.
          </p>
          <pre className="sim-block">{`-- prepare: reserve the money, and commit right away
BEGIN;
UPDATE accounts SET available = available - 100
 WHERE id = 'acct-1' AND available >= 100;           -- 0 rows: vote NO and roll back
INSERT INTO holds (tx_id, account, amount, status)
VALUES ('tx-71', 'acct-1', 100, 'HELD');             -- unique tx_id: a retry can't hold twice
COMMIT;

-- finish with COMMIT: the status check makes a retry do nothing
BEGIN;
UPDATE holds SET status = 'CONFIRMED' WHERE tx_id = 'tx-71' AND status = 'HELD';
-- only if that updated 1 row:
UPDATE accounts SET balance = balance - 100 WHERE id = 'acct-1';
COMMIT;

-- finish with ABORT
BEGIN;
UPDATE holds SET status = 'CANCELLED' WHERE tx_id = 'tx-71' AND status = 'HELD';
-- only if that updated 1 row:
UPDATE accounts SET available = available + 100 WHERE id = 'acct-1';
COMMIT;`}</pre>
          <p>
            Other work on the account keeps going against <code>available</code>, because no row stays locked. The price is that the
            in-between state is visible as a hold, and the undo logic is yours to write and test.
          </p>
        </div>

        <h3>Choosing between them</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Database's own 2PC</th>
                <th>Holds in your own tables</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Row lock during the wait</b>
                </td>
                <td>Yes, a real one</td>
                <td>No, only briefly during each local transaction</td>
              </tr>
              <tr>
                <td>
                  <b>Other work on that account</b>
                </td>
                <td>Writers wait</td>
                <td>Continues against the available balance</td>
              </tr>
              <tr>
                <td>
                  <b>In-between state</b>
                </td>
                <td>Hidden from other sessions</td>
                <td>Visible as a hold</td>
              </tr>
              <tr>
                <td>
                  <b>Undo logic</b>
                </td>
                <td>The database does it</td>
                <td>You write it</td>
              </tr>
              <tr>
                <td>
                  <b>Works with</b>
                </td>
                <td>Databases that support prepared transactions</td>
                <td>Any store, or a service with an API</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="sim-card">
          <h3>What catches people in production</h3>
          <ul className="t">
            <li>
              <b>A timeout doesn't mean NO happened.</b> When the deadline expires, the ledger may have prepared anyway. So the
              coordinator decides ABORT and still sends <code>finish</code> to that ledger, or the orphan keeps its locks.
            </li>
            <li>
              <b>Every call must be safe to retry.</b> The same <code>prepare</code> or <code>finish</code> can arrive twice, so use
              the transaction ID to recognize repeats.
            </li>
            <li>
              <b>A cancel can overtake a slow prepare.</b> With holds, an abort can arrive first and find nothing, and then the late
              prepare writes a hold nobody will ever release. Have the cancel leave a <code>CANCELLED</code> row, so the unique{' '}
              <code>tx_id</code> rejects the late one.
            </li>
            <li>
              <b>Orphans are dangerous.</b> A forgotten prepared transaction holds its locks indefinitely and stops Postgres from
              cleaning up old rows. Alert on the age of the rows in <code>pg_prepared_xacts</code>.
            </li>
            <li>
              <b>Queuing makes it worse.</b> A prepare that waits for a lock also holds locks of its own, and a backlog builds fast.
              Use a short lock timeout and vote NO instead.
            </li>
            <li>
              <b>Postgres has it off by default.</b> <code>max_prepared_transactions</code> defaults to 0, and the docs say the
              feature is meant for transaction managers, not ordinary application code. That's one reason teams often choose holds,
              or an existing XA transaction manager.
            </li>
          </ul>
          <p className="sim-muted sim-small">
            One simplification in the debugger: it saves the change in <code>prepared.write</code> and applies it later. With native
            Postgres, the <code>UPDATE</code> runs during prepare and stays invisible until <code>COMMIT PREPARED</code>. The protocol
            and its guarantees are the same, and only the moment the row is modified differs.
          </p>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Atomic</dt>
          <dd>All of it happens or none of it does, with no permanent in-between.</dd>
          <dt>Coordinator</dt>
          <dd>The process that runs two-phase commit: it asks for votes and records the decision, but changes no balances itself.</dd>
          <dt>Participant</dt>
          <dd>A system taking part in the transaction, here each ledger.</dd>
          <dt>Prepare / vote</dt>
          <dd>Phase 1. A participant locks what it needs and durably promises it can commit, then answers YES or NO.</dd>
          <dt>In doubt</dt>
          <dd>The state of a participant that voted YES and hasn't heard the decision. It can't commit or abort by itself.</dd>
          <dt>Commit point</dt>
          <dd>The single durable write after which the outcome is fixed: here, the coordinator's log entry.</dd>
          <dt>Presumed abort</dt>
          <dd>The recovery rule that says no logged decision means abort. It's safe because no one could have been told COMMIT.</dd>
          <dt>Blocking</dt>
          <dd>Two-phase commit's core weakness: when the coordinator is gone, in-doubt participants can't make progress.</dd>
          <dt>Prepared transaction</dt>
          <dd>A database transaction detached from its connection, durable and still holding its locks, waiting for a commit or rollback.</dd>
          <dt>XA</dt>
          <dd>A long-standing standard interface for two-phase commit between a transaction manager and databases.</dd>
          <dt>Hold</dt>
          <dd>A row reserving money without moving it yet, reducing the available balance but not the real one.</dd>
          <dt>Try, confirm, cancel</dt>
          <dd>Two-phase commit built in application tables: prepare writes a hold, and the decision confirms or cancels it.</dd>
          <dt>Eventual consistency</dt>
          <dd>Systems may disagree for a while, but are guaranteed to converge to the correct state if no new changes arrive.</dd>
          <dt>Outbox</dt>
          <dd>A table written in the same local transaction as the business change, holding what still has to be sent.</dd>
          <dt>At-least-once delivery</dt>
          <dd>A message is retried until acknowledged. It's never lost, but it can arrive more than once.</dd>
          <dt>Dedupe table</dt>
          <dd>A record of IDs already applied, written in the same transaction as the effect, so a repeat does nothing.</dd>
          <dt>Compensation</dt>
          <dd>A new, visible entry that reverses an earlier committed one, such as a refund. Unlike a rollback, the original stays in the history.</dd>
          <dt>Dead-letter queue</dt>
          <dd>Where a message goes after repeated failures, so a person or another process can deal with it.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Explain it in a design review</h2>
        <div className="sim-say">
          "First I'd try to avoid it, by picking a shard key that keeps the two rows together. When I can't, the choice is who
          deals with the half-done moment. Two-phase commit hides it: participants durably promise, the coordinator logs one
          decision as the commit point, and if it dies, in-doubt participants hold their locks until it recovers. I'd use it only
          for rare, short operations between systems I own, and I'd replicate the log so failover takes seconds. Across
          boundaries, or for hot rows, I'd use eventual consistency: commit the debit and an outbox row together, deliver at least
          once, dedupe on the receiving side in the same transaction as the credit, and design a compensation for every refusal.
          I'd debit first, so the visible error is never spendable money, and I'd show the in-flight amount as pending, not hide
          it."
        </div>
        <p className="sim-muted sim-small">
          Questions reviewers ask. "How would you implement prepare?" Either a database prepared transaction, which keeps real row
          locks across the network calls, or a hold row committed locally, which doesn't lock but makes the in-between state
          visible. "Does three-phase commit fix blocking?" Not in practice. It removes blocking only under
          assumptions about network timing that real networks break, and a partition can then produce a split decision. Replicating
          the coordinator with consensus is the usual answer. "Isn't eventual consistency just weaker?" It gives up a
          consistent view during the gap, in exchange for availability and no held locks. The final state is just as correct, if
          you built the dedupe and the compensation. "How do you know the gap ever closes?" You monitor consumer lag,
          and you run a reconciliation job that compares both ledgers and flags anything older than an agreed limit.
        </p>
      </section>

      <div className="sim-footer">
        The simulation is deterministic and simplified. Downtimes (5 minutes, 3 seconds) are illustrative. The reader in the panels
        reads with locks, the two-phase coordinator handles one transaction at a time, and the blocked transfer stands in for
        all the other work that would queue behind those locks. Each crash fires once, and a killed ledger restarts immediately.
      </div>
    </div>
  )
}
