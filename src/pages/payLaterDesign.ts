// Turns non-functional requirements into an architecture. Every threshold here is a rule of thumb for teaching, not a measured limit.
export type LatencyTarget = 1000 | 300 | 100
export type AvailabilityTarget = 99.5 | 99.9 | 99.99
export type DataLoss = 'none' | 'seconds'

export type Requirements = {
  customersM: number
  peakFactor: number
  latency: LatencyTarget
  availability: AvailabilityTarget
  largestMerchant: number
  teams: number
  deposits: boolean
  dataLoss: DataLoss
}

export type NodeId =
  | 'merchant'
  | 'buyer'
  | 'edge'
  | 'cache'
  | 'monolith'
  | 'checkout'
  | 'decision'
  | 'credit'
  | 'repayments'
  | 'settlement'
  | 'collections'
  | 'deposits'
  | 'features'
  | 'db'
  | 'standby'
  | 'replica'
  | 'region'
  | 'events'
  | 'lake'
  | 'bureau'
  | 'provider'

export type Edge = { from: NodeId; to: NodeId; async?: boolean; label?: string }
export type DesignNode = { id: NodeId; title: string; sub: string; reason: string }

export type Design = {
  nodes: DesignNode[]
  edges: Edge[]
  peak: number
  shards: number
  ledgerBillionsPerYear: number
  downtimeHoursPerYear: number
  availabilityReturning: number
  availabilityFirst: number
  latencyParts: { name: string; ms: number }[]
  latencyTotal: number
  costs: string[]
  nextChanges: string[]
}

const PURCHASES_PER_MONTH = 2
export const SHARD_CAPACITY = 1000
export const SHARD_AT = 1500
const BUREAU_AVAILABILITY = 0.995

