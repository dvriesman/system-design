// Part 1 of the sharding page: the question "which shard owns this account?", with nothing moving yet.
export type Placement = 'range' | 'mod' | 'ring' | 'vnode'
export type Shard = 'A' | 'B' | 'C'

export const RING_SIZE = 1000
const HASH_SALT = 'ledger-238847:'

// FNV-1a over the key, then a standard bit-mixing finalizer. Without the finalizer, consecutive IDs
// produce an arithmetic pattern, which is exactly what a hash is supposed to prevent.
function hash32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

// Real hashes return huge numbers. Reducing to 0-999 keeps the arithmetic readable on screen.
export const hashOf = (id: number): number => hash32(`${HASH_SALT}acct-${id}`) % RING_SIZE

export const RING_POS: Record<Shard, number[]> = { A: [140], B: [390], C: [780] }
export const VNODE_POS: Record<Shard, number[]> = {
  A: [40, 380, 710],
  B: [210, 540, 890],
  C: [130, 300, 800],
}

export const shardsAt = (version: number): Shard[] => (version === 1 ? ['A', 'B'] : ['A', 'B', 'C'])

export function ringPoints(placement: Placement, shards: Shard[]): { pos: number; shard: Shard }[] {
  const table = placement === 'vnode' ? VNODE_POS : RING_POS
  return shards.flatMap((shard) => table[shard].map((pos) => ({ pos, shard }))).sort((a, b) => a.pos - b.pos)
}

export function ownerAt(placement: Placement, id: number, version: number): Shard {
  const shards = shardsAt(version)
  if (placement === 'range') {
    if (id <= 4) return 'A'
    if (version === 1) return 'B'
    return id <= 7 ? 'B' : 'C'
  }
  if (placement === 'mod') return shards[hashOf(id) % shards.length]
  const pts = ringPoints(placement, shards)
  return (pts.find((p) => p.pos >= hashOf(id)) ?? pts[0]).shard
}

// Share of the 0-999 hash space each shard owns. Only meaningful for the ring placements.
export function arcShares(placement: Placement, version: number): Partial<Record<Shard, number>> {
  const pts = ringPoints(placement, shardsAt(version))
  const out: Partial<Record<Shard, number>> = {}
  pts.forEach((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length].pos
    const len = (p.pos - prev + RING_SIZE) % RING_SIZE
    out[p.shard] = (out[p.shard] ?? 0) + len
  })
  return out
}

export type TraceLine = { what: string; result: string }

// The owner lookup for one account, one operation per line, as the router would run it.
export function traceOwner(placement: Placement, id: number, version: number): TraceLine[] {
  const owner = ownerAt(placement, id, version)
  const h = hashOf(id)
  if (placement === 'range') {
    const blocks = version === 1 ? 'A: 1 to 4, B: 5 and up' : 'A: 1 to 4, B: 5 to 7, C: 8 and up'
    return [
      { what: 'Read the account number', result: String(id) },
      { what: 'Check the list of ID blocks', result: blocks },
      { what: `${id} falls in the block owned by`, result: `shard ${owner}` },
    ]
  }
  if (placement === 'mod') {
    const shards = shardsAt(version)
    const n = shards.length
    const r = h % n
    return [
      { what: `hash('acct-${id}')`, result: String(h) },
      { what: 'N, the number of shards', result: `${n}  [${shards.join(', ')}]` },
      { what: `${h} % ${n}, the remainder of ${h} ÷ ${n}`, result: `${r}  (${Math.floor(h / n)} × ${n} = ${Math.floor(h / n) * n}, ${r} left over)` },
      { what: `shards[${r}]`, result: `shard ${owner}` },
    ]
  }
  const pts = ringPoints(placement, shardsAt(version))
  const hit = pts.find((p) => p.pos >= h)
  return [
    { what: `hash('acct-${id}')`, result: `${h}, a position on the ring` },
    hit
      ? { what: 'Walk clockwise to the next point', result: `${hit.pos}` }
      : { what: `Walk clockwise: nothing past ${h}, so wrap around 999 to 0`, result: `${pts[0].pos}` },
    { what: 'That point belongs to', result: `shard ${owner}` },
  ]
}

const countBy = (placement: Placement, ids: number[], version: number): Record<Shard, number> => {
  const c: Record<Shard, number> = { A: 0, B: 0, C: 0 }
  for (const id of ids) c[ownerAt(placement, id, version)]++
  return c
}

const skew = (counts: number[]): number => {
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length
  return avg ? Math.max(...counts) / avg : 0
}

export const INITIAL_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
export const NEW_IDS = [11, 12]
export const SKEW_LIMIT = 1.4
export const MOVE_LIMIT = 0.5

export type PlacementStats = {
  before: Record<Shard, number>
  beforeSkew: number
  moved: number[]
  movedFrom: Shard[]
  after: Record<Shard, number>
  afterSkew: number
  newOwners: Shard[]
}

export function placementStats(placement: Placement): PlacementStats {
  const moved = INITIAL_IDS.filter((id) => ownerAt(placement, id, 1) !== ownerAt(placement, id, 2))
  const before = countBy(placement, INITIAL_IDS, 1)
  const after = countBy(placement, [...INITIAL_IDS, ...NEW_IDS], 2)
  return {
    before,
    beforeSkew: skew([before.A, before.B]),
    moved,
    movedFrom: [...new Set(moved.map((id) => ownerAt(placement, id, 1)))].sort(),
    after,
    afterSkew: skew([after.A, after.B, after.C]),
    newOwners: NEW_IDS.map((id) => ownerAt(placement, id, 2)),
  }
}
