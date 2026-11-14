// The single source of truth for the catalog: the sidebar, the home page, search, routes, breadcrumbs and
// previous/next links all read from here.

export type Quality = 'consistency' | 'reliability' | 'security' | 'performance' | 'scalability'
export type Kind = 'debugger' | 'explorer' | 'architecture'
export type Icon = 'ledger' | 'scale' | 'shield' | 'key' | 'lock' | 'blueprint'

export type Guide = {
  slug: string
  title: string
  summary: string
  // The problem in the reader's words, used on the home page and in search.
  problem: string
  category: string
  kind: Kind
  qualities: Quality[]
  related: string[]
  // Other words people search with.
  keywords: string
  added: string // YYYY-MM-DD: the two most recent get a "new" badge
}

export type Category = {
  id: string
  title: string
  question: string
  blurb: string
  icon: Icon
  planned: string[]
}

export const QUALITIES: Record<Quality, { label: string; hint: string }> = {
  consistency: { label: 'Consistency', hint: 'Data stays correct across retries, crashes and services' },
  reliability: { label: 'Reliability', hint: 'The system keeps working when parts of it fail' },
  security: { label: 'Security', hint: 'Only the right people can do the right things' },
  performance: { label: 'Performance', hint: 'Answers stay fast under load' },
  scalability: { label: 'Scalability', hint: 'Growth means adding machines, not rewriting' },
}

export const KINDS: Record<Kind, { label: string; hint: string }> = {
  debugger: { label: 'Debugger', hint: 'Step through competing designs, line by line, and break them' },
  explorer: { label: 'Explorer', hint: 'An interactive reference to compare options side by side' },
  architecture: { label: 'Architecture', hint: 'A whole system that changes as you change the requirements' },
}

export const CATEGORIES: Category[] = [
  {
    id: 'consistency',
    title: 'Data consistency',
    question: 'How do you keep data correct across retries, crashes and services?',
    blurb: 'Duplicates, lost events and half-finished work across services: the failures that cost real money.',
    icon: 'ledger',
    planned: ['Optimistic Concurrency Control', 'Distributed Locking', 'Event Sourcing', 'CQRS', 'Exactly-Once Processing', 'Change Data Capture'],
  },
  {
    id: 'scale',
    title: 'Scaling data',
    question: 'How do you grow past what one database can hold or serve?',
    blurb: 'Splitting data across machines without hotspots, and moving it without downtime.',
    icon: 'scale',
    planned: ['Consistent Hashing', 'Caching for Low-Latency Reads', 'Write-Ahead Log'],
  },
  {
    id: 'resilience',
    title: 'Resilience',
    question: 'How do you stop one failing dependency from taking everything down?',
    blurb: 'Timeouts, retries, breakers and limits: keeping a failure where it started.',
    icon: 'shield',
    planned: ['Bulkhead', 'Rate Limiting', 'Backpressure', 'Reconciliation Jobs'],
  },
  {
    id: 'authn',
    title: 'Authentication',
    question: 'How do you know who is calling, and keep knowing it safely?',
    blurb: 'Sessions, tokens, delegated access and asking for more proof when it matters.',
    icon: 'key',
    planned: ['Refresh Token Rotation', 'OpenID Connect and SSO', 'API Keys and Signed Requests', 'Service-to-Service Identity'],
  },
  {
    id: 'authz',
    title: 'Authorization',
    question: 'Once you know who it is, what may they do?',
    blurb: 'Roles, attributes and relationships, and keeping decisions fresh and enforced everywhere.',
    icon: 'lock',
    planned: ['Policy Decision Points', 'Permission Caching', 'Multi-Tenant Isolation', 'Delegated Access', 'Maker-Checker Approvals'],
  },
  {
    id: 'architectures',
    title: 'Reference architectures',
    question: 'What does the whole system look like, and how does it change with the requirements?',
    blurb: 'Complete designs you can reshape: toggle a requirement and watch components appear, change and connect.',
    icon: 'blueprint',
    planned: [],
  },
]

