// Turns the requirements for a pay-later network into an architecture. Every threshold is a rule of thumb for teaching, not a measured limit.
import type { DiagramEdge, DiagramNode, Kind, Zone } from './caseStudyLayout'

export type Functional = {
  inStore: boolean
  app: boolean
  marketplace: boolean
  repayments: boolean
  portal: boolean
  notifications: boolean
  collections: boolean
  onboarding: boolean
  deposits: boolean
}

export type Latency = 1000 | 300 | 100
export type Availability = 99.5 | 99.9 | 99.99
export type Security = 'baseline' | 'hardened' | 'regulated'

export type NonFunctional = {
  customersM: number
  peakFactor: number
  latency: Latency
  instantApproval: boolean
  availability: Availability
  noDataLoss: boolean
  security: Security
  liveUpdates: boolean
  freshReads: boolean
  teams: number
  largestMerchant: number
}

export type Requirements = { f: Functional; n: NonFunctional }

export const CUSTOMER_STEPS = [0.05, 0.1, 0.5, 1, 2, 4, 8, 20, 50, 100]
const PURCHASES_PER_MONTH = 2
export const SHARD_AT = 1500

export type Metrics = {
  peakCheckouts: number
  peakRequests: number
  ledgerRowsPerYear: number
  downtimeMinutes: number
  latencyParts: { name: string; ms: number }[]
  availability: number
}

export type System = { nodes: DiagramNode[]; edges: DiagramEdge[]; zones: Zone[]; metrics: Metrics }

