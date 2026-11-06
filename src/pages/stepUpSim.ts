// Part 3 of the Step-Up page: one day in Alice's account, with an attacker copying her tokens, through five designs.
export type Mode = 'login' | 'ui' | 'acr' | 'recent' | 'bound'

// Actor ids reuse the colour classes in sim.css.
export type Actor = 'cons' | 'svc' | 'relay' | 'migrator'
export type Pane = 'client' | 'api' | 'auth' | 'evil'
export type CodeLine = { id: string; code: string; breakable: boolean }

const line = (id: string, code: string, breakable = false): CodeLine => ({ id, code, breakable })
const challenges = (m: Mode) => m === 'acr' || m === 'recent' || m === 'bound'
const checksRecent = (m: Mode) => m === 'recent' || m === 'bound'
const isBound = (m: Mode) => m === 'bound'

const START_BALANCE = 20000
const STOLEN = 5000
const MAX_AGE_MIN = 5
const ATTACKER_ACCOUNT = 'attacker-acct'
export const fmt = (n: number) => `$${n.toLocaleString('en-US')}`
export const clockText = (minutes: number) => {
  const total = 9 * 60 + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function clientCode(m: Mode): CodeLine[] {
  return [
    line('c1', 'fun pay(amount, to) {'),
    line('c2', '  val key = newIdempotencyKey()'),
    ...(m === 'ui' ? [line('c3', '  if (!auth.checkCode(askForCode())) return   // only this screen checks')] : []),
    line('c4', '  var res = api.withdraw(token, amount, to, key)', true),
    ...(challenges(m)
      ? [
          line('c5', '  if (res.ok) return res'),
          line('c6', isBound(m) ? '  val needed = res.approvalNeeded' : '  val needed = parse(res.wwwAuthenticate)'),
          line('c7', `  token = auth.stepUp(needed${isBound(m) ? ', amount, to' : ''})`),
          line('c8', '  res = api.withdraw(token, amount, to, key)', true),
        ]
      : []),
    line('c9', '  return res'),
    line('c10', '}'),
  ]
}

function apiCode(m: Mode): CodeLine[] {
  return [
    line('r1', 'fun balance(token) = ledger.balance(verify(token).sub)'),
    line('p1', 'fun withdraw(token, amount, to, key) {'),
    line('p2', '  val claims = verify(token)', true),
    line('p3', '  if (claims == null) return 401'),
    line('p4', '  ledger.findByKey(key)?.let { return it }   // a retry', true),
    ...(challenges(m) ? [line('p5', "  if (claims.acr != 'mfa') return challenge(acr_values = 'mfa')", true)] : []),
    ...(checksRecent(m) ? [line('p6', '  if (now - claims.auth_time > 300) return challenge(max_age = 300)', true)] : []),
    ...(isBound(m)
      ? [
          line('p7', '  if (claims.approved != { amount, to }) return 403 approvalNeeded(amount, to)', true),
          line('p8', '  if (approvals.isUsed(claims.txn)) return 403', true),
          line('p9', '  ledger.debitAndUseApproval(key, amount, to, claims.txn)   // one transaction', true),
        ]
      : [line('p9', '  ledger.debit(key, amount, to)', true)]),
    line('p10', '  return 200', true),
    line('p11', '}'),
  ]
}

function authCode(m: Mode): CodeLine[] {
  return [
    line('l1', 'fun login(user, password) {'),
    line('l2', '  checkPassword(user, password)'),
    line('l3', "  return sign({ sub: user, acr: 'pwd', auth_time: now })"),
    line('l4', '}'),
    ...(m === 'ui' ? [line('k1', 'fun checkCode(code) {'), line('k2', '  return totp.matches(user, code)'), line('k3', '}')] : []),
    ...(challenges(m)
      ? [
          line('s1', `fun stepUp(needed${isBound(m) ? ', amount, to' : ''}) {`),
          line('s2', isBound(m) ? '  askSecondFactor(user, showing = "Send $amount to $to?")' : '  askSecondFactor(user)', true),
          line(
            's3',
            isBound(m)
              ? "  return sign({ sub: user, acr: 'mfa', auth_time: now, approved: { amount, to }, txn: randomId() })"
              : "  return sign({ sub: user, acr: 'mfa', auth_time: now })",
            true,
          ),
          line('s4', '}'),
        ]
      : []),
    line('f1', 'fun refresh(refreshToken) {'),
    line('f2', '  val old = tokens.find(refreshToken)'),
    line('f3', '  return sign({ sub: old.sub, acr: old.acr, auth_time: old.auth_time })   // both carry over'),
    line('f4', '}'),
  ]
}

function evilCode(m: Mode): CodeLine[] {
  return [
    line('m1', 'val stolen = copyTokensFrom(aliceApp)   // a malicious browser extension'),
    line('m2', `val res = api.withdraw(stolen.token, 5000, '${ATTACKER_ACCOUNT}', newKey())`),
    line('m3', 'stolen.token = auth.refresh(stolen.refresh)'),
    ...(isBound(m)
      ? [
          line('m4', `auth.stepUp(res.approvalNeeded, 5000, '${ATTACKER_ACCOUNT}')   // asks Alice's phone`),
          line('m5', "api.withdraw(stolen.token, 120, 'power-co', newKey())   // replays her approval"),
        ]
      : []),
  ]
}

export const CODE: Record<Mode, Record<Pane, CodeLine[]>> = {
  login: { client: clientCode('login'), api: apiCode('login'), auth: authCode('login'), evil: evilCode('login') },
  ui: { client: clientCode('ui'), api: apiCode('ui'), auth: authCode('ui'), evil: evilCode('ui') },
  acr: { client: clientCode('acr'), api: apiCode('acr'), auth: authCode('acr'), evil: evilCode('acr') },
  recent: { client: clientCode('recent'), api: apiCode('recent'), auth: authCode('recent'), evil: evilCode('recent') },
  bound: { client: clientCode('bound'), api: apiCode('bound'), auth: authCode('bound'), evil: evilCode('bound') },
}

const PANE_PREFIX: Record<Pane, string> = { client: 'C', api: 'A', auth: 'K', evil: 'M' }

export function lineRef(id: string, mode: Mode): string {
  for (const pane of ['client', 'api', 'auth', 'evil'] as Pane[]) {
    const i = CODE[mode][pane].findIndex((l) => l.id === id)
    if (i >= 0) return `${PANE_PREFIX[pane]}${i + 1}`
  }
  return ''
}

export type Token = { id: string; acr: 'pwd' | 'mfa'; authTime: number; approved: { amount: number; to: string } | null; txn: string | null }
export type LedgerRow = { key: string; amount: number; to: string; by: string }
type LogEntry = { actor: Actor | 'crash' | 'system'; text: string }
type Attack = 'not yet' | 'stolen' | 'blocked'

export type SimState = {
  clock: number
  balance: number
  stolen: number
  app: Token | null
  attacker: Token | null
  ledger: LedgerRow[]
  usedApprovals: string[]
  phone: string | null
  attack1: Attack
  attack2: Attack
  attack3: Attack
  settled: boolean
  crashes: number
  log: LogEntry[]
}

export type Step = {
  s: SimState
  line: string | null
  actor: Actor | 'system' | null
  label: string
  title: string
  text: string | null
  crash: boolean
  locals: Record<string, string>
}

export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']
const attackStatus = (a: Attack): 'ok' | 'bad' | 'wait' => (a === 'stolen' ? 'bad' : a === 'blocked' ? 'ok' : 'wait')

export function checks(s: SimState): CheckResult[] {
  return [
    ["A stolen login token can't withdraw", 'A token from a password login alone is not enough to move money', attackStatus(s.attack1)],
    ["An old second factor isn't enough", "Hours after Alice's second factor, a refreshed token can't withdraw", attackStatus(s.attack2)],
    ['An approval covers only what Alice approved', 'Right after she approves a payment, the same token still can\'t send anything else', attackStatus(s.attack3)],
  ]
}

export function verdictText(mode: Mode, s: SimState): string {
  const crash = s.crashes ? ' The crash cost a retry, and the same idempotency key meant no payment went through twice.' : ''
  const lost = `The attacker took ${fmt(s.stolen)}.`
  switch (mode) {
    case 'login':
      return `A password login was enough to withdraw anything, so the copied token was too. ${lost}${crash}`
    case 'ui':
      return `Alice saw code prompts all day, and they protected nothing. The attacker called the API directly, and the API never checks. ${lost} A security check that only runs on a screen is a user experience, not a control.${crash}`
    case 'acr':
      return `The login token was refused, which is a real gain. But the token says "mfa" forever, because acr and auth_time carry over when a token is renewed. A second factor from 09:05 was still opening the door at 15:00. ${lost}${crash}`
    case 'recent':
      return `The old token was refused, so the attacker now has only minutes to act. But it took the chance: right after Alice approved her $120 bill, her token could withdraw anything for 5 minutes. ${lost} Her approval was for "it's me", not for this payment.${crash}`
    default:
      return `Every check holds. A token now approves one amount to one payee, once. Alice's phone showed the attacker's real amount and account, so she declined. This still depends on Alice reading the prompt and on the prompt being shown on something the attacker doesn't control. It doesn't help if she is talked into approving a real payment to a fraudster.${crash}`
  }
}

export const verdictIsBad = (_mode: Mode, s: SimState) => checks(s).some((c) => c[2] === 'bad')

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

const INTRO: Record<Mode, string> = {
  login: 'Authentication happens once, at login. After that, any valid token can do anything.',
  ui: 'The app asks for a code before a withdrawal. The API is unchanged.',
  acr: 'The API itself refuses to withdraw unless the token says a second factor was used, and it sends back the RFC 9470 challenge.',
  recent: 'The same challenge, plus a limit on how long ago the second factor happened.',
  bound: 'Alice approves one exact payment on her phone, and the resulting token works only for that payment, once.',
}

export function build(mode: Mode, crashId: string | null): Step[] {
  const s: SimState = {
    clock: 0,
    balance: START_BALANCE,
    stolen: 0,
    app: null,
    attacker: null,
    ledger: [],
    usedApprovals: [],
    phone: null,
    attack1: 'not yet',
    attack2: 'not yet',
    attack3: 'not yet',
    settled: false,
    crashes: 0,
    log: [],
  }
  const steps: Step[] = [
    {
      s: clone(s),
      line: null,
      actor: null,
      label: 'start',
      title: 'Ready',
      text: `${INTRO[mode]} The story is the same in every mode: Alice uses her bank through the day, and a malicious browser extension copies every token her app holds. Press Step, or click a gutter dot to kill a process just before that line.`,
      crash: false,
      locals: {},
    },
  ]

  let locals: Record<string, string> = {}
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }
  const NAME: Record<Actor, string> = { cons: "Alice's app", svc: 'Bank API', relay: 'Login server', migrator: 'Attacker' }
  const push = (id: string | null, actor: Actor | 'system', label: string, title: string, text: string | null, fn?: (st: SimState) => void, isCrash = false) => {
    if (fn) fn(s)
    const who = actor === 'system' ? 'system' : NAME[actor]
    s.log.push({ actor: isCrash ? 'crash' : actor, text: `[${clockText(s.clock)}] [${who}] ${title}` })
    steps.push({ s: clone(s), line: id, actor, label, title, text, crash: isCrash, locals: actor === 'system' ? {} : { ...locals } })
  }

  let crashed = false
  const crashAt = (id: string) => {
    if (!crashed && crashId === id) {
      crashed = true
      return true
    }
    return false
  }
  const die = (id: string, actor: Actor, text: string) => {
    push(id, actor, 'CRASH', `${NAME[actor]} process killed`, text, (st) => {
      st.crashes++
    }, true)
  }

  let nextToken = 1
  let nextTxn = 1
  const newToken = (acr: 'pwd' | 'mfa', authTime: number, approved: Token['approved'] = null, txn: string | null = null): Token => ({
    id: `tok-${nextToken++}`,
    acr,
    authTime,
    approved,
    txn,
  })
  const claimsText = (t: Token) =>
    `{ acr: '${t.acr}', auth_time: ${clockText(t.authTime)}${t.approved ? `, approved: ${fmt(t.approved.amount)} to ${t.approved.to}, txn: ${t.txn}` : ''} }`

  // ---- the API
  type ApiResult = { kind: 'ok' } | { kind: 'challenge'; needed: string } | { kind: 'refused' } | { kind: 'crash' }
  const withdraw = (actor: 'cons' | 'migrator', tok: Token, amount: number, to: string, key: string): ApiResult => {
    const genuine = actor === 'cons'
    const hit = (id: string) => genuine && crashAt(id)
    const who = genuine ? 'Alice' : 'the attacker'
    locals = { token: `'${tok.id}'`, amount: fmt(amount), to: `'${to}'`, key: `'${key}'` }

    if (hit('p2')) {
      die('p2', 'svc', 'Nothing has happened yet, so the app can safely retry.')
      return { kind: 'crash' }
    }
    setLocal('claims', claimsText(tok))
    push('p2', 'svc', 'verify', 'The signature is valid', genuine ? 'The API reads what the token says about how the user authenticated.' : "It's a genuine token, so the API can't tell it was copied. Everything now depends on what the next lines check.")
    push('p3', 'svc', 'check', 'Claims found: condition is false', 'The request continues.')

    if (hit('p4')) {
      die('p4', 'svc', 'Nothing has happened yet, so the app can safely retry.')
      return { kind: 'crash' }
    }
    const previous = s.ledger.find((r) => r.key === key)
    push('p4', 'svc', previous ? 'replay' : 'new key', previous ? 'This key was already processed: returns the earlier result' : 'A new idempotency key: this is not a retry', previous ? 'The money moved before the crash, so the retry gets the earlier answer, and nothing is debited twice.' : 'If the process dies after moving money, a retry with this key is safe.')
    if (previous) return { kind: 'ok' }

    if (challenges(mode)) {
      if (hit('p5')) {
        die('p5', 'svc', 'Nothing has happened yet, so the app can safely retry.')
        return { kind: 'crash' }
      }
      if (tok.acr !== 'mfa') {
        push('p5', 'svc', '401', "The token says 'pwd', and this needs 'mfa': returns the challenge", genuine ? 'Not an error, but a request: 401 with insufficient_user_authentication, and acr_values="mfa". The app now knows exactly what to ask the login server for.' : "The attacker gets the same challenge, and has no way to answer it. It has Alice's token, but not her second factor.")
        return { kind: 'challenge', needed: `acr_values = 'mfa'` }
      }
      push('p5', 'svc', 'check', "The token says 'mfa': condition is false", mode === 'acr' ? 'That is the only question this design asks. It never asks how long ago that was.' : 'Strong enough, but how recent is it?')
    }
    if (checksRecent(mode)) {
      if (hit('p6')) {
        die('p6', 'svc', 'Nothing has happened yet, so the app can safely retry.')
        return { kind: 'crash' }
      }
      const age = s.clock - tok.authTime
      setLocal('minutesAgo', String(age))
      if (age > MAX_AGE_MIN) {
        push('p6', 'svc', '401', `The second factor was ${age} minute${age === 1 ? '' : 's'} ago: returns the challenge`, genuine ? 'The same 401, now with max_age="300". It was strong enough, but it was too long ago.' : "Refreshing didn't help the attacker, because auth_time records when the user really authenticated.")
        return { kind: 'challenge', needed: 'max_age = 300' }
      }
      push('p6', 'svc', 'check', `The second factor was ${age} minute${age === 1 ? '' : 's'} ago: condition is false`, mode === 'recent' ? 'Recent enough. This design never asks what the second factor was for.' : 'Recent enough, but was it for this payment?')
    }
    if (isBound(mode)) {
      if (hit('p7')) {
        die('p7', 'svc', 'Nothing has happened yet, so the app can safely retry.')
        return { kind: 'crash' }
      }
      const matches = tok.approved?.amount === amount && tok.approved?.to === to
      setLocal('approved', tok.approved ? `${fmt(tok.approved.amount)} to '${tok.approved.to}'` : 'null')
      if (!matches) {
        push('p7', 'svc', '403', 'This token did not approve this payment: asks for an approval', genuine ? `Strong and recent are not enough here: the token must name ${fmt(amount)} to ${to}.` : `The token approves ${tok.approved ? `${fmt(tok.approved.amount)} to ${tok.approved.to}` : 'no payment'}. Stealing it at the perfect moment no longer helps with a different payment.`)
        return { kind: 'challenge', needed: `approval of ${fmt(amount)} to ${to}` }
      }
      push('p7', 'svc', 'check', 'The token approves exactly this payment: condition is false', 'The amount and the payee both match what was approved.')
      if (hit('p8')) {
        die('p8', 'svc', 'Nothing has happened yet, so the app can safely retry.')
        return { kind: 'crash' }
      }
      if (s.usedApprovals.includes(tok.txn ?? '')) {
        push('p8', 'svc', '403', 'This approval was already used: returns 403', 'The amount and payee match, but an approval works once. Paying the power company a second time gets the attacker nothing, and it costs Alice nothing.')
        return { kind: 'refused' }
      }
      push('p8', 'svc', 'check', 'This approval has not been used: condition is false', 'It works once.')
    }

    if (hit('p9')) {
      die('p9', 'svc', 'The money has not moved. A retry starts from the top.')
      return { kind: 'crash' }
    }
    push(
      'p9',
      'svc',
      genuine ? 'debit' : 'theft',
      genuine ? `${fmt(amount)} goes to ${to}` : `${fmt(amount)} leaves Alice's account`,
      isBound(mode)
        ? 'The debit and using up the approval happen in one transaction. A crash can\'t leave a used approval with no payment.'
        : genuine
          ? 'The money moves.'
          : `As far as the bank can tell, this was Alice.`,
      (st) => {
        st.balance -= amount
        st.ledger.push({ key, amount, to, by: genuine ? 'Alice' : 'Attacker' })
        if (!genuine) st.stolen += amount
        if (tok.txn) st.usedApprovals.push(tok.txn)
      },
    )
    if (hit('p10')) {
      die('p10', 'svc', 'The money moved, but the app never heard back. It can\'t tell, so it retries with the same key.')
      return { kind: 'crash' }
    }
    push('p10', 'svc', '200', `Returns 200 to ${who}`, genuine ? 'The payment is done.' : 'The attacker has its money, and no system has noticed anything unusual.')
    return { kind: 'ok' }
  }

  // ---- the login server
  const stepUp = (amount: number, to: string): void => {
    for (;;) {
      const before = locals
      locals = { user: "'alice'" }
      if (isBound(mode)) {
        setLocal('amount', fmt(amount))
        setLocal('to', `'${to}'`)
      }
      if (crashAt('s2')) {
        die('s2', 'relay', 'Alice never got the prompt. Her app shows an error, and she tries again.')
        locals = before
        push(null, 'system', 'retry', 'Alice tries again', 'Nothing has moved, so starting this step again is safe.')
        continue
      }
      const prompt = isBound(mode) ? `Send ${fmt(amount)} to ${to}?` : "Confirm it's you"
      push('s2', 'relay', 'approve', `Alice's phone shows: "${prompt}", and she approves`, isBound(mode) ? 'She sees the real amount and the real payee, so she knows exactly what she is approving.' : "She confirms it's her, and nothing on the prompt says what this is for.", (st) => {
        st.phone = `${prompt} → approved`
      })
      if (crashAt('s3')) {
        die('s3', 'relay', 'She approved, but no token was issued. Her app shows an error, and she has to approve again. Nothing has moved.')
        locals = before
        push(null, 'system', 'retry', 'Alice tries again', 'Nothing has moved, so starting this step again is safe.')
        continue
      }
      const txn = isBound(mode) ? `txn-${nextTxn++}` : null
      const token = newToken('mfa', s.clock, isBound(mode) ? { amount, to } : null, txn)
      setLocal('token', claimsText(token))
      push('s3', 'relay', 'sign', `Issues ${token.id} with acr = 'mfa'`, isBound(mode) ? 'The token names the payment. It\'s no use for anything else.' : `It records how and when she authenticated. It stays this way for as long as this login is renewed.`, (st) => {
        st.app = token
      })
      locals = before
      return
    }
  }

  // ---- Alice pays
  const pay = (amount: number, to: string, key: string) => {
    locals = { amount: fmt(amount), to: `'${to}'`, key: `'${key}'` }
    push('c2', 'cons', 'pay', `Alice pays ${fmt(amount)} to ${to}`, `A new idempotency key for this payment. See the Idempotency Keys page for why.`)
    if (mode === 'ui') {
      push('k2', 'relay', 'code', "The app asks Alice for a code, and it's correct", 'She sees a security prompt, so this feels safe. Nothing about the next request depends on it, though.', (st) => {
        st.phone = 'Enter your code → correct'
      })
      locals = { amount: fmt(amount), to: `'${to}'`, key: `'${key}'` }
      push('c3', 'cons', 'code ok', 'The code was correct: the app carries on', 'The result lives only in this screen. The token is unchanged, so the API learns nothing.')
    }
    const call = (lineId: 'c4' | 'c8'): ApiResult => {
      for (;;) {
        const callerLocals = locals
        if (crashAt(lineId)) {
          die(lineId, 'cons', 'The app died before the request went out. On restart, it sends the same request with the same key.')
          locals = callerLocals
          continue
        }
        push(lineId, 'cons', 'call', lineId === 'c4' ? 'Calls the API with the current token' : 'Repeats the request with the new token', lineId === 'c4' ? "The app doesn't inspect the token. It just tries, and lets the API decide." : 'The same amount, payee and idempotency key.')
        const r = withdraw('cons', s.app!, amount, to, key)
        locals = callerLocals
        if (r.kind === 'crash') {
          push(null, 'system', 'retry', 'The app gets no answer, and retries with the same key', 'The key makes this safe, whichever line the API died on.')
          continue
        }
        return r
      }
    }
    const first = call('c4')
    if (challenges(mode)) {
      push('c5', 'cons', first.kind === 'ok' ? 'done' : 'not ok', first.kind === 'ok' ? 'The payment went through without a prompt' : 'The API asked for more', first.kind === 'ok' ? "The token already satisfied the API, so Alice wasn't asked for anything." : 'The app follows the challenge, rather than failing.')
      if (first.kind === 'challenge') {
        setLocal('needed', first.needed)
        push('c6', 'cons', 'parse', `The API needs: ${first.needed}`, isBound(mode) ? 'RFC 9470 stops at strength and recency, so this part is an API-specific response.' : 'This comes from the WWW-Authenticate header, so the app never has to read the token, which RFC 9470 says it must not do.')
        push('c7', 'cons', 'step up', 'Sends Alice to the login server for a stronger login', 'She stays logged in. This only adds to what her token says about her, and the app passes on what the API asked for.')
        stepUp(amount, to)
        call('c8')
      }
    }
    push('c9', 'cons', 'paid', `Alice's payment to ${to} is complete`, 'From her side, this was one payment, with whatever prompt the API asked for.')
    locals = {}
  }

  // ---- the attacker
  const steal = (when: string) => {
    locals = {}
    const same = s.attacker?.id === s.app?.id
    setLocal('stolen.token', `'${s.app!.id}'`)
    push('m1', 'migrator', 'copy', `The extension copies Alice's tokens ${when}`, same ? 'Nothing new: her app is still using the same token.' : `It now has ${s.app!.id}, and the refresh token. To every server, it can now act as Alice.`, (st) => {
      st.attacker = st.app ? { ...st.app } : null
    })
  }
  const attack = (name: 'attack1' | 'attack2' | 'attack3', key: string): ApiResult => {
    const tok = s.attacker!
    locals = { 'stolen.token': `'${tok.id}'` }
    push('m2', 'migrator', 'attack', `Tries to withdraw ${fmt(STOLEN)}`, `A direct call to the API. It doesn't use the app's screens at all.`)
    const r = withdraw('migrator', tok, STOLEN, ATTACKER_ACCOUNT, key)
    s[name] = r.kind === 'ok' ? 'stolen' : 'blocked'
    steps[steps.length - 1].s = clone(s)
    locals = {}
    return r
  }

  // ---- the story
  locals = { user: "'alice'" }
  push('l2', 'relay', 'password', 'Alice logs in with her password', 'This morning she only needs to look at her balance.')
  const firstToken = newToken('pwd', 0)
  setLocal('token', claimsText(firstToken))
  push('l3', 'relay', 'sign', `Issues ${firstToken.id} with acr = 'pwd'`, 'The token records how she logged in, and when.', (st) => {
    st.app = firstToken
  })
  locals = { token: `'${firstToken.id}'` }
  push('r1', 'svc', 'read', `Alice sees her balance: ${fmt(s.balance)}`, 'Reading needs no extra step, so she is not interrupted. Step-up applies only to what is worth protecting.')

  push(null, 'system', 'time', 'A minute passes', 'Alice leaves the app open, with the extension still running in her browser.', (st) => {
    st.clock = 1
  })
  steal('this morning')
  attack('attack1', 'evil-1')

  push(null, 'system', 'time', 'Four minutes later, Alice pays her rent', 'This is her first payment today, so she needs to move money for the first time.', (st) => {
    st.clock = 5
  })
  pay(800, 'landlord', 'key-rent')
  steal('again')

  push(null, 'system', 'time', 'Six hours pass', 'Access tokens are short-lived, so both the app and the attacker renew theirs.', (st) => {
    st.clock = 360
  })
  const old = s.attacker!
  locals = { 'stolen.refresh': `'refresh-of-${old.id}'` }
  push('m3', 'migrator', 'refresh', 'The attacker renews its token with the stolen refresh token', "Alice's app renews its token in the same way.")
  locals = { 'old.acr': `'${old.acr}'`, 'old.auth_time': clockText(old.authTime) }
  push('f2', 'relay', 'lookup', 'Finds the login behind this refresh token', 'It looks like an ordinary renewal, because it is one.')
  const renewed = newToken(old.acr, old.authTime)
  push('f3', 'relay', 'renew', `Issues ${renewed.id}, and it keeps the original claims`, `RFC 9470 says acr and auth_time don't change when a token is renewed, because they describe the original authentication. So this new token still says ${old.acr} at ${clockText(old.authTime)}.`, (st) => {
    st.attacker = renewed
    st.app = { ...renewed, id: `tok-${nextToken}` }
  })
  nextToken++
  attack('attack2', 'evil-2')

  push(null, 'system', 'time', 'A minute later, Alice pays her electricity bill', 'She last used her second factor at 09:05, about six hours ago.', (st) => {
    st.clock = 361
  })
  pay(120, 'power-co', 'key-power')
  steal('right after her approval')
  push(null, 'system', 'time', 'A minute later, the attacker makes its move', 'It is using the token from just after her second factor, which is the best moment an attacker could hope for.', (st) => {
    st.clock = 362
  })
  const third = attack('attack3', 'evil-3')

  if (isBound(mode) && third.kind === 'challenge') {
    locals = { amount: fmt(STOLEN), to: `'${ATTACKER_ACCOUNT}'` }
    push('m4', 'migrator', 'prompt', "Asks the login server to prompt Alice's phone", "If a prompt only says \"Confirm it's you\", tired users sometimes tap yes. Let's see what this one says.")
    locals = { user: "'alice'", amount: fmt(STOLEN), to: `'${ATTACKER_ACCOUNT}'` }
    push('s2', 'relay', 'declined', `Alice's phone shows: "Send ${fmt(STOLEN)} to ${ATTACKER_ACCOUNT}?", and she declines`, 'She can see this is not her payment. This is why the prompt has to show the amount and the payee.', (st) => {
      st.phone = `Send ${fmt(STOLEN)} to ${ATTACKER_ACCOUNT}? → declined`
    })
    const tok = s.attacker!
    locals = { 'stolen.token': `'${tok.id}'` }
    push('m5', 'migrator', 'replay', "Replays Alice's exact approved payment", 'One last idea: this token does approve $120 to the power company.')
    withdraw('migrator', tok, 120, 'power-co', 'evil-4')
    locals = {}
  }

  s.settled = true
  locals = {}
  push(null, 'system', 'end', 'Run finished', verdictText(mode, s))
  return steps
}

export type Experiment = { label: string; title: string; mode: Mode; crash: string | null }

export const EXPERIMENTS: Experiment[] = [
  { label: 'Login is all it takes', title: 'A token from a password login can withdraw anything, so a copied one can too.', mode: 'login', crash: null },
  { label: 'A prompt that protects nothing', title: 'The app asks Alice for codes all day. The attacker calls the API directly and is never asked.', mode: 'ui', crash: null },
  { label: "A second factor that never ages", title: "The API demands 'mfa', but a token renewed six hours later still says 'mfa'.", mode: 'acr', crash: null },
  { label: 'Five minutes is plenty', title: "The old token is refused, but the attacker strikes right after Alice's approval, with the token she just earned.", mode: 'recent', crash: null },
  { label: 'She sees what she approves', title: 'Each approval names one amount and payee, once. The attacker asks her phone, she sees its account, and she declines.', mode: 'bound', crash: null },
  { label: 'Die after the money moved', title: 'The API debits, then dies before replying. The retry uses the same key, so nothing is paid twice.', mode: 'bound', crash: 'p10' },
  { label: 'Die after she approved', title: "The login server dies between Alice's approval and the token. She approves again, and no money has moved.", mode: 'bound', crash: 's3' },
]
