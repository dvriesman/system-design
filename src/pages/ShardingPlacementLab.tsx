import { useState } from 'react'
import {
  arcShares,
  hashOf,
  INITIAL_IDS,
  MOVE_LIMIT,
  NEW_IDS,
  ownerAt,
  placementStats,
  RING_SIZE,
  ringPoints,
  shardsAt,
  SKEW_LIMIT,
  traceOwner,
  type Placement,
  type PlacementStats,
  type Shard,
} from './shardingPlacement'

const SCHEMES: { id: Placement; label: string; name: string }[] = [
  { id: 'range', label: '1 · Range', name: 'Range' },
  { id: 'mod', label: '2 · Hash mod N', name: 'Hash mod N' },
  { id: 'ring', label: '3 · Consistent hash', name: 'Consistent hash' },
  { id: 'vnode', label: '4 · Best: + virtual nodes', name: '+ Virtual nodes' },
]
const STAGES: { id: 1 | 2 | 3; label: string }[] = [
  { id: 1, label: 'a · 10 accounts, 2 shards' },
  { id: 2, label: 'b · Add shard C' },
  { id: 3, label: 'c · 2 new accounts open' },
]

const RING_C = 130
const RING_R = 92

function polar(pos: number, r: number): [number, number] {
  const a = (pos / RING_SIZE) * 2 * Math.PI
  return [RING_C + r * Math.sin(a), RING_C - r * Math.cos(a)]
}

export function RingDiagram({
  placement,
  version,
  pendingC = false,
  keys,
  focus,
  gone = [],
}: {
  placement: Placement
  version: number
  pendingC?: boolean
  keys: number[]
  focus: number | null
  gone?: number[]
}) {
  const pts = ringPoints(placement, shardsAt(version))
  const pendingPts = pendingC ? ringPoints(placement, ['C']) : []
  return (
    <svg className="sim-ring" viewBox="0 0 260 260" role="img" aria-label={`Hash ring under map v${version}`}>
      <circle className="track" cx={RING_C} cy={RING_C} r={RING_R} />
      {pts.map((p, i) => {
        const prev = pts[(i - 1 + pts.length) % pts.length].pos
        const len = (p.pos - prev + RING_SIZE) % RING_SIZE
        const [x0, y0] = polar(prev, RING_R)
        const [x1, y1] = polar(p.pos, RING_R)
        return (
          <path
            key={p.pos}
            className={`arc sim-s-${p.shard}`}
            d={`M ${x0} ${y0} A ${RING_R} ${RING_R} 0 ${len > RING_SIZE / 2 ? 1 : 0} 1 ${x1} ${y1}`}
          />
        )
      })}
      {[...pts, ...pendingPts.map((p) => ({ ...p, pending: true }))].map((p) => {
        const [x, y] = polar(p.pos, RING_R)
        const [lx, ly] = polar(p.pos, RING_R + 19)
        return (
          <g key={p.pos} className={`sim-s-${p.shard}`}>
            <circle className={`pt${'pending' in p ? ' pending' : ''}`} cx={x} cy={y} r={6} />
            <text className="ptl" x={lx} y={ly}>
              {p.shard}
            </text>
          </g>
        )
      })}
      {keys.map((id) => {
        const [x, y] = polar(hashOf(id), RING_R - 19)
        const [lx, ly] = polar(hashOf(id), RING_R - 36)
        return (
          <g key={id} className={`sim-s-${ownerAt(placement, id, version)}`}>
            <circle className={`key${gone.includes(id) ? ' gone' : ''}`} cx={x} cy={y} r={4} />
            {focus === id ? (
              <>
                <circle className="focus" cx={x} cy={y} r={7} />
                <text className="kl" x={lx} y={ly}>
                  {id}
                </text>
              </>
            ) : null}
          </g>
        )
      })}
      <text x={RING_C} y={RING_C - 8} textAnchor="middle" dominantBaseline="central">
        0 is at the top
      </text>
      <text x={RING_C} y={RING_C + 8} textAnchor="middle" dominantBaseline="central">
        clockwise to 999
      </text>
    </svg>
  )
}

