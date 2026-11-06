import { useState } from 'react'

type Scheme = 'login' | 'challenge' | 'bound'
type Danger = 'ok' | 'short'

type LabStep = {
  title: string
  text: string
  exchange: string
  token: string
  phone: string
  money: string
  stolen: Danger
  stolenNote: string
}

const NO_CALL = 'no request yet'
const WITHDRAW = 'POST /withdrawals\nAuthorization: Bearer <token>\n{ "amount": 800, "to": "landlord" }'

const SCRIPTS: Record<Scheme, { label: string; idea: string; steps: LabStep[] }> = {
  login: {
    label: '1 · Login only',
    idea: 'Like a wristband at a venue: you show ID once at the door, and after that the wristband gets you everywhere inside, including places that should need more than that.',
    steps: [
      {
        title: 'Start: Alice wants to check her balance',
        text: 'She opens her bank in the browser. Most of what she does today is low risk, so a password is a reasonable amount of friction.',
        exchange: NO_CALL,
        token: 'none',
        phone: 'quiet',
        money: '$20,000',
        stolen: 'ok',
        stolenNote: 'nothing to steal yet',
      },
      {
        title: 'She logs in, and gets a token that records how',
        text: 'The token holds two facts about this login: how she authenticated (acr) and when (auth_time). So far, nothing reads them.',
        exchange: 'POST /login → token',
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: 'quiet',
        money: '$20,000',
        stolen: 'short',
        stolenNote: 'the API accepts any valid token',
      },
      {
        title: 'She reads her balance',
        text: 'Reading is fine at this level, and no prompt appears.',
        exchange: 'GET /balance\n\nHTTP/1.1 200 OK',
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: 'quiet',
        money: '$20,000',
        stolen: 'short',
        stolenNote: 'the API accepts any valid token',
      },
      {
        title: 'She pays her rent, and the same token moves the money',
        text: 'The API checks that the token is valid, and nothing else. The moment that matters most gets the same check as reading a balance, so whoever holds this token can empty the account.',
        exchange: `${WITHDRAW}\n\nHTTP/1.1 200 OK`,
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: 'quiet',
        money: '$19,200',
        stolen: 'short',
        stolenNote: 'the API accepts any valid token',
      },
    ],
  },
  challenge: {
    label: '2 · The API challenges',
    idea: "Like being asked for ID again at the door of the vault. You're already inside the bank, and nobody throws you out. This one door just needs more. RFC 9470 standardizes how the API asks.",
    steps: [
      {
        title: 'Start: the same login, and the same token',
        text: "Alice logs in with her password, and reads her balance with no prompts. The API has one new rule: a withdrawal needs a second factor in the last 5 minutes.",
        exchange: 'GET /balance\n\nHTTP/1.1 200 OK',
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: 'quiet',
        money: '$20,000',
        stolen: 'ok',
        stolenNote: "'pwd' isn't enough to withdraw",
      },
      {
        title: 'She pays her rent, and the API says what it needs',
        text: "This isn't a failure. The status is 401, and the header says exactly what's missing: a level, a maximum age, or both. The app reads this header and never has to look inside the token.",
        exchange: `${WITHDRAW}\n\nHTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer\n  error="insufficient_user_authentication",\n  error_description="A different authentication level is required",\n  acr_values="mfa", max_age="300"`,
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: 'quiet',
        money: '$20,000',
        stolen: 'ok',
        stolenNote: "'pwd' isn't enough to withdraw",
      },
      {
        title: 'The app sends her to the login server, and passes that on',
        text: 'A normal authorization request, carrying what the API asked for. The login server already knows who she is, so it asks only for what is missing.',
        exchange: 'GET /authorize?client_id=bank-app\n  &acr_values=mfa&max_age=300&…',
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: "Confirm it's you",
        money: '$20,000',
        stolen: 'ok',
        stolenNote: "'pwd' isn't enough to withdraw",
      },
      {
        title: 'She approves, and gets a new token',
        text: 'She approves on her phone. The new token says a second factor was used, and when. She never left her session.',
        exchange: 'POST /token → new token',
        token: "{ acr: 'mfa', auth_time: 09:05 }",
        phone: "Confirm it's you → approved",
        money: '$20,000',
        stolen: 'short',
        stolenNote: 'for the next 5 minutes, this token can withdraw anything',
      },
      {
        title: 'The app repeats the request, and it works',
        text: 'The same request, with the new token. The API sees a strong and recent login, and the rent is paid.',
        exchange: `${WITHDRAW}\n\nHTTP/1.1 200 OK`,
        token: "{ acr: 'mfa', auth_time: 09:05 }",
        phone: 'quiet',
        money: '$19,200',
        stolen: 'short',
        stolenNote: 'for the next 5 minutes, this token can withdraw anything',
      },
      {
        title: 'Six hours later, the same token is no longer enough',
        text: "Renewing the token doesn't help, because it keeps the original acr and auth_time. The API sees a login that was strong but old, and this time it asks only for a recent one.",
        exchange: 'POST /withdrawals …\n\nHTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer\n  error="insufficient_user_authentication",\n  error_description="More recent authentication is required",\n  max_age="300"',
        token: "{ acr: 'mfa', auth_time: 09:05 }",
        phone: 'quiet',
        money: '$19,200',
        stolen: 'ok',
        stolenNote: 'too old: a thief would get a challenge',
      },
    ],
  },
  bound: {
    label: '3 · Approve this payment',
    idea: 'Like signing one cheque instead of confirming your identity: the signature only means something for that payee and that amount. RFC 9470 stops at "strong and recent", so this part is your own design.',
    steps: [
      {
        title: 'The gap: tab 2 proves who Alice is, not what she wants',
        text: "Look at the last prompt: \"Confirm it's you.\" For the next 5 minutes, that token can send any amount anywhere. Anything that can read tokens in her browser only has to wait for that moment.",
        exchange: 'GET /balance\n\nHTTP/1.1 200 OK',
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: 'quiet',
        money: '$20,000',
        stolen: 'ok',
        stolenNote: 'no approval, so no withdrawal',
      },
      {
        title: 'She pays her rent, and the API asks for this exact payment',
        text: 'The API replies that this amount to this payee needs approval. RFC 9470 has no standard field for that, so the response is specific to your API.',
        exchange: `${WITHDRAW}\n\nHTTP/1.1 403 Forbidden\n{ "error": "approval_needed",\n  "approve": { "amount": 800, "to": "landlord" } }`,
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: 'quiet',
        money: '$20,000',
        stolen: 'ok',
        stolenNote: 'no approval, so no withdrawal',
      },
      {
        title: 'Her phone shows the amount and the payee',
        text: "\"Send $800 to landlord?\" She's now approving a payment, and not only confirming who she is. If something else had started this, she would see the wrong amount or payee, and could say no.",
        exchange: 'authorization request carrying\n  { "amount": 800, "to": "landlord" }',
        token: "{ acr: 'pwd', auth_time: 09:00 }",
        phone: 'Send $800 to landlord?',
        money: '$20,000',
        stolen: 'ok',
        stolenNote: 'no approval, so no withdrawal',
      },
      {
        title: 'The new token names the payment',
        text: 'The token carries the approved amount and payee, plus a one-time ID. Rich Authorization Requests (RFC 9396) is the standard way to carry details like these in OAuth.',
        exchange: 'POST /token → new token',
        token: "{ acr: 'mfa', auth_time: 09:05, approved: $800 to landlord, txn: t-1 }",
        phone: 'Send $800 to landlord? → approved',
        money: '$20,000',
        stolen: 'ok',
        stolenNote: 'it could only pay $800 to the landlord',
      },
      {
        title: 'The API checks all of it, and the rent is paid',
        text: 'Strong, recent, this amount, this payee, not used yet. The debit and using up the approval happen in one database transaction.',
        exchange: `${WITHDRAW}\n\nHTTP/1.1 200 OK`,
        token: "{ acr: 'mfa', auth_time: 09:05, approved: $800 to landlord, txn: t-1 }",
        phone: 'quiet',
        money: '$19,200',
        stolen: 'ok',
        stolenNote: 'this approval has been used',
      },
    ],
  },
}

