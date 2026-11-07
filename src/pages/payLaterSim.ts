// The checkout debugger on the Pay-Later page: one fixed day of orders, through five designs.
export type Mode = 'chain' | 'tx' | 'atomic' | 'outbox' | 'signed'

// Actor ids reuse the colour classes in sim.css.
export type Actor = 'cons' | 'svc' | 'relay' | 'migrator'
export type Pane = 'merchant' | 'lender' | 'jobs' | 'attacker'
export type CodeLine = { id: string; code: string; breakable: boolean }

const line = (id: string, code: string, breakable = false): CodeLine => ({ id, code, breakable })
const hasTx = (m: Mode) => m !== 'chain'
const isAtomic = (m: Mode) => m === 'atomic' || m === 'outbox' || m === 'signed'
const hasOutbox = (m: Mode) => m === 'outbox' || m === 'signed'
const isSigned = (m: Mode) => m === 'signed'

const FEE_RATE = 0.05
export const fmt = (n: number) => `$${n.toLocaleString('en-US')}`

function lenderCode(m: Mode): CodeLine[] {
  return [
    line('c1', 'fun checkout(order, customer, amount) {'),
    ...(isAtomic(m) ? [line('c2', '  sessions.find(merchant, order)?.let { return it }   // a retry', true)] : []),
    ...(hasTx(m) ? [line('t0', '  transaction {')] : []),
    ...(isAtomic(m)
      ? [
          line('c5', '    val reserved = limits.reserve(customer, amount)   // UPDATE ... WHERE available >= amount', true),
          line('c4', '    if (!reserved) return sessions.save(order, DECLINED)'),
        ]
      : [
          line('c3', `${hasTx(m) ? '    ' : '  '}val available = limits.read(customer)`, true),
          line('c4', `${hasTx(m) ? '    ' : '  '}if (available < amount) return DECLINED`),
          line('c5', `${hasTx(m) ? '    ' : '  '}limits.set(customer, available - amount)`, true),
        ]),
    line('c6', `${hasTx(m) ? '    ' : '  '}val loan = loans.insert(order, customer, amount)`, true),
    line('c7', `${hasTx(m) ? '    ' : '  '}ledger.post(loan)`, true),
    ...(isAtomic(m) ? [line('c6b', '    sessions.save(order, APPROVED)')] : []),
    ...(hasOutbox(m) ? [line('c7b', '    outbox.add(OrderApproved(order))', true)] : []),
    ...(hasTx(m) ? [line('t9', '  }   // commit', true)] : []),
    ...(!hasOutbox(m) ? [line('c8', '  merchant.onCallback(OrderApproved(order))', true)] : []),
    line('c9', '  return APPROVED', true),
    line('c10', '}'),
  ]
}

function merchantCode(m: Mode): CodeLine[] {
  return [
    line('m1', 'fun startCheckout(order) {'),
    line('m2', '  val result = lender.checkout(order)   // on a timeout, retry with the same order'),
    line('m3', '}'),
    line('m4', 'fun onCallback(event) {'),
    ...(isSigned(m) ? [line('m5', '  if (!validSignature(event)) return 401')] : []),
    ...(hasOutbox(m) ? [line('m6', '  if (seen(event.id)) return   // delivered twice')] : []),
    line('m7', '  ship(event.order)'),
    line('m8', '}'),
  ]
}

function jobsCode(m: Mode): CodeLine[] {
  return [
    ...(hasOutbox(m)
      ? [
          line('r1', 'fun relay() {'),
          line('r2', '  val event = outbox.nextUnsent()'),
          line('r3', `  merchant.onCallback(${isSigned(m) ? 'signed(event)' : 'event'})`, true),
          line('r4', '  outbox.markSent(event)', true),
          line('r5', '}'),
        ]
      : []),
    line('s1', 'fun settle(merchant) {'),
    line('s2', '  val due = ledger.unpaid(merchant)'),
    line('s3', `  bank.pay(merchant, due${isSigned(m) ? ', key = batch.id' : ''})`, true),
    line('s4', '  ledger.markPaid(due)', true),
    ...(isSigned(m) ? [line('s5', '  reconcile(ledger, bank.statement())')] : []),
    line('s6', '}'),
  ]
}

const attackerCode: CodeLine[] = [line('x1', "http.post(merchant.callbackUrl, { order: 'ord-99', status: 'APPROVED' })")]

