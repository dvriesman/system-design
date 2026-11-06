import { useState } from 'react'
import { encodeJson, signHs256 } from './sessionsCrypto'

type Scheme = 'session' | 'jwt'
type Danger = 'ok' | 'short'

type LabStep = {
  title: string
  text: string
  phone: string
  server: string
  store: string
  storeUsed: boolean
  lookups: number
  stolenWorks: Danger
}

const SCRIPTS: Record<Scheme, { label: string; idea: string; steps: LabStep[] }> = {
  session: {
    label: '1 · Session',
    idea: 'Like a coat-check ticket: the ticket itself is just a number. It only means something because the counter keeps a record, and the counter can cancel it at any time.',
    steps: [
      {
        title: 'Start: the server needs to recognize Alice on every request',
        text: "HTTP has no memory, so every request arrives as if from a stranger. Alice could send her password each time, but that means keeping it around and exposing it constantly. So the server checks it once and gives her something to use instead.",
        phone: 'nothing yet',
        server: 'waiting for a login',
        store: 'no rows',
        storeUsed: false,
        lookups: 0,
        stolenWorks: 'ok',
      },
      {
        title: 'Login: the server saves a record and hands out a random ID',
        text: 'The server generates a long random ID and saves "this ID belongs to Alice" in a store. Alice receives only the ID, usually in a cookie. It contains no information, so there is nothing to read or forge.',
        phone: 'sid = 7f3a91c2…',
        server: 'saved the record',
        store: '7f3a91c2… → alice',
        storeUsed: true,
        lookups: 0,
        stolenWorks: 'short',
      },
      {
        title: 'Each request: the server looks the ID up',
        text: 'Alice sends the ID, and the server asks the store who it belongs to. Any server can do this, because they all share the store. The cost is a network call on every single request.',
        phone: 'sends sid = 7f3a91c2…',
        server: 'asks the store: who is this?',
        store: '7f3a91c2… → alice',
        storeUsed: true,
        lookups: 1,
        stolenWorks: 'short',
      },
      {
        title: 'Next request: another lookup',
        text: "The lookup runs again, every time. If someone stole this ID, it would work for them too. The server can't tell the difference.",
        phone: 'sends sid = 7f3a91c2…',
        server: 'asks the store: who is this?',
        store: '7f3a91c2… → alice',
        storeUsed: true,
        lookups: 2,
        stolenWorks: 'short',
      },
      {
        title: 'Revoke: delete the row',
        text: "Alice's laptop is stolen, so the bank deletes the row. The very next request with that ID finds nothing and gets rejected. This is what you get for paying for those lookups: the server stays in control.",
        phone: 'sid = 7f3a91c2… (now useless)',
        server: 'rejects it: no such session',
        store: 'no rows',
        storeUsed: true,
        lookups: 3,
        stolenWorks: 'ok',
      },
    ],
  },
  jwt: {
    label: '2 · JWT',
    idea: "Like a passport: it says who you are, and a seal proves it's genuine, so border staff can check it without calling anyone. The catch is that once issued, nobody can reach out and cancel the copy in your pocket.",
    steps: [
      {
        title: 'Start: the same problem, a different idea',
        text: 'What if the server saved nothing, and the token itself carried the answer? To trust it, the server needs proof that it wrote the token and that nobody has changed it. That proof is a signature.',
        phone: 'nothing yet',
        server: 'waiting for a login',
        store: 'no store needed',
        storeUsed: false,
        lookups: 0,
        stolenWorks: 'ok',
      },
      {
        title: 'Login: the server signs a statement and saves nothing',
        text: 'The server writes "this is Alice, valid until 18:00" and signs it with a secret key. Alice gets the whole thing. No record exists anywhere on the server side.',
        phone: 'token = eyJhbGci…',
        server: 'signed it, kept nothing',
        store: 'no store needed',
        storeUsed: false,
        lookups: 0,
        stolenWorks: 'short',
      },
      {
        title: 'Each request: the server checks the math',
        text: 'Alice sends the token. The server recomputes the signature with its key and compares. If they match, the contents are genuine, so it reads who she is straight from the token. No network call happens, so this is fast and works on any server.',
        phone: 'sends token = eyJhbGci…',
        server: 'verifies the signature',
        store: 'no store needed',
        storeUsed: false,
        lookups: 0,
        stolenWorks: 'short',
      },
      {
        title: 'Next request: the same math, still no lookup',
        text: "Any number of servers can do this, as long as they all have the key. Like a session ID, a stolen token works just as well for a thief. The server only knows the token is genuine, not who is holding it.",
        phone: 'sends token = eyJhbGci…',
        server: 'verifies the signature',
        store: 'no store needed',
        storeUsed: false,
        lookups: 0,
        stolenWorks: 'short',
      },
      {
        title: 'Revoke: there is nothing to delete',
        text: "Alice's laptop is stolen, and the bank wants to cancel the token. But no server holds anything about it, so there's nothing to delete. The thief's copy still passes the math, and it keeps working until the expiry written inside it. This is the price of not having to look anything up.",
        phone: 'token = eyJhbGci… (still valid)',
        server: 'accepts it: the signature is fine',
        store: 'no store needed',
        storeUsed: false,
        lookups: 0,
        stolenWorks: 'short',
      },
    ],
  },
}

