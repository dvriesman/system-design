import { useState } from 'react'
import { base64url, s256 } from './sessionsCrypto'

type Scheme = 'password' | 'code' | 'pkce'

type LabStep = {
  title: string
  text: string
  url: string
  app: string
  bank: string
  passwordSeen: boolean
  access: string
  urlGives: string
}

const WEB_AUTHORIZE = 'bank.example/authorize?client_id=budget-app&redirect_uri=https://budget.example/callback&scope=transactions:read&state=x7f2'
const WEB_CALLBACK = 'budget.example/callback?code=c0d3&state=x7f2'
const PHONE_AUTHORIZE = 'bank.example/authorize?client_id=budget-app&redirect_uri=budgetapp://callback&scope=transactions:read&state=x7f2&code_challenge=E9Melhoa2Ow…&code_challenge_method=S256'
const PHONE_CALLBACK = 'budgetapp://callback?code=c0d3&state=x7f2'

const SCRIPTS: Record<Scheme, { label: string; idea: string; steps: LabStep[] }> = {
  password: {
    label: '1 · Share the password',
    idea: "A budgeting app wants to read Alice's bank transactions. The obvious way is the one OAuth exists to replace: give the app her password, like handing a valet your whole key ring to park the car.",
    steps: [
      {
        title: 'Start: an app needs data that lives at the bank',
        text: "The budgeting app and the bank are different companies. To categorize Alice's spending, the app needs her transactions, and the bank only gives them to Alice.",
        url: 'no page open',
        app: 'nothing',
        bank: "Alice's account",
        passwordSeen: false,
        access: 'none',
        urlGives: 'Nothing: no URL yet',
      },
      {
        title: 'The app asks for her bank password',
        text: "Alice types it into the budgeting app's own form. The app has to keep it, because it needs to log in again every day to fetch new data.",
        url: 'no page open',
        app: 'alice + her password',
        bank: "Alice's account",
        passwordSeen: true,
        access: 'none yet',
        urlGives: 'Nothing: the risk here is the password, not a URL',
      },
      {
        title: 'The app logs in as Alice',
        text: "To the bank, this is Alice. It can't tell that an app is logging in, and it can't apply a different rule to it.",
        url: 'no page open',
        app: 'alice + her password',
        bank: 'sees a login from "Alice"',
        passwordSeen: true,
        access: 'everything Alice can do',
        urlGives: 'Nothing: the risk here is the password, not a URL',
      },
      {
        title: 'The app can do everything Alice can',
        text: 'It only needed to read transactions, but it can also move money or change her address. A password has no concept of "read-only".',
        url: 'no page open',
        app: 'alice + her password',
        bank: 'sees a login from "Alice"',
        passwordSeen: true,
        access: 'everything Alice can do',
        urlGives: 'Nothing: the risk here is the password, not a URL',
      },
      {
        title: 'Alice changes her mind, and the only way out is painful',
        text: "To stop this one app, she has to change her password, which also breaks every other app she connected. And if the budgeting company is ever breached, her real bank password is what leaks.",
        url: 'no page open',
        app: 'alice + her old password',
        bank: 'new password set',
        passwordSeen: true,
        access: 'none, and every other app is locked out too',
        urlGives: 'Nothing: the risk here is the password, not a URL',
      },
    ],
  },
  code: {
    label: '2 · Authorization code',
    idea: 'Like a valet key: it starts the car and does nothing else, and you can take it back without changing your locks. The bank issues the app its own limited credential, and the app never sees the password. This tab uses a web app with its own server.',
    steps: [
      {
        title: 'Start: the same goal, with the password kept out of it',
        text: 'Alice clicks "Connect my bank". The budgeting company registered with the bank in advance, so the bank knows this app\'s ID, its exact callback address, and a client secret that only its server holds.',
        url: 'budget.example',
        app: 'client_secret, on its server',
        bank: 'a registration for budget-app',
        passwordSeen: false,
        access: 'none',
        urlGives: 'Nothing: no URL yet',
      },
      {
        title: "The app sends Alice's browser to the bank",
        text: 'A plain redirect. The URL says which app is asking, where to send the answer, what access it wants, and a random state value the app will check later. None of it is secret.',
        url: WEB_AUTHORIZE,
        app: 'client_secret, state = x7f2',
        bank: 'a request from budget-app',
        passwordSeen: false,
        access: 'none',
        urlGives: 'Public details, and no secret',
      },
      {
        title: "Alice logs in on the bank's own page, and approves",
        text: 'She types her password into the bank, not the app. The bank shows: "Budget app wants to read your transactions." This consent step is where she grants the access.',
        url: 'bank.example/login',
        app: 'client_secret, state = x7f2',
        bank: 'Alice approved transactions:read',
        passwordSeen: false,
        access: 'none yet',
        urlGives: "Nothing: the password isn't in a URL",
      },
      {
        title: 'The bank redirects back with a code, not a token',
        text: "The answer has to go through the browser, and URLs end up in history and logs. So the bank sends a code that lasts moments and works once. On its own, it can't be used to read any data.",
        url: WEB_CALLBACK,
        app: 'client_secret, code = c0d3',
        bank: 'code c0d3 → Alice, read-only',
        passwordSeen: false,
        access: 'none yet',
        urlGives: "A code it can't redeem without the client secret",
      },
      {
        title: "The app's server swaps the code for a token, directly",
        text: 'A server-to-server call that never touches the browser. It sends the code plus the client secret, which proves this really is the budgeting company. The bank marks the code as used and returns an access token.',
        url: WEB_CALLBACK,
        app: 'access token',
        bank: 'token issued, code used',
        passwordSeen: false,
        access: 'read transactions',
        urlGives: 'A code that has already been used',
      },
      {
        title: 'The app reads transactions, and nothing else',
        text: 'Reading works. If the app tries to move money, the bank returns 403, because this token was only granted transactions:read. That limit is what the password could never express.',
        url: 'budget.example/dashboard',
        app: 'access token',
        bank: 'token: read-only',
        passwordSeen: false,
        access: 'read transactions',
        urlGives: 'A code that has already been used',
      },
      {
        title: 'Alice removes the app in her bank settings',
        text: 'The bank revokes that one grant. Her password is unchanged, and her other apps keep working.',
        url: 'bank.example/settings',
        app: 'a revoked token',
        bank: 'grant removed',
        passwordSeen: false,
        access: 'none',
        urlGives: 'A code that has already been used',
      },
    ],
  },
  pkce: {
    label: '3 · Add PKCE',
    idea: "Like a coat check where you tear a ticket in half: you show the matching half when you collect. Now the app is on a phone, with no server to hold a secret, so each login makes up its own secret instead. PKCE is usually pronounced \"pixy\".",
    steps: [
      {
        title: 'Start: a phone app has nowhere to hide a secret',
        text: "Anyone can download the app and read what's inside, so a client secret shipped in it isn't secret. Without one, the code from tab 2 is all anyone needs. And on a phone, other apps may be able to catch the redirect.",
        url: 'the budget app, on Alice\'s phone',
        app: 'no secret at all',
        bank: 'a registration for budget-app',
        passwordSeen: false,
        access: 'none',
        urlGives: 'Nothing: no URL yet',
      },
      {
        title: 'The app makes a random verifier, and hashes it',
        text: 'A new random value for this one login, kept on the phone. Hashing it gives the challenge. A hash only works one way, so showing the challenge reveals nothing about the verifier.',
        url: 'the budget app, on Alice\'s phone',
        app: 'verifier = dBjftJeZ4CV…',
        bank: 'a registration for budget-app',
        passwordSeen: false,
        access: 'none',
        urlGives: 'Nothing: nothing has left the phone',
      },
      {
        title: 'The app sends only the challenge to the bank',
        text: 'The hash goes in the URL, and the verifier stays behind. Treat this URL as public: the challenge in it is safe to expose.',
        url: PHONE_AUTHORIZE,
        app: 'verifier = dBjftJeZ4CV…',
        bank: 'a request with a challenge',
        passwordSeen: false,
        access: 'none',
        urlGives: "A hash it can't reverse",
      },
      {
        title: "Alice logs in and approves, and the bank files the challenge with the code",
        text: 'The same login and consent as before. The difference is that the bank stores the challenge next to the code it creates, so the code can only be redeemed by whoever can answer it.',
        url: 'bank.example/login',
        app: 'verifier = dBjftJeZ4CV…',
        bank: 'code c0d3 → E9Melhoa2Ow…',
        passwordSeen: false,
        access: 'none yet',
        urlGives: "Nothing: the password isn't in a URL",
      },
      {
        title: 'The redirect comes back, and another app could catch it',
        text: 'This is the dangerous moment on a phone. Assume a malicious app caught this URL. It now has the code, and it may have seen the challenge. Without PKCE, that would be enough.',
        url: PHONE_CALLBACK,
        app: 'verifier, code = c0d3',
        bank: 'code c0d3 → E9Melhoa2Ow…',
        passwordSeen: false,
        access: 'none yet',
        urlGives: "A code it can't redeem without the verifier",
      },
      {
        title: 'The real app redeems the code and reveals the verifier',
        text: 'For the first time, the verifier leaves the phone, on a direct HTTPS call. The bank hashes it and compares the result with the stored challenge. They match, so the app gets a token.',
        url: PHONE_CALLBACK,
        app: 'access token',
        bank: 'hash(verifier) = challenge ✓',
        passwordSeen: false,
        access: 'read transactions',
        urlGives: 'A code that has already been used',
      },
      {
        title: 'The thief tries the same code, with nothing to answer the challenge',
        text: "It holds the code and the challenge, but not the verifier, and it can't work backwards from a hash. The bank refuses it. Try this for yourself below.",
        url: PHONE_CALLBACK,
        app: 'access token',
        bank: 'refuses the thief',
        passwordSeen: false,
        access: 'read transactions',
        urlGives: 'A code that has already been used, and no verifier',
      },
    ],
  },
}

