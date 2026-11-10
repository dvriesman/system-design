import { useState } from 'react'

// Part 1 of the RBAC vs ABAC vs ReBAC page: each model from scratch, then one widget that asks all three the same question.
type Model = 'rbac' | 'abac' | 'rebac'
type LabStep = { title: string; text: string; data: string; question: string; answer: string; ok: boolean }

const SCRIPTS: Record<Model, { label: string; idea: string; steps: LabStep[] }> = {
  rbac: {
    label: '1 · RBAC: roles',
    idea: 'Role-based access control. Permissions are attached to roles, and people are given roles. To decide, look up the person\'s roles, and check whether any of them allows the action.',
    steps: [
      { title: 'Two tables', text: 'One says what each role may do. The other says who has which role. Nobody is given a permission directly.', data: 'PERMISSIONS\n  accountant → read\n  approver   → read, approve\n\nASSIGNMENTS\n  carol → accountant, approver\n  erin  → approver', question: '—', answer: 'nothing asked yet', ok: true },
      { title: 'Can Carol read invoice inv-1?', text: 'Carol has "accountant", and "accountant" allows read. Two lookups, and easy to audit: "who can approve?" is one query.', data: 'carol → accountant → read ✓', question: 'carol read inv-1', answer: 'allowed', ok: true },
      { title: 'Can Carol read Globex\'s invoice inv-9?', text: 'The check never looked at the invoice. A role says what kind of action you may take, not on which company\'s data. The usual fix is a role per scope: "accountant at Acme".', data: 'carol → accountant → read ✓\n(the invoice was never looked at)', question: 'carol read inv-9', answer: 'allowed, and it should not be', ok: false },
      { title: 'Can Carol approve her own $50,000 payment?', text: 'She is an approver. Roles can\'t say "not your own" or "up to $10,000". You could invent roles like "approver-under-10k", and that is how role explosion starts.', data: 'carol → approver → approve ✓', question: 'carol approve pay-1', answer: 'allowed, and it should not be', ok: false },
    ],
  },
  abac: {
    label: '2 · ABAC: rules over attributes',
    idea: 'Attribute-based access control. A policy is a set of rules that compare attributes of the user, the resource, the action and sometimes the environment, such as the time. NIST SP 800-162 describes it this way.',
    steps: [
      { title: 'Attributes, and a rule', text: 'Each user and resource carries facts. The rule is code over those facts, so it can say anything you can compute.', data: 'carol: { company: acme, roles: [approver], limit: 10000 }\npay-1: { company: acme, amount: 50000, createdBy: carol }\n\napprove if u.company == r.company\n  && "approver" in u.roles\n  && r.createdBy != u.id\n  && r.amount <= u.limit', question: '—', answer: 'nothing asked yet', ok: true },
      { title: 'Can Carol read Globex\'s invoice?', text: 'The rule compares the two companies. Tenancy is just one more condition.', data: "acme == globex? no", question: 'carol read inv-9', answer: 'denied', ok: true },
      { title: 'Can Carol approve her own $50,000 payment?', text: 'Two conditions fail: she created it, and it is over her limit. This is where ABAC shines: rules about amounts, owners, time and place.', data: 'createdBy == carol ✗\n50000 <= 10000 ✗', question: 'carol approve pay-1', answer: 'denied', ok: true },
      { title: 'Can Frank read a document in a folder shared with him?', text: 'The rule needs to know who the folder was shared with. The document doesn\'t carry that. Either the policy loads the folder too, or someone copies the sharing onto every document. Both are following a relationship, and folders inside folders make it worse.', data: 'doc-1: { folder: audit }\naudit: { sharedWith: [frank] }   ← a second lookup', question: 'frank read doc-1', answer: 'only if the folder is loaded too', ok: false },
    ],
  },
  rebac: {
    label: '3 · ReBAC: relationships',
    idea: 'Relationship-based access control. Facts are stored as relationships, written as tuples such as folder:audit#viewer@user:frank. A model says how relationships imply permissions. Checking means looking for a path. Google described this in its Zanzibar paper.',
    steps: [
      { title: 'Tuples, and a model', text: 'Each tuple is one fact: object, relation, user. The model says that a document\'s viewers are its parent folder\'s viewers.', data: 'doc:doc-1#parent@folder:audit\nfolder:audit#viewer@user:frank\ncompany:acme#member@user:carol\n\ntype doc    { viewer: viewer from parent }\ntype folder { viewer: [user] or member from company }', question: '—', answer: 'nothing asked yet', ok: true },
      { title: 'Can Frank read doc-1?', text: 'Start at the document, follow parent to the folder, and find Frank as a viewer there. A path exists.', data: 'doc:doc-1 → parent folder:audit → viewer user:frank ✓', question: 'frank read doc-1', answer: 'allowed', ok: true },
      { title: 'The ledger moves to the board folder', text: 'One tuple changes: doc-1\'s parent. The path to Frank disappears with it. There is no copy anywhere to clean up.', data: 'doc:doc-1#parent@folder:board\nfolder:board has no viewer frank ✗', question: 'frank read doc-1', answer: 'denied', ok: true },
      { title: 'Can Carol approve her own payment?', text: 'Relationships say who is an approver. "Not your own" and "up to $10,000" are conditions on the data, so ReBAC systems such as OpenFGA and SpiceDB add conditions to tuples. Real designs mix the models.', data: 'company:acme#approver@user:carol {limit: 10000}\ncondition: amount <= limit && creator != user ✗', question: 'carol approve pay-1', answer: 'denied, with a condition', ok: true },
    ],
  },
}