const SCHEMES = Object.keys(SCRIPTS) as Scheme[]
const SERVER_KEY = 'the-servers-secret-key'
const GUESSED_KEY = 'a-guess-at-the-key'
const HEADER = { alg: 'HS256', typ: 'JWT' }

function TokenWidget() {
  const [role, setRole] = useState<'customer' | 'admin'>('customer')
  const [key, setKey] = useState<'original' | 'guess' | 'server'>('original')

  const header = encodeJson(HEADER)
  const originalBody = `${header}.${encodeJson({ sub: 'alice', role: 'customer', exp: 1893456000 })}`
  const payload = encodeJson({ sub: 'alice', role, exp: 1893456000 })
  const body = `${header}.${payload}`
  const signature =
    key === 'original' ? signHs256(originalBody, SERVER_KEY) : signHs256(body, key === 'guess' ? GUESSED_KEY : SERVER_KEY)
  const valid = signature === signHs256(body, SERVER_KEY)

  return (
    <div className="sim-store">
      <h3>
        <span>Inside a real JWT</span>
        <span className="sim-tag">a genuine HS256 token, computed as you click</span>
      </h3>
      <p className="sim-small">
        A JWT is three pieces of text joined by dots: a header, a payload and a signature. Try to change the payload and see if the
        server notices.
      </p>
      <div className="sim-jwt-token">
        <span className="h">{header}</span>.<span className="p">{payload}</span>.<span className="s">{signature}</span>
      </div>
      <div className="sim-jwt-parts">
        <div className="h">
          <b>Header</b>
          <pre>{JSON.stringify(HEADER, null, 1)}</pre>
        </div>
        <div className="p">
          <b>Payload</b>
          <pre>{JSON.stringify({ sub: 'alice', role, exp: 1893456000 }, null, 1)}</pre>
        </div>
        <div className="s">
          <b>Signature</b>
          <span className="sim-small">HMAC-SHA256 of the first two parts, using the server's secret key</span>
        </div>
      </div>
      <p className="sim-small">
        <b>Notice that you can read the payload.</b> It's only Base64-encoded, not encrypted, so anyone holding the token can read it.
        Never put secrets in a JWT.
      </p>
      <div className="sim-axes">
        <div className="sim-axis">
          <span className="sim-axis-label">Role</span>
          <div className="sim-seg" role="group" aria-label="Role in the payload">
            <button type="button" aria-pressed={role === 'customer'} onClick={() => setRole('customer')}>
              customer
            </button>
            <button type="button" aria-pressed={role === 'admin'} onClick={() => setRole('admin')}>
              change to admin
            </button>
          </div>
        </div>
        <div className="sim-axis">
          <span className="sim-axis-label">Signature</span>
          <div className="sim-seg" role="group" aria-label="Signature used">
            <button type="button" aria-pressed={key === 'original'} onClick={() => setKey('original')}>
              keep the original
            </button>
            <button type="button" aria-pressed={key === 'guess'} onClick={() => setKey('guess')}>
              re-sign with a guessed key
            </button>
            <button type="button" aria-pressed={key === 'server'} onClick={() => setKey('server')}>
              re-sign with the stolen real key
            </button>
          </div>
        </div>
      </div>
      <div className={`sim-tx-reader ${valid ? 'ok' : 'short'}`}>
        {valid ? `Accepted: the server treats this caller as ${role}` : 'Rejected: the signature does not match'}
        <span>
          {valid
            ? key === 'server' && role === 'admin'
              ? 'Whoever has the key can mint any token for anyone, so the signing key is the most sensitive secret in this design.'
              : 'The server recomputed the signature with its key, and it matched.'
            : key === 'guess'
              ? 'Signing needs the real key. Without it, no amount of guessing produces a matching signature.'
              : 'The signature was computed over the old payload. Changing one letter changes the result completely.'}
        </span>
      </div>
    </div>
  )
}