function columnRule(scheme: Placement, shard: Shard, version: number): string {
  if (scheme === 'range') {
    if (shard === 'A') return 'ID 1 to 4'
    if (shard === 'B') return version === 1 ? 'ID 5 and up' : 'ID 5 to 7'
    return 'ID 8 and up'
  }
  if (scheme === 'mod') return `hash % ${shardsAt(version).length} = ${shardsAt(version).indexOf(shard)}`
  const share = arcShares(scheme, version)[shard] ?? 0
  return `${Math.round((share / RING_SIZE) * 100)}% of the ring`
}

const counts = (c: Record<Shard, number>, shards: Shard[]) => shards.map((sh) => c[sh]).join(' / ')

function narrative(scheme: Placement, stage: 1 | 2 | 3, st: PlacementStats): { title: string; body: string[] } {
  const movedText = `${st.moved.length} of ${INITIAL_IDS.length}`
  const from = st.movedFrom.join(' and ')
  if (scheme === 'range') {
    if (stage === 1) {
      return {
        title: 'The simplest rule: each shard owns a block of IDs',
        body: [
          'Keep a short list saying which shard owns which block of account numbers, and look the ID up in it. This is the first answer most people reach for, and it is easy to reason about.',
          `Load looks fine right now: ${counts(st.before, ['A', 'B'])} accounts on A and B.`,
        ],
      }
    }
    if (stage === 2) {
      return {
        title: `Adding a shard is cheap: ${movedText} accounts move`,
        body: [
          `Split one block. Shard C takes IDs 8 and up from shard B, and only those move. Shard A isn't touched at all. Click step c to see the catch.`,
        ],
      }
    }
    return {
      title: `The catch: every new account lands on shard ${st.newOwners[0]}`,
      body: [
        `Account numbers only go up, so new accounts always fall in the last, open-ended block. Shard ${st.newOwners[0]} takes all new growth, and new accounts are often the busiest ones. Splitting again would only pass the problem to the next shard.`,
        'To fix this, the rule has to ignore the order of the IDs. That is what a hash does. Move on to Hash mod N.',
      ],
    }
  }
  if (scheme === 'mod') {
    if (stage === 1) {
      return {
        title: 'Scatter the IDs with a hash, then divide among N shards',
        body: [
          'A hash function turns any input into a number that looks random. Two properties matter here. The same input always gives the same number, so any router can compute the owner without looking it up. And neighboring inputs give unrelated numbers, so sequential IDs stop piling up in one place.',
          '% is modulo: the remainder after dividing. Dividing by N leaves a remainder from 0 to N−1, which gives exactly one slot per shard. So hash % N picks a shard.',
          `Pick any account below and follow the arithmetic. Load is even: ${counts(st.before, ['A', 'B'])}.`,
        ],
      }
    }
    if (stage === 2) {
      return {
        title: `The problem: ${movedText} accounts move`,
        body: [
          `N is part of the formula, so going from % 2 to % 3 changes the remainder for most numbers. Shard C only needs about a third of the accounts, yet ${st.moved.length} have to move, and some of them move between A and B, which gained nothing.`,
          'Every account that moves is data to copy while the system is live, so this is real work and real risk, as Part 3 shows.',
        ],
      }
    }
    return {
      title: 'New growth spreads out, so the hotspot is solved',
      body: [
        `The new accounts land on ${st.newOwners.join(' and ')}, and load ends at ${counts(st.after, ['A', 'B', 'C'])}. Balance isn't the issue. The only problem is that step b is so expensive.`,
        'To fix that, the formula must stop depending on N. That is the idea behind consistent hashing.',
      ],
    }
  }
  if (scheme === 'ring') {
    if (stage === 1) {
      return {
        title: 'Put the hash numbers on a circle, and drop N from the formula',
        body: [
          'Bend the range 0 to 999 into a ring. Each shard sits at one point on it. An account hashes to a position, then walks clockwise until it reaches a shard point, and that shard owns it. The hash is the same as before. Only the step after it changed.',
          `The weakness is visible right away. Shard A owns everything between B's point and its own, which is 75% of the ring, so the load is ${counts(st.before, ['A', 'B'])}. With few points, arc sizes are down to luck.`,
        ],
      }
    }
    if (stage === 2) {
      return {
        title: `Much better: only ${movedText} accounts move`,
        body: [
          `Shard C's point takes over only the arc just before it. Everything else keeps walking to the same point as before, so nothing moves between old shards. That fixes the storm.`,
          `But all ${st.moved.length} come from shard ${from}. Only one neighbor gets relief, and shard B gets none.`,
        ],
      }
    }
    return {
      title: `New growth spreads, but load is still uneven: ${counts(st.after, ['A', 'B', 'C'])}`,
      body: [
        'Arcs of unequal size mean unequal load. To even them out, give each shard many small arcs instead of one big one. That is a virtual node.',
      ],
    }
  }
  if (stage === 1) {
    return {
      title: 'Same ring and same lookup, with more points per shard',
      body: [
        'Each physical shard now owns several scattered points on the ring, called virtual nodes. The rule for finding the owner is unchanged. Many small arcs average out, so the share of the ring gets close to even.',
        `Load is ${counts(st.before, ['A', 'B'])}. This example uses 3 points per shard so you can see them. Real systems use hundreds, because more points mean a more even split.`,
      ],
    }
  }
  if (stage === 2) {
    return {
      title: `Only ${movedText} accounts move, and they come from both shards`,
      body: [
        `Shard C's three points each take a small slice from a different arc, so the moves come from shards ${from}. The blast radius stays small, and every existing shard gets some relief.`,
      ],
    }
  }
  return {
    title: `Everything holds: load ends at ${counts(st.after, ['A', 'B', 'C'])}`,
    body: [
      'Even load, small moves and spread-out growth, all at once. This is the placement the rest of the page uses.',
      'One thing is still open: those accounts have to physically move while deposits keep arriving. That is Part 3.',
    ],
  }
}

