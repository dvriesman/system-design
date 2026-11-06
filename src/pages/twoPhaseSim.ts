// Part 3 of the Two-Phase Commit page: one transfer across two ledgers, with failures.
export type Mode = 'twowrites' | 'tpc' | 'tpcha' | 'async' | 'safe'

// Actor ids reuse the colour classes in sim.css: svc = transfer service / coordinator, cons = ledger A,
// migrator = ledger B, relay = outbox relay.
export type Actor = 'svc' | 'cons' | 'migrator' | 'relay'
type Side = 'a' | 'b'

export type CodeLine = { id: string; code: string; breakable: boolean }
export type Pane = { actor: Actor; name: string; lines: CodeLine[] }

export const AMOUNT = 100
const START_A = 1000
const START_B = 500
export const TOTAL = START_A + START_B
export const TX_ID = 'tx-71'
export const FROM = 'acct-1'
export const TO = 'acct-2'
const OUTAGE_MS: Record<'tpc' | 'tpcha', number> = { tpc: 300_000, tpcha: 3_000 }
const WAIT_LIMIT_MS = 5_000
export const fmt = (n: number) => `$${n.toLocaleString('en-US')}`
export const fmtWait = (ms: number) => (ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : ms >= 1000 ? `${ms / 1000} s` : '0')

const line = (id: string, code: string, breakable = false): CodeLine => ({ id, code, breakable })

const ledgerCode = (p: Side): CodeLine[] => [
  line(`${p}_p1`, 'fun prepare(txId, change) {'),
  line(`${p}_p2`, '  lock(change.acct)', true),
  line(`${p}_p3`, '  if (!allowed(change)) return NO   // releases lock'),
  line(`${p}_p4`, '  prepared.write(txId, change)   // durable promise', true),
  line(`${p}_p5`, '  return YES', true),
  line(`${p}_p6`, '}'),
  line(`${p}_f1`, 'fun finish(txId, decision) {'),
  line(`${p}_f2`, '  val change = prepared.read(txId) ?: return', true),
  line(`${p}_f3`, '  if (decision == COMMIT) apply(change)   // local tx', true),
  line(`${p}_f4`, '  prepared.delete(txId); unlock(change.acct)'),
  line(`${p}_f5`, '}'),
]

const coordinatorCode = (ha: boolean): CodeLine[] => [
  line('c1', 'fun transfer(txId, from, to, amt) {'),
  line('c2', '  val voteA = ledgerA.prepare(txId, debit(from, amt))', true),
  line('c3', '  val voteB = ledgerB.prepare(txId, credit(to, amt))', true),
  line('c4', '  val decision = allYes(voteA, voteB) ? COMMIT : ABORT', true),
  line('c5', ha ? '  log.write(txId, decision)   // on a majority of replicas' : '  log.write(txId, decision)   // the commit point', true),
  line('c6', '  ledgerA.finish(txId, decision)', true),
  line('c7', '  ledgerB.finish(txId, decision)', true),
  line('c8', '  return decision', true),
  line('c9', '}'),
  line('r1', ha ? 'fun onLeaderLost(txId) {   // on a standby' : 'fun onRestart(txId) {'),
  line('r2', '  val decision = log.read(txId) ?: ABORT'),
  line('r3', '  ledgerA.finish(txId, decision)'),
  line('r4', '  ledgerB.finish(txId, decision)'),
  line('r5', '}'),
]

const serviceCode = (safe: boolean): CodeLine[] => [
  line('e1', 'fun transfer(txId, from, to, amt) {'),
  line('e2', '  begin()', true),
  line('e3', '  accounts.debit(from, amt)', true),
  line('e4', '  outbox.insert(txId, to, amt)   // unique on txId', true),
  line('e5', '  commit()', true),
  line('e6', '  return ACCEPTED', true),
  line('e7', '}'),
  ...(safe
    ? [
        line('rf1', 'fun onRefund(msg) {'),
        line('rf2', '  if (processed.insert(msg.txId)) refund(msg)', true),
        line('rf3', '  queue.ack(msg)', true),
        line('rf4', '}'),
      ]
    : []),
]

const relayCode: CodeLine[] = [
  line('l1', 'for (row in outbox.unsent()) {'),
  line('l2', '  queue.publish(row)', true),
  line('l3', '  outbox.markSent(row)', true),
  line('l4', '}'),
]

const consumerAsync: CodeLine[] = [
  line('k1', 'fun onMessage(msg) {'),
  line('k2', '  accounts.credit(msg.to, msg.amt)', true),
  line('k3', '  queue.ack(msg)', true),
  line('k4', '}'),
]

const consumerSafe: CodeLine[] = [
  line('x1', 'fun onMessage(msg) {'),
  line('x2', '  begin()', true),
  line('x3', '  val firstTime = processed.insert(msg.txId)', true),
  line('x4', '  val isOpen = accounts.isOpen(msg.to)'),
  line('x5', '  if (firstTime && isOpen) accounts.credit(msg.to, msg.amt)', true),
  line('x6', '  if (firstTime && !isOpen) outbox.insert(refund(msg))', true),
  line('x7', '  commit()', true),
  line('x8', '  queue.ack(msg)', true),
  line('x9', '}'),
]