export const CODE: Record<Mode, Record<Pane, CodeLine[]>> = Object.fromEntries(
  (['chain', 'tx', 'atomic', 'outbox', 'signed'] as Mode[]).map((m) => [m, { merchant: merchantCode(m), lender: lenderCode(m), jobs: jobsCode(m), attacker: attackerCode }]),
) as Record<Mode, Record<Pane, CodeLine[]>>

const PREFIX: Record<Pane, string> = { merchant: 'M', lender: 'L', jobs: 'J', attacker: 'X' }

export function lineRef(id: string, mode: Mode): string {
  for (const pane of ['merchant', 'lender', 'jobs', 'attacker'] as Pane[]) {
    const i = CODE[mode][pane].findIndex((l) => l.id === id)
    if (i >= 0) return `${PREFIX[pane]}${i + 1}`
  }
  return ''
}

export type Account = { customer: string; limit: number; available: number }
export type Loan = { id: string; order: string; customer: string; amount: number; pending: boolean }
export type Entry = { loan: string; debit: string; credit: string; pending: boolean }
export type OutboxRow = { id: string; order: string; sent: boolean; pending: boolean }
export type Session = { order: string; result: string; pending: boolean }
export type Payout = { key: string; amount: number; ignored: boolean }
type LogEntry = { actor: Actor | 'crash' | 'system'; text: string }