export const GUIDES: Guide[] = [
  {
    slug: 'idempotency-keys',
    title: 'Idempotency Keys',
    summary: 'Make retries safe by giving every request a replay-proof identity.',
    problem: 'A retry after a timeout charges the customer twice',
    category: 'consistency',
    kind: 'debugger',
    qualities: ['consistency', 'reliability'],
    related: ['outbox', 'saga', 'circuit-breaker'],
    keywords: 'retry duplicate double charge payment api dedupe exactly once',
    added: '2026-06-10',
  },
  {
    slug: 'outbox',
    title: 'Transactional Outbox',
    summary: 'Publish events reliably alongside a database transaction.',
    problem: 'An event is lost, or sent for a change that never committed',
    category: 'consistency',
    kind: 'debugger',
    qualities: ['consistency', 'reliability'],
    related: ['idempotency-keys', 'saga', 'two-phase-commit'],
    keywords: 'event kafka message publish lost dual write commit queue',
    added: '2026-06-01',
  },
  {
    slug: 'two-phase-commit',
    title: 'Two-Phase Commit vs Eventual Consistency',
    summary: 'Move money across two databases: make everyone wait, or let everyone see the gap.',
    problem: 'One change has to land in two databases, or in neither',
    category: 'consistency',
    kind: 'debugger',
    qualities: ['consistency', 'reliability'],
    related: ['saga', 'outbox', 'sharding'],
    keywords: '2pc distributed transaction transfer ledger eventual xa prepare',
    added: '2026-08-15',
  },
  {
    slug: 'saga',
    title: 'Saga',
    summary: 'Make several services act as one: a step and an undo for each, and a log that survives a crash.',
    problem: 'A purchase spans several services, and one step fails halfway',
    category: 'consistency',
    kind: 'debugger',
    qualities: ['consistency', 'reliability'],
    related: ['two-phase-commit', 'outbox', 'idempotency-keys'],
    keywords: 'compensation compensating rollback orchestration choreography workflow temporal distributed transaction',
    added: '2026-11-04',
  },
  {
    slug: 'sharding',
    title: 'Sharding & Partitioning',
    summary: 'Split data across shards without creating hotspots or a resharding storm.',
    problem: 'One database can no longer hold or serve all the data',
    category: 'scale',
    kind: 'debugger',
    qualities: ['scalability', 'performance'],
    related: ['two-phase-commit', 'saga'],
    keywords: 'partition hotspot reshard migration scale database consistent hashing',
    added: '2026-07-20',
  },
  {
    slug: 'circuit-breaker',
    title: 'Circuit Breaker',
    summary: 'Stop calling a dependency that is failing or slow, answer with a fallback, and check back later.',
    problem: 'A slow or failing dependency makes everything slow',
    category: 'resilience',
    kind: 'debugger',
    qualities: ['reliability', 'performance'],
    related: ['idempotency-keys', 'saga'],
    keywords: 'outage timeout retry fallback dependency down slow latency resilience4j hystrix cascading',
    added: '2026-11-11',
  },
  {
    slug: 'sessions-vs-jwts',
    title: 'Sessions vs JWTs',
    summary: 'Recognize a user on every request: look it up each time, or give up the power to cancel it.',
    problem: "A logged-out or stolen token keeps working",
    category: 'authn',
    kind: 'debugger',
    qualities: ['security', 'performance'],
    related: ['oauth-pkce', 'step-up-authentication'],
    keywords: 'token logout revoke cookie session jwt stateless redis keycloak',
    added: '2026-09-12',
  },
  {
    slug: 'oauth-pkce',
    title: 'OAuth 2.0 Authorization Code + PKCE',
    summary: 'Let an app act for you without your password, and keep a stolen code useless.',
    problem: 'An app needs to act for a user without their password',
    category: 'authn',
    kind: 'debugger',
    qualities: ['security'],
    related: ['oauth-grant-types', 'sessions-vs-jwts', 'step-up-authentication'],
    keywords: 'login authorization code redirect code verifier challenge spa mobile',
    added: '2026-10-03',
  },
  {
    slug: 'oauth-grant-types',
    title: 'OAuth 2.0 Grant Types',
    summary: 'Every way to get an access token, when to use each, and the real HTTP behind it.',
    problem: 'Which OAuth flow fits this client: a server, a TV, a phone?',
    category: 'authn',
    kind: 'explorer',
    qualities: ['security'],
    related: ['oauth-pkce', 'sessions-vs-jwts'],
    keywords: 'client credentials device code refresh ciba token exchange jwt bearer implicit password',
    added: '2026-11-02',
  },
  {
    slug: 'multi-factor-authentication',
    title: 'Multi-Factor Authentication',
    summary: 'SMS, authenticator apps and passkeys: what each stops, what each lets through, and the fallback problem.',
    problem: 'A leaked password is all it takes to sign in',
    category: 'authn',
    kind: 'debugger',
    qualities: ['security'],
    related: ['step-up-authentication', 'sessions-vs-jwts', 'oauth-pkce'],
    keywords: '2fa mfa totp otp sms sim swap passkey webauthn fido authenticator google authenticator auth0 keycloak phishing recovery codes',
    added: '2026-11-12',
  },
  {
    slug: 'step-up-authentication',
    title: 'Step-Up Authentication',
    summary: 'Ask for more proof at the moment it matters, such as a withdrawal, not just at login.',
    problem: 'A stolen session can move money',
    category: 'authn',
    kind: 'debugger',
    qualities: ['security'],
    related: ['oauth-pkce', 'sessions-vs-jwts', 'rbac-abac-rebac'],
    keywords: 'mfa second factor acr auth_time withdrawal approval rfc 9470',
    added: '2026-10-20',
  },
  {
    slug: 'rbac-abac-rebac',
    title: 'RBAC vs ABAC vs ReBAC',
    summary: 'Roles, rules over attributes, or relationships: what each answers well, and where each leaks.',
    problem: "Users see another customer's data, or approve their own payments",
    category: 'authz',
    kind: 'debugger',
    qualities: ['security', 'consistency'],
    related: ['step-up-authentication', 'oauth-grant-types'],
    keywords: 'roles permissions policy zanzibar openfga spicedb cedar tenant access control',
    added: '2026-11-09',
  },
  {
    slug: 'pay-later-checkout',
    title: 'Pay-Later Checkout',
    summary: 'A buy-now-pay-later network end to end, reshaped by volume, latency, availability and features.',
    problem: 'Design a credit checkout that never over-lends, and stays up',
    category: 'architectures',
    kind: 'architecture',
    qualities: ['consistency', 'reliability', 'scalability'],
    related: ['merchant-integration-auth', 'saga', 'idempotency-keys'],
    keywords: 'bnpl credit lending checkout system design architecture',
    added: '2026-10-28',
  },
  {
    slug: 'merchant-integration-auth',
    title: 'Merchant Integration and Auth',
    summary: 'Web checkout, chat and payment links: who proves what, and who may do what.',
    problem: 'Merchants, buyers and staff each need different proof and permissions',
    category: 'architectures',
    kind: 'architecture',
    qualities: ['security'],
    related: ['pay-later-checkout', 'oauth-grant-types', 'rbac-abac-rebac'],
    keywords: 'merchant api keys webhooks whatsapp payment link oauth architecture',
    added: '2026-10-30',
  },
]

