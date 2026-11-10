// Part 3 of the RBAC vs ABAC vs ReBAC page: one day at a business-banking app, through five ways of deciding access.
export type Mode = 'rbac' | 'scoped' | 'abac' | 'rebac' | 'fresh'

// Actor ids reuse the colour classes in sim.css.
export type Actor = 'cons' | 'svc' | 'relay'
export type Pane = 'admin' | 'api' | 'authz' | 'model'
export type CodeLine = { id: string; code: string; breakable: boolean }

const line = (id: string, code: string): CodeLine => ({ id, code, breakable: false })
const isRebac = (m: Mode) => m === 'rebac' || m === 'fresh'
const isRbac = (m: Mode) => m === 'rbac' || m === 'scoped'

export const clockText = (minutes: number) => {
  const total = 9 * 60 + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}
export const fmt = (n: number) => `$${n.toLocaleString('en-US')}`

// ---- the people and the things they ask for
type User = { id: string; name: string; company: string; roles: string[]; limit: number | null }
export const USERS: Record<string, User> = {
  carol: { id: 'carol', name: 'Carol', company: 'acme', roles: ['accountant', 'approver'], limit: 10000 },
  erin: { id: 'erin', name: 'Erin', company: 'acme', roles: ['approver'], limit: 100000 },
  frank: { id: 'frank', name: 'Frank', company: 'auditco', roles: [], limit: null },
}
type Resource = { id: string; kind: 'invoice' | 'payment' | 'doc'; company: string; title: string; amount?: number; createdBy?: string }
const RES: Record<string, Resource> = {
  'inv-1': { id: 'inv-1', kind: 'invoice', company: 'acme', title: "Acme's invoice" },
  'inv-9': { id: 'inv-9', kind: 'invoice', company: 'globex', title: "Globex's invoice" },
  'pay-1': { id: 'pay-1', kind: 'payment', company: 'acme', title: '$50,000 payment', amount: 50000, createdBy: 'carol' },
  'doc-1': { id: 'doc-1', kind: 'doc', company: 'acme', title: 'Q3 ledger' },
  'doc-2': { id: 'doc-2', kind: 'doc', company: 'acme', title: 'payroll' },
  'doc-4': { id: 'doc-4', kind: 'doc', company: 'acme', title: 'audit findings' },
}

// ---- code
function adminCode(m: Mode): CodeLine[] {
  const e2 = isRebac(m) ? "tuples.write('folder:audit#viewer@user:frank')" : m === 'abac' ? "for (d in docs.inFolder('audit')) d.sharedWith += 'frank'   // copied onto each document" : `roles.assign('frank', 'auditor'${m === 'scoped' ? ", scope = 'acme'" : ''})`
  const e3 = isRebac(m) ? "tuples.write('doc:doc-1#parent@folder:board')   // replaces the old parent" : m === 'abac' ? "docs.move('doc-1', to = 'board')   // sharedWith stays on the document" : "docs.move('doc-1', to = 'board')"
  const e4 = isRebac(m) ? "tuples.delete('folder:audit#viewer@user:frank')" : m === 'abac' ? "for (d in docs.inFolder('audit')) d.sharedWith -= 'frank'" : `roles.remove('frank', 'auditor'${m === 'scoped' ? ", scope = 'acme'" : ''})`
  const e5 = m === 'fresh' ? "docs.write('doc-4', \"acquisition plan…\", token = authz.snapshot())   // stored with the content" : "docs.write('doc-4', \"acquisition plan…\")"
  return [
    line('e0', '// what happens at Acme during the day'),
    line('e1', "payments.create('pay-1', 50000, createdBy = 'carol')"),
    line('e2', e2),
    line('e3', e3),
    line('e4', e4),
    line('e5', e5),
  ]
}

function apiCode(m: Mode): CodeLine[] {
  return [
    line('h1', 'fun handle(user, action, res) {'),
    line('h2', `  val allowed = authz.check(user, action, res${m === 'fresh' ? ', atLeast = res.token' : ''})`),
    line('h3', '  if (!allowed) return 403'),
    line('h4', '  return 200 with res'),
    line('h5', '}'),
  ]
}