export function designFor(r: Requirements): Design {
  const avg = (r.customersM * 1_000_000 * PURCHASES_PER_MONTH) / (30 * 86400)
  const peak = avg * r.peakFactor
  const isolate = r.largestMerchant >= 20
  const split = r.teams >= 5
  const store = r.latency <= 300
  const decisionService = split || store
  const multiZone = r.availability >= 99.9
  const multiRegion = r.availability >= 99.99
  const shards = peak >= SHARD_AT ? Math.ceil(peak / SHARD_CAPACITY) : 1
  const readReplica = peak >= 100 || split
  const kafka = split || peak >= 200
  const queue = multiZone || peak >= 20
  const hasEvents = kafka || queue
  const cache = isolate || peak >= 50

  const nodes: DesignNode[] = [
    { id: 'merchant', title: 'Merchant store', sub: 'creates checkouts', reason: 'Starts every purchase, from its own backend.' },
    { id: 'buyer', title: "Buyer's phone", sub: 'applies and accepts', reason: 'Redirected here to apply, verify and accept the contract.' },
    {
      id: 'edge',
      title: isolate ? 'API gateway' : 'Load balancer',
      sub: isolate ? 'auth + per-merchant limits' : 'TLS and routing',
      reason: isolate ? `One merchant can be ${r.largestMerchant}% of peak, so each merchant gets its own limits.` : 'Traffic needs one entry point, and no merchant is big enough to need its own limits.',
    },
  ]
  if (cache) nodes.push({ id: 'cache', title: 'Redis', sub: 'rate limits, sessions', reason: isolate ? 'The gateway needs fast shared counters for per-merchant limits.' : `At ${Math.round(peak)} checkouts per second, session reads should come off the database.` })

  if (split) {
    nodes.push(
      { id: 'checkout', title: 'Checkout service', sub: 'session state machine', reason: `${r.teams} teams can't all change one deployable safely, so sessions get their own owner.` },
      { id: 'credit', title: 'Credit + ledger core', sub: 'limit, loan, ledger', reason: 'These stay together, so that reserving a limit and writing the ledger is one transaction.' },
      { id: 'repayments', title: 'Repayments', sub: 'installments, payments', reason: 'Depends on payment providers, and changes for different reasons than checkout.' },
      { id: 'settlement', title: 'Settlement', sub: 'payouts, reconciliation', reason: 'A batch workload that finance depends on, with a different rhythm from checkout.' },
      { id: 'collections', title: 'Collections', sub: 'overdue handling', reason: 'Run by its own team, and driven by events.' },
    )
  } else {
    nodes.push({
      id: 'monolith',
      title: 'Modular monolith',
      sub: 'checkout, credit, ledger, repayments, settlement jobs',
      reason: `With ${r.teams} team${r.teams === 1 ? '' : 's'}, one deployable is simplest, and one database transaction covers the limit, the loan and the ledger.`,
    })
  }
  if (decisionService) {
    nodes.push({
      id: 'decision',
      title: 'Decision service',
      sub: 'rules + model',
      reason: store ? `A ${r.latency}ms target needs its own scaling and release cycle for models.` : 'A risk team owns it, and releases models separately.',
    })
  }
  if (r.deposits) nodes.push({ id: 'deposits', title: 'Deposit core', sub: 'separate and audited', reason: "Deposits are customers' money, so they need their own system, access rules and change control." })
  if (store) {
    nodes.push({
      id: 'features',
      title: r.latency === 100 ? 'Feature store + cache' : 'Feature store',
      sub: 'precomputed data',
      reason: `Computing features during the request takes about 300ms, which doesn't fit a ${r.latency}ms target.`,
    })
  }
  nodes.push({
    id: 'db',
    title: shards > 1 ? `PostgreSQL: ${shards} shards` : 'PostgreSQL',
    sub: shards > 1 ? 'partitioned by customer' : 'limits, loans, ledger',
    reason: shards > 1 ? `A peak of ${Math.round(peak).toLocaleString('en-US')} per second is beyond this page's assumed ${SHARD_AT.toLocaleString('en-US')} for one primary. Partition by customer, because the limit belongs to the customer.` : `A peak of ${Math.round(peak).toLocaleString('en-US')} checkouts per second fits one primary, and transactions stay simple.`,
  })
  if (multiZone) nodes.push({ id: 'standby', title: 'Standby', sub: 'another zone, sync', reason: `A ${r.availability}% target can't wait for a database to be rebuilt.` })
  if (readReplica) nodes.push({ id: 'replica', title: 'Read replica', sub: 'portal, reports', reason: 'Reports and portals shouldn\'t compete with checkouts for the primary. They can read slightly old data.' })
  if (multiRegion) {
    nodes.push({
      id: 'region',
      title: 'Second region',
      sub: r.dataLoss === 'none' ? 'sync copy, no data loss' : 'async copy, seconds lost',
      reason: `${r.availability}% allows about 53 minutes down per year, so losing a whole region must not stop lending.`,
    })
  }
  if (hasEvents) {
    nodes.push({
      id: 'events',
      title: kafka ? 'Outbox → Kafka' : 'Outbox → queue',
      sub: kafka ? 'events shared by many teams' : 'background work, retries',
      reason: kafka ? 'Several teams and the data pipeline consume the same events, and may need to replay them.' : 'Merchant callbacks and background jobs must survive a crash, and a queue is enough with one consumer per job.',
    })
  }
  if (kafka) nodes.push({ id: 'lake', title: 'Data lake', sub: 'training, reporting', reason: 'Model training and lender reports need history, without touching production databases.' })
  nodes.push(
    { id: 'bureau', title: 'Credit bureau', sub: 'external', reason: 'Lending to a new customer needs outside data. Its uptime limits first purchases.' },
    { id: 'provider', title: 'Banks and providers', sub: 'external, moves money', reason: 'Repayments come in, and merchant payouts go out.' },
  )

  const core: NodeId = split ? 'credit' : 'monolith'
  const appEntry: NodeId = split ? 'checkout' : 'monolith'
  const decider: NodeId = decisionService ? 'decision' : appEntry
  const edges: Edge[] = [
    { from: 'merchant', to: 'edge' },
    { from: 'buyer', to: 'edge' },
    { from: 'edge', to: appEntry },
    { from: core, to: 'db' },
    { from: decider, to: 'bureau', label: 'new customers' },
    { from: split ? 'repayments' : 'monolith', to: 'provider' },
  ]
  if (cache) edges.push({ from: 'edge', to: 'cache' })
  if (decisionService) edges.push({ from: appEntry, to: 'decision' })
  if (store) edges.push({ from: 'decision', to: 'features' })
  if (split) {
    edges.push({ from: 'checkout', to: 'credit' }, { from: 'repayments', to: 'credit' }, { from: 'settlement', to: 'provider' }, { from: 'settlement', to: 'replica' })
  }
  if (multiZone) edges.push({ from: 'db', to: 'standby', label: 'sync' })
  if (readReplica) edges.push({ from: 'db', to: 'replica', async: true })
  if (multiRegion) edges.push({ from: 'db', to: 'region', async: r.dataLoss !== 'none', label: r.dataLoss === 'none' ? 'sync' : 'async' })
  if (hasEvents) edges.push({ from: core, to: 'events', async: true })
  if (split) edges.push({ from: 'events', to: 'settlement', async: true }, { from: 'events', to: 'collections', async: true })
  if (kafka) edges.push({ from: 'events', to: 'lake', async: true })
  if (store && kafka) edges.push({ from: 'lake', to: 'features', async: true, label: 'precompute' })
  if (r.deposits) edges.push({ from: core, to: 'deposits' })

  // Example values. A request depends on every part in series, so availabilities multiply.
  const edgeA = multiRegion ? 0.99999 : multiZone ? 0.9999 : 0.999
  const appA = multiRegion ? 0.99999 : multiZone ? 0.9999 : 0.998
  const dbA = multiRegion ? 0.99995 : multiZone ? 0.9995 : 0.998
  const availabilityReturning = edgeA * appA * dbA * 100
  const availabilityFirst = availabilityReturning * BUREAU_AVAILABILITY

  const latencyParts = [
    { name: 'Gateway', ms: 5 },
    { name: 'Application', ms: 15 },
    ...(decisionService ? [{ name: 'Call to decision service', ms: 5 }] : []),
    store ? { name: 'Read features', ms: r.latency === 100 ? 5 : 15 } : { name: 'Compute features', ms: 300 },
    ...(store ? [{ name: 'Run model', ms: 15 }] : []),
    { name: 'Reserve limit and commit', ms: 15 },
    ...(multiRegion && r.dataLoss === 'none' ? [{ name: 'Wait for second region', ms: 30 }] : []),
  ]
  const latencyTotal = latencyParts.reduce((sum, part) => sum + part.ms, 0)

  const costs: string[] = []
  if (!split) costs.push('One deployable: a bad release or a slow query can affect everything, and teams have to coordinate releases.')
  if (split) costs.push('Network calls replace function calls, so you need tracing, timeouts and versioned contracts, plus a platform team to support them.')
  if (isolate) costs.push('Per-merchant limits can refuse real sales during a peak, so each limit has to be agreed with the merchant.')
  if (store) costs.push('Precomputed features can be stale, so a decision may miss a very recent event. You also have two data paths to keep consistent.')
  if (kafka) costs.push('Kafka needs operating and schema discipline, and consumers have to handle duplicates and out-of-order events.')
  else if (queue) costs.push('Delivery is at least once, so every consumer has to handle duplicates.')
  if (shards > 1) costs.push('Cross-customer queries and rebalancing get much harder, and reports need a separate store.')
  if (readReplica) costs.push('Replicas lag, so anything that decides about money must still read from the primary.')
  if (multiRegion && r.dataLoss === 'none') costs.push('Sync replication adds about 30ms to every commit, and if the link fails you must choose between availability and consistency.')
  if (multiRegion && r.dataLoss === 'seconds') costs.push('Async replication can lose a few seconds of confirmed money movements in a disaster, which then need reconciling with bank records.')
  if (r.deposits) costs.push('Stricter access and change control slows releases in that area, so keep the boundary small.')
  if (!multiZone) costs.push('A database failure means real downtime, and possibly restoring from backup.')

  const nextChanges: string[] = []
  if (!isolate) nextChanges.push('One merchant reaches 20% of peak: add a gateway with per-merchant limits.')
  if (!multiZone) nextChanges.push('The availability target reaches 99.9%: add a standby and multiple instances.')
  if (!store) nextChanges.push('The latency target drops to 300ms: precompute features.')
  if (!split) nextChanges.push('You reach about 5 teams: split services where ownership differs.')
  if (!kafka) nextChanges.push('Several consumers need the same events: move from a queue to Kafka.')
  if (shards === 1) nextChanges.push(`Peak nears ${SHARD_AT.toLocaleString('en-US')} per second, or the ledger outgrows one primary: partition by customer.`)
  if (!multiRegion) nextChanges.push('The target reaches 99.99%: add a second region, and choose how much data you can lose.')
  if (!r.deposits) nextChanges.push('You start taking deposits: separate a deposit core.')

  const ledgerRows = peak / r.peakFactor * 30 * 86400 * 12 * (4 + 8)
  const downtimeHoursPerYear = ((100 - r.availability) / 100) * 365 * 24

  return {
    nodes,
    edges,
    peak,
    shards,
    ledgerBillionsPerYear: ledgerRows / 1e9,
    downtimeHoursPerYear,
    availabilityReturning,
    availabilityFirst,
    latencyParts,
    latencyTotal,
    costs,
    nextChanges,
  }
}