const SCHEMES = Object.keys(SCRIPTS) as Scheme[]
type Level = 'pwd' | 'mfa'
type Age = 'recent' | 'old'
type Approval = 'none' | 'rent'
type Request = 'read' | 'rent' | 'attack'

function respond(level: Level, age: Age, approval: Approval, request: Request, bound: boolean): { ok: boolean; text: string; why: string } {
  if (request === 'read') return { ok: true, text: 'HTTP/1.1 200 OK', why: 'Reading a balance needs only a valid token, so Alice is not interrupted.' }
  const need: string[] = []
  if (level !== 'mfa') need.push('acr_values="mfa"')
  if (age === 'old') need.push('max_age="300"')
  if (need.length) {
    return {
      ok: false,
      text: `HTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer\n  error="insufficient_user_authentication",\n  ${need.join(', ')}`,
      why: level !== 'mfa' ? 'The token never had a second factor, so the API asks for one.' : 'The second factor happened too long ago, so the API asks for a fresh one.',
    }
  }
  if (bound) {
    const matches = approval === 'rent' && request === 'rent'
    if (!matches) {
      const amount = request === 'rent' ? 800 : 5000
      const to = request === 'rent' ? 'landlord' : 'attacker-acct'
      return {
        ok: false,
        text: `HTTP/1.1 403 Forbidden\n{ "error": "approval_needed",\n  "approve": { "amount": ${amount}, "to": "${to}" } }`,
        why: approval === 'rent' ? 'The token approves $800 to the landlord, and nothing else.' : "The login is strong and recent, but Alice hasn't approved this payment.",
      }
    }
  }
  return {
    ok: true,
    text: 'HTTP/1.1 200 OK',
    why:
      request === 'attack'
        ? 'A strong, recent login is all this rule asks for, so the attacker gets the money. Turn on the payment rule, and try again.'
        : 'Every rule is met, so the money moves.',
  }
}

