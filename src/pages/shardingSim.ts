export type Mode = 'range' | 'hash' | 'consistent' | 'vnode'
export type Actor = 'router' | 'migrator'
export type Shard = 'A' | 'B' | 'C'

export type CodeLine = {
  id: string
  code: string
  breakable: boolean
}

const BAL = 1000
const fmtBal = (n: number) => `$${n.toLocaleString()}`

// A fixed, deterministic "hash of the account id" table — stands in for a real hash function so
// the numbers are reproducible and legible, while mod/ring math below is computed for real.
const HASH: Record<number, number> = {
  1: 733, 2: 104, 3: 988, 4: 452, 5: 317, 6: 841, 7: 29, 8: 566, 9: 690, 10: 178, 11: 905, 12: 340,
}

const RING_POS: Record<Shard, number> = { A: 200, B: 600, C: 850 }
const VNODE_POS: Record<Shard, number[]> = {
  A: [150, 500, 870],
  B: [350, 700, 950],
  C: [250, 620, 920],
}

function rangeAssign(id: number, shardCount: 2 | 3): Shard {
  if (id <= 4) return 'A'
  if (shardCount === 2) return 'B'
  return id <= 7 ? 'B' : 'C'
}
function hashAssign(id: number, shards: Shard[]): Shard {
  return shards[HASH[id] % shards.length]
}
function ringAssign(id: number, shards: Shard[]): Shard {
  const pts = shards.map((s) => ({ s, pos: RING_POS[s] })).sort((a, b) => a.pos - b.pos)
  const h = HASH[id]
  return (pts.find((p) => p.pos >= h) ?? pts[0]).s
}
function vnodeAssign(id: number, shards: Shard[]): Shard {
  const pts = shards.flatMap((s) => VNODE_POS[s].map((pos) => ({ s, pos }))).sort((a, b) => a.pos - b.pos)
  const h = HASH[id]
  return (pts.find((p) => p.pos >= h) ?? pts[0]).s
}
export function assign(mode: Mode, id: number, shards: Shard[]): Shard {
  if (mode === 'range') return rangeAssign(id, shards.length as 2 | 3)
  if (mode === 'hash') return hashAssign(id, shards)
  if (mode === 'consistent') return ringAssign(id, shards)
  return vnodeAssign(id, shards)
}

const PRE_RESHARD = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const LATE_GROWTH = [11, 12]

export const ROUTER_CODE: Record<Mode, CodeLine[]> = {
  range: [
    { id: 'rt1', code: 'fun write(acctId, amount) {', breakable: false },
    { id: 'rt2', code: '  val shard = rangeMap.lookup(acctId)   // which contiguous block owns this id?', breakable: true },
    { id: 'rt3', code: '  shards[shard].insert(acctId, amount)', breakable: true },
    { id: 'rt4', code: '}', breakable: false },
  ],
  hash: [
    { id: 'rt1', code: 'fun write(acctId, amount) {', breakable: false },
    { id: 'rt2', code: '  val shard = shardList[hash(acctId) % shardList.size]', breakable: true },
    { id: 'rt3', code: '  shards[shard].insert(acctId, amount)', breakable: true },
    { id: 'rt4', code: '}', breakable: false },
  ],
  consistent: [
    { id: 'rt1', code: 'fun write(acctId, amount) {', breakable: false },
    { id: 'rt2', code: '  val shard = ring.nextClockwise(hash(acctId))', breakable: true },
    { id: 'rt3', code: '  shards[shard].insert(acctId, amount)', breakable: true },
    { id: 'rt4', code: '}', breakable: false },
  ],
  vnode: [
    { id: 'rt1', code: 'fun write(acctId, amount) {', breakable: false },
    { id: 'rt2', code: '  val shard = ring.nextClockwise(hash(acctId))   // same ring lookup — just more points on it', breakable: true },
    { id: 'rt3', code: '  shards[shard].insert(acctId, amount)', breakable: true },
    { id: 'rt4', code: '}', breakable: false },
  ],
}

