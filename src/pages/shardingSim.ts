// Part 3 of the sharding page: moving accounts between shards while deposits keep arriving.
// Placement is settled in Part 1, so this simulation always uses virtual nodes.
import { hashOf, ownerAt as ownerFor, ringPoints, shardsAt, type Shard } from './shardingPlacement'

export type Protocol = 'flip' | 'copy' | 'catchup'
export type Actor = 'router' | 'migrator'

export type CodeLine = {
  id: string
  code: string
  breakable: boolean
}

const OPENING_BALANCE = 1000
const LIVE_DEPOSIT = 250
const STALE_DEPOSIT = 100
export const fmtBal = (n: number) => `$${n.toLocaleString('en-US')}`

const SEEDED = [1, 2, 3, 4, 5, 6, 7, 8]
const OPENED_LIVE = [9, 10]
const TOTAL_AT_RESHARD = SEEDED.length + OPENED_LIVE.length

export const ownerAt = (id: number, version: number): Shard => ownerFor('vnode', id, version)

const LOOKUP = '  val shard = map.ring.nextClockwise(hash(acctId))'

export function routerCode(protocol: Protocol): CodeLine[] {
  const fenced = protocol === 'catchup'
  return [
    { id: 'r1', code: 'fun deposit(acctId, amount) {', breakable: false },
    { id: 'r2', code: LOOKUP, breakable: true },
    fenced
      ? { id: 'r3', code: '  val result = shards[shard].credit(map.version, acctId, amount)', breakable: true }
      : { id: 'r3', code: '  shards[shard].credit(acctId, amount)   // upsert', breakable: true },
    ...(fenced
      ? [
          { id: 'r4', code: '  if (result == STALE_MAP) {', breakable: false },
          { id: 'r4b', code: '    map = fetchLatestMap()', breakable: false },
          { id: 'r4c', code: '    return deposit(acctId, amount)', breakable: false },
          { id: 'r4d', code: '  }', breakable: false },
        ]
      : []),
    { id: 'r5', code: '}', breakable: false },
    { id: 'q1', code: 'fun balance(acctId) {', breakable: false },
    { id: 'q2', code: LOOKUP, breakable: true },
    { id: 'q3', code: '  return shards[shard].get(acctId)', breakable: true },
    { id: 'q4', code: '}', breakable: false },
  ]
}

const M = {
  open: { id: 'm1', code: 'fun reshard(newMap) {', breakable: false },
  plan: { id: 'm_plan', code: '  val moves = savePlan(ownerChanges(map, newMap))', breakable: true },
  cursor: { id: 'm_cur', code: '  val cursor = changelog.position()   // capture on', breakable: true },
  loop: { id: 'm3', code: '  for (key in moves) {', breakable: false },
  get: { id: 'm_get', code: '    val row = oldOwner(key).get(key)', breakable: true },
  put: { id: 'm_put', code: '    newOwner(key).put(key, row)', breakable: true },
  endLoop: { id: 'm6', code: '  }', breakable: false },
  fence: { id: 'm_fen', code: '  fence(moves)   // old owners refuse writes', breakable: true },
  replay: { id: 'm_rep', code: '  changelog.replay(cursor)   // copy missed these', breakable: true },
  publish: { id: 'm_pub', code: '  routers.publish(newMap)   // the flip', breakable: true },
  del: { id: 'm_del', code: '  for (key in moves) oldOwner(key).delete(key)', breakable: true },
  close: { id: 'm9', code: '}', breakable: false },
}

export const MIGRATOR_CODE: Record<Protocol, CodeLine[]> = {
  flip: [M.open, M.plan, M.publish, M.loop, M.get, M.put, M.endLoop, M.del, M.close],
  copy: [M.open, M.plan, M.loop, M.get, M.put, M.endLoop, M.publish, M.del, M.close],
  catchup: [M.open, M.plan, M.cursor, M.loop, M.get, M.put, M.endLoop, M.fence, M.replay, M.publish, M.del, M.close],
}

export function lineNo(lines: CodeLine[], id: string): number {
  return lines.findIndex((l) => l.id === id) + 1
}

type LogEntry = { actor: Actor | 'crash' | 'system'; text: string }
export type Row = { id: number; bal: number }
export type PlanEntry = { key: number; from: Shard; to: Shard; status: 'queued' | 'copied' | 'removed' }
export type ChangeEntry = { pos: number; key: number; bal: number; applied: boolean }

