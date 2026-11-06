import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import { arcShares, RING_SIZE, type Shard } from './shardingPlacement'
import PlacementLab, { RingDiagram } from './ShardingPlacementLab'
import {
  build,
  checks,
  EXPERIMENTS,
  fmtBal,
  lineNo,
  MIGRATOR_CODE,
  ownerAt,
  routerCode,
  unreadable,
  verdictText,
  type Actor,
  type CodeLine,
  type Protocol,
  type SimState,
  type Step,
} from './shardingSim'

const PROTOCOLS: { id: Protocol; label: string }[] = [
  { id: 'flip', label: '1 · Flip, then copy' },
  { id: 'copy', label: '2 · Copy, then flip' },
  { id: 'catchup', label: '3 · Best: copy, catch up, fence, flip' },
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
  status,
  lines,
  cls,
  currentLine,
  crash,
  onToggleBreak,
}: {
  name: string
  status?: string
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
        {status ? <span className={`st${status === 'down' ? ' sim-down' : ''}`}>{status}</span> : null}
      </h3>
      <div className="sim-code wrap">
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

function shareLine(version: number): string {
  const shares = arcShares('vnode', version)
  return (Object.entries(shares) as [Shard, number][])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sh, len]) => `${sh}: ${Math.round((len / RING_SIZE) * 100)}% of the ring`)
    .join(' · ')
}

function LoadBars({ s }: { s: SimState }) {
  const live = ALL_SHARDS.filter((sh) => sh !== 'C' || s.cJoined)
  const scale = Math.max(8, ...live.map((sh) => s.shards[sh].length))
  return (
    <div className="sim-load">
      {live.map((sh) => (
        <div className={`sim-load-row sim-s-${sh}`} key={sh}>
          <span>Shard {sh}</span>
          <span className="sim-load-track">
            <span className="sim-load-fill" style={{ width: `${(s.shards[sh].length / scale) * 100}%` }} />
          </span>
          <span>
            {s.shards[sh].length} row{s.shards[sh].length === 1 ? '' : 's'}
          </span>
        </div>
      ))}
    </div>
  )
}

function rowNote(s: SimState, sh: Shard, id: number, bal: number): { note: string; cls: string } {
  const owner = ownerAt(id, s.mapVersion)
  const isOldOwner = s.plan.find((m) => m.key === id)?.from === sh
  const fenced = isOldOwner && s.fenced.includes(id) ? ' · fenced' : ''
  if (owner !== sh) {
    if (s.mapVersion === 1) return { note: 'incoming copy, not live', cls: 'pend' }
    const ownerRow = s.shards[owner].find((r) => r.id === id)
    if (!ownerRow) return { note: `only copy, but the map says ${owner}${fenced}`, cls: 'dupe' }
    if (ownerRow.bal !== bal && bal === s.acked[id]) return { note: `old copy, yet the only correct balance${fenced}`, cls: 'dupe' }
    return { note: `old copy, routers ignore it${fenced}`, cls: 'pend' }
  }
  if (bal !== s.acked[id]) return { note: `wrong: client was told ${fmtBal(s.acked[id])}`, cls: 'dupe' }
  if (fenced) return { note: 'live · fenced: refuses writes', cls: 'pend' }
  return { note: '', cls: '' }
}