export function design({ f, n }: Requirements): System {
  const avg = (n.customersM * 1_000_000 * PURCHASES_PER_MONTH) / (30 * 86400)
  const peak = avg * n.peakFactor
  const split = n.teams >= 5
  const store = n.latency <= 300 || n.instantApproval
  const decisionService = split || store
  const isolate = n.largestMerchant >= 20
  const cache = isolate || peak >= 50 || n.instantApproval
  const multiZone = n.availability >= 99.9
  const multiRegion = n.availability >= 99.99
  const shards = peak >= SHARD_AT ? Math.ceil(peak / 1000) : 1
  const replica = (f.portal && !n.freshReads) || peak >= 100 || split
  const kafka = split || peak >= 200
  const queue = !kafka && (multiZone || f.notifications || f.collections || peak >= 20)
  const events = kafka || queue
  const hardened = n.security !== 'baseline'
  const regulated = n.security === 'regulated'
  const live = n.liveUpdates && f.app

  const nodes: DiagramNode[] = []
  const add = (id: string, kind: Kind, title: string, sub: string, col: number, row: number, why: string, tradeoff: string, extra: Partial<DiagramNode> = {}) =>
    nodes.push({ id, kind, title, sub, col, row, why, tradeoff, ...extra })

  // ---- clients
  add('merchant', 'client', 'Merchant store', 'creates checkouts', 0, 1, 'Starts every online purchase from its own backend, and redirects the buyer.', 'You don\'t control its code, so the API must be idempotent and easy to integrate.')
  if (f.marketplace) add('web', 'client', 'Marketplace web', 'browse and buy', 0, 0, 'Functional requirement: customers browse merchants\' products in the lender\'s own marketplace.', 'A whole product to build and run, but it brings repeat purchases into the network.')
  if (f.app) add('app', 'client', 'Customer app', 'limit, installments, pay', 0, 2, 'Functional requirement: customers see their limit and installments, and repay.', 'A second client to secure and keep compatible with older versions.')
  if (f.inStore) add('pos', 'client', 'Store terminal', 'card network', 0, 3, 'Functional requirement: pay later at physical stores, through the terminal network.', 'Strict latency, and an outside network between you and the buyer.')
  if (f.portal) add('portal', 'client', 'Merchant portal', 'sales, payouts', 0, 4, 'Functional requirement: merchants see sales, refunds and payouts.', 'Report-heavy reads that must not slow down checkouts.')

  // ---- edge
  if (f.marketplace) add('cdn', 'edge', 'CDN', 'images, static pages', 1, 0, 'Product pages and images should load fast everywhere, without hitting your servers.', 'Cached pages can show an old price for a while.')
  add(
    'gateway',
    'edge',
    hardened ? 'WAF + API gateway' : isolate ? 'API gateway' : 'Load balancer',
    [hardened ? 'blocks attacks' : 'TLS', 'auth', ...(isolate ? ['per-merchant limits'] : [])].join(', '),
    1,
    1,
    isolate
      ? `One merchant can be ${n.largestMerchant}% of peak, so each merchant gets its own rate limit.${hardened ? ' Security: a web application firewall filters attacks first.' : ''}`
      : hardened
        ? 'Security: a web application firewall filters attacks before they reach any service.'
        : 'One entry point for TLS and routing. No merchant is big enough to need its own limits.',
    'Every request passes through it, so it must run in several zones.',
    { rowEnd: Math.max(...nodes.filter((x) => x.kind === 'client').map((x) => x.row)) },
  )

  // ---- services
  const modules = ['checkout', 'credit', 'ledger', ...(f.repayments ? ['repayments'] : []), ...(f.portal ? ['settlement'] : []), ...(f.collections ? ['collections'] : []), ...(f.onboarding ? ['onboarding'] : []), ...(f.notifications ? ['notifications'] : []), ...(f.marketplace ? ['catalog'] : []), ...(f.deposits ? ['deposits'] : [])]
  if (split) {
    if (f.marketplace) add('catalog', 'service', 'Catalog', 'products, prices', 2, 0, 'Owns the marketplace products, separately from money.', 'Its data is copied from merchants, so it can be out of date.')
    add('checkout', 'service', 'Checkout', 'session states', 2, 1, `${n.teams} teams can't safely share one deployable, so checkout gets its own owner.`, 'Calls credit over the network, which adds latency and new ways to fail.')
    add('credit', 'service', 'Credit + ledger', 'limit, loan, ledger', 2, 2, 'Kept together, so that reserving a limit and writing the ledger is one transaction.', 'A large service, but splitting it would mean distributed transactions on money.')
    if (f.repayments) add('repayments', 'service', 'Repayments', 'installments, payments', 2, 3, 'Functional requirement: collect installments, by transfer, wallet or cash.', 'Payments can arrive late or twice, so applying them must be idempotent.')
    if (f.onboarding) add('identity', 'service', 'Onboarding', 'identity, KYC', 2, 5, 'Functional requirement: new customers sign up with an ID and a phone.', 'The main target for fraud, and it holds the most sensitive data.')
    if (f.portal) add('settlement', 'service', 'Settlement', 'payouts, reconciliation', 2, 4, 'Pays merchants and matches the books against the bank.', 'A batch workload that must never pay twice.')
    if (f.collections) add('collections', 'service', 'Collections', 'overdue accounts', 2, 6, 'Functional requirement: handle late payments and reminders.', 'Runs on events, so its view is a few seconds behind.')
    if (f.notifications) add('notify', 'service', 'Notifications', 'messages, reminders', 2, 7, 'Functional requirement: tell customers about approvals, due dates and payments.', 'Messages are sent at least once, so they must be safe to repeat.')
    if (f.deposits) add('deposits', 'service', 'Deposit core', 'customer balances', 2, 8, "Functional requirement: hold customers' deposits.", 'The strictest controls apply here, so keep it small and separate from lending changes.')
  } else {
    add(
      'monolith',
      'service',
      'Modular monolith',
      modules.join(', '),
      2,
      f.marketplace ? 0 : 1,
      `With ${n.teams} team${n.teams === 1 ? '' : 's'}, one deployable is simplest, and one transaction covers the limit, the loan and the ledger.`,
      'A bad release or a slow query affects every feature at once.',
      { rowEnd: 8 },
    )
  }
  if (decisionService) {
    add(
      'decision',
      'service',
      'Decision service',
      'rules + model', 3, 1,
      store ? (n.instantApproval ? 'UX: returning customers are approved instantly, which needs its own scaling and fast data.' : `Latency: a ${n.latency}ms target needs its own scaling and fast data.`) : 'A risk team owns it, and releases models on its own schedule.',
      'It can\'t share a transaction with the limit, so it decides first and the limit is reserved after.',
    )
  }
  if (live) add('push', 'service', 'Push service', 'live status', 3, 7, 'UX: the app updates instantly when an approval or payment changes.', 'Holds many open connections, which scale differently from requests.')

  // ---- data
  if (f.marketplace) {
    add('search', 'search', 'Search index', 'products', 3, 0, 'Fast product search, built from the catalog.', 'A copy of the data, so it can lag behind the catalog.')
    add('objects', 'storage', 'Object storage', 'images, files', 4, 0, 'Cheap, durable storage for images and documents.', 'Not for anything you need to query.')
  }
  if (store) add('features', 'cache', n.latency === 100 ? 'Feature store + cache' : 'Feature store', 'precomputed data', 4, 1, 'Computing features during the request takes about 300ms, so they are precomputed.', 'Fast reads, with data that can be a little old.')
  add(
    'db',
    'db',
    shards > 1 ? `PostgreSQL × ${shards} shards` : 'PostgreSQL',
    shards > 1 ? 'partitioned by customer' : 'limits, loans, ledger', 3, 2,
    shards > 1 ? `Volume: a peak of ${Math.round(peak).toLocaleString('en-US')} checkouts per second is beyond one primary, so data is partitioned by customer.` : `Volume: a peak of ${Math.round(peak).toLocaleString('en-US')} checkouts per second fits one primary, so transactions stay simple.`,
    shards > 1 ? 'Queries across customers and rebalancing get much harder.' : 'One primary is a limit, but it is far away for most lenders.',
  )
  if (cache) add('cache', 'cache', 'Redis', 'sessions, rate limits', 3, 4, isolate ? 'The gateway needs fast shared counters for per-merchant limits.' : n.instantApproval ? 'UX: fast reads for returning customers.' : 'Volume: session reads come off the database.', 'Never the source of truth for money: a failover can lose recent writes.')
  if (multiZone) add('standby', 'db', 'Standby', 'another zone, sync', 4, 2, `Availability: ${n.availability}% can't wait for a database to be rebuilt.`, 'A second database to pay for, and every commit waits for it.')
  if (replica) add('replica', 'db', 'Read replica', 'portal, reports', 3, 3, n.freshReads ? 'Volume: reports and portals must not compete with checkouts.' : 'Freshness: the portal can show data a few seconds old, so it reads a replica.', 'Replicas lag, so nothing that decides about money reads from them.')
  if (multiRegion) add('region', 'db', 'Second region', n.noDataLoss ? 'sync copy, no data loss' : 'async copy', 4, 3, `Availability: ${n.availability}% allows about 53 minutes down a year, so losing a region must not stop lending.`, n.noDataLoss ? 'No data is lost, but every commit waits about 30ms for the other region.' : 'Faster commits, but a few seconds of payments can be lost in a disaster.')
  if (f.deposits) add('depositDb', 'db', 'Deposit database', 'balances', 3, 8, 'Deposits are kept apart from lending data.', 'Moving money between them is no longer one transaction, so it needs reconciliation.')
  if (hardened && f.onboarding) add('vault', 'security', 'PII vault', 'tokenized IDs', 3, 5, 'Security: national IDs and documents are stored encrypted, and other systems only see tokens.', 'An extra call to read personal data, and access to manage.')
  if (hardened) add('kms', 'security', 'Key management', 'keys, secrets', 4, 5, 'Security: encryption keys and secrets live in one controlled place, and can be rotated.', 'Everything depends on it, so it must be highly available.')
  if (regulated) add('audit', 'security', 'Audit log', 'append-only', 4, 6, 'Security: an append-only record of who did what, which operators can\'t change.', 'More storage, and someone has to review it.')

  // ---- async
  if (events) {
    add(
      'events',
      kafka ? 'stream' : 'queue',
      kafka ? 'Event stream (Kafka)' : 'Queue',
      kafka ? 'shared events, replay' : 'jobs, retries',
      2,
      9,
      kafka ? 'Several teams and the data pipeline read the same events, and may need to replay them.' : 'Background work, such as callbacks and reminders, must survive a crash.',
      kafka ? 'More to run, and consumers must handle duplicates and ordering.' : 'Delivered at least once, so consumers must handle duplicates.',
      { colEnd: kafka ? 4 : 3 },
    )
  }
  if (kafka) add('lake', 'warehouse', 'Data lake', 'training, reporting', 5, 9, 'Model training and lender reports need history, without touching production.', 'Personal data spreads here, so tokenize it and control access.')

  // ---- external
  add('bureau', 'external', 'Credit bureau', 'credit history', 5, 1, 'New customers need outside credit data.', 'Its uptime limits first purchases, so you need timeouts and a fallback policy.')
  if (f.repayments || f.portal) add('banks', 'external', 'Banks + payment providers', 'money in and out', 5, 3, 'Repayments come in and merchant payouts go out.', 'Payments can stay pending, then expire, so reconcile against their files.')
  if (f.onboarding) add('idv', 'external', 'ID verification', 'documents, liveness', 5, 5, 'Checks that the person matches their ID.', 'Costs money per check, and it can be slow or down.')
  if (f.notifications) add('messaging', 'external', 'SMS + messaging', 'delivery', 5, 7, 'Delivers messages to phones.', 'Delivery isn\'t guaranteed, so don\'t rely on it for anything critical.')

  // ---- edges
  const has = (id: string) => nodes.some((x) => x.id === id)
  const own = (id: string) => (split ? id : 'monolith')
  const edges: DiagramEdge[] = []
  const seen = new Set<string>()
  const link = (from: string, to: string, opts: Omit<DiagramEdge, 'from' | 'to'> = {}) => {
    if (!has(from) || !has(to) || from === to || seen.has(`${from}-${to}`)) return
    seen.add(`${from}-${to}`)
    edges.push({ from, to, ...opts })
  }
  const store_ = hardened ? 'vault' : 'db'
  link('merchant', 'gateway', { purpose: 'creates checkouts, and asks for their status' })
  link('app', 'gateway', { purpose: 'the customer logs in, sees installments and pays' })
  link('pos', 'gateway', { purpose: 'pay-later requests from the till, through the card network' })
  link('portal', 'gateway', { purpose: 'the merchant reads sales, refunds and payouts' })
  link('web', 'cdn', { purpose: 'loads pages and images from the nearest copy' })
  link('web', 'gateway', { purpose: 'searches products and starts a purchase' })
  link('cdn', 'objects', { purpose: "fetches images it doesn't have cached yet" })
  link('gateway', own('checkout'), { purpose: 'checkout requests, once authenticated and within limits' })
  if (f.app) link('gateway', own('repayments'), { purpose: 'the customer pays an installment' })
  if (f.onboarding) link('gateway', own('identity'), { purpose: 'a new customer signs up' })
  if (f.portal) link('gateway', own('settlement'), { purpose: 'portal requests for sales and payouts' })
  if (f.marketplace) link('gateway', own('catalog'), { purpose: 'product pages and search' })
  if (cache) link('gateway', 'cache', { purpose: isolate ? 'counts requests per merchant, to enforce limits' : 'reads and writes sessions' })
  link(own('checkout'), 'decision', { purpose: 'should we approve, and how much?' })
  link(decisionService ? 'decision' : own('checkout'), 'bureau', { label: 'new customers', purpose: "fetches a new customer's credit history" })
  link('decision', 'features', { purpose: 'reads precomputed data about the customer' })
  link(own('checkout'), own('credit'), { purpose: 'reserves the limit and creates the loan' })
  link(own('credit'), 'db', { purpose: 'one transaction: limit, loan and ledger entries' })
  link(own('repayments'), own('credit'), { purpose: 'applies a payment, and frees up the limit' })
  link(own('repayments'), 'banks', { purpose: 'collects installments from customers' })
  link(own('settlement'), 'banks', { purpose: 'pays merchants, and downloads bank statements to reconcile' })
  link(own('settlement'), replica ? 'replica' : 'db', { purpose: 'reads what each merchant is owed' })
  link(own('identity'), 'idv', { purpose: 'checks the ID document and a selfie' })
  link(own('identity'), store_, { purpose: hardened ? 'stores ID numbers and documents, and gets back tokens' : 'stores the new customer' })
  link('vault', 'kms', { purpose: 'gets the keys to encrypt and decrypt' })
  if (!has('vault')) link(own('credit'), 'kms', { purpose: 'gets keys to encrypt sensitive fields' })
  link(own('catalog'), 'search', { purpose: 'keeps the product index up to date' })
  link(own('catalog'), 'objects', { purpose: 'stores product images' })
  link(own('deposits'), 'depositDb', { purpose: 'reads and writes deposit balances' })
  if (f.app) link('gateway', own('deposits'), { purpose: 'the customer checks and moves savings' })
  link(own('notify'), 'messaging', { purpose: 'hands over the message to deliver' })
  link('db', 'standby', { label: 'sync', purpose: 'copies every commit, and takes over if the primary fails' })
  link('db', 'region', { async: !n.noDataLoss, label: n.noDataLoss ? 'sync' : 'async', purpose: n.noDataLoss ? 'copies every commit before it is confirmed' : 'copies commits a moment after they are confirmed' })
  link('db', 'replica', { async: true, purpose: 'streams changes to a read-only copy, slightly behind' })
  if (events) {
    link(own('credit'), 'events', {
      async: true,
      purpose: kafka
        ? 'publishes events such as LoanCreated, PaymentReceived and InstallmentOverdue'
        : split
          ? 'adds jobs: merchant callbacks and reminders, retried until they succeed'
          : 'adds jobs, such as merchant callbacks and reminders, that the same app works through in the background and retries',
    })
    // A monolith publishes and consumes in-process, so only the publishing line is drawn.
    if (split) {
      link('events', 'collections', { async: true, purpose: 'reacts to InstallmentOverdue' })
      link('events', 'notify', { async: true, purpose: 'sends approval, due-date and payment messages' })
    }
    link('events', 'lake', { async: true, purpose: 'every event, kept for model training and reports' })
    if (live) link('events', 'push', { async: true, purpose: 'status changes that the app should show' })
  }
  if (live) link('push', 'app', { async: true, purpose: 'updates the open screen without a refresh' })
  if (regulated) link(own('credit'), 'audit', { async: true, purpose: 'records every change to limits and loans' })
  if (store && kafka) link('lake', 'features', { async: true, purpose: 'recomputes customer features from history' })

  // ---- what each box is used for, in this system
  const USED_FOR: Record<string, string> = {
    app: 'see limit, pay installments',
    pos: 'pay later at the till',
    portal: 'sales, refunds, payouts',
    cdn: 'caches pages and images',
    catalog: 'merchant products and prices',
    checkout: 'tracks each purchase to approval',
    credit: 'limit, loan, ledger in one place',
    repayments: 'records installment payments',
    identity: 'checks new customers',
    settlement: 'pays merchants, reconciles',
    collections: 'chases late payments',
    notify: 'approval and due-date messages',
    deposits: 'customer savings balances',
    decision: 'approve? how much? fraud?',
    push: 'live status to the app',
    search: 'product search',
    objects: 'product images, documents',
    cache: isolate ? 'per-merchant counters, sessions' : 'checkout sessions',
    standby: 'takes over if the primary fails',
    replica: 'read-only copy for the portal',
    depositDb: 'deposit balances',
    vault: 'national IDs, as tokens',
    kms: 'encryption keys, secrets',
    audit: "who changed what; can't be edited",
    lake: 'history for models and reports',
    bureau: 'credit history',
    banks: 'repayments in, payouts out',
    idv: 'ID documents, selfies',
    messaging: 'delivers SMS and chat',
    events: kafka ? 'LoanCreated, PaymentReceived, ...' : 'merchant callbacks, reminder jobs',
  }
  for (const node of nodes) if (USED_FOR[node.id]) node.sub = USED_FOR[node.id]

  // ---- zones
  const serviceIds = nodes.filter((x) => x.kind === 'service').map((x) => x.id)
  const zones: Zone[] = []
  if (regulated) zones.push({ id: 'regulated', title: 'Regulated zone', outline: true, members: [own('credit'), 'db', 'standby', ...(f.deposits ? [own('deposits'), 'depositDb'] : []), 'vault', 'audit'].filter(has) })
  if (hardened) zones.push({ id: 'private', title: 'Private network: mTLS between services', members: [...serviceIds, 'db', 'standby', 'replica', 'cache', 'features', 'events', 'vault', 'audit', 'depositDb', 'search', 'region'].filter(has) })

  // ---- metrics
  const requestsPerCheckout = 6 + (f.app ? 6 : 0) + (f.marketplace ? 20 : 0) + (f.portal ? 1 : 0)
  const latencyParts = [
    { name: 'Gateway', ms: hardened ? 8 : 5 },
    { name: 'Application', ms: 15 },
    ...(decisionService ? [{ name: 'Call the decision service', ms: 5 }] : []),
    store ? { name: 'Read precomputed features', ms: n.latency === 100 ? 5 : 15 } : { name: 'Compute features in the request', ms: 300 },
    ...(store ? [{ name: 'Run the model', ms: 15 }] : []),
    { name: 'Reserve the limit and commit', ms: 15 },
    ...(multiRegion && n.noDataLoss ? [{ name: 'Wait for the second region', ms: 30 }] : []),
  ]
  const edgeA = multiRegion ? 0.99999 : multiZone ? 0.9999 : 0.999
  const appA = multiRegion ? 0.99999 : multiZone ? 0.9999 : 0.998
  const dbA = multiRegion ? 0.99995 : multiZone ? 0.9995 : 0.998
  const metrics: Metrics = {
    peakCheckouts: peak,
    peakRequests: peak * requestsPerCheckout,
    ledgerRowsPerYear: avg * 30 * 86400 * 12 * (4 + (f.repayments ? 8 : 0)),
    downtimeMinutes: ((100 - n.availability) / 100) * 365 * 24 * 60,
    latencyParts,
    availability: edgeA * appA * dbA * 100,
  }
  return { nodes, edges, zones, metrics }
}

