import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import SessionsLab from './SessionsLab'
import {
  build,
  checks,
  DEFAULT_CRASH,
  EXPERIMENTS,
  fmt,
  lineNo,
  SERVER_CODE,
  verdictIsBad,
  verdictText,
  type Actor,
  type Credential,
  type Mode,
  type SimState,
  type Step,
} from './sessionsSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'memory', label: '1 · Sessions in memory' },
  { id: 'shared', label: '2 · Shared session store' },
  { id: 'jwt', label: '3 · Long-lived JWT' },
  { id: 'short', label: '4 · Short JWT + refresh' },
  { id: 'feed', label: '5 · + revocation feed' },
]
const ACTOR_NAME: Record<Actor, string> = { cons: 'Alice', migrator: 'Attacker', relay: 'Bank staff' }

function credentialStatus(s: SimState, c: Credential): { text: string; cls: string } {
  if (!c.access) return { text: '', cls: '' }
  if (c.exp !== null) {
    return s.clock >= c.exp ? { text: `expired at +${c.exp} min`, cls: 'pend' } : { text: `valid until +${c.exp} min`, cls: '' }
  }
  const live = s.sessions.includes(c.access) || s.memory.s1.includes(c.access) || s.memory.s2.includes(c.access)
  return live ? { text: 'valid while its row exists', cls: '' } : { text: 'its row is gone', cls: 'pend' }
}