function ApiWidget() {
  const [level, setLevel] = useState<Level>('pwd')
  const [age, setAge] = useState<Age>('recent')
  const [approval, setApproval] = useState<Approval>('none')
  const [request, setRequest] = useState<Request>('rent')
  const [bound, setBound] = useState(false)
  const result = respond(level, age, approval, request, bound)

  return (
    <div className="sim-store">
      <h3>
        <span>You are the API</span>
        <span className="sim-tag">the real headers, from RFC 9470</span>
      </h3>
      <p className="sim-small">Choose what the token says and what the request asks for, and see what the API answers.</p>
      <div className="sim-axes">
        <div className="sim-axis">
          <span className="sim-axis-label">Token: acr</span>
          <div className="sim-seg" role="group" aria-label="Authentication level">
            <button type="button" aria-pressed={level === 'pwd'} onClick={() => setLevel('pwd')}>
              password only
            </button>
            <button type="button" aria-pressed={level === 'mfa'} onClick={() => setLevel('mfa')}>
              second factor
            </button>
          </div>
        </div>
        <div className="sim-axis">
          <span className="sim-axis-label">Token: auth_time</span>
          <div className="sim-seg" role="group" aria-label="Authentication time">
            <button type="button" aria-pressed={age === 'recent'} onClick={() => setAge('recent')}>
              2 minutes ago
            </button>
            <button type="button" aria-pressed={age === 'old'} onClick={() => setAge('old')}>
              6 hours ago
            </button>
          </div>
        </div>
        <div className="sim-axis">
          <span className="sim-axis-label">Token: approved</span>
          <div className="sim-seg" role="group" aria-label="Approved payment">
            <button type="button" aria-pressed={approval === 'none'} onClick={() => setApproval('none')}>
              nothing
            </button>
            <button type="button" aria-pressed={approval === 'rent'} onClick={() => setApproval('rent')}>
              $800 to landlord
            </button>
          </div>
        </div>
        <div className="sim-axis">
          <span className="sim-axis-label">Request</span>
          <div className="sim-seg" role="group" aria-label="Request">
            <button type="button" aria-pressed={request === 'read'} onClick={() => setRequest('read')}>
              read balance
            </button>
            <button type="button" aria-pressed={request === 'rent'} onClick={() => setRequest('rent')}>
              $800 to landlord
            </button>
            <button type="button" aria-pressed={request === 'attack'} onClick={() => setRequest('attack')}>
              $5,000 to attacker
            </button>
          </div>
        </div>
        <div className="sim-axis">
          <span className="sim-axis-label">API rules</span>
          <div className="sim-seg" role="group" aria-label="API rules">
            <button type="button" aria-pressed={!bound} onClick={() => setBound(false)}>
              RFC 9470 only
            </button>
            <button type="button" aria-pressed={bound} onClick={() => setBound(true)}>
              + must approve this payment
            </button>
          </div>
        </div>
      </div>
      <pre className="sim-block">{result.text}</pre>
      <div className={`sim-tx-reader ${result.ok && request !== 'attack' ? 'ok' : result.ok ? 'short' : 'wait'}`}>
        {result.ok ? (request === 'attack' ? 'Paid to the attacker' : 'Allowed') : 'The API asks for more'}
        <span>{result.why}</span>
      </div>
    </div>
  )
}

export default function StepUpLab() {
  const [scheme, setScheme] = useState<Scheme>('login')
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
          <span>On the wire</span>
        </h3>
        <pre className="sim-block">{step.exchange}</pre>
      </div>

      <div className="sim-tx-stage">
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">The token says</span>
          <span className="sim-lab-value">{step.token}</span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Alice's phone</span>
          <span className="sim-lab-value">{step.phone}</span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Balance</span>
          <span className="sim-lab-value">{step.money}</span>
        </div>
      </div>

      <div className="sim-store">
        <h3>
          <span>Could a stolen copy of this token withdraw $5,000?</span>
        </h3>
        <div className={`sim-tx-reader ${step.stolen}`}>
          {step.stolen === 'short' ? 'Yes' : 'No'}
          <span>{step.stolenNote}</span>
        </div>
        <div className="sim-tx-strip" aria-label="Whether a stolen copy could withdraw at each step">
          {script.steps.map((st, i) => (
            <button key={st.title} type="button" className={`${st.stolen}${i === safeCur ? ' cur' : ''}`} aria-label={`Step ${i}`} onClick={() => setCur(i)} />
          ))}
        </div>
        <div className="sim-tx-legend">
          <span className="ok">safe</span>
          <span className="short">a thief could withdraw</span>
        </div>
      </div>

      <ApiWidget />
    </div>
  )
}
