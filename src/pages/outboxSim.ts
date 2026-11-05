export type Mode = 'after' | 'before' | 'outbox'
export type Actor = 'svc' | 'relay' | 'cons'

export type CodeLine = {
  id: string
  code: string
  breakable: boolean
  off?: boolean
}

export const EV = 'evt-7f3a'
export const APP = 'app-42'
export const AMOUNT = '$600,000'

export const SVC_CODE: Record<Mode, CodeLine[]> = {
  after: [
    { id: 'a1', code: 'fun approve(appId: String) {', breakable: false },
    { id: 'a2', code: '  db.begin()', breakable: true },
    { id: 'a3', code: '  db.update(applications, appId, status = "APPROVED")', breakable: true },
    { id: 'a4', code: '  db.commit()', breakable: true },
    { id: 'a5', code: '  kafka.send("decision.made", key = appId, event)', breakable: true },
    { id: 'a6', code: '}', breakable: false },
  ],
  before: [
    { id: 'b1', code: 'fun approve(appId: String) {', breakable: false },
    { id: 'b2', code: '  db.begin()', breakable: true },
    { id: 'b3', code: '  db.update(applications, appId, status = "APPROVED")', breakable: true },
    { id: 'b4', code: '  kafka.send("decision.made", key = appId, event)', breakable: true },
    { id: 'b5', code: '  db.commit()', breakable: true },
    { id: 'b6', code: '}', breakable: false },
  ],
  outbox: [
    { id: 'c1', code: 'fun approve(appId: String) {', breakable: false },
    { id: 'c2', code: '  db.begin()', breakable: true },
    { id: 'c3', code: '  db.update(applications, appId, status = "APPROVED")', breakable: true },
    { id: 'c4', code: '  db.insert(outbox, id = eventId, topic = "decision.made", payload)', breakable: true },
    { id: 'c5', code: '  db.commit()', breakable: true },
    { id: 'c6', code: '}', breakable: false },
  ],
}

export const RELAY_CODE: CodeLine[] = [
  { id: 'r1', code: 'loop {                                   // every 200ms', breakable: false },
  { id: 'r2', code: '  val rows = db.query("SELECT * FROM outbox WHERE sent_at IS NULL', breakable: true },
  { id: 'r2b', code: '                       ORDER BY id FOR UPDATE SKIP LOCKED")', breakable: false },
  { id: 'r3', code: '  for (row in rows) {', breakable: false },
  { id: 'r4', code: '    kafka.send(row.topic, row.key, row.payload).get()  // wait for ack', breakable: true },
  { id: 'r5', code: '    db.update(outbox, row.id, sent_at = now())', breakable: true },
  { id: 'r6', code: '  }', breakable: false },
  { id: 'r7', code: '}', breakable: false },
]

export function consumerCode(dedupe: boolean): CodeLine[] {
  return [
    { id: 'k1', code: 'for (msg in kafka.poll("decision.made")) {', breakable: true },
    { id: 'k2', code: '  if (processed.contains(msg.eventId)) continue   // dedupe', breakable: dedupe, off: !dedupe },
    {
      id: 'k3',
      code: dedupe ? '  db.tx { ledger.post(msg); processed.add(msg.eventId) }' : '  db.tx { ledger.post(msg) }',
      breakable: true,
    },
    { id: 'k4', code: '  kafka.commitOffset(msg.offset + 1)', breakable: true },
    { id: 'k5', code: '}', breakable: false },
  ]
}

export function lineNo(lines: CodeLine[], id: string): number {
  return lines.findIndex((l) => l.id === id) + 1
}

type OutboxRow = { id: number; ev: string; pending: boolean; sent: boolean }
type KafkaMsg = { off: number; ev: string; dup: boolean }
type LedgerEntry = { ev: string; app: string; dup: boolean }
type LogEntry = { actor: Actor | 'crash'; text: string }

export type SimState = {
  app: { status: 'PENDING' | 'APPROVED'; pending: 'APPROVED' | null }
  tx: boolean
  outbox: OutboxRow[]
  kafka: KafkaMsg[]
  svcDown: boolean
  cons: { offset: number; processed: string[]; ledger: LedgerEntry[]; inflight: number | null }
  log: LogEntry[]
  touched: { a?: boolean; o?: number; k?: number; l?: number }
}