export default function SessionsPattern() {
  const [mode, setMode] = useState<Mode>('memory')
  const [crash, setCrash] = useState<string | null>(DEFAULT_CRASH.memory)
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => build(mode, crash), [mode, crash])
  const safeCur = Math.min(cur, steps.length - 1)
  const codeLines = SERVER_CODE[mode]

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
  const view = debuggerView(steps, safeCur, [codeLines])
  const s = view.s
  const benchRef = useFollowExecution(safeCur, steps)
  const final = step.label === 'end'
  const invariantChecks = checks(s)
  const usesStore = mode !== 'memory' && mode !== 'jwt'

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
    if (!st.line) return st.label
    return `S${lineNo(st.line, mode)} ${st.label}`
  }

  const credentials: [string, Credential | null][] = [
    ["Alice's app", s.phone],
    ["Attacker's copy", s.attacker],
  ]

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Authentication · Sessions vs JWTs</div>
        <h1>Sessions vs JWTs</h1>
        <p className="sim-lede">
          You log in once, and the server recognizes you on every later request. How? There are two very different answers, and the
          choice decides how fast you can respond when a credential is stolen. The page takes this one question at a time.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">How does the server know it's you?</a> One login each way, plus a real JWT you can try to tamper with.
          </li>
          <li>
            <a href="#part2">Which one should you use?</a> Concrete cases, and why plain sessions are often the right answer.
          </li>
          <li>
            <a href="#part3">What happens when a credential is stolen?</a> A step-by-step debugger, then{' '}
            <a href="#keycloak">how Keycloak uses both</a> and <a href="#real">how to build it for real</a>.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 3</div>
        <h2 id="p1">How does the server know it's you?</h2>
        <p className="sim-lede">
          Nothing is under attack here yet. Step through both tabs to the last step, where the bank tries to cancel a stolen credential,
          and compare what happens.
        </p>
        <SessionsLab />
        <div className="sim-say">
          <b>The trade-off in one sentence.</b> A session makes the server look something up on every request, and in return it can cancel
          any login instantly. A JWT needs no lookup, and in return the server gives up the ability to cancel it before it expires.
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Session</th>
                <th>JWT</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>What the client holds</b>
                </td>
                <td>A random ID that means nothing by itself</td>
                <td>A readable, signed statement of who you are</td>
              </tr>
              <tr>
                <td>
                  <b>What the server keeps</b>
                </td>
                <td>A record for every login</td>
                <td>Only the signing key</td>
              </tr>
              <tr>
                <td>
                  <b>Checking a request</b>
                </td>
                <td>A lookup, usually a network call</td>
                <td>A signature check, with no network call</td>
              </tr>
              <tr>
                <td>
                  <b>Cancelling a login</b>
                </td>
                <td>Delete the record: effective at once</td>
                <td>Not possible by itself: it works until it expires</td>
              </tr>
              <tr>
                <td>
                  <b>Changing someone's permissions</b>
                </td>
                <td>Takes effect on the next request</td>
                <td>Old claims stay in old tokens until they expire</td>
              </tr>
              <tr>
                <td>
                  <b>Who can verify it</b>
                </td>
                <td>Only systems with access to the store</td>
                <td>Anyone with the verification key, even another organization</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="part2" aria-labelledby="p2" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 3</div>
        <h2 id="p2">Which one should you use?</h2>
        <p className="sim-lede">
          JWTs are often chosen because they sound more modern or more scalable. For many systems, that's a poor trade. A lookup in an
          in-memory store on the same network is usually very cheap, and in exchange you keep the ability to stop an attacker.
        </p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Case: online banking in a browser</h3>
            <p>
              <b>Sessions.</b> One organization owns the app and the backend, and "this device was stolen, log it out now" must take
              effect at once. A secure cookie holding a random ID is simple and well understood, and the app never has to handle the
              credential in JavaScript.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: a mobile app calling many services</h3>
            <p>
              <b>Short tokens with refresh.</b> A native app has no browser cookie handling to lean on, and many services need to know the
              caller. Short-lived tokens avoid sending every service to the session store, and the refresh step gives you a point of
              control. Add a revocation feed if the 15-minute window isn't acceptable.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: services inside one platform</h3>
            <p>
              <b>Both.</b> A gateway can hold the user's session and swap it for a very short JWT on each inbound call. Clients only ever
              see an opaque ID, so you can revoke at the edge, while internal services get signed claims with no lookup. This is often
              called the phantom token pattern.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: trust across organizations</h3>
            <p>
              <b>JWTs, with asymmetric keys.</b> A partner can't reach into your session store, but it can verify a signature using your
              published public key. This is where self-contained tokens are really needed, and it's the basis of OpenID Connect, which
              comes later on this roadmap.
            </p>
          </div>
        </div>
        <h3>The questions that decide it</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>Ask</th>
                <th>Leans sessions</th>
                <th>Leans JWTs</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Must revoking take effect at once?</td>
                <td>Yes: money, or sensitive data</td>
                <td>A short delay is acceptable, or you'll add a revocation list anyway</td>
              </tr>
              <tr>
                <td>Who needs to verify the caller?</td>
                <td>Your own backend</td>
                <td>Many services, or other organizations</td>
              </tr>
              <tr>
                <td>Is a store lookup on each request a real problem?</td>
                <td>No: it's cheap on the same network</td>
                <td>Yes: services are far from the store, or the volume is extreme</td>
              </tr>
              <tr>
                <td>Do permissions change often?</td>
                <td>Yes: they must apply immediately</td>
                <td>Rarely, or the token holds only the identity</td>
              </tr>
              <tr>
                <td>Who is the client?</td>
                <td>A browser: cookies work well</td>
                <td>Native apps and other servers</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sim-card">
          <h3>Three myths worth dropping</h3>
          <ul className="t">
            <li>
              <b>"JWTs are encrypted."</b> A standard signed JWT isn't. Anyone holding it can read the payload, as you saw in Part 1.
            </li>
            <li>
              <b>"JWTs are more secure."</b> Neither is more secure by nature. A stolen one of either kind works for the thief, and the JWT
              is the harder of the two to stop.
            </li>
            <li>
              <b>"JWTs make you stateless."</b> Only until you need logout to work. Real systems add refresh tokens and revocation lists, as
              modes 4 and 5 below show. The question is how much state you keep and where it lives, not whether you have any.
            </li>
          </ul>
        </div>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 3 of 3</div>
        <h2 id="p3">What happens when a credential is stolen?</h2>
        <p className="sim-lede">
          The same story runs through every mode: Alice logs in, her laptop is stolen, the store goes down for a while, and the bank revokes
          her access while the attacker tries to move money. Each mode breaks a different check. No mode here wins outright, and mode 2 is
          often the right answer even with its broken check. Click a gutter dot to also kill a server just before that line.
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
              {step.actor && step.actor !== 'system' ? ACTOR_NAME[step.actor] : step.actor ? 'what happens next' : 'ready'}
              {step.crash ? ' · process killed' : ''} · +{s.clock} min
            </span>
            <b className="t">{step.title}</b>
            <span>{step.text ?? ''}</span>
          </div>

        </div>

        <div className="sim-grid">
          <div className="sim-col">
            <div className="sim-pane svc">
              <h3>
                <span>API server</span>
              </h3>
              <div className="sim-code wrap">
                {codeLines.map((l) => (
                  <div key={l.id} className={`sim-ln${step.line === l.id ? ' cur' : ''}`}>
                    <span className="g">
                      {l.breakable ? (
                        <button
                          type="button"
                          className={`sim-dot${crash === l.id ? ' on' : ''}`}
                          aria-label={`Kill the server before line ${lineNo(l.id, mode)}`}
                          title="Kill the server before this line"
                          onClick={() => toggleBreak(l.id)}
                        />
                      ) : null}
                    </span>
                    <span className="no">{lineNo(l.id, mode)}</span>
                    <pre>{l.code}</pre>
                  </div>
                ))}
              </div>
            </div>

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

            <div className="sim-store">
              <h3>
                <span>Store lookups on requests</span>
                <span className="sim-tag">{s.storeLookups}</span>
              </h3>
              <div className="sim-empty">
                {mode === 'shared'
                  ? 'One network call for every request, from everyone, all day.'
                  : mode === 'memory'
                    ? 'No store, but each server only knows its own logins.'
                    : usesStore
                      ? 'None on ordinary requests. The store is only used to refresh, every 15 minutes.'
                      : 'None. Nothing is looked up, and nothing can be revoked.'}
              </div>
            </div>
          </div>

          <div className="sim-col">
            <div className="sim-store">
              <h3>
                <span>Alice's account</span>
                <span className="sim-tag">+{s.clock} min</span>
              </h3>
              <div className={`sim-tx-reader ${s.stolen ? 'short' : 'ok'}`}>
                {fmt(s.balance)}
                <span>{s.stolen ? `${fmt(s.stolen)} moved by the attacker after the bank revoked access` : 'nothing stolen'}</span>
              </div>
            </div>

            <div className="sim-store">
              <h3>
                <span>Credentials in circulation</span>
              </h3>
              {s.phone.access ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>held by</th>
                        <th>credential</th>
                        <th>status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {credentials.map(([holder, c]) => {
                        if (!c || !c.access) return null
                        const status = credentialStatus(s, c)
                        return (
                          <tr key={holder} className={status.cls}>
                            <td>{holder}</td>
                            <td>
                              {c.access}
                              {c.refresh ? ` + ${c.refresh}` : ''}
                            </td>
                            <td>{status.text}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">nothing issued yet</div>
              )}
            </div>

            {mode === 'memory' ? (
              <div className="sim-store">
                <h3>
                  <span>Each server's own memory</span>
                </h3>
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>server</th>
                        <th>sessions it knows about</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>server-1</td>
                        <td>{s.memory.s1.join(', ') || 'none'}</td>
                      </tr>
                      <tr>
                        <td>server-2</td>
                        <td>{s.memory.s2.join(', ') || 'none'}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            {usesStore ? (
              <div className="sim-store">
                <h3>
                  <span>Shared store · {mode === 'shared' ? 'sessions' : 'refresh tokens'}</span>
                  <span className={`sim-tag${s.storeUp ? '' : ' tx'}`}>{s.storeUp ? 'up' : 'DOWN'}</span>
                </h3>
                {(mode === 'shared' ? s.sessions : s.refreshTokens).length ? (
                  <div className="sim-tw">
                    <table>
                      <thead>
                        <tr>
                          <th>id</th>
                          <th>user</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(mode === 'shared' ? s.sessions : s.refreshTokens).map((id) => (
                          <tr key={id}>
                            <td>{id}</td>
                            <td>alice</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="sim-empty">no rows</div>
                )}
              </div>
            ) : (
              <div className="sim-store">
                <h3>
                  <span>Shared store</span>
                </h3>
                <div className="sim-empty">this design doesn't have one, so an outage can't affect it</div>
              </div>
            )}

            {mode === 'feed' ? (
              <div className="sim-store">
                <h3>
                  <span>Revoked list · in each server's memory</span>
                </h3>
                {s.revoked.s1 !== null || s.revoked.s2 !== null ? (
                  <div className="sim-tw">
                    <table>
                      <thead>
                        <tr>
                          <th>server</th>
                          <th>user</th>
                          <th>tokens issued before</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(['s1', 's2'] as const).map((sv) =>
                          s.revoked[sv] !== null ? (
                            <tr key={sv}>
                              <td>{sv === 's1' ? 'server-1' : 'server-2'}</td>
                              <td>alice</td>
                              <td>+{s.revoked[sv]} min</td>
                            </tr>
                          ) : null,
                        )}
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
            <h3>In-memory sessions break as soon as you have two servers</h3>
            <p>
              Each process only knows its own logins, so users get thrown out at random and a restart loses everyone. Worse, revoking reaches
              only the server that takes the call, and staff see a success message. Sticky load balancing hides the first symptom, and it does
              nothing for the second.
            </p>
          </div>
          <div className="sim-card">
            <h3>A shared store fixes that, and becomes critical</h3>
            <p>
              One delete stops a login everywhere at once. The price is a dependency on every request: when the store is down, nobody can be
              identified. That's usually managed with replication rather than avoided, which makes this design a strong, simple default.
            </p>
          </div>
          <div className="sim-card">
            <h3>A long-lived JWT removes the store, and your control</h3>
            <p>
              The outage does nothing, and nothing is looked up. But the bank presses revoke, staff see success, and the attacker keeps spending.
              The only universal off switch is changing the signing key, which logs out every user at once.
            </p>
          </div>
          <div className="sim-card">
            <h3>Short tokens bound the damage</h3>
            <p>
              A token that lasts 15 minutes limits how long a theft lasts, and the refresh token puts a check back where the bank can delete it.
              But "bounded" isn't "prevented": the attacker still moved money inside that window. Shorter tokens mean more refreshes, so this is
              a dial between load and exposure.
            </p>
          </div>
          <div className="sim-card">
            <h3>A revocation feed closes the window, at a price</h3>
            <p>
              A small list, pushed to every server and checked in memory, stops the token at once with no lookup per request. It stays small
              because entries only need to outlive the token lifetime. Now you run a store, a feed and a list on every server, so check that this
              is really simpler than mode 2.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Each fix moves the responsibility somewhere</h3>
          <ul className="t">
            <li>
              <b>The JWT</b> moves trust onto the signing key. Anyone who gets it can mint a token for any user, with nothing recorded anywhere.
            </li>
            <li>
              <b>The refresh token</b> moves the risk onto itself. It's long-lived and stolen along with the access token, which is why{' '}
              rotating it and detecting reuse is the next pattern on this roadmap.
            </li>
            <li>
              <b>The feed</b> means revocation is only as fast as the feed. If a server stops receiving updates, it keeps accepting revoked tokens
              without any error, so lag needs an alert. For moving money, a server that has lost the feed should refuse rather than guess.
            </li>
            <li>
              <b>"Survives a store outage"</b> has a limit in modes 4 and 5. Requests keep working, but refreshing doesn't. A longer outage logs
              people out in waves as their tokens expire.
            </li>
            <li>
              <b>None of these detect theft.</b> Every mode accepted the attacker until someone reported it. Device binding, unusual-activity
              checks and asking for a second factor before moving money are separate layers. Related:{' '}
              <Link to="/guides/idempotency-keys">Idempotency Keys</Link> protects against retried transfers, not stolen credentials.
            </li>
          </ul>
        </div>
      </section>

      <section id="keycloak" aria-labelledby="k1" className="sim-section">
        <h2 id="k1">Using both: how Keycloak does it</h2>
        <p className="sim-lede">
          Sessions and JWTs aren't always a choice between two options. Keycloak, an open-source login server, uses both at once: a session
          decides how long you stay logged in, and short-lived JWTs are the passes issued from it. It's mode 4 in practice, with the session
          kept inside the login server.
        </p>
        <div className="sim-card">
          <h3>What exists after Alice logs in</h3>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Where it lives</th>
                  <th>Who checks it</th>
                  <th>Its job</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>SSO session</b>
                  </td>
                  <td>On Keycloak's server, with a cookie in the browser</td>
                  <td>Keycloak</td>
                  <td>Records that Alice is still logged in</td>
                </tr>
                <tr>
                  <td>
                    <b>Refresh token</b>
                  </td>
                  <td>In the client application</td>
                  <td>Keycloak, because the token is tied to the session</td>
                  <td>Gets new access tokens</td>
                </tr>
                <tr>
                  <td>
                    <b>Access token (JWT)</b>
                  </td>
                  <td>In the client application</td>
                  <td>Your APIs, using only the signature</td>
                  <td>Proves who is calling on each request</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="sim-card">
          <h3>How they work together</h3>
          <pre className="sim-block">{`1. Login
   Alice signs in at Keycloak
   Keycloak creates the session and issues the tokens

2. Every API call
   The client sends the access token
   The API verifies the signature, without calling Keycloak

3. The access token expires, usually within minutes
   The client sends the refresh token to Keycloak
   Session still active? Keycloak issues a new access token`}</pre>
          <p className="sim-small">
            Your APIs get a JWT's speed on every request, and Keycloak only gets involved each time a token needs renewing. That renewal is where
            the session can stop things. Lifetimes are configured per realm, so check your own settings rather than assuming a value.
          </p>
        </div>
        <div className="sim-card">
          <h3>What happens on logout</h3>
          <ul className="t">
            <li>
              <b>Keycloak ends the session.</b> Alice's SSO cookies stop working, so she has to log in again.
            </li>
            <li>
              <b>The next refresh fails.</b> The refresh token depends on a session that no longer exists, so no new access tokens are issued.
            </li>
            <li>
              <b>Access tokens already issued keep working until they expire.</b> Your API only checks the signature, and the signature is still
              valid.
            </li>
          </ul>
        </div>
        <div className="sim-say">
          <b>The key point.</b> Closing the session doesn't cancel the JWT. It stops the renewal, which leaves a gap as long as the token's
          remaining lifetime.
        </div>
        <div className="sim-card">
          <h3>Five ways to deal with that gap</h3>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th>Option</th>
                  <th>How it works</th>
                  <th>What it costs</th>
                  <th>Closest mode</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>Accept the gap</b>
                  </td>
                  <td>Keep access tokens short, and let them expire</td>
                  <td>A stolen token works until it expires</td>
                  <td>Mode 4</td>
                </tr>
                <tr>
                  <td>
                    <b>Back-channel logout</b>
                  </td>
                  <td>Keycloak sends your backend a signed logout token, and your backend rejects that session's tokens</td>
                  <td>You build the endpoint and keep a list of ended sessions</td>
                  <td>Mode 5</td>
                </tr>
                <tr>
                  <td>
                    <b>Token introspection</b>
                  </td>
                  <td>Your API asks Keycloak if the token is still active</td>
                  <td>A network call per request, and Keycloak is now in your request path</td>
                  <td>Mode 2</td>
                </tr>
                <tr>
                  <td>
                    <b>Forced-logout timestamp</b>
                  </td>
                  <td>Redis keeps a logout time per user, and any token issued before it is rejected</td>
                  <td>A Redis read per request, and every device of that user is logged out</td>
                  <td>Mode 5's check, with mode 2's lookup</td>
                </tr>
                <tr>
                  <td>
                    <b>Token revocation list</b>
                  </td>
                  <td>Redis keeps the ID of each revoked token, and those tokens are rejected</td>
                  <td>A Redis read per request, and you must know which tokens to list</td>
                  <td>Mode 2's lookup</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="sim-small">
            Back-channel logout needs a URL registered for each client. Without one, Keycloak has nowhere to send the news, and your backend never
            hears about the logout. Many systems use a mix: signature checks for ordinary reads, and introspection before moving money.
          </p>
        </div>
        <div className="sim-card">
          <h3>Rejecting tokens with Redis</h3>
          <p>
            These last two options add one check after the signature check. Keycloak ends the session, which stops new tokens, and Redis rejects the
            tokens already out there. A token stays valid only if it passes the signature check and the Redis check.
          </p>
          <pre className="sim-block">{`fun forceLogout(userId) {
  keycloak.endAllSessions(userId)         // first: this stops new tokens
  redis.set("logout:" + userId,
    now + clockMargin,                    // iat is in whole seconds, and clocks differ
    ttl = maxAccessTokenLifetime + clockMargin)
}

fun revokeToken(claims) =
  redis.set("revoked:" + claims.jti, true, ttl = claims.exp - now)

// on every request, after the signature check
fun isRejected(claims): Boolean {
  val logoutAt = redis.get("logout:" + claims.sub)
  if (logoutAt != null && claims.iat <= logoutAt) return true
  return redis.exists("revoked:" + claims.jti)
}`}</pre>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th></th>
                  <th>Forced-logout timestamp</th>
                  <th>Token revocation list</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>Stops</b>
                  </td>
                  <td>All of a user's tokens issued before that moment</td>
                  <td>One specific token</td>
                </tr>
                <tr>
                  <td>
                    <b>Best for</b>
                  </td>
                  <td>"Log out everywhere", such as a stolen laptop or a fired employee</td>
                  <td>One known token, such as one found in a log</td>
                </tr>
                <tr>
                  <td>
                    <b>Size in Redis</b>
                  </td>
                  <td>One key per logged-out user</td>
                  <td>One key per revoked token</td>
                </tr>
                <tr>
                  <td>
                    <b>What you need to know</b>
                  </td>
                  <td>Only the user ID</td>
                  <td>Each token's <code>jti</code>, so you need a record of what was issued</td>
                </tr>
                <tr>
                  <td>
                    <b>Logging in again</b>
                  </td>
                  <td>Works once the clock margin has passed: a new token then has a later <code>iat</code></td>
                  <td>Works: a new token has a new <code>jti</code></td>
                </tr>
                <tr>
                  <td>
                    <b>When the key can expire</b>
                  </td>
                  <td>After the longest access token lifetime</td>
                  <td>When that token expires</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="sim-small">
            They work well together: the timestamp handles "this user is compromised", and the list handles "this one token leaked". Neither fits
            logging out a single device, because one token ID won't cover the tokens refreshed after it, and a timestamp logs out every device. For
            that, use a session ID, if your tokens carry one.
          </p>
          <h3>Where the check runs</h3>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th>Layer</th>
                  <th>How it reaches Redis</th>
                  <th>Trade-off</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <b>Istio</b>
                  </td>
                  <td>
                    <code>RequestAuthentication</code> checks the token itself, so the Redis check goes in an external authorizer, called through a{' '}
                    <code>CUSTOM</code> authorization policy
                  </td>
                  <td>One enforcement point at the mesh, and services don't change. Traffic that bypasses the mesh skips it</td>
                </tr>
                <tr>
                  <td>
                    <b>OPA</b>
                  </td>
                  <td>
                    OPA has no built-in for Redis, so a policy usually calls a small service with <code>http.send</code>. It can also run as Istio's
                    external authorizer
                  </td>
                  <td>The rule lives with your other policies, and there's one more network hop. Cached responses can delay a revocation</td>
                </tr>
                <tr>
                  <td>
                    <b>The backend</b>
                  </td>
                  <td>A Redis client, usually in shared middleware</td>
                  <td>Simple and works without a mesh, but every service has to include it and stay up to date</td>
                </tr>
              </tbody>
            </table>
          </div>
          <h3>What catches people out with this approach</h3>
          <ul className="t">
            <li>
              <b>The order of the two steps.</b> End the session first, then write the timestamp. The other way round, a refresh that lands between the
              two steps gets a token issued after the timestamp, and that token passes the check. If the Redis write fails, retry it, because both steps
              are safe to repeat.
            </li>
            <li>
              <b>Redis is now on the request path.</b> You have brought back mode 2's lookup and its dependency. Decide what happens when Redis is down:
              for moving money, refuse the request. For low-risk reads, you might allow it and raise an alert, which accepts that a revoked token could
              work during the outage.
            </li>
            <li>
              <b>Reading from a replica.</b> A replica that's behind can miss a logout that was just written. Replicate quickly and monitor the lag, or read
              from the primary for sensitive actions.
            </li>
            <li>
              <b>An expiry that's too short.</b> The key must outlive the longest access token. If it expires too soon, old tokens become valid again. Check
              this whenever token lifetimes change.
            </li>
            <li>
              <b>Offline tokens.</b> Ending the session doesn't stop an offline token from getting new access tokens, and those have a later{' '}
              <code>iat</code>, so they pass the timestamp check. Revoke them too.
            </li>
          </ul>
        </div>
        <div className="sim-card">
          <h3>What catches people out</h3>
          <ul className="t">
            <li>
              <b>Your application may have its own session.</b> A backend can log Alice in through Keycloak and then give her browser its own
              cookie. Ending the Keycloak session doesn't end that one unless your backend handles the logout, so she can look logged out in one
              place and still be active in another.
            </li>
            <li>
              <b>Offline tokens outlive logout.</b> They're a special kind of refresh token meant for work that runs while the user is away, and
              they aren't tied to the normal session. Revoke them separately.
            </li>
            <li>
              <b>Logout doesn't detect theft.</b> Someone still has to notice and end the session. Until then, the attacker can keep refreshing,
              just as Alice can.
            </li>
          </ul>
        </div>
      </section>

      <section id="real" aria-labelledby="r1" className="sim-section">
        <h2 id="r1">How do you build this for real?</h2>
        <p className="sim-lede">
          The debugger shows the logic. These are the details that decide whether a real implementation is safe.
        </p>
        <div className="sim-card">
          <h3>A session, end to end</h3>
          <pre className="sim-block">{`fun login(user, password, response) {
  verifyPassword(user, password)

  // at least 128 bits from a secure random source, never a counter or a hash of the user
  val sid = secureRandomBase64(32)
  // store a hash, so a leak of the store doesn't hand out live sessions
  store.set("session:" + sha256(sid), { user, createdAt: now }, ttl = 30.minutes)

  response.setCookie("sid", sid,
    httpOnly = true,      // JavaScript can't read it, which limits what XSS can steal
    secure = true,        // HTTPS only
    sameSite = "Lax",     // not sent on most cross-site requests, which helps against CSRF
    path = "/")
}

fun authenticate(request): User? {
  val key = "session:" + sha256(request.cookie("sid") ?: return null)
  val session = store.get(key) ?: return null
  store.expire(key, 30.minutes)   // sliding expiry: idle users time out
  return session.user
}

// keep an index per user, so that "log out everywhere" is one call
fun revokeAll(user) = store.deleteAll(store.members("sessions-of:" + user))`}</pre>
          <p className="sim-small">
            Always issue a new session ID at login, and never reuse one the browser arrived with. Otherwise an attacker can plant a known ID before
            the victim logs in, which is called session fixation.
          </p>
        </div>
        <div className="sim-card">
          <h3>A JWT, end to end</h3>
          <pre className="sim-block">{`fun issueAccessToken(user): String =
  jwtLibrary.sign(
    claims = { iss: "auth.bank.example", aud: "api.bank.example",
               sub: user.id, iat: now, exp: now + 15.minutes, jti: randomId() },
    key = currentPrivateKey,
    header = { alg: "ES256", kid: currentKeyId })   // kid says which key signed it

fun authenticate(request): Claims? {
  val token = request.bearerToken() ?: return null
  return jwtLibrary.verify(token,
    keyLookup = { kid -> publicKeys[kid] },   // fetched and cached from your auth service
    algorithms = ["ES256"],                   // pinned here, never taken from the token
    issuer = "auth.bank.example",
    audience = "api.bank.example",
    clockSkew = 30.seconds)                   // returns null on any failure
}`}</pre>
          <p className="sim-small">
            With asymmetric keys, only the auth service can create tokens, and every other service only holds a public key that can verify them. A
            compromised service then can't mint tokens for other users. To rotate, publish the new public key, start signing with the new private
            key, and remove the old public key once its last token has expired.
          </p>
        </div>
        <div className="sim-card">
          <h3>Where the client keeps it</h3>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th>Where</th>
                  <th>Exposed to</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>HttpOnly</code> cookie
                  </td>
                  <td>CSRF, since browsers send it automatically</td>
                  <td>The usual choice for browsers. Use <code>SameSite</code> and CSRF tokens</td>
                </tr>
                <tr>
                  <td>
                    <code>localStorage</code>
                  </td>
                  <td>Any XSS on the page, which can copy it out</td>
                  <td>Avoid for anything long-lived</td>
                </tr>
                <tr>
                  <td>JavaScript memory</td>
                  <td>XSS while the page is open</td>
                  <td>Lost on refresh, so it's usually paired with a refresh cookie</td>
                </tr>
                <tr>
                  <td>Mobile OS keychain</td>
                  <td>Mainly a compromised device</td>
                  <td>The right place on native apps, not plain app storage</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="sim-card">
          <h3>What catches people in production</h3>
          <ul className="t">
            <li>
              <b>Trusting the token's own <code>alg</code> header.</b> Attacks use <code>alg: none</code>, or swap an RSA public key in as an HMAC
              secret. Pin the allowed algorithms in your code, and use a maintained library.
            </li>
            <li>
              <b>Not checking <code>aud</code> and <code>iss</code>.</b> Otherwise a token issued for one service can be replayed against another.
            </li>
            <li>
              <b>Logout that only clears the client.</b> The app forgets the token, and a stolen copy keeps working. It looks like logout, and it
              isn't revocation.
            </li>
            <li>
              <b>Stale claims.</b> A role or a "frozen" flag inside a token stays true until it expires. Keep tokens to identity, and read anything
              that changes from a live source when it matters, especially before moving money.
            </li>
            <li>
              <b>Growing tokens.</b> A JWT is sent on every request, and a large one can exceed header size limits at proxies.
            </li>
            <li>
              <b>Logging credentials.</b> Tokens and session IDs turn up in URLs and access logs. Keep them in headers or cookies, and scrub logs.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Authentication</dt>
          <dd>Proving who you are. Deciding what you may do is authorization, a separate question.</dd>
          <dt>Session</dt>
          <dd>A record on the server saying a given random ID belongs to a logged-in user.</dd>
          <dt>JWT</dt>
          <dd>JSON Web Token: a signed, readable statement of claims, such as who the user is and when the token expires.</dd>
          <dt>Claim</dt>
          <dd>One statement inside a token, such as <code>sub</code> for the user or <code>exp</code> for the expiry.</dd>
          <dt>Signature</dt>
          <dd>A value computed from the contents and a key. It can't be produced without the key, and it stops matching if anything changes.</dd>
          <dt>HS256 / ES256</dt>
          <dd>Signing algorithms. HS256 uses one shared secret for signing and checking. ES256 signs with a private key and checks with a public one.</dd>
          <dt>Base64</dt>
          <dd>A way of writing bytes as text. It's an encoding, not encryption, and anyone can reverse it.</dd>
          <dt>Stateless</dt>
          <dd>The server keeps no per-user record between requests.</dd>
          <dt>Revocation</dt>
          <dd>Cancelling a credential before its natural end.</dd>
          <dt>Access token</dt>
          <dd>The short-lived token sent on each request.</dd>
          <dt>Refresh token</dt>
          <dd>A longer-lived credential, checked against a store, used only to get new access tokens.</dd>
          <dt>Revocation feed</dt>
          <dd>A stream of "these users' older tokens are no longer valid", pushed to every server and held in memory.</dd>
          <dt>Phantom token</dt>
          <dd>Clients hold an opaque ID, and a gateway swaps it for a JWT for internal services.</dd>
          <dt>SSO session</dt>
          <dd>The login server's record that a user is logged in. SSO stands for single sign-on, because several applications can share this one login.</dd>
          <dt>Back-channel logout</dt>
          <dd>The login server calls your backend directly to say a session has ended, without going through the browser.</dd>
          <dt>Token introspection</dt>
          <dd>Asking the login server whether a token is still active, instead of only checking its signature.</dd>
          <dt>Offline token</dt>
          <dd>A Keycloak refresh token that stays valid after logout, for work that runs while the user is away.</dd>
          <dt>Forced-logout timestamp</dt>
          <dd>A time stored per user. Any token issued before it is rejected, even with a valid signature.</dd>
          <dt>Token revocation list</dt>
          <dd>A list of specific revoked tokens, usually by their <code>jti</code>, also called a denylist.</dd>
          <dt>iat / jti</dt>
          <dd>Standard JWT claims: <code>iat</code> is when the token was issued, and <code>jti</code> is its unique ID.</dd>
          <dt>XSS / CSRF</dt>
          <dd>XSS is an attacker's script running in your page, which can read anything JavaScript can. CSRF tricks a browser into sending a request with its cookies.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Explain it in a design review</h2>
        <div className="sim-say">
          "It comes down to where the state lives, and how fast I can revoke. For a web app with its own backend, I'd start with sessions: a secure
          HttpOnly cookie holding a random ID, in a replicated store. It costs one cheap lookup per request, and in return one delete logs someone out
          everywhere. I'd reach for JWTs when many services or other organizations need to verify a caller without sharing a store. A JWT can't be
          cancelled by itself, so I'd keep it around 15 minutes with a refresh token I can delete, which bounds the damage. If that window isn't
          acceptable, as with moving money, I'd push a small revocation list to every service. At that point I'd be honest that it isn't stateless any
          more, and compare it with just using sessions."
        </div>
        <p className="sim-muted sim-small">
          Questions reviewers ask. "How do you log someone out of a JWT system?" End the session or delete the refresh token, so no new tokens are issued. Then
          either accept the wait until expiry, publish a revocation, or store a per-user logout time in Redis and reject tokens issued before it. Clearing the token
          on the client isn't enough. "HS256 or RS256?" With many services, use asymmetric signing, so that only
          the auth service can mint tokens. "Should the JWT hold permissions?" Keep it to identity, or accept that those permissions go stale
          until it expires. "Where would you store it in a browser?" In an HttpOnly cookie with CSRF protection, not in localStorage, where
          any XSS can copy it.
        </p>
      </section>

      <div className="sim-footer">
        The simulation is deterministic and simplified. The account belongs to one user, the two servers take turns by a fixed rule, and the times are
        illustrative. The revocation feed is shown arriving immediately, while real ones take about a second or more. The JWT in Part 1 is a genuine HS256
        token with a demo key. Part 3 labels tokens with short IDs instead of showing full strings. Revoking sessions by user assumes an index of sessions per user.
      </div>
    </div>
  )
}
