import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import MfaLab from './MfaLab'
import { build, checks, clockText, codeAt, CODE, EXPERIMENTS, lineRef, verdictIsBad, verdictText, type Actor, type Mode, type Pane, type Step } from './mfaSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'password', label: '1 · Password only' },
  { id: 'sms', label: '2 · + SMS code' },
  { id: 'fallback', label: '3 · App, SMS fallback' },
  { id: 'recovery', label: '4 · App + recovery codes' },
  { id: 'passkey', label: '5 · Passkeys' },
]
const ACTOR_NAME: Record<Actor, string> = { cons: 'Alice', svc: 'Login server', relay: 'Factor checks', migrator: 'Attacker' }
const PANES: { id: Pane; cls: string; title: string }[] = [
  { id: 'alice', cls: 'cons', title: 'Alice' },
  { id: 'login', cls: 'svc', title: 'Login server' },
  { id: 'factors', cls: 'relay', title: 'Factor checks' },
  { id: 'attacker', cls: 'migrator', title: 'Attackers' },
]

export default function MfaPattern() {
  const [mode, setMode] = useState<Mode>('password')
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const steps = useMemo(() => build(mode), [mode])
  const safeCur = Math.min(cur, steps.length - 1)

  useEffect(() => {
    if (!running) return
    if (cur >= steps.length - 1) {
      setRunning(false)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(() => setCur((c) => Math.min(steps.length - 1, c + 1)), reduced ? 150 : 600)
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
  const usesApp = mode === 'fallback' || mode === 'recovery'

  function go(i: number) {
    setRunning(false)
    setCur(Math.max(0, Math.min(steps.length - 1, i)))
  }
  function switchMode(m: Mode) {
    setMode(m)
    setCur(0)
    setRunning(false)
  }
  function runExperiment(exp: (typeof EXPERIMENTS)[number]) {
    setMode(exp.mode)
    setRunning(false)
    const all = build(exp.mode)
    setCur(all.findIndex((st) => st.ev === exp.ev))
  }
  const lineLabel = (st: Step) => (st.line ? `${lineRef(st.line, mode)} ${st.label}` : st.label)

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Authentication · Multi-Factor Authentication</div>
        <h1>Multi-Factor Authentication</h1>
        <p className="sim-lede">
          Passwords leak. A second factor means a leaked password isn't enough, but the factors are not equal: some can be redirected, some can be phished, and some
          lock people out when a phone is lost. The page takes them one at a time.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">What makes a second factor strong?</a> A password, an SMS code, an authenticator app and a passkey, with a real authenticator code to compute.
          </li>
          <li>
            <a href="#part2">Which factor, for whom?</a> Concrete cases, the fallback problem, and myths.
          </li>
          <li>
            <a href="#part3">What happens when attackers try?</a> A step-by-step debugger, then <a href="#auth0">Auth0</a>, <a href="#keycloak">Keycloak</a> and{' '}
            <a href="#real">how to build it for real</a>.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 3</div>
        <h2 id="p1">What makes a second factor strong?</h2>
        <p className="sim-lede">Nothing is attacking yet. Go through the tabs in order, and watch the three attacks at the top of each one.</p>
        <MfaLab />
        <div className="sim-say">
          <b>The idea in one sentence.</b> A second factor is only as strong as what an attacker needs to get it: a password needs a leak, an SMS needs your number, an app code
          needs a moment of your trust, and a passkey needs your device on the real site.
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>SMS code</th>
                <th>Authenticator app (TOTP)</th>
                <th>Passkey (WebAuthn)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Stops a leaked password</b>
                </td>
                <td>Yes</td>
                <td>Yes</td>
                <td>Yes, and can replace the password</td>
              </tr>
              <tr>
                <td>
                  <b>Stops a SIM swap</b>
                </td>
                <td className="sim-cell-bad">No</td>
                <td>Yes</td>
                <td>Yes</td>
              </tr>
              <tr>
                <td>
                  <b>Stops phishing</b>
                </td>
                <td className="sim-cell-bad">No</td>
                <td className="sim-cell-bad">No</td>
                <td>Yes: bound to the site's domain</td>
              </tr>
              <tr>
                <td>
                  <b>Setup for the user</b>
                </td>
                <td>None: everyone has a number</td>
                <td>Install an app, scan a QR code</td>
                <td>One prompt on a recent phone or laptop</td>
              </tr>
              <tr>
                <td>
                  <b>Standard</b>
                </td>
                <td>NIST: "restricted"</td>
                <td>RFC 6238, on RFC 4226</td>
                <td>W3C WebAuthn, FIDO2</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="part2" aria-labelledby="p2" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 3</div>
        <h2 id="p2">Which factor, for whom?</h2>
        <p className="sim-lede">
          The strongest factor everywhere would lock out people with old phones. The weakest everywhere would leave money exposed. Choose by who is signing in and what they
          can reach.
        </p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Case: bank customers</h3>
            <p>
              <b>Offer passkeys first, an authenticator app second, and SMS only as a last resort.</b> Customers have every kind of phone, so some need SMS. Treat it as weaker:
              watch for SIM changes, as NIST suggests, and ask for more before sensitive actions.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: staff with access to customer data or payments</h3>
            <p>
              <b>Phishing-resistant only: passkeys or security keys.</b> Attackers target staff with phishing, and one session can reach thousands of accounts. NIST's highest
              level, AAL3, requires a phishing-resistant authenticator.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: a low-risk app, such as a newsletter</h3>
            <p>
              <b>Optional MFA, or passwordless with a passkey.</b> Forcing a second factor where little is at stake mostly adds support tickets.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: a sensitive action mid-session</h3>
            <p>
              <b>That's a different pattern.</b> A second factor at login protects the login. Asking again before a withdrawal is{' '}
              <Link to="/guides/step-up-authentication">Step-Up Authentication</Link>.
            </p>
          </div>
        </div>
        <h3>The fallback problem</h3>
        <p>
          A common design, often built on Keycloak, makes an authenticator app the main factor and falls back to SMS when the user can't use it. It's popular for good reasons:
          the app is stronger, and SMS rescues people who changed phones. But an attacker chooses the path too. If "Try another way" offers SMS to anyone, the account is
          exactly as strong as SMS. Mode 3 of the debugger shows this, and{' '}
          <a href="#keycloak">the Keycloak section</a> shows how to keep the fallback without giving it away.
        </p>
        <div className="sim-card">
          <h3>Three myths worth dropping</h3>
          <ul className="t">
            <li>
              <b>"We have MFA, so phishing is solved."</b> Codes, by SMS or by app, can be typed into a fake page and relayed in seconds. Only phishing-resistant factors stop that.
            </li>
            <li>
              <b>"The app is primary, so SMS doesn't matter."</b> Every factor a user may choose is a factor an attacker may choose. The weakest one sets the strength.
            </li>
            <li>
              <b>"Push approvals are as good as passkeys."</b> A simple approve button can be tapped by a tired user after the tenth unexpected prompt, which is called MFA
              fatigue. Showing a number the user must match on the screen helps, but a push is still not bound to the site.
            </li>
          </ul>
        </div>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 3 of 3</div>
        <h2 id="p3">What happens when attackers try?</h2>
        <p className="sim-lede">
          The same day runs through every mode: a leaked password at 09:00, a SIM swap at 10:00, a phishing site at 11:00, and Alice losing her phone at 14:00. The authenticator
          codes are real, computed from Alice's secret and the time. Nothing crashes here, so there are no breakpoints: the experiments jump to the moment worth seeing.
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
                <span>Alice's phone</span>
                <span className="sim-tag">{clockText(s.clock)}</span>
              </h3>
              {s.phoneLost ? (
                <div className="sim-tx-reader short">
                  Lost<span>Everything on it is gone with it.</span>
                </div>
              ) : (
                <div className="sim-inv">
                  <div className="sim-chk-row">
                    <span className={`sim-mark ${s.phoneOwner === 'alice' ? 'ok' : 'bad'}`}>number</span>
                    <span>{s.phoneOwner === 'alice' ? 'Her number rings here' : "No signal: her number is on the attacker's SIM"}</span>
                  </div>
                  {usesApp ? (
                    <div className="sim-chk-row">
                      <span className="sim-mark ok">app</span>
                      <span>
                        Authenticator shows <b>{codeAt(s.clock, 10)}</b>
                      </span>
                    </div>
                  ) : null}
                  {mode === 'passkey' ? (
                    <div className="sim-chk-row">
                      <span className="sim-mark ok">passkey</span>
                      <span>For bank.example. A second one lives on her laptop</span>
                    </div>
                  ) : null}
                  {s.aliceSms.length ? (
                    <div className="sim-chk-row">
                      <span className="sim-mark wait">SMS</span>
                      <span>{s.aliceSms.join(' · ')}</span>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
            <div className="sim-store">
              <h3>
                <span>What the attacker has</span>
              </h3>
              <ul className="mfa-list">
                {s.attackerHas.map((x) => (
                  <li key={x}>{x}</li>
                ))}
                {s.attackerSms.map((x) => (
                  <li key={x}>SMS on the swapped SIM: {x}</li>
                ))}
              </ul>
            </div>
            <div className="sim-store">
              <h3>
                <span>Sessions on Alice's account</span>
              </h3>
              {s.sessions.length ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>time</th>
                        <th>who</th>
                        <th>how</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.sessions.map((x, i) => (
                        <tr key={i} className={x.who === 'Attacker' ? 'dupe' : ''}>
                          <td>{clockText(x.at)}</td>
                          <td>{x.who}</td>
                          <td>{x.how}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">no rows</div>
              )}
              {mode === 'recovery' ? <div className="sim-empty">recovery codes left: {s.recoveryLeft} of 10</div> : null}
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
                <div className={`sim-verdict ${final ? (verdictIsBad(s) ? 'bad' : 'good') : 'wait'}`}>{final ? verdictText(mode) : 'Verdict appears when the run finishes. Press Run to skip ahead.'}</div>
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
            <h3>A password is a single point of failure</h3>
            <p>A breach somewhere else was enough. Every attack worked, because the password was the only thing checked.</p>
          </div>
          <div className="sim-card">
            <h3>SMS proves a number, not a person</h3>
            <p>It stopped the leaked password. The SIM swap received the code legitimately, and the phishing page simply asked for it.</p>
          </div>
          <div className="sim-card">
            <h3>The weakest allowed factor sets the strength</h3>
            <p>
              With the app first and SMS as a fallback, the attacker picked SMS. And because both lived on one phone, losing the phone lost both, so the fallback didn't help Alice
              either.
            </p>
          </div>
          <div className="sim-card">
            <h3>Recovery codes beat SMS, but codes are phishable</h3>
            <p>Removing SMS stopped the SIM swap, and printed recovery codes let Alice back in. Her app code was still typed into a fake page and relayed within 30 seconds.</p>
          </div>
          <div className="sim-card">
            <h3>A passkey has nothing to relay</h3>
            <p>Her browser won't offer the bank's passkey on another domain, and the signature names the origin. A second passkey on her laptop covered the lost phone.</p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Each fix moves the responsibility somewhere</h3>
          <ul className="t">
            <li>
              <b>Recovery</b> becomes the real front door. If losing every factor leads to a support call that resets MFA after a few questions, attackers will call too. Make
              recovery slower than sign-in: a waiting period, notifications to every channel, and a check of identity documents for high-value accounts.
            </li>
            <li>
              <b>Enrollment</b> must be protected. Adding a new factor or a new phone number should need an existing strong factor, or an attacker with one session adds their own.
            </li>
            <li>
              <b>Sessions</b> outlive the login. MFA protects the moment of sign-in. After that, a stolen session cookie needs no factor at all: see{' '}
              <Link to="/guides/sessions-vs-jwts">Sessions vs JWTs</Link> and <Link to="/guides/step-up-authentication">Step-Up Authentication</Link>.
            </li>
            <li>
              <b>"Remember this device"</b> trades a prompt for a cookie. Keep it short, bind it to the device where you can, and never let it skip a check before moving money.
            </li>
            <li>
              <b>Passkeys</b> move trust to devices and their sync. Synced passkeys follow the user's platform account, so that account's own security becomes part of yours.
            </li>
          </ul>
        </div>
      </section>

      <section id="auth0" aria-labelledby="k1" className="sim-section">
        <h2 id="k1">With Auth0, as a hosted service</h2>
        <p className="sim-lede">
          Auth0 runs the login pages, the factor enrollment and the checks for you. You choose the factors and the policy, and use Actions to decide who gets which. The details
          below are from Auth0's documentation at the time of writing. Check them for your plan.
        </p>
        <div className="sim-card">
          <h3>1. Turn on factors, and choose a policy</h3>
          <p>
            Auth0's docs list these factors: push notifications through Auth0 Guardian, SMS, voice, one-time passwords from an authenticator app, WebAuthn with security keys,
            WebAuthn with device biometrics, email, Cisco Duo and recovery codes. Some are only on Professional and Enterprise plans, and recovery codes are off by default.
          </p>
          <div className="sim-cmp">
            <table>
              <thead>
                <tr>
                  <th>Require Multi-factor Auth</th>
                  <th>What it means</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Never</td>
                  <td>MFA is not required for any logins. Actions can still require it for some users</td>
                </tr>
                <tr>
                  <td>Use Adaptive MFA</td>
                  <td>MFA is required based on Auth0's risk assessment. It needs an Enterprise plan with the Adaptive MFA add-on</td>
                </tr>
                <tr>
                  <td>Always</td>
                  <td>MFA is required for every login</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div className="sim-card">
          <h3>2. Decide per user with a post-login Action</h3>
          <pre className="sim-block">{`// Simplest: require any enrolled factor, and don't remember the browser.
exports.onExecutePostLogin = async (event, api) => {
  api.multifactor.enable('any', { allowRememberBrowser: false })
}

// Choosing factors needs the "Customize MFA Factors using Actions" toggle.
// The debugger's mode 3: the user may pick the app or SMS, and so may an attacker.
exports.onExecutePostLogin = async (event, api) => {
  api.authentication.challengeWithAny([{ type: 'otp' }, { type: 'phone' }])
}

// Closer to mode 5: phishing-resistant first, the app as the fallback, no SMS.
exports.onExecutePostLogin = async (event, api) => {
  api.authentication.challengeWithAny([
    { type: 'webauthn-platform' },
    { type: 'webauthn-roaming' },
    { type: 'otp' },
  ])
}`}</pre>
          <p className="sim-small">
            Auth0's docs note that <code>challengeWith</code> and <code>challengeWithAny</code> override any challenge set with <code>api.multifactor.enable</code>, and that a flow
            can run at most four of the enroll and challenge commands. Enrollment can be directed the same way, for example{' '}
            <code>api.authentication.enrollWith({'{'} type: 'otp' {'}'})</code>.
          </p>
        </div>
        <div className="sim-card">
          <h3>What to watch for with Auth0</h3>
          <ul className="t">
            <li>
              <b>Offering SMS offers it to attackers.</b> If you enable phone messages for reach, decide who may use them, for example only users with no other factor enrolled.
            </li>
            <li>
              <b>SMS costs money and attracts fraud.</b> Auth0 offers an SMS Fraud Protection setting that spaces out code requests per user.
            </li>
            <li>
              <b>"Remember this browser"</b> skips prompts for a while. For the authenticator app and Duo, Auth0's docs say that means once every 30 days. Keep it off where money moves.
            </li>
            <li>
              <b>You still own recovery and session length.</b> A hosted login doesn't decide what your support team does when a customer loses every factor.
            </li>
          </ul>
        </div>
      </section>

      <section id="keycloak" aria-labelledby="k2" className="sim-section">
        <h2 id="k2">With Keycloak: an authenticator app first, SMS as the fallback</h2>
        <p className="sim-lede">
          Keycloak includes an authenticator-app form, WebAuthn with passkeys, and recovery codes. The parts of its documentation checked for this page don't list an
          SMS authenticator, so the usual way to offer the app with an SMS fallback is a custom authenticator, written with Keycloak's Authentication SPI.
        </p>
        <div className="sim-card">
          <h3>The built-in authenticator app</h3>
          <p>
            Keycloak's default OTP policy, in its source, is a time-based code with HmacSHA1, 6 digits, a 30-second period and a look-around window of 1 step, and a code can't
            be used twice. That is the same calculation as the widget in Part 1.
          </p>
        </div>
        <div className="sim-card">
          <h3>A custom authenticator: the app, or SMS on a known device</h3>
          <pre className="sim-block">{`// A sketch. Keycloak calls the Authentication SPI internal: it can change between releases.
public class AppOrSmsAuthenticator implements Authenticator {

  public void authenticate(AuthenticationFlowContext ctx) {
    UserModel user = ctx.getUser();
    boolean smsAllowed = knownDevice(ctx) && !recentSimChange(user);   // not for anyone who asks
    ctx.challenge(ctx.form()
        .setAttribute("smsAllowed", smsAllowed)
        .createForm("app-or-sms.ftl"));                                  // the app code box first
  }

  public void action(AuthenticationFlowContext ctx) {
    var form = ctx.getHttpRequest().getDecodedFormParameters();
    if (form.containsKey("sendSms") && knownDevice(ctx)) {
      sendSmsCode(ctx);                                                   // rate-limited, expires in 5 min
      ctx.challenge(ctx.form().createForm("sms-code.ftl"));
      return;
    }
    if (validAppCode(ctx, form) || validSmsCode(ctx, form)) ctx.success();
    else ctx.failureChallenge(AuthenticationFlowError.INVALID_CREDENTIALS,
                              ctx.form().setError("invalidCode").createForm("app-or-sms.ftl"));
  }

  public boolean requiresUser() { return true; }
  public boolean configuredFor(KeycloakSession s, RealmModel r, UserModel u) { return hasAppOrPhone(u); }
  public void setRequiredActions(KeycloakSession s, RealmModel r, UserModel u) { /* e.g. enroll the app */ }
  public void close() {}
}`}</pre>
          <ol className="t">
            <li>
              Implement <code>Authenticator</code> and an <code>AuthenticatorFactory</code> that creates it. Keycloak's guide says you must implement at least these two.
            </li>
            <li>
              List the factory in <code>META-INF/services/org.keycloak.authentication.AuthenticatorFactory</code> inside the JAR, copy the JAR to the <code>providers</code>{' '}
              directory, and run <code>kc.sh build</code>.
            </li>
            <li>
              Copy the browser flow, and put the new authenticator in the second-factor step. "Alternative" means one of the alternatives is enough, and "Required" stops the flow
              if it fails, so set it to match your design.
            </li>
          </ol>
        </div>
        <div className="sim-card">
          <h3>What to add so the fallback isn't the way in</h3>
          <ul className="t">
            <li>
              <b>Offer SMS only where it's needed:</b> on a device that has signed in before, or for users who have no app enrolled. A new device asking for SMS is exactly what
              a SIM swapper looks like.
            </li>
            <li>
              <b>Check risk before texting.</b> NIST suggests considering a recent SIM change or number port before using the phone network. Many carriers and SMS providers offer
              such a check.
            </li>
            <li>
              <b>Rate-limit and expire codes.</b> Six digits are a million guesses: limit sends and attempts per user, and expire codes in minutes.
            </li>
            <li>
              <b>Notify on every fallback and every factor change,</b> by email and push, so a real user notices an attack in progress.
            </li>
            <li>
              <b>Then move the default to passkeys.</b> Keycloak supports them, and the app becomes the fallback, so the weakest path is still not SMS for most users.
            </li>
          </ul>
        </div>
      </section>

      <section id="real" aria-labelledby="r1" className="sim-section">
        <h2 id="r1">How do you build this for real?</h2>
        <p className="sim-lede">Whether hosted or self-built, these details decide whether MFA protects anyone.</p>
        <div className="sim-card">
          <h3>What catches people in production</h3>
          <ul className="t">
            <li>
              <b>Brute-forcing codes.</b> A 6-digit code has a million values. NIST allows at most 100 consecutive failed attempts per authenticator before it is disabled; most
              systems use far fewer, with growing delays.
            </li>
            <li>
              <b>Replaying a code.</b> A code is valid for its whole 30-second step. Remember the last step used per user and reject a second use, as Keycloak does by default.
            </li>
            <li>
              <b>Storing secrets.</b> TOTP secrets must be readable by the server to compute codes, so encrypt them with a key held elsewhere. Recovery codes are only compared, so
              store hashes, and mark each one used.
            </li>
            <li>
              <b>Enrollment over a weak session.</b> If adding a factor needs only a password, an attacker with the password adds their own. Require an existing factor, or a fresh
              login.
            </li>
            <li>
              <b>Push bombing.</b> Limit how many push prompts can be sent, show where the sign-in comes from, and ask the user to match a number.
            </li>
            <li>
              <b>The help desk.</b> The phone line that resets MFA is part of your authentication. Write down what it checks, and log every reset.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Factor</dt>
          <dd>A kind of proof: something you know (a password), something you have (a phone, a key) or something you are (a fingerprint).</dd>
          <dt>MFA, 2FA</dt>
          <dd>Multi-factor and two-factor authentication: requiring proofs of more than one kind.</dd>
          <dt>Credential stuffing</dt>
          <dd>Trying usernames and passwords leaked from one site on many others.</dd>
          <dt>SIM swap</dt>
          <dd>Getting a mobile carrier to move someone's number to an attacker's SIM card.</dd>
          <dt>TOTP</dt>
          <dd>Time-based one-time password, RFC 6238: an HMAC of a shared secret and the current 30-second step, cut to 6 digits.</dd>
          <dt>HOTP</dt>
          <dd>HMAC-based one-time password, RFC 4226: the same calculation with a counter instead of the time.</dd>
          <dt>Passkey</dt>
          <dd>A WebAuthn credential: a key pair for one site, with the private key kept on the device and unlocked locally.</dd>
          <dt>Phishing resistance</dt>
          <dd>NIST: the ability of the protocol to prevent the disclosure of authentication secrets to an impostor, without relying on the user's vigilance.</dd>
          <dt>Restricted authenticator</dt>
          <dd>NIST's term for SMS and voice codes over the phone network: allowed, but with extra conditions and an alternative offered.</dd>
          <dt>Recovery code</dt>
          <dd>A single-use code, printed or saved at enrollment, for when other factors are lost.</dd>
          <dt>MFA fatigue</dt>
          <dd>Approving a push prompt just to make repeated prompts stop.</dd>
          <dt>Authentication SPI</dt>
          <dd>Keycloak's interfaces for writing custom steps in its login flows.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Explain it in a design review</h2>
        <div className="sim-say">
          "Every account gets a second factor, because leaked passwords are the most common way in. But factors aren't equal: SMS can be redirected by a SIM swap, and anything
          typed, SMS or app code, can be relayed by a phishing site. So passkeys are the default, the authenticator app is the fallback, and SMS is only offered to people with
          nothing else, on a device we've seen before, after a SIM-change check. Staff with access to customer data use phishing-resistant factors only. Every user can register
          a second passkey or print recovery codes, and account recovery is slower than sign-in, with notifications. Codes are rate-limited and single-use, enrollment needs an
          existing factor, and moving money still asks for a step-up."
        </div>
        <p className="sim-muted sim-small">
          Questions reviewers ask. "Why not just SMS? Everyone has it." It stops leaked passwords, but not SIM swaps or phishing, so it can't be the only option for money. "Build
          or buy?" A hosted service such as Auth0 gives you enrollment, factors and policies quickly. Keycloak gives you control, at the cost of maintaining custom
          authenticators. "What about users who lose everything?" A slow, noisy recovery process with a waiting period, never an instant reset. "Do passkeys replace the
          password?" They can: a passkey is already two factors, the device and the fingerprint or PIN that unlocks it.
        </p>
      </section>

      <div className="sim-footer">
        The simulation is deterministic and simplified. Authenticator codes are real RFC 6238 values from a fixed secret and date; SMS codes and recovery codes are invented. The
        phishing site relays instantly, and the SIM swap is undone at 10:30 so the later events are independent. Passkeys are shown on her phone and laptop; synced passkeys
        work similarly. Sources: RFC 4226, RFC 6238, NIST SP 800-63B (the 2025 revision), W3C Web Authentication Level 2, Auth0's MFA and Actions documentation, the
        Keycloak Server Administration and Server Developer guides, and Keycloak's source for its default OTP policy.
      </div>
    </div>
  )
}