const SCHEMES = Object.keys(SCRIPTS) as Scheme[]
const RFC_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const GUESS = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function randomVerifier(): string {
  return base64url(Array.from(crypto.getRandomValues(new Uint8Array(32))))
}

function PkceWidget() {
  const [verifier, setVerifier] = useState(RFC_VERIFIER)
  const [method, setMethod] = useState<'S256' | 'plain'>('S256')
  const [sent, setSent] = useState<'verifier' | 'challenge' | 'guess'>('verifier')

  const challenge = method === 'S256' ? s256(verifier) : verifier
  const proof = sent === 'verifier' ? verifier : sent === 'challenge' ? challenge : GUESS
  const computed = method === 'S256' ? s256(proof) : proof
  const accepted = computed === challenge
  const thiefWon = accepted && sent === 'challenge'

  return (
    <div className="sim-store">
      <h3>
        <span>Try to redeem a code</span>
        <span className="sim-tag">real SHA-256, computed as you click</span>
      </h3>
      <p className="sim-small">
        You're playing the attacker, and you've read the URL, so you have the code and the challenge. Only the app has the verifier. Choose what to
        send, and see what the bank computes.
      </p>
      <div className="sim-jwt-parts">
        <div className="h">
          <b>Verifier: only on the phone</b>
          <span className="sim-lab-value">{verifier}</span>
        </div>
        <div className="p">
          <b>Challenge: in the URL</b>
          <span className="sim-lab-value">{challenge}</span>
        </div>
      </div>
      <div className="sim-axes">
        <div className="sim-axis">
          <span className="sim-axis-label">Method</span>
          <div className="sim-seg" role="group" aria-label="Challenge method">
            <button type="button" aria-pressed={method === 'S256'} onClick={() => setMethod('S256')}>
              S256 (hash it)
            </button>
            <button type="button" aria-pressed={method === 'plain'} onClick={() => setMethod('plain')}>
              plain (no hash)
            </button>
          </div>
        </div>
        <div className="sim-axis">
          <span className="sim-axis-label">Send to the bank</span>
          <div className="sim-seg" role="group" aria-label="Value sent to the bank">
            <button type="button" aria-pressed={sent === 'verifier'} onClick={() => setSent('verifier')}>
              the verifier (only the app can)
            </button>
            <button type="button" aria-pressed={sent === 'challenge'} onClick={() => setSent('challenge')}>
              the challenge you saw
            </button>
            <button type="button" aria-pressed={sent === 'guess'} onClick={() => setSent('guess')}>
              a guess
            </button>
          </div>
        </div>
        <div className="sim-axis">
          <span className="sim-axis-label">New login</span>
          <button className="sim-btn ghost" type="button" onClick={() => setVerifier(randomVerifier())}>
            Generate a new verifier
          </button>
        </div>
      </div>
      <div className="sim-jwt-token">
        {method === 'S256' ? 'bank computes base64url(sha256(what you sent))' : 'bank compares what you sent, as it is'} = {computed}
      </div>
      <div className={`sim-tx-reader ${accepted && !thiefWon ? 'ok' : 'short'}`}>
        {accepted ? 'Accepted: the bank issues a token' : 'Refused: it does not match the challenge'}
        <span>
          {thiefWon
            ? 'With plain, the challenge is the verifier. Anyone who read the URL can answer it, so always use S256.'
            : accepted
              ? 'Only the app that started this login holds this value, and it has never been in a URL.'
              : sent === 'challenge'
                ? "Sending the hash doesn't work: the bank hashes it again, and gets something else."
                : "A verifier has at least 256 bits of randomness, so guessing isn't realistic."}
        </span>
      </div>
      <p className="sim-small">The first verifier shown is the example from the PKCE specification (RFC 7636), so you can check this result against it.</p>
    </div>
  )
}