// ---- the widget: one question, three real evaluations
type Facts = { ledgerIn: 'audit' | 'board'; shared: boolean; createdBy: 'carol' | 'dan'; amount: 5000 | 50000 }
type Ask = 'carol-inv9' | 'carol-pay1' | 'frank-doc1' | 'frank-doc2'
const ASKS: { id: Ask; label: string }[] = [
  { id: 'carol-inv9', label: "Carol reads Globex's invoice" },
  { id: 'carol-pay1', label: 'Carol approves pay-1' },
  { id: 'frank-doc1', label: 'Frank reads the Q3 ledger' },
  { id: 'frank-doc2', label: 'Frank reads payroll' },
]

type Answer = { allowed: boolean; trace: string[] }

function rbac(ask: Ask, f: Facts): Answer {
  const roles: Record<string, string[]> = { carol: ['accountant', 'approver'], frank: f.shared ? ['auditor'] : [] }
  const perms: Record<string, string[]> = { accountant: ['read'], approver: ['read', 'approve'], auditor: ['read'] }
  const [user, action, company] = ask === 'carol-inv9' ? ['carol', 'read', 'globex'] : ask === 'carol-pay1' ? ['carol', 'approve', 'acme'] : ['frank', 'read', 'acme']
  const scoped = company === 'acme' ? roles[user] : []
  const role = scoped.find((r) => perms[r].includes(action))
  return {
    allowed: !!role,
    trace: [`roles of ${user} at ${company}: [${scoped.join(', ')}]`, role ? `${role} allows ${action}` : `no role allows ${action}`],
  }
}

function abac(ask: Ask, f: Facts): Answer {
  if (ask === 'carol-inv9') return { allowed: false, trace: ['u.company = acme, r.company = globex', 'not equal, and not shared'] }
  if (ask === 'carol-pay1') {
    const own = f.createdBy === 'carol'
    const over = f.amount > 10000
    return { allowed: !own && !over, trace: [`r.createdBy = ${f.createdBy}${own ? ' = u.id ✗' : ' ✓'}`, `r.amount = $${f.amount.toLocaleString('en-US')} ${over ? '> $10,000 ✗' : '≤ $10,000 ✓'}`] }
  }
  const folder = ask === 'frank-doc1' ? f.ledgerIn : 'hr'
  const shared = folder === 'audit' && f.shared
  return { allowed: shared, trace: ['u.company = auditco ≠ acme', `loads r.folder = ${folder}, then ${folder}.sharedWith = [${shared ? 'frank' : ''}]`] }
}

function rebac(ask: Ask, f: Facts): Answer {
  if (ask === 'carol-inv9') return { allowed: false, trace: ['invoice:inv-9 → company:globex', 'user:carol is not a member ✗'] }
  if (ask === 'carol-pay1') {
    const ok = f.createdBy !== 'carol' && f.amount <= 10000
    return { allowed: ok, trace: ['payment:pay-1 → company:acme → approver user:carol {limit: 10000}', `condition: $${f.amount.toLocaleString('en-US')} ≤ $10,000 && ${f.createdBy} ≠ carol ${ok ? '✓' : '✗'}`] }
  }
  const folder = ask === 'frank-doc1' ? f.ledgerIn : 'hr'
  const ok = folder === 'audit' && f.shared
  return { allowed: ok, trace: [`doc → parent folder:${folder}`, ok ? `folder:${folder}#viewer@user:frank ✓` : `no viewer user:frank on folder:${folder} ✗`] }
}

