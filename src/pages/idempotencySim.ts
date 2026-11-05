export type Mode = 'nokey' | 'checkthenact' | 'atomic' | 'propagated'
export type Actor = 'svc' | 'client'

export type CodeLine = {
  id: string
  code: string
  breakable: boolean
}

export const AMOUNT = '$600,000'
export const KEY = 'idem-8b21'

export const SVC_CODE: Record<Mode, CodeLine[]> = {
  nokey: [
    { id: 'x1', code: 'fun charge(request) {', breakable: false },
    { id: 'x2', code: '  val result = paymentProcessor.charge(card, amount)', breakable: true },
    { id: 'x3', code: '  db.insert(charges, result)', breakable: true },
    { id: 'x4', code: '  return result', breakable: true },
    { id: 'x5', code: '}', breakable: false },
  ],
  checkthenact: [
    { id: 'y1', code: 'fun charge(request, idemKey) {', breakable: false },
    { id: 'y2', code: '  val existing = db.find(idempotencyKeys, idemKey)', breakable: true },
    { id: 'y3', code: '  if (existing != null) return existing.response', breakable: false },
    { id: 'y4', code: '  val result = paymentProcessor.charge(card, amount)', breakable: true },
    { id: 'y5', code: '  db.insert(idempotencyKeys, idemKey, response = result)', breakable: true },
    { id: 'y6', code: '  return result', breakable: true },
    { id: 'y7', code: '}', breakable: false },
  ],
  atomic: [
    { id: 'z1', code: 'fun charge(request, idemKey) {', breakable: false },
    { id: 'z2', code: '  val claimed = db.insertIfAbsent(idempotencyKeys, idemKey)  // unique constraint', breakable: true },
    { id: 'z3', code: '  if (!claimed) return db.waitForResult(idemKey)', breakable: false },
    { id: 'z4', code: '  val result = paymentProcessor.charge(card, amount)', breakable: true },
    { id: 'z5', code: '  db.update(idempotencyKeys, idemKey, response = result)', breakable: true },
    { id: 'z6', code: '  return result', breakable: true },
    { id: 'z7', code: '}', breakable: false },
  ],
  propagated: [
    { id: 'w1', code: 'fun charge(request, idemKey) {', breakable: false },
    { id: 'w2', code: '  db.insertIfAbsent(idempotencyKeys, idemKey)  // bookkeeping only — nothing branches on this', breakable: true },
    { id: 'w3', code: '  val result = paymentProcessor.charge(card, amount, idempotencyKey = idemKey)', breakable: true },
    { id: 'w4', code: '  db.update(idempotencyKeys, idemKey, response = result)', breakable: true },
    { id: 'w5', code: '  return result', breakable: true },
    { id: 'w6', code: '}', breakable: false },
  ],
}

export function lineNo(lines: CodeLine[], id: string): number {
  return lines.findIndex((l) => l.id === id) + 1
}

type ChargeResult = { id: string; amount: string }
type ProcessorCall = { id: string; amount: string; cached: boolean }
type LogEntry = { actor: Actor | 'crash'; text: string }
type IdemStatus = 'none' | 'pending' | 'done'

export type SimState = {
  idem: { status: IdemStatus; response: ChargeResult | null }
  processorCharges: ChargeResult[]
  processorCalls: ProcessorCall[]
  charges: ChargeResult[]
  log: LogEntry[]
  resolved: boolean
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
  attempt: number
}

function initState(): SimState {
  return { idem: { status: 'none', response: null }, processorCharges: [], processorCalls: [], charges: [], log: [], resolved: false }
}

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

function recordNewCharge(st: SimState): ChargeResult {
  const result = { id: `ch-${st.processorCharges.length + 1}`, amount: AMOUNT }
  st.processorCharges.push(result)
  st.processorCalls.push({ ...result, cached: false })
  return result
}

function callIdempotentProcessor(st: SimState): ChargeResult {
  if (st.processorCharges.length > 0) {
    const existing = st.processorCharges[0]
    st.processorCalls.push({ ...existing, cached: true })
    return existing
  }
  return recordNewCharge(st)
}