export type SimState = {
  accounts: Account[]
  loans: Loan[]
  ledger: Entry[]
  outbox: OutboxRow[]
  sessions: Session[]
  shipped: string[]
  forgedShipped: boolean
  payouts: Payout[]
  paid: boolean
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

const committed = (s: SimState) => s.loans.filter((l) => !l.pending)

export function checks(s: SimState): CheckResult[] {
  const loans = committed(s)
  const orders = loans.map((l) => l.order)
  const duplicates = orders.filter((o, i) => orders.indexOf(o) !== i)
  const over = s.accounts.filter((a) => loans.filter((l) => l.customer === a.customer).reduce((sum, l) => sum + l.amount, 0) > a.limit)
  const unposted = loans.filter((l) => !s.ledger.some((e) => e.loan === l.id && !e.pending))
  const unknown = [...new Set(orders)].filter((o) => !s.shipped.includes(o))
  const effective = s.payouts.filter((p) => !p.ignored)
  const wait = (bad: boolean): 'ok' | 'bad' | 'wait' => (bad ? 'bad' : s.settled ? 'ok' : 'wait')
  return [
    ['One contract per checkout', duplicates.length ? `More than one contract for ${[...new Set(duplicates)].join(', ')}` : 'A retry never creates a second loan', wait(duplicates.length > 0)],
    ['Limit is never exceeded', over.length ? `More was lent to ${over.map((a) => a.customer).join(', ')} than the limit allows` : 'Total loans stay within each customer\'s limit', wait(over.length > 0)],
    ['Every loan is in the ledger', unposted.length ? `No ledger entries for ${unposted.map((l) => l.id).join(', ')}` : 'A crash can\'t leave a loan without its entries', wait(unposted.length > 0)],
    ['The merchant hears about every approval', s.settled && unknown.length ? `The customer owes money, but ${unknown.join(', ')} never shipped` : 'A crash can\'t lose the news of an approval', wait(s.settled && unknown.length > 0)],
    ['The merchant is paid exactly once', effective.length > 1 ? `Paid ${effective.length} times, for ${fmt(effective.reduce((sum, p) => sum + p.amount, 0))} in total` : 'Rerunning a payout can\'t pay again', wait(effective.length > 1)],
    ['A forged callback ships nothing', s.forgedShipped ? 'The merchant shipped ord-99, which has no loan' : 'The merchant checks where a callback came from', wait(s.forgedShipped)],
  ]
}

export function verdictText(mode: Mode, s: SimState): string {
  const crash = s.crashes ? ' The crash you added changed nothing that the design promises.' : ''
  switch (mode) {
    case 'chain':
      return 'Everything that can go wrong did. The chain looks fine in a demo, but a retry, a race or one crash each leave money in the wrong place.'
    case 'tx':
      return 'One transaction fixed the ledger: a crash now rolls back everything. It does nothing about retries or races, because the read and the write are still separate, and a transaction doesn\'t lock a row just by reading it.'
    case 'atomic':
      return 'No duplicates, and no overspending. But the merchant only hears about an approval from a call after the commit, so a crash at that moment leaves a customer in debt with nothing shipped.'
    case 'outbox':
      return 'Every approval now reaches the merchant, because the event commits with the loan. What remains is at the edges: a forged callback ships goods, and rerunning a payout pays twice.'
    default:
      return `All six checks hold. Each one has a price: more moving parts, duplicate deliveries to handle, and signing keys to manage. It also relies on the merchant verifying signatures, and on the bank honoring the payout key.${crash}`
  }
}

export const verdictIsBad = (_mode: Mode, s: SimState) => checks(s).some((c) => c[2] === 'bad')

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

const INTRO: Record<Mode, string> = {
  chain: 'Each step is a separate database call, followed by a call to the merchant.',
  tx: 'The database writes now share one transaction. The limit is still read first, and written later.',
  atomic: 'A retry finds the earlier result, and the limit check and update become one statement.',
  outbox: 'Telling the merchant becomes an event that commits with the loan, and a relay delivers it.',
  signed: 'Callbacks are signed, payouts carry a stable key, and the books are checked against the bank.',
}

export function build(mode: Mode, crashId: string | null): Step[] {
  const s: SimState = {
    accounts: [
      { customer: 'Alice', limit: 2000, available: 2000 },
      { customer: 'Bob', limit: 1000, available: 1000 },
      { customer: 'Carol', limit: 1000, available: 1000 },
      { customer: 'Dan', limit: 1000, available: 1000 },
    ],
    loans: [],
    ledger: [],
    outbox: [],
    sessions: [],
    shipped: [],
    forgedShipped: false,
    payouts: [],
    paid: false,
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
      text: `${INTRO[mode]} The same day runs through every mode: a lost response and a retry, two purchases racing for one limit, a crash mid-way through a purchase, a crash just after one, a forged callback and a payout that gets rerun. Press Step, or click a gutter dot to add a crash of your own.`,
      crash: false,
      locals: {},
    },
  ]

  let locals: Record<string, string> = {}
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }
  const NAME: Record<Actor, string> = { cons: 'Merchant', svc: 'Lender', relay: 'Background job', migrator: 'Attacker' }
  const push = (id: string | null, actor: Actor | 'system', label: string, title: string, text: string | null, fn?: (st: SimState) => void, isCrash = false) => {
    if (fn) fn(s)
    const who = actor === 'system' ? 'system' : NAME[actor]
    s.log.push({ actor: isCrash ? 'crash' : actor, text: `[${who}] ${title}` })
    steps.push({ s: clone(s), line: id, actor, label, title, text, crash: isCrash, locals: actor === 'system' ? {} : { ...locals } })
  }

  let userCrashUsed = false
  const userCrash = (id: string) => {
    if (!userCrashUsed && crashId === id) {
      userCrashUsed = true
      return true
    }
    return false
  }

  let nextLoan = 1
  let nextEvent = 1
  const account = (customer: string) => s.accounts.find((a) => a.customer === customer)!

  // ---- what the merchant does with a callback
  const onCallback = (order: string, eventId: string | null, forged: boolean) => {
    const callerLocals = locals
    locals = { 'event.order': `'${order}'`, ...(eventId ? { 'event.id': `'${eventId}'` } : {}) }
    if (isSigned(mode)) {
      if (forged) {
        push('m5', 'cons', '401', 'The signature is invalid: returns 401', 'The attacker knows the URL and the format, but it can\'t sign this with the lender\'s key. Nothing ships.')
        locals = callerLocals
        return
      }
      push('m5', 'cons', 'signed', 'The signature is valid', 'This really came from the lender, and it hasn\'t been changed.')
    }
    if (hasOutbox(mode)) {
      const seen = s.shipped.includes(order)
      if (seen) {
        push('m6', 'cons', 'seen', 'Already handled this event: ignores it', 'A relay delivers at least once, so this is expected. Because the merchant checks, nothing ships twice.')
        locals = callerLocals
        return
      }
      push('m6', 'cons', 'new', 'A new event: condition is false', 'The merchant keeps a record of events it has handled.')
    }
    push(
      'm7',
      'cons',
      'ship',
      forged ? `Ships ${order}, which has no loan` : `Ships ${order}`,
      forged ? 'Nothing here checks who sent this. The goods are gone, and nobody owes for them.' : s.shipped.includes(order) ? 'The same order ships a second time, on top of the second contract.' : 'The customer gets the goods, and the sale is done.',
      (st) => {
        st.shipped.push(order)
        if (forged) st.forgedShipped = true
      },
    )
    locals = callerLocals
  }

  // ---- the checkout itself
  type Result = 'APPROVED' | 'DECLINED' | 'crash'
  type Options = { dieBefore?: string; dieText?: string; stale?: number; alreadyBegun?: boolean }
  let txSnapshot: Pick<SimState, 'accounts' | 'loans' | 'ledger' | 'outbox' | 'sessions'> | null = null
  const beginTx = () => {
    txSnapshot = clone({ accounts: s.accounts, loans: s.loans, ledger: s.ledger, outbox: s.outbox, sessions: s.sessions })
  }

  const checkout = (order: string, customer: string, amount: number, opts: Options = {}): Result => {
    const die = (id: string, text: string): Result => {
      const snapshot = txSnapshot
      push(id, 'svc', 'CRASH', 'Lender process killed', snapshot ? `${text} The transaction hadn't committed, so the database rolls it all back.` : text, (st) => {
        st.crashes++
        if (snapshot) Object.assign(st, clone(snapshot))
      }, true)
      txSnapshot = null
      return 'crash'
    }
    const stop = (id: string) => {
      if (opts.dieBefore === id) {
        opts = { ...opts, dieBefore: undefined }
        return true
      }
      return userCrash(id)
    }
    const dieText = (fallback: string) => opts.dieText ?? fallback

    locals = { order: `'${order}'`, customer: `'${customer}'`, amount: fmt(amount) }
    if (isAtomic(mode)) {
      if (stop('c2')) return die('c2', 'Nothing has happened yet.')
      const found = s.sessions.find((x) => x.order === order && !x.pending)
      push('c2', 'svc', found ? 'found' : 'new', found ? `This order was already processed: returns ${found.result}` : 'A new order: carries on', found ? 'The same answer as before, and no second contract. A unique constraint on the merchant and order backs this up, if two retries arrive together.' : 'No earlier result for this merchant and order.')
      if (found) return found.result as Result
    }
    if (hasTx(mode)) {
      beginTx()
      if (!opts.alreadyBegun) push('t0', 'svc', 'begin', 'Starts a transaction', 'Everything until the commit either all happens or none of it does. Other requests can\'t see these rows yet.')
    }

    if (isAtomic(mode)) {
      if (stop('c5')) return die('c5', 'Nothing has changed yet.')
      const fits = account(customer).available >= amount
      setLocal('reserved', String(fits))
      push('c5', 'svc', fits ? 'reserved' : '0 rows', fits ? `Reserves ${fmt(amount)} of ${customer}'s limit` : 'No rows changed: the limit is too low', fits ? 'One statement checks and updates together. Any concurrent update waits here, and PostgreSQL re-checks the WHERE clause afterwards.' : `${customer}'s other purchase committed first. This update waited, re-checked the WHERE clause against the new value, and matched nothing.`, (st) => {
        if (fits) st.accounts.find((a) => a.customer === customer)!.available -= amount
      })
      push('c4', 'svc', fits ? 'check' : 'declined', fits ? 'Reserved: condition is false' : 'Not reserved: declines the order', fits ? 'The purchase continues.' : 'A correct decline: there was only room for one.', (st) => {
        if (!fits) st.sessions.push({ order, result: 'DECLINED', pending: false })
      })
      if (!fits) {
        txSnapshot = null
        return 'DECLINED'
      }
    } else {
      let available = opts.stale
      if (available === undefined) {
        if (stop('c3')) return die('c3', 'Nothing has changed yet.')
        available = account(customer).available
        setLocal('available', fmt(available))
        push('c3', 'svc', 'read', `Reads ${customer}'s limit: ${fmt(available)} available`, 'Just a read. It doesn\'t lock anything, even inside a transaction.')
      } else {
        setLocal('available', fmt(available))
      }
      push('c4', 'svc', available < amount ? 'declined' : 'check', available < amount ? 'Not enough: declines' : 'Enough: condition is false', available < amount ? 'The check works, when it has current data.' : opts.stale !== undefined ? 'This is checking a value it read earlier, and that value is now out of date.' : 'The purchase continues.')
      if (available < amount) {
        txSnapshot = null
        return 'DECLINED'
      }
      if (stop('c5')) return die('c5', 'The limit hasn\'t been updated.')
      const next = available - amount
      push('c5', 'svc', 'write', `Sets ${customer}'s available limit to ${fmt(next)}`, opts.stale !== undefined ? 'This overwrites the other purchase\'s update, based on what it read earlier. The other update is simply lost.' : 'It writes a number worked out from the earlier read.', (st) => {
        st.accounts.find((a) => a.customer === customer)!.available = next
      })
    }

    if (stop('c6')) return die('c6', 'The limit changed, but no loan exists yet.')
    const id = `loan-${nextLoan++}`
    const pending = hasTx(mode)
    setLocal('loan', `'${id}'`)
    push('c6', 'svc', 'loan', `Creates ${id} for ${order}`, pending ? 'Pending until the commit.' : `A contract now exists, and ${customer} owes money, as soon as this runs.`, (st) => {
      st.loans.push({ id, order, customer, amount, pending })
    })

    if (stop('c7')) return die('c7', dieText('The loan was written, but the ledger entries weren\'t.'))
    const fee = amount * FEE_RATE
    push('c7', 'svc', 'ledger', `Posts ${id} to the ledger`, `A debit of ${fmt(amount)} to loans receivable, with credits of ${fmt(amount - fee)} to merchant payable and ${fmt(fee)} to fee income.`, (st) => {
      st.ledger.push({ loan: id, debit: `Receivable ${fmt(amount)}`, credit: `Payable ${fmt(amount - fee)}, fee ${fmt(fee)}`, pending })
    })
    if (isAtomic(mode)) {
      push('c6b', 'svc', 'session', 'Saves the result for this order', 'A retry can now find this, once it has committed.', (st) => {
        st.sessions.push({ order, result: 'APPROVED', pending: true })
      })
    }
    if (hasOutbox(mode)) {
      if (stop('c7b')) return die('c7b', 'Nothing has committed yet.')
      const eventId = `evt-${nextEvent++}`
      push('c7b', 'svc', 'outbox', `Adds an event for ${order} to the outbox`, 'The news of this approval is now in the same transaction as the loan. They commit together or not at all.', (st) => {
        st.outbox.push({ id: eventId, order, sent: false, pending: true })
      })
    }
    if (hasTx(mode)) {
      if (stop('t9')) return die('t9', 'The commit never happened.')
      push('t9', 'svc', 'commit', 'Commits', 'All of it is now visible and durable.', (st) => {
        st.loans.forEach((l) => (l.pending = false))
        st.ledger.forEach((e) => (e.pending = false))
        st.sessions.forEach((x) => (x.pending = false))
        st.outbox.forEach((e) => (e.pending = false))
      })
      txSnapshot = null
    }
    if (!hasOutbox(mode)) {
      if (stop('c8')) return die('c8', dieText('The loan is in place, but the merchant wasn\'t told.'))
      push('c8', 'svc', 'notify', 'Tells the merchant the order is approved', 'A network call, outside the database. Nothing retries this if the process dies just before it.')
      onCallback(order, null, false)
    }
    if (stop('c9')) return die('c9', dieText('Everything has committed, but no reply went out.'))
    push('c9', 'svc', 'approved', `Returns APPROVED for ${order}`, 'The lender is done with this order, as long as the reply gets through.')
    return 'APPROVED'
  }

  const merchantCall = (order: string, customer: string, amount: number, why: string, opts: Options = {}, retries = true): Result => {
    locals = { order: `'${order}'` }
    push('m2', 'cons', 'call', `Calls the lender for ${order}`, why)
    let result = checkout(order, customer, amount, opts)
    while (result === 'crash' && retries) {
      locals = { order: `'${order}'` }
      push(null, 'system', 'retry', `The merchant gets no answer, and retries ${order}`, 'The merchant can\'t tell how far the lender got. It sends the same order again, which is the correct thing for a client to do.')
      push('m2', 'cons', 'retry', `Calls the lender again for ${order}`, 'The same order, sent a second time.')
      result = checkout(order, customer, amount)
    }
    locals = {}
    return result
  }

  // ---- 1. A lost response
  merchantCall('ord-1', 'Alice', 1000, 'Alice buys something for $1,000.')
  push(null, 'system', 'lost', 'The response is lost on the way back', 'The lender finished, but the merchant only sees a timeout. This happens on any real network.')
  merchantCall('ord-1', 'Alice', 1000, 'The merchant retries, because it has no idea that the first call worked.')

  // ---- 2. Two purchases race
  push(null, 'system', 'race', 'Bob has $1,000 available, and two $800 purchases arrive at once', 'Only one of them fits. Perhaps two tabs, or a person trying to beat the limit.')
  if (isAtomic(mode)) {
    merchantCall('ord-2', 'Bob', 800, 'The first of the two.')
    merchantCall('ord-3', 'Bob', 800, 'The second, which waited for the first to commit.')
  } else {
    const before = account('Bob').available
    const read = (order: string, title: string, text: string) => {
      locals = { order: `'${order}'`, customer: "'Bob'", amount: '$800' }
      if (hasTx(mode)) push('t0', 'svc', 'begin', `${order} starts a transaction`, 'Each purchase has its own transaction, running at the same time.')
      setLocal('available', fmt(before))
      push('c3', 'svc', 'read', title, text)
    }
    read('ord-2', `ord-2 reads Bob's limit: ${fmt(before)} available`, 'Just a read, and nothing is locked.')
    read('ord-3', `ord-3 reads Bob's limit: also ${fmt(before)}`, "The other purchase hasn't written yet, so both see the same number.")
    const first = checkout('ord-2', 'Bob', 800, { stale: before, alreadyBegun: true })
    if (first === 'crash') merchantCall('ord-2', 'Bob', 800, 'A retry after the crash.')
    const second = checkout('ord-3', 'Bob', 800, { stale: before, alreadyBegun: true })
    if (second === 'crash') merchantCall('ord-3', 'Bob', 800, 'A retry after the crash.')
  }

  // ---- 3. A crash in the middle
  push(null, 'system', 'next', 'Carol buys something for $500, and the process dies mid-way', 'A deploy, or a machine failure. It just happens to be right after the loan is written.')
  merchantCall('ord-4', 'Carol', 500, 'A normal purchase.', { dieBefore: 'c7', dieText: 'The loan was written, but the ledger entries weren\'t.' })

  // ---- 4. A crash just after the commit, with no retry
  push(null, 'system', 'next', 'Dan confirms on the lender\'s page, for $300', 'Here, the merchant isn\'t waiting on this call. It relies on a callback to hear the result.')
  locals = { order: "'ord-5'" }
  const danDie = hasOutbox(mode) ? 'c9' : 'c8'
  checkout('ord-5', 'Dan', 300, { dieBefore: danDie, dieText: hasOutbox(mode) ? 'Everything has committed, including the event in the outbox.' : 'The loan committed, and Dan owes the money. But the process died before it told the merchant.' })
  locals = {}
  if (!hasOutbox(mode)) {
    push(null, 'system', 'silence', 'Nobody tells the merchant about ord-5', 'There is no record that a call was needed, so nothing will ever retry it.')
  }

  // ---- The relay
  if (hasOutbox(mode)) {
    push(null, 'system', 'relay', 'The relay wakes up', 'It reads the outbox, and delivers whatever hasn\'t been sent. It doesn\'t care that the lender process died.')
    for (;;) {
      const next = s.outbox.find((e) => !e.sent && !e.pending)
      if (!next) break
      locals = { event: `'${next.id}' (${next.order})` }
      push('r2', 'relay', 'next', `Picks up ${next.id} for ${next.order}`, 'The oldest unsent event.')
      if (userCrash('r3')) {
        push('r3', 'relay', 'CRASH', 'Relay process killed', 'The event hasn\'t been delivered yet. It\'s still in the outbox, so a restart picks it up.', (st) => {
          st.crashes++
        }, true)
        continue
      }
      push('r3', 'relay', 'deliver', `Delivers ${next.id}`, isSigned(mode) ? 'Signed with the lender\'s key, with a timestamp and an event ID.' : 'A plain call to the merchant.')
      onCallback(next.order, next.id, false)
      if (userCrash('r4')) {
        push('r4', 'relay', 'CRASH', 'Relay process killed', 'It delivered the event, but never recorded that. A restart will deliver it again, which is why the merchant has to check.', (st) => {
          st.crashes++
        }, true)
        continue
      }
      push('r4', 'relay', 'sent', `Marks ${next.id} as sent`, 'Delivered, so it won\'t be sent again.', (st) => {
        st.outbox.find((e) => e.id === next.id)!.sent = true
      })
    }
    locals = {}
  }

  // ---- 5. A forged callback
  push(null, 'system', 'attack', 'Someone finds the merchant\'s callback URL', 'Callback URLs aren\'t secret. They turn up in logs, documentation and browser tools.')
  locals = { order: "'ord-99'" }
  push('x1', 'migrator', 'forge', 'Posts a fake approval for ord-99', 'There is no loan and no customer. It just looks like the real thing.')
  onCallback('ord-99', isSigned(mode) ? 'evt-forged' : null, true)
  locals = {}

  // ---- 6. Settlement, rerun after a crash
  push(null, 'system', 'settle', 'The nightly settlement run starts', 'The merchant is owed its share of every committed loan, minus the fee.')
  let settlementCrashed = false
  const settle = () => {
    const unpaid = committed(s).reduce((sum, l) => sum + l.amount * (1 - FEE_RATE), 0)
    const due = Math.round(unpaid)
    locals = { merchant: "'store-1'", due: fmt(due) }
    push('s2', 'relay', 'due', `Works out ${fmt(due)} due`, 'From the ledger.')
    if (userCrash('s3')) {
      push('s3', 'relay', 'CRASH', 'Settlement job killed', 'No payment has been sent yet.', (st) => {
        st.crashes++
      }, true)
      return false
    }
    const duplicateKey = isSigned(mode) && s.payouts.length > 0
    push(
      's3',
      'relay',
      duplicateKey ? 'same key' : 'pay',
      duplicateKey ? 'Sends the payout again, with the same key' : `Pays ${fmt(due)} to the merchant`,
      duplicateKey ? 'The bank has already seen this key, so it returns the earlier result and moves no money. This depends on the bank supporting that.' : settlementCrashed ? 'The money goes out a second time. Nothing here can tell that this was already paid.' : 'The money leaves the lender.',
      (st) => {
        st.payouts.push({ key: isSigned(mode) ? 'batch-1' : `payout-${st.payouts.length + 1}`, amount: due, ignored: duplicateKey })
      },
    )
    if (!settlementCrashed) {
      settlementCrashed = true
      push('s4', 'relay', 'CRASH', 'Settlement job killed', 'The bank accepted the payment, but the job died before recording that. So the books still say the merchant is unpaid.', (st) => {
        st.crashes++
      }, true)
      return false
    }
    if (userCrash('s4')) {
      push('s4', 'relay', 'CRASH', 'Settlement job killed', 'Paid, but not recorded. A rerun comes next.', (st) => {
        st.crashes++
      }, true)
      return false
    }
    push('s4', 'relay', 'recorded', 'Records the payout in the ledger', 'The merchant now shows as paid.', (st) => {
      st.paid = true
    })
    return true
  }
  let settledRun = settle()
  while (!settledRun) {
    push(null, 'system', 'rerun', 'Operations rerun the settlement job', 'A failed job gets rerun. It\'s the obvious thing to do, and it has to be safe.')
    settledRun = settle()
  }
  if (isSigned(mode)) {
    locals = {}
    push('s5', 'relay', 'match', 'Compares the ledger with the bank statement', 'They match. If the bank had paid twice, or a payment had gone missing, this is where it would show up, as a difference with an owner.')
  }

  locals = {}
  s.settled = true
  push(null, 'system', 'end', 'Run finished', verdictText(mode, s))
  return steps
}

export type Experiment = { label: string; title: string; mode: Mode; crash: string | null }

export const EXPERIMENTS: Experiment[] = [
  { label: 'The demo that fails', title: 'Separate database calls. A retry, a race and one crash each leave money in the wrong place.', mode: 'chain', crash: null },
  { label: 'A transaction is not a lock', title: 'The ledger is safe now. But two purchases still read the same limit, and one overwrites the other.', mode: 'tx', crash: null },
  { label: 'One statement fixes the race', title: 'The second purchase is correctly declined. But a crash after the commit leaves Dan owing money, and the merchant never finds out.', mode: 'atomic', crash: null },
  { label: 'The event commits with the loan', title: "The crash after Dan's commit no longer matters, because the relay delivers the news afterwards.", mode: 'outbox', crash: null },
  { label: 'Delivered twice', title: 'The relay dies after delivering, and sends the event again. The merchant ignores the duplicate.', mode: 'outbox', crash: 'r4' },
  { label: 'All six checks hold', title: 'Signed callbacks stop the forgery, and a stable key stops the second payout.', mode: 'signed', crash: null },
]