const EXPECTED = (ask: Ask, f: Facts) =>
  ask === 'carol-inv9' ? false : ask === 'carol-pay1' ? f.createdBy !== 'carol' && f.amount <= 10000 : ask === 'frank-doc1' ? f.ledgerIn === 'audit' && f.shared : false

function Toggle<T extends string | number | boolean>({ label, value, options, set }: { label: string; value: T; options: [T, string][]; set: (v: T) => void }) {
  return (
    <div className="sim-axis">
      <span className="sim-axis-label">{label}</span>
      <div className="sim-seg" role="group" aria-label={label}>
        {options.map(([v, text]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => set(v)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  )
}

function AskWidget() {
  const [ask, setAsk] = useState<Ask>('frank-doc1')
  const [f, setF] = useState<Facts>({ ledgerIn: 'audit', shared: true, createdBy: 'carol', amount: 50000 })
  const expected = EXPECTED(ask, f)
  const set = <K extends keyof Facts>(k: K) => (v: Facts[K]) => setF({ ...f, [k]: v })
  const results: [string, Answer][] = [
    ['RBAC, roles at Acme', rbac(ask, f)],
    ['ABAC', abac(ask, f)],
    ['ReBAC + a condition', rebac(ask, f)],
  ]
  return (
    <div className="sim-store">
      <h3>
        <span>Try it: ask all three the same question</span>
      </h3>
      <div className="sim-seg" role="group" aria-label="Request">
        {ASKS.map((a) => (
          <button key={a.id} type="button" aria-pressed={ask === a.id} onClick={() => setAsk(a.id)}>
            {a.label}
          </button>
        ))}
      </div>
      <Toggle label="Audit folder shared with Frank" value={f.shared} options={[[true, 'yes'], [false, 'no']]} set={set('shared')} />
      <Toggle label="Q3 ledger is in folder" value={f.ledgerIn} options={[['audit', 'audit'], ['board', 'board']]} set={set('ledgerIn')} />
      <Toggle label="pay-1 created by" value={f.createdBy} options={[['carol', 'Carol'], ['dan', 'Dan']]} set={set('createdBy')} />
      <Toggle label="pay-1 amount" value={f.amount} options={[[5000, '$5,000'], [50000, '$50,000']]} set={set('amount')} />
      <div className="az-results">
        {results.map(([name, r]) => (
          <div key={name} className={`az-result ${r.allowed === expected ? 'right' : 'wrong'}`}>
            <span className="sim-tx-name">{name}</span>
            <b>{r.allowed ? 'allowed' : 'denied'}</b>
            {r.trace.map((t) => (
              <code key={t}>{t}</code>
            ))}
            <span className="sim-small">{r.allowed === expected ? 'right answer' : `wrong: should be ${expected ? 'allowed' : 'denied'}`}</span>
          </div>
        ))}
      </div>
      <p className="sim-small sim-muted">
        The ABAC column loads the folder at check time, which is already following a relationship. The RBAC column gives Frank the auditor role at Acme whenever the folder is shared, because a role can't name a folder.
      </p>
    </div>
  )
}

export default function AuthzLab() {
  const [model, setModel] = useState<Model>('rbac')
  const [cur, setCur] = useState(0)
  const script = SCRIPTS[model]
  const safeCur = Math.min(cur, script.steps.length - 1)
  const step = script.steps[safeCur]
  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Model">
          {(Object.keys(SCRIPTS) as Model[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={model === id}
              onClick={() => {
                setModel(id)
                setCur(0)
              }}
            >
              {SCRIPTS[id].label}
            </button>
          ))}
        </div>
        <div className="sim-ctl">
          <button className="sim-btn ghost" type="button" aria-label="Previous step" disabled={safeCur === 0} onClick={() => setCur(safeCur - 1)}>
            ◀
          </button>
          <button className="sim-btn" type="button" disabled={safeCur === script.steps.length - 1} onClick={() => setCur(safeCur + 1)}>
            Next step ▶
          </button>
          <span className="sim-pos">
            {safeCur} / {script.steps.length - 1}
          </span>
        </div>
      </div>
      <p className="sim-lede">{script.idea}</p>
      <div className="sim-narr" aria-live="polite">
        <b className="t">{step.title}</b>
        <span>{step.text}</span>
      </div>
      <div className="sim-store">
        <h3>
          <span>What the check looks at</span>
        </h3>
        <pre className="sim-block">{step.data}</pre>
      </div>
      <div className={`sim-tx-reader ${step.question === '—' ? 'wait' : step.ok ? 'ok' : 'short'}`}>
        {step.question === '—' ? 'No question yet' : step.question}
        <span>{step.answer}</span>
      </div>
      <AskWidget />
    </div>
  )
}