export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']

export function checks(s: SimState, final: boolean): CheckResult[] {
  return [
    ['No duplicate charge', 'The payment processor is called at most once for this request', s.processorCharges.length > 1 ? 'bad' : 'ok'],
    ['No stuck retries', 'A retried request eventually gets a definitive answer, not an infinite wait', !s.resolved && final ? 'bad' : !s.resolved ? 'wait' : 'ok'],
  ]
}

export function verdictText(s: SimState): string {
  const dup = s.processorCharges.length > 1
  if (dup) {
    return `Inconsistent: the processor was charged ${s.processorCharges.length} times for one logical request. The customer was billed twice for something they asked for once.`
  }
  if (!s.resolved) {
    return "Stuck: the idempotency key is claimed but no response was ever recorded against it. Without a lease/expiry on the claim, every retry will wait forever."
  }
  return s.processorCharges.length === 1
    ? 'Consistent: the processor was charged exactly once, and the client got a definitive answer — including on retry.'
    : 'Consistent: nothing was charged, and the client got a definitive answer.'
}

export function introText(mode: Mode): string {
  return mode === 'nokey'
    ? "No idempotency key at all. Press Step, or click a gutter dot to decide exactly where the client's connection drops."
    : mode === 'checkthenact'
      ? 'An idempotency key exists, but the lookup and the write are two separate steps. Is that enough?'
      : mode === 'atomic'
        ? 'The key claim and the charge are now atomic: a unique constraint decides who gets to proceed. One gap remains.'
        : "The same key is also passed to the payment processor. Now a retry never has to wait for anyone — it's always safe to just ask again."
}

export const ACTOR_LABEL: Record<Actor, string> = { svc: 'payment service', client: 'client' }

