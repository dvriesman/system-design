import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import BreakerLab from './BreakerLab'
import { build, checks, clockText, CODE, EXPERIMENTS, fmt, lineRef, msText, verdictIsBad, verdictText, type Actor, type Mode, type Pane, type Scenario, type Step } from './breakerSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'wait', label: '1 · Just wait' },
  { id: 'retry', label: '2 · Timeout + 3 tries' },
  { id: 'breaker', label: '3 · Circuit breaker' },
  { id: 'slow', label: '4 · + slow calls count' },
]
const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: 'outage', label: 'slow, then down, then back' },
  { id: 'blip', label: 'one failed call' },
]
const ACTOR_NAME: Record<Actor, string> = { svc: 'Checkout', relay: 'Circuit breaker', router: 'Risk provider' }
const PANES: { id: Pane; cls: string; title: string }[] = [
  { id: 'checkout', cls: 'svc', title: 'Checkout service' },
  { id: 'breaker', cls: 'relay', title: 'Circuit breaker' },
]

export default function CircuitBreakerPattern() {
  const [mode, setMode] = useState<Mode>('wait')
  const [scenario, setScenario] = useState<Scenario>('outage')
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const steps = useMemo(() => build(mode, scenario), [mode, scenario])
  const safeCur = Math.min(cur, steps.length - 1)

  useEffect(() => {
    if (!running) return
    if (cur >= steps.length - 1) {
      setRunning(false)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(() => setCur((c) => Math.min(steps.length - 1, c + 1)), reduced ? 120 : 450)
    return () => clearTimeout(id)
  }, [running, cur, steps.length])

  useEffect(() => {
    timelineRef.current?.querySelector('.sim-chip.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cur])

  const step: Step = steps[safeCur]
  const view = debuggerView(steps, safeCur, PANES.map((p) => CODE[mode][p.id]))
  const s = view.s
  const benchRef = useFollowExecution(safeCur, steps)
  const final = step.label === 'end'
  const breaker = mode === 'breaker' || mode === 'slow'

  function go(i: number) {
    setRunning(false)
    setCur(Math.max(0, Math.min(steps.length - 1, i)))
  }
  function switchMode(m: Mode) {
    setMode(m)
    setCur(0)
    setRunning(false)
  }
  function switchScenario(sc: Scenario) {
    setScenario(sc)
    setCur(0)
    setRunning(false)
  }
  function runExperiment(exp: (typeof EXPERIMENTS)[number]) {
    setMode(exp.mode)
    setScenario(exp.scenario)
    setRunning(false)
    const all = build(exp.mode, exp.scenario)
    setCur(exp.n === null ? all.length - 1 : all.findIndex((st) => st.n === exp.n))
  }
  const lineLabel = (st: Step) => (st.line ? `${lineRef(st.line, mode)} ${st.label}` : st.label)

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Resilience · Circuit Breaker</div>
        <h1>Circuit Breaker</h1>
        <p className="sim-lede">
          When a service you depend on is failing, should you keep calling it? Every call that waits holds a worker and keeps a customer staring at a spinner, and every retry
          adds load to a service that is already struggling. A circuit breaker notices, stops calling for a while, and checks back. The page takes this one step at a time.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">Why does one slow dependency hurt so much?</a> Waiting, timeouts, retries, and what a breaker remembers. Then drive one yourself.
          </li>
          <li>
            <a href="#part2">When is it worth it?</a> Concrete cases, what to answer while it's open, and myths.
          </li>
          <li>
            <a href="#part3">What happens during a real outage?</a> A step-by-step debugger, then <a href="#products">Resilience4j</a> and{' '}
            <a href="#real">how to build it for real</a>.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 3</div>
        <h2 id="p1">Why does one slow dependency hurt so much?</h2>
        <p className="sim-lede">The numbers are round on purpose. Go through the tabs in order, and watch the checkout workers.</p>
        <BreakerLab />
        <div className="sim-say">
          <b>The idea in one sentence.</b> A circuit breaker turns "keep waiting on something that's failing" into "fail fast, use a fallback, and check back later", so a
          problem in one dependency doesn't become a problem everywhere.
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Timeout</th>
                <th>Retry</th>
                <th>Circuit breaker</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Answers</b>
                </td>
                <td>How long will one call wait?</td>
                <td>Should a failed call be tried again?</td>
                <td>Should we call at all right now?</td>
              </tr>
              <tr>
                <td>
                  <b>Remembers</b>
                </td>
                <td>Nothing</td>
                <td>This call's tries</td>
                <td>How recent calls went, across all requests</td>
              </tr>
              <tr>
                <td>
                  <b>Good for</b>
                </td>
                <td>Every remote call, always</td>
                <td>Rare, brief failures</td>
                <td>Failures that last: outages, overload</td>
              </tr>
              <tr>
                <td>
                  <b>Risk</b>
                </td>
                <td>Too long is useless, too short fails good calls</td>
                <td>Multiplies load during an outage</td>
                <td>Opens on a false alarm, and the fallback answers worse</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="sim-small">They work together: a timeout on every call, a retry or two with jitter for blips, and a breaker around both.</p>
      </section>

      <section id="part2" aria-labelledby="p2" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 3</div>
        <h2 id="p2">When is it worth it?</h2>
        <p className="sim-lede">A breaker earns its place when a dependency can fail for a while, and you have something sensible to answer without it.</p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Case: an outside risk-score or fraud provider</h3>
            <p>
              <b>Yes.</b> You don't control its outages, and you can decide without it for a while: small purchases on the customer's history, larger ones by card. This is the
              debugger's story.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: sending a receipt or a notification</h3>
            <p>
              <b>Yes, with a queue as the fallback.</b> If the email provider is down, put the message on a queue and send it later. Nobody needs to wait for it.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: the ledger database for a payment</h3>
            <p>
              <b>Usually not.</b> There is no sensible answer without it: you can't move money without writing it down. Use timeouts and connection pool limits, and fail the
              request clearly. A breaker here only turns slow errors into fast ones.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: a payment that may have gone through</h3>
            <p>
              <b>Careful.</b> A breaker may stop new calls, but a call that timed out may still have succeeded. Retry it later with an{' '}
              <Link to="/guides/idempotency-keys">idempotency key</Link>, never as a new payment.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: one of many identical servers is bad</h3>
            <p>
              <b>Eject the host, not the service.</b> Load balancers and service meshes can stop sending traffic to one bad server while the rest keep working. Envoy calls this
              outlier detection.
            </p>
          </div>
        </div>
        <h3>What to answer while it's open</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>Fallback</th>
                <th>Example</th>
                <th>Watch out for</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>A cautious rule</td>
                <td>Approve up to $200 on repayment history</td>
                <td>For money, the fallback must be stricter than normal, never "approve everything"</td>
              </tr>
              <tr>
                <td>A cached answer</td>
                <td>The customer's score from yesterday</td>
                <td>How old is too old, and say so in the decision record</td>
              </tr>
              <tr>
                <td>Do it later</td>
                <td>Queue the receipt</td>
                <td>The queue must be durable, and someone must watch its size</td>
              </tr>
              <tr>
                <td>Say no, quickly</td>
                <td>"Pay by card instead"</td>
                <td>Fast and honest. Often the best choice</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sim-card">
          <h3>Three myths worth dropping</h3>
          <ul className="t">
            <li>
              <b>"A breaker fixes the outage."</b> It fixes what the outage does to you: slow answers and stuck workers. The dependency is just as down, and you still need a fallback.
            </li>
            <li>
              <b>"Errors are what matter."</b> A dependency that answers in 1.5 seconds returns no errors at all, and still ruins your latency. Mode 3 of the debugger shows this.
            </li>
            <li>
              <b>"More retries means more reliable."</b> Retries help with blips. During an outage they multiply the load, and every layer that retries multiplies it again.
            </li>
          </ul>
        </div>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 3 of 3</div>
        <h2 id="p3">What happens during a real outage?</h2>
        <p className="sim-lede">
          Fourteen pay-later checkouts arrive, one every 2 seconds. In the main story, the risk provider slows down, stops answering, and comes back. Switch the provider to "one
          failed call" to see that a breaker shouldn't react to a blip. Nothing crashes here, so there are no breakpoints: the experiments jump to the checkout worth seeing.
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
          <div className="sim-axis">
            <span className="sim-axis-label">Provider</span>
            <div className="sim-seg" role="group" aria-label="Provider">
              {SCENARIOS.map((sc) => (
                <button key={sc.id} type="button" aria-pressed={scenario === sc.id} onClick={() => switchScenario(sc.id)}>
                  {sc.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sim-timeline" ref={timelineRef} aria-label="Execution timeline">
            {steps.map((st, i) => (
              <button
                key={i}
                type="button"
                className={`sim-chip ${st.actor && st.actor !== 'system' ? st.actor : ''} ${i < safeCur ? 'done' : ''} ${i === safeCur ? 'cur' : ''}`}
                aria-label={`Go to step ${i}: ${st.title}`}
                onClick={() => go(i)}
              >
                {i === 0 ? 'start' : lineLabel(st)}
              </button>
            ))}
          </div>
          <div className="sim-narr" aria-live="polite">
            <span className="who">
              {view.pending ? 'about to run · ' : ''}
              {step.actor && step.actor !== 'system' ? ACTOR_NAME[step.actor] : step.actor ? 'what happens next' : 'ready'} · {clockText(s.clock)}
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
                      <span className="g" />
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
                <span>Risk provider</span>
                <span className="sim-tag">{clockText(s.clock)}</span>
              </h3>
              <div className={`sim-tx-reader ${s.providerTone}`}>
                {s.providerTone === 'ok' ? 'Healthy' : s.providerTone === 'wait' ? 'Slow' : 'Failing'}
                <span>{s.provider}</span>
              </div>
            </div>
            {breaker ? (
              <div className="sim-store">
                <h3>
                  <span>Circuit breaker</span>
                  <span className="sim-tag">{s.openUntil !== null && s.breaker === 'OPEN' ? `open until ${clockText(s.openUntil)}` : 'window of 4 · opens at 50%'}</span>
                </h3>
                <div className="cb-states">
                  {(['CLOSED', 'OPEN', 'HALF_OPEN'] as const).map((st) => (
                    <span key={st} className={`cb-state ${s.breaker === st ? `on ${st.toLowerCase()}` : ''}`}>
                      {st.replace('_', '-').toLowerCase()}
                    </span>
                  ))}
                  <span className="sim-muted sim-small">window [{s.window.map((x) => (x ? '✗' : '✓')).join(' ')}]</span>
                </div>
              </div>
            ) : null}
            <div className="sim-store">
              <h3>
                <span>Calls that reached the provider</span>
                <span className="sim-tag">{s.calls.length} total</span>
              </h3>
              {s.calls.length ? (
                <div className="sim-tw cb-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>time</th>
                        <th>checkout</th>
                        <th>result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.calls.map((c, i) => (
                        <tr key={i} className={c.duringOutage ? 'dupe' : ''}>
                          <td>{clockText(c.t)}</td>
                          <td>#{c.checkout}</td>
                          <td>{c.result}</td>
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
                <span>Checkouts</span>
              </h3>
              {s.checkouts.length ? (
                <div className="sim-tw cb-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>amount</th>
                        <th>decided by</th>
                        <th>took</th>
                        <th>answer</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.checkouts.map((c) => (
                        <tr key={c.n} className={c.ms > 1000 ? 'dupe' : c.path === 'fallback' ? 'pend' : ''}>
                          <td>#{c.n}</td>
                          <td>{fmt(c.amount)}</td>
                          <td>{c.path === 'score' ? 'real score' : 'fallback'}</td>
                          <td>{msText(c.ms)}</td>
                          <td>{c.decision}</td>
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
                {checks(s).map(([name, detail, status]) => (
                  <div className="sim-chk-row" key={name}>
                    <span className={`sim-mark ${status}`}>{status === 'ok' ? 'holds' : status === 'bad' ? 'broken' : 'pending'}</span>
                    <span>
                      <b>{name}</b> <span className="sim-muted sim-small">{detail}</span>
                    </span>
                  </div>
                ))}
                <div className={`sim-verdict ${final ? (verdictIsBad(s) ? 'bad' : 'good') : 'wait'}`}>
                  {final ? verdictText(mode, scenario, s) : 'Verdict appears when the run finishes. Press Run to skip ahead.'}
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
            <h3>No timeout means someone else's limit</h3>
            <p>While the provider was down, each checkout waited 30 seconds, the HTTP client's limit. Every one of those held a worker. Always set your own timeout.</p>
          </div>
          <div className="sim-card">
            <h3>Retries multiply an outage</h3>
            <p>Three tries meant 6 seconds per checkout and three times the calls, to a provider that was failing. The same retries were exactly right for the one-call blip.</p>
          </div>
          <div className="sim-card">
            <h3>A breaker stops the calls</h3>
            <p>
              After two failures in four calls, checkouts stopped calling, got a fallback in a millisecond, and the provider rested. One trial call at a time checked whether it was
              back.
            </p>
          </div>
          <div className="sim-card">
            <h3>Slow is a failure too</h3>
            <p>
              A 1.5-second answer is a success to an error count, and a failure to the customer. Counting slow calls opened the breaker before the outage, and kept checkouts fast
              throughout.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Each fix moves the responsibility somewhere</h3>
          <ul className="t">
            <li>
              <b>The fallback</b> now makes real decisions. It has to be safe for the business: in the debugger, some customers who would have been approved were sent to pay by
              card. Measure how often it's used, and what it costs.
            </li>
            <li>
              <b>The thresholds</b> are a guess until measured. Too sensitive, and a blip opens the breaker. Too slow, and customers wait. Tune them from real latency and error data.
            </li>
            <li>
              <b>Each instance has its own breaker.</b> Ten checkout servers means ten breakers, each needing its own few failures. That is usually fine, and simpler than sharing
              state.
            </li>
            <li>
              <b>Workers can still run out</b> if a dependency is slow but under the slow-call threshold, or before the breaker has seen enough calls. Separate pools per
              dependency stop one from taking every worker: that's the Bulkhead pattern, next on this roadmap.
            </li>
            <li>
              <b>The provider</b> still has to recover. A breaker gives it room, but if many clients' breakers all close at once, they can overload it again. Spreading the timing
              helps.
            </li>
          </ul>
        </div>
      </section>

      <section id="products" aria-labelledby="k1" className="sim-section">
        <h2 id="k1">With Resilience4j</h2>
        <p className="sim-lede">
          Resilience4j is a common library for this on the JVM. Netflix's Hystrix README says Hystrix is in maintenance mode, and recommends projects like resilience4j for new work.
        </p>
        <div className="sim-card">
          <h3>Its settings, and this page's values</h3>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th>Setting</th>
                  <th>Default, per its docs</th>
                  <th>This page</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>slidingWindowType</code> / <code>slidingWindowSize</code>
                  </td>
                  <td>COUNT_BASED, 100 calls</td>
                  <td>count-based, 4 calls</td>
                </tr>
                <tr>
                  <td>
                    <code>minimumNumberOfCalls</code>
                  </td>
                  <td>100</td>
                  <td>4</td>
                </tr>
                <tr>
                  <td>
                    <code>failureRateThreshold</code>
                  </td>
                  <td>50%</td>
                  <td>50%</td>
                </tr>
                <tr>
                  <td>
                    <code>slowCallDurationThreshold</code> / <code>slowCallRateThreshold</code>
                  </td>
                  <td>60 s / 100%</td>
                  <td>1 s / 50%, in mode 4</td>
                </tr>
                <tr>
                  <td>
                    <code>waitDurationInOpenState</code>
                  </td>
                  <td>60 s</td>
                  <td>6 s</td>
                </tr>
                <tr>
                  <td>
                    <code>permittedNumberOfCallsInHalfOpenState</code>
                  </td>
                  <td>10</td>
                  <td>1</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="sim-small">
            The page's numbers are tiny so that a short story shows every state. With the defaults, slow calls only open the breaker when every call in the window is slower than 60
            seconds, so set the slow-call threshold yourself.
          </p>
          <pre className="sim-block">{`val config = CircuitBreakerConfig.custom()
  .slidingWindowType(SlidingWindowType.COUNT_BASED)
  .slidingWindowSize(20)
  .minimumNumberOfCalls(10)
  .failureRateThreshold(50f)
  .slowCallDurationThreshold(Duration.ofMillis(800))
  .slowCallRateThreshold(50f)
  .waitDurationInOpenState(Duration.ofSeconds(30))
  .permittedNumberOfCallsInHalfOpenState(3)
  .build()

val breaker = CircuitBreaker.of("risk-provider", config)

fun score(order: Order): Score? = try {
  breaker.executeSupplier { riskClient.score(order) }   // the client has its own timeout
} catch (e: CallNotPermittedException) {
  null                                                    // open: use the fallback
} catch (e: Exception) {
  null
}`}</pre>
          <p className="sim-small">
            When open, Resilience4j rejects calls with <code>CallNotPermittedException</code>. Besides the three normal states, its docs list special states: METRICS_ONLY,
            DISABLED and FORCED_OPEN, useful for switching a breaker off or forcing it open during an incident.
          </p>
        </div>
        <div className="sim-card">
          <h3>A different "circuit breaking" in Envoy</h3>
          <p>
            In the Envoy proxy, "circuit breaking" means limits: maximum connections, pending requests, requests and retries per upstream cluster. Its docs say they are on by
            default, for example 1024 connections per cluster. That is closer to a bulkhead than to the state machine on this page. Envoy's outlier detection is the part that
            ejects a host after consecutive 5xx errors.
          </p>
        </div>
      </section>

      <section id="real" aria-labelledby="r1" className="sim-section">
        <h2 id="r1">How do you build this for real?</h2>
        <p className="sim-lede">The debugger shows the logic. These details decide whether a real breaker helps or hurts.</p>
        <div className="sim-card">
          <h3>What catches people in production</h3>
          <ul className="t">
            <li>
              <b>Counting the wrong failures.</b> A 400 because the customer's data was invalid isn't the provider failing. Count timeouts, 5xx and connection errors, not every
              exception.
            </li>
            <li>
              <b>One breaker for many endpoints.</b> If one endpoint of a provider fails, a shared breaker blocks the healthy ones too. Use one breaker per dependency and
              operation that fails independently.
            </li>
            <li>
              <b>Retries outside the breaker.</b> Put a small, jittered retry inside the breaker, and count the final outcome. Retries outside it keep knocking on an open breaker.
            </li>
            <li>
              <b>Nobody knows it opened.</b> Emit an event and a metric on every state change, and alert when a breaker stays open, or opens often.
            </li>
            <li>
              <b>Untested fallbacks.</b> The fallback runs only during incidents, so it's the least-tested code you have. Force the breaker open in a test environment and check
              the answers. The AWS Builders' Library warns that breakers add modal behaviour that can be hard to test.
            </li>
            <li>
              <b>Tiny traffic.</b> With a few calls a minute, a count of 100 never fills, and two unlucky calls are 100%. Use a time-based window, or a minimum number of calls that
              fits your traffic.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Circuit breaker</dt>
          <dd>A wrapper around remote calls that stops making them for a while when too many recent ones failed.</dd>
          <dt>Closed, open, half-open</dt>
          <dd>Closed lets calls through. Open rejects them at once. Half-open lets a few trial calls test whether the dependency recovered.</dd>
          <dt>Sliding window</dt>
          <dd>The most recent calls, or the most recent seconds of calls, that the failure rate is calculated over.</dd>
          <dt>Failure rate threshold</dt>
          <dd>The share of failed calls in the window that opens the breaker.</dd>
          <dt>Slow call</dt>
          <dd>A call that succeeded but took longer than a set duration. It can count towards opening the breaker.</dd>
          <dt>Fallback</dt>
          <dd>What the caller answers when the dependency can't be used: a cautious rule, a cached value, a queue or a clear no.</dd>
          <dt>Timeout</dt>
          <dd>The longest one call may wait before giving up.</dd>
          <dt>Retry with jitter</dt>
          <dd>Trying again after a delay with some randomness, so many clients don't retry at the same instant.</dd>
          <dt>Cascading failure</dt>
          <dd>A failure in one service causing failures in the services that call it, and so on up the chain.</dd>
          <dt>Fail fast</dt>
          <dd>Answering with an error immediately, rather than after a long wait.</dd>
          <dt>Outlier detection</dt>
          <dd>Removing one misbehaving server from a load balancer's rotation, while its healthy peers keep serving.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Explain it in a design review</h2>
        <div className="sim-say">
          "Every call to the risk provider gets a timeout, sized from its normal latency, and at most one retry with jitter for blips. Around that I'd put a circuit breaker per
          dependency: a sliding window, opening at something like 50% failures, and counting slow calls as failures, because a provider that answers in two seconds hurts as much
          as one that errors. While it's open, checkout uses a fallback that's stricter than normal: small purchases on repayment history, everything else by card, and we record
          which decisions were made without a score. After a pause, a few trial calls decide whether to close. I'd alert on state changes and test the fallback by forcing the
          breaker open. And because a slow dependency can still exhaust workers before the breaker opens, I'd pair it with a bulkhead."
        </div>
        <p className="sim-muted sim-small">
          Questions reviewers ask. "Why not just retry?" Retries multiply load during an outage. "What's the fallback for a payment?" Usually a clear failure, and an
          idempotent retry later, never a guess. "Do you share breaker state across instances?" Usually not: each instance learns quickly on its own, and sharing
          adds a dependency. "How do you pick the thresholds?" From measured latency and error rates, then adjust from what the alerts show.
        </p>
      </section>

      <div className="sim-footer">
        The simulation is deterministic and simplified. Checkouts are shown one after another, and the breaker sees each result before the next checkout starts. The window, the
        thresholds and the 6-second pause are tiny so the story fits in half a minute. One trial call is allowed while half-open. Scores and decisions are invented. Sources:
        Martin Fowler, "CircuitBreaker"; the Resilience4j CircuitBreaker documentation; the Netflix Hystrix README; "Timeouts, retries, and backoff with jitter" in the AWS
        Builders' Library; and the Envoy documentation on circuit breaking and outlier detection.
      </div>
    </div>
  )
}