function authzCode(m: Mode): CodeLine[] {
  const head = line('k1', `fun check(user, action, res${m === 'fresh' ? ', atLeast' : ''}) {`)
  const tail = line('k4', '}')
  if (isRbac(m))
    return [head, line('k2', `  val roles = replica.rolesOf(user${m === 'scoped' ? ', scope = res.company' : ''})`), line('k3', '  return roles.any { action in PERMISSIONS[it] }'), tail]
  if (m === 'abac') return [head, line('k2', '  val u = replica.attributesOf(user)'), line('k2r', '  val r = replica.attributesOf(res)'), line('k3', '  return POLICY[action](u, r)'), tail]
  return [
    head,
    line('k2', '  val relation = RELATION[action]   // read → viewer, approve → approver'),
    ...(m === 'fresh' ? [line('k2s', '  val store = if (replica.version >= atLeast) replica else primary')] : []),
    line('k3', `  return ${m === 'fresh' ? 'store' : 'replica'}.reachable(res, relation, user, context = res)`),
    tail,
  ]
}

function modelCode(m: Mode): CodeLine[] {
  if (isRbac(m)) return [line('m1', 'PERMISSIONS = {'), line('m2', '  accountant: [read],'), line('m3', '  approver:   [read, approve],'), line('m4', '  auditor:    [read] }')]
  if (m === 'abac')
    return [
      line('m1', 'POLICY.read = { u, r -> u.company == r.company || u.id in r.sharedWith }'),
      line('m2', 'POLICY.approve = { u, r -> u.company == r.company && "approver" in u.roles'),
      line('m3', '  && r.createdBy != u.id && r.amount <= u.approvalLimit }'),
    ]
  return [
    line('m1', 'type invoice { define viewer: member from company }'),
    line('m2', 'type payment { define approver: approver from company }'),
    line('m3', 'condition within_limit(amount, limit, creator, user) { amount <= limit && creator != user }'),
    line('m4', 'type folder  { define viewer: [user] or member from company }'),
    line('m5', 'type doc     { define viewer: viewer from parent }'),
  ]
}

const MODES: Mode[] = ['rbac', 'scoped', 'abac', 'rebac', 'fresh']
export const CODE = Object.fromEntries(MODES.map((m) => [m, { admin: adminCode(m), api: apiCode(m), authz: authzCode(m), model: modelCode(m) }])) as Record<Mode, Record<Pane, CodeLine[]>>

const PANE_PREFIX: Record<Pane, string> = { admin: 'E', api: 'A', authz: 'Z', model: 'M' }
export function lineRef(id: string, mode: Mode): string {
  for (const pane of ['admin', 'api', 'authz', 'model'] as Pane[]) {
    const i = CODE[mode][pane].findIndex((l) => l.id === id)
    if (i >= 0) return `${PANE_PREFIX[pane]}${i + 1}`
  }
  return ''
}

// ---- state
export type RoleRow = { user: string; role: string; scope: string | null }
export type AuthzData = { roles: RoleRow[]; sharedWith: Record<string, string[]>; tuples: string[] }
export type Doc = { id: string; title: string; folder: string; content: string; token: number | null }
export type Req = { id: string; who: string; what: string; expected: 'allow' | 'deny'; got: 'allow' | 'deny' }
type LogEntry = { actor: Actor | 'system'; text: string }

export type SimState = {
  clock: number
  primary: AuthzData
  replica: AuthzData
  version: number
  replicaVersion: number
  pending: string | null
  docs: Doc[]
  payments: { id: string; amount: number; createdBy: string; approvedBy: string | null }[]
  requests: Req[]
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
  before?: Record<string, string>
  req?: string
}

const BASE_TUPLES = [
  'company:acme#member@user:carol',
  'company:acme#member@user:erin',
  'company:acme#approver@user:carol {limit: 10000}',
  'company:acme#approver@user:erin {limit: 100000}',
  'invoice:inv-1#company@company:acme',
  'invoice:inv-9#company@company:globex',
  'payment:pay-1#company@company:acme',
  'folder:audit#company@company:acme',
  'folder:hr#company@company:acme',
  'folder:board#company@company:acme',
  'doc:doc-1#parent@folder:audit',
  'doc:doc-2#parent@folder:hr',
  'doc:doc-4#parent@folder:audit',
]