export const PANES: Record<Mode, Pane[]> = {
  twowrites: [
    {
      actor: 'svc',
      name: 'Transfer service',
      lines: [
        line('w1', 'fun transfer(from, to, amt) {'),
        line('w2', '  ledgerA.debit(from, amt)   // commits on its own', true),
        line('w3', '  ledgerB.credit(to, amt)   // commits on its own', true),
        line('w4', '  return OK', true),
        line('w5', '}'),
      ],
    },
  ],
  tpc: [
    { actor: 'svc', name: 'Coordinator', lines: coordinatorCode(false) },
    { actor: 'cons', name: 'Ledger A', lines: ledgerCode('a') },
    { actor: 'migrator', name: 'Ledger B', lines: ledgerCode('b') },
  ],
  tpcha: [
    { actor: 'svc', name: 'Coordinator', lines: coordinatorCode(true) },
    { actor: 'cons', name: 'Ledger A', lines: ledgerCode('a') },
    { actor: 'migrator', name: 'Ledger B', lines: ledgerCode('b') },
  ],
  async: [
    { actor: 'cons', name: 'Ledger A', lines: serviceCode(false) },
    { actor: 'relay', name: 'Relay', lines: relayCode },
    { actor: 'migrator', name: 'Ledger B', lines: consumerAsync },
  ],
  safe: [
    { actor: 'cons', name: 'Ledger A', lines: serviceCode(true) },
    { actor: 'relay', name: 'Relay', lines: relayCode },
    { actor: 'migrator', name: 'Ledger B', lines: consumerSafe },
  ],
}

export function lineNo(lines: CodeLine[], id: string): number {
  return lines.findIndex((l) => l.id === id) + 1
}

type LogEntry = { actor: Actor | 'crash' | 'system'; text: string }
export type OutboxRow = { txId: string; kind: 'credit' | 'refund'; sent: boolean }
export type QueueMsg = { seq: number; txId: string; kind: 'credit' | 'refund'; status: 'queued' | 'acked' | 'dead'; deliveries: number }

export type LedgerState = {
  bal: number
  locked: boolean
  prepared: { txId: string; change: string }[]
  uncommitted: string[] // statements in an open local transaction, not yet visible
  outbox: OutboxRow[]
  processed: string[]
}