export const MIGRATOR_CODE: CodeLine[] = [
  { id: 'mg1', code: 'for (key in keysToMove) {', breakable: false },
  { id: 'mg2', code: '  val row = shards[oldShard(key)].get(key)', breakable: true },
  { id: 'mg3', code: '  shards[newShard(key)].put(key, row)', breakable: true },
  { id: 'mg4', code: '  routingTable.update(key, newShard(key))', breakable: true },
  { id: 'mg5', code: '  shards[oldShard(key)].delete(key)', breakable: true },
  { id: 'mg6', code: '}', breakable: false },
]

export function lineNo(lines: CodeLine[], id: string): number {
  return lines.findIndex((l) => l.id === id) + 1
}

type LogEntry = { actor: Actor | 'crash' | 'system'; text: string }

export type SimState = {
  shards: Record<Shard, number[]>
  activeShards: Shard[]
  routing: Partial<Record<number, Shard>>
  migrationQueue: { key: number; status: 'pending' | 'done' }[]
  moveCount: number
  totalPreReshard: number
  preReshardSkew: number | null
  lateGrowthShards: Shard[]
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
}

function residency(s: SimState, id: number): Shard[] {
  return (['A', 'B', 'C'] as Shard[]).filter((sh) => s.activeShards.includes(sh) && s.shards[sh].includes(id))
}

export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']

export function checks(s: SimState, final: boolean): CheckResult[] {
  const routedIds = Object.keys(s.routing).map(Number)
  const lostReads = routedIds.filter((id) => {
    const sh = s.routing[id]
    return !sh || !s.shards[sh].includes(id)
  })
  const dupIds = routedIds.filter((id) => residency(s, id).length > 1)
  const migrationStarted = s.migrationQueue.length > 0
  const migrationSettled = !migrationStarted || s.migrationQueue.every((m) => m.status === 'done') || final
  const moveFrac = s.totalPreReshard ? s.moveCount / s.totalPreReshard : 0
  const lateDone = s.lateGrowthShards.length >= LATE_GROWTH.length

  return [
    ['No lost reads', "Every account's routing entry points at a shard that actually has its row", lostReads.length ? 'bad' : 'ok'],
    [
      'No duplicate left behind',
      'Once migration settles, an account exists on exactly one shard, not two',
      !migrationStarted ? 'ok' : !migrationSettled ? 'wait' : dupIds.length ? 'bad' : 'ok',
    ],
    [
      'Resharding stays proportional',
      `Adding a shard should move a minority of existing keys (moved ${s.moveCount}/${s.totalPreReshard || PRE_RESHARD.length})`,
      moveFrac > 0.5 ? 'bad' : 'ok',
    ],
    [
      'New growth stays spread out',
      'Accounts created after the new shard joins should land on more than one shard',
      !lateDone ? 'wait' : new Set(s.lateGrowthShards).size > 1 ? 'ok' : 'bad',
    ],
    [
      'Shards start out evenly loaded',
      'Before any resharding, no shard should hold meaningfully more than its fair share of the keys',
      s.preReshardSkew === null ? 'wait' : s.preReshardSkew >= 1.3 ? 'bad' : 'ok',
    ],
  ]
}

export function verdictText(s: SimState): string {
  const routedIds = Object.keys(s.routing).map(Number)
  const lostReads = routedIds.filter((id) => {
    const sh = s.routing[id]
    return !sh || !s.shards[sh].includes(id)
  })
  const dupIds = routedIds.filter((id) => residency(s, id).length > 1)
  const moveFrac = s.totalPreReshard ? Math.round((100 * s.moveCount) / s.totalPreReshard) : 0
  const lateSpread = s.lateGrowthShards.length >= LATE_GROWTH.length ? new Set(s.lateGrowthShards).size > 1 : null

  if (lostReads.length) {
    return `Broken: ${lostReads.length} account(s) are routed to a shard that doesn't have their data. A read for those accounts comes back empty even though the money is sitting somewhere else.`
  }
  const parts: string[] = []
  if (dupIds.length) {
    parts.push(`${dupIds.length} account(s) still exist on two shards at once — wasteful, but every read still resolves to the correct, current copy.`)
  }
  if (s.preReshardSkew !== null && s.preReshardSkew >= 1.3) {
    const pct = Math.round((s.preReshardSkew - 1) * 100)
    parts.push(`Even before resharding, the busiest shard held about ${pct}% more than its fair share of the keys.`)
  }
  if (s.totalPreReshard) {
    parts.push(`Adding the new shard required moving ${s.moveCount} of ${s.totalPreReshard} existing accounts (${moveFrac}%).`)
  }
  if (lateSpread === false) {
    parts.push('Growth after the resharding still piled entirely onto one shard — the fix didn\'t fix the actual problem, it just relocated it.')
  } else if (lateSpread === true) {
    parts.push('Growth after the resharding landed on more than one shard — no new hotspot formed.')
  }
  if (!parts.length) return 'Consistent: every account resolves to exactly one shard, with nothing left stranded.'
  return parts.join(' ')
}

