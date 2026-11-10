// Part 3 of the Saga page: one afternoon of Alice's pay-later purchases, through four designs of the checkout.
export type Mode = 'chain' | 'memory' | 'log' | 'pivot'

// Actor ids reuse the colour classes in sim.css.
export type Actor = 'cons' | 'svc' | 'relay' | 'migrator'
export type Pane = 'app' | 'checkout' | 'services' | 'recovery'
export type CodeLine = { id: string; code: string; breakable: boolean }

const line = (id: string, code: string, breakable = false): CodeLine => ({ id, code, breakable })
const durable = (m: Mode) => m === 'log' || m === 'pivot'

const LIMIT = 1000
export const fmt = (n: number) => `$${n.toLocaleString('en-US')}`
export const clockText = (minutes: number) => {
  const total = 12 * 60 + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

export type Purchase = { id: string; item: string; amount: number; shop: string; at: number }
export const PURCHASES: Purchase[] = [
  { id: 'buy-1', item: 'headphones', amount: 300, shop: 'audio-shop', at: 0 },
  { id: 'buy-2', item: 'sofa', amount: 600, shop: 'sofa-shop', at: 5 },
  { id: 'buy-3', item: 'lamp', amount: 200, shop: 'lamp-shop', at: 10 },
]
const pText = (p: Purchase) => `{ id: '${p.id}', amount: ${fmt(p.amount)}, shop: '${p.shop}' }`

function appCode(): CodeLine[] {
  return [line('a1', 'fun buy(item, price, shop) {'), line('a2', '  val answer = checkout(Purchase(item, price, shop))   // a spinner'), line('a3', '  show(answer)'), line('a4', '}')]
}

function checkoutCode(m: Mode): CodeLine[] {
  const mark = (id: string, step: string): CodeLine[] =>
    m === 'chain' ? [] : [line(id, m === 'memory' ? `  done += "${step}"` : `  sagas.markDone(p.id, "${step}")`, true)]
  return [
    line('o1', 'fun checkout(p) {'),
    ...(m === 'chain' ? [] : [line('o2', m === 'memory' ? '  val done = mutableListOf<String>()' : '  sagas.insert(p.id, state = "running")', true)]),
    line('o3', '  credit.reserve(p.id, p.amount)', true),
    ...mark('o3s', 'reserve'),
    line('o4', '  loans.create(p.id, p.amount)', true),
    ...mark('o4s', 'loan'),
    line('o5', `  ${m === 'pivot' ? 'var' : 'val'} result = payouts.pay(p.id, p.shop, p.amount)`, true),
    ...(m === 'pivot' ? [line('o6a', "  if (result == 'timeout') result = payouts.status(p.id)   // ask, don't guess", true)] : []),
    line(
      'o6',
      m === 'chain'
        ? "  if (result != 'sent') return 'error'"
        : m === 'pivot'
          ? "  if (result == 'rejected') return undo(p)"
          : `  if (result != 'sent') return undo(p${m === 'memory' ? ', done' : ''})   // a timeout counts as a no`,
      true,
    ),
    ...(durable(m) ? [line('o7', `  sagas.markDone(p.id, "payout")${m === 'pivot' ? '   // no undo past this point' : ''}`, true)] : []),
    line('o9', '  merchants.confirm(p.id)', true),
    ...(durable(m) ? [line('o9s', '  sagas.finish(p.id)', true)] : []),
    line('o10', "  return 'approved'", true),
    line('o11', '}'),
    ...(m === 'chain'
      ? []
      : [
          line('u1', `fun undo(p${m === 'memory' ? ', done' : ''}) {`),
          ...(durable(m) ? [line('u2', '  sagas.markUndoing(p.id)', true), line('u2b', '  val done = sagas.doneSteps(p.id)')] : []),
          line('u3', `  if ("loan" in done) loans.cancel(p.id)${durable(m) ? '   // safe to repeat' : ''}`, true),
          line('u4', `  if ("reserve" in done) credit.release(p.id)${durable(m) ? '   // safe to repeat' : ''}`, true),
          ...(durable(m) ? [line('u5', '  sagas.markUndone(p.id)', true)] : []),
          line('u6', "  return 'declined'"),
          line('u7', '}'),
        ]),
  ]
}

function servicesCode(): CodeLine[] {
  return [
    line('s1', '// credit: throws if Alice\'s limit is too low'),
    line('s2', 'fun reserve(id, amount) = holds.insertIfAbsent(id, amount)'),
    line('s3', 'fun release(id) = holds.markReleased(id)'),
    line('s4', '// loans: Alice owes from the moment a loan exists'),
    line('s5', "fun create(id, amount) = loans.insertIfAbsent(id, amount, 'owed')"),
    line('s6', "fun cancel(id) = loans.update(id, status = 'cancelled')"),
    line('s7', '// payouts: the bank uses id as its idempotency key'),
    line('s8', 'fun pay(id, shop, amount) = bank.transfer(key = id, shop, amount)'),
    line('s9', 'fun status(id) = bank.lookup(key = id)'),
    line('s10', '// merchants: tells the shop to ship'),
    line('s11', 'fun confirm(id) = shops.notifyIfNew(id, "ship it")'),
  ]
}

function recoveryCode(m: Mode): CodeLine[] {
  if (!durable(m)) return [line('r0', '// none: where a checkout got to lives only in its memory')]
  return [
    line('r1', 'fun recover() {   // runs every minute'),
    line('r2', '  for (s in sagas.unfinished(olderThan = 1.minutes)) {'),
    line('r3', '    if (s.state == "undoing") undo(s.p)'),
    line('r4', '    else resume(s.p, after = s.done.last())   // runs the remaining steps'),
    line('r5', '  }'),
    line('r6', '}'),
  ]
}

const MODES: Mode[] = ['chain', 'memory', 'log', 'pivot']
export const CODE = Object.fromEntries(
  MODES.map((m) => [m, { app: appCode(), checkout: checkoutCode(m), services: servicesCode(), recovery: recoveryCode(m) }]),
) as Record<Mode, Record<Pane, CodeLine[]>>

const PANE_PREFIX: Record<Pane, string> = { app: 'A', checkout: 'C', services: 'S', recovery: 'R' }

export function lineRef(id: string, mode: Mode): string {
  for (const pane of ['app', 'checkout', 'services', 'recovery'] as Pane[]) {
    const i = CODE[mode][pane].findIndex((l) => l.id === id)
    if (i >= 0) return `${PANE_PREFIX[pane]}${i + 1}`
  }
  return ''
}

export type Hold = { id: string; amount: number; status: 'held' | 'released' }
export type Loan = { id: string; item: string; amount: number; status: 'owed' | 'cancelled' }
export type Transfer = { key: string; shop: string; amount: number; status: 'sent' | 'rejected'; calls: number }
export type Saga = { id: string; state: 'running' | 'undoing' | 'undone' | 'done'; done: string[] }
export type Screen = { id: string; item: string; text: string; tone: 'ok' | 'bad' | 'wait' }
type LogEntry = { actor: Actor | 'crash' | 'system'; text: string }

export type SimState = {
  clock: number
  holds: Hold[]
  loans: Loan[]
  transfers: Transfer[]
  shipped: string[]
  sagas: Saga[]
  screen: Screen[]
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
  before?: Record<string, string>
}

export const available = (s: SimState) => LIMIT - s.holds.filter((h) => h.status === 'held').reduce((sum, h) => sum + h.amount, 0)
export { LIMIT }

const owed = (s: SimState, id: string) => s.loans.some((l) => l.id === id && l.status === 'owed')
const sent = (s: SimState, id: string) => s.transfers.some((t) => t.key === id && t.status === 'sent')
const held = (s: SimState, id: string) => s.holds.some((h) => h.id === id && h.status === 'held')

// A purchase is finished when it went all the way, or nothing of it is left in place.
function halfDone(s: SimState, p: Purchase): boolean {
  const all = held(s, p.id) && owed(s, p.id) && sent(s, p.id) && s.shipped.includes(p.id)
  const none = !held(s, p.id) && !owed(s, p.id)
  return !all && !none
}

export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']

export function checks(s: SimState): CheckResult[] {
  const st = (bad: boolean): 'ok' | 'bad' | 'wait' => (!s.settled ? 'wait' : bad ? 'bad' : 'ok')
  return [
    ['Alice owes only for what was paid', 'Every loan she owes has a payout to the shop', st(PURCHASES.some((p) => owed(s, p.id) && !sent(s, p.id)))],
    ["Every payout is covered by a loan", "The lender never sends a shop money that nobody owes back", st(PURCHASES.some((p) => sent(s, p.id) && !owed(s, p.id)))],
    ['Nothing is left half-done', 'Each purchase either went all the way, or none of it is left holding her limit or her loans', st(PURCHASES.some((p) => halfDone(s, p)))],
  ]
}

export const verdictIsBad = (s: SimState) => checks(s).some((c) => c[2] === 'bad')

export function verdictText(mode: Mode, s: SimState): string {
  const problems: string[] = []
  for (const p of PURCHASES) {
    if (owed(s, p.id) && !sent(s, p.id)) problems.push(`Alice owes ${fmt(p.amount)} for the ${p.item}, and ${p.shop} was never paid.`)
    else if (sent(s, p.id) && !owed(s, p.id)) problems.push(`${p.shop} got ${fmt(p.amount)} for the ${p.item}, and nobody owes it back: the lender lost it.`)
    else if (halfDone(s, p)) problems.push(`The ${p.item} is stuck halfway: ${owed(s, p.id) ? 'Alice owes for it' : 'part of her limit is held for it'}, but ${s.shipped.includes(p.id) ? 'the rest never finished' : 'the shop was never told to ship'}.`)
  }
  const declined = s.screen.find((x) => x.id === 'buy-3' && x.text.includes('limit'))
  if (declined) problems.push('The lamp was refused because holds from earlier purchases were still taking her limit.')
  const crash = s.crashes ? (verdictIsBad(s) ? '' : ' The crash cost time, and the saga log meant the recovery job finished the work.') : ''
  if (!problems.length) {
    return mode === 'pivot'
      ? `Every check holds. The sofa was undone step by step, and the lamp's timeout was answered by asking the bank, not by guessing.${crash} This depends on the bank honouring the idempotency key and answering a status lookup, and on every undo being safe to repeat.`
      : `Every check holds in this run.${crash}`
  }
  const lesson =
    mode === 'chain'
      ? 'Each step committed on its own, and nothing undid the earlier steps when a later one failed.'
      : mode === 'memory'
        ? [
            s.crashes && (PURCHASES.some((p) => halfDone(s, p)) || declined) ? 'The list of finished steps lived in memory, so the crash took it, and nothing finished or undid the purchase.' : '',
            PURCHASES.some((p) => sent(s, p.id) && !owed(s, p.id)) ? 'Undo works when the answer is a clear no. A timeout means "don\'t know", and here the bank had already paid.' : '',
          ]
            .filter(Boolean)
            .join(' ')
        : 'The saga log let the recovery job finish what a crash interrupted. But a timeout still counted as a no, and the bank had already paid.'
  return `${problems.join(' ')} ${lesson}`
}

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

const INTRO: Record<Mode, string> = {
  chain: 'The checkout calls each service in turn, and stops at the first problem.',
  memory: 'The checkout remembers which steps it finished, and undoes them in reverse if a later step fails.',
  log: 'The same undo, but the progress is saved in a saga log, and a recovery job finishes any checkout a crash interrupted.',
  pivot: "The same saga log. A timeout is no longer a failure: the checkout asks the bank what happened, and undoes only on a clear no.",
}

type Outcome = 'approved' | 'declined' | 'refused' | 'error' | 'crashed'

export function build(mode: Mode, crashId: string | null): Step[] {
  const s: SimState = { clock: 0, holds: [], loans: [], transfers: [], shipped: [], sagas: [], screen: [], settled: false, crashes: 0, log: [] }
  const steps: Step[] = [
    {
      s: clone(s),
      line: null,
      actor: null,
      label: 'start',
      title: 'Ready',
      text: `${INTRO[mode]} The afternoon is the same in every mode: Alice has a ${fmt(LIMIT)} pay-later limit, and buys headphones, a sofa and a lamp. The sofa shop's bank account was closed, and the bank's replies about the lamp get lost. Press Step, or click a gutter dot to kill the checkout service just before that line.`,
      crash: false,
      locals: {},
    },
  ]

  let locals: Record<string, string> = {}
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }
  const NAME: Record<Actor, string> = { cons: "Alice's app", svc: 'Checkout', relay: 'Services', migrator: 'Recovery job' }
  // After a service call returns, the caller's next line starts from the caller's variables, plus what the call returned.
  let afterCall: { actor: Actor | 'system'; locals: Record<string, string> } | null = null
  const push = (id: string | null, actor: Actor | 'system', label: string, title: string, text: string | null, fn?: (st: SimState) => void, isCrash = false) => {
    if (fn) fn(s)
    const who = actor === 'system' ? 'system' : NAME[actor]
    s.log.push({ actor: isCrash ? 'crash' : actor, text: `[${clockText(s.clock)}] [${who}] ${title}` })
    const before = actor !== 'relay' && afterCall?.actor === actor ? afterCall.locals : undefined
    if (actor !== 'relay') afterCall = null
    steps.push({ s: clone(s), line: id, actor, label, title, text, crash: isCrash, locals: actor === 'system' ? {} : { ...locals }, ...(before ? { before } : {}) })
  }
  // A value the call just returned: it belongs to the caller's previous line.
  const setReturn = (name: string, value: string) => {
    setLocal(name, value)
    if (afterCall) afterCall.locals = { ...afterCall.locals, [name]: value }
  }

  let crashed = false
  const hit = (id: string) => {
    if (!crashed && crashId === id) {
      crashed = true
      return true
    }
    return false
  }
  const die = (id: string, text: string) => {
    push(id, 'svc', 'CRASH', 'Checkout process killed', text, (st) => {
      st.crashes++
    }, true)
  }

  // Calls a service: one step on the service's own line, then back to the caller's variables.
  const service = (id: string, label: string, title: string, text: string, args: Record<string, string>, fn?: (st: SimState) => void) => {
    const caller = locals
    locals = args
    push(id, 'relay', label, title, text, fn)
    locals = caller
    afterCall = { actor: 'svc', locals: { ...caller } }
  }

  const saga = (p: Purchase) => s.sagas.find((x) => x.id === p.id)
  const markDone = (p: Purchase, stepName: string) => (st: SimState) => {
    st.sagas.find((x) => x.id === p.id)!.done.push(stepName)
  }

  // ---- undo, in reverse order
  const undo = (p: Purchase): Outcome => {
    const caller = locals
    locals = { p: pText(p), ...(mode === 'memory' ? { done: caller.done } : {}) }
    if (durable(mode)) {
      if (hit('u2')) {
        die('u2', 'The saga log still says "running", so the recovery job will pick this purchase up and try again from where it got to.')
        return 'crashed'
      }
      const already = saga(p)!.state === 'undoing'
      push('u2', 'svc', 'undoing', already ? 'Already marked as being undone: nothing changes' : 'Records that this purchase is being undone', already ? 'Writing the same state again is harmless.' : 'If the process dies during the undo, the recovery job knows to carry on undoing, not to start paying again.', (st) => {
        st.sagas.find((x) => x.id === p.id)!.state = 'undoing'
      })
      const done = saga(p)!.done
      setLocal('done', `[${done.map((d) => `"${d}"`).join(', ')}]`)
      push('u2b', 'svc', 'read', `Reads the finished steps: ${done.join(', ') || 'none'}`, 'The list comes from the database, not from memory, so it is the same after a restart.')
    }
    const doneList = durable(mode) ? saga(p)!.done : (locals.done ?? '')
    const has = (x: string) => doneList.includes(x)
    if (hit('u3')) {
      die('u3', durable(mode) ? 'The log says "undoing". The recovery job will run the undo again, and each undo is safe to repeat.' : 'The undo was in progress, and only this process knew it. Nothing will finish it.')
      return 'crashed'
    }
    if (has('loan')) {
      push('u3', 'svc', 'cancel', 'The loan was created, so cancel it', 'Undo runs in reverse: the newest step first.')
      const gone = s.loans.find((l) => l.id === p.id)?.status === 'cancelled'
      service('s6', gone ? 'repeat' : 'cancel', gone ? 'The loan is already cancelled: nothing changes' : `Cancels the ${fmt(p.amount)} loan`, gone ? 'This is what "safe to repeat" means: the second cancel finds the work already done.' : 'Alice no longer owes for this purchase. The row stays, marked cancelled, because money records are never deleted.', { id: `'${p.id}'` }, (st) => {
        st.loans.find((l) => l.id === p.id)!.status = 'cancelled'
      })
    } else push('u3', 'svc', 'skip', 'No loan was created: nothing to cancel', 'Only finished steps are undone.')
    if (hit('u4')) {
      die('u4', durable(mode) ? 'The log says "undoing". The recovery job will run the undo again, and cancelling twice changes nothing.' : 'The loan is cancelled, but the hold on her limit stays, and nothing will release it.')
      return 'crashed'
    }
    if (has('reserve')) {
      push('u4', 'svc', 'release', 'The limit was reserved, so release it', 'This is the last undo, because reserving was the first step.')
      const freed = s.holds.find((h) => h.id === p.id)?.status === 'released'
      service('s3', freed ? 'repeat' : 'release', freed ? 'The hold is already released: nothing changes' : `Releases ${fmt(p.amount)} of Alice's limit`, freed ? 'Releasing twice must not free the money twice.' : 'She can spend it again.', { id: `'${p.id}'` }, (st) => {
        const h = st.holds.find((x) => x.id === p.id)!
        h.status = 'released'
      })
    } else push('u4', 'svc', 'skip', 'Nothing was reserved: nothing to release', 'Only finished steps are undone.')
    if (durable(mode)) {
      if (hit('u5')) {
        die('u5', 'Everything is undone, but the log still says "undoing". The recovery job will run the undo again, and each undo finds nothing left to do.')
        return 'crashed'
      }
      push('u5', 'svc', 'undone', 'Records that the purchase is fully undone', 'The recovery job will leave it alone from now on.', (st) => {
        st.sagas.find((x) => x.id === p.id)!.state = 'undone'
      })
    }
    push('u6', 'svc', 'declined', "Returns 'declined'", 'Every finished step was undone, in reverse order.')
    locals = caller
    return 'declined'
  }

  // ---- the checkout, from the start or resumed after a finished step
  const checkout = (p: Purchase, after: string | null): Outcome => {
    locals = { p: pText(p) }
    const finished = after === null ? [] : saga(p)!.done
    const has = (x: string) => finished.includes(x)
    if (after === null && mode !== 'chain') {
      if (hit('o2')) {
        die('o2', 'Nothing has happened yet. Alice gets an error and taps Pay again.')
        return 'crashed'
      }
      if (mode === 'memory') {
        setLocal('done', '[]')
        push('o2', 'svc', 'start', 'Starts an empty list of finished steps', 'This list is how the checkout will know what to undo. It lives in this process only.')
      } else
        push('o2', 'svc', 'start', 'Inserts a saga row for this purchase', 'The saga log is a table in the checkout\'s own database. From now on, every finished step is written down.', (st) => {
          st.sagas.push({ id: p.id, state: 'running', done: [] })
        })
    }
    const mark = (id: string, stepName: string): boolean => {
      if (mode === 'chain') return true
      if (hit(id)) {
        die(id, durable(mode) ? `The ${stepName} step finished, but the log doesn't say so yet. The recovery job will run it again, and it's safe to repeat.` : `The ${stepName} step finished, and the process that knew it is gone.`)
        return false
      }
      if (mode === 'memory') {
        const list = locals.done === '[]' ? [] : (locals.done ?? '[]').slice(1, -1).split(', ')
        setLocal('done', `[${[...list, `"${stepName}"`].join(', ')}]`)
        push(id, 'svc', 'remember', `Remembers that "${stepName}" is done`, 'In memory only.')
      } else push(id, 'svc', 'mark', `Writes "${stepName}" to the saga log`, 'This survives a restart.', markDone(p, stepName))
      return true
    }

    if (!has('reserve')) {
      if (hit('o3')) {
        die('o3', durable(mode) ? 'The saga row exists, with nothing done. The recovery job will start the steps.' : 'Nothing has happened yet. Alice gets an error and taps Pay again.')
        return 'crashed'
      }
      push('o3', 'svc', 'reserve', `Asks the credit service to reserve ${fmt(p.amount)}`, 'Step 1: hold part of her limit, so two purchases can\'t spend the same money.')
      const free = available(s)
      if (free < p.amount) {
        service('s2', 'refused', `Refuses: only ${fmt(free)} of her limit is free`, 'The service throws, and the checkout ends here. Nothing was done, so there is nothing to undo.', { id: `'${p.id}'`, amount: fmt(p.amount) })
        return 'refused'
      }
      const again = s.holds.some((h) => h.id === p.id)
      service('s2', again ? 'repeat' : 'hold', again ? 'This hold already exists: nothing changes' : `Holds ${fmt(p.amount)} of Alice's limit`, again ? 'A repeated call is harmless, because the hold is keyed by the purchase.' : `${fmt(free - p.amount)} is left for other purchases.`, { id: `'${p.id}'`, amount: fmt(p.amount) }, (st) => {
        if (!again) st.holds.push({ id: p.id, amount: p.amount, status: 'held' })
      })
      if (!mark('o3s', 'reserve')) return 'crashed'
    }
    if (!has('loan')) {
      if (hit('o4')) {
        die('o4', durable(mode) ? 'Her limit is held. The log says so, and the recovery job will carry on.' : 'Her limit is held, and nothing will ever release it.')
        return 'crashed'
      }
      push('o4', 'svc', 'loan', `Asks the loan service to create the ${fmt(p.amount)} loan`, 'Step 2: Alice now owes this amount in installments. This is a separate service with its own database, so this commit is final on its own.')
      const again = s.loans.some((l) => l.id === p.id)
      service('s5', again ? 'repeat' : 'owed', again ? 'This loan already exists: nothing changes' : `Creates the loan: Alice owes ${fmt(p.amount)}`, again ? 'A repeated call is harmless, because the loan is keyed by the purchase.' : 'Her first installment is now scheduled.', { id: `'${p.id}'`, amount: fmt(p.amount) }, (st) => {
        if (!again) st.loans.push({ id: p.id, item: p.item, amount: p.amount, status: 'owed' })
      })
      if (!mark('o4s', 'loan')) return 'crashed'
    }
    if (!has('payout')) {
      if (hit('o5')) {
        die('o5', durable(mode) ? 'Her limit is held and she owes the loan. The log says both are done, and the recovery job will carry on.' : 'Her limit is held and she owes the loan, but the shop was never paid. Nothing will finish or undo this.')
        return 'crashed'
      }
      push('o5', 'svc', 'pay', `Asks the payout service to send ${fmt(p.amount)} to ${p.shop}`, 'Step 3: real money leaves for the shop\'s bank. Unlike the first two steps, this one can\'t simply be undone.')
      const existing = s.transfers.find((t) => t.key === p.id)
      let result: 'sent' | 'rejected' | 'timeout'
      if (p.shop === 'sofa-shop') {
        result = 'rejected'
        service('s8', 'rejected', 'The bank rejects the transfer: the account is closed', existing ? 'The same key, so the bank returns its original answer.' : 'A clear, final no. No money moved.', { id: `'${p.id}'`, shop: `'${p.shop}'`, amount: fmt(p.amount) }, (st) => {
          if (existing) existing.calls++
          else st.transfers.push({ key: p.id, shop: p.shop, amount: p.amount, status: 'rejected', calls: 1 })
        })
      } else if (p.shop === 'lamp-shop') {
        result = 'timeout'
        service('s8', 'timeout', existing ? 'Same key: the bank doesn\'t pay twice, and the reply is lost again' : 'The bank sends the money, but its reply never arrives', existing ? 'The bank recognises the key and returns its earlier result, but this reply is lost too.' : `${p.shop} has its ${fmt(p.amount)}. The payout service waited, gave up, and reports a timeout. Nobody on this side knows the money left.`, { id: `'${p.id}'`, shop: `'${p.shop}'`, amount: fmt(p.amount) }, (st) => {
          if (!existing) st.transfers.push({ key: p.id, shop: p.shop, amount: p.amount, status: 'sent', calls: 1 })
          else existing.calls++
        })
      } else {
        result = 'sent'
        service('s8', existing ? 'repeat' : 'sent', existing ? 'Same key: the bank returns its earlier answer, and pays nothing more' : `The bank sends ${fmt(p.amount)} to ${p.shop}`, existing ? 'This is why the payout uses the purchase as its idempotency key.' : 'The money has left.', { id: `'${p.id}'`, shop: `'${p.shop}'`, amount: fmt(p.amount) }, (st) => {
          if (!existing) st.transfers.push({ key: p.id, shop: p.shop, amount: p.amount, status: 'sent', calls: 1 })
          else existing.calls++
        })
      }
      setReturn('result', `'${result}'`)
      if (mode === 'pivot') {
        if (hit('o6a')) {
          die('o6a', 'The money may have left. The log says the loan is done, so the recovery job will call pay again with the same key, and the bank won\'t pay twice.')
          return 'crashed'
        }
        if (result === 'timeout') {
          push('o6a', 'svc', 'status', 'A timeout: asks the bank what happened', '"I didn\'t hear back" is not "no". The checkout looks the transfer up by the same key.')
          service('s9', 'lookup', 'The bank answers: sent', 'A lookup is a read, so it can be repeated until it gets an answer.', { id: `'${p.id}'` })
          result = 'sent'
          setReturn('result', "'sent'")
        } else push('o6a', 'svc', 'check', `The result is '${result}': condition is false`, 'Only a timeout needs a lookup.')
      }
      if (hit('o6')) {
        die('o6', durable(mode) ? 'The log says the loan is done, so the recovery job will call pay again, with the same key.' : `The result was '${result}', and it died with this process. Her limit is held and she owes the loan.`)
        return 'crashed'
      }
      const failed = mode === 'pivot' ? result === 'rejected' : result !== 'sent'
      if (failed) {
        push('o6', 'svc', mode === 'chain' ? 'error' : 'undo', `The result is '${result}': ${mode === 'chain' ? "returns 'error'" : 'undoes the finished steps'}`,
          mode === 'chain'
            ? 'The checkout stops. Nothing here undoes the hold or the loan, and they are committed in other services.'
            : result === 'timeout'
              ? 'The code treats "no answer" as "no". But the bank did send the money.'
              : 'A clear no from the bank, so the earlier steps must be undone.')
        if (mode === 'chain') return 'error'
        return undo(p)
      }
      push('o6', 'svc', 'check', `The result is 'sent': condition is false`, 'The shop has its money.')
      if (durable(mode)) {
        if (hit('o7')) {
          die('o7', 'The money left, but the log doesn\'t say so. The recovery job will call pay again with the same key, and the bank returns its earlier answer instead of paying twice.')
          return 'crashed'
        }
        push('o7', 'svc', 'mark', 'Writes "payout" to the saga log', mode === 'pivot' ? 'This is the point of no return. From here on, the saga only moves forward: any later failure is retried, never undone.' : 'This survives a restart.', markDone(p, 'payout'))
      }
    }
    if (hit('o9')) {
      die('o9', durable(mode) ? 'The shop is paid. The log says so, and the recovery job will tell the shop to ship.' : 'The shop is paid, and she owes the loan, but nobody tells the shop to ship.')
      return 'crashed'
    }
    push('o9', 'svc', 'confirm', `Tells ${p.shop} to ship the ${p.item}`, 'Step 4: a message that can be repeated safely, so if it fails it is retried, not undone.')
    const again = s.shipped.includes(p.id)
    service('s11', again ? 'repeat' : 'notify', again ? 'The shop already had this order: ignores the repeat' : `${p.shop} ships the ${p.item}`, again ? 'Keyed by the purchase, so the shop ships once.' : 'The purchase is complete.', { id: `'${p.id}'` }, (st) => {
      if (!again) st.shipped.push(p.id)
    })
    if (durable(mode)) {
      if (hit('o9s')) {
        die('o9s', 'Everything is done, but the log doesn\'t say so. The recovery job will tell the shop again, and the shop ignores the repeat.')
        return 'crashed'
      }
      push('o9s', 'svc', 'finish', 'Marks the saga finished', 'The recovery job will leave it alone.', (st) => {
        st.sagas.find((x) => x.id === p.id)!.state = 'done'
      })
    }
    if (hit('o10')) {
      die('o10', 'Everything is done. Only the answer to Alice is lost.')
      return 'crashed'
    }
    push('o10', 'svc', 'approved', "Returns 'approved'", 'All four steps finished.')
    return 'approved'
  }

  const show = (p: Purchase, text: string, tone: Screen['tone'], title: string, why: string) => {
    locals = { answer: text.startsWith("'") ? text : `'${text}'` }
    push('a3', 'cons', 'show', title, why, (st) => {
      const prev = st.screen.find((x) => x.id === p.id)
      if (prev) Object.assign(prev, { text, tone })
      else st.screen.push({ id: p.id, item: p.item, text, tone })
    })
  }

  // ---- recovery, a minute after a crash (only with a saga log)
  const recover = (p: Purchase) => {
    push(null, 'system', 'time', 'A minute passes', 'The checkout service restarts. The recovery job runs every minute.', (st) => {
      st.clock += 1
    })
    const row = saga(p)
    locals = {}
    if (!row || row.state === 'done' || row.state === 'undone') {
      push('r2', 'migrator', 'scan', 'Finds no unfinished sagas', 'Nothing was left in the middle.')
      return
    }
    setLocal('s', `{ id: '${row.id}', state: '${row.state}', done: [${row.done.join(', ')}] }`)
    push('r2', 'migrator', 'found', `Finds ${p.id}, ${row.state}, with ${row.done.length ? `${row.done.join(', ')} done` : 'nothing done'}`, 'The log says exactly where the checkout got to.')
    let outcome: Outcome
    if (row.state === 'undoing') {
      push('r3', 'migrator', 'undo', 'It was undoing: carries on undoing', 'Each undo is safe to repeat, so running the whole undo again is correct.')
      outcome = undo(p)
    } else {
      push('r4', 'migrator', 'resume', `Resumes after "${row.done[row.done.length - 1] ?? 'start'}"`, 'It runs the remaining steps, in the same code. Any step that already happened is repeated with the same key, and changes nothing.')
      outcome = checkout(p, row.done[row.done.length - 1] ?? 'start')
    }
    show(p, outcome === 'approved' ? 'approved' : 'declined', outcome === 'approved' ? 'ok' : 'bad', `Alice gets a notification: ${outcome === 'approved' ? 'approved' : 'declined'}`, 'Later than she expected, but correct.')
  }

  // ---- the afternoon
  for (const p of PURCHASES) {
    push(null, 'system', 'time', `${clockText(p.at)}: Alice buys the ${p.item} for ${fmt(p.amount)}`, p.shop === 'sofa-shop' ? `What nobody knows yet: ${p.shop} closed its bank account last week.` : p.shop === 'lamp-shop' ? "What nobody knows yet: the bank's replies are being lost for the next while, though its transfers still go through." : 'An ordinary purchase. Watch the four steps.', (st) => {
      st.clock = Math.max(st.clock, p.at)
    })
    for (let attempt = 1; ; attempt++) {
      locals = { item: `'${p.item}'`, price: fmt(p.amount), shop: `'${p.shop}'` }
      push('a2', 'cons', 'buy', `Alice taps "Pay later"${attempt > 1 ? ' again' : ''}`, 'Her app waits while the checkout service runs the steps.')
      const outcome = checkout(p, null)
      if (outcome === 'crashed') {
        const nothing = !s.holds.some((h) => h.id === p.id) && !saga(p)
        if (nothing) {
          show(p, 'error: try again', 'wait', 'Alice sees an error', 'Nothing had happened yet, so she taps Pay again.')
          continue
        }
        if (durable(mode)) {
          const doneAll = saga(p)?.state === 'done'
          show(p, doneAll ? 'no answer' : 'processing', 'wait', doneAll ? 'Alice gets no answer' : 'Alice sees "processing"', doneAll ? 'The purchase is complete, and her app will catch up.' : 'Her app can show this because the saga row exists.')
          recover(p)
        } else show(p, 'error', 'bad', 'Alice sees an error', s.holds.some((h) => h.id === p.id && h.status === 'held') ? 'She assumes nothing happened. In fact, part of the purchase is committed in other services, and nothing remembers it.' : 'Whatever was done stays done.')
      } else if (outcome === 'refused') show(p, 'declined: limit too low', 'bad', 'Alice sees "declined: limit too low"', `Her limit is ${fmt(LIMIT)}, but holds that nobody released are still taking part of it.`)
      else if (outcome === 'error') show(p, 'error', 'bad', 'Alice sees an error', 'She assumes the purchase failed and nothing happened. But the hold and the loan are still there.')
      else show(p, outcome, outcome === 'approved' ? 'ok' : 'bad', `Alice sees "${outcome}"`, outcome === 'approved' ? 'The shop will ship.' : 'And nothing of the purchase is left behind.')
      break
    }
  }

  s.settled = true
  locals = {}
  push(null, 'system', 'end', 'Run finished', verdictText(mode, s))
  return steps
}