// ---- invariants
export type CheckResult = [name: string, detail: string, status: 'ok' | 'bad' | 'wait']
const INVARIANTS: { name: string; detail: string; reqs: string[] }[] = [
  { name: "No company sees another's data", detail: "Carol can't open Globex's invoice", reqs: ['R2'] },
  { name: 'Nobody approves their own payment, or above their limit', detail: 'Carol created the $50,000 payment, and her limit is $10,000', reqs: ['R3'] },
  { name: 'An outside auditor sees only what was shared', detail: 'Frank was given one folder: not payroll, and not a document moved out of it', reqs: ['R6', 'R7'] },
  { name: 'Removing access protects what is written afterwards', detail: 'Frank was removed before the acquisition plan was added', reqs: ['R9'] },
]
export function checks(s: SimState): CheckResult[] {
  return INVARIANTS.map((inv) => {
    const done = inv.reqs.map((id) => s.requests.find((r) => r.id === id))
    if (done.some((r) => !r)) return [inv.name, inv.detail, 'wait']
    return [inv.name, inv.detail, done.some((r) => r!.got !== r!.expected) ? 'bad' : 'ok']
  })
}
export const verdictIsBad = (s: SimState) => checks(s).some((c) => c[2] === 'bad')

export function verdictText(mode: Mode, s: SimState): string {
  const wrong = s.requests.filter((r) => r.got !== r.expected).map((r) => r.id)
  const has = (id: string) => wrong.includes(id)
  const parts: string[] = []
  if (has('R2')) parts.push("Carol read Globex's invoice, because a role says what you can do, not where.")
  if (has('R3')) parts.push('Carol approved her own $50,000 payment: "approver" was all the check asked.')
  if (has('R6') && has('R7')) parts.push('Frank, an outside auditor, read payroll and a document moved out of his folder: a role covers everything of its kind.')
  else if (has('R7')) parts.push('Frank still read the Q3 ledger after it moved out of his folder, because the sharing was copied onto the document and stayed there.')
  if (has('R9')) parts.push('Frank read the acquisition plan, written after his access was removed, because the check read a replica that had not caught up yet.')
  const lesson: Record<Mode, string> = {
    rbac: 'Global roles answer "what kind of thing can this person do?" and nothing else.',
    scoped: 'Scoping roles to a company fixes the tenant leak. A role still can\'t say "not your own payment", "up to $10,000", or "this one folder".',
    abac: 'Rules over attributes handle the payment limits well. But sharing a folder is a relationship, and copying it onto documents goes stale.',
    rebac: 'Relationships answer "who can see this, through what", and moving a document changes one tuple. The last gap is not the model, but how fresh the data is.',
    fresh: '',
  }
  if (!parts.length)
    return 'Every check holds. Tenancy and sharing come from relationships, the payment rule from a condition, and the content write carried a snapshot token, so the check could not use data older than the removal. This depends on every write path saving a token, and on the check honouring it.'
  return `${parts.join(' ')} ${lesson[mode]}`
}

const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))

const INTRO: Record<Mode, string> = {
  rbac: 'Each user has roles, and each role allows some actions. Roles are global.',
  scoped: 'The same roles, but each one is granted within one company.',
  abac: 'Rules compare attributes of the user and the resource, such as company, creator, amount and who it is shared with.',
  rebac: 'Access follows relationships stored as tuples: who belongs to which company, which folder holds which document, and who can view which folder. A condition covers the payment limit.',
  fresh: 'The same relationships. When content changes, the app stores a snapshot token with it, and checks on that content must use data at least that fresh.',
}

type Eval = { line: string; title: string; text: string }

