import { useEffect, useMemo, useRef, useState } from 'react'
import { debuggerView, useFollowExecution } from './debuggerView'
import { build, checks, CODE, EXPERIMENTS, fmt, lineRef, verdictIsBad, verdictText, type Actor, type Mode, type Pane, type Step } from './payLaterSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'chain', label: '1 · A chain of calls' },
  { id: 'tx', label: '2 · + one transaction' },
  { id: 'atomic', label: '3 · + idempotency, atomic limit' },
  { id: 'outbox', label: '4 · + outbox' },
  { id: 'signed', label: '5 · + signatures, reconciliation' },
]
const ACTOR_NAME: Record<Actor, string> = { cons: 'Merchant', svc: 'Lender', relay: 'Background job', migrator: 'Attacker' }
const PANES: { id: Pane; cls: string; title: string }[] = [
  { id: 'merchant', cls: 'cons', title: 'Merchant' },
  { id: 'lender', cls: 'svc', title: 'Lender API' },
  { id: 'jobs', cls: 'relay', title: 'Background jobs' },
  { id: 'attacker', cls: 'migrator', title: 'Attacker' },
]

export default function PayLaterDebugger() {
  const [mode, setMode] = useState<Mode>('chain')
  const [crash, setCrash] = useState<string | null>(null)
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => build(mode, crash), [mode, crash])
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
    timelineRef.current?.querySelector('.sim-chip.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cur])

  const step: Step = steps[safeCur]
  const view = debuggerView(steps, safeCur, PANES.map((pane) => CODE[mode][pane.id]))
  const s = view.s
  const benchRef = useFollowExecution(safeCur, steps)
  const final = step.label === 'end'
  const invariantChecks = checks(s)

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
    setCrash(null)
    setCur(0)
    setRunning(false)
  }
  function runExperiment(exp: (typeof EXPERIMENTS)[number]) {
    setMode(exp.mode)
    setCrash(exp.crash)
    setRunning(false)
    setCur(build(exp.mode, exp.crash).length - 1)
  }

  return (
    <div className="sim-bench sim-debug" ref={benchRef}>
      <div className="sim-debug-head">
        <div className="sim-toolbar">
          <div className="sim-seg" role="group" aria-label="Design">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => switchMode(m.id)}>
                {m.label}
              </button>
            ))}
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

        <div className="sim-timeline" ref={timelineRef} aria-label="Execution timeline">
          {steps.map((st, i) => (
            <button
              key={i}
              type="button"
              className={`sim-chip ${st.actor && st.actor !== 'system' ? st.actor : ''} ${st.crash ? 'crash' : ''} ${i < safeCur ? 'done' : ''} ${i === safeCur ? 'cur' : ''}`}
              aria-label={`Go to step ${i}: ${st.title}`}
              onClick={() => go(i)}
            >
              {i === 0 ? 'start' : st.line ? `${lineRef(st.line, mode)} ${st.label}` : st.label}
            </button>
          ))}
        </div>

        <div className={`sim-narr${step.crash ? ' crash' : ''}`} aria-live="polite">
          <span className="who">
            {view.pending ? 'about to run · ' : ''}
            {step.actor && step.actor !== 'system' ? ACTOR_NAME[step.actor] : step.actor ? 'what happens next' : 'ready'}
            {step.crash ? ' · process killed' : ''}
          </span>
          <b className="t">{step.title}</b>
          <span>{step.text ?? ''}</span>
        </div>
      </div>

      <div className="sim-grid">
        <div className="sim-col">
          {PANES.map((pane) => (
            <div className={`sim-pane ${pane.cls}`} key={pane.id}>
              <h3>
                <span>{pane.title}</span>
              </h3>
              <div className="sim-code wrap">
                {CODE[mode][pane.id].map((l) => (
                  <div key={l.id} className={`sim-ln${step.line === l.id ? ' cur' : ''}`}>
                    <span className="g">
                      {l.breakable ? (
                        <button
                          type="button"
                          className={`sim-dot${crash === l.id ? ' on' : ''}`}
                          aria-label={`Kill the process before line ${lineRef(l.id, mode)}`}
                          title="Kill the process before this line"
                          onClick={() => toggleBreak(l.id)}
                        />
                      ) : null}
                    </span>
                    <span className="no">{lineRef(l.id, mode)}</span>
                    <pre>{l.code}</pre>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="sim-store sim-vars">
            <h3>
              <span>Variables · {step.actor && step.actor !== 'system' ? `${ACTOR_NAME[step.actor]}'s call` : 'no call running'}</span>
            </h3>
            {Object.keys(view.locals).length ? (
              <div className="sim-tw">
                <table>
                  <thead>
                    <tr>
                      <th>name</th>
                      <th>value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(view.locals).map(([name, value]) => (
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
        </div>

        <div className="sim-col">
          <div className="sim-store">
            <h3>
              <span>Customer limits</span>
            </h3>
            <div className="sim-tw">
              <table>
                <thead>
                  <tr>
                    <th>customer</th>
                    <th>limit</th>
                    <th>available</th>
                    <th>really lent</th>
                  </tr>
                </thead>
                <tbody>
                  {s.accounts.map((a) => {
                    const lent = s.loans.filter((l) => l.customer === a.customer && !l.pending).reduce((sum, l) => sum + l.amount, 0)
                    return (
                      <tr key={a.customer} className={lent > a.limit ? 'dupe' : ''}>
                        <td>{a.customer}</td>
                        <td>{fmt(a.limit)}</td>
                        <td>{fmt(a.available)}</td>
                        <td>{fmt(lent)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="sim-store">
            <h3>
              <span>Loans</span>
            </h3>
            {s.loans.length ? (
              <div className="sim-tw">
                <table>
                  <thead>
                    <tr>
                      <th>id</th>
                      <th>order</th>
                      <th>customer</th>
                      <th>amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.loans.map((l) => (
                      <tr key={l.id} className={l.pending ? 'pend' : s.loans.filter((x) => x.order === l.order).length > 1 ? 'dupe' : ''}>
                        <td>{l.id}</td>
                        <td>{l.order}</td>
                        <td>{l.customer}</td>
                        <td>
                          {fmt(l.amount)}
                          {l.pending ? ' (uncommitted)' : ''}
                        </td>
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
              <span>Ledger</span>
            </h3>
            {s.ledger.length ? (
              <div className="sim-tw">
                <table>
                  <thead>
                    <tr>
                      <th>loan</th>
                      <th>debit</th>
                      <th>credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.ledger.map((e) => (
                      <tr key={e.loan} className={e.pending ? 'pend' : ''}>
                        <td>{e.loan}</td>
                        <td>{e.debit}</td>
                        <td>{e.credit}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="sim-empty">no rows</div>
            )}
          </div>

          {mode === 'outbox' || mode === 'signed' ? (
            <div className="sim-store">
              <h3>
                <span>Outbox</span>
              </h3>
              {s.outbox.length ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>event</th>
                        <th>order</th>
                        <th>status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.outbox.map((e) => (
                        <tr key={e.id} className={e.pending ? 'pend' : ''}>
                          <td>{e.id}</td>
                          <td>{e.order}</td>
                          <td>{e.pending ? 'uncommitted' : e.sent ? 'sent' : 'waiting'}</td>
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

          <div className="sim-store">
            <h3>
              <span>Merchant has shipped</span>
            </h3>
            {s.shipped.length ? <div className="sim-jwt-token">{s.shipped.join(', ')}</div> : <div className="sim-empty">nothing yet</div>}
          </div>

          <div className="sim-store">
            <h3>
              <span>Bank · payouts to the merchant</span>
            </h3>
            {s.payouts.length ? (
              <div className="sim-tw">
                <table>
                  <thead>
                    <tr>
                      <th>key</th>
                      <th>amount</th>
                      <th>result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.payouts.map((p, i) => (
                      <tr key={i} className={!p.ignored && i > 0 ? 'dupe' : ''}>
                        <td>{p.key}</td>
                        <td>{fmt(p.amount)}</td>
                        <td>{p.ignored ? 'same key: no new payment' : 'paid'}</td>
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
              <div className={`sim-verdict ${final ? (verdictIsBad(mode, s) ? 'bad' : 'good') : 'wait'}`}>{final ? verdictText(mode, s) : 'Verdict appears when the run finishes. Press Run to skip ahead.'}</div>
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
  )
}
