// Part 3 of the Sessions vs JWTs page: one fixed story, run through five designs.
export type Mode = 'memory' | 'shared' | 'jwt' | 'short' | 'feed'

// Actor ids reuse the colour classes in sim.css: cons = Alice, migrator = the attacker, relay = the bank's staff.
export type Actor = 'cons' | 'migrator' | 'relay'
export type ServerId = 's1' | 's2'
export type CodeLine = { id: string; code: string; breakable: boolean }

const START_BALANCE = 1000
const STOLEN = 400
const WINDOW_MIN = 15
const LONG_MIN = 24 * 60
export const fmt = (n: number) => `$${n.toLocaleString('en-US')}`
export const SERVER_NAME: Record<ServerId, string> = { s1: 'server-1', s2: 'server-2' }
const otherServer = (s: ServerId): ServerId => (s === 's1' ? 's2' : 's1')

const line = (id: string, code: string, breakable = false): CodeLine => ({ id, code, breakable })
const HANDLE_END = [line('h4', '  return serve(request, user)', true), line('h5', '}')]

export const SERVER_CODE: Record<Mode, CodeLine[]> = {
  memory: [
    line('li1', 'fun login(user, password) {'),
    line('li2', '  verifyPassword(user, password)', true),
    line('li3', '  val sid = randomId()', true),
    line('li4', '  memory.put(sid, user)   // this process only', true),
    line('li5', '  return cookie(sid)', true),
    line('li6', '}'),
    line('h1', 'fun handle(request) {'),
    line('h2', '  val user = memory.get(request.sid)', true),
    line('h3', '  if (user == null) return 401'),
    ...HANDLE_END,
    line('rv1', 'fun revokeAll(user) {'),
    line('rv2', '  memory.deleteByUser(user)', true),
    line('rv9', '}'),
  ],
  shared: [
    line('li1', 'fun login(user, password) {'),
    line('li2', '  verifyPassword(user, password)', true),
    line('li3', '  val sid = randomId()', true),
    line('li4', '  store.put(sid, user)   // shared by all servers', true),
    line('li5', '  return cookie(sid)', true),
    line('li6', '}'),
    line('h1', 'fun handle(request) {'),
    line('h2', '  val user = store.get(request.sid)   // network call', true),
    line('h3', '  if (user == null) return 401'),
    ...HANDLE_END,
    line('rv1', 'fun revokeAll(user) {'),
    line('rv2', '  store.deleteByUser(user)', true),
    line('rv9', '}'),
  ],
  jwt: [
    line('li1', 'fun login(user, password) {'),
    line('li2', '  verifyPassword(user, password)', true),
    line('li3', '  val token = sign(user, expires = now + 24.hours)', true),
    line('li5', '  return token', true),
    line('li6', '}'),
    line('h1', 'fun handle(request) {'),
    line('h2', '  val user = verify(request.token)?.sub   // math only', true),
    line('h3', '  if (user == null) return 401'),
    ...HANDLE_END,
    line('rv1', 'fun revokeAll(user) {'),
    line('rv2', '  return OK   // no server holds anything to delete', true),
    line('rv9', '}'),
  ],
  short: [
    line('li1', 'fun login(user, password) {'),
    line('li2', '  verifyPassword(user, password)', true),
    line('li3', '  val token = sign(user, expires = now + 15.min)', true),
    line('li3b', '  val refresh = randomId()'),
    line('li4', '  store.put(refresh, user)', true),
    line('li5', '  return (token, refresh)', true),
    line('li6', '}'),
    line('h1', 'fun handle(request) {'),
    line('h2', '  val user = verify(request.token)?.sub   // math only', true),
    line('h3', '  if (user == null) return 401'),
    ...HANDLE_END,
    line('rf1', 'fun refresh(request) {'),
    line('rf2', '  val user = store.get(request.refresh)', true),
    line('rf3', '  if (user == null) return 401'),
    line('rf4', '  return sign(user, expires = now + 15.min)', true),
    line('rf5', '}'),
    line('rv1', 'fun revokeAll(user) {'),
    line('rv2', '  store.deleteRefreshTokens(user)', true),
    line('rv9', '}'),
  ],
  feed: [
    line('li1', 'fun login(user, password) {'),
    line('li2', '  verifyPassword(user, password)', true),
    line('li3', '  val token = sign(user, expires = now + 15.min)', true),
    line('li3b', '  val refresh = randomId()'),
    line('li4', '  store.put(refresh, user)', true),
    line('li5', '  return (token, refresh)', true),
    line('li6', '}'),
    line('h1', 'fun handle(request) {'),
    line('h2', '  val user = verify(request.token)?.sub   // math only', true),
    line('h3', '  if (user == null) return 401'),
    line('h3b', '  if (revoked.has(user, request.token.iat)) return 401   // memory'),
    ...HANDLE_END,
    line('rf1', 'fun refresh(request) {'),
    line('rf2', '  val user = store.get(request.refresh)', true),
    line('rf3', '  if (user == null) return 401'),
    line('rf4', '  return sign(user, expires = now + 15.min)', true),
    line('rf5', '}'),
    line('rv1', 'fun revokeAll(user) {'),
    line('rv2', '  store.deleteRefreshTokens(user)', true),
    line('rv3', '  feed.publish(user, revokedBefore = now)', true),
    line('rv9', '}'),
    line('sb1', 'fun onFeed(user, revokedBefore) {   // on every server'),
    line('sb2', '  revoked.add(user, revokedBefore)', true),
    line('sb3', '}'),
  ],
}