export type Experiment = { label: string; title: string; mode: Mode; crash: string | null }

export const EXPERIMENTS: Experiment[] = [
  { label: 'Nothing undoes anything', title: 'The sofa payout is rejected. The hold and the loan stay, and later the lamp is refused for lack of limit.', mode: 'chain', crash: null },
  { label: "A timeout isn't a no", title: 'Undo works for the sofa. The lamp payout times out, the loan is cancelled, and the bank had already paid.', mode: 'memory', crash: null },
  { label: 'Crash, and the memory is gone', title: 'The checkout dies before paying for the headphones. Nothing remembers the hold or the loan.', mode: 'memory', crash: 'o5' },
  { label: 'The saga log survives', title: 'The same crash with a saga log. The recovery job resumes the headphones a minute later.', mode: 'log', crash: 'o5' },
  { label: 'Ask before you undo', title: 'The lamp times out, the checkout asks the bank, and the saga carries on forward.', mode: 'pivot', crash: null },
  { label: 'Die after the money left', title: 'The bank paid, but the log never recorded it. The resumed saga pays again with the same key, and the bank pays once.', mode: 'pivot', crash: 'o7' },
  { label: 'Die in the middle of an undo', title: 'The sofa\'s loan is cancelled, then the process dies. The recovery job runs the undo again.', mode: 'pivot', crash: 'u4' },
]