export default function SessionsLab() {
  const [scheme, setScheme] = useState<Scheme>('session')
  const [cur, setCur] = useState(0)
  const script = SCRIPTS[scheme]
  const safeCur = Math.min(cur, script.steps.length - 1)
  const step = script.steps[safeCur]

  function switchScheme(next: Scheme) {
    setScheme(next)
    setCur(0)
  }

  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Approach">
          {SCHEMES.map((id) => (
            <button key={id} type="button" aria-pressed={scheme === id} onClick={() => switchScheme(id)}>
              {SCRIPTS[id].label}
            </button>
          ))}
        </div>
        <div className="sim-ctl">
          <button className="sim-btn ghost" type="button" aria-label="Previous step" disabled={safeCur === 0} onClick={() => setCur(safeCur - 1)}>
            ◀
          </button>
          <button className="sim-btn" type="button" disabled={safeCur === script.steps.length - 1} onClick={() => setCur(safeCur + 1)}>
            Next step ▶
          </button>
          <span className="sim-pos">
            {safeCur} / {script.steps.length - 1}
          </span>
        </div>
      </div>

      <p className="sim-lede">{script.idea}</p>

      <div className="sim-narr" aria-live="polite">
        <b className="t">{step.title}</b>
        <span>{step.text}</span>
      </div>

      <div className="sim-tx-stage">
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Alice's app holds</span>
          <span className="sim-lab-value">{step.phone}</span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">The server</span>
          <span className="sim-lab-value">{step.server}</span>
        </div>
        <div className={`sim-tx-ledger${step.storeUsed ? ' held' : ''}`}>
          <span className="sim-tx-name">Shared store</span>
          <span className="sim-lab-value">{step.store}</span>
        </div>
      </div>

      <div className="sim-grid">
        <div className="sim-store">
          <h3>
            <span>Store lookups so far</span>
          </h3>
          <div className={`sim-tx-reader ${step.lookups ? 'wait' : 'ok'}`}>
            {step.lookups}
            <span>{step.lookups ? 'a network call for each request' : 'no network call needed'}</span>
          </div>
        </div>
        <div className="sim-store">
          <h3>
            <span>Would a stolen copy work right now?</span>
          </h3>
          <div className={`sim-tx-reader ${step.stolenWorks}`}>
            {step.stolenWorks === 'short' ? 'Yes' : 'No'}
            <span>{safeCur === 0 ? 'nothing has been issued yet' : step.stolenWorks === 'short' ? 'the server would accept it' : 'the server has cancelled it'}</span>
          </div>
          <div className="sim-tx-strip" aria-label="Whether a stolen copy works at each step">
            {script.steps.map((st, i) => (
              <button key={st.title} type="button" className={`${st.stolenWorks}${i === safeCur ? ' cur' : ''}`} aria-label={`Step ${i}`} onClick={() => setCur(i)} />
            ))}
          </div>
          <div className="sim-tx-legend">
            <span className="ok">safe</span>
            <span className="short">a thief gets in</span>
          </div>
        </div>
      </div>

      <TokenWidget />
    </div>
  )
}
