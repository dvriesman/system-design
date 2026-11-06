// Part 3 of the OAuth page: the same two attacks against a budgeting app on Alice's phone, through five designs.
export type Mode = 'implicit' | 'code' | 'secret' | 'pkce' | 'verified'

// Actor ids reuse the colour classes in sim.css: cons = the budget app, svc = the bank, migrator = the malicious app.
export type Actor = 'cons' | 'svc' | 'migrator'
export type Pane = 'app' | 'bank' | 'evil'
export type CodeLine = { id: string; code: string; breakable: boolean }

const line = (id: string, code: string, breakable = false): CodeLine => ({ id, code, breakable })
const usesCode = (m: Mode) => m !== 'implicit'
const usesPkce = (m: Mode) => m === 'pkce' || m === 'verified'
const usesSecret = (m: Mode) => m === 'secret'

const SCHEME_URI = 'budgetapp://callback'
const HTTPS_URI = 'https://budget.example/callback'
export const redirectUriFor = (m: Mode) => (m === 'verified' ? HTTPS_URI : SCHEME_URI)
const SECRET = 'sk_4f9a'

function proofArg(m: Mode, name: 'app' | 'evil'): string {
  if (usesSecret(m)) return name === 'app' ? ', clientSecret' : ', stolenSecret'
  if (usesPkce(m)) return name === 'app' ? ', verifier' : ', myVerifier'
  return ''
}

function appCode(m: Mode): CodeLine[] {
  const code = usesCode(m)
  return [
    line('a00', `val redirectUri = '${redirectUriFor(m)}'${m === 'verified' ? '   // verified by the OS' : ''}`),
    ...(usesSecret(m) ? [line('a01', `val clientSecret = '${SECRET}…'   // ships inside every copy of this app`)] : []),
    line('a1', 'fun connect() {'),
    line('a2', '  state = random()', true),
    ...(usesPkce(m)
      ? [line('a3', '  verifier = random()   // stays on this phone', true), line('a4', '  val challenge = base64url(sha256(verifier))', true)]
      : []),
    line('a5', `  openBrowser(bank.authorize, clientId, redirectUri, state${usesPkce(m) ? ', challenge' : ''}${code ? '' : ", type = 'token'"})`, true),
    line('a6', '}'),
    line('a7', `fun onRedirect(${code ? 'code' : 'token'}, returnedState) {`),
    line('a8', '  if (returnedState != state) return   // not a login I started', true),
    ...(code ? [line('a9', `  val token = bank.token(code, clientId${proofArg(m, 'app')})`, true)] : []),
    line('a10', '  save(token)', true),
    line('a11', '  bank.accounts(token)', true),
    line('a12', '}'),
  ]
}

function bankCode(m: Mode): CodeLine[] {
  const code = usesCode(m)
  return [
    line('b1', `fun authorize(clientId, redirectUri, state${usesPkce(m) ? ', challenge' : ''}) {`),
    line('b2', '  if (redirectUri != client.registeredUri) return 400', true),
    line('b3', '  val user = loginAndConsent()   // the password stays here', true),
    line('b4', code ? '  val code = random()' : '  val token = sign(user, scope)', true),
    line('b5', code ? `  codes.put(code, { user, clientId${usesPkce(m) ? ', challenge' : ''}, expires: 60s })` : "  tokens.put(token, clientId)", true),
    line('b6', code ? '  redirect(redirectUri, code, state)' : '  redirect(redirectUri, token, state)   // the token is in the URL', true),
    line('b7', '}'),
    ...(code
      ? [
          line('t1', `fun token(code, clientId${usesSecret(m) ? ', secret' : usesPkce(m) ? ', verifier' : ''}) {`),
          line('t2', '  val row = codes.get(code)', true),
          line('t3', '  if (row == null || row.expired) return 400'),
          line('t4', '  if (row.used) { tokens.revokeFrom(code); return 400 }'),
          ...(usesSecret(m) ? [line('t5', '  if (secret != client.secret) return 401', true)] : []),
          ...(usesPkce(m) ? [line('t6', '  if (base64url(sha256(verifier)) != row.challenge) return 400', true)] : []),
          line('t7', '  codes.markUsed(code)', true),
          line('t8', '  val token = sign(row.user, scope)', true),
          line('t9', '  tokens.put(token, code)', true),
          line('t10', '  return token', true),
          line('t11', '}'),
        ]
      : []),
    line('x1', 'fun accounts(token) {'),
    line('x2', '  val user = verify(token)', true),
    line('x3', '  if (user == null) return 401'),
    line('x4', '  return transactions(user)', true),
    line('x5', '}'),
  ]
}