export default function PlacementLab() {
  const [scheme, setScheme] = useState<Placement>('range')
  const [stage, setStage] = useState<1 | 2 | 3>(1)
  const [picked, setPicked] = useState(3)

  const version = stage === 1 ? 1 : 2
  const shards = shardsAt(version)
  const ids = stage === 3 ? [...INITIAL_IDS, ...NEW_IDS] : INITIAL_IDS
  const stats = placementStats(scheme)
  const story = narrative(scheme, stage, stats)
  const trace = traceOwner(scheme, picked, version)
  const isRing = scheme === 'ring' || scheme === 'vnode'
  const previousOwner = ownerAt(scheme, picked, 1)
  const showMoves = stage === 2

  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-axes">
          <div className="sim-axis">
            <span className="sim-axis-label">Rule</span>
            <div className="sim-seg" role="group" aria-label="Placement rule">
              {SCHEMES.map((m) => (
                <button key={m.id} type="button" aria-pressed={scheme === m.id} onClick={() => setScheme(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
          <div className="sim-axis">
            <span className="sim-axis-label">Step</span>
            <div className="sim-seg" role="group" aria-label="Stage">
              {STAGES.map((m) => (
                <button key={m.id} type="button" aria-pressed={stage === m.id} onClick={() => setStage(m.id)}>
                  {m.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="sim-narr" aria-live="polite">
        <b className="t">{story.title}</b>
        {story.body.map((p) => (
          <span key={p}>{p}</span>
        ))}
      </div>

      <div className="sim-grid">
        <div className="sim-col">
          <div className="sim-store">
            <h3>
              <span>Find the owner, line by line</span>
            </h3>
            <label className="sim-pick">
              <span>Account</span>
              <span className="sim-pick-prefix">acct-</span>
              <input
                type="number"
                min={1}
                value={picked}
                aria-label="Account number"
                onChange={(e) => {
                  const n = Number.parseInt(e.target.value, 10)
                  if (Number.isFinite(n) && n > 0) setPicked(n)
                }}
              />
              <span className="sim-muted sim-small">try any number</span>
            </label>
            <ol className="sim-trace">
              {trace.map((t) => (
                <li key={t.what}>
                  <span>{t.what}</span>
                  <b>{t.result}</b>
                </li>
              ))}
            </ol>
            {stage !== 1 ? (
              <div className="sim-empty">
                {previousOwner === ownerAt(scheme, picked, 2)
                  ? `With 2 shards this account was also on ${previousOwner}, so it stays put.`
                  : `With 2 shards this account was on ${previousOwner}, so it has to move to ${ownerAt(scheme, picked, 2)}.`}
              </div>
            ) : null}
          </div>
          {isRing ? (
            <div className="sim-store">
              <h3>
                <span>The ring</span>
                <span className="sim-tag">{scheme === 'vnode' ? '3 points per shard' : '1 point per shard'}</span>
              </h3>
              <RingDiagram placement={scheme} version={version} keys={[...new Set([...ids, picked])]} focus={picked} />
              <div className="sim-empty">Colored arc: the shard that owns those positions. Inner dots: accounts.</div>
            </div>
          ) : null}
        </div>

        <div className="sim-col">
          <div className="sim-store">
            <h3>
              <span>Where every account lives</span>
              {stage !== 1 ? <span className="sim-tag">{stats.moved.length} moved</span> : null}
            </h3>
            <div className="sim-lab-cols" style={{ gridTemplateColumns: `repeat(${shards.length}, minmax(0, 1fr))` }}>
              {shards.map((sh) => {
                const here = ids.filter((id) => ownerAt(scheme, id, version) === sh)
                return (
                  <div className={`sim-lab-col sim-s-${sh}`} key={sh}>
                    <div className="sim-lab-head">
                      <b>Shard {sh}</b>
                      <span>{columnRule(scheme, sh, version)}</span>
                      <span>
                        {here.length} account{here.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    {here.map((id) => {
                      const from = ownerAt(scheme, id, 1)
                      const moved = showMoves && from !== sh
                      const fresh = stage === 3 && NEW_IDS.includes(id)
                      return (
                        <button
                          type="button"
                          key={id}
                          className={`sim-acct${picked === id ? ' on' : ''}${moved ? ' moved' : ''}${fresh ? ' fresh' : ''}`}
                          aria-pressed={picked === id}
                          onClick={() => setPicked(id)}
                        >
                          <span>acct-{id}</span>
                          {scheme !== 'range' ? <span className="h">hash {hashOf(id)}</span> : null}
                          {moved ? <span className="n">moved from {from}</span> : null}
                          {fresh ? <span className="n">new</span> : null}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="sim-cmp">
        <table>
          <thead>
            <tr>
              <th>Rule</th>
              <th>Accounts on A / B</th>
              <th>Moved when C joins</th>
              <th>After, on A / B / C</th>
              <th>2 new accounts land on</th>
            </tr>
          </thead>
          <tbody>
            {SCHEMES.map((m) => {
              const st = placementStats(m.id)
              const movedBad = st.moved.length / INITIAL_IDS.length > MOVE_LIMIT
              return (
                <tr key={m.id} className={scheme === m.id ? 'sim-row-on' : ''}>
                  <td>
                    <b>{m.name}</b>
                  </td>
                  <td className={st.beforeSkew >= SKEW_LIMIT ? 'sim-cell-bad' : ''}>{counts(st.before, ['A', 'B'])}</td>
                  <td className={movedBad ? 'sim-cell-bad' : ''}>
                    {st.moved.length} of {INITIAL_IDS.length}, from {st.movedFrom.join(' and ')}
                  </td>
                  <td className={st.afterSkew >= SKEW_LIMIT ? 'sim-cell-bad' : ''}>{counts(st.after, ['A', 'B', 'C'])}</td>
                  <td className={new Set(st.newOwners).size === 1 ? 'sim-cell-bad' : ''}>{st.newOwners.join(' and ')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="sim-muted sim-small">
        Red marks the weakness of each rule. Each scheme solves the one above it and exposes the next problem, and only the last
        row has none of them.
      </p>
    </div>
  )
}