export type Step = {
  s: SimState
  line: string | null
  actor: Actor | 'system' | null
  label: string
  title: string
  text: string | null
  crash: boolean
}

function initState(): SimState {
  return {
    app: { status: 'PENDING', pending: null },
    tx: false,
    outbox: [],
    kafka: [],
    svcDown: false,
    cons: { offset: 0, processed: [], ledger: [], inflight: null },
    log: [],
    touched: {},
  }
}

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']

export function checks(s: SimState, final: boolean): CheckResult[] {
  const approved = s.app.status === 'APPROVED'
  const posts = s.cons.ledger.length
  return [
    [
      'No lost events',
      'Every APPROVED application is posted in the ledger',
      approved && posts === 0 ? (final ? 'bad' : 'wait') : 'ok',
    ],
    ['No ghost events', 'Every ledger posting matches an APPROVED application', !approved && posts > 0 ? 'bad' : 'ok'],
    ['No double posting', 'Each event affects the ledger once', posts > 1 ? 'bad' : 'ok'],
  ]
}

export function verdictText(s: SimState): string {
  const c = checks(s, true)
  const bad = c.filter((x) => x[2] === 'bad')
  if (!bad.length) {
    return s.app.status === 'APPROVED'
      ? 'Consistent. The decision and the ledger agree, and the loan was posted exactly once.'
      : 'Consistent. Nothing was approved and nothing was posted. The caller saw an error and can safely retry.'
  }
  const names: Record<string, string> = {
    'No lost events': 'a lost event',
    'No ghost events': 'a ghost event',
    'No double posting': 'a double posting',
  }
  const first = bad[0][0]
  const consequence =
    first === 'No lost events'
      ? 'The customer got the loan, but the platform has no record of it on its books.'
      : first === 'No ghost events'
        ? "The platform's ledger shows a loan that was never actually approved."
        : 'The customer owes twice what they borrowed.'
  return `Inconsistent, with ${bad.map((b) => names[b[0]]).join(' and ')}. ${consequence}`
}

export function introText(mode: Mode): string {
  return mode === 'after'
    ? 'The common first attempt: commit, then publish. Press Step, or click a gutter dot to move the crash.'
    : mode === 'before'
      ? 'Second attempt: publish first so we never lose the event, then commit.'
      : 'The outbox: the service writes only to Postgres. A relay publishes later.'
}

