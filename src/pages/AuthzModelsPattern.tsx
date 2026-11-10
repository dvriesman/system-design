import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { debuggerView, useFollowExecution } from './debuggerView'
import '../styles/sim.css'
import AuthzLab from './AuthzLab'
import { build, checks, clockText, CODE, EXPERIMENTS, lineRef, verdictIsBad, verdictText, type Actor, type Mode, type Pane, type Step } from './authzSim'

const MODES: { id: Mode; label: string }[] = [
  { id: 'rbac', label: '1 · Global roles' },
  { id: 'scoped', label: '2 · Roles per company' },
  { id: 'abac', label: '3 · ABAC rules' },
  { id: 'rebac', label: '4 · ReBAC + conditions' },
  { id: 'fresh', label: '5 · + snapshot token' },
]
const ACTOR_NAME: Record<Actor, string> = { cons: 'Acme', svc: 'API', relay: 'Authorization service' }
const PANES: { id: Pane; cls: string; title: string }[] = [
  { id: 'admin', cls: 'cons', title: 'Acme: changes during the day' },
  { id: 'api', cls: 'svc', title: 'API · enforces' },
  { id: 'authz', cls: 'relay', title: 'Authorization service · decides' },
  { id: 'model', cls: 'router', title: 'The rules' },
]