function evilCode(m: Mode): CodeLine[] {
  const code = usesCode(m)
  const pkce = usesPkce(m)
  const verified = m === 'verified'
  return [
    line('m0', verified ? `// can't claim ${HTTPS_URI}: it doesn't own the domain` : `// also registers ${SCHEME_URI}`),
    ...(usesSecret(m) ? [line('m01', 'val stolenSecret = unpack(budgetApp).clientSecret')] : []),
    line('m6', `fun onRedirect(${code ? 'code' : 'token'}) {${verified ? '   // the OS never calls this now' : ''}`),
    ...(code ? [line('m7', `  val token = bank.token(code, budgetClientId${proofArg(m, 'evil')})`)] : []),
    line('m8', '  bank.accounts(token)'),
    line('m9', '}'),
    line('m1', 'fun poseAsBudgetApp() {'),
    ...(pkce ? [line('m2', '  myVerifier = random()'), line('m3', '  val myChallenge = base64url(sha256(myVerifier))')] : []),
    line('m4', `  openBrowser(bank.authorize, budgetClientId, redirectUri, myState${pkce ? ', myChallenge' : ''}${code ? '' : ", type = 'token'"})`),
    line('m5', '}'),
  ]
}

export const CODE: Record<Mode, Record<Pane, CodeLine[]>> = {
  implicit: { app: appCode('implicit'), bank: bankCode('implicit'), evil: evilCode('implicit') },
  code: { app: appCode('code'), bank: bankCode('code'), evil: evilCode('code') },
  secret: { app: appCode('secret'), bank: bankCode('secret'), evil: evilCode('secret') },
  pkce: { app: appCode('pkce'), bank: bankCode('pkce'), evil: evilCode('pkce') },
  verified: { app: appCode('verified'), bank: bankCode('verified'), evil: evilCode('verified') },
}

const PANE_PREFIX: Record<Pane, string> = { app: 'A', bank: 'B', evil: 'M' }

export function lineRef(id: string, mode: Mode): string {
  for (const pane of ['app', 'bank', 'evil'] as Pane[]) {
    const i = CODE[mode][pane].findIndex((l) => l.id === id)
    if (i >= 0) return `${PANE_PREFIX[pane]}${i + 1}`
  }
  return ''
}

type LogEntry = { actor: Actor | 'crash' | 'system'; text: string }
export type CodeRow = { code: string; challenge: string | null; used: boolean; startedBy: string }
export type TokenRow = { token: string; holder: string; code: string | null; revoked: boolean }