export type SimState = {
  a: LedgerState
  b: LedgerState
  decisionLog: { txId: string; decision: 'COMMIT' | 'ABORT' }[]
  queue: QueueMsg[]
  answered: string | null
  roundTrips: number
  durableWrites: number
  maxWaitMs: number
  sawPartial: boolean
  settled: boolean
  stuck: boolean
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

export type ReaderView = { kind: 'wait'; on: string } | { kind: 'ok' | 'partial'; total: number }

// A reader that needs a correct total must read both rows with locks, so it waits behind a prepared row.
export function readerView(s: SimState): ReaderView {
  if (s.a.locked) return { kind: 'wait', on: 'Ledger A' }
  if (s.b.locked) return { kind: 'wait', on: 'Ledger B' }
  const total = s.a.bal + s.b.bal
  return { kind: total === TOTAL ? 'ok' : 'partial', total }
}

const balancesValid = (s: SimState) => (s.a.bal === START_A && s.b.bal === START_B) || (s.a.bal === START_A - AMOUNT && s.b.bal === START_B + AMOUNT)

export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']

export function checks(s: SimState): CheckResult[] {
  const movedTooMuch = s.a.bal < START_A - AMOUNT || s.b.bal > START_B + AMOUNT
  return [
    [
      'Balances add up',
      `At the end, either the whole transfer happened or none of it. Now: A ${fmt(s.a.bal)}, B ${fmt(s.b.bal)}`,
      movedTooMuch ? 'bad' : !s.settled ? 'wait' : balancesValid(s) ? 'ok' : 'bad',
    ],
    ['Transfer reaches a final state', 'It ends as done or cleanly undone, not stranded somewhere', s.stuck ? 'bad' : !s.settled ? 'wait' : 'ok'],
    [
      'No long waits',
      `Other work on these accounts isn't blocked for more than ${fmtWait(WAIT_LIMIT_MS)}. Longest wait: ${fmtWait(s.maxWaitMs)}`,
      s.maxWaitMs > WAIT_LIMIT_MS ? 'bad' : 'ok',
    ],
    [
      'No half-done reads',
      'A reader adding both balances never gets a total that is off',
      s.sawPartial ? 'bad' : 'ok',
    ],
  ]
}

// Half-done reads are the agreed price of eventual consistency, not a defect in it. A run that only pays
// that price still ended correctly, so its verdict is good.
export function verdictIsBad(mode: Mode, s: SimState): boolean {
  const [money, finish, waits, reads] = checks(s)
  return money[2] === 'bad' || finish[2] === 'bad' || waits[2] === 'bad' || (mode === 'twowrites' && reads[2] === 'bad')
}

export function verdictText(mode: Mode, s: SimState): string {
  const moved = s.a.bal === START_A - AMOUNT && s.b.bal === START_B + AMOUNT
  const notMoved = s.a.bal === START_A && s.b.bal === START_B
  if (s.stuck) {
    return `Stuck: ${fmt(AMOUNT)} left Ledger A and has nowhere to go. Retrying can't help, because the payee account will never accept it, and nothing is set up to send the money back.`
  }
  if (!balancesValid(s)) {
    const delta = s.a.bal + s.b.bal - TOTAL
    if (delta > 0) return `Wrong: ${fmt(delta)} was created from nothing, because the same credit was applied twice. A ${fmt(s.a.bal)}, B ${fmt(s.b.bal)}.`
    if (delta < 0) return `Wrong: ${fmt(-delta)} has disappeared. Ledger A was debited and Ledger B never received it. A ${fmt(s.a.bal)}, B ${fmt(s.b.bal)}.`
    return `Wrong: the total still looks right, but the transfer ran twice. The client asked to send ${fmt(AMOUNT)}, and ${fmt(START_A - s.a.bal)} moved.`
  }
  if (s.maxWaitMs > WAIT_LIMIT_MS) {
    const outcome = notMoved
      ? 'The transfer aborted and no money moved, which is correct, because no decision was ever logged.'
      : 'The transfer committed, and the money is correct.'
    return `${outcome} But it came at a price: a row stayed locked for ${fmtWait(s.maxWaitMs)} while the coordinator was down. A ledger that has voted YES can't decide alone, so everything touching that account just waits.`
  }
  if (mode === 'twowrites') {
    return "It worked this time, because nothing failed. But there was a moment when the money existed nowhere, and any crash or refusal at that moment makes it permanent. Luck isn't a design."
  }
  if (mode === 'tpc' || mode === 'tpcha') {
    const crashNote = s.crashes ? ` The crash was recovered from the ${mode === 'tpcha' ? 'replicated ' : ''}decision log${s.maxWaitMs ? `, with a ${fmtWait(s.maxWaitMs)} wait` : ''}.` : ''
    return notMoved
      ? `All or nothing, and this time nothing: no money moved, and both ledgers agree.${crashNote}`
      : `All or nothing, and this time all: both ledgers applied the transfer, and no reader ever saw it half-done.${crashNote} The client waited for ${s.roundTrips} calls to the ledgers.`
  }
  if (notMoved) {
    return `Correct in the end: the payee refused, so a refund put ${fmt(AMOUNT)} back. For a while the money had visibly left Ledger A, which is the price of not locking anything.`
  }
  return moved
    ? `Correct in the end, with exactly one credit${s.crashes ? ', even with a crash and a redelivery' : ''}. The client got an answer after one local commit, and no locks were held across the network. The price: for a while, a reader could see the money in neither account.`
    : 'Run finished.'
}

export const DEFAULT_CRASH: Record<Mode, string | null> = { twowrites: 'w3', tpc: 'c6', tpcha: 'c6', async: 'l3', safe: 'l3' }

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

const emptyLedger = (bal: number): LedgerState => ({ bal, locked: false, prepared: [], uncommitted: [], outbox: [], processed: [] })

function introText(mode: Mode, closed: boolean): string {
  const base: Record<Mode, string> = {
    twowrites: 'Two independent commits, one after the other, with nothing tying them together.',
    tpc: 'Two-phase commit: both ledgers promise first, the coordinator logs one decision, then both carry it out.',
    tpcha: 'The same protocol, with the decision log replicated, so a standby can take over instead of waiting for a restart.',
    async: 'Eventual consistency: debit locally, record the intent in the same transaction, and let a relay deliver it to Ledger B.',
    safe: 'The same flow, with a dedupe table on Ledger B and a refund path for when the payee refuses.',
  }
  return `${base[mode]}${closed ? ' The payee account is closed, so Ledger B will refuse this credit.' : ''} Press Step, or click a gutter dot to choose where a process dies.`
}

export function build(mode: Mode, crashId: string | null, closed: boolean): Step[] {
  const s: SimState = {
    a: emptyLedger(START_A),
    b: emptyLedger(START_B),
    decisionLog: [],
    queue: [],
    answered: null,
    roundTrips: 0,
    durableWrites: 0,
    maxWaitMs: 0,
    sawPartial: false,
    settled: false,
    stuck: false,
    crashes: 0,
    log: [],
  }
  const steps: Step[] = [{ s: clone(s), line: null, actor: null, label: 'start', title: 'Ready', text: introText(mode, closed), crash: false, locals: {} }]

  // One variable scope per process, so interleaved processes can't overwrite each other's locals.
  const locals: Record<Actor, Record<string, string>> = { svc: {}, cons: {}, migrator: {}, relay: {} }
  const setLocal = (actor: Actor, name: string, value: string) => {
    locals[actor] = { ...locals[actor], [name]: value }
  }

  let crashed = false
  const willCrash = (id: string) => {
    if (!crashed && crashId === id) {
      crashed = true
      return true
    }
    return false
  }

  const push = (
    id: string | null,
    actor: Actor | 'system',
    label: string,
    title: string,
    text: string | null,
    fn?: (st: SimState) => void,
    isCrash = false,
  ) => {
    if (fn) fn(s)
    const view = readerView(s)
    if (view.kind === 'partial') s.sawPartial = true
    const who = actor === 'system' ? 'system' : PANES[mode].find((p) => p.actor === actor)?.name
    s.log.push({ actor: isCrash ? 'crash' : actor, text: `[${who}] ${title}` })
    steps.push({ s: clone(s), line: id, actor, label, title, text, crash: isCrash, locals: actor === 'system' ? {} : { ...locals[actor] } })
  }
  const crashStep = (id: string, actor: Actor, title: string, text: string, fn?: (st: SimState) => void) => {
    push(id, actor, 'CRASH', title, text, (st) => {
      st.crashes++
      fn?.(st)
    }, true)
    locals[actor] = {}
  }
  const answer = (value: string) => (st: SimState) => {
    st.answered = value
  }
  // Costs are only what the client waited for, so they stop counting at the answer.
  const trip = (st: SimState) => {
    if (!st.answered) st.roundTrips++
  }
  const durable = (st: SimState) => {
    if (!st.answered) st.durableWrites++
  }

  const finishRun = () => {
    s.settled = true
    push(null, 'system', 'end', 'Run finished', verdictText(mode, s))
    return steps
  }

  // ---- Mode 1: two independent commits.
  if (mode === 'twowrites') {
    for (;;) {
      const retry = () => {
        push(null, 'system', 'retry', 'Client gets no answer and retries the whole request', 'It has no way to know how far the last attempt got, so its only safe-looking move is to send the same request again. Nothing here can tell that it is a repeat.')
      }
      locals.svc = { from: `'${FROM}'`, to: `'${TO}'`, amt: fmt(AMOUNT) }
      if (willCrash('w2')) {
        crashStep('w2', 'svc', 'Service killed before the debit', 'Nothing has happened yet, so a retry is safe.')
        retry()
        continue
      }
      push('w2', 'svc', 'debit', `Ledger A debits ${fmt(AMOUNT)} and commits`, `This commit is final and independent. ${fmt(AMOUNT)} has now left Ledger A and exists nowhere else. Watch the reader panel.`, (st) => {
        st.a.bal -= AMOUNT
        trip(st)
        durable(st)
      })
      if (willCrash('w3')) {
        crashStep('w3', 'svc', 'Service killed between the two commits', `The debit is committed. The credit will never run, because the only thing that knew it was still owed was this process's memory.`)
        retry()
        continue
      }
      if (closed) {
        push('w3', 'svc', 'refused', 'Ledger B refuses: the payee account is closed', `The debit already committed, and there's no instruction here to reverse it. The client gets an error, and ${fmt(AMOUNT)} is gone.`, (st) => {
          trip(st)
          st.answered = 'ERROR'
        })
        return finishRun()
      }
      push('w3', 'svc', 'credit', `Ledger B credits ${fmt(AMOUNT)} and commits`, 'The total is correct again.', (st) => {
        st.b.bal += AMOUNT
        trip(st)
        durable(st)
      })
      if (willCrash('w4')) {
        crashStep('w4', 'svc', 'Service killed before answering', 'Both commits happened. Only the answer was lost, but the client can\'t tell that apart from a failure.')
        retry()
        continue
      }
      push('w4', 'svc', 'return', 'Client hears OK', 'If this reaches the client, it stops retrying.', answer('OK'))
      return finishRun()
    }
  }

  // ---- Modes 2 and 3: two-phase commit.
  if (mode === 'tpc' || mode === 'tpcha') {
    const actorOf: Record<Side, Actor> = { a: 'cons', b: 'migrator' }
    const nameOf: Record<Side, string> = { a: 'Ledger A', b: 'Ledger B' }
    const changeOf: Record<Side, string> = { a: `debit(${FROM}, ${fmt(AMOUNT)})`, b: `credit(${TO}, ${fmt(AMOUNT)})` }

    const ledgerCrash = (id: string, side: Side, text: string, release: boolean) => {
      crashStep(id, actorOf[side], `${nameOf[side]} killed`, text, (st) => {
        if (release) st[side].locked = false
      })
      push(null, 'system', 'restart', `${nameOf[side]} restarts`, release ? 'In-memory locks are gone. It has no record of this transaction.' : 'The prepared row is on disk, so it reacquires the lock on startup. Its promise survives the crash.')
    }

    const prepare = (side: Side): 'YES' | 'NO' | 'NO (timeout)' => {
      const actor = actorOf[side]
      const name = nameOf[side]
      locals[actor] = { txId: `'${TX_ID}'`, change: changeOf[side] }
      if (willCrash(`${side}_p2`)) {
        ledgerCrash(`${side}_p2`, side, 'It died before doing anything. The coordinator hears nothing back.', true)
        return 'NO (timeout)'
      }
      push(`${side}_p2`, actor, 'lock', `${name} locks ${side === 'a' ? FROM : TO}`, 'Anything else that needs this row now waits. This lock stays until the decision arrives, which could be milliseconds or minutes.', (st) => {
        st[side].locked = true
        trip(st)
      })
      const allowed = side === 'a' || !closed
      push(
        `${side}_p3`,
        actor,
        allowed ? 'check' : 'refuse',
        allowed ? `${name} checks the change is allowed: it is` : `${name} checks the change is allowed: the payee account is closed`,
        allowed
          ? side === 'a'
            ? `${FROM} holds ${fmt(s.a.bal)}, which covers ${fmt(AMOUNT)}. Condition is false, so it continues.`
            : `${TO} is open. Condition is false, so it continues.`
          : `Now is when a ledger may still say no. It releases the lock and votes NO. This is the whole point of asking first.`,
        allowed
          ? undefined
          : (st) => {
              st[side].locked = false
            },
      )
      if (!allowed) return 'NO'
      if (willCrash(`${side}_p4`)) {
        ledgerCrash(`${side}_p4`, side, 'The check passed, but no promise was written. On restart it has forgotten this transaction.', true)
        return 'NO (timeout)'
      }
      push(`${side}_p4`, actor, 'promise', `${name} writes its promise to disk`, `This is what "prepared" means: ${name} has made sure it can commit even after a crash, and from now on it can't back out by itself. Nothing is visible to readers yet.`, (st) => {
        st[side].prepared.push({ txId: TX_ID, change: changeOf[side] })
        durable(st)
      })
      if (willCrash(`${side}_p5`)) {
        ledgerCrash(`${side}_p5`, side, 'The promise is on disk, but the YES never left. The coordinator will time out and treat this as a NO, and the later finish will clean up the promise.', false)
        return 'NO (timeout)'
      }
      push(`${side}_p5`, actor, 'vote', `${name} votes YES`, `${name} is now "in doubt": it holds a lock and a promise, and only the coordinator can say which way this goes.`)
      return 'YES'
    }

    const finish = (side: Side, decision: 'COMMIT' | 'ABORT') => {
      const actor = actorOf[side]
      const name = nameOf[side]
      for (;;) {
        locals[actor] = { txId: `'${TX_ID}'`, decision }
        if (willCrash(`${side}_f2`)) {
          ledgerCrash(`${side}_f2`, side, 'The decision never got applied, but the promise is on disk.', false)
          push(null, 'system', 'retry', `Coordinator retries finish on ${name}`, 'Finish is safe to send repeatedly, so it keeps trying until the ledger answers.')
          continue
        }
        const row = s[side].prepared.find((p) => p.txId === TX_ID)
        setLocal(actor, 'change', row ? row.change : 'null')
        push(
          `${side}_f2`,
          actor,
          'read',
          row ? `${name} finds its promise` : `${name} has no promise for this transaction, so it returns`,
          row ? 'Everything it needs to carry out the decision was saved at prepare time.' : side === 'b' && closed ? `${name} voted NO and kept nothing, so there's nothing to undo.` : 'Nothing to do. This is what makes a retried finish harmless.',
          trip,
        )
        if (!row) return
        if (willCrash(`${side}_f3`)) {
          ledgerCrash(`${side}_f3`, side, 'The decision never got applied, but the promise is on disk.', false)
          push(null, 'system', 'retry', `Coordinator retries finish on ${name}`, 'Finish is safe to send repeatedly, so it keeps trying until the ledger answers.')
          continue
        }
        push(
          `${side}_f3`,
          actor,
          decision === 'COMMIT' ? 'apply' : 'skip',
          decision === 'COMMIT' ? `${name} applies the ${side === 'a' ? 'debit' : 'credit'}` : `Decision is ABORT, so ${name} applies nothing`,
          decision === 'COMMIT' ? `The balance changes now, but the row stays locked until the next line commits.` : 'The balance was never touched. Undoing a prepared change only means discarding the promise.',
          (st) => {
            if (decision !== 'COMMIT') return
            st[side].bal += side === 'a' ? -AMOUNT : AMOUNT
            durable(st)
          },
        )
        push(`${side}_f4`, actor, 'release', `${name} drops the promise and unlocks`, side === 'a' && decision === 'COMMIT' ? `Ledger A is done, but Ledger B still holds its lock, so a reader that needs both still waits. That's how it avoids seeing a half-done total.` : 'This row is available again.', (st) => {
          st[side].prepared = st[side].prepared.filter((p) => p.txId !== TX_ID)
          st[side].locked = false
        })
        return
      }
    }

    const recover = (lostText: string) => {
      const outage = OUTAGE_MS[mode]
      const locked = s.a.locked || s.b.locked
      if (locked) {
        push(null, 'system', 'blocked', `Another transfer from ${s.a.locked ? FROM : TO} arrives, and waits`, `${lostText} The row is locked by a ledger that voted YES, and it can't decide alone: if it guessed, it might disagree with the other ledger. So everything touching this account waits.`, (st) => {
          st.maxWaitMs = Math.max(st.maxWaitMs, outage)
        })
      } else {
        push(null, 'system', 'down', 'Coordinator is down, but nothing is locked', `${lostText} No ledger is holding a lock for this transaction, so other work carries on.`)
      }
      push(
        null,
        'system',
        'recover',
        mode === 'tpc' ? `Someone restarts the coordinator: ${fmtWait(outage)} later` : `A standby takes over: ${fmtWait(outage)} later`,
        mode === 'tpc' ? 'Nothing could move until it came back. That dependency on one process is what "blocking" means in two-phase commit.' : 'The standby sees the same replicated log, so the decision outlives the coordinator. No human was needed, and the wait shrinks from minutes to seconds. The locks are still held during that time.',
      )
      locals.svc = { txId: `'${TX_ID}'` }
      const logged = s.decisionLog.find((d) => d.txId === TX_ID)?.decision
      const decision = logged ?? 'ABORT'
      setLocal('svc', 'decision', decision)
      push(
        'r2',
        'svc',
        'recover',
        logged ? `Log says ${logged}` : 'Log has nothing, so the decision is ABORT',
        logged
          ? 'The decision was written before the crash, so it must be carried out, however long that takes. Reaching this line is why the log write is the true commit point.'
          : 'No decision was ever logged, so nobody can have been told COMMIT. Aborting is always safe here, even if both ledgers voted YES.',
      )
      push('r3', 'svc', 'finish', `Tells Ledger A: ${decision}`, 'Safe to send even if Ledger A already finished.')
      finish('a', decision)
      push('r4', 'svc', 'finish', `Tells Ledger B: ${decision}`, 'Safe to send even if Ledger B already finished.')
      finish('b', decision)
      s.answered = decision
      push(null, 'system', 'status', `Client checks the transfer status: ${decision}`, 'The client lost its connection, so it asks again using the same transaction ID. The log gives a definite answer.')
      return finishRun()
    }

    const killCoordinator = (id: string, text: string) => {
      crashStep(id, 'svc', 'Coordinator killed', text)
    }

    const lostHere = 'The coordinator is gone.'
    locals.svc = { txId: `'${TX_ID}'`, from: `'${FROM}'`, to: `'${TO}'`, amt: fmt(AMOUNT) }
    if (willCrash('c2')) {
      killCoordinator('c2', 'Nothing has been asked of anyone yet.')
      return recover(lostHere)
    }
    push('c2', 'svc', 'ask A', 'Phase 1: asks Ledger A to prepare', "Prepare means: can you guarantee you'll be able to do this, if I tell you to? No money moves in this phase.")
    const voteA = prepare('a')
    setLocal('svc', 'voteA', voteA)
    push('c2', 'svc', 'vote A', `Ledger A's vote: ${voteA}`, voteA === 'YES' ? 'One promise secured.' : 'No reply in time counts as NO. A silent participant can never be assumed willing.')
    if (willCrash('c3')) {
      killCoordinator('c3', 'Ledger A has promised, and Ledger B has not been asked.')
      return recover(lostHere)
    }
    push('c3', 'svc', 'ask B', 'Phase 1: asks Ledger B to prepare', 'Same question, to the other side.')
    const voteB = prepare('b')
    setLocal('svc', 'voteB', voteB)
    push('c3', 'svc', 'vote B', `Ledger B's vote: ${voteB}`, voteB === 'YES' ? 'Both promises are in. Nothing has moved yet.' : 'One NO is enough. The transfer will abort.')
    if (willCrash('c4')) {
      killCoordinator('c4', 'The votes were only in memory, so they died with the coordinator.')
      return recover(lostHere)
    }
    const decision: 'COMMIT' | 'ABORT' = voteA === 'YES' && voteB === 'YES' ? 'COMMIT' : 'ABORT'
    setLocal('svc', 'decision', decision)
    push('c4', 'svc', 'decide', `Decision: ${decision}`, 'So far this is only a variable in memory. If the coordinator dies now, this decision never existed.')
    if (willCrash('c5')) {
      killCoordinator('c5', 'The decision was computed but never written. Since nobody has been told, it is still safe to abort, even though both ledgers said YES.')
      return recover(lostHere)
    }
    push('c5', 'svc', 'log', `Writes ${decision} to the decision log`, 'This single write is the commit point. Before it, the transfer can still be aborted. After it, the outcome is fixed, even if every process crashes right now.', (st) => {
      st.decisionLog.push({ txId: TX_ID, decision })
      durable(st)
    })
    if (willCrash('c6')) {
      killCoordinator('c6', 'The decision is durable, but neither ledger knows it. Both are in doubt, holding their locks.')
      return recover(lostHere)
    }
    push('c6', 'svc', 'finish A', `Phase 2: tells Ledger A ${decision}`, 'From here on, this is just delivering a decision that has already been made.')
    finish('a', decision)
    if (willCrash('c7')) {
      killCoordinator('c7', 'Ledger A finished. Ledger B is still in doubt, with its row locked.')
      return recover(lostHere)
    }
    push('c7', 'svc', 'finish B', `Phase 2: tells Ledger B ${decision}`, 'The last delivery.')
    finish('b', decision)
    if (willCrash('c8')) {
      killCoordinator('c8', 'Everything is finished and released. Only the answer was lost.')
      s.answered = decision
      push(null, 'system', 'status', `Client checks the transfer status: ${decision}`, 'The client asks again using the same transaction ID, and the log gives a definite answer, so nothing runs twice.')
      return finishRun()
    }
    push('c8', 'svc', 'return', `Client hears ${decision}`, `The client has been waiting through all of this. Look at what it cost: ${s.roundTrips} calls to the ledgers and ${s.durableWrites} durable writes, with locks held for most of it.`, answer(decision))
    return finishRun()
  }

  // ---- Modes 4 and 5: eventual consistency.
  const safe = mode === 'safe'
  for (;;) {
    locals.cons = { txId: `'${TX_ID}'`, from: `'${FROM}'`, to: `'${TO}'`, amt: fmt(AMOUNT) }
    const rollback = (id: string, text: string) => {
      crashStep(id, 'cons', 'Ledger A killed before committing', text, (st) => {
        st.a.uncommitted = []
      })
      push(null, 'system', 'retry', 'Client gets no answer and retries', 'The local transaction rolled back, so this is a clean second attempt.')
    }
    if (willCrash('e2')) {
      rollback('e2', 'Nothing has started yet.')
      continue
    }
    push('e2', 'cons', 'begin', 'Opens a local transaction', 'Both of the next writes go to Ledger A only, so an ordinary database transaction can cover them.')
    if (willCrash('e3')) {
      rollback('e3', 'Nothing was written.')
      continue
    }
    push('e3', 'cons', 'debit', `Debits ${fmt(AMOUNT)}, uncommitted`, 'Not visible to anyone until the commit below.', (st) => {
      st.a.uncommitted.push(`debit ${FROM} ${fmt(AMOUNT)}`)
    })
    if (willCrash('e4')) {
      rollback('e4', 'The uncommitted debit rolls back, so no money moved.')
      continue
    }
    push('e4', 'cons', 'outbox', 'Records "credit acct-2" in the outbox, uncommitted', 'This row is the durable memory of what is still owed to Ledger B. It lives in the same transaction as the debit, so one can\'t exist without the other.', (st) => {
      st.a.uncommitted.push(`outbox ${TX_ID}`)
    })
    if (willCrash('e5')) {
      rollback('e5', 'Both uncommitted writes roll back together. That is what the shared transaction buys.')
      continue
    }
    push('e5', 'cons', 'commit', 'Commits the debit and the outbox row together', `${fmt(AMOUNT)} has now visibly left Ledger A, and hasn't arrived anywhere. This gap is the "eventual" in eventual consistency. Unlike two separate writes, the outbox row guarantees that the rest will happen.`, (st) => {
      st.a.uncommitted = []
      st.a.bal -= AMOUNT
      st.a.outbox.push({ txId: TX_ID, kind: 'credit', sent: false })
      durable(st)
    })
    if (willCrash('e6')) {
      crashStep('e6', 'cons', 'Ledger A killed before answering', 'The debit and outbox row are committed. Only the answer was lost.')
      push(null, 'system', 'retry', 'Client retries, and the unique txId rejects the repeat', `The second attempt's outbox insert hits the unique constraint on ${TX_ID}, so that transaction rolls back without debiting again, and the client gets ACCEPTED.`, answer('ACCEPTED'))
      break
    }
    push('e6', 'cons', 'return', 'Client hears ACCEPTED, not DONE', `The client has its answer after one local commit and no network calls to Ledger B. Note the wording: it was told the transfer is on its way, not that it arrived.`, answer('ACCEPTED'))
    break
  }

  const relaySide = (side: Side) => {
    for (;;) {
      const row = s[side].outbox.find((o) => !o.sent)
      if (!row) return
      const name = side === 'a' ? 'Ledger A' : 'Ledger B'
      locals.relay = { row: `{ txId: '${row.txId}', ${row.kind} }` }
      if (willCrash('l2')) {
        crashStep('l2', 'relay', 'Relay killed before publishing', `The outbox row on ${name} is still unsent, so nothing is lost.`)
        push(null, 'system', 'restart', 'Relay restarts', 'It scans the outbox again and finds the same row.')
        continue
      }
      push('l2', 'relay', 'publish', `Publishes the ${row.kind} message`, 'The message is now in the queue.', (st) => {
        st.queue.push({ seq: st.queue.length + 1, txId: row.txId, kind: row.kind, status: 'queued', deliveries: 0 })
      })
      if (willCrash('l3')) {
        crashStep('l3', 'relay', 'Relay killed after publishing, before marking it sent', 'The message was published, but the outbox still says unsent. On restart the relay has no way to know, so it publishes again. This is why delivery is "at least once", never "exactly once".')
        push(null, 'system', 'restart', 'Relay restarts', 'It scans the outbox and finds the same row still unsent.')
        continue
      }
      push('l3', 'relay', 'mark', 'Marks the outbox row sent', 'The relay is done with this row.', (st) => {
        const r = st[side].outbox.find((o) => o.txId === row.txId && o.kind === row.kind)
        if (r) r.sent = true
      })
    }
  }

  const consumeAsync = (msg: QueueMsg) => {
    let attempts = 0
    for (;;) {
      locals.migrator = { msg: `{ seq: ${msg.seq}, txId: '${msg.txId}' }` }
      if (willCrash('k2')) {
        crashStep('k2', 'migrator', 'Ledger B killed before crediting', 'Nothing was applied, and the message is unacknowledged, so the queue will deliver it again.')
        continue
      }
      if (closed) {
        attempts++
        const a = attempts
        push('k2', 'migrator', 'refused', `Credit refused: the payee account is closed (attempt ${a})`, a < 3 ? "The handler throws, so the message isn't acknowledged and the queue redelivers it. Retrying is the right response to a temporary failure. This isn't one." : 'After repeated failures the queue gives up on this message.', (st) => {
          const m = st.queue.find((q) => q.seq === msg.seq)!
          m.deliveries++
        })
        if (a >= 3) {
          push(null, 'system', 'dead', 'Message moved to the dead-letter queue', `${fmt(AMOUNT)} is debited from Ledger A and credited nowhere, and no code path will ever fix it. Someone has to find this by hand.`, (st) => {
            st.queue.find((q) => q.seq === msg.seq)!.status = 'dead'
            st.stuck = true
          })
          return
        }
        continue
      }
      const repeat = s.b.bal > START_B
      push('k2', 'migrator', 'credit', repeat ? `Credits ${fmt(AMOUNT)} again: same transfer, second time` : `Credits ${fmt(AMOUNT)}`, repeat ? `Nothing here checks whether this transfer was already applied, so a redelivered message is just more money. Ledger B now holds ${fmt(s.b.bal + AMOUNT)}.` : 'The total is correct again, and the transfer has finished. Everyone could read a wrong total until this moment, but nobody was ever blocked.', (st) => {
        st.b.bal += AMOUNT
        st.queue.find((q) => q.seq === msg.seq)!.deliveries++
      })
      if (willCrash('k3')) {
        crashStep('k3', 'migrator', 'Ledger B killed after crediting, before acknowledging', "The credit is committed, but the queue doesn't know. It will deliver this message again.")
        continue
      }
      push('k3', 'migrator', 'ack', 'Acknowledges the message', "The queue won't redeliver this copy.", (st) => {
        st.queue.find((q) => q.seq === msg.seq)!.status = 'acked'
      })
      return
    }
  }

  const consumeSafe = (msg: QueueMsg) => {
    for (;;) {
      const key = msg.txId
      locals.migrator = { msg: `{ seq: ${msg.seq}, txId: '${key}' }` }
      const rollback = (id: string, text: string) => {
        crashStep(id, 'migrator', 'Ledger B killed before committing', text, (st) => {
          st.b.uncommitted = []
        })
      }
      if (willCrash('x2')) {
        rollback('x2', 'Nothing has started, and the message will be delivered again.')
        continue
      }
      push('x2', 'migrator', 'begin', 'Opens a local transaction', 'The dedupe record and the credit will commit together, or not at all.')
      if (willCrash('x3')) {
        rollback('x3', 'Nothing was written, and the message will be delivered again.')
        continue
      }
      const firstTime = !s.b.processed.includes(key)
      setLocal('migrator', 'firstTime', String(firstTime))
      push('x3', 'migrator', 'dedupe', firstTime ? 'Records this txId: first time seen' : 'This txId is already recorded: it is a repeat', firstTime ? 'The insert succeeded, so this message has not been applied before.' : "The unique constraint rejected the insert. This message's effect is already in the ledger, so nothing below will apply it again.", (st) => {
        if (firstTime) st.b.uncommitted.push(`processed ${key}`)
      })
      const isOpen = !closed
      setLocal('migrator', 'isOpen', String(isOpen))
      push('x4', 'migrator', 'check', isOpen ? `${TO} is open` : `${TO} is closed`, isOpen ? 'It can receive the credit.' : "It can't. Retrying would never change that, so this is a business refusal, not a failure to retry.")
      if (willCrash('x5')) {
        rollback('x5', 'The open transaction rolls back, including the dedupe record, so the redelivery is treated as a first time, which is correct.')
        continue
      }
      push('x5', 'migrator', firstTime && isOpen ? 'credit' : 'skip', firstTime && isOpen ? `Credits ${fmt(AMOUNT)}, uncommitted` : 'Condition is false, so no credit', firstTime && isOpen ? 'Not visible until the commit below.' : firstTime ? 'The account is closed.' : 'Already applied the first time. Exactly-once effect comes from this check, on top of at-least-once delivery.', (st) => {
        if (firstTime && isOpen) st.b.uncommitted.push(`credit ${TO} ${fmt(AMOUNT)}`)
      })
      if (willCrash('x6')) {
        rollback('x6', 'The open transaction rolls back, and the message will be delivered again.')
        continue
      }
      const refunding = firstTime && !isOpen
      push('x6', 'migrator', refunding ? 'refund' : 'skip', refunding ? 'Records a refund in its own outbox, uncommitted' : 'Condition is false, so no refund', refunding ? 'The same trick in the opposite direction: a durable record that money must go back, in the same transaction as the dedupe record.' : 'Only a closed account needs one.', (st) => {
        if (refunding) st.b.uncommitted.push(`outbox refund ${key}`)
      })
      if (willCrash('x7')) {
        rollback('x7', 'The open transaction rolls back, and the message will be delivered again.')
        continue
      }
      const credited = firstTime && isOpen
      push('x7', 'migrator', 'commit', 'Commits', credited ? 'The credit and the dedupe record are now both durable. The total is correct again.' : refunding ? 'The refund is now owed durably.' : 'Only the transaction closed. Nothing changed.', (st) => {
        st.b.uncommitted = []
        if (firstTime) st.b.processed.push(key)
        if (credited) st.b.bal += AMOUNT
        if (refunding) st.b.outbox.push({ txId: key, kind: 'refund', sent: false })
      })
      if (willCrash('x8')) {
        crashStep('x8', 'migrator', 'Ledger B killed after committing, before acknowledging', 'The queue will deliver this message again. This time the dedupe record will catch it.')
        continue
      }
      push('x8', 'migrator', 'ack', 'Acknowledges the message', "The queue won't redeliver this copy.", (st) => {
        st.queue.find((q) => q.seq === msg.seq)!.status = 'acked'
      })
      return
    }
  }

  const consumeRefund = (msg: QueueMsg) => {
    for (;;) {
      locals.cons = { msg: `{ seq: ${msg.seq}, txId: '${msg.txId}', refund }` }
      if (willCrash('rf2')) {
        crashStep('rf2', 'cons', 'Ledger A killed before refunding', 'Nothing was applied, and the message will be delivered again.')
        continue
      }
      const first = !s.a.processed.includes(msg.txId)
      push('rf2', 'cons', first ? 'refund' : 'skip', first ? `Puts ${fmt(AMOUNT)} back on ${FROM}` : 'Refund already applied, so it does nothing', first ? "This isn't a rollback, because the debit committed long ago and people may have seen it. It's a new, visible, opposite entry. That's what \"compensation\" means." : 'The same dedupe check protects the way back.', (st) => {
        if (first) {
          st.a.processed.push(msg.txId)
          st.a.bal += AMOUNT
        }
      })
      if (willCrash('rf3')) {
        crashStep('rf3', 'cons', 'Ledger A killed before acknowledging', 'The refund is committed, and the message will be delivered again. The dedupe check will catch it.')
        continue
      }
      push('rf3', 'cons', 'ack', 'Acknowledges the refund message', 'The transfer is over: nothing moved, in the end.', (st) => {
        st.queue.find((q) => q.seq === msg.seq)!.status = 'acked'
      })
      return
    }
  }

  relaySide('a')
  for (let i = 0; i < s.queue.length; i++) {
    const msg = s.queue[i]
    if (msg.kind === 'credit') {
      if (safe) consumeSafe(msg)
      else consumeAsync(msg)
    } else {
      consumeRefund(msg)
    }
    if (safe) relaySide('b')
  }
  return finishRun()
}

export type Experiment = { label: string; title: string; mode: Mode; crash: string | null; closed: boolean }

export const EXPERIMENTS: Experiment[] = [
  {
    label: 'Crash in the gap',
    title: 'Two separate commits, and the process dies between them. The client retries, and now the debit has run twice. No protocol, no memory of what was owed.',
    mode: 'twowrites',
    crash: 'w3',
    closed: false,
  },
  {
    label: 'The payee says no',
    title: 'Two-phase commit asks before changing anything, so a closed account means a clean abort. Compare this with the same refusal in the other modes.',
    mode: 'tpc',
    crash: null,
    closed: true,
  },
  {
    label: 'Coordinator dies holding locks',
    title: 'Both ledgers voted YES and the decision is logged, then the coordinator dies. The money ends up correct, but both rows stay locked for 5 minutes.',
    mode: 'tpc',
    crash: 'c6',
    closed: false,
  },
  {
    label: 'One line before the commit point',
    title: 'Both voted YES, the decision is COMMIT, but it was never logged. Recovery aborts, and that is correct. See why the log write is what decides.',
    mode: 'tpc',
    crash: 'c5',
    closed: false,
  },
  {
    label: 'Replicated log: seconds, not minutes',
    title: 'The same crash with a standby reading the same log. Locks are still held, but for 3 seconds instead of 5 minutes.',
    mode: 'tpcha',
    crash: 'c6',
    closed: false,
  },
  {
    label: 'Money created from nothing',
    title: 'The relay dies between publishing and marking sent, so the message goes out twice. With no dedupe, Ledger B credits twice.',
    mode: 'async',
    crash: 'l3',
    closed: false,
  },
  {
    label: 'Money stranded',
    title: 'Eventual consistency has no vote, so a closed account only shows up after the debit. Retries never help, and the money ends up in a dead-letter queue.',
    mode: 'async',
    crash: null,
    closed: true,
  },
  {
    label: 'Same duplicate, harmless',
    title: 'The same relay crash as before, and the same duplicate message. The dedupe table catches it, so exactly one credit lands.',
    mode: 'safe',
    crash: 'l3',
    closed: false,
  },
  {
    label: 'Refused, then refunded',
    title: 'The refusal now produces a refund: a new, visible entry that puts the money back. Correct in the end, with the gap visible along the way.',
    mode: 'safe',
    crash: null,
    closed: true,
  },
]