export const LEARNING_PATHS: { id: string; title: string; text: string; slugs: string[] }[] = [
  {
    id: 'money',
    title: 'Moving money safely',
    text: 'From one safe retry to a purchase that spans several services and an outside bank.',
    slugs: ['idempotency-keys', 'outbox', 'two-phase-commit', 'saga', 'circuit-breaker'],
  },
  {
    id: 'identity',
    title: 'Identity, end to end',
    text: 'How a request proves who it is, how apps act for users, and how access is decided.',
    slugs: ['sessions-vs-jwts', 'multi-factor-authentication', 'oauth-pkce', 'oauth-grant-types', 'step-up-authentication', 'rbac-abac-rebac'],
  },
  {
    id: 'system',
    title: 'From patterns to a system',
    text: 'Scale the data, then see the patterns combined in complete designs.',
    slugs: ['sharding', 'saga', 'pay-later-checkout', 'merchant-integration-auth'],
  },
]

export const guidePath = (g: Guide) => `/${g.kind === 'architecture' ? 'architectures' : 'guides'}/${g.slug}`
export const findGuide = (slug: string) => GUIDES.find((g) => g.slug === slug)
export const categoryOf = (g: Guide) => CATEGORIES.find((c) => c.id === g.category)!
export const guidesIn = (categoryId: string) => GUIDES.filter((g) => g.category === categoryId)
const RECENT = new Set([...GUIDES].sort((a, b) => b.added.localeCompare(a.added)).slice(0, 2).map((g) => g.slug))
export const isNew = (g: Guide) => RECENT.has(g.slug)
// Reading order: the sidebar's order, category by category.
export const ORDERED = CATEGORIES.flatMap((c) => guidesIn(c.id))