export function lineNo(id: string, mode: Mode): number {
  return SERVER_CODE[mode].findIndex((l) => l.id === id) + 1
}

type LogEntry = { actor: Actor | 'crash' | 'system'; text: string }
export type Credential = { access: string | null; exp: number | null; iat: number | null; refresh: string | null }

export type SimState = {
  clock: number
  balance: number
  stolen: number
  memory: Record<ServerId, string[]>
  storeUp: boolean
  sessions: string[]
  refreshTokens: string[]
  revoked: Record<ServerId, number | null>
  phone: Credential
  attacker: Credential | null
  storeLookups: number
  aliceLoggedOut: boolean
  outage: 'not yet' | 'served' | 'failed'
  revokeDone: boolean
  afterRevoke: number
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
      'Works on any server',
      'Alice stays logged in, whichever server the load balancer picks',
      s.aliceLoggedOut ? 'bad' : !s.settled ? 'wait' : 'ok',
    ],
    [
      'Revoking takes effect at once',
      `After the bank revokes her access, the stolen credential stops working. Accepted after revoking: ${s.afterRevoke}`,
      s.afterRevoke > 0 ? 'bad' : !s.settled ? 'wait' : 'ok',
    ],
    [
      'Survives a store outage',
      s.outage === 'not yet' ? "A request during the outage still gets served, if it can" : s.outage === 'served' ? 'Alice was served during the outage' : 'Alice got an error during the outage',
      s.outage === 'failed' ? 'bad' : s.outage === 'not yet' ? 'wait' : 'ok',
    ],
  ]
}

export function verdictText(mode: Mode, s: SimState): string {
  const crash = !s.crashes ? '' : mode === 'memory' ? ' The killed server also lost every session it held.' : ' The crash itself cost nothing extra: the request was retried on the other server.'
  const stolen = s.stolen ? `The attacker moved ${fmt(s.stolen)} after the bank had revoked access, and Alice is left with ${fmt(s.balance)}.` : ''
  switch (mode) {
    case 'memory':
      return s.stolen
        ? `Fails twice over. Alice was logged out just because a request landed on another server, and revoking only reached one server. ${stolen}${crash}`
        : `Alice was logged out just because a request landed on another server. Revoking only worked by luck: the crash pushed the retry onto the server that held the stolen session.${crash}`
    case 'shared':
      return `Revoking was instant and no money was lost. The price: ${s.storeLookups} store lookups in this short run, and when the store went down, Alice got an error even though every server was healthy. Replicating the store is how teams usually live with that, which makes this a strong default.${crash}`
    case 'jwt':
      return `No store, no lookups, and the outage didn't matter. But nothing could stop the stolen token. ${stolen} It would have kept working for ${LONG_MIN / 60} hours.${crash}`
    case 'short':
      return `The damage is bounded, not prevented. Cutting off refresh meant the stolen token died within ${WINDOW_MIN} minutes, but inside that window it still worked. ${stolen}${crash}`
    default:
      return `Every check holds. The stolen token was refused immediately, with no store lookup on the request path, and the outage didn't matter. But notice what it took: a refresh store, a feed, and a list in every server's memory. "Stateless" got state back, just far less of it.${crash}`
  }
}

