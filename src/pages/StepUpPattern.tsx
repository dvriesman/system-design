import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import StepUpLab from './StepUpLab'
import {
  build,
  checks,
  clockText,
  CODE,
  EXPERIMENTS,
  fmt,
  lineRef,
  verdictIsBad,
  verdictText,
  type Actor,
  type Mode,
  type Pane,
  type Step,
  type Token,
} from './stepUpSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'login', label: '1 · Login only' },
  { id: 'ui', label: '2 · A prompt on the screen' },
  { id: 'acr', label: '3 · API requires a level' },
  { id: 'recent', label: '4 · + must be recent' },
  { id: 'bound', label: '5 · + this exact payment' },
]
const ACTOR_NAME: Record<Actor, string> = { cons: "Alice's app", svc: 'Bank API', relay: 'Login server', migrator: 'Attacker' }
const PANES: { id: Pane; cls: string; title: string }[] = [
  { id: 'client', cls: 'cons', title: "Alice's app" },
  { id: 'api', cls: 'svc', title: 'Bank API' },
  { id: 'auth', cls: 'relay', title: 'Login server' },
  { id: 'evil', cls: 'migrator', title: 'Attacker · a malicious browser extension' },
]

function tokenRows(t: Token): [string, string][] {
  const rows: [string, string][] = [
    ['id', t.id],
    ['acr', t.acr],
    ['auth_time', clockText(t.authTime)],
  ]
  if (t.approved) rows.push(['approved', `${fmt(t.approved.amount)} to ${t.approved.to}`], ['txn', t.txn ?? ''])
  return rows
}