export default function ShardingPattern() {
  const [protocol, setProtocol] = useState<Protocol>('flip')
  const [crash, setCrash] = useState<string | null>(null)
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)

  const steps = useMemo(() => build(protocol, crash), [protocol, crash])
  const safeCur = Math.min(cur, steps.length - 1)
  const routerLines = routerCode(protocol)
  const migratorLines = MIGRATOR_CODE[protocol]

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
  const view = debuggerView(steps, safeCur, [routerLines, migratorLines])
  const s = view.s
  const benchRef = useFollowExecution(safeCur, steps)
  const final = step.label === 'end'
  const invariantChecks = checks(s)

  function go(i: number) {
    setRunning(false)
    setCur(Math.max(0, Math.min(steps.length - 1, i)))
  }

  function toggleBreak(id: string) {
    setCrash((c) => (c === id ? null : id))
    setCur(0)
    setRunning(false)
  }

  function switchProtocol(q: Protocol) {
    setProtocol(q)
    // Router line ids exist in every protocol, but m_cur/m_fen/m_rep exist only in catch-up.
    setCrash((c) => (c && [...routerCode(q), ...MIGRATOR_CODE[q]].some((l) => l.id === c) ? c : null))
    setCur(0)
    setRunning(false)
  }

  function runExperiment(exp: (typeof EXPERIMENTS)[number]) {
    setProtocol(exp.protocol)
    setCrash(exp.crash)
    setRunning(false)
    setCur(build(exp.protocol, exp.crash).length - 1)
  }

  function lineLabel(st: Step): string {
    if (!st.line || !st.actor || st.actor === 'system') return st.label
    const lines = st.actor === 'router' ? routerLines : migratorLines
    return `${ACTOR_PREFIX[st.actor]}${lineNo(lines, st.line)} ${st.label}`
  }

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Finance: High-Throughput &amp; Low-Latency · Sharding &amp; Partitioning</div>
        <h1>Sharding &amp; partitioning</h1>
        <p className="sim-lede">
          When accounts no longer fit on one database, you split them across several, called shards. The page takes this one
          question at a time, starting simple.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">Which shard owns this account?</a> Range, hash, modulo, the ring and virtual nodes, by hand.
          </li>
          <li>
            <a href="#when">When is it worth it?</a> A concrete finance case, and what to try first.
          </li>
          <li>
            <a href="#part3">How do you move accounts while the system is live?</a> A step-by-step debugger where you choose what crashes.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 3</div>
        <h2 id="p1">Which shard owns this account?</h2>
        <p className="sim-lede">
          Every read and write has to answer this first, so you need a rule: given an account, name its shard. Nothing crashes
          here and no data moves. Work through the rules left to right, and use steps a, b and c on each one. They answer three
          questions: is the load even, what happens when you add a shard, and where do new accounts go?
        </p>
        <PlacementLab />
        <h3>Beyond this example</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Range</th>
                <th>Hash mod N</th>
                <th>Consistent hash</th>
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
                  <code>hash(key) % N</code>
                </td>
                <td>One point per shard on a ring; a key goes to the next point clockwise</td>
                <td>Same ring, many points per shard</td>
              </tr>
              <tr>
                <td>
                  <b>Load balance</b>
                </td>
                <td>Poor for sequential keys: new writes pile onto one shard</td>
                <td>Good: a hash ignores key order</td>
                <td>Lumpy: arc sizes depend on where points happen to land</td>
                <td>Good, and tighter with more points per shard</td>
              </tr>
              <tr>
                <td>
                  <b>Adding a shard moves</b>
                </td>
                <td>Part of one block, from one shard</td>
                <td>Most keys, including between old shards</td>
                <td>About 1/N of keys, from one neighbor</td>
                <td>About 1/N of keys, from every shard</td>
              </tr>
              <tr>
                <td>
                  <b>Range scans</b>
                </td>
                <td>Yes: this is why range survives in real systems</td>
                <td>No</td>
                <td>No</td>
                <td>No</td>
              </tr>
              <tr>
                <td>
                  <b>Remaining gap</b>
                </td>
                <td>Hotspots recur unless keys are non-sequential or blocks split automatically</td>
                <td>Each reshard is a storm, unless you only ever double N</td>
                <td>Uneven load, and only one neighbor gets relief</td>
                <td>Doesn't help one single hot key. That needs its own fix</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="sim-muted sim-small">
          Fixed logical partitions are the same idea as virtual nodes: hash into many small slots (say 16,384), then keep an
          explicit slot-to-shard table. Adding a shard reassigns slots and moves only those. This gives you the placement of
          rule 4, with a map you can edit by hand when a shard runs hot.
        </p>
      </section>

      <section id="when" aria-labelledby="w0" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 3</div>
        <h2 id="w0">When is it worth it?</h2>
        <p className="sim-lede">
          Sharding is expensive and hard to undo, so it should be close to the last scaling step you take, not the first.
          The trigger is usually write load on data that must stay strongly consistent, and a card ledger is the classic case.
        </p>
        <div className="sim-card">
          <h3>A concrete case: card authorizations at a growing digital bank</h3>
          <p>
            Each time a customer taps their card, the bank must check the available balance, reserve the amount and record a
            ledger entry, all atomically, within the short response window the card network allows. It runs around the clock,
            so there is no maintenance window, and it peaks hardest on paydays and holiday sales.
          </p>
          <p>
            <b>Why the usual fixes run out.</b> Read replicas don't help, because a balance check on a lagging replica can
            approve money that's already spent, and every authorization is a write anyway. A cache has the same staleness
            problem. So all of this load lands on one primary, and that machine has a ceiling.
          </p>
          <p>
            <b>The arithmetic (invented numbers).</b> Say the primary handles 10,000 write transactions per second before commit
            latency climbs. This year's peak is 6,000, growing 60% a year: 9,600 next year, 15,360 the year after. Moving a live
            ledger takes months of work, so the decision is due now, while there's still headroom. Four shards would bring that
            future peak down to about 3,840 per shard.
          </p>
          <p>
            <b>Why sharding works here.</b> An authorization touches one customer's data, so with accounts and ledger entries
            sharded together by customer, it stays an ordinary single-database transaction. The merchant's side settles later in
            batch, outside this transaction. Sharding also limits the damage from a failure: losing one of four shards affects
            about a quarter of customers, not all of them.
          </p>
          <pre className="sim-block">{`-- runs entirely on this customer's shard, so it keeps full ACID guarantees
BEGIN;
SELECT available FROM accounts WHERE acct_id = :acct FOR UPDATE;
-- decline here if available < :amount
UPDATE accounts SET available = available - :amount WHERE acct_id = :acct;
INSERT INTO ledger_entries (acct_id, auth_id, amount) VALUES (:acct, :auth, :amount);
COMMIT;`}</pre>
          <p className="sim-muted sim-small">
            This is also why the simulation fences rather than accepting the risk of a lost write. No window exists to stop
            traffic for a move, and a brief refusal on a few accounts is recoverable, while a wrong balance is not.
          </p>
        </div>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Signs you need it</h3>
            <ul className="t">
              <li>Writes are the bottleneck, on the largest machine you can reasonably buy.</li>
              <li>The frequently used data no longer fits in memory, and tail latency keeps climbing.</li>
              <li>One database failure would take every customer down, and that's no longer acceptable.</li>
              <li>Regulation requires customers' data to stay in their own region. This calls for placement by region, not by hash.</li>
              <li>One large tenant's traffic is degrading everyone else's.</li>
            </ul>
          </div>
          <div className="sim-card">
            <h3>Signs you don't, or shouldn't</h3>
            <ul className="t">
              <li>Reads are the problem. Replicas and caching are far cheaper where slightly stale data is acceptable.</li>
              <li>Volume is modest, as in many back-office and treasury systems.</li>
              <li>Most transactions span many keys. If nearly every operation crosses shards, you've traded a capacity problem for a coordination problem.</li>
              <li>You rely on a global check inside the transaction, such as a firm-wide exposure limit. It becomes a cross-shard operation.</li>
              <li>The growth is in old rows nobody touches. Archiving solves that.</li>
            </ul>
          </div>
        </div>
        <h3>What to try first</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>What hurts</th>
                <th>Try first</th>
                <th>When that stops being enough</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Slow queries</td>
                <td>Indexes and query tuning</td>
                <td>Queries are already efficient, and the machine is simply saturated</td>
              </tr>
              <tr>
                <td>Reports and statements loading the primary</td>
                <td>Read replicas, or a separate reporting store</td>
                <td>The load is writes, or reads that can't tolerate replica lag, such as balance checks</td>
              </tr>
              <tr>
                <td>A huge ledger table, mostly old rows</td>
                <td>Time-based table partitions on one machine, plus archiving</td>
                <td>Recent data alone exceeds the machine. This organizes data but adds no write capacity</td>
              </tr>
              <tr>
                <td>Unrelated domains competing in one database</td>
                <td>Separate databases per service</td>
                <td>The ledger itself, usually the heaviest part, still overflows its own database</td>
              </tr>
              <tr>
                <td>Write rate near the limit</td>
                <td>A bigger machine, batching commits</td>
                <td>Hardware tops out, or a single failure affecting everyone becomes the bigger risk</td>
              </tr>
            </tbody>
          </table>
        </div>
        <h3>Choosing a shard key, by finance workload</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>Workload</th>
                <th>Shard by</th>
                <th>Stays single-shard</th>
                <th>What gets harder</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Retail ledger and card authorization</td>
                <td>Customer or account ID</td>
                <td>Authorizations, balances, statements</td>
                <td>Transfers between customers need a saga or two-phase commit</td>
              </tr>
              <tr>
                <td>Payment processing for merchants</td>
                <td>Merchant ID</td>
                <td>A merchant's payments, refunds, payouts</td>
                <td>The largest merchant can outgrow a shard, which moving keys can't fix. It needs its own split</td>
              </tr>
              <tr>
                <td>Order matching</td>
                <td>Instrument</td>
                <td>Matching within one order book</td>
                <td>Portfolio-wide margin and risk span instruments, and one busy instrument stays hot</td>
              </tr>
              <tr>
                <td>Regulated, multi-region platform</td>
                <td>Region, then customer</td>
                <td>Everything for customers in one region</td>
                <td>Cross-border transfers, and customers who relocate</td>
              </tr>
              <tr>
                <td>Fraud analytics and regulatory reporting</td>
                <td>Usually don't shard for this</td>
                <td>Not applicable</td>
                <td>These queries scan everything, so feed a separate analytical store from the shards instead</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sim-card">
          <h3>What sharding itself costs you</h3>
          <ul className="t">
            <li>
              <b>Cross-shard transactions.</b> A transfer between accounts on A and B no longer fits in one database
              transaction. It needs a saga or <Link to="/patterns/finance/two-phase-commit">two-phase commit</Link>, unless the shard key keeps related rows together.
            </li>
            <li>
              <b>Scatter-gather queries.</b> Anything not filtered by the shard key has to ask every shard. During a move, a
              naive sum across shards also double-counts the rows that exist twice.
            </li>
            <li>
              <b>The shard key is close to permanent.</b> Everything on this page moves rows between shards. Changing what you
              shard <em>by</em> means rewriting the dataset.
            </li>
          </ul>
          <p className="sim-muted sim-small">
            Related: the changelog plays the same role as the outbox table in{' '}
            <Link to="/patterns/finance/outbox">Transactional Outbox</Link>, a durable record of a write that something else
            consumes later. And a router crash after the shard applied a deposit, but before the client heard back, is exactly
            the case <Link to="/patterns/finance/idempotency-keys">Idempotency Keys</Link> exists for. Sharding doesn't solve it.
          </p>
        </div>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 3 of 3</div>
        <h2 id="p3">How do you move accounts while the system is live?</h2>
        <p className="sim-lede">
          Part 1 settled which accounts must move: with virtual nodes, 3 of 10 when shard C joins. Now they have to physically
          get there while deposits keep arriving, and that's where money gets lost. Placement is fixed here, and the only choice
          is the order of operations. Step through it like a debugger, and click any gutter dot to choose where a process dies.
        </p>
      </section>

      <div className="sim-bench sim-debug" ref={benchRef}>
        <div className="sim-debug-head">
          <div className="sim-toolbar">
            <div className="sim-axis">
              <span className="sim-axis-label">Move</span>
              <div className="sim-seg" role="group" aria-label="Move protocol">
                {PROTOCOLS.map((m) => (
                  <button key={m.id} type="button" aria-pressed={protocol === m.id} onClick={() => switchProtocol(m.id)}>
                    {m.label}
                  </button>
                ))}
              </div>
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
              {view.pending ? 'about to run · ' : ''}
              {step.actor ? ACTOR_NAME[step.actor] : 'ready'}
              {step.crash ? ' · process killed' : ''}
              {step.tag ? ` · ${step.tag}` : ''}
            </span>
            <b className="t">{step.title}</b>
            <span>{step.text ?? ''}</span>
          </div>

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
              status={s.worker}
              lines={migratorLines}
              cls="migrator"
              currentLine={step.actor === 'migrator' ? step.line : null}
              crash={crash}
              onToggleBreak={toggleBreak}
            />

            <div className="sim-store sim-vars">
              <h3>
                <span>Variables · {step.actor === 'router' ? 'this router call' : 'migration worker'}</span>
                {step.tag ? <span className="sim-tag">{step.tag}</span> : null}
              </h3>
              {Object.keys(view.locals).length ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>name</th>
                        <th>value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(view.locals).map(([name, value]) => (
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
                <span>Placement · published map</span>
                <span className="sim-tag">v{s.mapVersion}</span>
              </h3>
              <RingDiagram
                placement="vnode"
                version={s.mapVersion}
                pendingC={s.cJoined && s.mapVersion === 1}
                keys={Object.keys(s.acked).map(Number)}
                focus={step.focus}
                gone={unreadable(s)}
              />
              <div className="sim-empty">{shareLine(s.mapVersion)}</div>
              {s.cJoined && s.mapVersion === 1 ? <div className="sim-empty">shard C exists but isn't in the published map yet</div> : null}
              <LoadBars s={s} />
            </div>
          </div>

          <div className="sim-col">
            {ALL_SHARDS.filter((sh) => sh !== 'C' || s.cJoined).map((sh) => (
              <div className="sim-store" key={sh}>
                <h3>
                  <span>
                    <span className={`sim-s-${sh}`}>Shard {sh}</span> · accounts
                  </span>
                  <span className="sim-tag">
                    {s.shards[sh].length} row{s.shards[sh].length === 1 ? '' : 's'}
                  </span>
                </h3>
                {s.shards[sh].length ? (
                  <div className="sim-tw">
                    <table>
                      <thead>
                        <tr>
                          <th>acct_id</th>
                          <th>balance</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.shards[sh].map((r) => {
                          const { note, cls } = rowNote(s, sh, r.id, r.bal)
                          return (
                            <tr key={r.id} className={cls}>
                              <td>acct-{r.id}</td>
                              <td>{fmtBal(r.bal)}</td>
                              <td>{note}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="sim-empty">no rows</div>
                )}
              </div>
            ))}

            {s.plan.length > 0 && (
              <div className="sim-store">
                <h3>
                  <span>Saved migration plan</span>
                  <span className="sim-tag">
                    {s.plan.filter((m) => m.status === 'removed').length}/{s.plan.length} finished
                  </span>
                </h3>
                <div className="sim-klog">
                  {s.plan.map((m) => (
                    <div key={m.key} className={`sim-msg ${m.status === 'removed' ? 'read' : ''}`}>
                      <span>acct-{m.key}</span>
                      <span>
                        {m.from} → {m.to}
                      </span>
                      <span>{m.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {s.capturing && (
              <div className="sim-store">
                <h3>
                  <span>Changelog · since cursor</span>
                  <span className="sim-tag">moving keys only</span>
                </h3>
                {s.changelog.length ? (
                  <div className="sim-klog">
                    {s.changelog.map((c) => (
                      <div key={c.pos} className={`sim-msg ${c.applied ? 'read' : ''}`}>
                        <span>pos {c.pos}</span>
                        <span>
                          acct-{c.key} = {fmtBal(c.bal)}
                        </span>
                        <span>{c.applied ? 'replayed' : 'waiting for replay'}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="sim-empty">no writes captured yet</div>
                )}
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
                <div className={`sim-verdict ${final ? (invariantChecks.some((c) => c[2] === 'bad') ? 'bad' : 'good') : 'wait'}`}>
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
            <h3>The move decides whether you lose money</h3>
            <p>
              Placement says how much moves, not whether moving is safe. Flip first and accounts vanish. Copy first and reads
              look perfect while deposits disappear, because the copy is a snapshot and the system kept accepting writes
              after it. This run used the best placement from Part 1, and two deposits were still gone.
            </p>
          </div>
          <div className="sim-card">
            <h3>The fix: capture, fence, replay, flip</h3>
            <p>
              Take a changelog position before the copy, so no later write can be missed. Fence the moving keys on their old
              owners so the log stops growing, and replay what it captured. Then flip. The fence also stops routers that
              missed the publish, which is a problem no ordering of copy and flip can solve, because a publish never reaches
              every process at once.
            </p>
          </div>
          <div className="sim-card">
            <h3>The price of the fix</h3>
            <p>
              A brief write pause on the moving keys, plus a worker that needs a durable plan, a durable cursor and a lease on
              its fence. Kill it while fenced to see the cost: those accounts refuse deposits until it returns. You trade a
              silent, permanent money loss for a loud, temporary refusal, and in a ledger that trade is an easy call.
            </p>
          </div>
          <div className="sim-card">
            <h3>This moves responsibility, it doesn't remove it</h3>
            <p>
              The replay trusts the changelog, usually a database's own replication log through{' '}
              change data capture. If that log is truncated before the replay runs, the only recovery is to copy again. The
              fence trusts every write path to send a map version, so a batch job writing straight to a shard walks right past
              it. And the published map must live in a strongly consistent store, or two routers can disagree indefinitely.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Fencing, in SQL</h3>
          <pre className="sim-block">{`-- the old owner checks the fence and applies the write in one statement, so no write can slip between them
UPDATE accounts
   SET balance = balance + :amount
 WHERE acct_id = :acct
   AND NOT EXISTS (SELECT 1 FROM moved_keys
                    WHERE acct_id = :acct AND fenced_at_version > :router_map_version);
-- 1 row affected: applied
-- 0 rows affected: fenced, return STALE_MAP. The router refreshes its map and retries on the new owner`}</pre>
        </div>
      </section>

      <section aria-labelledby="w2b" className="sim-section">
        <h2 id="w2b">Three ways to move a key</h2>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Flip, then copy</th>
                <th>Copy, then flip</th>
                <th>Copy, catch up, fence, flip</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>During the copy</b>
                </td>
                <td>Moving accounts read as missing, and upserts create wrong balances</td>
                <td>Reads are correct, but writes after a key's copy go only to the old owner</td>
                <td>Reads are correct, and writes after a key's copy are also captured</td>
              </tr>
              <tr>
                <td>
                  <b>Router missed the publish</b>
                </td>
                <td>Write accepted by the old owner, then deleted</td>
                <td>Write accepted by the old owner, then deleted</td>
                <td>Refused with <code>STALE_MAP</code>, then retried on the new owner</td>
              </tr>
              <tr>
                <td>
                  <b>How it fails</b>
                </td>
                <td>Loudly: missing accounts and wrong balances</td>
                <td>Silently: all green until a customer or reconciliation notices</td>
                <td>Briefly and visibly: fenced keys refuse writes</td>
              </tr>
              <tr>
                <td>
                  <b>Cost</b>
                </td>
                <td>Nothing to build</td>
                <td>A durable plan</td>
                <td>A durable plan and cursor, a change log, a version check on every write, a fence lease</td>
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
          <dt>Shard key</dt>
          <dd>The field used to decide ownership, here the account ID.</dd>
          <dt>Replica lag</dt>
          <dd>The delay before a write on the primary appears on a read replica. It's why balance checks can't safely read from one.</dd>
          <dt>Router</dt>
          <dd>The code path, in the app, a proxy or a client library, that decides which shard a request goes to.</dd>
          <dt>Published map</dt>
          <dd>The versioned routing config that routers compute owners from. Here v1 has two shards and v2 has three.</dd>
          <dt>The flip</dt>
          <dd>Publishing a new map, which changes which copy of a row is live without touching any data.</dd>
          <dt>Stale router</dt>
          <dd>A router still using an older map because the publish hasn't reached it yet.</dd>
          <dt>Old copy</dt>
          <dd>A row left on its previous owner after the flip, waiting to be deleted. Nobody should be reading it.</dd>
          <dt>Hotspot</dt>
          <dd>A shard getting far more traffic than the others, usually because the placement rule concentrates keys there.</dd>
          <dt>Blast radius</dt>
          <dd>How much existing data a change forces to move, here adding one shard.</dd>
          <dt>Hash function</dt>
          <dd>Turns any input into a number that looks random. The same input always gives the same number, and neighboring inputs give unrelated ones.</dd>
          <dt>Modulo (%)</dt>
          <dd>The remainder after dividing. 7 % 3 = 1, because 7 is 2 × 3 with 1 left over. The result is always between 0 and N−1.</dd>
          <dt>Consistent hashing</dt>
          <dd>Placing shards and keys on the same ring, so a new shard only takes keys from the arcs it lands in.</dd>
          <dt>Virtual node</dt>
          <dd>One of several ring points owned by one physical shard, used to even out arc sizes.</dd>
          <dt>Changelog / cursor</dt>
          <dd>An ordered record of writes, and a saved position in it that says "replay everything after here".</dd>
          <dt>Row image</dt>
          <dd>A changelog entry holding the row's full new value rather than a delta, which makes replaying it twice harmless.</dd>
          <dt>Fence</dt>
          <dd>A rule on the old owner that refuses writes from any router that hasn't seen the new map.</dd>
          <dt>Lease</dt>
          <dd>A time limit on a fence, so that a dead worker can't block writes to its keys forever.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Say it in the interview</h2>
        <div className="sim-say">
          "I treat this as two decisions. For placement, I'd shard by account ID with virtual nodes or fixed logical slots, so
          adding a shard moves about 1/N of the keys and relieves every shard, not just one neighbor. The harder part is moving
          data while it's live. Copy-then-flip looks right but silently loses any write that lands after a row's copy, and any
          write from a router that missed the publish. So I take a change-log position before the copy, bulk copy, replay until
          the lag is tiny, fence the moving keys on the old owners, drain the tail, and only then flip. Every write carries a
          map version, so the old owner can refuse a stale router, which refreshes and retries. Deletes come last. If the worker
          dies, it resumes from a durable plan and cursor, and the fence has a lease. The cost is a brief write pause on the
          moving keys, which I'd take over losing money silently."
        </div>
        <p className="sim-muted sim-small">
          Expect this first: "Do you even need to shard?" Say what you'd exhaust before sharding, then name the trigger: write
          load on strongly consistent data, past what one primary can carry, where most transactions still touch a single
          customer. Follow-up they may ask: "What about one account that's simply too hot?" No placement scheme fixes that, because
          moving a key relocates its traffic rather than dividing it. It needs an application-level split, such as sub-ledgers
          for that merchant. Follow-up #2: "What about a transfer across shards?" That leaves single-database transactions
          behind, which is where sagas or two-phase commit come in, or a shard key that keeps both sides together. Follow-up
          #3: "What about stale reads?" A stale router can read an old copy until it's deleted, so if you need read-your-writes
          across a move, reads must carry the map version too.
        </p>
      </section>

      <div className="sim-footer">
        The examples are deterministic and simplified. The hash is a real function (FNV-1a with a bit-mixing finalizer, reduced to
        0 to 999 so the arithmetic stays readable), but its salt and the ring points were chosen so each rule's typical behavior
        shows up with only 12 accounts. Virtual nodes use 3 points per shard for legibility, where production systems use
        hundreds. In Part 3 the worker moves one key at a time, the fence is shown refusing a write only after the flip (a write
        arriving between fence and flip would retry until the flip), and reads don't carry a map version.
      </div>
    </div>
  )
}
