import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/sim.css'
import {
  build,
  checks,
  DEFAULT_CRASH,
  EXPERIMENTS,
  lineNo,
  MIGRATOR_CODE,
  ROUTER_CODE,
  verdictText,
  type Actor,
  type CodeLine,
  type Mode,
  type Shard,
  type Step,
} from './shardingSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'range', label: '1 · Range sharding' },
  { id: 'hash', label: '2 · Hash sharding (mod N)' },
  { id: 'consistent', label: '3 · Consistent hashing' },
  { id: 'vnode', label: '4 · Best: + virtual nodes' },
]

const ACTOR_NAME: Record<Actor | 'system', string> = {
  router: 'router',
  migrator: 'migration worker',
  system: 'result',
}
const ACTOR_PREFIX: Record<Actor, string> = { router: 'R', migrator: 'M' }
const ALL_SHARDS: Shard[] = ['A', 'B', 'C']

function CodePane({
  name,
  lines,
  cls,
  currentLine,
  crash,
  onToggleBreak,
}: {
  name: string
  lines: CodeLine[]
  cls: string
  currentLine: string | null
  crash: string | null
  onToggleBreak: (id: string) => void
}) {
  return (
    <div className={`sim-pane ${cls}`}>
      <h3>
        <span>{name}</span>
      </h3>
      <div className="sim-code">
        {lines.map((l) => (
          <div key={l.id} className={`sim-ln${currentLine === l.id ? ' cur' : ''}`}>
            <span className="g">
              {l.breakable ? (
                <button
                  type="button"
                  className={`sim-dot${crash === l.id ? ' on' : ''}`}
                  aria-label={`Crash before line ${lineNo(lines, l.id)}`}
                  title="Crash before this line"
                  onClick={() => onToggleBreak(l.id)}
                />
              ) : null}
            </span>
            <span className="no">{lineNo(lines, l.id)}</span>
            <pre>{l.code}</pre>
          </div>
        ))}
      </div>
    </div>
  )
}

function topologyLines(mode: Mode, activeShards: Shard[]): string[] {
  const n = activeShards.length
  if (mode === 'range') {
    return n === 2 ? ['A: id ≤ 4', 'B: id ≥ 5'] : ['A: id ≤ 4', 'B: 5 ≤ id ≤ 7', 'C: id ≥ 8']
  }
  if (mode === 'hash') {
    return [`shardList = [${activeShards.join(', ')}]`, `shard = hash(id) % ${n}`]
  }
  if (mode === 'consistent') {
    const pos: Record<Shard, number> = { A: 200, B: 600, C: 850 }
    return activeShards.map((s) => `${s} @ ring position ${pos[s]}`)
  }
  const pos: Record<Shard, number[]> = { A: [150, 500, 870], B: [350, 700, 950], C: [250, 620, 920] }
  return activeShards.map((s) => `${s} @ ${pos[s].length} points: ${pos[s].join(', ')}`)
}