function Rows({ title, head, rows, empty }: { title: string; head: string[]; rows: { key: string; cells: string[]; cls?: string }[]; empty?: string }) {
  return (
    <div className="sim-store">
      <h3>
        <span>{title}</span>
      </h3>
      {rows.length ? (
        <div className="sim-tw">
          <table>
            <thead>
              <tr>
                {head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className={r.cls ?? ''}>
                  {r.cells.map((c, i) => (
                    <td key={i}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="sim-empty">{empty ?? 'no rows'}</div>
      )}
    </div>
  )
}

export default function AuthzModelsPattern() {
  const [mode, setMode] = useState<Mode>('rbac')
  const [cur, setCur] = useState(0)
  const [running, setRunning] = useState(false)
  const timelineRef = useRef<HTMLDivElement>(null)
  const steps = useMemo(() => build(mode), [mode])
  const safeCur = Math.min(cur, steps.length - 1)

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
    timelineRef.current?.querySelector('.sim-chip.cur')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [cur])

  const step: Step = steps[safeCur]
  const view = debuggerView(steps, safeCur, PANES.map((p) => CODE[mode][p.id]))
  const s = view.s
  const benchRef = useFollowExecution(safeCur, steps)
  const final = step.label === 'end'
  const isRebac = mode === 'rebac' || mode === 'fresh'

  function go(i: number) {
    setRunning(false)
    setCur(Math.max(0, Math.min(steps.length - 1, i)))
  }
  function switchMode(m: Mode) {
    setMode(m)
    setCur(0)
    setRunning(false)
  }
  function runExperiment(exp: (typeof EXPERIMENTS)[number]) {
    setMode(exp.mode)
    setRunning(false)
    setCur(build(exp.mode).findIndex((st) => st.req === exp.req))
  }
  const lineLabel = (st: Step) => (st.line ? `${lineRef(st.line, mode)} ${st.label}` : st.label)
  const data = s.primary

  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Security: Authentication &amp; Authorization · RBAC vs ABAC vs ReBAC</div>
        <h1>RBAC vs ABAC vs ReBAC</h1>
        <p className="sim-lede">
          Once you know who is calling, what may they do? Roles, rules over attributes, and relationships are three ways to answer, and each one is good at a different
          kind of question. The page takes them one at a time.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#part1">How does each model decide?</a> Each one from scratch, then ask all three the same question.
          </li>
          <li>
            <a href="#part2">Which one fits?</a> Concrete cases, a table for deciding, and myths.
          </li>
          <li>
            <a href="#part3">What goes wrong in a real day?</a> A step-by-step debugger, then <a href="#products">how real products do it</a> and{' '}
            <a href="#real">how to build it for real</a>.
          </li>
        </ol>
      </div>

      <section id="part1" aria-labelledby="p1" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 1 of 3</div>
        <h2 id="p1">How does each model decide?</h2>
        <p className="sim-lede">
          The same bank customers in every tab: Carol is an accountant and approver at Acme, with a $10,000 limit. Globex is another customer. Frank is an outside auditor.
        </p>
        <AuthzLab />
        <div className="sim-say">
          <b>The idea in one sentence.</b> Roles answer "what kind of user is this?", attributes answer "do the facts satisfy the rule?", and relationships answer "how is this
          user connected to this object?". Real systems combine them.
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>RBAC</th>
                <th>ABAC</th>
                <th>ReBAC</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>Stores</b>
                </td>
                <td>Who has which role</td>
                <td>Facts about users and resources, plus policies</td>
                <td>Relationships between objects and users</td>
              </tr>
              <tr>
                <td>
                  <b>Good at</b>
                </td>
                <td>Job functions: "approvers can approve"</td>
                <td>Conditions: amounts, owners, time, place</td>
                <td>Sharing, groups, folders, hierarchies</td>
              </tr>
              <tr>
                <td>
                  <b>Struggles with</b>
                </td>
                <td>Anything about one specific object</td>
                <td>Data that lives in relationships, and "who can see this?"</td>
                <td>Rules about values, unless it has conditions</td>
              </tr>
              <tr>
                <td>
                  <b>"Who can see X?"</b>
                </td>
                <td>Easy: who holds the role</td>
                <td>Hard: evaluate the rule for everyone</td>
                <td>Supported: walk the relationships backwards</td>
              </tr>
              <tr>
                <td>
                  <b>Reference</b>
                </td>
                <td>NIST model, ANSI INCITS 359</td>
                <td>NIST SP 800-162</td>
                <td>Google's Zanzibar paper, 2019</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section id="part2" aria-labelledby="p2" className="sim-section">
        <div className="sim-eyebrow">Part 2 of 3</div>
        <h2 id="p2">Which one fits?</h2>
        <p className="sim-lede">Start with the questions your product has to answer, not with the model.</p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>Case: back-office tools for bank staff</h3>
            <p>
              <b>RBAC.</b> Support agents, risk analysts and auditors do the same job across all customers. A few roles, assigned by HR, are easy to review, and auditors can ask
              "who can issue refunds?" with one query.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: payment approval limits</h3>
            <p>
              <b>ABAC, or conditions on top.</b> "Approve up to your limit, never your own, only during business hours" is a rule over values. Roles would multiply into
              "approver-10k", "approver-100k", and so on.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: business customers sharing documents</h3>
            <p>
              <b>ReBAC.</b> Folders, sub-accounts, groups and "shared with my accountant" are relationships. Storing them as relationships keeps one source of truth, and
              moving or unsharing is one change.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: a multi-tenant SaaS with a few fixed roles per customer</h3>
            <p>
              <b>RBAC scoped to the tenant.</b> "Admin of Acme" and "viewer of Acme" cover most products for a long time. Add database row-level security as a second line of
              defence. A dedicated ReBAC system would be overkill here.
            </p>
          </div>
          <div className="sim-card">
            <h3>Case: very large, cross-product sharing</h3>
            <p>
              <b>ReBAC as a central service.</b> When many products share the same objects and groups, a service such as OpenFGA or SpiceDB keeps one graph. The price is
              running it, and keeping it consistent with your data.
            </p>
          </div>
        </div>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>If your hardest question is…</th>
                <th>Start with</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>What can someone in this job do?</td>
                <td>RBAC</td>
              </tr>
              <tr>
                <td>Do these values satisfy the rule?</td>
                <td>ABAC, or conditions</td>
              </tr>
              <tr>
                <td>How is this person connected to this object?</td>
                <td>ReBAC</td>
              </tr>
              <tr>
                <td>Who can see this object?</td>
                <td>RBAC or ReBAC. ABAC makes it hard</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sim-card">
          <h3>Three myths worth dropping</h3>
          <ul className="t">
            <li>
              <b>"Pick one."</b> Most real systems mix them: roles for job functions, relationships for ownership and sharing, and conditions for limits. OpenFGA and SpiceDB
              both put conditions on relationships for this reason.
            </li>
            <li>
              <b>"ABAC replaces roles."</b> A role is just one attribute. ABAC is more expressive, and harder to review: "who can approve this?" means running the rule for every
              user.
            </li>
            <li>
              <b>"The model is the hard part."</b> Mode 4 below gets the model right and still leaks, because the check read data from before a change. Freshness is part of the
              design.
            </li>
          </ul>
        </div>
      </section>

      <section id="part3" aria-labelledby="p3" className="sim-section sim-first">
        <div className="sim-eyebrow">Part 3 of 3</div>
        <h2 id="p3">What goes wrong in a real day?</h2>
        <p className="sim-lede">
          The same nine requests run through every mode. Each one says what it should get, and the request log turns red when a mode gets it wrong. Authorization doesn't crash
          in an interesting way, so there are no breakpoints here: the experiments jump to the request worth looking at.
        </p>
      </section>

      <div className="sim-bench sim-debug" ref={benchRef}>
        <div className="sim-debug-head">
          <div className="sim-toolbar">
            <div className="sim-seg" role="group" aria-label="Design">
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
                className={`sim-chip ${st.actor && st.actor !== 'system' ? st.actor : ''} ${i < safeCur ? 'done' : ''} ${i === safeCur ? 'cur' : ''}`}
                aria-label={`Go to step ${i}: ${st.title}`}
                onClick={() => go(i)}
              >
                {i === 0 ? 'start' : lineLabel(st)}
              </button>
            ))}
          </div>
          <div className="sim-narr" aria-live="polite">
            <span className="who">
              {view.pending ? 'about to run · ' : ''}
              {step.actor && step.actor !== 'system' ? ACTOR_NAME[step.actor] : step.actor ? 'what happens next' : 'ready'} · {clockText(s.clock)}
            </span>
            <b className="t">{step.title}</b>
            <span>{step.text ?? ''}</span>
          </div>
        </div>

        <div className="sim-grid">
          <div className="sim-col">
            {PANES.map((pane) => (
              <div className={`sim-pane ${pane.cls}`} key={pane.id}>
                <h3>
                  <span>{pane.title}</span>
                </h3>
                <div className="sim-code wrap">
                  {CODE[mode][pane.id].map((l) => (
                    <div key={l.id} className={`sim-ln${step.line === l.id ? ' cur' : ''}`}>
                      <span className="g" />
                      <span className="no">{lineRef(l.id, mode)}</span>
                      <pre>{l.code}</pre>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className="sim-store sim-vars">
              <h3>
                <span>Variables · {step.actor && step.actor !== 'system' ? `${ACTOR_NAME[step.actor]}'s call` : 'no call running'}</span>
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
          </div>

          <div className="sim-col">
            <Rows
              title="Request log"
              head={['#', 'who', 'asks to', 'should', 'got']}
              empty="no requests yet"
              rows={s.requests.map((r) => ({ key: r.id, cells: [r.id, r.who, r.what, r.expected, r.got], cls: r.got !== r.expected ? 'dupe' : '' }))}
            />
            <div className="sim-store">
              <h3>
                <span>Permission data · primary v{s.version}</span>
                <span className="sim-tag">{s.pending ? `replica v${s.replicaVersion}, 1 change behind` : `replica v${s.replicaVersion}, up to date`}</span>
              </h3>
              {s.pending ? <div className="sim-tx-reader wait">Not on the replica yet<span>{s.pending}</span></div> : null}
              {mode === 'rbac' || mode === 'scoped' ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>user</th>
                        <th>role</th>
                        <th>scope</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.roles.map((r) => (
                        <tr key={`${r.user}-${r.role}`}>
                          <td>{r.user}</td>
                          <td>{r.role}</td>
                          <td>{r.scope ?? 'everywhere'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : mode === 'abac' ? (
                <div className="sim-tw">
                  <table>
                    <thead>
                      <tr>
                        <th>document</th>
                        <th>sharedWith</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.sharedWith).map(([doc, users]) => (
                        <tr key={doc}>
                          <td>{doc}</td>
                          <td>[{users.join(', ')}]</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="sim-empty">users: carol (acme, approver, $10,000) · erin (acme, approver, $100,000) · frank (auditco)</div>
                </div>
              ) : (
                <div className="az-tuples">
                  {data.tuples.map((t) => (
                    <code key={t} className={t.includes('frank') || t.startsWith('doc:') ? 'hot' : ''}>
                      {t}
                    </code>
                  ))}
                </div>
              )}
            </div>
            <Rows
              title="Document store"
              head={isRebac && mode === 'fresh' ? ['doc', 'title', 'folder', 'content', 'token'] : ['doc', 'title', 'folder', 'content']}
              rows={s.docs.map((d) => ({ key: d.id, cells: [d.id, d.title, d.folder, d.content, ...(mode === 'fresh' ? [d.token ? `v${d.token}` : '—'] : [])] }))}
            />
            <div className="sim-store">
              <h3>
                <span>Invariants</span>
              </h3>
              <div className="sim-inv">
                {checks(s).map(([name, detail, status]) => (
                  <div className="sim-chk-row" key={name}>
                    <span className={`sim-mark ${status}`}>{status === 'ok' ? 'holds' : status === 'bad' ? 'broken' : 'pending'}</span>
                    <span>
                      <b>{name}</b> <span className="sim-muted sim-small">{detail}</span>
                    </span>
                  </div>
                ))}
                <div className={`sim-verdict ${final ? (verdictIsBad(s) ? 'bad' : 'good') : 'wait'}`}>
                  {final ? verdictText(mode, s) : 'Verdict appears when the run finishes. Press Run to skip ahead.'}
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
            <h3>Global roles know nothing about the data</h3>
            <p>"Accountant can read invoices" let Carol read another customer's invoices. A role answers what kind of action, never whose data.</p>
          </div>
          <div className="sim-card">
            <h3>Scoped roles fix tenancy, and stop there</h3>
            <p>
              "Approver at Acme" still approves its own payment, at any amount. And "auditor at Acme" can't be limited to one folder, so Frank read payroll. More roles would only
              move the problem.
            </p>
          </div>
          <div className="sim-card">
            <h3>Attributes handle rules, not connections</h3>
            <p>
              The four-eyes rule and the limit became one readable policy. Folder sharing had to be copied onto documents, and the copy went stale when a document moved, and
              again when Frank was removed.
            </p>
          </div>
          <div className="sim-card">
            <h3>Relationships keep one source of truth</h3>
            <p>
              Sharing is one tuple on the folder, and a move changes one tuple on the document. A condition on the approver tuple carries the limit. Every model question was
              answered correctly.
            </p>
          </div>
          <div className="sim-card">
            <h3>And the data has to be fresh enough</h3>
            <p>
              Mode 4 still leaked the acquisition plan, because the check read a replica from before Frank's removal. The Zanzibar paper calls this the "new enemy" problem. A
              snapshot token saved with the content makes the check use data at least that fresh.
            </p>
          </div>
        </div>
        <div className="sim-card">
          <h3>Each fix moves the responsibility somewhere</h3>
          <ul className="t">
            <li>
              <b>Scoped roles</b> move the work to whoever assigns them. Someone has to remember to remove "auditor at Acme" when the audit ends.
            </li>
            <li>
              <b>ABAC</b> moves it to the attribute sources. A policy is only as right as the attributes it's given, and copies go stale.
            </li>
            <li>
              <b>ReBAC</b> moves it to keeping tuples in step with your data. If the app moves a document but fails to write the new parent tuple, the graph is wrong. Write
              both reliably, for example through the <Link to="/patterns/finance/outbox">Transactional Outbox</Link>.
            </li>
            <li>
              <b>Snapshot tokens</b> move it to every write path. Each place that saves content must save a token, and each check on that content must pass it. Most checks don't
              need one, which is what keeps them fast.
            </li>
            <li>
              <b>The API</b> still has to call the check on every path, including exports, search results and background jobs. A model that isn't asked protects nothing.
            </li>
          </ul>
        </div>
      </section>

      <section id="products" aria-labelledby="k1" className="sim-section">
        <h2 id="k1">How real products do it</h2>
        <p className="sim-lede">Three open-source options cover most designs. Check their documentation for your version: the details below are from their docs at the time of writing.</p>
        <div className="sim-card">
          <h3>OpenFGA: relationships, with conditions</h3>
          <p>
            OpenFGA describes itself as inspired by Zanzibar, and it is owned by the Cloud Native Computing Foundation. A model is written in its DSL, and conditions are written in
            CEL:
          </p>
          <pre className="sim-block">{`model
  schema 1.1

type user
type company
  relations
    define member: [user]
    define approver: [user with within_limit]
type folder
  relations
    define company: [company]
    define viewer: [user] or member from company
type doc
  relations
    define parent: [folder]
    define viewer: viewer from parent

condition within_limit(amount: int, limit: int) {
  amount <= limit
}`}</pre>
          <p className="sim-small">
            For freshness, OpenFGA's docs describe a consistency option: the default serves queries from a cache when possible, and <code>HIGHER_CONSISTENCY</code> skips the
            cache. They say Zanzibar's zookies are being considered for a future release. "Not your own payment" would need the creator passed in as context too, or a separate rule.
          </p>
        </div>
        <div className="sim-card">
          <h3>SpiceDB: relationships, with snapshot tokens</h3>
          <p>
            SpiceDB is also based on the Zanzibar paper. Its <b>ZedToken</b> is its version of the zookie: writes return one, and a check can ask for data{' '}
            <code>at_least_as_fresh</code> as that token, or <code>fully_consistent</code>. Its <b>caveats</b> are CEL expressions attached to relationships, like the
            conditions above.
          </p>
        </div>
        <div className="sim-card">
          <h3>Cedar: policies over attributes</h3>
          <p>
            Cedar is a policy language designed for RBAC and ABAC. Requests are denied unless a <code>permit</code> policy allows them, and any matching <code>forbid</code>{' '}
            overrides every permit. That suits rules such as "never your own payment":
          </p>
          <pre className="sim-block">{`forbid (principal, action == Action::"approve", resource)
when { resource.createdBy == principal };

permit (principal in Role::"approver", action == Action::"approve", resource)
when { resource.company == principal.company && resource.amount <= principal.approvalLimit };`}</pre>
        </div>
      </section>

      <section id="real" aria-labelledby="r1" className="sim-section">
        <h2 id="r1">How do you build this for real?</h2>
        <p className="sim-lede">The debugger shows the logic. These details decide whether a real implementation holds up.</p>
        <div className="sim-card">
          <h3>Decide in one place, enforce everywhere</h3>
          <p>
            NIST SP 800-162 names the two halves: a <b>policy decision point</b> (PDP) that decides, and a <b>policy enforcement point</b> (PEP) that applies the decision. In the
            debugger, the authorization service is the decision point and the API is the enforcement point.
          </p>
          <pre className="sim-block">{`fun approvePayment(user, paymentId) {
  val payment = payments.find(paymentId) ?: return 404
  val ok = authz.check(user, "approve", payment,
                       context = mapOf("amount" to payment.amount, "creator" to payment.createdBy))
  if (!ok) return 403                          // deny by default: an error is a no
  payments.approve(paymentId, by = user)       // same transaction re-checks creator != user
  audit.log(user, "approve", paymentId, ok)
}`}</pre>
        </div>
        <div className="sim-card">
          <h3>What catches people in production</h3>
          <ul className="t">
            <li>
              <b>Lists and search.</b> Checking 10,000 rows one by one is slow, and filtering after the fact breaks paging. Use a "list objects" query from the ReBAC system, or push
              the rule into the database query, for example with row-level security.
            </li>
            <li>
              <b>Failing open.</b> If the authorization service is down, the answer must be no. A fallback of "allow" is what attackers wait for.
            </li>
            <li>
              <b>Role explosion.</b> When you see roles like "approver-eu-under-10k", the rule wanted to be an attribute or a condition.
            </li>
            <li>
              <b>Cached decisions.</b> Caching "allowed" for minutes undoes every revocation. Cache the data with versions, not the answers, or keep the time short and say so.
            </li>
            <li>
              <b>Tenant checks only in the UI.</b> Every query must carry the tenant, and the tenant must come from the credential, never from the request body.
            </li>
            <li>
              <b>Nobody can answer "who has access?"</b> Reviewers and regulators ask it. RBAC and ReBAC can answer it, and ABAC needs extra tooling. Plan for it early.
            </li>
          </ul>
        </div>
      </section>

      <section aria-labelledby="w3" className="sim-section">
        <h2 id="w3">Words from this page</h2>
        <dl className="gl">
          <dt>Authorization</dt>
          <dd>Deciding what an authenticated user may do.</dd>
          <dt>RBAC</dt>
          <dd>Role-based access control: permissions belong to roles, and users are given roles.</dd>
          <dt>Scoped role</dt>
          <dd>A role granted within one tenant or project, such as "approver at Acme".</dd>
          <dt>ABAC</dt>
          <dd>Attribute-based access control: rules over facts about the user, resource, action and environment.</dd>
          <dt>ReBAC</dt>
          <dd>Relationship-based access control: access follows stored relationships between users and objects.</dd>
          <dt>Relation tuple</dt>
          <dd>One stored relationship, written object#relation@user, such as folder:audit#viewer@user:frank.</dd>
          <dt>Condition, or caveat</dt>
          <dd>A rule attached to a relationship and evaluated at check time, such as an amount limit.</dd>
          <dt>Four-eyes rule</dt>
          <dd>Whoever creates a payment can't approve it. Also called separation of duties.</dd>
          <dt>PDP and PEP</dt>
          <dd>Policy decision point, which decides, and policy enforcement point, which applies the decision.</dd>
          <dt>Tenant</dt>
          <dd>One customer whose data must stay separate from every other customer's.</dd>
          <dt>Replica</dt>
          <dd>A copy of a database that follows the primary, usually a little behind.</dd>
          <dt>New enemy problem</dt>
          <dd>The Zanzibar paper's name for applying old permissions to new content, or applying permission changes out of order.</dd>
          <dt>Zookie, or snapshot token</dt>
          <dd>A token saved with content, so that checks on it use permission data at least as fresh as that content.</dd>
          <dt>Role explosion</dt>
          <dd>Inventing a new role for each combination of conditions, until nobody can review them.</dd>
        </dl>
      </section>

      <section aria-labelledby="w4" className="sim-section">
        <h2 id="w4">Say it in the interview</h2>
        <div className="sim-say">
          "I'd pick the model from the questions the product has to answer. Job functions, like support or risk, are roles, scoped to the tenant. Rules about values, like
          approval limits and never approving your own payment, are attribute rules or conditions. Sharing, folders and groups are relationships, and I'd store them as tuples
          in something Zanzibar-like, such as OpenFGA or SpiceDB, so a move or an unshare is one write. Decisions come from one service, the API enforces them on every path
          and denies on error, and lists use a list-objects query or row-level security rather than checking rows one by one. And I'd watch freshness: checks usually read
          replicas, so for content written after a permission change I'd store a snapshot token with the content, like Zanzibar's zookie, and require the check to be at least
          that fresh."
        </div>
        <p className="sim-muted sim-small">
          Follow-up they may ask: "Why not just ABAC for everything?" It's hard to answer "who can see this?", and relationships copied into attributes go stale. Follow-up #2:
          "How do you stop one tenant reading another's data?" The tenant comes from the credential, every query is scoped, with row-level security as a second line. Follow-up
          #3: "What if the authorization service is down?" Deny, and keep it highly available, because every request depends on it. Follow-up #4: "How do you revoke quickly?"
          Short-lived caches with versions, and snapshot tokens where a stale answer would leak new content.
        </p>
      </section>

      <div className="sim-footer">
        The simulation is deterministic and simplified. The replica is exactly one change behind for one request, and is otherwise up to date. Documents and payments are
        labelled with short IDs. The rules use a pseudocode, and the ReBAC model is written in an OpenFGA-like style rather than any product's exact syntax. Real ABAC engines
        can load related objects at check time, which is following a relationship. Sources: NIST SP 800-162; the NIST RBAC project page and ANSI INCITS 359; "Zanzibar: Google's
        Consistent, Global Authorization System", USENIX ATC 2019; OpenFGA, SpiceDB and Cedar documentation.
      </div>
    </div>
  )
}