// Mode 2's broken check is a price many teams rightly accept, so its verdict isn't a failure.
export const verdictIsBad = (mode: Mode, s: SimState) => mode !== 'shared' && checks(s).some((c) => c[2] === 'bad')

export const DEFAULT_CRASH: Record<Mode, string | null> = { memory: null, shared: null, jwt: null, short: null, feed: null }

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))
const noCred = (): Credential => ({ access: null, exp: null, iat: null, refresh: null })

function introText(mode: Mode): string {
  const base: Record<Mode, string> = {
    memory: 'The simplest session: each server keeps logins in its own memory.',
    shared: 'Sessions move to one store that every server shares.',
    jwt: 'No store at all: a signed token that lasts 24 hours.',
    short: 'A JWT that lasts 15 minutes, plus a refresh token kept in a store.',
    feed: 'The same short JWT, plus a small list of revoked users pushed to every server.',
  }
  return `${base[mode]} The story is the same in every mode: Alice logs in, her laptop is stolen, the store goes down, and the bank revokes her access. Press Step, or click a gutter dot to kill a server just before that line.`
}

export function build(mode: Mode, crashId: string | null): Step[] {
  const s: SimState = {
    clock: 0,
    balance: START_BALANCE,
    stolen: 0,
    memory: { s1: [], s2: [] },
    storeUp: true,
    sessions: [],
    refreshTokens: [],
    revoked: { s1: null, s2: null },
    phone: noCred(),
    attacker: null,
    storeLookups: 0,
    aliceLoggedOut: false,
    outage: 'not yet',
    revokeDone: false,
    afterRevoke: 0,
    settled: false,
    crashes: 0,
    log: [],
  }
  const steps: Step[] = [{ s: clone(s), line: null, actor: null, label: 'start', title: 'Ready', text: introText(mode), crash: false, locals: {} }]
  let locals: Record<string, string> = {}
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }

  let crashed = false
  const willCrash = (id: string) => {
    if (!crashed && crashId === id) {
      crashed = true
      return true
    }
    return false
  }

  const ACTOR_NAME: Record<Actor, string> = { cons: 'Alice', migrator: 'Attacker', relay: 'Bank staff' }
  const push = (id: string | null, actor: Actor | 'system', label: string, title: string, text: string | null, fn?: (st: SimState) => void, isCrash = false) => {
    if (fn) fn(s)
    const who = actor === 'system' ? 'system' : ACTOR_NAME[actor]
    s.log.push({ actor: isCrash ? 'crash' : actor, text: `[+${s.clock} min] [${who}] ${title}` })
    steps.push({ s: clone(s), line: id, actor, label, title, text, crash: isCrash, locals: actor === 'system' ? {} : { ...locals } })
  }

  const isSession = mode === 'memory' || mode === 'shared'
  const hasRefresh = mode === 'short' || mode === 'feed'
  const jwtLife = mode === 'jwt' ? LONG_MIN : WINDOW_MIN
  let nextSession = 1
  let nextJwt = 1
  let nextRefresh = 1

  const crashServer = (id: string, actor: Actor, server: ServerId, what: string) => {
    push(id, actor, 'CRASH', `${SERVER_NAME[server]} killed`, what, (st) => {
      st.crashes++
      if (mode === 'memory') st.memory[server] = []
    }, true)
    locals = {}
    push(null, 'system', 'retry', `${ACTOR_NAME[actor]}'s request is retried on ${SERVER_NAME[otherServer(server)]}`, mode === 'memory' ? `The restart also wiped everything ${SERVER_NAME[server]} held in memory.` : 'The servers hold nothing that matters here, so any of them can take over.')
  }

  // ---- login
  const login = (firstServer: ServerId, why: string): ServerId => {
    let server = firstServer
    for (;;) {
      const name = SERVER_NAME[server]
      locals = { user: "'alice'", server: `'${name}'` }
      if (willCrash('li2')) {
        crashServer('li2', 'cons', server, 'Nothing has happened yet.')
        server = otherServer(server)
        continue
      }
      push('li2', 'cons', 'password', `${name} checks Alice's password`, why)
      if (willCrash('li3')) {
        crashServer('li3', 'cons', server, 'The password was fine, but nothing has been issued.')
        server = otherServer(server)
        continue
      }
      if (isSession) {
        const sid = `sid-${nextSession}`
        setLocal('sid', `'${sid}'`)
        push('li3', 'cons', 'new id', 'Generates a random session ID', "It's just a long random value that means nothing by itself, so it can't be forged. The meaning lives on the server.")
        if (willCrash('li4')) {
          crashServer('li4', 'cons', server, 'The ID was only in memory, so nothing remembers it.')
          server = otherServer(server)
          continue
        }
        push('li4', 'cons', 'save', mode === 'memory' ? `Saves it in ${name}'s own memory` : 'Saves it in the shared store', mode === 'memory' ? 'Only this one process knows about this login.' : 'Every server can now find this login.', (st) => {
          if (mode === 'memory') st.memory[server].push(sid)
          else st.sessions.push(sid)
        })
        if (willCrash('li5')) {
          crashServer('li5', 'cons', server, "The session exists, but Alice never got the ID, so it's never used.")
          server = otherServer(server)
          nextSession++
          continue
        }
        nextSession++
        push('li5', 'cons', 'cookie', 'Alice receives a cookie holding the ID', 'Her browser sends it automatically with every request.', (st) => {
          st.phone = { access: sid, exp: null, iat: null, refresh: null }
        })
        return server
      }
      const jwtId = `jwt-${nextJwt}`
      setLocal('token', `{ sub: 'alice', iat: +${s.clock}, exp: +${s.clock + jwtLife} } + signature`)
      push('li3', 'cons', 'sign', `Signs a token valid for ${mode === 'jwt' ? '24 hours' : '15 minutes'}`, 'The token itself says who she is and when it expires. The signature proves this server wrote it, so nothing has to be saved anywhere.')
      if (hasRefresh) {
        const rt = `rt-${nextRefresh}`
        setLocal('refresh', `'${rt}'`)
        push('li3b', 'cons', 'refresh', 'Also generates a refresh token', 'A random ID, like a session ID, but only used to get new access tokens.')
        if (willCrash('li4')) {
          crashServer('li4', 'cons', server, 'Nothing was saved, and Alice got nothing back.')
          server = otherServer(server)
          continue
        }
        push('li4', 'cons', 'save', 'Saves the refresh token in the store', 'This is the piece the bank can delete later. Note that a little state has come back.', (st) => {
          st.refreshTokens.push(rt)
        })
      }
      if (willCrash('li5')) {
        crashServer('li5', 'cons', server, 'Alice never received anything, so she logs in again.')
        if (hasRefresh) {
          s.refreshTokens = s.refreshTokens.filter((r) => r !== `rt-${nextRefresh}`)
        }
        server = otherServer(server)
        continue
      }
      nextJwt++
      if (hasRefresh) nextRefresh++
      const clockNow = s.clock
      push('li5', 'cons', 'token', 'Alice receives the token', hasRefresh ? 'Her app sends the short token on each request, and keeps the refresh token for later.' : 'Her app sends it on every request.', (st) => {
        st.phone = { access: jwtId, exp: clockNow + jwtLife, iat: clockNow, refresh: hasRefresh ? `rt-${nextRefresh - 1}` : null }
      })
      return server
    }
  }

  // ---- request handling
  type Outcome = 200 | 401 | 503
  const handle = (actor: Actor, cred: Credential, firstServer: ServerId, kind: 'read' | 'transfer', served: string): { code: Outcome; server: ServerId } => {
    let server = firstServer
    const who = ACTOR_NAME[actor]
    for (;;) {
      const name = SERVER_NAME[server]
      locals = isSession ? { 'request.sid': `'${cred.access}'`, server: `'${name}'` } : { 'request.token': `'${cred.access}'`, server: `'${name}'` }
      if (willCrash('h2')) {
        crashServer('h2', actor, server, 'The request never got an answer.')
        server = otherServer(server)
        continue
      }
      let user: string | null = null
      if (isSession) {
        if (mode === 'shared' && !s.storeUp) {
          setLocal('user', '(no answer)')
          push('h2', actor, '503', 'The store is unreachable, so the server returns 503', `${name} is healthy, and the session is intact. But it can't find out who this is, so it can't serve anyone. Every request on the platform fails the same way.`, (st) => {
            st.storeLookups++
          })
          return { code: 503, server }
        }
        const found = mode === 'memory' ? s.memory[server].includes(cred.access ?? '') : s.sessions.includes(cred.access ?? '')
        user = found ? 'alice' : null
        setLocal('user', found ? "'alice'" : 'null')
        push(
          'h2',
          actor,
          'lookup',
          found ? `${name} finds the session: it belongs to Alice` : `${name} finds no such session`,
          mode === 'memory'
            ? found
              ? 'It was in this process\'s memory.'
              : `This process has never heard of ${cred.access}. The session may be alive and well on the other server.`
            : found
              ? 'A network call to the store, on every single request.'
              : 'The row is gone, so the ID now means nothing.',
          (st) => {
            if (mode === 'shared') st.storeLookups++
          },
        )
      } else {
        const expired = cred.exp !== null && s.clock >= cred.exp
        user = expired ? null : 'alice'
        setLocal('user', expired ? 'null' : "'alice'")
        push(
          'h2',
          actor,
          'verify',
          expired ? 'The signature is fine, but the token has expired' : "The signature checks out: it's Alice",
          expired
            ? `It expired at +${cred.exp} min, and it's now +${s.clock} min. Expiry is the only thing that can stop a JWT by itself.`
            : `No network call and no lookup, so this works on any server, whatever else is down. The server only knows the token is genuine and unexpired. It can't know whether it was stolen.`,
        )
      }
      push('h3', actor, user ? 'check' : '401', user ? 'User found: condition is false' : 'No user: returns 401', user ? 'The request continues.' : `${who} is rejected.`)
      if (!user) return { code: 401, server }
      if (mode === 'feed') {
        const cutoff = s.revoked[server]
        const blocked = cutoff !== null && cred.iat !== null && cred.iat <= cutoff
        setLocal('revokedBefore', cutoff === null ? 'none' : `+${cutoff} min`)
        push('h3b', actor, blocked ? '401' : 'check', blocked ? 'Alice is on the revoked list, and this token is older: returns 401' : 'Not on the revoked list: condition is false', blocked ? `A valid signature isn't enough any more. The check is in this server's memory, so there's still no network call, and the store's health doesn't matter.` : "A check against this server's own memory, with no network call.")
        if (blocked) return { code: 401, server }
      }
      if (willCrash('h4')) {
        crashServer('h4', actor, server, 'The request was authenticated but not served.')
        server = otherServer(server)
        continue
      }
      push(
        'h4',
        actor,
        kind === 'read' ? 'serve' : 'transfer',
        kind === 'read' ? `${who} sees the balance: ${fmt(s.balance)}` : `${fmt(STOLEN)} leaves Alice's account`,
        served,
        kind === 'transfer'
          ? (st) => {
              st.balance -= STOLEN
              st.stolen += STOLEN
              if (st.revokeDone) st.afterRevoke++
            }
          : undefined,
      )
      return { code: 200, server }
    }
  }

  const refreshToken = (actor: Actor, cred: Credential, firstServer: ServerId): Credential | null => {
    let server = firstServer
    for (;;) {
      locals = { 'request.refresh': `'${cred.refresh}'`, server: `'${SERVER_NAME[server]}'` }
      if (willCrash('rf2')) {
        crashServer('rf2', actor, server, 'The refresh was never checked.')
        server = otherServer(server)
        continue
      }
      const found = s.refreshTokens.includes(cred.refresh ?? '')
      setLocal('user', found ? "'alice'" : 'null')
      push('rf2', actor, 'lookup', found ? 'The store has this refresh token' : 'The store no longer has this refresh token', found ? 'This is the one network lookup in this design, and it happens every 15 minutes, not on every request.' : 'The bank deleted it. This is where a revocation finally bites in this design.')
      push('rf3', actor, found ? 'check' : '401', found ? 'User found: condition is false' : 'No user: returns 401', found ? 'A new access token can be issued.' : `${ACTOR_NAME[actor]} is cut off and would need the password to get back in.`)
      if (!found) return null
      const jwtId = `jwt-${nextJwt}`
      if (willCrash('rf4')) {
        crashServer('rf4', actor, server, 'No new token was issued, and the refresh token still works.')
        server = otherServer(server)
        continue
      }
      nextJwt++
      const issued: Credential = { access: jwtId, exp: s.clock + WINDOW_MIN, iat: s.clock, refresh: cred.refresh }
      setLocal('token', `{ sub: 'alice', iat: +${s.clock}, exp: +${s.clock + WINDOW_MIN} } + signature`)
      push('rf4', actor, 'sign', `Issues a new access token, valid until +${s.clock + WINDOW_MIN} min`, 'No password needed, and the user never notices. Rotating the refresh token here too is the next pattern on this roadmap.', (st) => {
        if (actor === 'cons') st.phone = issued
        else st.attacker = issued
      })
      return issued
    }
  }

  // ---- the story
  const alice = (server: ServerId, served: string): { code: Outcome; server: ServerId } => {
    const first = handle('cons', s.phone, server, 'read', served)
    if (first.code !== 401) return first
    if (hasRefresh) {
      push(null, 'system', 'expired', "Alice's app gets a 401 and quietly asks for a new token", 'The short token ran out. This is routine, and she never sees it.')
      const fresh = refreshToken('cons', s.phone, first.server)
      if (fresh) return handle('cons', fresh, first.server, 'read', served)
    }
    push(null, 'system', 'logged out', 'Alice is thrown back to the login screen', isSession ? `She did nothing wrong. Her session is still alive, but it's on the other server. In production this looks like random logouts.` : 'She has to enter her password again.', (st) => {
      st.aliceLoggedOut = true
    })
    const at = login(first.server, 'She has to enter it again.')
    return handle('cons', s.phone, at, 'read', served)
  }

  // Alice logs in and uses the app.
  let current = login('s1', 'This is the only moment her password is used. The question is what the server gives her so she never has to send it again.')
  const a1 = alice(current, 'Same server she logged in on.')
  current = a1.server
  const a2 = alice(otherServer(current), mode === 'memory' ? 'She is back in, on this server only, after typing her password again for no good reason.' : 'The load balancer picked the other server this time, and it made no difference.')
  current = a2.server

  push(null, 'system', 'time', '16 minutes pass', 'Alice keeps using the app.', (st) => {
    st.clock = 16
  })
  const a3 = alice(mode === 'memory' ? current : 's1', 'Business as usual.')
  current = a3.server

  push(null, 'system', 'theft', "Alice's laptop is stolen", `The attacker copies what the app has stored: ${s.phone.access}${s.phone.refresh ? ` and ${s.phone.refresh}` : ''}. To any server, this is now indistinguishable from Alice.`, (st) => {
    st.clock = 17
    st.attacker = clone(st.phone)
  })
  handle('migrator', s.attacker!, current, 'read', "The credential is valid, so this works in every design. No scheme can tell a stolen credential from a real one. What differs is how quickly you can stop it.")

  push(null, 'system', 'outage', 'The shared store goes down', mode === 'memory' || mode === 'jwt' ? "This design doesn't have a shared store, so this is a non-event here." : 'A routine failure on the one component that holds shared state. The servers themselves are fine.', (st) => {
    st.clock = 18
    st.storeUp = false
  })
  const during = alice(current, mode === 'memory' ? "This design has no shared store, so the outage doesn't touch it." : 'The token proves who she is by itself, so the store going down made no difference.')
  push(null, 'system', 'recovered', 'The store comes back', during.code === 503 ? 'For that whole time, nobody on the platform could do anything, even with healthy servers and valid logins.' : 'Nobody on the request path noticed.', (st) => {
    st.storeUp = true
    st.outage = during.code === 200 ? 'served' : 'failed'
  })

  // The bank revokes.
  const adminServer: ServerId = mode === 'memory' ? otherServer(current) : 's1'
  let adminAt = adminServer
  push(null, 'system', 'report', 'Alice calls the bank, and staff revoke her access', `This is the moment that decides the design: it's +19 min, and the attacker holds a credential that looks valid.`, (st) => {
    st.clock = 19
  })
  for (;;) {
    locals = { user: "'alice'", server: `'${SERVER_NAME[adminAt]}'` }
    if (willCrash('rv2')) {
      crashServer('rv2', 'relay', adminAt, 'Nothing was revoked, and staff get an error, so they retry.')
      adminAt = otherServer(adminAt)
      continue
    }
    break
  }
  if (mode === 'memory') {
    const at = adminAt
    push('rv2', 'relay', 'delete', `${SERVER_NAME[at]} deletes the sessions it knows about`, `But this call landed on ${SERVER_NAME[at]}, and a session on ${SERVER_NAME[otherServer(at)]} isn't in this process's memory. Staff see a success message, and the stolen session is untouched.`, (st) => {
      st.memory[at] = []
      st.revokeDone = true
    })
  } else if (mode === 'shared') {
    push('rv2', 'relay', 'delete', 'Deletes her sessions from the store', 'One delete, and the next lookup on any server finds nothing. This is what sessions are best at.', (st) => {
      st.sessions = []
      st.revokeDone = true
    })
  } else if (mode === 'jwt') {
    push('rv2', 'relay', 'nothing', 'There is nothing to delete', "No server holds any state about this token, so staff have no way to stop it. They see a success message, because the code has nothing else to do. It's the honest result of having no state.", (st) => {
      st.revokeDone = true
    })
  } else {
    push('rv2', 'relay', 'delete', 'Deletes her refresh tokens', mode === 'short' ? "No new access tokens can be issued. But the one the attacker holds is self-contained, and it's good until it expires." : 'No new access tokens can be issued. Now for the ones already out there.', (st) => {
      st.refreshTokens = []
      if (mode === 'short') st.revokeDone = true
    })
  }
  if (mode === 'feed') {
    const cutoff = s.clock
    if (willCrash('rv3')) {
      crashServer('rv3', 'relay', adminAt, 'The refresh tokens are gone but nothing was published. Staff get an error and retry. Deleting again is harmless, so the retry finishes the job.')
      adminAt = otherServer(adminAt)
      locals = { user: "'alice'", server: `'${SERVER_NAME[adminAt]}'` }
    }
    push('rv3', 'relay', 'publish', 'Publishes "tokens issued before now are revoked"', 'One small message per incident, not a record per token. It only has to be kept for 15 minutes, because older tokens have expired anyway.')
    for (const server of ['s1', 's2'] as ServerId[]) {
      locals = { user: "'alice'", revokedBefore: `+${cutoff} min`, server: `'${SERVER_NAME[server]}'` }
      if (willCrash('sb2')) {
        crashServer('sb2', 'relay', server, "This server missed the update while it was down. On restart it replays the feed from where it left off, so it can't miss the entry. Until then, it isn't serving traffic anyway.")
        locals = { user: "'alice'", revokedBefore: `+${cutoff} min`, server: `'${SERVER_NAME[server]}'` }
      }
      push('sb2', 'relay', 'add', `${SERVER_NAME[server]} adds Alice to its revoked list`, 'A pushed update, usually within a second or so, held in memory. Requests now check this without any network call.', (st) => {
        st.revoked[server] = cutoff
        if (server === 's2') st.revokeDone = true
      })
    }
  }

  // The attacker tries to spend.
  const attempt = (clock: number, tag: string, acceptedText: string) => {
    push(null, 'system', 'time', tag, `The bank revoked access at +19 min, and it's now +${clock} min. The attacker still holds ${s.attacker?.access}.`, (st) => {
      st.clock = clock
    })
    const cred = s.attacker!
    const server: ServerId = mode === 'memory' ? current : 's2'
    const res = handle('migrator', cred, server, 'transfer', acceptedText)
    if (res.code === 401 && hasRefresh && (cred.exp === null || s.clock >= cred.exp)) {
      push(null, 'system', 'refresh', 'The attacker tries the stolen refresh token', 'The access token has expired, so this is the only way to keep going.')
      refreshToken('migrator', cred, res.server)
    }
  }
  attempt(20, 'One minute later, the attacker tries to move money', mode === 'short' ? `The refresh token is gone, but this access token doesn't need it. It's valid until +${s.attacker?.exp} min, and the attacker just moved money after the bank said it was revoked.` : mode === 'jwt' ? 'The signature is valid and the token has hours left. As far as the server can tell, this is Alice.' : 'The stolen session was never deleted. Staff think this is handled.')
  attempt(36, '16 more minutes pass, and the attacker tries again', mode === 'jwt' ? `Still valid, for almost another full day. Short of changing the signing key, which would log out every user, there's no way to stop this.` : 'The stolen session is still alive on that server.')

  locals = {}
  s.settled = true
  push(null, 'system', 'end', 'Run finished', verdictText(mode, s))
  return steps
}

