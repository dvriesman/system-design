import { useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/sim.css'
import { GRANTS, QUESTIONS, SCENARIOS, type Grant, type Status } from './grantTypes'
import { SequenceDiagram } from './sequenceDiagram'

const STATUS_LABEL: Record<Status, string> = { recommended: 'recommended', specific: 'for specific cases', deprecated: 'deprecated' }
const byId = (id: string) => GRANTS.find((g) => g.id === id)!

function Badge({ status }: { status: Status }) {
  return <span className={`gt-badge ${status}`}>{STATUS_LABEL[status]}</span>
}

function Wizard({ onPick }: { onPick: (id: string) => void }) {
  const [path, setPath] = useState<{ q: string; answer: string }[]>([])
  const [at, setAt] = useState('start')
  const result = at.startsWith('grant:') ? byId(at.slice(6)) : null
  const question = result ? null : QUESTIONS[at]

  function answer(label: string, next: string) {
    setPath([...path, { q: at, answer: label }])
    setAt(next)
  }
  function reset() {
    setPath([])
    setAt('start')
  }

  return (
    <div className="sim-store">
      <h3>
        <span>Which grant fits?</span>
        {path.length ? (
          <button className="sim-btn ghost" type="button" onClick={reset}>
            Start again
          </button>
        ) : null}
      </h3>
      {path.length ? (
        <div className="gt-path">
          {path.map((step) => (
            <span key={step.q}>
              {QUESTIONS[step.q].text} <b>{step.answer}</b> ›
            </span>
          ))}
        </div>
      ) : null}
      {question ? (
        <>
          <p className="sim-lede" style={{ margin: 0 }}>
            {question.text}
          </p>
          <div className="gt-options">
            {question.options.map((o) => (
              <button key={o.label} className="sim-btn ghost" type="button" onClick={() => answer(o.label, o.next)}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      ) : result ? (
        <div className="sim-say">
          <b>Use {result.name}.</b> {result.oneLine}{' '}
          <button className="sim-btn" type="button" onClick={() => onPick(result.id)}>
            See it step by step
          </button>
          <p className="sim-small" style={{ marginBottom: 0 }}>
            Two grants never fit: Implicit and Resource Owner Password are deprecated. Whatever they were used for, authorization code with PKCE now does better.
            {result.id === 'code' ? ' Add the refresh token grant to keep the user logged in.' : ''}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function Explorer({ grant, onPick }: { grant: Grant; onPick: (id: string) => void }) {
  const [stepIndex, setStepIndex] = useState(0)
  const index = Math.min(stepIndex, grant.steps.length - 1)
  const step = grant.steps[index]
  const holds = grant.steps
    .slice(0, index + 1)
    .map((s) => s.holds)
    .filter(Boolean)
    .pop()

  return (
    <div className="sim-bench">
      <div className="gt-cards" role="group" aria-label="Grant type">
        {GRANTS.map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={g.id === grant.id}
            onClick={() => {
              onPick(g.id)
              setStepIndex(0)
            }}
          >
            {g.name}
            <Badge status={g.status} />
          </button>
        ))}
      </div>

      <div className="sim-card">
        <h3>
          {grant.name} <Badge status={grant.status} />
        </h3>
        <p>{grant.oneLine}</p>
        <p className="sim-small">
          <code>grant_type={grant.grantType}</code> · {grant.spec}
        </p>
        <div className="sim-cards">
          <div>
            <b>Use it for</b>
            <ul className="t">
              {grant.useCases.map((u) => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
          <div>
            <b>Avoid it when</b>
            <p>{grant.avoidWhen}</p>
            <b>Watch out for</b>
            <ul className="t">
              {grant.security.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="sim-toolbar">
        <span className="sim-small">Step through the flow, or click any arrow.</span>
        <div className="sim-ctl">
          <button className="sim-btn ghost" type="button" aria-label="Previous step" disabled={index === 0} onClick={() => setStepIndex(index - 1)}>
            ◀
          </button>
          <button className="sim-btn" type="button" disabled={index === grant.steps.length - 1} onClick={() => setStepIndex(index + 1)}>
            Next step ▶
          </button>
          <span className="sim-pos">
            {index + 1} / {grant.steps.length}
          </span>
        </div>
      </div>

      <div className="gt-step">
        <SequenceDiagram sequence={{ id: grant.id, title: grant.name, summary: grant.oneLine, participants: grant.participants, messages: grant.steps }} current={index} onPick={setStepIndex} />
        <div className="sim-col">
          <div className="sim-narr" aria-live="polite">
            <span className="who">
              step {index + 1} · {grant.participants.find((x) => x.id === step.from)?.label} → {grant.participants.find((x) => x.id === step.to)?.label}
            </span>
            <b className="t">{step.label}</b>
            <span>{step.note}</span>
          </div>
          {step.http ? (
            <div className="sim-store">
              <h3>
                <span>{step.http.startsWith('HTTP/') ? 'Response' : step.http.startsWith('{') ? 'JWT claims' : 'Request'}</span>
              </h3>
              <pre className="sim-block">{step.http}</pre>
            </div>
          ) : null}
          <div className="sim-store">
            <h3>
              <span>Credentials held so far</span>
            </h3>
            {holds ? <div className="sim-jwt-token">{holds}</div> : <div className="sim-empty">nothing yet</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

function Quiz({ onPick }: { onPick: (id: string) => void }) {
  const [index, setIndex] = useState(0)
  const [chosen, setChosen] = useState<string | null>(null)
  const [score, setScore] = useState({ right: 0, done: 0 })
  const scenario = SCENARIOS[index]
  const finished = score.done === SCENARIOS.length && chosen !== null && index === SCENARIOS.length - 1

  function choose(id: string) {
    if (chosen) return
    setChosen(id)
    setScore({ right: score.right + (id === scenario.answer ? 1 : 0), done: score.done + 1 })
  }
  function next() {
    if (index === SCENARIOS.length - 1) {
      setIndex(0)
      setScore({ right: 0, done: 0 })
    } else setIndex(index + 1)
    setChosen(null)
  }

  return (
    <div className="sim-store">
      <h3>
        <span>Which grant would you use?</span>
        <span className="sim-tag">
          {index + 1} of {SCENARIOS.length} · score {score.right}/{score.done}
        </span>
      </h3>
      <p className="sim-lede" style={{ margin: 0 }}>
        {scenario.text}
      </p>
      <div className="gt-options">
        {GRANTS.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`sim-btn ghost${chosen && g.id === scenario.answer ? ' gt-right' : ''}`}
            aria-pressed={chosen === g.id}
            disabled={!!chosen && chosen !== g.id && g.id !== scenario.answer}
            onClick={() => choose(g.id)}
          >
            {g.name}
          </button>
        ))}
      </div>
      {chosen ? (
        <>
          <p className={`gt-feedback ${chosen === scenario.answer ? 'ok' : 'bad'}`}>
            {chosen === scenario.answer ? 'Right.' : `Not quite: ${byId(scenario.answer).name}.`} <span className="sim-muted">{scenario.why}</span>
          </p>
          <div className="gt-options">
            <button className="sim-btn" type="button" onClick={next}>
              {index === SCENARIOS.length - 1 ? 'Start again' : 'Next scenario'}
            </button>
            <button className="sim-btn ghost" type="button" onClick={() => onPick(scenario.answer)}>
              See {byId(scenario.answer).name} step by step
            </button>
          </div>
          {finished ? (
            <p className="sim-small">
              You got {score.right} of {SCENARIOS.length}.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

export default function GrantTypesPattern() {
  const [grantId, setGrantId] = useState('code')
  const grant = byId(grantId)

  function show(id: string) {
    setGrantId(id)
    document.getElementById('explore')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="sim mx-auto max-w-6xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Authentication · OAuth 2.0 Grant Types</div>
        <h1>OAuth 2.0 Grant Types</h1>
        <p className="sim-lede">
          A grant type is how a client gets an access token. Each one fits a different situation: a user at a browser, a service on its own, a TV with no keyboard, a shop terminal, or one service calling another for a user. Find the right
          one, step through its real HTTP, then test yourself.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#fit">Which grant fits?</a> Answer two or three questions.
          </li>
          <li>
            <a href="#explore">Explore each grant.</a> Step through its flow and the exact requests.
          </li>
          <li>
            <a href="#compare">Compare them.</a> One table.
          </li>
          <li>
            <a href="#quiz">Which would you use?</a> Eight scenarios.
          </li>
        </ol>
      </div>

      <section id="fit" aria-labelledby="g1" className="sim-section sim-first">
        <h2 id="g1">Which grant fits?</h2>
        <Wizard onPick={show} />
      </section>

      <section id="explore" aria-labelledby="g2" className="sim-section">
        <h2 id="g2">Explore each grant</h2>
        <Explorer key={grant.id} grant={grant} onPick={setGrantId} />
      </section>

      <section id="compare" aria-labelledby="g3" className="sim-section">
        <h2 id="g3">Compare them</h2>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>Grant</th>
                <th>Status</th>
                <th>User involved</th>
                <th>Client proves itself with</th>
                <th>Browser needed</th>
                <th>Refresh token</th>
              </tr>
            </thead>
            <tbody>
              {GRANTS.map((g) => (
                <tr key={g.id}>
                  <td>
                    <button type="button" className="gt-link" onClick={() => show(g.id)}>
                      {g.name}
                    </button>
                  </td>
                  <td>
                    <Badge status={g.status} />
                  </td>
                  <td>{g.user}</td>
                  <td>{g.clientSecret}</td>
                  <td>{g.browser}</td>
                  <td>{g.refresh}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section id="quiz" aria-labelledby="g4" className="sim-section">
        <h2 id="g4">Which would you use?</h2>
        <Quiz onPick={show} />
      </section>

      <section aria-labelledby="g5" className="sim-section">
        <h2 id="g5">Words from this page</h2>
        <dl className="gl">
          <dt>Grant type</dt>
          <dd>The way a client asks the authorization server for an access token, named in the grant_type parameter of the token request.</dd>
          <dt>Client</dt>
          <dd>The app or service asking for a token. A confidential client can keep a secret, such as a server. A public client can't, such as a mobile or browser app.</dd>
          <dt>Authorization server</dt>
          <dd>The service that authenticates users and clients, and issues tokens.</dd>
          <dt>Access token</dt>
          <dd>A short-lived credential sent to an API with each call, in the Authorization header.</dd>
          <dt>Refresh token</dt>
          <dd>A longer-lived credential used only to get new access tokens from the authorization server.</dd>
          <dt>Scope</dt>
          <dd>A named permission inside a token, such as transactions.read.</dd>
          <dt>PKCE</dt>
          <dd>Proof Key for Code Exchange: the client proves it started the login, so a stolen code is useless.</dd>
          <dt>Front channel and back channel</dt>
          <dd>The front channel goes through the browser, using redirects and URLs that can leak. The back channel is a direct server-to-server call.</dd>
          <dt>Polling</dt>
          <dd>Asking repeatedly whether something is ready, as the device and CIBA flows do.</dd>
          <dt>Assertion</dt>
          <dd>A signed statement, such as a JWT, that proves who is asking without sending a secret.</dd>
          <dt>Delegation</dt>
          <dd>A service acting for a user, with the token recording both. Impersonation hides the service instead.</dd>
          <dt>Deprecated</dt>
          <dd>Still in the original standard, but current guidance says not to use it.</dd>
        </dl>
        <p className="sim-small">
          See <Link to="/guides/oauth-pkce">OAuth 2.0 Authorization Code + PKCE</Link> for how a stolen code is stopped, and{' '}
          <Link to="/guides/sessions-vs-jwts">Sessions vs JWTs</Link> for what happens when an access token is stolen.
        </p>
      </section>

      <div className="sim-footer">
        Sources: RFC 6749, RFC 7636, RFC 8628 (device), RFC 8693 (token exchange), RFC 7523 (JWT bearer), RFC 9700 (security best current practice) and OpenID CIBA Core 1.0. Token values are examples.
      </div>
    </div>
  )
}