export type SimState = {
  shards: Record<Shard, Row[]>
  cJoined: boolean
  mapVersion: 1 | 2
  plan: PlanEntry[]
  fenced: number[]
  capturing: boolean
  changelog: ChangeEntry[]
  acked: Record<number, number>
  worker: 'idle' | 'running' | 'down'
  crashes: number
  peakUnreadable: number
  peakWrong: number
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
  tag: string
  focus: number | null
}

export function unreadable(s: SimState): number[] {
  return Object.keys(s.acked)
    .map(Number)
    .filter((id) => !s.shards[ownerAt(id, s.mapVersion)].some((r) => r.id === id))
}

export function wrongBalance(s: SimState): number[] {
  return Object.keys(s.acked)
    .map(Number)
    .filter((id) => {
      const row = s.shards[ownerAt(id, s.mapVersion)].find((r) => r.id === id)
      return row !== undefined && row.bal !== s.acked[id]
    })
}

function extraCopies(s: SimState): number[] {
  const seen = new Map<number, number>()
  for (const sh of ['A', 'B', 'C'] as Shard[]) for (const r of s.shards[sh]) seen.set(r.id, (seen.get(r.id) ?? 0) + 1)
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id)
}

export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']

export function checks(s: SimState): CheckResult[] {
  const nowGone = unreadable(s).length
  const nowWrong = wrongBalance(s).length
  return [
    [
      'No lost reads',
      `Every account has a row on the shard the published map names. Unreadable now: ${nowGone}, worst so far: ${s.peakUnreadable}`,
      s.peakUnreadable > 0 ? 'bad' : 'ok',
    ],
    [
      'No acknowledged deposit lost',
      `The owner's balance matches what clients were told. Wrong now: ${nowWrong}, worst so far: ${s.peakWrong}`,
      s.peakWrong > 0 ? 'bad' : 'ok',
    ],
    [
      'One copy once settled',
      `After the migration finishes, each account lives on exactly one shard. Extra copies now: ${extraCopies(s).length}`,
      !s.settled ? 'wait' : extraCopies(s).length ? 'bad' : 'ok',
    ],
  ]
}

export function verdictText(s: SimState): string {
  const parts: string[] = []
  if (s.peakUnreadable > 0) {
    parts.push(`Up to ${s.peakUnreadable} account(s) were unreadable while routers pointed at a shard that didn't have their rows yet.`)
  }
  const wrong = wrongBalance(s).length
  if (wrong > 0) {
    parts.push(`${wrong} account(s) permanently lost a deposit the client was told succeeded.`)
  }
  const crashNote = s.crashes ? ' The crash cost time, not data: the process restarted and picked up where it left off.' : ''
  if (!parts.length) {
    return `Consistent: every account stayed readable and every acknowledged deposit survived the move.${crashNote}`
  }
  return `${parts.join(' ')}${crashNote}`
}

export function introText(protocol: Protocol): string {
  const move: Record<Protocol, string> = {
    flip: 'When shard C joins, routers switch to the new map first and the data follows.',
    copy: 'When shard C joins, the data is copied first and routers switch afterwards.',
    catchup: 'When shard C joins, the copy also captures concurrent writes, and old owners refuse writes before routers switch.',
  }
  return `Eight accounts are already live on shards A and B under map v1. ${move[protocol]} Press Step, or click a gutter dot to choose where a process dies.`
}

function routeExplain(id: number, shard: Shard, version: number): string {
  const pts = ringPoints('vnode', shardsAt(version))
  const h = hashOf(id)
  const hit = pts.find((p) => p.pos >= h)
  return hit
    ? `hash(acct-${id}) = ${h}. The next point clockwise in map v${version} is ${hit.pos}, owned by shard ${shard}.`
    : `hash(acct-${id}) = ${h}. Nothing lies past it, so the lookup wraps to the first point, ${pts[0].pos}, owned by shard ${shard}.`
}

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

function upsert(rows: Row[], id: number, bal: number) {
  const row = rows.find((r) => r.id === id)
  if (row) row.bal = bal
  else rows.push({ id, bal })
}

