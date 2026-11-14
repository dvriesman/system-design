import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import SagaCoordination from './SagaCoordination'
import SagaLab from './SagaLab'
import { available, build, checks, clockText, CODE, EXPERIMENTS, fmt, LIMIT, lineRef, verdictIsBad, verdictText, type Actor, type Mode, type Pane, type Step } from './sagaSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'chain', label: '1 · Call each in turn' },
  { id: 'memory', label: '2 · Undo, from memory' },
  { id: 'log', label: '3 · + saga log and recovery' },
  { id: 'pivot', label: "4 · + a timeout isn't a no" },
]
const ACTOR_NAME: Record<Actor, string> = { cons: "Alice's app", svc: 'Checkout', relay: 'Services', migrator: 'Recovery job' }
const PANES: { id: Pane; cls: string; title: string }[] = [
  { id: 'app', cls: 'cons', title: "Alice's app" },
  { id: 'checkout', cls: 'svc', title: 'Checkout service · runs the saga' },
  { id: 'services', cls: 'relay', title: 'Credit, loan, payout and merchant services' },
  { id: 'recovery', cls: 'migrator', title: 'Recovery job' },
]

function Table({ title, empty, head, rows }: { title: string; empty?: string; head: string[]; rows: { key: string; cells: string[]; cls?: string }[] }) {
  return (
    <div className="sim-store">
      <h3>
        <span>{title}</span>
      </h3>
      {rows.length ? (
        <div className="sim-tw">
          <table>
            <thead>
              <tr>
                {head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.cls ?? ''}>
                  {r.cells.map((c, i) => (
                    <td key={i}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sim-empty">{empty ?? 'no rows'}</div>
      )}
    </div>
  )
}

export default function SagaPattern() {
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
    const el = timelineRef.current?.querySelector('.sim-chip.cur')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cur])

  const step: Step = steps[safeCur]
  const view = debuggerView(steps, safeCur, PANES.map((pane) => CODE[mode][pane.id]))
  const s = view.s
  const benchRef = useFollowExecution(safeCur, steps)
  const final = step.label === 'end'
  const invariantChecks = checks(s)
  const durable = mode === 'log' || mode === 'pivot'

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
  const lineLabel = (st: Step) => (st.line ? `${lineRef(st.line, mode)} ${st.label}` : st.label)
  const free = available(s)

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Data consistency · Saga Pattern</div>
        <h1>Saga Pattern</h1>
        <p className="sim-lede">
          How do you make several services act as one, when each has its own database and no transaction can cover them all? A saga runs the steps one by one, and if a
          later step fails, it runs an undo for each finished step. The page takes this one question at a time.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">What is a saga?</a> Why one transaction can't cover several services, how undo steps replace it, and why their order matters.
          </li>
          <li>
            <a href="#part2">Who runs the steps?</a> One orchestrator, or services reacting to each other's events.
          </li>
          <li>
            <a href="#part3">When is it worth it?</a> Concrete cases, including when not to use one.
          </li>
          <li>
            <a href="#part4">What happens when things fail halfway?</a> A step-by-step debugger, then <a href="#real">how to build it for real</a>.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 4</div>
        <h2 id="p1">What is a saga?</h2>
        <p className="sim-lede">Nothing crashes here. Go through the tabs in order, and watch the panel asking whether everything is consistent.</p>
        <SagaLab />
        <div className="sim-say">
          <b>The idea in one sentence.</b> A saga trades one atomic transaction for a series of local ones, each with an undo, so the system ends up all done or all undone,
          though not at the same instant.
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>One database transaction</th>
                <th>Two-phase commit</th>
                <th>Saga</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>All or nothing</b>
                </td>
                <td>Yes, instantly</td>
                <td>Yes, once everyone votes</td>
                <td>Yes, eventually, by running undos</td>
              </tr>
              <tr>
                <td>
                  <b>Others see the middle</b>
                </td>
                <td>No</td>
                <td>No, they wait on locks</td>
                <td>Yes, so you design for it</td>
              </tr>
              <tr>
                <td>
                  <b>Works across services</b>
                </td>
                <td>No, one database only</td>
                <td>Only if every participant supports it</td>
                <td>Yes, including outside parties such as a bank</td>
              </tr>
              <tr>
                <td>
                  <b>What you write</b>
                </td>
                <td>BEGIN and COMMIT</td>
                <td>Little, if your databases support it</td>
                <td>An undo for each step, a log, and recovery</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="sim-small">
          See <Link to="/guides/two-phase-commit">Two-Phase Commit vs Eventual Consistency</Link> for the locking side of this trade.
        </p>
      </section>

      <section id="part2" aria-labelledby="p2" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 4</div>
        <h2 id="p2">Who runs the steps?</h2>
        <p className="sim-lede">
          The steps and undos are the same either way. The question is who decides what happens next. Step through the same failed sofa purchase in both styles.
        </p>
        <SagaCoordination />
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Orchestration</th>
                <th>Choreography</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Where the flow lives</b>
                </td>
                <td>In one service's code</td>
                <td>Spread across subscriptions</td>
              </tr>
              <tr>
                <td>
                  <b>"Where is this purchase?"</b>
                </td>
                <td>One row in the saga log</td>
                <td>Ask every service, or build a tracking view from the events</td>
              </tr>
              <tr>
                <td>
                  <b>Coupling</b>
                </td>
                <td>The orchestrator knows every participant</td>
                <td>Each service knows the events it reacts to</td>
              </tr>
              <tr>
                <td>
                  <b>Adding a step</b>
                </td>
                <td>Change one place</td>
                <td>Change subscriptions in several services</td>
              </tr>
              <tr>
                <td>
                  <b>Good for</b>
                </td>
                <td>Money flows with several steps and undos, where people need to see the state</td>
                <td>Two or three steps, or reactions that are naturally independent, such as sending a receipt</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="sim-small">
          Either way, a service must update its database and send its message together, or a crash between the two loses the message. That is the{' '}
          <Link to="/guides/outbox">Transactional Outbox</Link>. The debugger below uses an orchestrator, because the failures are easier to follow in one place.
        </p>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section">
        <div className="sim-eyebrow">Part 3 of 4</div>
        <h2 id="p3">When is it worth it?</h2>
        <p className="sim-lede">A saga is a lot of machinery. Use it when work really spans systems that can't share a transaction, and not otherwise.</p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Case: a purchase on credit</h3>
            <p>
              <b>Yes.</b> A limit, a loan, a payout through a bank and a message to the shop live in different systems, one of them outside your company. This is the
              debugger's story.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: opening an account with checks that take days</h3>
            <p>
              <b>Yes.</b> An identity check or a manual review can take days, so nothing can hold a transaction or a lock that long. A saga waits on each step, with a
              timeout that leads to an undo, such as closing the half-opened account.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: a transfer between two of your own ledgers</h3>
            <p>
              <b>Maybe.</b> If both accounts can live in one database, a plain transaction is simpler and stronger. If they are sharded apart, a saga or two-phase commit is
              needed. See <Link to="/guides/sharding">Sharding</Link>.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: everything is in one service and one database</h3>
            <p>
              <b>No.</b> Use a transaction. Splitting a service just to then rebuild atomicity with a saga is a common and expensive mistake.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: readers must never see the middle</h3>
            <p>
              <b>Not on its own.</b> A saga commits as it goes, so a report can see a loan before the payout. If that's unacceptable, use states such as "pending" that
              readers respect, or keep the data together.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Three myths worth dropping</h3>
          <ul className="t">
            <li>
              <b>"A compensation is a rollback."</b> A rollback makes it as if nothing happened. A compensation is a new action that happens later, and others may have seen
              the original in between. A cancelled loan stays in the records, marked cancelled.
            </li>
            <li>
              <b>"If a call times out, undo it."</b> A timeout means you don't know. The other side may have done the work. Mode 3 of the debugger shows the lender paying a shop
              and cancelling the loan that covered it.
            </li>
            <li>
              <b>"Every step needs an undo."</b> Some steps can't be undone, such as money sent to an outside bank. Order the steps so that nothing after them can fail for good.
            </li>
          </ul>
        </div>
      </section>

      <section id="part4" aria-labelledby="p4" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 4 of 4</div>
        <h2 id="p4">What happens when things fail halfway?</h2>
        <p className="sim-lede">
          The same afternoon runs through every mode. Alice has a {fmt(LIMIT)} limit, and buys headphones, then a sofa from a shop whose bank account is closed, then a lamp
          while the bank's replies are being lost. Click a gutter dot to also kill the checkout service just before that line.
        </p>
      </section>

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
                {i === 0 ? 'start' : lineLabel(st)}
              </button>
            ))}
          </div>

          <div className={`sim-narr${step.crash ? ' crash' : ''}`} aria-live="polite">
            <span className="who">
              {view.pending ? 'about to run · ' : ''}
              {step.actor && step.actor !== 'system' ? ACTOR_NAME[step.actor] : step.actor ? 'what happens next' : 'ready'}
              {step.crash ? ' · process killed' : ''} · {clockText(s.clock)}
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
                            aria-label={`Kill the checkout service before line ${lineRef(l.id, mode)}`}
                            title="Kill the checkout service before this line"
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
                <span>Alice's app shows</span>
                <span className="sim-tag">{clockText(s.clock)}</span>
              </h3>
              {s.screen.length ? (
                <div className="sim-inv">
                  {s.screen.map((x) => (
                    <div className="sim-chk-row" key={x.id}>
                      <span className={`sim-mark ${x.tone}`}>{x.item}</span>
                      <span>{x.text}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="sim-empty">no purchases yet</div>
              )}
            </div>

            <Table
              title={`Credit service · holds · ${fmt(free)} of ${fmt(LIMIT)} free`}
              head={['purchase', 'amount', 'status']}
              rows={s.holds.map((h) => ({ key: h.id, cells: [h.id, fmt(h.amount), h.status], cls: h.status === 'released' ? 'pend' : '' }))}
            />
            <Table
              title="Loan service · loans"
              head={['purchase', 'item', 'amount', 'status']}
              rows={s.loans.map((l) => ({ key: l.id, cells: [l.id, l.item, fmt(l.amount), l.status], cls: l.status === 'cancelled' ? 'pend' : '' }))}
            />
            <Table
              title="Bank · transfers, by idempotency key"
              head={['key', 'to', 'amount', 'status', 'requests']}
              rows={s.transfers.map((t) => ({ key: t.key, cells: [t.key, t.shop, fmt(t.amount), t.status, String(t.calls)], cls: t.status === 'rejected' ? 'pend' : '' }))}
            />
            <Table title="Shops told to ship" head={['purchase']} rows={s.shipped.map((id) => ({ key: id, cells: [id] }))} />
            {durable ? (
              <Table
                title="Checkout · saga log"
                head={['purchase', 'state', 'done']}
                rows={s.sagas.map((g) => ({ key: g.id, cells: [g.id, g.state, g.done.join(', ') || '—'], cls: g.state === 'running' || g.state === 'undoing' ? 'pend' : '' }))}
              />
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
                <div className={`sim-verdict ${final ? (verdictIsBad(s) ? 'bad' : 'good') : 'wait'}`}>
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
            <h3>Calling each service in turn isn't a transaction</h3>
            <p>Every step commits on its own. When the sofa's payout failed, the hold and the loan stayed, and Alice owed $600 for nothing. Later, that stale hold blocked her lamp.</p>
          </div>
          <div className="sim-card">
            <h3>Undo works, as long as the process lives</h3>
            <p>
              Undoing finished steps in reverse fixed the sofa. But the list of finished steps lived in memory. Kill the process halfway, and nothing finishes the purchase or
              undoes it.
            </p>
          </div>
          <div className="sim-card">
            <h3>A saga log makes the progress survive</h3>
            <p>
              Writing each finished step to a table lets a recovery job pick up any purchase a crash interrupted. That only works because every step and every undo is safe to
              repeat.
            </p>
          </div>
          <div className="sim-card">
            <h3>A timeout is "don't know", not "no"</h3>
            <p>
              The lamp's payout went through, but the reply was lost. Treating that as a failure cancelled the loan while the shop kept the money. Asking the bank, by the same
              key, turns "don't know" into an answer. Past the payout, the saga only moves forward.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Each fix moves the responsibility somewhere</h3>
          <ul className="t">
            <li>
              <b>Idempotent steps</b> move the work to every participant. Each service must treat a repeated request for the same purchase as the same request. See{' '}
              <Link to="/guides/idempotency-keys">Idempotency Keys</Link>.
            </li>
            <li>
              <b>Asking the bank</b> depends on the bank. It must honour the idempotency key and answer a status lookup. If it can't, the honest state is "unknown", and a person
              reconciles it against the bank's statement.
            </li>
            <li>
              <b>The recovery job</b> must itself run reliably, and alert when a saga stays unfinished too long. A saga stuck forever is still a broken saga.
            </li>
            <li>
              <b>The steps after the point of no return</b> must be sure to succeed eventually. If one can fail for good, it belongs before the payout.
            </li>
            <li>
              <b>Readers</b> see the middle. A loan exists before the payout, so statements, reports and limits should respect a "pending" state. Chris Richardson calls this
              countermeasure a semantic lock.
            </li>
          </ul>
        </div>
      </section>

      <section id="real" aria-labelledby="r1" className="sim-section">
        <h2 id="r1">How do you build this for real?</h2>
        <p className="sim-lede">The debugger shows the logic. These are the details that decide whether a real saga holds up.</p>
        <div className="sim-card">
          <h3>The saga log and the orchestrator</h3>
          <pre className="sim-block">{`create table saga (
  id          text primary key,      -- the purchase id, also every step's idempotency key
  state       text not null,         -- running, undoing, undone, done, needs_review
  done_steps  text[] not null,
  updated_at  timestamptz not null
);

fun advance(saga) {                  // called on every reply, and by the recovery job
  when (saga.state) {
    "running" -> when (val next = saga.nextStep()) {
      null -> finish(saga)
      else -> outbox.send(next.command(saga.id))   // same transaction as the saga row
    }
    "undoing" -> when (val last = saga.lastUndoable()) {
      null -> markUndone(saga)
      else -> outbox.send(last.undoCommand(saga.id))
    }
  }
}`}</pre>
          <p className="sim-small">
            Real orchestrators usually send commands as messages and handle replies as they arrive, rather than waiting in one function. Updating the saga row and sending the
            command must be one transaction: see <Link to="/guides/outbox">Transactional Outbox</Link>.
          </p>
        </div>
        <div className="sim-card">
          <h3>With a workflow engine</h3>
          <p>
            Engines such as Temporal store each workflow's progress for you. Temporal's documentation says that if the application crashes, it recreates the pre-failure state by
            replaying the workflow's event history, and that a failed activity is retried automatically by default, with unlimited attempts unless you set a limit. Its blog
            shows the saga pattern as a list of compensations, added before each step and run in reverse when a step fails.
          </p>
          <pre className="sim-block">{`// The shape of a saga in a workflow engine (Temporal-style pseudocode)
val undo = mutableListOf<() -> Unit>()
try {
  undo += { credit.release(p.id) };  credit.reserve(p.id, p.amount)
  undo += { loans.cancel(p.id) };    loans.create(p.id, p.amount)
  payouts.payAndConfirm(p.id)        // retried until the bank gives a real answer
  merchants.confirm(p.id)            // retried, never undone
} catch (e: PaymentRejected) {
  undo.reversed().forEach { it() }   // each undo is retried, and must handle "never happened"
}`}</pre>
          <p className="sim-small">
            The engine replaces the saga table and the recovery job, not the thinking: undos still have to be safe to repeat, and a timeout still has to be told apart from a
            rejection. Temporal's blog also warns that timeouts set on a whole workflow can stop compensations from running.
          </p>
        </div>
        <div className="sim-card">
          <h3>What catches people in production</h3>
          <ul className="t">
            <li>
              <b>An undo that can fail.</b> Undos are retried until they work, so design them so they can't be refused: cancelling a loan you created should always be allowed.
            </li>
            <li>
              <b>An undo that runs before the step.</b> With messages, a cancel can arrive before the create it cancels. Record the cancel, and make the late create do nothing.
            </li>
            <li>
              <b>Unknown outcomes with no lookup.</b> If a partner has no status endpoint, park the saga as "needs review" and reconcile it against their statement, rather than guessing.
            </li>
            <li>
              <b>Sagas that never end.</b> Alert on any saga older than its expected time, and give people a screen to see and finish them.
            </li>
            <li>
              <b>Changing the steps while sagas are running.</b> A new version of the flow must still finish the sagas started under the old one. Version the saga definition.
            </li>
            <li>
              <b>Compensations that aren't free.</b> A cancelled loan may still need a notice to Alice, and a released limit may affect a credit decision made in between.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Saga</dt>
          <dd>A series of local transactions, each in one service, where a failure is handled by running undo actions for the steps already done.</dd>
          <dt>Compensation</dt>
          <dd>The action that reverses a finished step, such as cancelling a loan. It's a new change, not a rollback.</dd>
          <dt>Local transaction</dt>
          <dd>A transaction inside one service's own database.</dd>
          <dt>Atomic</dt>
          <dd>All or nothing: the "A" in ACID.</dd>
          <dt>Isolation</dt>
          <dd>The "I" in ACID: others don't see a transaction's changes until it commits. Sagas don't have it.</dd>
          <dt>Orchestration</dt>
          <dd>One service tells each participant what to do, and decides the next step.</dd>
          <dt>Choreography</dt>
          <dd>Each service reacts to the others' events. No one is in charge.</dd>
          <dt>Saga log</dt>
          <dd>A table recording each saga's state and finished steps, so it can be resumed after a crash.</dd>
          <dt>Point of no return</dt>
          <dd>The step that can't be undone, such as a payout. Some writers call it the pivot. Before it, steps can be undone. After it, they're retried.</dd>
          <dt>Idempotent</dt>
          <dd>Safe to repeat: doing it twice has the same effect as once.</dd>
          <dt>Idempotency key</dt>
          <dd>An ID sent with a request so the receiver can recognise a repeat. Here, the purchase ID.</dd>
          <dt>Semantic lock</dt>
          <dd>A state such as "pending" that tells others a record is in the middle of a saga.</dd>
          <dt>Two-phase commit</dt>
          <dd>A protocol that makes several databases commit together, by locking until all of them agree.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Explain it in a design review</h2>
        <div className="sim-say">
          "The purchase touches the limit, the loan, a bank payout and the merchant, each in its own service, and the bank will never join a distributed transaction. So I'd use
          a saga with an orchestrator: each step is a local transaction with a compensation, and the orchestrator records progress in a saga table, sending commands through an
          outbox. Every step is idempotent, keyed by the purchase ID, so a recovery job can safely resume anything a crash interrupted. I'd order the steps so everything that
          can be refused comes before the payout, which is the step I can't undo, and everything after it is retried, never compensated. And a timeout on the payout isn't a
          failure: I'd look the transfer up by its idempotency key, and only compensate on a definite rejection. Since sagas have no isolation, the loan stays pending until the
          payout succeeds."
        </div>
        <p className="sim-muted sim-small">
          Questions reviewers ask. "Why not two-phase commit?" The bank won't take part, and locks across services hurt availability. "Orchestration or
          choreography?" Orchestration for money flows with several undos, because the state is in one place. "What if a compensation fails?" It's retried,
          so design undos that can't be refused, and alert on sagas that stay stuck. "What does the user see meanwhile?" A pending state, then a notification.
        </p>
      </section>

      <div className="sim-footer">
        The simulation is deterministic and simplified. Each service call is shown as one atomic step, so only the checkout service can be killed. Real orchestrators
        usually use messages and replies rather than direct calls. The recovery job runs once, a minute after a crash. The bank rejects the sofa shop's transfer, and loses
        every reply about the lamp, so the story is the same in every mode. Purchases are labelled with short IDs. Sources: microservices.io, "Pattern: Saga" and "Developing
        sagas" by Chris Richardson; Temporal documentation on workflows and retry policies, and Temporal's blog post on compensating actions.
      </div>
    </div>
  )
}