export default function OAuthLab() {
  const [scheme, setScheme] = useState<Scheme>('password')
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

      <div className="sim-store">
        <h3>
          <span>Browser address bar</span>
          <span className="sim-tag">treat everything here as public</span>
        </h3>
        <div className="sim-jwt-token">{step.url}</div>
      </div>

      <div className="sim-tx-stage">
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Budget app holds</span>
          <span className="sim-lab-value">{step.app}</span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">The bank holds</span>
          <span className="sim-lab-value">{step.bank}</span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">What the app can do</span>
          <span className="sim-lab-value">{step.access}</span>
        </div>
      </div>

      <div className="sim-grid">
        <div className="sim-store">
          <h3>
            <span>Has the app seen Alice's password?</span>
          </h3>
          <div className={`sim-tx-reader ${step.passwordSeen ? 'short' : 'ok'}`}>
            {step.passwordSeen ? 'Yes' : 'No'}
            <span>{step.passwordSeen ? 'and it has to keep it' : 'only the bank ever sees it'}</span>
          </div>
        </div>
        <div className="sim-store">
          <h3>
            <span>What would a thief get from this URL?</span>
          </h3>
          <div className="sim-tx-reader wait">{step.urlGives}</div>
          <div className="sim-tx-strip" aria-label="Go to a step">
            {script.steps.map((st, i) => (
              <button key={st.title} type="button" className={`${st.passwordSeen ? 'short' : 'ok'}${i === safeCur ? ' cur' : ''}`} aria-label={`Step ${i}`} onClick={() => setCur(i)} />
            ))}
          </div>
          <div className="sim-tx-legend">
            <span className="ok">password safe</span>
            <span className="short">the app has the password</span>
          </div>
        </div>
      </div>

      <PkceWidget />
    </div>
  )
}