export type Level = { name: string; story: string; requirements: Requirements; breaks: string }

export const LEVELS: Level[] = [
  {
    name: '1 · Pilot',
    story: 'A few merchants and a small amount of lending. The goal is to learn whether customers repay, so speed of change matters most.',
    requirements: { customersM: 0.05, peakFactor: 10, latency: 1000, availability: 99.5, largestMerchant: 10, teams: 2, deposits: false, dataLoss: 'seconds' },
    breaks: 'A database failure stops lending until it is restored, and merchant callbacks can be lost in a crash.',
  },
  {
    name: '2 · Real money',
    story: 'Lending is now serious. An outage loses sales, and lost events mean merchants and the ledger disagree.',
    requirements: { customersM: 0.5, peakFactor: 15, latency: 1000, availability: 99.9, largestMerchant: 15, teams: 3, deposits: false, dataLoss: 'none' },
    breaks: 'A big merchant\'s sale event can use up all capacity, and slow credit decisions start to lose sales.',
  },
  {
    name: '3 · Big merchants',
    story: 'One large retailer now brings 40% of peak traffic, and returning customers expect a fast checkout.',
    requirements: { customersM: 2, peakFactor: 25, latency: 300, availability: 99.9, largestMerchant: 40, teams: 4, deposits: false, dataLoss: 'none' },
    breaks: 'Teams start blocking each other on one deployable, and release risk keeps growing.',
  },
  {
    name: '4 · Many teams',
    story: 'A dozen teams work on this. The system now splits along ownership, while the money core stays together.',
    requirements: { customersM: 4, peakFactor: 30, latency: 300, availability: 99.9, largestMerchant: 40, teams: 12, deposits: false, dataLoss: 'none' },
    breaks: 'Losing a whole region stops lending, and holding deposits raises the bar on separation and audit.',
  },
  {
    name: '5 · Regulated, resilient',
    story: 'The company takes deposits, must survive losing a region, and the fast path has a 100ms target.',
    requirements: { customersM: 8, peakFactor: 30, latency: 100, availability: 99.99, largestMerchant: 40, teams: 20, deposits: true, dataLoss: 'none' },
    breaks: 'Eventually one primary can\'t carry the writes, or the ledger gets too large to operate.',
  },
  {
    name: '6 · Very large',
    story: 'Tens of millions of customers and major sale events. Few lenders ever need this, so show that you know when not to build it.',
    requirements: { customersM: 100, peakFactor: 50, latency: 100, availability: 99.99, largestMerchant: 40, teams: 30, deposits: true, dataLoss: 'none' },
    breaks: 'What comes next is mostly about organization and cost, such as cell-based isolation per country or product.',
  },
]