export function build(mode: Mode): Step[] {
  const s: SimState = {
    clock: 0,
    primary: { roles: [], sharedWith: {}, tuples: [] },
    replica: { roles: [], sharedWith: {}, tuples: [] },
    version: 1,
    replicaVersion: 1,
    pending: null,
    docs: [
      { id: 'doc-1', title: 'Q3 ledger', folder: 'audit', content: 'ledger figures', token: null },
      { id: 'doc-2', title: 'payroll', folder: 'hr', content: 'salaries', token: null },
      { id: 'doc-4', title: 'audit findings', folder: 'audit', content: 'findings so far', token: null },
    ],
    payments: [],
    requests: [],
    settled: false,
    log: [],
  }
  if (isRbac(mode)) {
    const scope = mode === 'scoped' ? 'acme' : null
    s.primary.roles = [
      { user: 'carol', role: 'accountant', scope },
      { user: 'carol', role: 'approver', scope },
      { user: 'erin', role: 'approver', scope },
    ]
  } else if (mode === 'abac') s.primary.sharedWith = { 'doc-1': [], 'doc-2': [], 'doc-4': [] }
  else s.primary.tuples = [...BASE_TUPLES]
  s.replica = clone(s.primary)

  const steps: Step[] = [
    {
      s: clone(s),
      line: null,
      actor: null,
      label: 'start',
      title: 'Ready',
      text: `${INTRO[mode]} The day is the same in every mode: Carol and Erin work at Acme, Frank is an outside auditor, and nine requests come in. Each one shows what it should get. Press Step to follow them.`,
      crash: false,
      locals: {},
    },
  ]

  let locals: Record<string, string> = {}
  const setLocal = (name: string, value: string) => {
    locals = { ...locals, [name]: value }
  }
  const NAME: Record<Actor, string> = { cons: 'Acme', svc: 'API', relay: 'Authorization' }
  let afterCall: Record<string, string> | null = null
  const push = (id: string | null, actor: Actor | 'system', label: string, title: string, text: string, fn?: (st: SimState) => void, req?: string) => {
    if (fn) fn(s)
    const who = actor === 'system' ? 'system' : NAME[actor]
    s.log.push({ actor, text: `[${clockText(s.clock)}] [${who}] ${title}` })
    const before = actor === 'svc' && afterCall ? afterCall : undefined
    if (actor === 'svc') afterCall = null
    steps.push({ s: clone(s), line: id, actor, label, title, text, crash: false, locals: actor === 'system' ? {} : { ...locals }, ...(before ? { before } : {}), ...(req ? { req } : {}) })
  }

  // An admin change to the permission data: written to the primary, then copied to the replica.
  const adminWrite = (id: string, title: string, text: string, change: (d: AuthzData) => void, lagging = false) => {
    locals = {}
    push(id, 'cons', 'change', title, text, (st) => {
      change(st.primary)
      st.version++
      if (lagging) st.pending = title
      else {
        change(st.replica)
        st.replicaVersion = st.version
      }
    })
  }

  // ---- the evaluation, per model, as a list of highlighted lines
  const evaluate = (u: User, action: 'read' | 'approve', r: Resource, data: AuthzData): { allowed: boolean; steps: Eval[]; loaded: Record<string, string> } => {
    if (isRbac(mode)) {
      const scope = mode === 'scoped' ? r.company : null
      const roles = data.roles.filter((x) => x.user === u.id && (scope === null || x.scope === scope)).map((x) => x.role)
      const perms: Record<string, string[]> = { accountant: ['read'], approver: ['read', 'approve'], auditor: ['read'] }
      const lineOf: Record<string, string> = { accountant: 'm2', approver: 'm3', auditor: 'm4' }
      const granting = roles.find((x) => perms[x].includes(action))
      const evals: Eval[] = granting
        ? [{ line: lineOf[granting], title: `'${granting}' allows ${action}`, text: mode === 'scoped' ? `A role at ${r.company}, so it applies here. Nothing else is asked.` : `The role is all that's checked. Nothing asks whose ${r.kind} this is.` }]
        : roles.length
          ? [{ line: lineOf[roles[0]], title: `'${roles[0]}' doesn't allow ${action}`, text: 'No role grants this action.' }]
          : [{ line: 'm1', title: mode === 'scoped' ? `No roles at ${r.company}` : 'No roles at all', text: mode === 'scoped' ? `${u.name}'s roles belong to ${u.company === 'auditco' ? 'Acme, granted to an outsider' : 'Acme'}. This ${r.kind} belongs to ${r.company}.` : 'Nothing to look up.' }]
      return { allowed: !!granting, steps: evals, loaded: { roles: `[${roles.map((x) => `'${x}'`).join(', ')}]${scope ? ` at '${scope}'` : ''}` } }
    }
    if (mode === 'abac') {
      const shared = data.sharedWith[r.id] ?? []
      const uText = `{ company: '${u.company}', roles: [${u.roles.map((x) => `'${x}'`).join(', ')}]${u.limit ? `, approvalLimit: ${fmt(u.limit)}` : ''} }`
      const rText = `{ company: '${r.company}'${r.kind === 'doc' ? `, sharedWith: [${shared.map((x) => `'${x}'`).join(', ')}]` : ''}${r.amount ? `, amount: ${fmt(r.amount)}, createdBy: '${r.createdBy}'` : ''} }`
      if (action === 'read') {
        const same = u.company === r.company
        const viaShare = shared.includes(u.id)
        return {
          allowed: same || viaShare,
          steps: [
            {
              line: 'm1',
              title: same ? 'Same company: allowed' : viaShare ? `Different company, but '${u.id}' is in sharedWith: allowed` : `Different company, and not shared with '${u.id}': denied`,
              text: same ? 'The rule compares two attributes. No role is needed to read your own company\'s data here.' : viaShare ? (r.id === 'doc-1' && s.docs.find((d) => d.id === 'doc-1')!.folder !== 'audit' ? 'The document is no longer in the audit folder, but the copied attribute still names Frank. Nothing updated it when the document moved.' : 'Sharing was copied onto this document when the folder was shared.') : 'Neither condition holds.',
            },
          ],
          loaded: { u: uText, r: rText },
        }
      }
      const first = u.company === r.company && u.roles.includes('approver')
      const notOwn = r.createdBy !== u.id
      const within = (r.amount ?? 0) <= (u.limit ?? 0)
      return {
        allowed: first && notOwn && within,
        steps: [
          { line: 'm2', title: first ? 'Same company, and an approver: so far, yes' : 'Fails the company or role test', text: 'The role is just one attribute among several here.' },
          {
            line: 'm3',
            title: !notOwn ? `'${u.id}' created this payment: denied` : !within ? `${fmt(r.amount!)} is over the ${fmt(u.limit!)} limit: denied` : `Not the creator, and within ${fmt(u.limit!)}: allowed`,
            text: !notOwn ? `It is also over her ${fmt(u.limit!)} limit. Either rule alone would refuse it. This is the four-eyes rule: whoever creates a payment can't approve it.` : 'Two attributes of the resource, compared with two of the user. A role alone could not express this.',
          },
        ],
        loaded: { u: uText, r: rText },
      }
    }
    // ReBAC: follow the tuples
    const t = data.tuples
    const relation = action === 'read' ? 'viewer' : 'approver'
    if (r.kind === 'invoice') {
      const company = t.find((x) => x.startsWith(`invoice:${r.id}#company@`))!.split('@company:')[1]
      const member = t.includes(`company:${company}#member@user:${u.id}`)
      return { allowed: member, steps: [{ line: 'm1', title: member ? `${r.id} → company:${company} → ${u.id} is a member: allowed` : `${r.id} → company:${company}, and ${u.id} is not a member: denied`, text: member ? 'One hop from the invoice to its company, then one membership tuple.' : `There's no path from ${r.id} to ${u.id}. Tenancy is just a relationship like any other.` }], loaded: { relation: `'${relation}'` } }
    }
    if (r.kind === 'payment') {
      const tuple = t.find((x) => x.startsWith(`company:acme#approver@user:${u.id}`))
      const limit = tuple ? Number(tuple.match(/limit: (\d+)/)![1]) : 0
      const ok = !!tuple && (r.amount ?? 0) <= limit && r.createdBy !== u.id
      return {
        allowed: ok,
        steps: [
          { line: 'm2', title: tuple ? `pay-1 → company:acme → ${u.id} is an approver, with a ${fmt(limit)} limit` : `${u.id} is not an approver`, text: 'The relationship says who may approve. The limit is stored on the tuple, as a condition parameter.' },
          { line: 'm3', title: ok ? `${fmt(r.amount!)} ≤ ${fmt(limit)}, and not the creator: allowed` : r.createdBy === u.id ? `${u.id} created it, and ${fmt(r.amount!)} > ${fmt(limit)}: denied` : 'The condition fails: denied', text: 'The condition is evaluated with the payment\'s details, passed in at check time. Relationships and attribute rules work together.' },
        ],
        loaded: { relation: `'${relation}'` },
      }
    }
    const parent = t.find((x) => x.startsWith(`doc:${r.id}#parent@`))!.split('@folder:')[1]
    const direct = t.includes(`folder:${parent}#viewer@user:${u.id}`)
    const member = t.includes(`company:acme#member@user:${u.id}`)
    const ok = direct || member
    return {
      allowed: ok,
      steps: [
        { line: 'm5', title: `${r.id} → its parent is folder:${parent}`, text: "A document's viewers are its folder's viewers, so the check moves up to the folder." },
        { line: 'm4', title: direct ? `folder:${parent} has viewer ${u.id}: allowed` : member ? `${u.id} is a member of Acme: allowed` : `folder:${parent} has no viewer ${u.id}: denied`, text: direct ? (s.pending && parent === 'audit' ? 'The replica still has this tuple. The removal is on the primary, and has not arrived here yet.' : 'One direct tuple, written when the folder was shared.') : member ? 'Members of the company can see its folders.' : r.id === 'doc-1' ? 'The document moved, so its parent tuple changed, and the path to Frank is gone. No copies to clean up.' : `Frank was given the audit folder, not ${parent}.` },
      ],
      loaded: { relation: `'${relation}'` },
    }
  }

  // ---- one request, through the API and the authorization service
  const request = (id: string, userId: string, action: 'read' | 'approve', resId: string, expected: 'allow' | 'deny', why: string) => {
    const u = USERS[userId]
    const r = RES[resId]
    const what = `${action} ${resId}`
    const whyText = why.charAt(0).toUpperCase() + why.slice(1)
    push(null, 'system', id, `${id} · ${u.name} asks to ${action} ${resId}, ${r.title}`, `Should be ${expected === 'allow' ? 'allowed' : 'denied'}: ${why}`)
    locals = { user: `'${u.id}'`, action: `'${action}'`, res: `'${r.id}'` }
    const doc = s.docs.find((d) => d.id === r.id)
    if (mode === 'fresh') setLocal('res.token', doc?.token ? `v${doc.token}` : 'none')
    push('h2', 'svc', 'ask', 'Asks the authorization service', 'The API itself never decides. It enforces what the authorization service answers.')
    const caller = locals
    locals = { user: `'${u.id}'`, action: `'${action}'`, res: `'${r.id}'`, ...(mode === 'fresh' ? { atLeast: doc?.token ? `v${doc.token}` : 'none' } : {}) }
    let data = s.replica
    if (isRebac(mode)) {
      setLocal('relation', action === 'read' ? "'viewer'" : "'approver'")
      push('k2', 'relay', 'relation', `${action} means the '${action === 'read' ? 'viewer' : 'approver'}' relation`, 'The question becomes: is there a path from this object, through that relation, to this user?')
      if (mode === 'fresh') {
        const need = doc?.token ?? 0
        const useReplica = s.replicaVersion >= need
        setLocal('store', useReplica ? 'replica' : 'primary')
        push('k2s', 'relay', useReplica ? 'replica' : 'primary', need ? (useReplica ? `The replica is at v${s.replicaVersion}, and v${need} is needed: the replica will do` : `The replica is at v${s.replicaVersion}, but this content needs v${need}: uses the primary`) : 'No token on this resource: the replica will do', need ? (useReplica ? 'Fresh enough, so the check stays fast.' : 'The content was written after a permission change the replica has not seen. Reading the replica could apply the old permissions to new content.') : 'Most checks are like this: any recent snapshot is fine.')
        if (!useReplica) data = s.primary
      }
    } else {
      const ev = evaluate(u, action, r, data)
      if (isRbac(mode)) {
        setLocal('roles', ev.loaded.roles)
        push('k2', 'relay', 'roles', `Loads ${u.name}'s roles${mode === 'scoped' ? ` at ${r.company}` : ''}: ${ev.loaded.roles.split(' at ')[0]}`, s.pending && u.id === 'frank' ? "From the replica, which hasn't applied Frank's removal yet." : 'Read from a replica, as most systems do for speed.')
      } else {
        setLocal('u', ev.loaded.u)
        push('k2', 'relay', 'user', `Loads ${u.name}'s attributes`, 'Company, roles and limit, from the user directory.')
        setLocal('r', ev.loaded.r)
        push('k2r', 'relay', 'resource', `Loads ${r.id}'s attributes`, s.pending && u.id === 'frank' ? "From the replica, which hasn't applied Frank's removal yet." : 'Whatever the policy needs to know about the resource.')
      }
    }
    const ev = evaluate(u, action, r, data)
    for (const e of ev.steps) push(e.line, 'relay', ev.allowed ? 'allow' : 'deny', e.title, e.text)
    push('k3', 'relay', 'return', `Returns ${ev.allowed}`, ev.allowed === (expected === 'allow') ? 'The answer this request should get.' : `The wrong answer: this should be ${expected === 'allow' ? 'allowed' : 'denied'}.`)
    locals = caller
    afterCall = { ...caller }
    setLocal('allowed', String(ev.allowed))
    afterCall = { ...afterCall, allowed: String(ev.allowed) }
    const record = (st: SimState) => {
      st.requests.push({ id, who: u.name, what, expected, got: ev.allowed ? 'allow' : 'deny' })
    }
    if (!ev.allowed) {
      push('h3', 'svc', '403', 'Returns 403', expected === 'deny' ? 'Correctly refused.' : 'A legitimate request was refused.', record, id)
    } else {
      push('h3', 'svc', 'check', 'Allowed: condition is false', 'The request goes on.')
      const content = doc ? ` (${doc.content})` : ''
      push('h4', 'svc', '200', `Returns 200: ${u.name} gets ${r.title}${content}`, expected === 'allow' ? 'Correct.' : `This should have been refused. ${whyText}`, record, id)
    }
    locals = {}
  }

  const time = (min: number, title: string, text: string) =>
    push(null, 'system', 'time', title, text, (st) => {
      st.clock = min
    })

  // ---- the day
  request('R1', 'carol', 'read', 'inv-1', 'allow', 'she is an accountant at Acme, and this is Acme\'s invoice.')
  request('R2', 'carol', 'read', 'inv-9', 'deny', 'it belongs to Globex, another customer of the bank.')
  time(30, 'Carol prepares a supplier payment', 'Acme requires a second person to approve payments.')
  locals = {}
  push('e1', 'cons', 'create', 'Carol creates pay-1: $50,000', 'Her own approval limit is $10,000.', (st) => {
    st.payments.push({ id: 'pay-1', amount: 50000, createdBy: 'carol', approvedBy: null })
  })
  request('R3', 'carol', 'approve', 'pay-1', 'deny', 'she created it herself, and it is over her $10,000 limit.')
  request('R4', 'erin', 'approve', 'pay-1', 'allow', 'Erin is an approver with a $100,000 limit, and she did not create it.')
  time(60, 'The yearly audit starts', 'Acme gives Frank, from an outside audit firm, access to its "audit" folder, and only that.')
  adminWrite(
    'e2',
    isRebac(mode) ? 'Writes one tuple: Frank views the audit folder' : mode === 'abac' ? 'Adds Frank to sharedWith on each document in the folder' : `Gives Frank the auditor role${mode === 'scoped' ? ' at Acme' : ''}`,
    isRebac(mode) ? 'A single fact about the folder. The documents inside will inherit it through their parent.' : mode === 'abac' ? 'Policies only see the document\'s own attributes, so the folder\'s sharing is copied onto doc-1 and doc-4.' : `A role is the only tool here. "Auditor" can read, but a role can't name one folder.`,
    (d) => {
      if (isRebac(mode)) d.tuples.push('folder:audit#viewer@user:frank')
      else if (mode === 'abac') for (const id of ['doc-1', 'doc-4']) d.sharedWith[id] = [...(d.sharedWith[id] ?? []), 'frank']
      else d.roles.push({ user: 'frank', role: 'auditor', scope: mode === 'scoped' ? 'acme' : null })
    },
  )
  request('R5', 'frank', 'read', 'doc-1', 'allow', 'the Q3 ledger is in the audit folder he was given.')
  request('R6', 'frank', 'read', 'doc-2', 'deny', 'payroll is in the HR folder, which was not shared with him.')
  time(120, 'Acme moves the Q3 ledger to the board folder', 'The board wants to discuss it privately before the auditors see the final version.')
  locals = {}
  push('e3', 'cons', 'move', 'Moves doc-1 from audit to board', isRebac(mode) ? 'Its parent tuple now points to the board folder. Nothing else changes.' : mode === 'abac' ? "The document's folder changes. Its copied sharedWith attribute does not." : 'The document moves. Roles have nothing to say about folders.', (st) => {
    st.docs.find((d) => d.id === 'doc-1')!.folder = 'board'
    if (isRebac(mode)) {
      for (const data of [st.primary, st.replica]) data.tuples = data.tuples.map((x) => (x === 'doc:doc-1#parent@folder:audit' ? 'doc:doc-1#parent@folder:board' : x))
      st.version++
      st.replicaVersion = st.version
    }
  })
  request('R7', 'frank', 'read', 'doc-1', 'deny', 'it is in the board folder now, which was never shared with him.')
  request('R8', 'frank', 'read', 'doc-4', 'allow', 'the audit findings are still in his folder.')
  time(240, 'The audit ends: Acme removes Frank', 'Then, seconds later, a manager adds the acquisition plan to the audit findings.')
  adminWrite(
    'e4',
    isRebac(mode) ? "Deletes Frank's tuple on the audit folder" : mode === 'abac' ? 'Removes Frank from sharedWith on the documents in the folder' : `Removes Frank's auditor role${mode === 'scoped' ? ' at Acme' : ''}`,
    `Written to the primary at v${s.version + 1}. The replica copies it a few seconds later.${mode === 'abac' ? ' doc-1 is not in the folder any more, so it keeps Frank in its sharedWith for good.' : ''}`,
    (d) => {
      if (isRebac(mode)) d.tuples = d.tuples.filter((x) => x !== 'folder:audit#viewer@user:frank')
      else if (mode === 'abac') d.sharedWith['doc-4'] = (d.sharedWith['doc-4'] ?? []).filter((x) => x !== 'frank')
      else d.roles = d.roles.filter((x) => x.user !== 'frank')
    },
    true,
  )
  locals = {}
  if (mode === 'fresh') setLocal('token', `v${s.version}`)
  push('e5', 'cons', 'write', 'Adds the acquisition plan to doc-4', mode === 'fresh' ? `Saved together with token v${s.version}: the permission data's version at the moment of the write. Any check on this content must use data at least that fresh.` : 'A content change, in the document store. The authorization service knows nothing about it.', (st) => {
    const d = st.docs.find((x) => x.id === 'doc-4')!
    d.content = 'acquisition plan'
    if (mode === 'fresh') d.token = st.version
  })
  request('R9', 'frank', 'read', 'doc-4', 'deny', 'his access was removed before the plan was written.')
  time(241, 'A few seconds later, the replica catches up', 'Every check from now on would refuse Frank. The plan has already been read.')
  steps[steps.length - 1].s = clone({ ...s, replica: clone(s.primary), replicaVersion: s.version, pending: null })
  s.replica = clone(s.primary)
  s.replicaVersion = s.version
  s.pending = null

  s.settled = true
  locals = {}
  push(null, 'system', 'end', 'Run finished', verdictText(mode, s))
  return steps
}

