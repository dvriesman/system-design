// Part 3 of the Circuit Breaker page: half a minute of pay-later checkouts while the risk-score provider slows down,
// goes down and comes back, through four designs of the call.
export type Mode = 'wait' | 'retry' | 'breaker' | 'slow'
export type Scenario = 'outage' | 'blip'

// Actor ids reuse the colour classes in sim.css.
export type Actor = 'svc' | 'relay' | 'router'
export type Pane = 'checkout' | 'breaker'
export type CodeLine = { id: string; code: string; breakable: boolean }

const line = (id: string, code: string): CodeLine => ({ id, code, breakable: false })
const hasBreaker = (m: Mode) => m === 'breaker' || m === 'slow'

export const TIMEOUT_MS = 2000
export const CLIENT_DEFAULT_MS = 30000
export const SLOW_MS = 1000
export const WINDOW = 4
export const WAIT_S = 6
export const OUTAGE = { from: 12, to: 22 }

export const clockText = (seconds: number) => `12:00:${String(Math.floor(seconds)).padStart(2, '0')}`
export const msText = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} s` : `${ms} ms`)
export const fmt = (n: number) => `$${n.toLocaleString('en-US')}`

const AMOUNTS = [120, 340, 80, 560, 150, 220, 90, 410, 180, 75, 300, 140, 260, 95]
export const TIMES = AMOUNTS.map((_, i) => i * 2)

// ---- the provider, by the second
type Reply = { kind: 'ok'; ms: number } | { kind: 'error'; ms: number } | { kind: 'silent' }
export function providerAt(scenario: Scenario, t: number, nth: number): { label: string; tone: 'ok' | 'wait' | 'short'; reply: Reply } {
  if (scenario === 'blip') {
    if (t === 8 && nth === 0) return { label: 'one error (a deploy restarts one server)', tone: 'short', reply: { kind: 'error', ms: 50 } }
    return { label: 'healthy: answers in 100 ms', tone: 'ok', reply: { kind: 'ok', ms: 100 } }
  }
  if (t < 4 || t >= OUTAGE.to) return { label: 'healthy: answers in 100 ms', tone: 'ok', reply: { kind: 'ok', ms: 100 } }
  if (t < OUTAGE.from) return { label: 'slow: answers in 1.5 s', tone: 'wait', reply: { kind: 'ok', ms: 1500 } }
  return { label: 'down: accepts connections, never answers', tone: 'short', reply: { kind: 'silent' } }
}

// ---- code
function checkoutCode(m: Mode): CodeLine[] {
  const call =
    m === 'wait'
      ? '  val score = try { risk.score(order) }   // waits as long as the HTTP client: 30 s'
      : m === 'retry'
        ? '  val score = try { retry(times = 3) { risk.score(order, timeout = 2.s) } }'
        : '  val score = try { breaker.call { risk.score(order, timeout = 2.s) } }'
  return [
    line('c1', 'fun checkout(order) {'),
    line('c2', call),
    line('c3', `    catch (e: Exception) { null }${hasBreaker(m) ? '   // includes CallNotPermitted' : ''}`),
    line('c4', '  return if (score != null) decide(order, score)'),
    line('c5', '    else fallback(order)   // up to $200 on her history, or pay by card'),
    line('c6', '}'),
  ]
}

function breakerCode(m: Mode): CodeLine[] {
  if (!hasBreaker(m)) return [line('b0', '// no circuit breaker: every checkout calls the provider')]
  return [
    line('b1', 'fun call(block) {'),
    line('b2', '  if (state == OPEN) {'),
    line('b3', '    if (now < openUntil) throw CallNotPermitted   // fail fast: no call made'),
    line('b4', '    state = HALF_OPEN   // the wait is over: one trial call'),
    line('b5', '  }'),
    line('b6', '  val (ok, ms) = timed { runCatching(block) }'),
    line('b7', `  val failed = !ok${m === 'slow' ? ' || ms > 1000   // slow counts as failed' : ''}`),
    line('b8', '  if (state == HALF_OPEN) { if (failed) open() else close() }'),
    line('b9', '  else { window.record(failed); if (window.size >= 4 && window.failureRate >= 0.5) open() }'),
    line('b10', '  return result   // throws if the call itself failed'),
    line('b11', '}'),
    line('b12', 'fun open() { state = OPEN; openUntil = now + 6.s; window.clear() }'),
    line('b13', 'fun close() { state = CLOSED; window.clear() }'),
  ]
}

const MODES: Mode[] = ['wait', 'retry', 'breaker', 'slow']
export const CODE = Object.fromEntries(MODES.map((m) => [m, { checkout: checkoutCode(m), breaker: breakerCode(m) }])) as Record<Mode, Record<Pane, CodeLine[]>>

const PANE_PREFIX: Record<Pane, string> = { checkout: 'C', breaker: 'B' }
export function lineRef(id: string, mode: Mode): string {
  for (const pane of ['checkout', 'breaker'] as Pane[]) {
    const i = CODE[mode][pane].findIndex((l) => l.id === id)
    if (i >= 0) return `${PANE_PREFIX[pane]}${i + 1}`
  }
  return ''
}

// ---- state
export type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'
export type Checkout = { n: number; t: number; amount: number; path: 'score' | 'fallback'; ms: number; decision: string }
export type Call = { t: number; checkout: number; result: string; ms: number; duringOutage: boolean }
type LogEntry = { actor: Actor | 'system'; text: string }

export type SimState = {
  clock: number
  provider: string
  providerTone: 'ok' | 'wait' | 'short'
  breaker: BreakerState
  window: boolean[]
  openUntil: number | null
  calls: Call[]
  checkouts: Checkout[]
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
  n?: number
}

// ---- invariants
export const SLOW_BUDGET = 4
export const CALL_BUDGET = 3
export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']
const failingCalls = (s: SimState) => s.calls.filter((c) => c.duringOutage).length
const slowCheckouts = (s: SimState) => s.checkouts.filter((c) => c.ms > SLOW_MS).length

export function checks(s: SimState): CheckResult[] {
  const st = (bad: boolean, early = false): 'ok' | 'bad' | 'wait' => (bad && early ? 'bad' : !s.settled ? 'wait' : bad ? 'bad' : 'ok')
  const slow = slowCheckouts(s)
  const calls = failingCalls(s)
  const last = s.checkouts[s.checkouts.length - 1]
  return [
    ['Checkouts stay fast', `At most ${SLOW_BUDGET} take over 1 s: a breaker has to see a few bad calls before it can act. So far: ${slow}`, st(slow > SLOW_BUDGET, true)],
    ['A failing provider gets a rest', `At most ${CALL_BUDGET} calls reach it while it is failing. So far: ${calls}`, st(calls > CALL_BUDGET, true)],
    ['Back to real scores once it recovers', 'The last checkout uses the real score, not the fallback', st(!!last && last.path !== 'score')],
  ]
}
export const verdictIsBad = (s: SimState) => checks(s).some((c) => c[2] === 'bad')

export function verdictText(mode: Mode, scenario: Scenario, s: SimState): string {
  const slow = slowCheckouts(s)
  const calls = failingCalls(s)
  const fallbacks = s.checkouts.filter((c) => c.path === 'fallback').length
  const worst = Math.max(...s.checkouts.map((c) => c.ms))
  const facts = `${slow} checkout${slow === 1 ? '' : 's'} took over 1 s (the slowest ${msText(worst)}), ${calls} call${calls === 1 ? '' : 's'} hit the provider while it was failing, and ${fallbacks} checkout${fallbacks === 1 ? '' : 's'} used the fallback.`
  if (scenario === 'blip')
    return `${facts} ${mode === 'retry' ? 'One retry turned the blip into a real score, which is what retries are good at.' : hasBreaker(mode) ? 'One failure in four is 25%, under the 50% threshold, so the breaker stayed closed. A breaker should not trip on a blip.' : 'The one failed call used the fallback, which is fine for a blip.'}`
  const lesson: Record<Mode, string> = {
    wait: 'With no timeout, every checkout waited as long as the HTTP client would, 30 seconds, while the provider was down. Customers leave long before that, and every waiting checkout holds a worker.',
    retry: 'The 2-second timeout capped each try, but three tries made each checkout wait 6 seconds and sent the provider three times the calls while it was failing. Retries help with blips, and multiply load during an outage.',
    breaker: 'The breaker stopped calling the provider during the outage. But while it was only slow, every call succeeded, so the breaker saw nothing wrong, and checkouts took 1.5 seconds each.',
    slow: 'Counting slow calls as failures opened the breaker while the provider was only slow. Checkouts used the fallback in milliseconds, the provider got two trial calls during its outage, and the first trial after it recovered closed the breaker.',
  }
  return `${facts} ${lesson[mode]}`
}

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

const INTRO: Record<Mode, string> = {
  wait: 'Each checkout calls the risk-score provider and waits for an answer, however long it takes.',
  retry: 'Each try gives up after 2 seconds, and a failed try is retried, up to 3 tries.',
  breaker: 'A circuit breaker counts failed calls over the last 4. At 50% it opens, and for 6 seconds checkouts skip the provider and use the fallback. Then one trial call decides.',
  slow: 'The same breaker, but a call slower than 1 second counts as failed, even when it succeeds.',
}

export function build(mode: Mode, scenario: Scenario): Step[] {
  const first = providerAt(scenario, 0, 0)
  const s: SimState = { clock: 0, provider: first.label, providerTone: first.tone, breaker: 'CLOSED', window: [], openUntil: null, calls: [], checkouts: [], settled: false, log: [] }
  const steps: Step[] = [
    {
      s: clone(s),
      line: null,
      actor: null,
      label: 'start',
      title: 'Ready',
      text: `${INTRO[mode]} ${scenario === 'outage' ? 'A checkout arrives every 2 seconds. From 12:00:04 the provider slows to 1.5 seconds, from 12:00:12 it stops answering, and at 12:00:22 it is back.' : 'A checkout arrives every 2 seconds, and the provider fails once, at 12:00:08.'} Press Step to follow them.`,
      crash: false,
      locals: {},
    },
  ]

  let locals: Record<string, string> = {}
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }
  const NAME: Record<Actor, string> = { svc: 'Checkout', relay: 'Circuit breaker', router: 'Risk provider' }
  let afterCall: Record<string, string> | null = null
  const push = (id: string | null, actor: Actor | 'system', label: string, title: string, text: string, fn?: (st: SimState) => void, n?: number) => {
    if (fn) fn(s)
    s.log.push({ actor, text: `[${clockText(s.clock)}] [${actor === 'system' ? 'system' : NAME[actor]}] ${title}` })
    const before = actor === 'svc' && afterCall ? afterCall : undefined
    if (actor === 'svc') afterCall = null
    steps.push({ s: clone(s), line: id, actor, label, title, text, crash: false, locals: actor === 'system' ? {} : { ...locals }, ...(before ? { before } : {}), ...(n !== undefined ? { n } : {}) })
  }

  // One real call to the provider, with a timeout.
  const callProvider = (t: number, n: number, nth: number, timeout: number): { ok: boolean; ms: number; result: string } => {
    const p = providerAt(scenario, t, nth)
    const r = p.reply
    const ok = r.kind === 'ok' && r.ms <= timeout
    const ms = r.kind === 'silent' ? timeout : Math.min(r.ms, timeout)
    const result = r.kind === 'error' ? '500 error' : ok ? `score in ${msText(ms)}` : `timed out after ${msText(ms)}`
    s.calls.push({ t, checkout: n, result, ms, duringOutage: p.tone === 'short' })
    return { ok, ms, result }
  }

  const transition = (to: BreakerState, now: number) => {
    if (to === 'OPEN') {
      push('b12', 'relay', 'open', `Opens until ${clockText(now + WAIT_S)}`, `For ${WAIT_S} seconds, no call reaches the provider. Checkouts get an exception straight away, and use the fallback.`, (st) => {
        st.breaker = 'OPEN'
        st.openUntil = now + WAIT_S
        st.window = []
      })
    } else
      push('b13', 'relay', 'close', 'Closes: calls flow again', 'The trial call worked, so the provider is treated as healthy. Counting starts again from an empty window.', (st) => {
        st.breaker = 'CLOSED'
        st.openUntil = null
        st.window = []
      })
  }

  for (let i = 0; i < AMOUNTS.length; i++) {
    const t = TIMES[i]
    const n = i + 1
    const amount = AMOUNTS[i]
    const p = providerAt(scenario, t, 0)
    push(null, 'system', `#${n}`, `${clockText(t)} · checkout #${n}, ${fmt(amount)}`, `The provider is ${p.label}.`, (st) => {
      st.clock = t
      st.provider = p.label
      st.providerTone = p.tone
    })
    locals = { order: `{ id: ${n}, amount: ${fmt(amount)} }` }
    let ms = 0
    let score: string | null = null

    if (!hasBreaker(mode)) {
      const tries = mode === 'retry' ? 3 : 1
      for (let a = 0; a < tries; a++) {
        const r = callProvider(t, n, a, mode === 'retry' ? TIMEOUT_MS : CLIENT_DEFAULT_MS)
        ms += r.ms
        push(
          'c2',
          'svc',
          r.ok ? 'score' : 'fail',
          `${mode === 'retry' ? `Try ${a + 1} of 3: ` : ''}${r.result}`,
          r.ok
            ? r.ms > SLOW_MS
              ? 'An answer, but a slow one. The customer is staring at a spinner.'
              : 'A normal answer.'
            : mode === 'wait'
              ? 'Nothing told the call to give up, so it waited until the HTTP client\'s own limit. The customer has almost certainly left.'
              : a < 2
                ? 'The timeout gave up after 2 seconds, and the retry calls a provider that is already failing.'
                : 'Third failure. That is 3 calls to a failing provider, for one checkout.',
          undefined,
          n,
        )
        if (r.ok) {
          score = String(300 + ((n * 37) % 500))
          break
        }
      }
      afterCall = { ...locals }
    } else {
      push('c2', 'svc', 'call', 'Calls the provider through the breaker', 'The breaker decides whether the call happens at all.')
      const caller = locals
      locals = {}
      setLocal('state', s.breaker)
      push('b2', 'relay', s.breaker === 'OPEN' ? 'open' : 'check', s.breaker === 'OPEN' ? 'The breaker is open' : `The breaker is ${s.breaker.toLowerCase()}: condition is false`, s.breaker === 'OPEN' ? 'Has it been open long enough?' : 'Calls go through.')
      let rejected = false
      if (s.breaker === 'OPEN') {
        if (t < (s.openUntil ?? 0)) {
          push('b3', 'relay', 'reject', `Open until ${clockText(s.openUntil!)}: throws CallNotPermitted`, 'No call is made. The provider gets a rest, and the checkout gets its answer in a millisecond.', undefined, n)
          rejected = true
          ms = 1
        } else {
          push('b3', 'relay', 'wait over', `${clockText(s.openUntil!)} has passed: condition is false`, 'Time for a trial.')
          setLocal('state', 'HALF_OPEN')
          push('b4', 'relay', 'half-open', 'Half-open: lets this one call through as a trial', 'Only one call tests the provider. If it fails, the breaker opens again for another 6 seconds.', (st) => {
            st.breaker = 'HALF_OPEN'
          })
        }
      }
      if (!rejected) {
        const r = callProvider(t, n, 0, TIMEOUT_MS)
        ms = r.ms
        setLocal('ok', String(r.ok))
        setLocal('ms', String(r.ms))
        push('b6', 'relay', r.ok ? 'score' : 'fail', `The call: ${r.result}`, r.ok ? (r.ms > SLOW_MS ? 'It worked, slowly.' : 'A normal answer.') : 'The timeout gave up after 2 seconds.', undefined, n)
        const failed = !r.ok || (mode === 'slow' && r.ms > SLOW_MS)
        setLocal('failed', String(failed))
        push('b7', 'relay', failed ? 'failed' : 'passed', failed ? (r.ok ? 'Counts as failed: slower than 1 second' : 'Counts as failed') : 'Counts as a success', failed && r.ok ? 'The customer still gets the real score this time. The breaker records that the provider is struggling.' : mode === 'breaker' && r.ms > SLOW_MS ? 'It took 1.5 seconds, but only errors and timeouts count here, so this looks healthy.' : 'Recorded in the window.')
        if (s.breaker === 'HALF_OPEN') {
          push('b8', 'relay', failed ? 'reopen' : 'recovered', failed ? 'The trial failed: opens again' : 'The trial worked: closes', failed ? 'The provider is still not well.' : 'The provider is back.')
          transition(failed ? 'OPEN' : 'CLOSED', t)
        } else {
          const nextWindow = [...s.window, failed].slice(-WINDOW)
          const rate = nextWindow.filter(Boolean).length / nextWindow.length
          const trips = nextWindow.length >= WINDOW && rate >= 0.5
          push('b9', 'relay', trips ? 'trip' : 'record', `Window: ${nextWindow.map((x) => (x ? '✗' : '✓')).join(' ')}, ${Math.round(rate * 100)}% failed`, trips ? 'Half of the last 4 calls failed, so the breaker trips.' : nextWindow.length < WINDOW ? `Only ${nextWindow.length} of the 4 calls it needs before it judges.` : 'Under 50%: stays closed.', (st) => {
            st.window = nextWindow
          })
          if (trips) transition('OPEN', t)
        }
        if (r.ok) score = String(300 + ((n * 37) % 500))
        push('b10', 'relay', r.ok ? 'return' : 'throw', r.ok ? 'Returns the score' : 'Throws the failure to the checkout', r.ok ? 'Back to the checkout.' : 'The checkout catches it and uses the fallback.')
      }
      locals = caller
      afterCall = { ...caller }
    }

    setLocal('score', score ?? 'null')
    // A failed call leaves score unset until the catch runs, so only a real score is visible before the next line.
    if (afterCall && score !== null) afterCall = { ...afterCall, score }
    if (score === null) push('c3', 'svc', 'catch', 'Catches the failure: score = null', hasBreaker(mode) && ms <= 1 ? 'CallNotPermitted is an exception like any other here.' : 'The checkout will not get a real score this time.')
    const decision = score !== null ? (Number(score) >= 400 ? 'approved' : 'card instead') : amount <= 200 ? 'approved (history)' : 'card instead'
    const record = (st: SimState) => {
      st.checkouts.push({ n, t, amount, path: score !== null ? 'score' : 'fallback', ms, decision })
    }
    if (score !== null) push('c4', 'svc', 'decide', `Decides with score ${score}: ${decision}, in ${msText(ms)}`, ms > SLOW_MS ? 'The right decision, but the customer waited.' : 'The normal path.', record, n)
    else {
      push('c4', 'svc', 'no score', 'No score: condition is false', 'So the fallback decides.')
      push('c5', 'svc', 'fallback', `Fallback: ${decision}, in ${msText(ms)}`, amount <= 200 ? 'A conservative rule without the provider: small purchases on her repayment history. Some customers it would have approved now pay by card.' : `${fmt(amount)} is over the $200 the fallback allows, so she is offered card payment instead.`, record, n)
    }
    locals = {}
  }

  s.settled = true
  push(null, 'system', 'end', 'Run finished', verdictText(mode, scenario, s))
  return steps
}