export function build(mode: Mode, crashId: string | null): Step[] {
  const s = initState()
  let locals: Record<string, string> = {}
  const steps: Step[] = [
    { s: clone(s), line: null, actor: null, label: 'start', title: 'Ready', text: introText(mode), crash: false, locals: {}, attempt: 0 },
  ]
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
    if (fn) fn(s)
    s.log.push({ actor: isCrash ? 'crash' : (actor as Actor), text: `[${actor}] ${title}` })
    steps.push({ s: clone(s), line, actor, label, title, text, crash: isCrash, locals: { ...locals }, attempt })
  }
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }

  let resolved = false
  let stuck = false
  let attempt = 0

  while (!resolved && !stuck && attempt < 3) {
    attempt++
    locals = mode === 'nokey' ? {} : { idemKey: `'${KEY}'` }
    push(
      null,
      'client',
      'send',
      `Client sends charge request (attempt ${attempt})`,
      attempt === 1 ? `Idempotency-Key: ${KEY}` : `Same Idempotency-Key as before: ${KEY} — the client believes this might be a duplicate of a request it never got an answer for.`,
    )

    if (mode === 'nokey') {
      let crashedHere = false
      for (const line of SVC_CODE.nokey.filter((l) => l.breakable)) {
        if (willCrash(line.id)) {
          push(line.id, 'svc', 'CRASH', `Response lost before ${line.id}`, 'The connection drops here. Whatever already happened server-side stays exactly as it was — Postgres and the processor don\'t know or care that the client stopped listening.', undefined, true)
          crashedHere = true
          break
        }
        if (line.id === 'x2') {
          push(line.id, 'svc', 'charge', 'Processor charges the card', 'Money moves. There is no key yet to tell this call apart from any other.', (st) => {
            const result = recordNewCharge(st)
            setLocal('result', `{ id: '${result.id}', amount: '${result.amount}' }`)
          })
        } else if (line.id === 'x3') {
          push(line.id, 'svc', 'record', 'Service records the charge', "Written to our own database. This is bookkeeping only — it doesn't stop a second charge.", (st) => {
            const last = st.processorCharges[st.processorCharges.length - 1]
            st.charges.push(last)
          })
        } else if (line.id === 'x4') {
          push(line.id, 'svc', 'return', 'Service returns the result', 'If the client actually receives this, it stops retrying. The failure mode is entirely about what happens when it doesn\'t.')
        }
      }
      if (!crashedHere) {
        resolved = true
        push(null, 'client', 'done', 'Client receives a response', 'The request is done, from the client\'s point of view.', (st) => {
          st.resolved = true
        })
      } else {
        push(null, 'client', 'retry', 'Client never hears back — retries', 'Same request, sent again. Nothing on this request distinguishes it from the first attempt.')
      }
      continue
    }

    if (mode === 'checkthenact') {
      let crashedHere = false
      let short = false
      for (const line of SVC_CODE.checkthenact) {
        if (line.id === 'y1' || line.id === 'y7') continue
        if (line.id === 'y3') {
          const found = s.idem.status === 'done'
          push(
            'y3',
            'svc',
            found ? 'cached' : 'check',
            found ? 'Found a cached response — returning it' : 'Condition is false — falls through',
            found
              ? 'The key lookup found an answer already recorded. No second charge.'
              : 'Nothing was found above, so this attempt falls through to the charge below.',
          )
          if (found) short = true
          continue
        }
        if (short) break
        if (willCrash(line.id)) {
          push(line.id, 'svc', 'CRASH', `Response lost before ${line.id}`, line.id === 'y5'
            ? 'The charge already happened — the idempotency row just never got written. The retry\'s lookup will find nothing.'
            : line.id === 'y2'
              ? 'The lookup itself never completed. Nothing has happened yet, so a retry is free.'
              : line.id === 'y4'
                ? 'The lookup already ran and found nothing, but the charge never happened. A retry is still free.'
                : 'The charge and the key write both already happened. Only the response delivery was lost.', undefined, true)
          crashedHere = true
          break
        }
        if (line.id === 'y2') {
          const existing = s.idem.status === 'done'
          push(line.id, 'svc', 'find', existing ? 'Looks up the key — found' : 'Looks up the key — not found', existing ? 'A previous attempt already recorded a response under this key.' : 'Nothing recorded yet under this key. This attempt will go ahead and charge.', () => {
            setLocal('existing', existing && s.idem.response ? `{ id: '${s.idem.response.id}', amount: '${s.idem.response.amount}' }` : 'null')
          })
        } else if (line.id === 'y4') {
          push(line.id, 'svc', 'charge', 'Processor charges the card', 'Money moves. The key has not been written yet — there is a window here.', (st) => {
            const result = recordNewCharge(st)
            setLocal('result', `{ id: '${result.id}', amount: '${result.amount}' }`)
          })
        } else if (line.id === 'y5') {
          push(line.id, 'svc', 'write', 'Service writes the idempotency row', 'Now a retry that reaches the lookup above will find this and skip the charge.', (st) => {
            const last = st.processorCharges[st.processorCharges.length - 1]
            st.idem = { status: 'done', response: last }
            st.charges.push(last)
          })
        } else if (line.id === 'y6') {
          push(line.id, 'svc', 'return', 'Service returns the result', 'If this reaches the client, it stops retrying.')
        }
      }
      if (short || !crashedHere) {
        resolved = true
        push(null, 'client', 'done', 'Client receives a response', short ? 'The exact same result as before — no second charge.' : 'The request is done, from the client\'s point of view.', (st) => {
          st.resolved = true
        })
      } else {
        push(null, 'client', 'retry', 'Client never hears back — retries', 'Same request, same Idempotency-Key, sent again.')
      }
      continue
    }

    if (mode === 'atomic') {
      let outcome: 'resolved' | 'retry' | 'stuck' = 'retry'
      let claimed = false
      for (const line of SVC_CODE.atomic) {
        if (line.id === 'z1' || line.id === 'z7') continue
        if (line.id === 'z3') {
          if (claimed) {
            push('z3', 'svc', 'check', 'Claim succeeded — condition is false, falls through', 'This attempt holds the key, so it goes on to actually charge.')
            continue
          }
          if (s.idem.status === 'done') {
            push('z3', 'svc', 'wait', 'Finds the recorded response — returns it', 'The earlier attempt finished and recorded a response. No second charge.')
            outcome = 'resolved'
          } else {
            push('z3', 'svc', 'wait', 'Waits for a result that was never recorded', "The key is claimed, but nothing will ever write a response to it in this run. Without a lease/expiry, this attempt is stuck.")
            outcome = 'stuck'
          }
          break
        }
        if (willCrash(line.id)) {
          push(line.id, 'svc', 'CRASH', `Response lost before ${line.id}`, line.id === 'z2'
            ? 'The claim attempt itself never completed. Nothing is reserved yet — a retry starts clean.'
            : line.id === 'z4'
              ? 'The key is claimed, but the charge never ran. Any retry will just find a claimed-but-empty key.'
              : line.id === 'z5'
                ? 'The charge already happened, exactly once — but the response was never recorded against the claim. A retry has nothing to wait for.'
                : 'The charge and the response are both already durably recorded. Only the delivery to the client was lost.', undefined, true)
          outcome = 'retry'
          break
        }
        if (line.id === 'z2') {
          claimed = s.idem.status === 'none'
          push(line.id, 'svc', 'claim', claimed ? 'Claims the key (unique constraint wins)' : 'Tries to claim the key — another attempt already holds it', claimed ? 'The INSERT succeeds: this attempt, and only this one, is allowed to charge.' : "Another attempt's row is already sitting there. This attempt backs off and waits for that row's response instead of charging.", (st) => {
            if (claimed) st.idem = { status: 'pending', response: null }
            setLocal('claimed', claimed ? 'true' : 'false')
          })
        } else if (line.id === 'z4') {
          push(line.id, 'svc', 'charge', 'Processor charges the card', 'Money moves. Because of the unique constraint above, this can only happen for the attempt that won the claim.', (st) => {
            const result = recordNewCharge(st)
            setLocal('result', `{ id: '${result.id}', amount: '${result.amount}' }`)
          })
        } else if (line.id === 'z5') {
          push(line.id, 'svc', 'record', 'Service records the response on the claim', 'Any attempt waiting on this key can now be satisfied.', (st) => {
            const last = st.processorCharges[st.processorCharges.length - 1]
            st.idem = { status: 'done', response: last }
            st.charges.push(last)
          })
        } else if (line.id === 'z6') {
          push(line.id, 'svc', 'return', 'Service returns the result', 'If this reaches the client, it stops retrying.')
          outcome = 'resolved'
        }
      }
      if (outcome === 'resolved') {
        resolved = true
        push(null, 'client', 'done', 'Client receives a response', 'The request is done, from the client\'s point of view.', (st) => {
          st.resolved = true
        })
      } else if (outcome === 'stuck') {
        stuck = true
        push(null, 'client', 'stuck', 'Client is still waiting — retries will not help', 'Every retry will re-enter the same wait with nothing to find. This needs a lease/expiry on the claim, not another retry.')
      } else {
        push(null, 'client', 'retry', 'Client never hears back — retries', 'Same request, same Idempotency-Key, sent again.')
      }
    }

    if (mode === 'propagated') {
      let crashedHere = false
      for (const line of SVC_CODE.propagated) {
        if (line.id === 'w1' || line.id === 'w6') continue
        if (willCrash(line.id)) {
          push(
            line.id,
            'svc',
            'CRASH',
            `Response lost before ${line.id}`,
            line.id === 'w2'
              ? 'The insert attempt itself never completed. Nothing here was ever load-bearing anyway — a retry just tries the same bookkeeping insert again.'
              : line.id === 'w3'
                ? 'The call to the processor never completed. Nothing was charged, so a retry just makes the same call fresh.'
                : line.id === 'w4'
                  ? "The processor already charged the card and handed back a result — this service just never wrote it down locally. That's fine: nothing here depended on that write."
                  : 'Everything already happened and is recorded locally. Only the delivery to the client was lost.',
            undefined,
            true,
          )
          crashedHere = true
          break
        }
        if (line.id === 'w2') {
          push(line.id, 'svc', 'claim', 'Inserts a bookkeeping row — same call as mode 3, but its result is thrown away', "Unlike mode 3, nothing reads whether this succeeded. There's no `val claimed =`, and no branch after it — this line can't send anyone to wait.", (st) => {
            if (st.idem.status === 'none') st.idem = { status: 'pending', response: null }
          })
        } else if (line.id === 'w3') {
          const dup = s.processorCharges.length > 0
          push(
            line.id,
            'svc',
            'charge',
            dup ? 'Calls the processor — it recognizes the key, no new charge' : 'Processor charges the card',
            dup
              ? 'Same idempotency key as last time. The bookkeeping row above never gated this call — the processor itself is what refuses to charge twice.'
              : 'Money moves, tagged with this idempotency key at the processor itself. That tag, not the row above, is what keeps a retry safe.',
            (st) => {
              const result = callIdempotentProcessor(st)
              setLocal('result', `{ id: '${result.id}', amount: '${result.amount}' }`)
            },
          )
        } else if (line.id === 'w4') {
          push(line.id, 'svc', 'record', 'Writes the result locally — for reporting, not for safety', 'Same line as mode 3. Delete this table and the pattern is still correct; you would just lose a local audit trail.', (st) => {
            const last = st.processorCharges[st.processorCharges.length - 1]
            st.idem = { status: 'done', response: last }
            st.charges.push(last)
          })
        } else if (line.id === 'w5') {
          push(line.id, 'svc', 'return', 'Service returns the result', 'If this reaches the client, it stops retrying. If it does not, a retry is just as safe as the first try.')
        }
      }
      if (!crashedHere) {
        resolved = true
        push(null, 'client', 'done', 'Client receives a response', 'The request is done, from the client\'s point of view.', (st) => {
          st.resolved = true
        })
      } else {
        push(null, 'client', 'retry', 'Client never hears back — retries', 'Same request, same Idempotency-Key, sent again — safe to repeat end-to-end, no matter where the last attempt died.')
      }
    }
  }

  push(null, 'system', 'end', 'Run finished', verdictText(s))

  return steps
}

