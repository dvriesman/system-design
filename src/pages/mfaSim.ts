// Part 3 of the Multi-Factor Authentication page: one day of attacks on Alice's bank login, through five designs.
import { ascii, totp } from './mfaCrypto'

export type Mode = 'password' | 'sms' | 'fallback' | 'recovery' | 'passkey'
export type Actor = 'cons' | 'svc' | 'relay' | 'migrator'
export type Pane = 'alice' | 'login' | 'factors' | 'attacker'
export type CodeLine = { id: string; code: string; breakable: boolean }
type Factor = 'sms' | 'totp' | 'recovery' | 'passkey'

const line = (id: string, code: string): CodeLine => ({ id, code, breakable: false })

export const clockText = (minutes: number) => {
  const total = 9 * 60 + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
// Real codes: Alice's authenticator secret, and a fixed date so every run shows the same codes.
const SECRET = ascii('alice-totp-secret-01')
const BASE_UNIX = 1794560400
export const codeAt = (minutes: number, seconds = 0) => totp(SECRET, BASE_UNIX + minutes * 60 + seconds).code
const BANK = 'https://bank.example'
const PHISH = 'https://bank-secure-login.example'

// ---- code
function loginCode(m: Mode): CodeLine[] {
  const pick: Record<Exclude<Mode, 'password'>, string> = {
    sms: "  val factor = 'sms'   // the only second factor",
    fallback: "  val factor = if (choice == 'sms') 'sms' else 'totp'   // \"Try another way\"",
    recovery: "  val factor = if (choice == 'recovery') 'recovery' else 'totp'",
    passkey: "  val factor = 'passkey'   // any passkey she registered",
  }
  return [
    line('l1', 'fun login(user, password, choice, origin) {'),
    line('l2', '  if (!passwords.verify(user, password)) return 401'),
    ...(m === 'password'
      ? []
      : [
          line('l3', pick[m]),
          line('l4', '  val proof = challenge(user, factor)'),
          line('l5', '  if (!verify(user, factor, proof, origin)) return 401'),
        ]),
    line('l6', '  return newSession(user)'),
    line('l7', '}'),
  ]
}

function factorCode(m: Mode): CodeLine[] {
  if (m === 'password') return [line('f0', '// no second factor: the password is the only proof')]
  const sms = m === 'sms' || m === 'fallback'
  const otp = m === 'fallback' || m === 'recovery'
  return [
    ...(sms
      ? [line('f1', 'fun challengeSms(user) = sms.send(user.phone, code = random6(), expires = 5.min)'), line('f2', 'fun verifySms(user, code) = code == sent[user] && !used && !expired')]
      : []),
    ...(otp ? [line('f3', 'fun verifyTotp(user, code) = code in totp(user.secret, now ± 30 s) && !usedBefore(code)   // RFC 6238')] : []),
    ...(m === 'recovery' ? [line('f4', 'fun verifyRecovery(user, code) = recoveryCodes.useOnce(user, hash(code))')] : []),
    ...(m === 'passkey'
      ? [
          line('f5', 'fun challengePasskey(user) = random32()   // signed by a key that never leaves her device'),
          line('f6', `fun verifyPasskey(user, sig) = sig.verifies(user.publicKeys) && sig.origin == "${BANK}"`),
        ]
      : []),
  ]
}

function aliceCode(m: Mode): CodeLine[] {
  return [
    line('a1', "login('alice', password, choice = 'default', origin = browser.origin)"),
    line('a2', m === 'passkey' ? 'answer(challenge)   // touches her fingerprint reader' : 'answer(challenge)   // types the code she sees'),
    line('a3', '// 14:00: her phone is lost, so she signs in from her laptop'),
    line('a4', `login('alice', password, choice = '${m === 'recovery' ? 'recovery' : m === 'fallback' ? 'sms' : 'default'}')`),
  ]
}

function attackerCode(): CodeLine[] {
  return [
    line('m1', "login('alice', leakedPassword, choice = 'default')   // from another site's breach"),
    line('m2', 'carrier.portNumber(alice.phone, to = attackerSim)   // a SIM swap'),
    line('m3', "login('alice', leakedPassword, choice = 'sms')"),
    line('m4', `proxy("${PHISH}").relay(whatAliceTypes)   // live phishing`),
  ]
}

const MODES: Mode[] = ['password', 'sms', 'fallback', 'recovery', 'passkey']
export const CODE = Object.fromEntries(MODES.map((m) => [m, { alice: aliceCode(m), login: loginCode(m), factors: factorCode(m), attacker: attackerCode() }])) as Record<Mode, Record<Pane, CodeLine[]>>

const PANE_PREFIX: Record<Pane, string> = { alice: 'A', login: 'L', factors: 'F', attacker: 'X' }
export function lineRef(id: string, mode: Mode): string {
  for (const pane of ['alice', 'login', 'factors', 'attacker'] as Pane[]) {
    const i = CODE[mode][pane].findIndex((l) => l.id === id)
    if (i >= 0) return `${PANE_PREFIX[pane]}${i + 1}`
  }
  return ''
}

// ---- state
export type Session = { who: 'Alice' | 'Attacker'; how: string; at: number }
type Outcome = 'in' | 'refused' | 'stuck'
type LogEntry = { actor: Actor | 'system'; text: string }
export type SimState = {
  clock: number
  phoneOwner: 'alice' | 'attacker'
  phoneLost: boolean
  aliceSms: string[]
  attackerSms: string[]
  attackerHas: string[]
  sessions: Session[]
  results: Record<string, Outcome>
  recoveryLeft: number
  settled: boolean
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
  before?: Record<string, string>
  ev?: string
}

// ---- invariants
export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']
const INVARIANTS: { id: string; name: string; detail: string; good: Outcome }[] = [
  { id: 'stuffing', name: "A leaked password alone can't sign in", detail: 'Her password leaked from another site, as many do', good: 'refused' },
  { id: 'simswap', name: "A SIM swap can't sign in", detail: 'The attacker talks her carrier into moving her number', good: 'refused' },
  { id: 'phishing', name: "A phishing site can't reuse what Alice enters", detail: 'A look-alike site relays everything to the real one, live', good: 'refused' },
  { id: 'lost', name: 'Alice gets back in the day she loses her phone', detail: 'Without a trip to the carrier or a support call', good: 'in' },
]
export function checks(s: SimState): CheckResult[] {
  return INVARIANTS.map((inv) => {
    const r = s.results[inv.id]
    return [inv.name, inv.detail, r === undefined ? 'wait' : r === inv.good ? 'ok' : 'bad']
  })
}
export const verdictIsBad = (s: SimState) => checks(s).some((c) => c[2] === 'bad')

export function verdictText(mode: Mode): string {
  switch (mode) {
    case 'password':
      return "Anyone with her password is Alice. The leaked password worked at 09:00, and every attack after it worked too. Only losing her phone didn't hurt, because nothing depended on it."
    case 'sms':
      return 'The leaked password alone now fails, which stops the most common attack. But the code goes to a phone number, not a phone: the SIM swap received it. The phishing site simply asked Alice for it and passed it on. And when her phone was lost, so was her only second factor.'
    case 'fallback':
      return 'An authenticator app is the default, but "Try another way" still sends an SMS, and the attacker chooses the way. A design is only as strong as its weakest allowed factor, so this one is exactly as strong as SMS. The app code was phished like the SMS one, and with the phone lost, both factors were gone together.'
    case 'recovery':
      return "Without SMS, the SIM swap gets nothing, and recovery codes printed at sign-up let Alice back in. But a 6-digit code is something she types, and anything she types can be relayed: the phishing site passed her code on within its 30 seconds."
    default:
      return 'Every check holds. A passkey answers a challenge with a signature that names the site, and her browser won\'t even offer the bank\'s passkey on another domain, so there was nothing to relay. A second passkey, on her laptop, let her in when her phone was lost. What remains is account recovery when every passkey is gone, which must be slower and noisier than signing in.'
  }
}

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

const INTRO: Record<Mode, string> = {
  password: 'The password is the only proof.',
  sms: 'After the password, the bank texts a 6-digit code to her phone number.',
  fallback: 'An authenticator app is the default second factor. "Try another way" falls back to an SMS code.',
  recovery: 'The authenticator app, with no SMS. If the phone is lost, a printed recovery code works once.',
  passkey: "Passkeys: her phone and her laptop each hold a key for bank.example. Nothing to type.",
}

export function build(mode: Mode): Step[] {
  const s: SimState = {
    clock: 0,
    phoneOwner: 'alice',
    phoneLost: false,
    aliceSms: [],
    attackerSms: [],
    attackerHas: ['her password, leaked from another site'],
    sessions: [],
    results: {},
    recoveryLeft: mode === 'recovery' ? 10 : 0,
    settled: false,
    log: [],
  }
  const steps: Step[] = [
    {
      s: clone(s),
      line: null,
      actor: null,
      label: 'start',
      title: 'Ready',
      text: `${INTRO[mode]} The day is the same in every mode: Alice's password leaked from a shopping site, an attacker tries it, swaps her SIM, sends her a phishing link, and in the afternoon she loses her phone. Press Step to follow it.`,
      crash: false,
      locals: {},
    },
  ]
  let locals: Record<string, string> = {}
  const setLocal = (k: string, v: string) => {
    locals = { ...locals, [k]: v }
  }
  const NAME: Record<Actor, string> = { cons: 'Alice', svc: 'Login server', relay: 'Factor checks', migrator: 'Attacker' }
  let afterCall: Record<string, string> | null = null
  const push = (id: string | null, actor: Actor | 'system', label: string, title: string, text: string, fn?: (st: SimState) => void, ev?: string) => {
    if (fn) fn(s)
    s.log.push({ actor, text: `[${clockText(s.clock)}] [${actor === 'system' ? 'system' : NAME[actor]}] ${title}` })
    const before = actor === 'svc' && afterCall ? afterCall : undefined
    if (actor === 'svc') afterCall = null
    steps.push({ s: clone(s), line: id, actor, label, title, text, crash: false, locals: actor === 'system' ? {} : { ...locals }, ...(before ? { before } : {}), ...(ev ? { ev } : {}) })
  }
  const time = (min: number, title: string, text: string) =>
    push(null, 'system', 'time', title, text, (st) => {
      st.clock = min
    })

  const defaultFactor = (): Factor => (mode === 'passkey' ? 'passkey' : mode === 'sms' ? 'sms' : 'totp')

  // One sign-in attempt. `who` says who is behind it, and `via` whether a phishing proxy sits in the middle.
  type Attempt = { ev: string; who: 'alice' | 'attacker'; choice: 'default' | 'sms' | 'recovery'; via: 'direct' | 'proxy'; startLine: string; startTitle: string; startText: string }
  const attempt = (a: Attempt): Outcome => {
    const actor: Actor = a.who === 'alice' && a.via === 'direct' ? 'cons' : 'migrator'
    locals = {}
    push(a.startLine, actor, 'login', a.startTitle, a.startText, undefined)
    const origin = a.via === 'proxy' ? PHISH : a.who === 'alice' ? BANK : 'attacker laptop'
    locals = { user: "'alice'", password: '•••••••• (correct)', choice: `'${a.choice}'`, origin: `"${origin}"` }
    push('l2', 'svc', 'password', 'The password is correct: condition is false', a.who === 'attacker' && a.via === 'direct' ? "The leaked password is her real password. The server can't tell who typed it." : a.via === 'proxy' ? 'The phishing site passed on the password Alice typed into it.' : 'Alice types her own password.')
    const finish = (who: 'Alice' | 'Attacker', how: string): Outcome => {
      push('l6', 'svc', 'session', `Signed in: a new session for ${who === 'Attacker' ? 'the attacker' : 'Alice'}`, who === 'Attacker' ? 'The attacker is now Alice, as far as the bank knows.' : 'Correct.', (st) => {
        st.sessions.push({ who, how, at: st.clock })
      }, a.ev)
      return 'in'
    }
    const refuse = (why: string): Outcome => {
      push('l5', 'svc', '401', 'Refused: returns 401', why, undefined, a.ev)
      return 'refused'
    }
    const attackerGetsIn = a.who === 'attacker' || a.via === 'proxy'
    if (mode === 'password') return finish(attackerGetsIn ? 'Attacker' : 'Alice', 'password only')

    let factor: Factor = defaultFactor()
    if (mode === 'fallback' && a.choice === 'sms') factor = 'sms'
    if (mode === 'recovery' && a.choice === 'recovery') factor = 'recovery'
    setLocal('factor', `'${factor}'`)
    const offered = mode === 'fallback' && a.choice === 'sms' ? 'The caller asked for "Try another way", and SMS is allowed, so SMS it is.' : a.choice === 'sms' && mode !== 'sms' ? 'SMS is not an option in this design, so the default factor is used.' : a.choice === 'recovery' && factor === 'recovery' ? 'Recovery codes are allowed when the authenticator is not available.' : 'The default second factor.'
    push('l3', 'svc', factor, `Second factor: ${factor === 'totp' ? 'an authenticator code' : factor === 'sms' ? 'an SMS code' : factor === 'recovery' ? 'a recovery code' : 'a passkey'}`, offered)
    push('l4', 'svc', 'challenge', 'Asks for the second factor', factor === 'passkey' ? 'Sends a random challenge to be signed.' : 'Shows a box for the code.')

    const t = s.clock
    let proof = ''
    let proofOrigin = origin
    if (factor === 'sms') {
      const code = String(100000 + ((t * 7919 + a.ev.length * 104729) % 900000))
      const to = s.phoneOwner === 'attacker' ? 'attacker' : s.phoneLost ? 'lost' : 'alice'
      locals = { user: "'alice'", code: `'${code}'` }
      push('f1', 'relay', 'sms', `Texts ${code} to Alice's number`, to === 'attacker' ? "Her number now rings on the attacker's SIM, so the attacker reads the code." : to === 'lost' ? 'It arrives on the phone she lost.' : a.who === 'attacker' && a.via === 'direct' ? "Alice gets a code she didn't ask for. Many people ignore it." : 'It arrives on her phone.', (st) => {
        if (to === 'attacker') st.attackerSms.push(`${code} · your bank code`)
        else if (to === 'alice') st.aliceSms.push(`${code} · your bank code`)
      })
      if (to === 'attacker') proof = code
      else if (to === 'alice' && (a.who === 'alice' || a.via === 'proxy')) proof = code
    } else if (factor === 'totp') {
      const code = codeAt(t, 10)
      if (a.who === 'alice' && !s.phoneLost) proof = code
      if (a.via === 'proxy') proof = code
      if (a.who === 'alice' && s.phoneLost) proof = ''
    } else if (factor === 'recovery') {
      proof = a.who === 'alice' ? 'K7QM-2XRP' : ''
    } else {
      locals = { user: "'alice'" }
      push('f5', 'relay', 'challenge', 'A fresh random challenge, for bank.example', 'The signature will cover this challenge and the origin the browser is on.')
      if (a.via === 'proxy') {
        proof = ''
        proofOrigin = PHISH
      } else if (a.who === 'alice') proof = s.phoneLost ? 'signature from her laptop passkey' : 'signature from her phone passkey'
    }

    // Answering
    if (a.who === 'alice' && a.via === 'direct') {
      locals = { challenge: factor === 'passkey' ? 'random32' : 'a code box' }
      if (proof) {
        push('a2', 'cons', 'answer', factor === 'passkey' ? `Approves with ${s.phoneLost ? 'the passkey on her laptop' : 'her fingerprint on her phone'}` : factor === 'recovery' ? 'Types a recovery code from the sheet she printed at sign-up' : `Types ${proof}`, factor === 'totp' ? `Her authenticator app shows ${proof}: HMAC of her secret and the current 30-second step.` : factor === 'recovery' ? 'Each code works once. She crosses it out.' : factor === 'passkey' ? 'Nothing to type and nothing to read out. The device signs the challenge.' : 'She copies the code from the text message.')
      } else {
        push('a2', 'cons', 'stuck', factor === 'sms' ? 'No code: it went to the phone she lost' : 'No code: the authenticator app was on the phone she lost', mode === 'fallback' ? 'She tries "Try another way", but the SMS goes to the same lost phone. Both factors lived on one device.' : 'She has to get a replacement SIM from her carrier first. Until then she is locked out.', undefined, a.ev)
        return 'stuck'
      }
    } else if (a.via === 'proxy') {
      locals = { whatAliceTypes: factor === 'passkey' ? 'nothing' : `'${proof}'` }
      if (factor === 'passkey') {
        push('m4', 'migrator', 'no relay', 'The phishing page asks for her passkey, and her browser has none for this site', `Her passkey belongs to bank.example. On ${PHISH.replace('https://', '')} her browser doesn't offer it, so there is no signature to relay. If it signed anyway, the signature would name the wrong origin.`)
      } else push('m4', 'migrator', 'relay', `Alice types ${factor === 'sms' ? 'the SMS code' : 'her authenticator code'} into the fake page, and it is relayed in a second`, 'The code is genuine and fresh. The bank has no way to know it was typed on another site.', (st) => {
        st.attackerHas.push(`${factor === 'sms' ? 'SMS' : 'authenticator'} code ${proof}, relayed live`)
      })
    } else {
      locals = { attackerHas: factor === 'sms' && proof ? `'${proof}'` : 'nothing' }
      push(a.startLine, 'migrator', proof ? 'has code' : 'no code', proof ? `Reads ${proof} on the swapped SIM, and enters it` : factor === 'passkey' ? 'Has no passkey to sign with' : factor === 'totp' ? "Has no authenticator code: the secret is on Alice's phone" : 'Has no code: it went to Alice\'s phone', proof ? 'A real code, legitimately delivered to the wrong person.' : 'The password was right. The second factor is the wall.')
    }

    // Verifying
    const ok = !!proof && (factor !== 'passkey' || proofOrigin === BANK)
    const vline = factor === 'sms' ? 'f2' : factor === 'totp' ? 'f3' : factor === 'recovery' ? 'f4' : 'f6'
    locals = { user: "'alice'", ...(factor === 'passkey' ? { sig: proof ? `{ origin: "${proofOrigin}" }` : 'none' } : { code: proof ? `'${proof}'` : 'none' }) }
    push(
      vline,
      'relay',
      ok ? 'valid' : 'invalid',
      ok ? (factor === 'totp' ? `${proof} matches the current step: valid` : factor === 'recovery' ? 'An unused recovery code: valid, and now spent' : factor === 'passkey' ? 'The signature verifies, for https://bank.example: valid' : 'Matches the code sent: valid') : factor === 'passkey' ? 'No valid signature for bank.example: invalid' : 'No matching code: invalid',
      ok && attackerGetsIn ? 'The check only proves that someone had the code at that moment, not who.' : ok ? 'Correct.' : 'Refused.',
      factor === 'recovery' && ok
        ? (st) => {
            st.recoveryLeft--
          }
        : undefined,
    )
    afterCall = { ...locals, ok: String(ok) }
    if (!ok) return refuse(attackerGetsIn ? 'The attack stops here.' : 'Alice is refused.')
    push('l5', 'svc', 'verified', 'Verified: condition is false', 'Both factors passed.')
    return finish(attackerGetsIn ? 'Attacker' : 'Alice', factor === 'totp' ? 'password + app code' : factor === 'sms' ? 'password + SMS' : factor === 'recovery' ? 'password + recovery code' : 'passkey')
  }

  const record = (id: string, o: Outcome) => {
    s.results[id] = o
    steps[steps.length - 1].s = clone(s)
  }

  // ---- the day
  time(0, '09:00 · a leaked password', "Alice reused her password on a shopping site that was breached. Attackers try leaked passwords on banks automatically: credential stuffing.")
  record('stuffing', attempt({ ev: 'stuffing', who: 'attacker', choice: 'default', via: 'direct', startLine: 'm1', startTitle: "Tries Alice's leaked password", startText: 'An automated script, trying thousands of leaked passwords.' }))
  time(5, '09:05 · Alice signs in', 'A normal morning sign-in, so each design shows what it costs her.')
  attempt({ ev: 'alice', who: 'alice', choice: 'default', via: 'direct', startLine: 'a1', startTitle: 'Alice signs in to her bank', startText: 'From her own laptop.' })
  time(60, '10:00 · a SIM swap', 'The attacker calls Alice\'s mobile carrier, pretends to be her, and asks for her number on a new SIM.')
  locals = {}
  push('m2', 'migrator', 'sim swap', 'Her number now rings on the attacker\'s SIM', "Alice's phone shows no signal. The bank knows nothing about it.", (st) => {
    st.phoneOwner = 'attacker'
    st.attackerHas.push("Alice's phone number, from 10:00 to 10:30")
  })
  record('simswap', attempt({ ev: 'simswap', who: 'attacker', choice: 'sms', via: 'direct', startLine: 'm3', startTitle: 'Signs in with the leaked password, and asks for SMS', startText: 'If the login offers "Try another way", the attacker picks the factor it controls.' }))
  push(null, 'system', 'time', '10:30 · Alice gets her number back', 'She notices, calls her carrier, and her number is moved back to her SIM.', (st) => {
    st.clock = 90
    st.phoneOwner = 'alice'
  })
  time(120, '11:00 · a phishing email', `"Unusual activity on your account." The link goes to ${PHISH.replace('https://', '')}, a perfect copy that relays everything to the real bank as she types.`)
  record('phishing', attempt({ ev: 'phishing', who: 'alice', choice: 'default', via: 'proxy', startLine: 'm4', startTitle: 'Alice signs in on the phishing site', startText: 'She types her password. The proxy signs in at the real bank at the same moment.' }))
  time(300, '14:00 · Alice loses her phone', 'It is gone, with everything on it. She needs to pay a bill from her laptop today.')
  locals = {}
  push('a3', 'cons', 'lost', 'Her phone is lost', mode === 'passkey' ? 'Her laptop has its own passkey, registered last month as a backup.' : mode === 'recovery' ? 'The authenticator app went with it. She has the recovery codes she printed.' : mode === 'password' ? 'Nothing about her login depended on it.' : 'Her second factor was on it.', (st) => {
    st.phoneLost = true
  })
  record('lost', attempt({ ev: 'lost', who: 'alice', choice: mode === 'recovery' ? 'recovery' : mode === 'fallback' ? 'sms' : 'default', via: 'direct', startLine: 'a4', startTitle: 'Signs in from her laptop', startText: 'With whatever this design gives her.' }))

  s.settled = true
  locals = {}
  push(null, 'system', 'end', 'Run finished', verdictText(mode))
  return steps
}

export type Experiment = { label: string; title: string; mode: Mode; ev: string }
export const EXPERIMENTS: Experiment[] = [
  { label: 'A leaked password is enough', title: 'With only a password, the 09:00 credential-stuffing attempt signs straight in.', mode: 'password', ev: 'stuffing' },
  { label: 'The SIM swap reads the code', title: 'SMS stops the leaked password, but after a SIM swap the code arrives on the attacker\'s phone.', mode: 'sms', ev: 'simswap' },
  { label: 'The attacker picks the fallback', title: 'The app is the default, but "Try another way" sends an SMS to the swapped SIM.', mode: 'fallback', ev: 'simswap' },
  { label: 'Both factors on one phone', title: 'Losing the phone loses the app and the SMS together. Alice is locked out.', mode: 'fallback', ev: 'lost' },
  { label: 'A code typed is a code relayed', title: 'Without SMS the SIM swap fails, but the phishing site relays her app code in seconds.', mode: 'recovery', ev: 'phishing' },
  { label: 'Nothing to relay', title: 'Her browser has no passkey for the look-alike domain, so the phishing site gets nothing.', mode: 'passkey', ev: 'phishing' },
  { label: 'A second passkey', title: 'With her phone lost, the passkey on her laptop signs her in.', mode: 'passkey', ev: 'lost' },
]