export type Experiment = { label: string; title: string; mode: Mode; scenario: Scenario; n: number | null }

export const EXPERIMENTS: Experiment[] = [
  { label: 'Thirty seconds of nothing', title: 'No timeout: while the provider is down, each checkout waits for the HTTP client\'s 30-second limit.', mode: 'wait', scenario: 'outage', n: 7 },
  { label: 'Retries triple the load', title: 'Each checkout tries 3 times during the outage: 6 seconds of waiting, and 3 calls to a failing provider.', mode: 'retry', scenario: 'outage', n: 7 },
  { label: 'The breaker trips', title: 'Two failures in the last four calls: the breaker opens, and checkouts stop calling.', mode: 'breaker', scenario: 'outage', n: 8 },
  { label: 'Slow, but not failing', title: 'While the provider takes 1.5 s, every call succeeds, and the error-only breaker never opens.', mode: 'breaker', scenario: 'outage', n: 4 },
  { label: 'Slow counts as failed', title: 'Counting slow calls opens the breaker at 12:00:06, while the provider is only slow.', mode: 'slow', scenario: 'outage', n: 4 },
  { label: 'The trial call', title: 'Half-open: one call tests the provider. It fails during the outage, and succeeds once it recovers.', mode: 'slow', scenario: 'outage', n: 13 },
  { label: 'A blip is not an outage', title: 'One failure in four is under the 50% threshold, so the breaker stays closed. A retry would have saved it.', mode: 'slow', scenario: 'blip', n: 5 },
]