export type Experiment = { label: string; title: string; mode: Mode; req: string }

export const EXPERIMENTS: Experiment[] = [
  { label: 'A role has no tenant', title: "With global roles, Carol's accountant role reads Globex's invoice.", mode: 'rbac', req: 'R2' },
  { label: 'Approving your own payment', title: 'Scoped roles fix tenancy, but "approver" lets Carol approve her own $50,000 payment.', mode: 'scoped', req: 'R3' },
  { label: 'An auditor reads payroll', title: 'A role can\'t name one folder, so Frank\'s auditor role reads all of Acme\'s documents.', mode: 'scoped', req: 'R6' },
  { label: 'The limit, as a rule', title: 'ABAC refuses Carol: she created the payment, and it is over her limit.', mode: 'abac', req: 'R3' },
  { label: 'A copy that goes stale', title: 'The ledger moved out of the shared folder, but its copied sharedWith still names Frank.', mode: 'abac', req: 'R7' },
  { label: 'Moving changes one tuple', title: "With ReBAC, the moved ledger's parent changed, and Frank's path to it is gone.", mode: 'rebac', req: 'R7' },
  { label: 'The new enemy', title: 'Frank is removed, then the plan is written. The replica has not caught up, and he reads it.', mode: 'rebac', req: 'R9' },
  { label: 'A snapshot token', title: 'The plan was saved with a token, so the check refuses the stale replica and reads the primary.', mode: 'fresh', req: 'R9' },
]