export function build(mode: Mode, crashId: string | null, dedupe: boolean): Step[] {
  const s = initState()
  const steps: Step[] = [{ s: clone(s), line: null, actor: null, label: 'start', title: 'Ready', text: introText(mode), crash: false }]
  let crashed = false
  const willCrash = (id: string) => {
    if (!crashed && crashId === id) {
      crashed = true
      return true
    }
    return false
  }
  const push = (
    line: string | null,
    actor: Actor | 'system',
    label: string,
    title: string,
    text: string | null,
    fn?: (st: SimState) => void,
    isCrash = false,
  ) => {
    s.touched = {}
    if (fn) fn(s)
    s.log.push({ actor: isCrash ? 'crash' : (actor as Actor), text: `[${actor}] ${title}` })
    steps.push({ s: clone(s), line, actor, label, title, text, crash: isCrash })
  }

  const commit = (st: SimState) => {
    if (st.app.pending) {
      st.app.status = st.app.pending
      st.app.pending = null
    }
    st.outbox.forEach((r) => (r.pending = false))
    st.tx = false
    st.touched.a = true
  }
  const send = (st: SimState) => {
    const dup = st.kafka.some((m) => m.ev === EV)
    st.kafka.push({ off: st.kafka.length, ev: EV, dup })
    st.touched.k = st.kafka.length - 1
  }

  // ---- service
  const svcLines = SVC_CODE[mode].filter((l) => l.breakable).map((l) => l.id)
  for (const id of svcLines) {
    if (willCrash(id)) {
      const wasOpen = s.tx
      push(
        id,
        'svc',
        'CRASH',
        `Decision service killed before ${id}`,
        wasOpen
          ? `The process died with the transaction still open. Postgres rolls it back automatically: the application stays PENDING${
              mode === 'outbox' ? ' and the outbox row disappears with it' : ''
            }.${mode === 'before' && s.kafka.length ? ' But Kafka already has the event, and Kafka is not part of that transaction.' : ''}`
          : 'The commit already happened, so the application is APPROVED for good. The process died before it reached kafka.send. Nothing in the system remembers that an event still needs to go out.',
        (st) => {
          if (st.tx) {
            st.app.pending = null
            st.outbox = st.outbox.filter((r) => !r.pending)
            st.tx = false
          }
          st.svcDown = true
        },
        true,
      )
      break
    }
    const k = id.slice(1)
    if (k === '2') {
      push(id, 'svc', 'begin', 'Begin transaction', 'A Postgres transaction is open. Everything written now is invisible to other connections until commit.', (st) => {
        st.tx = true
      })
    } else if (k === '3') {
      push(id, 'svc', 'update', 'Update application → APPROVED', 'Changed inside the transaction (shown as pending). Not durable yet.', (st) => {
        st.app.pending = 'APPROVED'
        st.touched.a = true
      })
    } else if (k === '4') {
      if (mode === 'after') {
        push(id, 'svc', 'commit', 'Commit', 'APPROVED is now durable. From here on, nothing can undo it.', commit)
      } else if (mode === 'before') {
        push(
          id,
          'svc',
          'send',
          'Send to Kafka (inside the tx)',
          'Kafka stored the event right away. But Kafka is a separate system: if this transaction rolls back, Kafka keeps the message.',
          send,
        )
      } else {
        push(id, 'svc', 'outbox', 'Insert outbox row', 'The event is just another row in the same transaction. It lives or dies with the APPROVED update.', (st) => {
          st.outbox.push({ id: 1, ev: EV, pending: true, sent: false })
          st.touched.o = 1
        })
      }
    } else if (k === '5') {
      if (mode === 'after') {
        push(
          id,
          'svc',
          'send',
          'Send to Kafka',
          'Kafka acknowledged the event. This works almost every time, which is why the bug survives to production.',
          send,
        )
      } else if (mode === 'before') {
        push(id, 'svc', 'commit', 'Commit', 'Now the database agrees with Kafka. Only if we got here.', commit)
      } else {
        push(
          id,
          'svc',
          'commit',
          'Commit',
          'The status change and the outbox row are durable together. The service returns to the caller. It never talks to Kafka directly.',
          commit,
        )
      }
    }
  }

  // ---- relay (outbox mode only)
  if (mode === 'outbox') {
    let guard = 0
    outer: while (guard++ < 6) {
      if (willCrash('r2')) {
        push('r2', 'relay', 'CRASH', 'Relay killed before polling', 'Nothing lost: the outbox row is still in Postgres. The relay restarts and polls again.', undefined, true)
        continue
      }
      const batch = s.outbox.filter((r) => !r.pending && !r.sent).map((r) => r.id)
      if (!batch.length) {
        push('r2', 'relay', 'poll', 'Relay polls: nothing to send', s.outbox.length ? 'All committed rows are published. The relay keeps polling every 200 ms.' : 'No committed outbox rows exist. Nothing was approved, so there is nothing to publish.')
        break
      }
      push('r2', 'relay', 'poll', `Relay polls the outbox`, 'Found a committed row with sent_at IS NULL. The relay only ever sees committed rows, so it can never publish something that might still roll back.')
      for (const id of batch) {
        if (willCrash('r4')) {
          push('r4', 'relay', 'CRASH', 'Relay killed before sending', 'The row is still unsent in Postgres. On restart the relay finds it again — no loss.', undefined, true)
          continue outer
        }
        const dupNext = s.kafka.some((m) => m.ev === EV)
        push(
          'r4',
          'relay',
          'send',
          'Relay sends to Kafka, waits for ack',
          dupNext
            ? 'Same event_id sent again. Kafka now holds a duplicate — the price of at-least-once delivery.'
            : 'Kafka acknowledged the write. Next the relay records that this row is done.',
          send,
        )
        if (willCrash('r5')) {
          push(
            'r5',
            'relay',
            'CRASH',
            'Relay killed after send, before marking sent',
            'Kafka has the event, but the outbox row still says sent_at = NULL. The relay restarts knowing only what Postgres says — so it will send the event again.',
            undefined,
            true,
          )
          continue outer
        }
        push('r5', 'relay', 'mark', 'Relay marks the row sent', "sent_at is set. The next poll won't pick this row up.", (st) => {
          const row = st.outbox.find((r) => r.id === id)
          if (row) row.sent = true
          st.touched.o = id
        })
      }
    }
  }

  // ---- consumer
  let g = 0
  while (s.cons.offset < s.kafka.length && g++ < 8) {
    const off = s.cons.offset
    const m = s.kafka[off]
    if (willCrash('k1')) {
      push('k1', 'cons', 'CRASH', 'Ledger consumer killed before poll', 'Offset not moved. It will poll the same message on restart.', (st) => {
        st.cons.inflight = null
      }, true)
      continue
    }
    push('k1', 'cons', 'poll', `Consumer polls offset ${off}`, 'Reads the event for this application. The ledger service trusts the event: it has no way to check the decision service\'s database.', (st) => {
      st.cons.inflight = off
    })
    let skip = false
    if (dedupe) {
      if (willCrash('k2')) {
        push('k2', 'cons', 'CRASH', 'Consumer killed', 'Nothing written. Redelivered on restart.', (st) => {
          st.cons.inflight = null
        }, true)
        continue
      }
      skip = s.cons.processed.includes(m.ev)
      push('k2', 'cons', 'check', skip ? 'Already processed, skip' : 'Not seen before', skip ? 'processed_events already holds this event_id. The duplicate is ignored — the customer is charged once.' : 'This event_id is not in processed_events, so this is the first time.')
    }
    if (!skip) {
      if (willCrash('k3')) {
        push('k3', 'cons', 'CRASH', 'Consumer killed before writing', 'Nothing written. The message is redelivered on restart.', (st) => {
          st.cons.inflight = null
        }, true)
        continue
      }
      const already = s.cons.ledger.some((l) => l.ev === m.ev)
      push(
        'k3',
        'cons',
        'post',
        already ? 'Ledger posts AGAIN' : 'Ledger posts the loan',
        already
          ? `No dedupe, so the same loan of ${AMOUNT} is posted a second time. The customer now owes double.`
          : dedupe
            ? 'Ledger entry and processed_events row commit in one transaction. They succeed or fail together.'
            : 'Ledger entry written.',
        (st) => {
          st.cons.ledger.push({ ev: m.ev, app: APP, dup: already })
          if (dedupe) st.cons.processed.push(m.ev)
          st.touched.l = st.cons.ledger.length - 1
        },
      )
    }
    if (willCrash('k4')) {
      push(
        'k4',
        'cons',
        'CRASH',
        'Consumer killed before committing the offset',
        `The ledger wrote, but Kafka still thinks offset ${off} is unprocessed. On restart the same message comes back.${
          dedupe ? ' The dedupe check will catch it.' : ' Without dedupe it will be posted again.'
        }`,
        (st) => {
          st.cons.inflight = null
        },
        true,
      )
      continue
    }
    push('k4', 'cons', 'offset', `Commit offset ${off + 1}`, "Kafka records progress. This message won't be delivered to this consumer group again.", (st) => {
      st.cons.offset = off + 1
      st.cons.inflight = null
    })
  }

  push(null, 'system', 'end', 'Run finished', verdictText(s))

  return steps
}