export type SimState = {
  url: string | null
  app: { state: string | null; verifier: string | null; token: string | null }
  evil: { secret: string | null; code: string | null; verifier: string | null; token: string | null }
  codes: CodeRow[]
  tokens: TokenRow[]
  readByApp: number
  readByEvil: number
  intercept: 'not yet' | 'stolen' | 'refused' | 'never received'
  pose: 'not yet' | 'stolen' | 'blocked'
  tokenInUrl: boolean
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

export function checks(s: SimState): CheckResult[] {
  return [
    [
      'A caught redirect gives no access',
      s.intercept === 'never received'
        ? 'The malicious app never received it'
        : s.intercept === 'refused'
          ? 'The malicious app caught the code, and the bank refused it'
          : 'If the malicious app catches the redirect, it still gets no data',
      s.intercept === 'stolen' ? 'bad' : s.intercept === 'not yet' ? 'wait' : 'ok',
    ],
    [
      "Another app can't pose as the real one",
      'A login started by the malicious app in the budget app\'s name gets it nothing',
      s.pose === 'stolen' ? 'bad' : s.pose === 'not yet' ? 'wait' : 'ok',
    ],
    [
      'Tokens stay out of the browser',
      s.tokenInUrl ? 'An access token has travelled in a redirect URL' : 'Only a short-lived code ever appears in a URL',
      s.tokenInUrl ? 'bad' : !s.settled ? 'wait' : 'ok',
    ],
  ]
}

export function verdictText(mode: Mode, s: SimState): string {
  const crash = s.crashes ? ' The crash cost a retry, and nothing else: no check changed.' : ''
  const read = `The malicious app read Alice's transactions ${s.readByEvil} time${s.readByEvil === 1 ? '' : 's'}.`
  switch (mode) {
    case 'implicit':
      return `Fails every check. The redirect carried a working access token, so catching it was enough. ${read} The token can also end up in browser history and logs.${crash}`
    case 'code':
      return `The token no longer appears in a URL, but the code is all anyone needs to get one, and the bank can't tell who is redeeming it. ${read}${crash}`
    case 'secret':
      return `Nothing improved. Every phone has a copy of the "secret", so the attacker unpacked one and sent it with the stolen code. ${read}${crash}`
    case 'pkce':
      return `PKCE did its job: the caught code was useless without the verifier. But PKCE only proves that whoever redeems a code also started that login. It doesn't prove which app started it. The malicious app started its own login in the budget app's name, using its own verifier, and it worked. ${read}${crash}`
    default:
      return `Every check holds. PKCE makes a caught code useless, and the verified redirect means the OS delivers codes only to the real app. A login started by the malicious app reached the real app, which discarded it because of the state check. This relies on the OS doing the domain check, and it doesn't help on a compromised phone.${crash}`
  }
}

export const verdictIsBad = (_mode: Mode, s: SimState) => checks(s).some((c) => c[2] === 'bad')

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

const INTRO: Record<Mode, string> = {
  implicit: 'The older shortcut: the bank puts the access token straight into the redirect URL.',
  code: 'The bank sends back a short-lived code, and the app swaps it for a token over a direct call. There is no proof of who is swapping it.',
  secret: 'The same flow, with the usual fix for web servers: a client secret, here shipped inside the app.',
  pkce: 'The app creates a one-time verifier, and sends only its hash at the start. Redeeming the code needs the original.',
  verified: "PKCE, plus a redirect to an https address that the OS only delivers to the app that proves it owns the domain.",
}

export function build(mode: Mode, crashId: string | null): Step[] {
  const s: SimState = {
    url: null,
    app: { state: null, verifier: null, token: null },
    evil: { secret: null, code: null, verifier: null, token: null },
    codes: [],
    tokens: [],
    readByApp: 0,
    readByEvil: 0,
    intercept: 'not yet',
    pose: 'not yet',
    tokenInUrl: false,
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
      text: `${INTRO[mode]} The story is the same in every mode: Alice connects a budgeting app to her bank, but she also has a malicious app on her phone. Press Step, or click a gutter dot to kill a process just before that line.`,
      crash: false,
      locals: {},
    },
  ]

  let locals: Record<string, string> = {}
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }
  const NAME: Record<Actor, string> = { cons: 'Budget app', svc: 'Bank', migrator: 'Malicious app' }
  const push = (id: string | null, actor: Actor | 'system', label: string, title: string, text: string | null, fn?: (st: SimState) => void, isCrash = false) => {
    if (fn) fn(s)
    const who = actor === 'system' ? 'system' : NAME[actor]
    s.log.push({ actor: isCrash ? 'crash' : actor, text: `[${who}] ${title}` })
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
    locals = {}
  }

  let nextState = 1
  let nextVerifier = 1
  let nextCode = 1
  let nextToken = 1
  const redirectUri = redirectUriFor(mode)
  const authUrl = (uri: string, state: string, challenge: string | null) =>
    `bank.example/authorize?client_id=budget-app&redirect_uri=${uri}&state=${state}${challenge ? `&code_challenge=${challenge}` : ''}${usesCode(mode) ? '' : '&response_type=token'}`

  // ---- the bank: /authorize
  type Issued = { kind: 'ok'; value: string; state: string } | { kind: 'crash' } | { kind: 'rejected' }
  const authorize = (starter: 'app' | 'evil', uri: string, state: string, challenge: string | null): Issued => {
    const genuine = starter === 'app'
    const hit = (id: string) => genuine && crashAt(id)
    const callerLocals = locals
    locals = { clientId: "'budget-app'", redirectUri: `'${uri}'`, state: `'${state}'` }
    if (challenge) setLocal('challenge', `'${challenge}'`)

    if (hit('b2')) {
      die('b2', 'svc', "The bank's login page never loaded. Alice sees an error, and nothing has been stored.")
      return { kind: 'crash' }
    }
    const allowed = uri === redirectUri
    push(
      'b2',
      'svc',
      allowed ? 'uri ok' : '400',
      allowed ? 'The redirect address matches the registered one exactly' : 'That redirect address is not registered: returns 400',
      allowed
        ? genuine
          ? 'The bank will only ever send a code to an address registered for this client, compared as an exact string.'
          : `It matches because the malicious app sent the budget app's real address. Nothing in this request shows which app sent it.`
        : 'The bank only sends codes to addresses registered for this client, so the malicious app can\'t simply ask for its own.',
    )
    if (!allowed) {
      locals = callerLocals
      return { kind: 'rejected' }
    }

    if (hit('b3')) {
      die('b3', 'svc', 'Alice was on the login page and sees an error. Nothing has been stored, so she simply starts again.')
      return { kind: 'crash' }
    }
    setLocal('user', "'alice'")
    push(
      'b3',
      'svc',
      'consent',
      genuine ? "Alice logs in on the bank's own page and approves read access" : 'Alice logs in and approves, because everything looks right',
      genuine
        ? 'Her password goes only to the bank. The consent screen says "Budget app wants to read your transactions".'
        : 'A notification said "Reconnect your bank". She sees the real bank and the real budget app name, because the bank really is being asked on behalf of that client. Nothing looks wrong.',
    )

    if (hit('b4')) {
      die('b4', 'svc', 'Alice approved, but the bank died before issuing anything. Nothing was stored, so she starts again.')
      return { kind: 'crash' }
    }
    let value: string
    if (usesCode(mode)) {
      value = `code-${nextCode++}`
      setLocal('code', `'${value}'`)
      push('b4', 'svc', 'new code', 'Generates a one-time code', "It's only a random value. It isn't a token, and it's worth nothing unless it can be redeemed.")
    } else {
      value = `tok-${nextToken++}`
      setLocal('token', `{ sub: 'alice', scope: 'read' } + signature`)
      push('b4', 'svc', 'sign', 'Signs an access token straight away', "No second step comes later, so this is the credential itself, about to go through the browser.")
    }

    if (hit('b5')) {
      die('b5', 'svc', usesCode(mode) ? 'The code was never stored, so it can never be redeemed. Alice starts again.' : 'The token was never recorded or delivered. Alice starts again.')
      return { kind: 'crash' }
    }
    if (usesCode(mode)) {
      push('b5', 'svc', 'store', challenge ? 'Stores the code along with the challenge' : 'Stores the code', challenge ? 'The bank keeps the hash, and will compare against it when the code comes back. It has never seen the verifier itself.' : 'Nothing here ties this code to the app that started the login, so anyone holding it can redeem it.', (st) => {
        st.codes.push({ code: value, challenge, used: false, startedBy: genuine ? 'Budget app' : 'Malicious app' })
      })
    } else {
      push('b5', 'svc', 'store', 'Records the token as issued', 'From here, whoever holds this string is treated as the budget app.', (st) => {
        st.tokens.push({ token: value, holder: 'in a URL', code: null, revoked: false })
      })
    }

    if (hit('b6')) {
      die('b6', 'svc', usesCode(mode) ? 'The code is stored but never left the bank. It simply expires, and Alice starts again.' : "The token is recorded but never left the bank. Nobody holds it, so it's harmless. Alice starts again.")
      return { kind: 'crash' }
    }
    const resultUrl = usesCode(mode) ? `${uri}?code=${value}&state=${state}` : `${uri}#token=${value}&state=${state}`
    push(
      'b6',
      'svc',
      'redirect',
      usesCode(mode) ? 'Redirects the browser back with the code' : 'Redirects the browser back with the token',
      usesCode(mode)
        ? "This travels through the browser and the OS, so assume it can be seen. That's why a code, and not a token, travels this way."
        : 'A working credential is now in a URL, which can end up in browser history, logs and Referer headers.',
      (st) => {
        st.url = resultUrl
        if (!usesCode(mode)) st.tokenInUrl = true
      },
    )
    locals = callerLocals
    return { kind: 'ok', value, state }
  }

  // ---- the bank: /token
  type Redeemed = { kind: 'token'; token: string } | { kind: 'refused' } | { kind: 'bankDied' }
  const redeem = (actor: 'cons' | 'migrator', code: string, proof: string | null): Redeemed => {
    const genuine = actor === 'cons'
    const hit = (id: string) => genuine && crashAt(id)
    const callerLocals = locals
    const done = (r: Redeemed): Redeemed => {
      locals = callerLocals
      return r
    }
    locals = { code: `'${code}'`, clientId: "'budget-app'" }
    if (usesSecret(mode)) setLocal('secret', proof ? `'${proof}…'` : 'null')
    if (usesPkce(mode)) setLocal('verifier', proof ? `'${proof}'` : 'null')

    if (hit('t2')) {
      die('t2', 'svc', 'The bank died before reading the code. Nothing changed, so the code is still good.')
      return done({ kind: 'bankDied' })
    }
    const row = s.codes.find((c) => c.code === code)!
    setLocal('row', `{ used: ${row.used}${row.challenge ? `, challenge: '${row.challenge}'` : ''} }`)
    push('t2', 'svc', 'lookup', `Finds ${code}`, genuine ? 'A direct HTTPS call from the app to the bank, which never passes through the browser.' : `To the bank this is a normal request for client budget-app. It can't see which app on the phone sent it.`)
    push('t3', 'svc', 'check', 'The code exists and has not expired: condition is false', 'Codes last only moments, which limits the time anyone has to use a leaked one.')
    if (row.used) {
      const revoked = s.tokens.filter((t) => t.code === code && !t.revoked).length
      push('t4', 'svc', '400', 'This code was already used: refuses it', revoked ? 'A second use looks like theft, so the bank refuses and also revokes the token already issued from this code. It can\'t tell a retry from an attacker.' : 'A code works once. The earlier attempt burned it, even though no token ever came back, so this retry is refused.', (st) => {
        st.tokens.forEach((t) => {
          if (t.code === code) t.revoked = true
        })
      })
      return done({ kind: 'refused' })
    }
    push('t4', 'svc', 'check', 'The code has not been used: condition is false', 'This is its first and only valid use.')

    if (usesSecret(mode)) {
      if (hit('t5')) {
        die('t5', 'svc', 'The bank died before checking the secret. Nothing changed, so the code is still good.')
        return done({ kind: 'bankDied' })
      }
      push('t5', 'svc', 'check', 'The secret matches: condition is false', genuine ? 'On a web server, this check would prove who is calling, because only that server holds the secret.' : `The attacker sent the same secret every copy of the app contains. The check passes, and it has proved nothing.`)
    }
    if (usesPkce(mode)) {
      if (hit('t6')) {
        die('t6', 'svc', 'The bank died before checking the verifier. Nothing changed, so the code is still good.')
        return done({ kind: 'bankDied' })
      }
      const hashed = `hash(${proof ?? 'null'})`
      const match = hashed === row.challenge
      setLocal('computed', `'${hashed}'`)
      push(
        't6',
        'svc',
        match ? 'match' : '400',
        match ? 'The hash of the verifier matches: condition is false' : 'The hash does not match the challenge: returns 400',
        match
          ? genuine
            ? 'Only the app that started this login could have this verifier, because it has never been sent until now.'
            : "It matches because the malicious app started this login itself, so it holds the right verifier. PKCE proves that the same party started and finished the login, and says nothing about who that party is."
          : "The malicious app has the code, but it never saw the verifier, and it can't work backwards from a hash. The stolen code is useless.",
      )
      if (!match) return done({ kind: 'refused' })
    }

    if (hit('t7')) {
      die('t7', 'svc', 'The bank died before marking the code as used, and before issuing anything. The code is still good.')
      return done({ kind: 'bankDied' })
    }
    push('t7', 'svc', 'mark used', `Marks ${code} as used`, 'From now on, any other attempt with this code is refused.', (st) => {
      st.codes.find((c) => c.code === code)!.used = true
    })
    if (hit('t8')) {
      die('t8', 'svc', 'The code is burned, but no token was issued. The app gets an error.')
      return done({ kind: 'bankDied' })
    }
    const token = `tok-${nextToken++}`
    setLocal('token', `{ sub: 'alice', scope: 'read' } + signature`)
    push('t8', 'svc', 'sign', `Signs ${token}`, genuine ? 'Scoped to reading transactions. It can\'t move money, whatever the app asks.' : 'A genuine token, for the budget app\'s client ID, held by the wrong app. The bank has no way to know.')
    if (hit('t9')) {
      die('t9', 'svc', 'The code is burned, and the token was never recorded or returned. The app gets an error.')
      return done({ kind: 'bankDied' })
    }
    push('t9', 'svc', 'store', `Records ${token}, linked to ${code}`, 'Remembering which code produced it lets the bank revoke this token if the code is ever replayed.', (st) => {
      st.tokens.push({ token, holder: NAME[actor], code, revoked: false })
    })
    if (hit('t10')) {
      die('t10', 'svc', 'The token was issued but never delivered. The app gets an error and has no way to know that.')
      return done({ kind: 'bankDied' })
    }
    push('t10', 'svc', 'return', `Returns ${token}`, genuine ? 'It comes back on the direct call, so it never appears in a URL.' : 'The bank has just handed a real token to the malicious app.')
    return done({ kind: 'token', token })
  }

  // ---- the bank: /accounts
  const accounts = (actor: 'cons' | 'migrator', token: string): boolean => {
    const genuine = actor === 'cons'
    const hit = (id: string) => genuine && crashAt(id)
    locals = { token: `'${token}'` }
    if (hit('x2')) {
      die('x2', 'svc', 'The read failed. The token is fine, so the app simply calls again.')
      locals = { token: `'${token}'` }
    }
    setLocal('user', "'alice'")
    push('x2', 'svc', 'verify', 'The token is valid: it belongs to Alice', genuine ? 'The bank checks the signature and the read scope.' : 'The token is genuine, so this works. The bank only knows that the token is valid, not who is holding it.')
    push('x3', 'svc', 'check', 'User found: condition is false', 'The request continues.')
    if (hit('x4')) {
      die('x4', 'svc', 'The read failed before returning anything. Reading twice is harmless, so the app simply calls again.')
      locals = { token: `'${token}'`, user: "'alice'" }
    }
    push('x4', 'svc', genuine ? 'read' : 'leak', genuine ? "The budget app reads Alice's transactions" : "The malicious app reads Alice's transactions", genuine ? 'This is exactly what Alice approved, and all she approved. Her password was never involved.' : 'Her salary, rent and spending, all without her password, and using a consent screen she really did approve.', (st) => {
      if (genuine) st.readByApp++
      else st.readByEvil++
    })
    return true
  }

  // ---- the malicious app receives a redirect
  const evilReceives = (value: string, kind: 'intercept' | 'pose') => {
    locals = usesCode(mode) ? { code: `'${value}'` } : { token: `'${value}'` }
    if (kind === 'pose' && usesPkce(mode)) setLocal('myVerifier', `'${s.evil.verifier}'`)
    if (kind === 'intercept' && usesPkce(mode)) setLocal('myVerifier', 'null')
    push(
      'm6',
      'migrator',
      'caught',
      usesCode(mode) ? `The OS hands ${value} to the malicious app` : 'The OS hands the token to the malicious app',
      'Both apps registered the same address, and the OS doesn\'t guarantee which one receives it.',
      (st) => {
        if (usesCode(mode)) st.evil.code = value
        else {
          st.evil.token = value
          st.tokens.find((t) => t.token === value)!.holder = 'Malicious app'
        }
      },
    )
    let token: string | null = usesCode(mode) ? null : value
    if (usesCode(mode)) {
      const proof = usesSecret(mode) ? s.evil.secret : usesPkce(mode) ? (kind === 'pose' ? s.evil.verifier : null) : null
      push(
        'm7',
        'migrator',
        'redeem',
        'Tries to redeem the code at the bank',
        usesPkce(mode)
          ? kind === 'pose'
            ? 'This time it has the verifier, because it started this login itself.'
            : "It has the code, but not the verifier. That was never sent anywhere."
          : usesSecret(mode)
            ? 'It sends the code along with the secret it unpacked from its own copy of the app.'
            : 'A code is all this design asks for.',
      )
      const res = redeem('migrator', value, proof)
      if (res.kind === 'token') {
        token = res.token
        setLocal('token', `'${res.token}'`)
        s.evil.token = res.token
      }
    }
    if (token) {
      setLocal('token', `'${token}'`)
      push('m8', 'migrator', 'call', 'Calls the bank with the token', "To the bank, this is the budget app making a normal call.")
      accounts('migrator', token)
      if (kind === 'intercept') s.intercept = 'stolen'
      else s.pose = 'stolen'
      steps[steps.length - 1].s = clone(s)
    } else {
      s.intercept = 'refused'
      push(null, 'system', 'refused', 'The malicious app gets nothing', 'It held the code the whole time, and that was not enough.')
    }
  }

  // ---- the budget app receives a redirect. Returns true once the app is connected.
  const appReceives = (value: string, returnedState: string): boolean => {
    locals = usesCode(mode) ? { code: `'${value}'` } : { token: `'${value}'` }
    setLocal('returnedState', `'${returnedState}'`)
    setLocal('state', s.app.state ? `'${s.app.state}'` : 'null')
    if (crashAt('a8')) {
      die('a8', 'cons', usesCode(mode) ? 'The app was killed before it handled the redirect. The code was never redeemed, so it just expires.' : 'The app was killed before it handled the redirect, so the token was never saved. It stays valid, and it is still in the URL.')
      return false
    }
    const match = s.app.state === returnedState
    push(
      'a8',
      'cons',
      match ? 'state ok' : 'discard',
      match ? 'The state matches the one it generated' : 'The state does not match: the app discards the redirect',
      match
        ? 'So this is the answer to a login this app really started, and not something an attacker pushed at it.'
        : "The app didn't start this login, so it throws the code away. This is the same check that stops an attacker planting their own code in your app.",
    )
    if (!match) return true

    let token = value
    if (usesCode(mode)) {
      if (crashAt('a9')) {
        die('a9', 'cons', 'The app was killed before redeeming the code. The code just expires.')
        return false
      }
      const proof = usesSecret(mode) ? SECRET : usesPkce(mode) ? s.app.verifier : null
      push('a9', 'cons', 'exchange', 'Sends the code to the bank', usesPkce(mode) ? 'The verifier is revealed for the first time, on a direct call and not through the browser.' : 'A direct call, not through the browser.')
      let res = redeem('cons', value, proof)
      while (res.kind === 'bankDied') {
        push(null, 'system', 'retry', 'The app gets an error, and retries with the same code', 'A network error tells the app nothing about how far the bank got. If the code wasn\'t burned, this simply works.')
        res = redeem('cons', value, proof)
      }
      if (res.kind !== 'token') {
        push(null, 'system', 'restart', 'The app must start the login again', "A used code can't be retried, so Alice taps Connect once more. It's annoying, and it's the safe failure.")
        return false
      }
      token = res.token
    }
    setLocal('token', `'${token}'`)

    if (crashAt('a10')) {
      const lost = s.tokens.find((t) => t.token === token)
      if (lost) lost.holder = 'nobody: lost in the crash'
      die('a10', 'cons', usesCode(mode) ? 'The bank issued a token, but the app died before saving it. The token is lost in memory.' : 'The app died before saving the token. Nobody holds it now, though it was in the URL.')
      if (usesCode(mode)) {
        push(null, 'system', 'replay', 'The app restarts, and tries the saved code again', 'A natural-looking recovery. But to the bank, a second use of a code looks exactly like an attack.')
        const again = redeem('cons', value, usesSecret(mode) ? SECRET : usesPkce(mode) ? s.app.verifier : null)
        if (again.kind !== 'token') {
          push(null, 'system', 'restart', 'The app must start the login again', 'Retrying a code never helps. A safe client treats a failed exchange as "start the login over".')
        }
      } else {
        push(null, 'system', 'restart', 'The app must start the login again', 'It has no token, and nothing to redeem.')
      }
      return false
    }
    push('a10', 'cons', 'save', 'Saves the token in the OS keychain', 'From now on, the app sends this token and never touches the password.', (st) => {
      st.app.token = token
      const row = st.tokens.find((t) => t.token === token)
      if (row) row.holder = 'Budget app'
    })
    if (crashAt('a11')) {
      die('a11', 'cons', 'The token was already saved, so after restarting the app simply carries on.')
      locals = { token: `'${token}'` }
    }
    push('a11', 'cons', 'call', 'Calls the bank with the token', 'A normal API call from here on.')
    accounts('cons', token)
    return true
  }

  // ---- Alice's login, started by the real app
  const connect = (deliverTo: 'evil' | 'app') => {
    for (;;) {
      locals = {}
      if (crashAt('a2')) {
        die('a2', 'cons', 'Nothing has happened yet.')
        push(null, 'system', 'retry', 'Alice taps Connect again', 'A new attempt, with new values.')
        continue
      }
      const state = `st-${nextState++}`
      setLocal('state', `'${state}'`)
      push('a2', 'cons', 'state', 'Generates a random state value', 'It will come back on the redirect, so the app can confirm that this is an answer to its own request.', (st) => {
        st.app.state = state
      })
      let challenge: string | null = null
      if (usesPkce(mode)) {
        if (crashAt('a3')) {
          die('a3', 'cons', 'Nothing has left the phone yet.')
          push(null, 'system', 'retry', 'Alice taps Connect again', 'A new attempt, with new values.')
          continue
        }
        const verifier = `ver-${nextVerifier++}`
        setLocal('verifier', `'${verifier}'`)
        push('a3', 'cons', 'verifier', 'Generates a random verifier', 'A new secret for this one login. Unlike a client secret, it isn\'t in the app\'s download, so unpacking the app won\'t reveal it.', (st) => {
          st.app.verifier = verifier
        })
        if (crashAt('a4')) {
          die('a4', 'cons', 'Nothing has left the phone yet.')
          push(null, 'system', 'retry', 'Alice taps Connect again', 'A new attempt, with new values.')
          continue
        }
        challenge = `hash(${verifier})`
        setLocal('challenge', `'${challenge}'`)
        push('a4', 'cons', 'challenge', 'Hashes it to make the challenge', "The hash can be shown to anyone: it can't be reversed to get the verifier.")
      }
      if (crashAt('a5')) {
        die('a5', 'cons', 'The browser never opened.')
        push(null, 'system', 'retry', 'Alice taps Connect again', 'A new attempt, with new values.')
        continue
      }
      const url = authUrl(redirectUri, state, challenge)
      push('a5', 'cons', 'browser', "Opens the bank's page in the system browser", "The app never gets to see what Alice types there. Note what's in the URL, because everything in it should be treated as public.", (st) => {
        st.url = url
      })
      const issued = authorize('app', redirectUri, state, challenge)
      if (issued.kind !== 'ok') {
        push(null, 'system', 'retry', 'Alice taps Connect again', 'A new attempt, with new values.')
        continue
      }
      if (deliverTo === 'evil') {
        evilReceives(issued.value, 'intercept')
        return
      }
      if (mode === 'verified') {
        push(null, 'system', 'verified', 'The OS delivers the redirect only to the budget app', `The address is https, and the app proved to the OS that it owns budget.example. The malicious app can't claim this address, so it receives nothing.`, (st) => {
          if (st.intercept === 'not yet') st.intercept = 'never received'
        })
      }
      if (appReceives(issued.value, issued.state)) return
      push(null, 'system', 'retry', 'Alice taps Connect again', 'A new attempt, with new values.')
    }
  }

  // ---- the story
  if (usesSecret(mode)) {
    locals = {}
    setLocal('stolenSecret', `'${SECRET}…'`)
    push('m01', 'migrator', 'unpack', 'The attacker downloads the budget app and unpacks it', 'The app is public, and anyone can read what\'s inside. There is no way to ship a secret to every phone and keep it secret.', (st) => {
      st.evil.secret = SECRET
    })
  }

  connect(mode === 'verified' ? 'app' : 'evil')
  if (mode !== 'verified') {
    push(null, 'system', 'try again', "Alice's connection seems to fail, so she tries again", 'From her side, the budget app just never opened. This time, the OS happens to deliver the redirect to the right app.')
    connect('app')
  }

  // The malicious app starts a login of its own in the budget app's name.
  push(null, 'system', 'lure', 'The malicious app shows a notification: "Reconnect your bank"', 'A different attack. It no longer waits to catch a login: it starts its own, using the public client ID of the budget app.')
  locals = {}
  const myState = 'evil-st'
  let myChallenge: string | null = null
  if (usesPkce(mode)) {
    setLocal('myVerifier', "'evil-ver'")
    push('m2', 'migrator', 'verifier', 'Generates its own verifier', 'PKCE values are made fresh by whichever app starts the login, and nothing stops this one from making its own.', (st) => {
      st.evil.verifier = 'evil-ver'
    })
    myChallenge = 'hash(evil-ver)'
    setLocal('myChallenge', `'${myChallenge}'`)
    push('m3', 'migrator', 'challenge', 'Hashes it to make its own challenge', 'To the bank, this looks like any other challenge.')
  }
  if (mode === 'verified') {
    const evilUri = 'evilapp://callback'
    push('m4', 'migrator', 'browser', 'First, it asks the bank to redirect to its own address', "It would be simplest if the code just came to the malicious app's own address.", (st) => {
      st.url = authUrl(evilUri, myState, myChallenge)
    })
    authorize('evil', evilUri, myState, myChallenge)
    locals = {}
    if (myChallenge) setLocal('myChallenge', `'${myChallenge}'`)
  }
  push('m4', 'migrator', 'browser', mode === 'verified' ? "So it tries the budget app's real address instead" : "Opens the bank's page in the budget app's name", mode === 'verified' ? 'The bank will accept this, but the redirect will go to wherever the OS sends that address.' : 'The client ID is public, and so is the redirect address. Nothing here reveals who is really asking.', (st) => {
    st.url = authUrl(redirectUri, myState, myChallenge)
  })
  const posed = authorize('evil', redirectUri, myState, myChallenge)
  if (posed.kind === 'ok') {
    if (mode === 'verified') {
      push(null, 'system', 'verified', 'The OS delivers the redirect to the real budget app', 'The malicious app started this login, but it has no way to receive the answer.')
      appReceives(posed.value, posed.state)
      s.pose = 'blocked'
      steps[steps.length - 1].s = clone(s)
    } else {
      evilReceives(posed.value, 'pose')
    }
  }

  locals = {}
  s.settled = true
  push(null, 'system', 'end', 'Run finished', verdictText(mode, s))
  return steps
}