const ALL_ON: Functional = { inStore: true, app: true, marketplace: true, repayments: true, portal: true, notifications: true, collections: true, onboarding: true, deposits: false }

export type Example = { name: string; story: string; req: Requirements }

export const EXAMPLES: Example[] = [
  {
    name: '1 · Pilot',
    story: 'Online checkout only, a few merchants, and a small team learning whether customers repay.',
    req: {
      f: { inStore: false, app: false, marketplace: false, repayments: true, portal: false, notifications: false, collections: false, onboarding: true, deposits: false },
      n: { customersM: 0.05, peakFactor: 10, latency: 1000, instantApproval: false, availability: 99.5, noDataLoss: false, security: 'baseline', liveUpdates: false, freshReads: true, teams: 2, largestMerchant: 10 },
    },
  },
  {
    name: '2 · Real money',
    story: 'An app, a merchant portal and reminders. Outages now lose sales, so the database needs a standby.',
    req: {
      f: { inStore: false, app: true, marketplace: false, repayments: true, portal: true, notifications: true, collections: false, onboarding: true, deposits: false },
      n: { customersM: 0.5, peakFactor: 15, latency: 1000, instantApproval: false, availability: 99.9, noDataLoss: true, security: 'hardened', liveUpdates: false, freshReads: true, teams: 3, largestMerchant: 15 },
    },
  },
  {
    name: '3 · Big merchants',
    story: 'A large retailer brings 40% of peak, returning customers expect instant approval, and stores join.',
    req: {
      f: { inStore: true, app: true, marketplace: false, repayments: true, portal: true, notifications: true, collections: true, onboarding: true, deposits: false },
      n: { customersM: 2, peakFactor: 25, latency: 300, instantApproval: true, availability: 99.9, noDataLoss: true, security: 'hardened', liveUpdates: false, freshReads: false, teams: 4, largestMerchant: 40 },
    },
  },
  {
    name: '4 · Many teams',
    story: 'A marketplace and a dozen teams. The system splits along ownership, while money stays in one core.',
    req: {
      f: ALL_ON,
      n: { customersM: 4, peakFactor: 30, latency: 300, instantApproval: true, availability: 99.9, noDataLoss: true, security: 'hardened', liveUpdates: true, freshReads: false, teams: 12, largestMerchant: 40 },
    },
  },
  {
    name: '5 · Regulated',
    story: 'Deposits, a 99.99% target and a regulator. A region can fail without stopping lending.',
    req: {
      f: { ...ALL_ON, deposits: true },
      n: { customersM: 8, peakFactor: 30, latency: 100, instantApproval: true, availability: 99.99, noDataLoss: true, security: 'regulated', liveUpdates: true, freshReads: false, teams: 20, largestMerchant: 40 },
    },
  },
  {
    name: '6 · Very large',
    story: 'Tens of millions of customers and huge sale events: the database is partitioned by customer.',
    req: {
      f: { ...ALL_ON, deposits: true },
      n: { customersM: 100, peakFactor: 50, latency: 100, instantApproval: true, availability: 99.99, noDataLoss: true, security: 'regulated', liveUpdates: true, freshReads: false, teams: 30, largestMerchant: 40 },
    },
  },
]