export function introText(mode: Mode): string {
  return mode === 'range'
    ? 'Range sharding: each shard owns a contiguous block of account IDs. Press Step, or click a gutter dot to decide exactly where a process dies.'
    : mode === 'hash'
      ? 'Hash sharding: shard = hash(acctId) % N. Fixes the hotspot — watch what happens the moment N changes.'
      : mode === 'consistent'
        ? "Consistent hashing: shards sit on a ring. A key belongs to whichever shard is next clockwise from its hash. Adding a shard should only steal keys from its neighbor."
        : 'Consistent hashing with virtual nodes: the same ring, but each shard holds many points on it instead of one.'
}

export const ACTOR_LABEL: Record<Actor, string> = { router: 'router', migrator: 'migration worker' }

export function build(mode: Mode, crashId: string | null): Step[] {
  const s: SimState = {
    shards: { A: [], B: [], C: [] },
    activeShards: ['A', 'B'],
    routing: {},
    migrationQueue: [],
    moveCount: 0,
    totalPreReshard: PRE_RESHARD.length,
    preReshardSkew: null,
    lateGrowthShards: [],
    log: [],
  }
  let locals: Record<string, string> = {}
  const steps: Step[] = [
    { s: clone(s), line: null, actor: null, label: 'start', title: 'Ready', text: introText(mode), crash: false, locals: {}, tag: '' },
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
    tag: string,
    fn?: (st: SimState) => void,
    isCrash = false,
  ) => {
    if (fn) fn(s)
    s.log.push({ actor: isCrash ? 'crash' : actor, text: `[${actor}] ${title}` })
    steps.push({ s: clone(s), line, actor, label, title, text, crash: isCrash, locals: { ...locals }, tag })
  }

  function createAccount(id: number, idx: number, total: number, phaseTag: string): boolean {
    locals = {}
    if (willCrash('rt2')) {
      push('rt2', 'router', 'CRASH', `Router killed before computing a shard for acct-${id}`, 'Nothing happened yet — no shard was chosen, nothing was written. A retry of this request is completely safe.', `${phaseTag} ${idx}/${total}`, undefined, true)
      return true
    }
    const shard = assign(mode, id, s.activeShards)
    locals = mode === 'range' ? { acctId: `'acct-${id}'`, shard: `'${shard}'` } : { acctId: `'acct-${id}'`, hash: String(HASH[id]), shard: `'${shard}'` }
    push('rt2', 'router', 'route', `Router computes shard = ${shard} for acct-${id}`, routeExplain(mode, id, shard), `${phaseTag} ${idx}/${total}`)
    if (willCrash('rt3')) {
      push('rt3', 'router', 'CRASH', `Router killed before inserting acct-${id}`, "The shard was chosen but the row was never written anywhere. The account doesn't exist yet — this is a lost write, not a misrouted one.", `${phaseTag} ${idx}/${total}`, undefined, true)
      return true
    }
    push('rt3', 'router', 'insert', `Writes acct-${id} to shard ${shard}`, `${fmtBal(BAL)} lands in shard ${shard}'s table.`, `${phaseTag} ${idx}/${total}`, (st) => {
      st.shards[shard].push(id)
      st.routing[id] = shard
    })
    return false
  }

  // Phase 1+2: create accounts 1-10 across shards A, B
  for (let i = 0; i < PRE_RESHARD.length; i++) {
    if (createAccount(PRE_RESHARD[i], i + 1, PRE_RESHARD.length, 'creating')) {
      push(null, 'system', 'end', 'Run finished', verdictText(s), '', undefined)
      return steps
    }
  }

  // snapshot the pre-reshard load skew
  const preCounts = s.activeShards.map((sh) => s.shards[sh].length)
  const preAvg = preCounts.reduce((a, b) => a + b, 0) / preCounts.length
  s.preReshardSkew = preAvg > 0 ? Math.max(...preCounts) / preAvg : 0

  // Phase 3: shard C joins, migration
  const keysToMove = PRE_RESHARD.filter((id) => assign(mode, id, ['A', 'B']) !== assign(mode, id, ['A', 'B', 'C']))
  s.moveCount = keysToMove.length
  s.migrationQueue = keysToMove.map((key) => ({ key, status: 'pending' as const }))
  const moveFrac = Math.round((100 * keysToMove.length) / PRE_RESHARD.length)
  push(
    null,
    'system',
    'join',
    'Shard C joins the cluster',
    keysToMove.length
      ? `Growth forced the operator to add a shard. Under this routing scheme, ${keysToMove.length} of ${PRE_RESHARD.length} existing accounts (${moveFrac}%) now belong on a different shard than the one they're sitting on.`
      : 'Growth forced the operator to add a shard. Under this routing scheme, every existing account already belongs where it already is — nothing needs to move.',
    '',
    (st) => {
      st.activeShards = ['A', 'B', 'C']
    },
  )

  for (const key of keysToMove) {
    locals = {}
    const oldShard = assign(mode, key, ['A', 'B'])
    const newShard = assign(mode, key, ['A', 'B', 'C'])
    const idxInQueue = s.migrationQueue.findIndex((m) => m.key === key)
    const tag = `migration key ${idxInQueue + 1}/${keysToMove.length}`

    if (willCrash('mg2')) {
      push('mg2', 'migrator', 'CRASH', `Migration worker killed before reading acct-${key}`, `Nothing touched for acct-${key} yet. It's still sitting on shard ${oldShard}, routing still points there — safe to retry this key later.`, tag, undefined, true)
      break
    }
    const row = s.shards[oldShard].includes(key) ? BAL : 0
    locals = { key: `${key}`, oldShard: `'${oldShard}'`, newShard: `'${newShard}'` }
    push('mg2', 'migrator', 'read', `Reads acct-${key} off shard ${oldShard}`, `Row fetched: { id: ${key}, bal: ${fmtBal(row)} }. Shard ${oldShard} is still the only copy and still authoritative.`, tag, () => {
      locals = { ...locals, row: `{ id: ${key}, bal: ${fmtBal(row)} }` }
    })

    if (willCrash('mg3')) {
      push('mg3', 'migrator', 'CRASH', `Migration worker killed before writing acct-${key} to shard ${newShard}`, `The read happened but nothing was written to ${newShard}. Routing still points at ${oldShard}, which still has the only copy — no duplicate, no loss.`, tag, undefined, true)
      break
    }
    push('mg3', 'migrator', 'copy', `Copies acct-${key} onto shard ${newShard}`, `Shard ${newShard} now also has a copy. Routing hasn't flipped yet, so readers still go to ${oldShard} — which is still correct, since ${oldShard}'s copy hasn't been touched.`, tag, (st) => {
      st.shards[newShard].push(key)
    })

    if (willCrash('mg4')) {
      push('mg4', 'migrator', 'CRASH', `Migration worker killed before flipping routing for acct-${key}`, `Both shards now hold acct-${key}, but routing still points at ${oldShard} — which still has its copy. Reads are still correct; this just needs to finish on retry.`, tag, undefined, true)
      break
    }
    push('mg4', 'migrator', 'flip', `Flips routing for acct-${key} to shard ${newShard}`, `From this instant, readers are sent to ${newShard} — which already has the data, because the copy above ran first. ${oldShard}'s copy is now stale but still present.`, tag, (st) => {
      st.routing[key] = newShard
    })

    if (willCrash('mg5')) {
      push('mg5', 'migrator', 'CRASH', `Migration worker killed before deleting acct-${key} from shard ${oldShard}`, `Routing already points at ${newShard}, and every read resolves correctly there. Shard ${oldShard} just keeps a harmless, stale duplicate until cleanup finishes.`, tag, undefined, true)
      break
    }
    push('mg5', 'migrator', 'delete', `Deletes acct-${key} from shard ${oldShard}`, `The stale copy is reclaimed. Acct-${key} now exists on exactly one shard again: ${newShard}.`, tag, (st) => {
      st.shards[oldShard] = st.shards[oldShard].filter((id) => id !== key)
      const q = st.migrationQueue.find((m) => m.key === key)
      if (q) q.status = 'done'
    })
  }

  if (crashed) {
    push(null, 'system', 'end', 'Run finished', verdictText(s), '', undefined)
    return steps
  }

  // Phase 4: late growth, after C exists
  for (let i = 0; i < LATE_GROWTH.length; i++) {
    const id = LATE_GROWTH[i]
    const crashedNow = createAccount(id, i + 1, LATE_GROWTH.length, 'new growth')
    if (!crashedNow) {
      const sh = s.routing[id]
      if (sh) s.lateGrowthShards = [...s.lateGrowthShards, sh]
    }
    if (crashedNow) break
  }

  push(null, 'system', 'end', 'Run finished', verdictText(s), '', undefined)
  return steps
}