export type Experiment = { label: string; title: string; mode: Mode; crash: string | null }

export const EXPERIMENTS: Experiment[] = [
  {
    label: 'A token in the address bar',
    title: 'The bank puts the token straight in the redirect. Catching it is enough, and every check breaks.',
    mode: 'implicit',
    crash: null,
  },
  {
    label: 'Whoever has the code wins',
    title: 'A code alone can be redeemed by anyone. The bank has no idea which app is asking.',
    mode: 'code',
    crash: null,
  },
  {
    label: 'A secret on every phone',
    title: 'The attacker unpacks the public app, then sends the same secret. The check passes and proves nothing.',
    mode: 'secret',
    crash: null,
  },
  {
    label: 'PKCE stops the theft, not the disguise',
    title: "The caught code is useless. But the malicious app starts its own login with its own verifier, and that works.",
    mode: 'pkce',
    crash: null,
  },
  {
    label: 'Only the real app gets the code',
    title: 'A verified https redirect closes the last gap. The disguised login reaches the real app, which discards it.',
    mode: 'verified',
    crash: null,
  },
  {
    label: 'Die before saving the token',
    title: 'The app retries its code after a crash. The bank sees a replay, refuses it, and revokes the token. Alice logs in again.',
    mode: 'verified',
    crash: 'a10',
  },
  {
    label: 'The bank burns the code',
    title: 'The bank marks the code as used, then dies before issuing a token. The retry is refused, so the only way forward is a new login.',
    mode: 'pkce',
    crash: 't8',
  },
]
