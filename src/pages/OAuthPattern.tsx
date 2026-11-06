import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import OAuthLab from './OAuthLab'
import {
  build,
  checks,
  CODE,
  EXPERIMENTS,
  lineRef,
  redirectUriFor,
  verdictIsBad,
  verdictText,
  type Actor,
  type Mode,
  type Pane,
  type Step,
} from './oauthSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'implicit', label: '1 · Token in the redirect' },
  { id: 'code', label: '2 · Code, no proof' },
  { id: 'secret', label: '3 · + secret in the app' },
  { id: 'pkce', label: '4 · + PKCE' },
  { id: 'verified', label: '5 · + verified redirect' },
]
const ACTOR_NAME: Record<Actor, string> = { cons: 'Budget app', svc: 'Bank', migrator: 'Malicious app' }
const PANES: { id: Pane; cls: string; title: string }[] = [
  { id: 'app', cls: 'cons', title: "Budget app · on Alice's phone" },
  { id: 'bank', cls: 'svc', title: 'Bank · login, tokens and API' },
  { id: 'evil', cls: 'migrator', title: "Malicious app · on Alice's phone" },
]

export default function OAuthPattern() {
  const [mode, setMode] = useState<Mode>('implicit')
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
  const hasCodes = mode !== 'implicit'
  const hasChallenge = mode === 'pkce' || mode === 'verified'

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

  const appRows: [string, string | null][] = [
    ['state', s.app.state],
    ['verifier', s.app.verifier],
    ['token', s.app.token],
  ]
  const evilRows: [string, string | null][] = [
    ['client secret', s.evil.secret ? `${s.evil.secret}…` : null],
    ['code', s.evil.code],
    ['its own verifier', s.evil.verifier],
    ['token', s.evil.token],
  ]
  const appHeld = appRows.filter(([, v]) => v)
  const evilHeld = evilRows.filter(([, v]) => v)

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Security: Authentication &amp; Authorization · OAuth 2.0 Authorization Code + PKCE</div>
        <h1>OAuth 2.0 Authorization Code + PKCE</h1>
        <p className="sim-lede">
          How can an app read your bank transactions without ever knowing your bank password? That's the question OAuth answers. The page
          takes it one idea at a time: first the flow itself, then when to use it, then what happens when a malicious app tries to get in.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">How can an app act for you without your password?</a> Step through the flow, then try to redeem a stolen code.
          </li>
          <li>
            <a href="#part2">When do you need this?</a> Concrete cases, including when you don't.
          </li>
          <li>
            <a href="#part3">What happens when another app attacks it?</a> A step-by-step debugger, then{' '}
            <a href="#real">how to build it for real</a>.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 3</div>
        <h2 id="p1">How can an app act for you without your password?</h2>
        <p className="sim-lede">
          Nothing is under attack here yet. Go through the three tabs in order: each one fixes the problem the previous one leaves behind.
        </p>
        <OAuthLab />
        <div className="sim-say">
          <b>The idea in one sentence.</b> The browser carries only a short-lived code, because URLs leak, and the real token is handed over on a
          direct call to whoever can prove they started the login.
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Share the password</th>
                <th>Authorization code</th>
                <th>Code + PKCE</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Does the app see the password?</b>
                </td>
                <td>Yes, and it keeps it</td>
                <td>No</td>
                <td>No</td>
              </tr>
              <tr>
                <td>
                  <b>Can access be limited?</b>
                </td>
                <td>No: all or nothing</td>
                <td>Yes: scopes</td>
                <td>Yes: scopes</td>
              </tr>
              <tr>
                <td>
                  <b>Can one app be removed?</b>
                </td>
                <td>Only by changing the password</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>
                  <b>What redeems the code?</b>
                </td>
                <td>There is no code</td>
                <td>The code + a client secret on a server</td>
                <td>The code + a verifier made for this login</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="part2" aria-labelledby="p2" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 3</div>
        <h2 id="p2">When do you need this?</h2>
        <p className="sim-lede">
          OAuth is for when one party holds the user's data or login, and a different piece of software needs to act for that user. If you own the
          login form and the backend, and nothing else needs access, you may not need it at all.
        </p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Case: open banking</h3>
            <p>
              <b>Yes, this is the classic case.</b> A budgeting or lending app needs to read a customer's transactions at another bank. Sharing
              passwords with third parties is exactly what you need to avoid, and scopes let the customer grant read-only access and withdraw it
              later.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: your own mobile banking app</h3>
            <p>
              <b>Often yes.</b> The app is yours, but sending logins through a system browser and your login server keeps passwords out of the app.
              It also lets you add a second factor or a new login method without shipping an app update. Use PKCE, because the app can't hold a
              secret.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: a web app with its own login</h3>
            <p>
              <b>Often no.</b> One organization, one backend and a login form don't need a delegation protocol. A{' '}
              <Link to="/patterns/security/sessions-vs-jwts">secure session cookie</Link> is simpler. Consider OAuth when you want one login shared
              across several apps, or when you're using an external identity provider.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: a nightly job calling another service</h3>
            <p>
              <b>A different flow.</b> No user is present, so nobody can approve anything, and there's no redirect to protect. That's the client
              credentials grant: the service authenticates as itself.
            </p>
          </div>
        </div>
        <h3>Which flow fits?</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>The client is</th>
                <th>Can it keep a secret?</th>
                <th>Use</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>A web app with its own server</td>
                <td>Yes, on the server</td>
                <td>Authorization code, a client secret and PKCE</td>
              </tr>
              <tr>
                <td>A mobile or desktop app</td>
                <td>No</td>
                <td>Authorization code + PKCE, through the system browser</td>
              </tr>
              <tr>
                <td>A single-page app in the browser</td>
                <td>No</td>
                <td>Best through its own small backend, which holds the tokens. Otherwise code + PKCE</td>
              </tr>
              <tr>
                <td>A TV or a command-line tool</td>
                <td>No, and typing is hard</td>
                <td>Device authorization: the user approves on another device</td>
              </tr>
              <tr>
                <td>A service, with no user present</td>
                <td>Yes</td>
                <td>Client credentials</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sim-card">
          <h3>Three myths worth dropping</h3>
          <ul className="t">
            <li>
              <b>"OAuth logs users in."</b> By itself, it doesn't. An access token says an app may do something, and it isn't meant to tell that app
              who is present. Login is what OpenID Connect adds on top, and it comes later on this roadmap.
            </li>
            <li>
              <b>"PKCE is only for mobile apps."</b> It started there, but current security guidance recommends it for web apps with secrets too, and
              requires it for apps without them.
            </li>
            <li>
              <b>"PKCE proves which app is calling."</b> It proves that whoever redeems the code also started the login. Part 3 shows why that's
              a different thing.
            </li>
          </ul>
        </div>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 3 of 3</div>
        <h2 id="p3">What happens when another app attacks it?</h2>
        <p className="sim-lede">
          The same story runs through every mode. Alice connects a budgeting app on her phone, and a malicious app on the same phone tries two
          things: catching her redirect, and starting a login of its own in the budget app's name. Click a gutter dot to also kill a process just
          before that line.
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
                  <span>Browser address bar</span>
                  <span className="sim-tag">treat everything here as public</span>
                </h3>
                {s.url ? <div className="sim-jwt-token">{s.url}</div> : <div className="sim-empty">no page open</div>}
              </div>

            <div className="sim-store">
              <h3>
                <span>Alice's transactions</span>
              </h3>
              <div className={`sim-tx-reader ${s.readByEvil ? 'short' : 'ok'}`}>
                {s.readByEvil ? `Read ${s.readByEvil} time${s.readByEvil === 1 ? '' : 's'} by the malicious app` : 'Not read by the malicious app'}
                <span>Read by the budget app: {s.readByApp}</span>
              </div>
            </div>

            <div className="sim-store">
              <h3>
                <span>Who can receive the redirect?</span>
              </h3>
              <div className="sim-empty">
                {mode === 'verified'
                  ? `${redirectUriFor(mode)}: only the budget app, because it proved to the OS that it owns the domain.`
                  : `${redirectUriFor(mode)}: both apps registered it, and the OS doesn't guarantee which one receives it.`}
              </div>
            </div>

            <div className="sim-store">
              <h3>
                <span>Budget app holds</span>
              </h3>
              {appHeld.length ? (
                <div className="sim-tw">
                  <table>
                    <tbody>
                      {appHeld.map(([name, value]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">nothing yet</div>
              )}
            </div>

            <div className="sim-store">
              <h3>
                <span>Malicious app holds</span>
              </h3>
              {evilHeld.length ? (
                <div className="sim-tw">
                  <table>
                    <tbody>
                      {evilHeld.map(([name, value]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">nothing yet</div>
              )}
            </div>

            {hasCodes ? (
              <div className="sim-store">
                <h3>
                  <span>Bank · authorization codes</span>
                </h3>
                {s.codes.length ? (
                  <div className="sim-tw">
                    <table>
                      <thead>
                        <tr>
                          <th>code</th>
                          {hasChallenge ? <th>challenge</th> : null}
                          <th>used</th>
                          <th>really started by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.codes.map((c) => (
                          <tr key={c.code}>
                            <td>{c.code}</td>
                            {hasChallenge ? <td>{c.challenge}</td> : null}
                            <td>{c.used ? 'yes' : 'no'}</td>
                            <td>{c.startedBy}</td>
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
                <span>Bank · tokens issued to client budget-app</span>
              </h3>
              {s.tokens.length ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>token</th>
                        <th>status</th>
                        <th>really held by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.tokens.map((t) => (
                        <tr key={t.token} className={t.revoked ? 'pend' : ''}>
                          <td>{t.token}</td>
                          <td>{t.revoked ? 'revoked' : 'active'}</td>
                          <td>{t.holder}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">no rows</div>
              )}
              <p className="sim-small">The bank's own records don't include the last column in the codes and tokens tables. It's shown here so you can see what the bank can't.</p>
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
            <h3>A token in a URL is a token anyone can use</h3>
            <p>
              The implicit flow skipped the code to save a round trip, back when browsers couldn't easily make that second call. A working credential
              then passes through the browser, where history, logs and other apps can pick it up. Current guidance says not to use it.
            </p>
          </div>
          <div className="sim-card">
            <h3>A code helps only if redeeming it needs proof</h3>
            <p>
              Moving to a code keeps tokens out of URLs, and that part is a real gain. But if the code is all the bank asks for, catching the redirect
              is as good as catching the token, one step later.
            </p>
          </div>
          <div className="sim-card">
            <h3>A secret shipped to everyone isn't a secret</h3>
            <p>
              A client secret works on a server because only that server has it. In a public app, it passes the check and proves nothing, while making
              the design look safer than it is. Register apps like this as public clients, with no secret.
            </p>
          </div>
          <div className="sim-card">
            <h3>PKCE makes a caught code useless</h3>
            <p>
              Each login creates its own secret, which isn't in the app's download and doesn't appear in any URL. A thief who catches the redirect has
              a code they can't redeem. This is a major gain, and it's required for public clients.
            </p>
          </div>
          <div className="sim-card">
            <h3>A verified redirect closes the disguise</h3>
            <p>
              PKCE can't tell apps apart, because anyone can start a login with their own verifier. What helps is making sure the answer can only reach
              the real app. With an https redirect that the OS verifies against a domain, a login started by another app ends up at the real app, which
              discards it.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Each fix moves the responsibility somewhere</h3>
          <ul className="t">
            <li>
              <b>The verified redirect</b> moves trust to the OS, and to your domain. The check is only as good as the OS's domain verification, and on a
              compromised phone, none of this holds. It also depends on your association file staying correct and your domain staying yours.
            </li>
            <li>
              <b>The state check</b> is your app's job. If it skips this, a code that the app never asked for gets accepted. Here, that's what discards
              the disguised login in mode 5.
            </li>
            <li>
              <b>Consent</b> moves part of the decision to Alice. If an attacker registers their own app under a convincing name, every check on this
              page passes, because that app really is what it says it is. Reviewing who can register, and showing clear consent screens, is a separate
              job for the bank. This is known as consent phishing.
            </li>
            <li>
              <b>Tokens are still bearer credentials.</b> None of this protects a token after it's issued. See{' '}
              <Link to="/patterns/security/sessions-vs-jwts">Sessions vs JWTs</Link> for what happens when one is stolen.
            </li>
          </ul>
        </div>
      </section>

      <section id="real" aria-labelledby="r1" className="sim-section">
        <h2 id="r1">How do you build this for real?</h2>
        <p className="sim-lede">
          You'll rarely write the server side yourself: use an established authorization server and a client library. Knowing these steps is how you
          configure them correctly, and how you review what they do.
        </p>
        <div className="sim-card">
          <h3>The client</h3>
          <pre className="sim-block">{`fun startLogin() {
  val state = secureRandomBase64Url(32)
  val verifier = secureRandomBase64Url(32)    // 43 to 128 characters
  val challenge = base64url(sha256(verifier)) // never use method "plain"

  // must survive the app being killed while the browser is open
  secureStorage.save("pending-login", { state, verifier })

  openSystemBrowser("https://bank.example/authorize"
    + "?response_type=code"
    + "&client_id=budget-app"
    + "&redirect_uri=" + urlEncode("https://budget.example/callback")
    + "&scope=transactions:read"
    + "&state=" + state
    + "&code_challenge=" + challenge
    + "&code_challenge_method=S256")
}

fun onCallback(url) {
  val pending = secureStorage.take("pending-login") ?: return showError()
  if (url.param("state") != pending.state) return showError()

  val response = httpPost("https://bank.example/token", form = {
    grant_type: "authorization_code",
    code: url.param("code"),
    redirect_uri: "https://budget.example/callback",
    client_id: "budget-app",
    code_verifier: pending.verifier })

  // any failure means start again: never retry the same code
  if (!response.ok) return startLogin()
  secureStorage.save("tokens", response.json)
}`}</pre>
          <p className="sim-small">
            The verifier is the first thing people forget to persist. On a phone, the OS can kill the app while the user is in the browser, and an
            in-memory verifier is then gone.
          </p>
        </div>
        <div className="sim-card">
          <h3>The authorization server</h3>
          <pre className="sim-block">{`fun token(request) {
  val row = codes.get(request.code) ?: return invalidGrant()
  if (row.expired || row.clientId != request.clientId) return invalidGrant()
  if (row.redirectUri != request.redirectUri) return invalidGrant()

  if (row.used) {                      // a replay: assume theft
    tokens.revokeIssuedFrom(row.code)
    return invalidGrant()
  }

  // refuse a verifier when the login had no challenge, which blocks a PKCE downgrade
  if (row.challenge == null && request.verifier != null) return invalidGrant()
  if (row.challenge != null &&
      !constantTimeEquals(base64url(sha256(request.verifier)), row.challenge)) return invalidGrant()

  if (row.client.isConfidential && !row.client.checkSecret(request.secret)) return invalidClient()

  codes.markUsed(row.code)             // atomically, so two racing calls can't both succeed
  return issueTokens(row.user, row.clientId, row.scope, sourceCode = row.code)
}`}</pre>
          <p className="sim-small">
            Codes should expire shortly after they're issued: the OAuth specification recommends 10 minutes at most, and many servers use far less. The
            60 seconds in the debugger is only an example.
          </p>
        </div>
        <div className="sim-card">
          <h3>By type of client</h3>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Redirect</th>
                  <th>Where tokens live</th>
                  <th>Watch out for</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Web app with a server</td>
                  <td>https on your domain</td>
                  <td>On the server, with a session cookie for the browser</td>
                  <td>Keep the secret in a secrets manager, and rotate it</td>
                </tr>
                <tr>
                  <td>Mobile app</td>
                  <td>Claimed https: Universal Links on iOS, App Links on Android</td>
                  <td>The OS keychain</td>
                  <td>Use the system browser, not an embedded web view, which could read the password</td>
                </tr>
                <tr>
                  <td>Single-page app</td>
                  <td>https, ideally to its own backend</td>
                  <td>Ideally on that backend, not in JavaScript</td>
                  <td>Any XSS can read or use tokens held in the browser</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="sim-card">
          <h3>What catches people in production</h3>
          <ul className="t">
            <li>
              <b>Loose redirect matching.</b> Wildcards or prefix checks let an attacker send the code to an address they control. The server must compare
              the whole string exactly, and every registered address must be yours: an open redirect on your own site can leak the code too.
            </li>
            <li>
              <b>Retrying a failed token request.</b> After a timeout, the code may already be used, and the bank may then revoke what it issued. Start a new
              login instead.
            </li>
            <li>
              <b>Assuming the server enforces PKCE.</b> Check that it rejects a missing or wrong verifier for your client. Many servers make it optional per
              client, and a server that accepts a verifier without a challenge can be downgraded.
            </li>
            <li>
              <b>Requesting every scope "just in case".</b> Ask for the least the app needs, and have the API enforce it. A scope that nothing checks
              is only a label on the consent screen.
            </li>
            <li>
              <b>Treating an access token as proof of login.</b> A token issued for a different app can be replayed against yours if you accept it as a login.
              Use OpenID Connect for login.
            </li>
            <li>
              <b>Tokens and codes in logs.</b> Scrub <code>code</code> and <code>state</code> from access logs, and watch for Referer headers on the callback page.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>OAuth 2.0</dt>
          <dd>A standard for letting an app access something on a user's behalf, with limited permissions, without the user's password.</dd>
          <dt>Client</dt>
          <dd>The app asking for access, such as the budget app. Confidential clients can keep a secret, and public clients can't.</dd>
          <dt>Authorization server</dt>
          <dd>The system that logs the user in, asks for consent and issues tokens. Here, that's the bank.</dd>
          <dt>Resource server</dt>
          <dd>The API holding the data, which accepts tokens. Here, also the bank.</dd>
          <dt>Scope</dt>
          <dd>A named permission that limits what a token can do, such as <code>transactions:read</code>.</dd>
          <dt>Authorization code</dt>
          <dd>A short-lived, one-time value sent through the browser, then swapped for tokens on a direct call.</dd>
          <dt>Access token</dt>
          <dd>The credential the app sends to the API. Whoever holds it can use it.</dd>
          <dt>Redirect URI</dt>
          <dd>The registered address that the authorization server sends its answer to.</dd>
          <dt>State</dt>
          <dd>A random value the client sends and checks on return, so it only accepts answers to logins it started.</dd>
          <dt>PKCE</dt>
          <dd>Proof Key for Code Exchange: the client sends a hash at the start, and the original value when redeeming the code.</dd>
          <dt>Verifier / challenge</dt>
          <dd>The random value the client keeps, and its hash, which the client sends first.</dd>
          <dt>Hash</dt>
          <dd>A one-way function: easy to compute, and not realistically reversible. S256 is PKCE's name for its SHA-256 method.</dd>
          <dt>Implicit flow</dt>
          <dd>An older flow that returns the access token directly in the redirect. Current guidance says not to use it.</dd>
          <dt>Claimed https redirect</dt>
          <dd>An https address that an app proves it owns, so the OS delivers it only to that app.</dd>
          <dt>Consent phishing</dt>
          <dd>Tricking a user into approving an attacker's own registered app.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Say it in the interview</h2>
        <div className="sim-say">
          "OAuth lets an app act for a user without seeing their password. The app sends the browser to the authorization server, the user logs in and
          consents there, and a short-lived, one-time code comes back through the browser. The app then swaps the code for a token on a direct call, so the
          token never appears in a URL. On a server, a client secret protects that swap. A mobile app can't keep a secret, so I'd use PKCE: it creates a
          random verifier for each login and sends only the hash up front, so a stolen code is useless. PKCE doesn't identify the app, though, so on mobile
          I'd also use a claimed https redirect, so the OS delivers the code only to the real app. And I'd compare redirect addresses exactly, check state,
          keep scopes minimal, and use OpenID Connect if what I actually need is login."
        </div>
        <p className="sim-muted sim-small">
          Follow-up they may ask: "Why have a code at all?" Because the browser channel leaks, and the code limits what a leak can do. Follow-up #2: "Does PKCE
          replace the client secret?" No: they answer different questions. The secret identifies a server-side client, and PKCE ties a code to one login, so
          confidential clients should use both. Follow-up #3: "Why is plain not enough?" If the attacker can read the first URL, they already have the value.
          Follow-up #4: "OAuth or OpenID Connect?" OAuth is about access. OpenID Connect adds an ID token that says who logged in.
        </p>
      </section>

      <div className="sim-footer">
        The simulation is deterministic and simplified. Values such as code-1 and hash(ver-1) are short labels, while Part 1's widget computes real SHA-256 hashes.
        The story has the OS deliver the first redirect to the malicious app and the second to the real one, because the OS doesn't guarantee an order. Token
        signing, refresh tokens and token expiry are left out, to keep the focus on the redirect. The specifications behind this page are RFC 6749, RFC 7636,
        RFC 8252 and RFC 9700.
      </div>
    </div>
  )
}