export const NODE_DETAILS: Record<NodeId, { owns: string; fails: string; tradeoff: string }> = {
  merchant: { owns: 'Its own orders and storefront.', fails: 'Retries after a timeout, so requests must be idempotent.', tradeoff: 'You don\'t control its code, so plugins and clear docs matter as much as the API.' },
  buyer: { owns: 'Nothing the server can trust.', fails: 'Walks away, loses signal or reloads, so sessions must resume and expire.', tradeoff: 'Each extra step lowers fraud and lowers completed sales.' },
  edge: { owns: 'TLS, authentication and rate limits.', fails: 'If it goes down, everything does, so run several across zones.', tradeoff: 'A gateway is one more hop and one more thing to operate, but it stops one merchant from harming the rest.' },
  cache: { owns: 'Counters and short-lived sessions. Nothing that can\'t be rebuilt.', fails: 'Choose what happens if it goes down: allow traffic and risk overload, or refuse it and lose sales.', tradeoff: 'Don\'t keep credit limits here: a failover could lose a recent update and allow overspending.' },
  monolith: { owns: 'All business logic, in clear modules.', fails: 'A bad release or a memory leak affects everything.', tradeoff: 'One transaction makes money simple, at the price of team independence.' },
  checkout: { owns: 'Checkout sessions and their states.', fails: 'Sessions can resume after a crash, and idempotency stops duplicates.', tradeoff: 'Calling credit over the network adds latency and new failure modes.' },
  decision: { owns: 'Rules, models and a record of every decision.', fails: 'Set a timeout, and a policy for what to do without it: decline, or allow a small amount for known customers.', tradeoff: 'Independent releases, but the decision can\'t share a transaction with the limit.' },
  credit: { owns: 'Limits, loans, installments and the double-entry ledger.', fails: 'Fails safely: if it\'s down, nobody gets a loan, and nobody gets a wrong one.', tradeoff: 'Keeping these together is what makes one transaction possible, even if the service grows large.' },
  repayments: { owns: 'Payment attempts, and how money is applied to installments.', fails: 'Pending payments can arrive late, or twice, so processing must be idempotent.', tradeoff: 'Restoring the limit only on confirmation is safer, but slower for the customer.' },
  settlement: { owns: 'Merchant payouts, and matching against bank files.', fails: 'A rerun must only finish what\'s left, using a stable key for each payout.', tradeoff: 'Paying merchants sooner is attractive to them, but it means carrying more risk.' },
  collections: { owns: 'Overdue accounts, reminders and fees.', fails: 'If it falls behind, reminders are late, but checkout is unaffected.', tradeoff: 'Event-driven gives independence, with slightly old data.' },
  deposits: { owns: 'Customer deposit balances.', fails: 'Availability and audit requirements are at their strictest here.', tradeoff: 'A separate system is easier to control, but moving money across the boundary is no longer one transaction.' },
  features: { owns: 'Precomputed customer data for decisions.', fails: 'If it\'s stale or down, fall back to safer rules with lower limits.', tradeoff: 'Fast reads in exchange for slightly old data.' },
  db: { owns: 'The source of truth for money.', fails: 'Fails over to its standby, and in-flight transactions must be retried.', tradeoff: 'Strong transactions are the point. Don\'t give those up for scale you don\'t have.' },
  standby: { owns: 'An up-to-date copy, ready to take over.', fails: 'Failover takes time, so test it regularly.', tradeoff: 'Costs a second database, and each commit waits for it.' },
  replica: { owns: 'A slightly old copy for reads.', fails: 'If it lags too far, redirect or pause reporting.', tradeoff: 'Reads scale, but never use it to decide about money.' },
  region: { owns: 'A copy of the system in another region.', fails: 'Decide who triggers failover, and how to avoid both regions accepting writes.', tradeoff: 'Sync means no data lost but slower commits. Async means faster commits, with seconds of data at risk.' },
  events: { owns: 'Reliable delivery of what has happened.', fails: 'If it backs up, the outbox holds events, so checkout carries on.', tradeoff: 'Kafka allows replay and many consumers, but costs more to run than a queue.' },
  lake: { owns: 'History for models and reports.', fails: 'Delays reports and training, not lending.', tradeoff: 'Personal data spreads here, so tokenize it and control access.' },
  bureau: { owns: 'External credit history.', fails: 'Set strict timeouts and a circuit breaker, and decide on a fallback policy per customer type.', tradeoff: 'Each call costs money and latency, so cache within what the rules allow.' },
  provider: { owns: 'Moving real money.', fails: 'Payments can stay pending, then expire. Reconcile against its files.', tradeoff: 'More providers improve coverage and resilience, and add more to reconcile.' },
}