export default function ShardingPattern() {
  const [mode, setMode] = useState<Mode>('range')
  const [crash, setCrash] = useState<string | null>(DEFAULT_CRASH.range)
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => build(mode, crash), [mode, crash])
  const safeCur = Math.min(cur, steps.length - 1)
  const routerLines = ROUTER_CODE[mode]

  useEffect(() => {
    if (!running) return
    if (cur >= steps.length - 1) {
      setRunning(false)
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const id = setTimeout(() => setCur((c) => Math.min(steps.length - 1, c + 1)), reduced ? 150 : 650)
    return () => clearTimeout(id)
  }, [running, cur, steps.length])

  useEffect(() => {
    const el = timelineRef.current?.querySelector('.sim-chip.cur')
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cur])

  const step: Step = steps[safeCur]
  const s = step.s
  const final = step.label === 'end'
  const invariantChecks = checks(s, final)
  const activeCheckList = checks(s, true)

  function go(i: number) {
    setRunning(false)
    setCur(Math.max(0, Math.min(steps.length - 1, i)))
  }

  function toggleBreak(id: string) {
    setCrash((c) => (c === id ? null : id))
    setCur(0)
    setRunning(false)
  }

  function switchMode(m: Mode) {
    setMode(m)
    setCrash(DEFAULT_CRASH[m])
    setCur(0)
    setRunning(false)
  }

  function runExperiment(exp: (typeof EXPERIMENTS)[number]) {
    setMode(exp.mode)
    setCrash(exp.crash)
    setRunning(false)
    setCur(build(exp.mode, exp.crash).length - 1)
  }

  function lineLabel(st: Step): string {
    if (!st.line || !st.actor || st.actor === 'system') return st.label
    const lines = st.actor === 'router' ? routerLines : MIGRATOR_CODE
    return `${ACTOR_PREFIX[st.actor]}${lineNo(lines, st.line)} ${st.label}`
  }

  function residencyCount(id: number): number {
    return ALL_SHARDS.filter((sh) => s.activeShards.includes(sh) && s.shards[sh].includes(id)).length
  }

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Finance: High-Throughput &amp; Low-Latency · Sharding &amp; Partitioning</div>
        <h1>Sharding &amp; partitioning</h1>
        <p className="sim-lede">
          The ledger platform's accounts no longer fit on one database. Every write and read first has to answer
          "which shard owns this account?" Step through the router's decision like a debugger, watch what happens
          when a new shard joins the cluster, and decide exactly where the migration worker dies.
        </p>
      </div>

      <div className="sim-bench">
        <div className="sim-toolbar">
          <div className="sim-seg" role="group" aria-label="Approach">
            {MODES.map((m) => (
              <button key={m.id} type="button" aria-pressed={mode === m.id} onClick={() => switchMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="sim-ctl">
            <button className="sim-btn ghost" type="button" aria-label="Back to start" onClick={() => go(0)} disabled={safeCur === 0}>
              |◀
            </button>
            <button className="sim-btn ghost" type="button" aria-label="Step back" onClick={() => go(safeCur - 1)} disabled={safeCur === 0}>
              ◀
            </button>
            <button className="sim-btn" type="button" onClick={() => go(safeCur + 1)} disabled={safeCur === steps.length - 1}>
              Step ▶
            </button>
            <button
              className="sim-btn ghost"
              type="button"
              onClick={() => {
                if (running) {
                  setRunning(false)
                  return
                }
                if (safeCur === steps.length - 1) setCur(0)
                setRunning(true)
              }}
            >
              {running ? 'Pause ❚❚' : 'Run ▶▶'}
            </button>
            <span className="sim-pos">
              {safeCur} / {steps.length - 1}
            </span>
          </div>
        </div>

        <div className="sim-timeline" ref={timelineRef} aria-label="Execution timeline">
          {steps.map((st, i) => (
            <button
              key={i}
              type="button"
              className={`sim-chip ${st.actor && st.actor !== 'system' ? st.actor : ''} ${st.crash ? 'crash' : ''} ${
                i < safeCur ? 'done' : ''
              } ${i === safeCur ? 'cur' : ''}`}
              aria-label={`Go to step ${i}: ${st.title}`}
              onClick={() => go(i)}
            >
              {i === 0 ? 'start' : lineLabel(st)}
            </button>
          ))}
        </div>

        <div className={`sim-narr${step.crash ? ' crash' : ''}`} aria-live="polite">
          <span className="who">
            {step.actor ? ACTOR_NAME[step.actor] : 'ready'}
            {step.crash ? ' · process killed' : ''}
            {step.tag ? ` · ${step.tag}` : ''}
          </span>
          <b className="t">{step.title}</b>
          <span>{step.text ?? ''}</span>
        </div>

        <div className="sim-grid">
          <div className="sim-col">
            <CodePane
              name="Router"
              lines={routerLines}
              cls="router"
              currentLine={step.actor === 'router' ? step.line : null}
              crash={crash}
              onToggleBreak={toggleBreak}
            />
            <CodePane
              name="Migration worker"
              lines={MIGRATOR_CODE}
              cls="migrator"
              currentLine={step.actor === 'migrator' ? step.line : null}
              crash={crash}
              onToggleBreak={toggleBreak}
            />

            <div className="sim-store">
              <h3>
                <span>Variables · this step</span>
                {step.tag ? <span className="sim-tag">{step.tag}</span> : null}
              </h3>
              {Object.keys(step.locals).length ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>name</th>
                        <th>value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(step.locals).map(([name, value]) => (
                        <tr key={name}>
                          <td>{name}</td>
                          <td>{value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="sim-empty">nothing declared yet in this step</div>
              )}
            </div>

            <div className="sim-store">
              <h3>
                <span>Topology</span>
                <span className="sim-tag">{s.activeShards.length} shard{s.activeShards.length > 1 ? 's' : ''}</span>
              </h3>
              <div className="sim-tw">
                <table>
                  <tbody>
                    {topologyLines(mode, s.activeShards).map((line) => (
                      <tr key={line}>
                        <td>{line}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="sim-col">
            {ALL_SHARDS.filter((sh) => s.activeShards.includes(sh)).map((sh) => (
              <div className="sim-store" key={sh}>
                <h3>
                  <span>Shard {sh} · accounts</span>
                  <span className="sim-tag">{s.shards[sh].length} row{s.shards[sh].length === 1 ? '' : 's'}</span>
                </h3>
                {s.shards[sh].length ? (
                  <div className="sim-tw">
                    <table>
                      <thead>
                        <tr>
                          <th>acct_id</th>
                          <th>balance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.shards[sh].map((id) => (
                          <tr key={id} className={residencyCount(id) > 1 ? 'pend' : ''}>
                            <td>acct-{id}</td>
                            <td>$1,000{residencyCount(id) > 1 ? ' (also elsewhere)' : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="sim-empty">no rows</div>
                )}
              </div>
            ))}

            {s.migrationQueue.length > 0 && (
              <div className="sim-store">
                <h3>
                  <span>Migration plan</span>
                  <span className="sim-tag">
                    {s.migrationQueue.filter((m) => m.status === 'done').length}/{s.migrationQueue.length} moved
                  </span>
                </h3>
                <div className="sim-klog">
                  {s.migrationQueue.map((m) => (
                    <div key={m.key} className={`sim-msg ${m.status === 'done' ? 'read' : ''}`}>
                      <span>acct-{m.key}</span>
                      <span>{m.status === 'done' ? 'moved' : 'pending'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="sim-store">
              <h3>
                <span>Invariants</span>
              </h3>
              <div className="sim-inv">
                {invariantChecks.map(([name, detail, status]) => (
                  <div className="sim-chk-row" key={name}>
                    <span className={`sim-mark ${status}`}>{status === 'ok' ? 'holds' : status === 'bad' ? 'broken' : 'pending'}</span>
                    <span>
                      <b>{name}</b> <span className="sim-muted sim-small">{detail}</span>
                    </span>
                  </div>
                ))}
                <div className={`sim-verdict ${final ? (activeCheckList.some((c) => c[2] === 'bad') ? 'bad' : 'good') : 'wait'}`}>
                  {final ? verdictText(s) : 'Verdict appears when the run finishes. Press Run to skip ahead.'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="sim-console" aria-label="Console">
          {s.log.length ? (
            s.log.map((l, i) => (
              <div key={i} className={`c-${l.actor}`}>
                {l.text}
              </div>
            ))
          ) : (
            <div className="sim-muted">console empty</div>
          )}
        </div>

        <div>
          <h3 style={{ marginBottom: 8 }}>Experiments to run</h3>
          <div className="sim-try">
            {EXPERIMENTS.map((exp) => (
              <button key={exp.label} type="button" onClick={() => runExperiment(exp)}>
                <b>{exp.label}</b>
                {exp.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section aria-labelledby="w1" className="sim-section">
        <h2 id="w1">What you just debugged</h2>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>The problem: one database stops being enough</h3>
            <p>
              Once the dataset or the write rate outgrows one machine, accounts have to be split across several
              databases ("shards"). Every read and write now needs a rule — a router — that decides which shard
              owns a given key. Pick the wrong rule and that decision itself becomes the bottleneck.
            </p>
          </div>
          <div className="sim-card">
            <h3>Range sharding's hidden cost</h3>
            <p>
              Splitting by contiguous ID ranges is simple and makes resharding cheap — you just split one range in
              two. But if IDs are sequential, every <em>new</em> account lands on whichever range is still
              open-ended. Resharding relieves the symptom for a moment; it doesn't change which range new growth
              keeps hitting.
            </p>
          </div>
          <div className="sim-card">
            <h3>Hash sharding fixes the hotspot, breaks resharding</h3>
            <p>
              <code>hash(id) % N</code> spreads load evenly, because a good hash function doesn't care that IDs are
              sequential. The price shows up the moment <code>N</code> changes: changing the modulus changes the
              answer for almost every key, so adding one shard can force the majority of existing data to move.
            </p>
          </div>
          <div className="sim-card">
            <h3>Consistent hashing, and the gap it still has</h3>
            <p>
              Placing shards on a ring and routing each key to the next shard clockwise means a new shard only ever
              steals keys from its immediate neighbor — not from everyone. That fixes the resharding storm. But with
              only a handful of real shards on the ring, the arcs between them aren't equal, so load can still be
              lumpy from day one, before anything ever gets resharded.
            </p>
          </div>
          <div className="sim-card">
            <h3>Virtual nodes close it</h3>
            <p>
              Give every physical shard several scattered points on the same ring instead of one. The routing rule
              doesn't change — same ring, same "next clockwise" lookup — only the point density does. More, smaller
              arcs per shard average out, so load stays balanced even with few physical shards, while resharding
              still only touches the arcs next to the new points.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Migrating a key without ever losing or duplicating it</h3>
          <pre className="sim-block">{`// same order regardless of routing scheme — this is what makes resharding crash-safe
val row = shards[oldShard].get(key)        // old shard is still sole owner; safe to retry from here
shards[newShard].put(key, row)             // now on both shards; routing still points old — still correct
routingTable.update(key, newShard)         // readers now go to new shard, which already has the data
shards[oldShard].delete(key)               // reclaim the now-stale copy; back to exactly one owner`}</pre>
          <p className="sim-muted sim-small">
            Try crashing the migration worker at every line in turn. "No lost reads" never breaks, no matter where
            it dies — that's the payoff of writing the new copy and flipping the routing table <em>before</em>
            deleting the old one, instead of the other way around. Compare this to the commit-then-publish ordering
            in <Link to="/patterns/finance/outbox">Transactional Outbox</Link>: same idea, same reason it works.
          </p>
        </div>
      </section>

      <section aria-labelledby="w2" className="sim-section">
        <h2 id="w2">Four ways to answer "which shard?"</h2>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Range</th>
                <th>Hash (mod N)</th>
                <th>Consistent hashing</th>
                <th>+ Virtual nodes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>How</b>
                </td>
                <td>Each shard owns a contiguous block of keys</td>
                <td>
                  <code>shard = hash(key) % N</code>
                </td>
                <td>Shards sit on a ring; a key goes to the next shard clockwise</td>
                <td>Same ring, many points per shard instead of one</td>
              </tr>
              <tr>
                <td>
                  <b>Load balance</b>
                </td>
                <td>Bad for sequential keys — new writes pile onto one shard</td>
                <td>Good — a hash doesn't care about key order</td>
                <td>Uneven with few shards — arc sizes vary by luck</td>
                <td>Good, even with few physical shards</td>
              </tr>
              <tr>
                <td>
                  <b>Resharding cost</b>
                </td>
                <td>Cheap — split one range</td>
                <td>Expensive — changing N remaps most keys</td>
                <td>Cheap — only the new shard's neighbor is affected</td>
                <td>Cheap — same ring mechanics</td>
              </tr>
              <tr>
                <td>
                  <b>Remaining gap</b>
                </td>
                <td>Resharding doesn't stop the next hotspot from forming the same way</td>
                <td>The hotspot problem is solved; the resharding problem is created</td>
                <td>Load can be uneven even before anything is ever resharded</td>
                <td>None of the above — the usual production default</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Shard / partition</dt>
          <dd>One of several independent databases that together hold the full dataset, each owning a subset of keys.</dd>
          <dt>Router</dt>
          <dd>The code path — in the app, a proxy, or a client library — that decides which shard a given key belongs to.</dd>
          <dt>Hotspot</dt>
          <dd>A shard that receives disproportionately more traffic than the others, usually because the routing rule concentrates certain keys there.</dd>
          <dt>Resharding</dt>
          <dd>Changing the number of shards (almost always adding one) and relocating whatever data no longer belongs where it currently sits.</dd>
          <dt>Consistent hashing</dt>
          <dd>A routing scheme that places shards and keys on the same ring, so adding or removing a shard only reassigns the keys adjacent to it.</dd>
          <dt>Virtual node</dt>
          <dd>One of several ring positions assigned to a single physical shard, used to smooth out uneven arc sizes without adding real shards.</dd>
          <dt>Blast radius</dt>
          <dd>How much existing data a given change (here, adding a shard) forces to move.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Say it in the interview</h2>
        <div className="sim-say">
          "We shard by account ID using consistent hashing with virtual nodes — a few hundred points per physical
          shard on the ring, not one. That gets us two things range or plain modulus hashing can't give together:
          load that stays balanced even with a small number of shards, and a resharding event that only has to move
          the keys adjacent to the new node, not a majority of the dataset. The migration itself copies to the new
          shard and flips the routing entry before deleting the old copy, so a crash mid-migration never produces a
          lost read — worst case it leaves a harmless stale duplicate that cleanup reclaims later."
        </div>
        <p className="sim-muted sim-small">
          Follow-up they may ask: "What if one single key is just inherently hot — a celebrity account, a popular
          merchant?" No sharding scheme here fixes that: splitting keys across shards only helps when the problem is
          too many keys, not one key that's too busy. That needs its own fix, like splitting that one entity's
          writes further at the application layer. Follow-up #2: "How do you even route to the right shard count
          during a migration that's in flight?" The routing table itself needs to be consulted per key, not
          computed fresh from the current shard count — which is exactly what the migration worker's
          <code>routingTable.update</code> line above is for.
        </p>
      </section>

      <div className="sim-footer">
        The simulation above is deterministic and simplified: hashes are shown as fixed, illustrative numbers rather
        than a real hash function's output, and the migration worker here runs one key at a time rather than the
        concurrent, batched migrations a real resharding job would use.
      </div>
    </div>
  )
}