function routeExplain(mode: Mode, id: number, shard: Shard): string {
  if (mode === 'range') return `acct-${id} falls inside the block of IDs shard ${shard} owns.`
  if (mode === 'hash') return `hash(acct-${id}) = ${HASH[id]}; ${HASH[id]} mod the current shard count points at ${shard}.`
  if (mode === 'consistent') return `hash(acct-${id}) = ${HASH[id]}; walking clockwise from there, the first shard on the ring is ${shard}.`
  return `hash(acct-${id}) = ${HASH[id]}; walking clockwise from there, the first point on the ring belongs to ${shard}.`
}

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

export const DEFAULT_CRASH: Record<Mode, string> = {
  range: 'mg5',
  hash: 'mg5',
  consistent: 'mg5',
  vnode: 'mg5',
}

export type Experiment = { label: string; title: string; mode: Mode; crash: string | null }

export const EXPERIMENTS: Experiment[] = [
  {
    label: 'Sequential growth piles onto one shard',
    title: 'Range mode, full run. New accounts keep incrementing, so every one of them lands on whichever range is still open-ended — and splitting that range just relocates the hotspot, it doesn\'t remove it.',
    mode: 'range',
    crash: null,
  },
  {
    label: 'Resharding storm',
    title: 'Hash mode, full run. Going from 2 shards to 3 changes hash(id) % N for most keys — watch 70% of existing accounts get flagged to move for a change that only added 50% more capacity.',
    mode: 'hash',
    crash: null,
  },
  {
    label: 'A ring can still be lumpy',
    title: 'Consistent hashing, full run. Resharding only moves a minority of keys — but with just a couple of real nodes on the ring, the arcs between them aren\'t equal, so load was uneven from the start.',
    mode: 'consistent',
    crash: null,
  },
  {
    label: 'Virtual nodes: the actual best answer',
    title: 'Consistent hashing + virtual nodes, full run. Same minimal resharding cost as plain consistent hashing, but each shard holds many scattered points, so the load is balanced even with few physical shards.',
    mode: 'vnode',
    crash: null,
  },
  {
    label: 'Crash before the copy finishes',
    title: 'Range mode, migration worker dies right after reading the old row but before writing it to the new shard. Nothing moved — the key is still exactly where it was, no duplicate, safe to retry later.',
    mode: 'range',
    crash: 'mg3',
  },
  {
    label: 'Crash after the copy, before cleanup',
    title: 'Range mode, migration worker dies after routing already points at the new shard but before the old copy is deleted. Every read is still correct — the only cost is a stale, harmless duplicate sitting on the old shard.',
    mode: 'range',
    crash: 'mg5',
  },
]