export type Experiment = { label: string; title: string; mode: Mode; crash: string | null }

export const EXPERIMENTS: Experiment[] = [
  {
    label: 'Logged out by the load balancer',
    title: "Sessions in one server's memory. Alice is thrown out just because her next request landed elsewhere, and revoking only reaches one server.",
    mode: 'memory',
    crash: null,
  },
  {
    label: 'A restart logs people out',
    title: "The same design with a server killed on Alice's first request. Everything it held in memory is gone.",
    mode: 'memory',
    crash: 'h2',
  },
  {
    label: 'Instant revoke, fragile store',
    title: 'The shared store revokes in one delete, and no money is lost. But when it goes down, every request fails, even with healthy servers.',
    mode: 'shared',
    crash: null,
  },
  {
    label: 'The JWT nobody can stop',
    title: 'A 24-hour token. The bank revokes access, staff see success, and the attacker keeps moving money.',
    mode: 'jwt',
    crash: null,
  },
  {
    label: 'A 15-minute window',
    title: 'Short tokens bound the damage but do not prevent it. The attacker still gets one transfer in after the revoke, and then gets cut off.',
    mode: 'short',
    crash: null,
  },
  {
    label: 'Closing the window',
    title: 'A small revoked list pushed to every server stops the stolen token at once, with no store lookup per request. State came back, but very little of it.',
    mode: 'feed',
    crash: null,
  },
  {
    label: 'Die while revoking',
    title: 'The refresh tokens are deleted, then the server dies before publishing. Staff retry, and deleting twice is harmless, so the retry finishes the job.',
    mode: 'feed',
    crash: 'rv3',
  },
]