export const DEFAULT_CRASH: Record<Mode, string> = { after: 'a5', before: 'b5', outbox: 'r5' }

export type Experiment = {
  label: string
  title: string
  mode: Mode
  crash: string
  dedupe: boolean
}

export const EXPERIMENTS: Experiment[] = [
  { label: 'Lost event', title: 'Mode 1. Crash after commit, before send. Approved in the DB, ledger never hears.', mode: 'after', crash: 'a5', dedupe: true },
  { label: 'Ghost event', title: 'Mode 2. Crash before commit. Ledger posts a loan the DB rolled back.', mode: 'before', crash: 'b5', dedupe: true },
  { label: 'Clean failure', title: 'Mode 3. Crash before commit. Nothing happened anywhere. Safe to retry.', mode: 'outbox', crash: 'c5', dedupe: true },
  { label: 'Relay duplicate', title: 'Mode 3. Relay sent but died before marking the row. Kafka gets it twice.', mode: 'outbox', crash: 'r5', dedupe: true },
  { label: 'Double posting', title: 'Same, with the idempotent consumer off. The customer is charged twice.', mode: 'outbox', crash: 'r5', dedupe: false },
  { label: 'Consumer redelivery', title: 'Mode 3. Ledger wrote, died before committing the offset.', mode: 'outbox', crash: 'k4', dedupe: true },
]