export function build(protocol: Protocol, crashId: string | null): Step[] {
  const s: SimState = {
    shards: { A: [], B: [], C: [] },
    cJoined: false,
    mapVersion: 1,
    plan: [],
    fenced: [],
    capturing: false,
    changelog: [],
    acked: {},
    worker: 'idle',
    crashes: 0,
    peakUnreadable: 0,
    peakWrong: 0,
    settled: false,
    log: [],
  }
  for (const id of SEEDED) {
    s.shards[ownerAt(id, 1)].push({ id, bal: OPENING_BALANCE })
    s.acked[id] = OPENING_BALANCE
  }

  let locals: Record<string, string> = {}
  let focus: number | null = null
  const steps: Step[] = [
    { s: clone(s), line: null, actor: null, label: 'start', title: 'Ready', text: introText(protocol), crash: false, locals: {}, tag: '', focus: null },
  ]
  let crashed = false
  const willCrash = (id: string) => {
    if (!crashed && crashId === id) {
      crashed = true
      return true
    }
    return false
  }
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }
  const push = (
    line: string | null,
    actor: Actor | 'system',
    label: string,
    title: string,
    text: string | null,
    tag: string,
    fn?: (st: SimState) => void,
    isCrash = false,
  ) => {
    if (fn) fn(s)
    s.peakUnreadable = Math.max(s.peakUnreadable, unreadable(s).length)
    s.peakWrong = Math.max(s.peakWrong, wrongBalance(s).length)
    s.log.push({ actor: isCrash ? 'crash' : actor, text: `[${actor}] ${title}` })
    steps.push({ s: clone(s), line, actor, label, title, text, crash: isCrash, locals: { ...locals }, tag, focus })
  }

  const routerCrash = (line: string, id: number, what: string, tag: string) => {
    push(line, 'router', 'CRASH', `Router killed on acct-${id}`, what, tag, (st) => {
      st.crashes++
    }, true)
    locals = {}
    push(null, 'system', 'retry', 'Client gets no answer and retries on another router', 'Same request, a fresh router process, new local variables.', tag)
  }

  type DepositOpts = {
    stale?: boolean
    explain: (shard: Shard) => string
    title: (shard: Shard) => string
  }
  const deposit = (id: number, amount: number, tag: string, opts: DepositOpts) => {
    focus = id
    let version: number = opts.stale ? 1 : s.mapVersion
    for (;;) {
      locals = { acctId: `'acct-${id}'`, amount: fmtBal(amount), 'map.version': `v${version}` }
      if (willCrash('r2')) {
        routerCrash('r2', id, 'No shard was chosen and nothing was written, so retrying this request is safe.', tag)
        continue
      }
      const shard = ownerAt(id, version)
      setLocal('hash(acctId)', String(hashOf(id)))
      setLocal('shard', `'${shard}'`)
      push('r2', 'router', 'route', `Router picks shard ${shard} for acct-${id}`, routeExplain(id, shard, version), tag)
      if (willCrash('r3')) {
        routerCrash('r3', id, `Shard ${shard} was chosen, but the write never reached it, so retrying is safe. A crash after the shard applies the write is a different problem: the client can't tell whether it landed. That one needs an idempotency key, not a sharding fix.`, tag)
        continue
      }
      const from = s.plan.find((p) => p.key === id)?.from
      if (protocol === 'catchup' && s.fenced.includes(id) && shard === from) {
        setLocal('result', 'STALE_MAP')
        push('r3', 'router', 'refused', `Shard ${shard} refuses the write: STALE_MAP`, `acct-${id} is fenced on shard ${shard}, so the write is rejected before anything changes and no deposit is acknowledged. This refusal is the difference from "Copy, then flip", where this exact write was accepted and then lost.`, tag)
        version = s.mapVersion
        push('r4', 'router', 'check', 'Result is STALE_MAP: condition is true', 'The shard is saying this router has an out-of-date map, so the router needs a new one.', tag)
        push('r4b', 'router', 'refresh', `Fetches the latest map: v${version}`, `This router now knows about shard C, and the next lookup will use map v${version}.`, tag, () => {
          setLocal('map.version', `v${version}`)
        })
        push('r4c', 'router', 'retry', 'Retries the same deposit', "The refused write never applied, so sending it again can't double-credit.", tag)
        continue
      }
      const existingBal = s.shards[shard].find((r) => r.id === id)?.bal ?? 0
      const text = opts.explain(shard)
      push('r3', 'router', 'credit', opts.title(shard), text, tag, (st) => {
        const next = existingBal + amount
        upsert(st.shards[shard], id, next)
        st.acked[id] = (st.acked[id] ?? 0) + amount
        if (st.capturing && from === shard) {
          st.changelog.push({ pos: st.changelog.length + 1, key: id, bal: next, applied: false })
        }
        if (protocol === 'catchup') setLocal('result', 'OK')
      })
      if (protocol === 'catchup') {
        push('r4', 'router', 'check', 'Result is OK: condition is false', 'The shard accepted this write, so there is nothing to refresh.', tag)
      }
      return
    }
  }

  const readBalance = (id: number, tag: string, explain: (shard: Shard, bal: number | null) => string) => {
    focus = id
    for (;;) {
      const version = s.mapVersion
      locals = { acctId: `'acct-${id}'`, 'map.version': `v${version}` }
      if (willCrash('q2')) {
        routerCrash('q2', id, 'A read changes nothing, so losing one mid-flight is always safe to retry.', tag)
        continue
      }
      const shard = ownerAt(id, version)
      setLocal('hash(acctId)', String(hashOf(id)))
      setLocal('shard', `'${shard}'`)
      push('q2', 'router', 'route', `Reader picks shard ${shard} for acct-${id}`, routeExplain(id, shard, version), tag)
      if (willCrash('q3')) {
        routerCrash('q3', id, 'A read changes nothing, so losing one mid-flight is always safe to retry.', tag)
        continue
      }
      const row = s.shards[shard].find((r) => r.id === id)
      const bal = row ? row.bal : null
      setLocal('returned', bal === null ? 'null' : fmtBal(bal))
      push('q3', 'router', 'read', bal === null ? `Shard ${shard} returns nothing for acct-${id}` : `Shard ${shard} returns ${fmtBal(bal)} for acct-${id}`, explain(shard, bal), tag)
      return
    }
  }

  // ---- Phase 1: two more accounts open under map v1, through the real router path.
  OPENED_LIVE.forEach((id, i) => {
    deposit(id, OPENING_BALANCE, `opening ${i + 1}/${OPENED_LIVE.length}`, {
      title: (shard) => `Opens acct-${id} on shard ${shard}`,
      explain: (shard) => `credit is an upsert, so with no row there yet it creates one on shard ${shard} holding ${fmtBal(OPENING_BALANCE)}.`,
    })
  })

  // ---- Phase 2: shard C exists, but no router knows about it yet.
  focus = null
  locals = {}
  push(null, 'system', 'join', 'Shard C is provisioned', 'Growth forced a third shard. It is empty, and the published map is still v1, so no traffic reaches it yet. Moving data onto it is the next problem.', 'reshard', (st) => {
    st.cJoined = true
  })

  const moves = Array.from({ length: TOTAL_AT_RESHARD }, (_, i) => i + 1).filter((id) => ownerAt(id, 1) !== ownerAt(id, 2))
  const fromOf = (key: number) => ownerAt(key, 1)
  const toOf = (key: number) => ownerAt(key, 2)
  const movesStr = `[${moves.map((m) => `acct-${m}`).join(', ')}]`

  let workerBase: Record<string, string> = { newMap: 'v2' }
  let planSaved = false

  const killWorker = (line: string, what: string, tag: string) => {
    push(line, 'migrator', 'CRASH', 'Migration worker killed', what, tag, (st) => {
      st.worker = 'down'
      st.crashes++
    }, true)
    focus = null
    const reload = planSaved
      ? s.mapVersion === 2
        ? 'It reloads the saved plan. That matters here: recomputing ownerChanges(map, newMap) now would return nothing, because the map already flipped, and whatever is left on the old owners would be stranded forever.'
        : 'It reloads the saved plan and re-runs the unfinished work. Rewriting a row that was already copied is harmless, because put replaces the row with the same image.'
      : 'No plan was saved before the crash, so it simply starts over from the top.'
    locals = { ...workerBase }
    push(null, 'system', 'restart', 'Worker restarts', `Its local variables died with it. ${reload}`, tag, (st) => {
      st.worker = 'running'
    })
  }

  // Live traffic is a different process from the worker. Its locals must not clobber the worker's.
  const traffic = (fn: () => void) => {
    const saved = locals
    fn()
    locals = saved
    focus = null
  }

  locals = { ...workerBase }
  if (willCrash('m_plan')) {
    killWorker('m_plan', 'Nothing has moved and the map is still v1, so the system behaves exactly as it did before shard C existed.', 'reshard')
  }
  workerBase = { ...workerBase, moves: movesStr }
  planSaved = true
  push(
    'm_plan',
    'migrator',
    'plan',
    `Plan: ${moves.length} of ${TOTAL_AT_RESHARD} accounts change owner`,
    'This is the number Part 1 was about: the placement decides how many accounts must move. The plan is saved durably, so a restart can resume it. Moving them safely is the rest of this run.',
    'reshard',
    (st) => {
      st.worker = 'running'
      st.plan = moves.map((key) => ({ key, from: fromOf(key), to: toOf(key), status: 'queued' as const }))
      locals = { ...workerBase }
    },
  )

  const publish = () => {
    if (willCrash('m_pub')) {
      const what =
        protocol === 'flip'
          ? 'The map is still v1 and every row is still on its old owner, so nothing is broken yet.'
          : protocol === 'copy'
            ? 'The map is still v1, so reads stay correct, but the crash widens the window: every deposit accepted while the worker is down lands only on old owners.'
            : 'The keys are fenced but the map has not flipped, so writes to them are refused until the worker returns. The data is safe, but those accounts cannot take deposits, which is why real fences carry a lease.'
      killWorker('m_pub', what, 'flip')
    }
    push(
      'm_pub',
      'migrator',
      'flip',
      'Routers switch to map v2',
      protocol === 'flip'
        ? `From this instant routers send ${moves.length} accounts to shards that don't have their rows yet. Nothing has been copied. Watch "No lost reads".`
        : protocol === 'copy'
          ? 'Readers now go to the new owners, which hold whatever the copy saw. Any deposit that landed on an old owner after its key was copied is now invisible. Watch "No acknowledged deposit lost".'
          : 'Readers now go to the new owners, which hold the copy plus every captured write. Routers that have not heard yet are stopped by the fence.',
      'flip',
      (st) => {
        st.mapVersion = 2
      },
    )
  }

  const copyLoop = (afterCopy: (i: number) => void) => {
    moves.forEach((key, i) => {
      const tag = `copy ${i + 1}/${moves.length}`
      const from = fromOf(key)
      const to = toOf(key)
      for (;;) {
        focus = key
        locals = { ...workerBase, key: `acct-${key}`, 'oldOwner(key)': `'${from}'`, 'newOwner(key)': `'${to}'` }
        if (willCrash('m_get')) {
          killWorker('m_get', `acct-${key} hasn't been read yet. Its row is untouched on shard ${from}.`, tag)
          continue
        }
        const bal = s.shards[from].find((r) => r.id === key)?.bal ?? 0
        setLocal('row', `{ id: ${key}, bal: ${fmtBal(bal)} }`)
        push('m_get', 'migrator', 'read', `Reads acct-${key} from shard ${from}`, "This is a snapshot of the row at this instant. Any later deposit won't be in it.", tag)
        if (willCrash('m_put')) {
          killWorker(
            'm_put',
            s.shards[to].some((r) => r.id === key)
              ? `The read only lived in memory, so the snapshot is gone. Shard ${to} still holds the row the earlier upsert created, and the restart will read the old owner again.`
              : `The read only lived in memory, so the snapshot is gone. Shard ${to} has nothing for acct-${key}, and the restart will read it again.`,
            tag,
          )
          continue
        }
        const existing = s.shards[to].find((r) => r.id === key)
        push(
          'm_put',
          'migrator',
          'copy',
          existing ? `Overwrites acct-${key} on shard ${to}` : `Copies acct-${key} to shard ${to}`,
          existing
            ? `Shard ${to} already had a row for this account, holding ${fmtBal(existing.bal)} from a deposit that arrived before the copy. put replaces it with the snapshot of ${fmtBal(bal)}, and that deposit is gone.`
            : `acct-${key} now exists on both shards. Which copy is live depends only on the published map, currently v${s.mapVersion}.`,
          tag,
          (st) => {
            upsert(st.shards[to], key, bal)
            const p = st.plan.find((e) => e.key === key)
            if (p) p.status = 'copied'
          },
        )
        break
      }
      afterCopy(i)
    })
    focus = null
    locals = { ...workerBase }
  }

  const liveKey = moves[0]
  const staleKey = moves[1]
  const readKey = moves[moves.length - 1]

  const staleDeposit = (tag: string) => {
    traffic(() => {
      deposit(staleKey, STALE_DEPOSIT, tag, {
        stale: true,
        title: (shard) =>
          protocol === 'catchup' ? `Router, now on map v2, credits ${fmtBal(STALE_DEPOSIT)} on shard ${shard}` : `Stale router credits ${fmtBal(STALE_DEPOSIT)} on shard ${shard}`,
        explain: (shard) =>
          protocol === 'catchup'
            ? `The retry goes to the live owner, shard ${shard}. The deposit lands exactly once, in the row everyone reads.`
            : `This router hasn't received map v2, because a publish never reaches every process at the same instant. Shard ${shard} has no reason to refuse, so it accepts and the client gets a success. But shard ${shard}'s row is no longer the one anybody reads.`,
      })
    })
  }

  const deleteLoop = () => {
    moves.forEach((key, i) => {
      const tag = `delete ${i + 1}/${moves.length}`
      const from = fromOf(key)
      const to = toOf(key)
      focus = key
      locals = { ...workerBase, key: `acct-${key}`, 'oldOwner(key)': `'${from}'` }
      if (willCrash('m_del')) {
        killWorker('m_del', `Routers already use map v2, so reads are unaffected. Shard ${from} just keeps an old copy until the restart finishes the cleanup.`, tag)
        focus = key
        locals = { ...workerBase, key: `acct-${key}`, 'oldOwner(key)': `'${from}'` }
      }
      const oldBal = s.shards[from].find((r) => r.id === key)?.bal
      const newBal = s.shards[to].find((r) => r.id === key)?.bal
      const diverged = oldBal !== undefined && newBal !== undefined && oldBal !== newBal
      push(
        'm_del',
        'migrator',
        'delete',
        `Deletes acct-${key} from shard ${from}`,
        diverged
          ? `The old copy held ${fmtBal(oldBal)} but the live copy holds ${fmtBal(newBal)}. This delete destroys the only record of that difference, so the loss can no longer be repaired from the shards.`
          : 'The old copy matched the live one, so this only reclaims space.',
        tag,
        (st) => {
          st.shards[from] = st.shards[from].filter((r) => r.id !== key)
          const p = st.plan.find((e) => e.key === key)
          if (p) p.status = 'removed'
          if (i === moves.length - 1) {
            st.settled = true
            st.worker = 'idle'
          }
        },
      )
    })
    focus = null
    locals = {}
  }

  // ---- Phase 3: the move itself. Same traffic in every protocol; what differs is what it runs into.
  if (protocol === 'flip') {
    publish()
    traffic(() => {
      readBalance(readKey, 'live read', (shard) =>
        `The map says shard ${shard}, but the row is still on shard ${fromOf(readKey)} because the copy hasn't started. The customer's account appears to be gone.`,
      )
    })
    traffic(() => {
      deposit(liveKey, LIVE_DEPOSIT, 'live write', {
        title: (shard) => `Credits ${fmtBal(LIVE_DEPOSIT)} on shard ${shard}`,
        explain: (shard) =>
          `Shard ${shard} has no row yet, so the upsert creates one holding only ${fmtBal(LIVE_DEPOSIT)}, and the client is told it succeeded. Their real ${fmtBal(OPENING_BALANCE)} is still on shard ${fromOf(liveKey)}, and the balance customers now see is wrong.`,
      })
    })
    copyLoop((i) => {
      if (i === 1) staleDeposit('stale router')
    })
  } else {
    if (protocol === 'catchup') {
      if (willCrash('m_cur')) {
        killWorker('m_cur', 'No cursor was taken and no copying has started. Nothing depends on this run yet.', 'reshard')
      }
      workerBase = { ...workerBase, cursor: 'pos 0' }
      push('m_cur', 'migrator', 'cursor', 'Marks the changelog position', 'This has to happen before the first row is read. A write after this point is captured even if the copy already passed its row. The cursor is saved with the plan, so a restart keeps it.', 'reshard', (st) => {
        st.capturing = true
        locals = { ...workerBase }
      })
    }
    copyLoop((i) => {
      if (i !== 0) return
      traffic(() => {
        readBalance(readKey, 'live read', (shard, bal) =>
          `Map v1 still says shard ${shard}, which still has the row, so this returns the correct ${fmtBal(bal ?? 0)}. Reads are fine during the copy.`,
        )
      })
      traffic(() => {
        deposit(liveKey, LIVE_DEPOSIT, 'live write', {
          title: (shard) => `Credits ${fmtBal(LIVE_DEPOSIT)} on shard ${shard}`,
          explain: (shard) =>
            protocol === 'copy'
              ? `Shard ${shard} is still the owner, so this is accepted and correct for now. But the copy already passed acct-${liveKey}, so shard ${toOf(liveKey)} still says ${fmtBal(OPENING_BALANCE)}, and nothing here will carry the deposit across.`
              : `Shard ${shard} is still the owner, so this is accepted. The copy already passed acct-${liveKey}, but the write is after the cursor, so the changelog records it.`,
        })
      })
    })
    if (protocol === 'catchup') {
      if (willCrash('m_fen')) {
        killWorker('m_fen', 'Writes are still flowing to the old owners and the changelog is still capturing them. Nothing is lost.', 'cutover')
      }
      push('m_fen', 'migrator', 'fence', `Fences ${moves.length} keys on their old owners`, 'Old owners now refuse writes to these keys, so the changelog can stop growing and the replay can finish. This is the price: those accounts cannot take deposits until the flip. Real tools replay in a loop first, then fence only once the backlog is tiny, which keeps the pause to milliseconds.', 'cutover', (st) => {
        st.fenced = [...moves]
      })
      if (willCrash('m_rep')) {
        killWorker('m_rep', 'The keys are fenced and the replay did not run, so deposits to them are refused until the restart. No data is at risk, because the changelog and cursor are durable.', 'cutover')
      }
      const pendingCount = s.changelog.filter((c) => !c.applied).length
      push(
        'm_rep',
        'migrator',
        'replay',
        pendingCount ? `Replays ${pendingCount} captured write(s) onto the new owners` : 'Replays the changelog: nothing was captured',
        pendingCount
          ? "Each entry is a full row image, not a delta, so replaying one twice after a crash can't double-credit. The new owner now has the deposit the copy missed."
          : 'No write landed during the copy, so the new owners already match.',
        'cutover',
        (st) => {
          for (const entry of st.changelog) {
            if (entry.applied) continue
            const p = st.plan.find((e) => e.key === entry.key)
            if (p) upsert(st.shards[p.to], entry.key, entry.bal)
            entry.applied = true
          }
        },
      )
    }
    publish()
    staleDeposit('stale router')
  }

  deleteLoop()

  // ---- Phase 4: the customer who made a deposit mid-move checks their balance.
  const expected = OPENING_BALANCE + LIVE_DEPOSIT
  readBalance(liveKey, 'audit read', (shard, bal) =>
    bal === expected
      ? `The client was told their ${fmtBal(LIVE_DEPOSIT)} deposit succeeded, and shard ${shard} shows the expected ${fmtBal(expected)}.`
      : `The client was told their ${fmtBal(LIVE_DEPOSIT)} deposit succeeded, so the balance should be ${fmtBal(expected)}. Shard ${shard} says ${fmtBal(bal ?? 0)}. In a ledger, that is an incident.`,
  )

  focus = null
  locals = {}
  push(null, 'system', 'end', 'Run finished', verdictText(s), '')
  return steps
}

export type Experiment = { label: string; title: string; protocol: Protocol; crash: string | null }

export const EXPERIMENTS: Experiment[] = [
  {
    label: 'Flip first: accounts vanish',
    title: 'Routers switch before the data exists there, so reads return nothing and an upsert creates a wrong balance.',
    protocol: 'flip',
    crash: null,
  },
  {
    label: 'Copy, then flip: silent loss',
    title: 'The textbook order. Reads never break, and every step looks fine, yet two acknowledged deposits disappear. No crash required.',
    protocol: 'copy',
    crash: null,
  },
  {
    label: 'The full answer',
    title: 'The same deposits arrive at the same moments. One is captured and replayed, the other is refused and retried, and both survive.',
    protocol: 'catchup',
    crash: null,
  },
  {
    label: 'Die while fenced',
    title: 'The worker is killed at the worst moment: keys fenced, nothing flipped. Deposits to those keys pause during the outage, and nothing is lost after the restart.',
    protocol: 'catchup',
    crash: 'm_rep',
  },
  {
    label: 'Die during cleanup',
    title: 'The map already flipped, so recomputing the plan would find nothing to do. The saved plan is what lets the restart finish the deletes.',
    protocol: 'catchup',
    crash: 'm_del',
  },
]