export const DEFAULT_CRASH: Record<Mode, string> = { nokey: 'x4', checkthenact: 'y5', atomic: 'z5', propagated: 'w4' }

export type Experiment = { label: string; title: string; mode: Mode; crash: string }

export const EXPERIMENTS: Experiment[] = [
  { label: 'Double charge, no key', title: 'Everything succeeded. The client just never heard back — and without a key, a retry looks identical to a brand-new charge.', mode: 'nokey', crash: 'x4' },
  { label: 'Key written too late', title: 'The charge went through, but the key was never recorded before the response was lost. The retry finds nothing and charges again.', mode: 'checkthenact', crash: 'y5' },
  { label: 'Key written just in time', title: 'The key was recorded before the response was lost this time. The retry finds it and returns the cached result — no second charge.', mode: 'checkthenact', crash: 'y6' },
  { label: 'Exactly one charge, stuck response', title: 'The unique constraint guarantees only one charge. But the response was never recorded, so the retry waits for an answer that will never come.', mode: 'atomic', crash: 'z5' },
  { label: 'Fully safe retry', title: 'Both the charge and the response are durably recorded before the client finds out. The retry returns the exact same result.', mode: 'atomic', crash: 'z6' },
  { label: 'Claimed but never charged', title: 'The claim exists, but the charge itself never ran. Any retry just waits for a result that will never come.', mode: 'atomic', crash: 'z4' },
  { label: 'No more stuck retries', title: "The processor already charged the card — but the local record was never written. There is nothing to wait for: the retry just calls the processor again and gets the same result back.", mode: 'propagated', crash: 'w4' },
  { label: 'Safe no matter where it dies', title: 'Everything already happened and was recorded. Only the delivery was lost — and the retry is exactly as safe as every other crash point in this mode.', mode: 'propagated', crash: 'w5' },
]