function TokenCard({ title, token }: { title: string; token: Token | null }) {
  return (
    <div className="sim-store">
      <h3>
        <span>{title}</span>
      </h3>
      {token ? (
        <div className="sim-tw">
          <table>
            <tbody>
              {tokenRows(token).map(([name, value]) => (
                <tr key={name}>
                  <td>{name}</td>
                  <td>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sim-empty">no token yet</div>
      )}
    </div>
  )
}

export default function StepUpPattern() {
  const [mode, setMode] = useState<Mode>('login')
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

  function lineLabel(st: Step): string {
    if (!st.line) return st.label
    return `${lineRef(st.line, mode)} ${st.label}`
  }

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Security: Authentication &amp; Authorization · Step-Up Authentication</div>
        <h1>Step-Up Authentication</h1>
        <p className="sim-lede">
          A second factor at login protects the moment you arrive. Step-up protects the moment that matters: it asks for more proof in the middle of a
          session, right when someone tries to move money. The page takes this one question at a time.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">How does the API ask for more?</a> Follow one payment through each design, then play the API yourself.
          </li>
          <li>
            <a href="#part2">When should you ask?</a> Concrete cases, including when not to, and how this differs from a second factor at login.
          </li>
          <li>
            <a href="#part3">What happens when tokens are stolen?</a> A step-by-step debugger, then <a href="#keycloak">how to do it with Keycloak</a> and{' '}
            <a href="#real">how to build it for real</a>.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 3</div>
        <h2 id="p1">How does the API ask for more?</h2>
        <p className="sim-lede">
          Nothing is under attack here yet. Go through the tabs in order, and watch the panel asking whether a stolen token could withdraw money.
        </p>
        <StepUpLab />
        <div className="sim-say">
          <b>The idea in one sentence.</b> The API decides how much proof each action needs, and when a token doesn't have enough, it says exactly what's
          missing, so the app can get it without logging the user out.
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Login only</th>
                <th>The API challenges</th>
                <th>Approve this payment</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>The question asked</b>
                </td>
                <td>Is this token valid?</td>
                <td>Was the login strong and recent enough?</td>
                <td>Did Alice approve this amount to this payee?</td>
              </tr>
              <tr>
                <td>
                  <b>A stolen token can</b>
                </td>
                <td>Do anything, until it expires</td>
                <td>Do anything, for a few minutes after each approval</td>
                <td>Only make the payment she approved</td>
              </tr>
              <tr>
                <td>
                  <b>Standard</b>
                </td>
                <td>None needed</td>
                <td>RFC 9470</td>
                <td>RFC 9396 can carry the details. The rule itself is your design</td>
              </tr>
              <tr>
                <td>
                  <b>Friction</b>
                </td>
                <td>None after login</td>
                <td>One prompt, then none for a few minutes</td>
                <td>One prompt per payment</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="part2" aria-labelledby="p2" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 3</div>
        <h2 id="p2">When should you ask?</h2>
        <p className="sim-lede">
          Asking on every action trains people to approve without reading, and asking only at login leaves the riskiest actions unprotected. Ask at the moments
          when a mistake is expensive or hard to undo.
        </p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Case: withdrawals and transfers</h3>
            <p>
              <b>Yes, and bind it to the payment.</b> Money that has left is hard to get back, so show the amount and the payee, and approve that one payment. In
              the EU, this is a legal requirement for many remote payments: the rule is called dynamic linking.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: adding a new payee</h3>
            <p>
              <b>Yes.</b> Attackers often add their own account first, so that the later transfers look routine. Asking here protects every payment that follows.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: changing a phone number, email or password</h3>
            <p>
              <b>Yes, and usually with a recent login.</b> These are the keys to account recovery. An attacker who changes them can lock the real owner out, and can
              intercept the next second factor.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: staff exporting customer data</h3>
            <p>
              <b>Yes, with a recent check.</b> A recent, strong login suits actions without one specific amount. For the riskiest actions, add a second person, which
              is the Maker-Checker pattern, later on this roadmap.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: viewing a balance</h3>
            <p>
              <b>Usually no.</b> Ordinary reads should stay smooth. That's the point of step-up: a login can stay fairly light, and the friction appears only when it's
              worth it. Sensitive reads, such as full statements, can be a middle level.
            </p>
          </div>
        </div>
        <h3>Second factor at login, or step-up?</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Second factor at login</th>
                <th>Step-up</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>When it happens</b>
                </td>
                <td>Once, as the session starts</td>
                <td>In the middle of a session, when an action needs it</td>
              </tr>
              <tr>
                <td>
                  <b>Who triggers it</b>
                </td>
                <td>The login server</td>
                <td>The API, based on what is being requested</td>
              </tr>
              <tr>
                <td>
                  <b>What it stops</b>
                </td>
                <td>A stolen password</td>
                <td>A stolen token or session, and a session left open</td>
              </tr>
              <tr>
                <td>
                  <b>What it doesn't stop</b>
                </td>
                <td>Theft of the token issued afterwards</td>
                <td>On its own, a stolen password at login</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="sim-small">They solve different problems, so most banks need both. A step-up can use the same factor, such as a passkey or a phone approval.</p>
        <div className="sim-card">
          <h3>Three myths worth dropping</h3>
          <ul className="t">
            <li>
              <b>"We have a second factor at login, so we're covered."</b> That second factor protects the login, and everything afterwards rests on a token. Mode 3
              below shows a token saying "mfa" hours later.
            </li>
            <li>
              <b>"The app asks for a code before a withdrawal."</b> If the API doesn't check it, that prompt protects nothing. Anyone calling the API directly never
              sees it.
            </li>
            <li>
              <b>"A short step-up window is safe."</b> A 5-minute window is safest against tokens stolen earlier. It does nothing against malware that waits for the moment
              right after an approval.
            </li>
          </ul>
        </div>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 3 of 3</div>
        <h2 id="p3">What happens when tokens are stolen?</h2>
        <p className="sim-lede">
          The same day runs through every mode. Alice logs in with her password, pays her rent, and pays a bill six hours later. A malicious browser extension copies
          every token and tries to withdraw $5,000 three times: right after login, hours after her approval, and just after her next approval. Click a gutter dot to also
          kill a process before that line.
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
                className={`sim-chip ${st.actor && st.actor !== 'system' ? st.actor : ''} ${st.crash ? 'crash' : ''} ${i < safeCur ? 'done' : ''} ${
                  i === safeCur ? 'cur' : ''
                }`}
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
                <span>Alice's account</span>
                <span className="sim-tag">{clockText(s.clock)}</span>
              </h3>
              <div className={`sim-tx-reader ${s.stolen ? 'short' : 'ok'}`}>
                {fmt(s.balance)}
                <span>{s.stolen ? `${fmt(s.stolen)} taken by the attacker` : 'nothing stolen'}</span>
              </div>
            </div>

            <div className="sim-store">
              <h3>
                <span>Alice's phone shows</span>
              </h3>
              {s.phone ? <div className="sim-jwt-token">{s.phone}</div> : <div className="sim-empty">no prompt yet</div>}
            </div>

            <TokenCard title="Token in Alice's app" token={s.app} />
            <TokenCard title="Token the attacker copied" token={s.attacker} />

            <div className="sim-store">
              <h3>
                <span>Ledger · payments made</span>
              </h3>
              {s.ledger.length ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>key</th>
                        <th>amount</th>
                        <th>to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.ledger.map((r) => (
                        <tr key={r.key} className={r.by === 'Attacker' ? 'dupe' : ''}>
                          <td>{r.key}</td>
                          <td>{fmt(r.amount)}</td>
                          <td>{r.to}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">no rows</div>
              )}
            </div>

            {mode === 'bound' ? (
              <div className="sim-store">
                <h3>
                  <span>Approvals already used</span>
                </h3>
                {s.usedApprovals.length ? <div className="sim-jwt-token">{s.usedApprovals.join(', ')}</div> : <div className="sim-empty">no rows</div>}
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
            <h3>Login alone treats every action the same</h3>
            <p>A token that can read a balance can also empty the account. Whoever gets that token gets everything, and nothing about the request looks unusual.</p>
          </div>
          <div className="sim-card">
            <h3>A check on a screen isn't a check</h3>
            <p>
              Alice saw prompts all day, and the bank could report that it "has step-up". But the API never learned the outcome, and an attacker doesn't use your screens. The
              rule has to live where the money moves.
            </p>
          </div>
          <div className="sim-card">
            <h3>Requiring a level helps, but tokens don't age</h3>
            <p>
              The login token is now refused. But RFC 9470 says <code>acr</code> and <code>auth_time</code> stay the same when a token is renewed. A second factor from this morning
              still says "mfa" this afternoon, unless something checks when it happened.
            </p>
          </div>
          <div className="sim-card">
            <h3>Recency shrinks the window, and leaves one open</h3>
            <p>
              With <code>max_age</code>, old tokens get challenged, so stealing a token now works only for minutes. But an attacker in the browser can wait for those minutes. The approval
              said "it's me", and it's being used for something else.
            </p>
          </div>
          <div className="sim-card">
            <h3>Binding the approval to the payment closes it</h3>
            <p>
              The token now approves one amount to one payee, once. Stealing it gains nothing else, and a prompt asking for a different payment shows Alice the attacker's real account.
              The price is one prompt per payment.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Each fix moves the responsibility somewhere</h3>
          <ul className="t">
            <li>
              <b>Binding</b> moves the decision to Alice, and she has to read the prompt. If a fraudster talks her into paying them, every check here passes, because she really did
              approve that payment. That takes fraud monitoring and payee warnings, not authentication.
            </li>
            <li>
              <b>The prompt must be shown somewhere the attacker doesn't control.</b> If malware can change what the screen shows, she could approve the wrong thing. That's why a
              separate device or a trusted OS screen matters, and why this page's prompt is on her phone.
            </li>
            <li>
              <b>The second factor itself</b> can be phished or fatigued. A code typed into a fake site works for the attacker too. The strength of the factor is the subject of the
              Multi-Factor Authentication pattern, later on this roadmap.
            </li>
            <li>
              <b>The login server</b> must be trusted to enforce the level. Parameters like <code>acr_values</code> travel in a URL and can be edited, so the API must check the claims in the
              token, and never assume that what it asked for was what happened.
            </li>
            <li>
              <b>Retries</b> still need <Link to="/patterns/finance/idempotency-keys">Idempotency Keys</Link>. A crash after the debit would otherwise pay twice, or burn the approval with no
              payment. In mode 5, the debit and using the approval share one transaction for that reason.
            </li>
          </ul>
        </div>
      </section>

      <section id="keycloak" aria-labelledby="k1" className="sim-section">
        <h2 id="k1">How to do it with Keycloak</h2>
        <p className="sim-lede">
          Keycloak handles the login server's half, using levels of authentication. Your API still has to do the other half: decide what each action needs, send the challenge, and check the
          token.
        </p>
        <div className="sim-card">
          <h3>1. Map names to levels, and build the flow</h3>
          <p>
            In the realm settings, map each ACR name to a number. Then build a browser flow where each level is a conditional sub-flow, using the <b>Conditional - Level Of Authentication</b>{' '}
            condition. Keycloak's documentation uses names such as <code>silver</code> and <code>gold</code>. In this page's terms, they correspond to <code>pwd</code> and <code>mfa</code>.
          </p>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th>ACR name</th>
                  <th>LoA</th>
                  <th>Asks for</th>
                  <th>Max Age</th>
                  <th>What that means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <code>silver</code>
                  </td>
                  <td>1</td>
                  <td>Password</td>
                  <td>36000</td>
                  <td>Valid for 10 hours, so she isn't asked again</td>
                </tr>
                <tr>
                  <td>
                    <code>gold</code>
                  </td>
                  <td>2</td>
                  <td>Second factor</td>
                  <td>300</td>
                  <td>Valid for 5 minutes, then she's asked again. A value of 0 means this single authentication only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="sim-card">
          <h3>2. Connect the challenge to the login request</h3>
          <pre className="sim-block">{`// Your API answers, following RFC 9470
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="insufficient_user_authentication",
  error_description="A different authentication level is required",
  acr_values="gold"

// Your app turns that into a login request. acr_values is non-essential:
https://login.bank.example/realms/bank/protocol/openid-connect/auth
  ?client_id=bank-app&response_type=code&scope=openid
  &redirect_uri=...&state=...&code_challenge=...&code_challenge_method=S256
  &acr_values=gold

// To make it essential, so that Keycloak errors if it can't meet the level:
  &claims={"id_token":{"acr":{"essential":true,"values":["gold"]}}}

// Your API then checks the new access token
{ "sub": "...", "acr": "gold", "auth_time": 1793000000, ... }`}</pre>
        </div>
        <div className="sim-card">
          <h3>What to watch for with Keycloak</h3>
          <ul className="t">
            <li>
              <b>Keycloak doesn't check your API for you.</b> Its documentation warns that <code>acr_values</code> can be changed by the user in the URL, and tells clients to verify the{' '}
              <code>acr</code> claim. Your API should do that on every sensitive call.
            </li>
            <li>
              <b>The challenge is yours to write.</b> The parts of the Keycloak admin guide checked for this page don't mention RFC 9470 or <code>insufficient_user_authentication</code>, so plan on your API
              producing that response itself, and your client handling it.
            </li>
            <li>
              <b>A level can expire.</b> Keycloak returns a lower level once the higher one's Max Age has passed, so check <code>acr</code> rather than assuming the last level still holds.
            </li>
            <li>
              <b>Check <code>auth_time</code> in your own access tokens.</b> Mode 4 needs it, so confirm it's present before you rely on it. You can also ask for fresh authentication using{' '}
              <code>max_age</code> on the login request.
            </li>
            <li>
              <b>Binding to a payment is mostly yours to build.</b> The parts of the admin guide checked for this page don't mention Rich Authorization Requests, so confirm this for your version. A common
              alternative is your own approval service, with an authenticator that displays the payment.
            </li>
          </ul>
        </div>
      </section>

      <section id="real" aria-labelledby="r1" className="sim-section">
        <h2 id="r1">How do you build this for real?</h2>
        <p className="sim-lede">The debugger shows the logic. These are the details that decide whether a real implementation is safe.</p>
        <div className="sim-card">
          <h3>The API</h3>
          <pre className="sim-block">{`val RULES = mapOf(
  "balance:read"    to Requirement(acr = "pwd"),
  "statement:read"  to Requirement(acr = "mfa", maxAgeSeconds = 3600),
  "payee:add"       to Requirement(acr = "mfa", maxAgeSeconds = 300),
  "withdrawal:make" to Requirement(acr = "mfa", maxAgeSeconds = 300, boundToPayment = true))

fun enforce(action, claims, payment): Response? {
  val rule = RULES.getValue(action)     // an unknown action fails, rather than allowing it

  val missingLevel = levelOf(claims.acr) < levelOf(rule.acr)
  val tooOld = rule.maxAgeSeconds != null && now - claims.auth_time > rule.maxAgeSeconds
  if (missingLevel || tooOld) return challenge401(
    acrValues = if (missingLevel) rule.acr else null,
    maxAge = rule.maxAgeSeconds)

  if (rule.boundToPayment && claims.approved != payment.amountAndPayee()) return approvalNeeded403(payment)
  return null   // allowed, and the handler debits and uses the approval in one transaction
}`}</pre>
          <p className="sim-small">
            Compare levels using your own ordering, because <code>acr</code> values are just names. A token with a higher level should satisfy a lower requirement.
          </p>
        </div>
        <div className="sim-card">
          <h3>The client</h3>
          <pre className="sim-block">{`suspend fun callWithStepUp(request): Response {
  val response = api.send(request, currentToken())
  val challenge = response.parseStepUpChallenge() ?: return response

  // the same login flow as ever, with PKCE, plus what the API asked for
  val token = auth.login(acrValues = challenge.acrValues, maxAge = challenge.maxAge)

  // keep the ordinary token too, and use this one only for what needed it
  return api.send(request, token)
}`}</pre>
          <p className="sim-small">
            RFC 9470 says clients must not inspect the access token to read these values, and don't need to: the challenge says what's needed. Repeat the original request with the same idempotency key.
            See <Link to="/patterns/security/oauth-pkce">OAuth + PKCE</Link> for the login flow.
          </p>
        </div>
        <div className="sim-card">
          <h3>What catches people in production</h3>
          <ul className="t">
            <li>
              <b>Prompt fatigue.</b> If every small action prompts, people stop reading. Limit prompts to what matters, limit how often anyone can trigger one, and show what's being approved.
            </li>
            <li>
              <b>An attacker can trigger prompts.</b> Rate-limit them per user, and alert on repeated declines, because they are a strong signal of a stolen token.
            </li>
            <li>
              <b>Comparing the display and the request.</b> Hash or sign the amount and the payee, and check that what was approved is what's being executed. Any change has to invalidate the approval.
            </li>
            <li>
              <b>Forgetting the side doors.</b> Batch uploads, standing orders, partner APIs and support tools can all move money. Put the rule where the money moves, not in one endpoint.
            </li>
            <li>
              <b>Downgrading after failure.</b> If the second factor service is down, the safe answer for money is to refuse. A "temporarily skip the check" switch is what attackers look for.
            </li>
            <li>
              <b>Account recovery.</b> If a support call or an email link can replace the second factor, that's your real strength. Protect recovery at least as strongly as the action.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Step-up authentication</dt>
          <dd>Asking for stronger or more recent proof in the middle of a session, because of what the user is trying to do.</dd>
          <dt>Second factor</dt>
          <dd>A proof of a different kind from a password, such as a phone approval or a passkey.</dd>
          <dt>acr</dt>
          <dd>Authentication Context Class Reference: a claim naming how strong the authentication was.</dd>
          <dt>auth_time</dt>
          <dd>A claim saying when the user really authenticated. It doesn't change when a token is renewed.</dd>
          <dt>Challenge</dt>
          <dd>A response saying what's missing. RFC 9470 uses a 401 with the error <code>insufficient_user_authentication</code>.</dd>
          <dt>max_age</dt>
          <dd>The longest time since the user authenticated that is still acceptable, in seconds.</dd>
          <dt>LoA</dt>
          <dd>Level of Authentication: Keycloak's numeric level, which an ACR name maps to.</dd>
          <dt>Dynamic linking</dt>
          <dd>An EU payments rule: the authentication is specific to the amount and the payee, and any change invalidates it.</dd>
          <dt>Rich Authorization Requests</dt>
          <dd>RFC 9396: a standard way to carry details, such as a payment, in OAuth messages.</dd>
          <dt>Prompt fatigue</dt>
          <dd>Approving prompts without reading them, because there are too many of them.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Say it in the interview</h2>
        <div className="sim-say">
          "A second factor at login protects the login, but everything afterwards rests on a token. So for sensitive actions I'd have the API decide how much proof each one needs. RFC 9470 gives a standard way to
          do this: the token carries acr and auth_time, and when they aren't enough, the API returns a 401 with insufficient_user_authentication, plus acr_values or max_age. The client sends the user through the
          login server for just that, and repeats the request. The check has to be in the API, not on a screen. For money, strong and recent still leaves a window, so I'd bind the approval to the exact amount and
          payee, show those on the user's device, and use it once, in the same transaction as the debit. That's dynamic linking in EU payments. I'd also limit prompts, so people keep reading them."
        </div>
        <p className="sim-muted sim-small">
          Follow-up they may ask: "How is this different from MFA?" MFA is about what proof you use, and step-up is about when you ask for it. Follow-up #2: "Why not just keep the token short-lived?" Because renewal keeps the
          original acr and auth_time, so a short token doesn't mean a recent login. Follow-up #3: "What happens if the second factor service is down?" For money, refuse, and let reads continue. Follow-up #4: "Does this stop social
          engineering?" No. If the user really approves a payment to a fraudster, every check passes, so you also need payee warnings and fraud monitoring.
        </p>
      </section>

      <div className="sim-footer">
        The simulation is deterministic and simplified. Every withdrawal needs a step-up here, while real rules usually depend on the amount and the payee. The attacker tries the same $5,000 each time, for easy comparison. Tokens are
        labelled with short IDs. Refresh is shown once, at the six-hour mark, and token expiry is left out otherwise. In mode 5, a real system would usually issue a separate token for the approval and keep the ordinary one. The 5-minute window is an example.
        Sources: RFC 9470, RFC 9396, Commission Delegated Regulation (EU) 2018/389 Article 5, and the Keycloak Server Administration Guide.
      </div>
    </div>
  )
}
