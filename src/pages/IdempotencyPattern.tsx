import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles/sim.css'
import {
  ACTOR_LABEL,
  build,
  checks,
  DEFAULT_CRASH,
  EXPERIMENTS,
  KEY,
  lineNo,
  SVC_CODE,
  verdictText,
  type Actor,
  type Mode,
  type Step,
} from './idempotencySim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'nokey', label: '1 · No idempotency key' },
  { id: 'checkthenact', label: '2 · Key, check-then-act' },
  { id: 'atomic', label: '3 · Key, atomic reserve' },
  { id: 'propagated', label: '4 · Best: key propagated downstream' },
]

export default function IdempotencyPattern() {
  const [mode, setMode] = useState<Mode>('nokey')
  const [crash, setCrash] = useState<string | null>(DEFAULT_CRASH.nokey)
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => build(mode, crash), [mode, crash])
  const safeCur = Math.min(cur, steps.length - 1)
  const svcLines = SVC_CODE[mode]

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
  const s = step.s
  const final = step.label === 'end'
  const invariantChecks = checks(s, final)

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
    setRunning(false)
    setCur(build(exp.mode, exp.crash).length - 1)
  }

  function lineLabel(st: Step): string {
    if (!st.line || st.actor !== 'svc') return st.label
    return `S${lineNo(svcLines, st.line)} ${st.label}`
  }

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Finance: High-Throughput &amp; Low-Latency · Idempotency Keys</div>
        <h1>Idempotency keys</h1>
        <p className="sim-lede">
          A client can never be 100% sure a request it sent actually landed — the connection can drop after the
          server did its job but before the answer gets back. The client's only safe move is to retry the exact
          same request. Step through the service code like a debugger, decide exactly where the response gets lost,
          and watch whether a retry is actually safe.
        </p>
      </div>

      <div className="sim-bench">
        <div className="sim-toolbar">
          <div className="sim-seg" role="group" aria-label="Approach">
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
            {step.actor ? ACTOR_LABEL[step.actor as Actor] ?? 'result' : 'ready'}
            {step.crash ? ' · response lost' : ''}
          </span>
          <b className="t">{step.title}</b>
          <span>{step.text ?? ''}</span>
        </div>

        <div className="sim-grid">
          <div className="sim-col">
            <div className={`sim-pane svc`}>
              <h3>
                <span>Payment service</span>
              </h3>
              <div className="sim-code">
                {svcLines.map((l) => (
                  <div key={l.id} className={`sim-ln${step.actor === 'svc' && step.line === l.id ? ' cur' : ''}`}>
                    <span className="g">
                      {l.breakable ? (
                        <button
                          type="button"
                          className={`sim-dot${crash === l.id ? ' on' : ''}`}
                          aria-label={`Lose the response before line ${lineNo(svcLines, l.id)}`}
                          title="Lose the response before this line"
                          onClick={() => toggleBreak(l.id)}
                        />
                      ) : null}
                    </span>
                    <span className="no">{lineNo(svcLines, l.id)}</span>
                    <pre>{l.code}</pre>
                  </div>
                ))}
              </div>
            </div>

            <div className="sim-store">
              <h3>
                <span>Variables · this call</span>
                <span className="sim-tag">attempt {Math.max(1, step.attempt)}</span>
              </h3>
              {Object.keys(step.locals).length ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>name</th>
                        <th>value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(step.locals).map(([name, value]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">nothing declared yet in this call</div>
              )}
            </div>
          </div>

          <div className="sim-col">
            <div className="sim-store">
              <h3>
                <span>Idempotency store</span>
              </h3>
              {mode === 'nokey' ? (
                <div className="sim-empty">no idempotency store in this mode — there's no key, so nothing to check</div>
              ) : s.idem.status === 'none' ? (
                <div className="sim-empty">no rows — no request has claimed this key yet</div>
              ) : (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>idempotencyKeys.key</th>
                        <th>status</th>
                        <th>response</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className={s.idem.status === 'pending' ? 'pend' : ''}>
                        <td>{KEY}</td>
                        <td>{s.idem.status}</td>
                        <td>{s.idem.response ? `${s.idem.response.id} · ${s.idem.response.amount}` : '—'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="sim-store">
              <h3>
                <span>Payment processor · call log</span>
              </h3>
              <div className="sim-klog">
                {s.processorCalls.length ? (
                  s.processorCalls.map((c, i) => (
                    <div key={i} className={`sim-msg ${c.cached ? 'read' : i > 0 ? 'dupe' : ''}`}>
                      <span>{c.id}</span>
                      <span>{c.amount}</span>
                      {c.cached ? <span>idempotent replay — no new charge</span> : i > 0 ? <span>duplicate charge</span> : null}
                    </div>
                  ))
                ) : (
                  <div className="sim-empty">no calls yet</div>
                )}
              </div>
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
                <div className={`sim-verdict ${final ? (checks(s, true).some((c) => c[2] === 'bad') ? 'bad' : 'good') : 'wait'}`}>
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
        <div className="sim-cards">
          <div className="sim-card">
            <h3>The problem: the client can't trust silence</h3>
            <p>
              A request can fail after the server finished its work — the response just never makes it back. The
              client has no way to tell "it failed" apart from "it worked, but I didn't hear about it." Its only
              safe move is to retry the exact same request, which means the server <em>will</em> see this request
              more than once.
            </p>
          </div>
          <div className="sim-card">
            <h3>The naive fix has a race</h3>
            <p>
              An idempotency key only helps if checking it and recording it happen atomically. "Look up the key,
              then write it" is two separate steps — a crash between them means the retry's lookup finds nothing,
              and it charges again anyway.
            </p>
          </div>
          <div className="sim-card">
            <h3>The real fix, and its price</h3>
            <p>
              A unique constraint on the key makes the claim atomic: only one attempt can ever win it. That fully
              stops duplicate charges — but if the winner dies before recording a response, every retry waits for
              an answer that will never come.
            </p>
          </div>
          <div className="sim-card">
            <h3>Closing the gap: propagate the key downstream</h3>
            <p>
              Keep the exact same local claim as mode 3 — same line, same unique constraint — but drop the branch
              that waits on it, and pass the <em>same</em> idempotency key to the payment processor itself. A retry
              is now always safe to just call the processor again: if it already has a result for that key, it
              hands that back instead of charging twice. The local row is still written, but it's no longer what
              makes this safe — delete it and the pattern is still correct.
            </p>
            <p>
              The claim itself doesn't disappear — it <em>moves</em>. This only works because the processor does,
              internally, the exact same atomic claim mode 3 did locally (a unique constraint on your idempotency
              key, on their side). We haven't removed the need for an atomic claim anywhere in this system; we've
              delegated it to someone who already built it correctly, so our own service doesn't have to. If the
              downstream API only did its own check-then-act internally, propagating the key would buy us nothing —
              we'd have just relocated mode 2's race into somebody else's code.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Atomic claim, in SQL</h3>
          <pre className="sim-block">{`-- the unique constraint IS the atomicity; no application-level locking needed
CREATE UNIQUE INDEX ON idempotency_keys (key);

-- first writer wins; ON CONFLICT swallows the constraint violation for everyone else
INSERT INTO idempotency_keys (key, status) VALUES ('${KEY}', 'pending')
  ON CONFLICT (key) DO NOTHING;
-- 1 row affected: you won the claim, go charge
-- 0 rows affected: another attempt already holds this key — poll for its result instead of charging`}</pre>
        </div>
      </section>

      <section aria-labelledby="w2" className="sim-section">
        <h2 id="w2">Three ways to hold the key</h2>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Check-then-act</th>
                <th>Atomic reserve (local only)</th>
                <th>Propagated (no local gate)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>How</b>
                </td>
                <td>
                  <code>SELECT</code> to look for an existing key, then <code>INSERT</code> once work is done
                </td>
                <td>
                  <code>INSERT ... ON CONFLICT DO NOTHING</code> before any work starts
                </td>
                <td>Same local <code>INSERT ... ON CONFLICT DO NOTHING</code> as mode 3, but no branch on it — every attempt calls the processor with the same key; it decides</td>
              </tr>
              <tr>
                <td>
                  <b>Race window</b>
                </td>
                <td>Open between the lookup and the write — a crash or a concurrent duplicate in that window</td>
                <td>None — the database's unique constraint decides atomically, in a single statement</td>
                <td>None — there's no local decision left to race on</td>
              </tr>
              <tr>
                <td>
                  <b>Failure mode</b>
                </td>
                <td>Duplicate charge if the write never happens</td>
                <td>Stuck retry if the response is never recorded against the claim</td>
                <td>None left — a retry is safe no matter where the previous attempt died</td>
              </tr>
              <tr>
                <td>
                  <b>Fix needed</b>
                </td>
                <td>None — just don't use this approach for anything money-related</td>
                <td>A lease/expiry on claimed-but-unresolved keys</td>
                <td>Requires the downstream API to do this same atomic claim <em>itself</em> — you're trusting their implementation, not skipping the problem</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Idempotent</dt>
          <dd>Doing it twice has the same effect, and returns the same result, as doing it once.</dd>
          <dt>Idempotency key</dt>
          <dd>A client-generated identifier for one logical request, sent on every retry of that same request.</dd>
          <dt>Check-then-act</dt>
          <dd>A read followed by a separate write, with no atomicity between them — a classic race-condition shape.</dd>
          <dt>Unique constraint</dt>
          <dd>A database guarantee that at most one row can exist for a given value — the cheapest atomic claim available.</dd>
          <dt>Lease / expiry</dt>
          <dd>A timestamp on a claim that lets another attempt safely take over if the original claimant never finished.</dd>
          <dt>Idempotent downstream API</dt>
          <dd>A third-party API (payment processors like Stripe are the classic example) that accepts your idempotency key and does its own atomic claim on it internally — the same mechanism as mode 3, just on their side — so retries are safe even if your own bookkeeping never finishes.</dd>
          <dt>Double-spend</dt>
          <dd>A duplicate execution of a financial operation that moves money (or credit) more than once for a single intent.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Say it in the interview</h2>
        <div className="sim-say">
          "Every write endpoint that moves money takes a client-generated idempotency key. The key claim is atomic —
          an <code>INSERT ... ON CONFLICT DO NOTHING</code> on a unique-constrained table, not a separate
          read-then-write — so concurrent retries can't both slip through locally. But I don't stop there: the same
          key is also passed to the payment processor's own idempotency API, so even if my service crashes between
          charging and recording that locally, a retry is still safe to just call the processor again — it returns
          the original result instead of charging twice. That removes the one failure mode local-only atomicity
          can't close: a claim that's reserved but never resolved."
        </div>
        <p className="sim-muted sim-small">
          Follow-up they may ask: "What if the downstream API doesn't support idempotency keys?" Then you're back to
          needing a lease/expiry on the local claim, and a reconciliation job to find out what actually happened
          before you retry. Follow-up #2: "What if two different idempotency keys describe the same intent?" That's
          a client bug this pattern can't fix — the key is only as good as the client's own retry logic reusing it
          correctly.
        </p>
      </section>

      <div className="sim-footer">
        The simulation above is deterministic and simplified: in production, retries can arrive concurrently rather
        than strictly one after another, and a stuck claim is only discovered once its lease expires.
      </div>
    </div>
  )
}
