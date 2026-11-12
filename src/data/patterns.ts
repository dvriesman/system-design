export type PatternSummary = {
  slug: string
  title: string
  summary: string
}

export type PatternGroup = {
  slug: string
  title: string
  patterns: PatternSummary[]
}

export const patternGroups: PatternGroup[] = [
  {
    slug: 'finance',
    title: 'Finance: High-Throughput & Low-Latency',
    patterns: [
      {
        slug: 'outbox',
        title: 'Transactional Outbox',
        summary: 'Publish events reliably alongside a database transaction.',
      },
      {
        slug: 'idempotency-keys',
        title: 'Idempotency Keys',
        summary: 'Make retries safe by giving every request a replay-proof identity.',
      },
      {
        slug: 'sharding',
        title: 'Sharding & Partitioning',
        summary: 'Split data across shards without creating hotspots or a resharding storm.',
      },
      {
        slug: 'two-phase-commit',
        title: 'Two-Phase Commit vs Eventual Consistency',
        summary: 'Move money across two databases: make everyone wait, or let everyone see the gap.',
      },
      {
        slug: 'saga',
        title: 'Saga Pattern',
        summary: 'Make several services act as one: a step and an undo for each, and a log that survives a crash.',
      },
      {
        slug: 'circuit-breaker',
        title: 'Circuit Breaker',
        summary: 'Stop calling a dependency that is failing or slow, answer with a fallback, and check back later.',
      },
    ],
  },
  {
    slug: 'security',
    title: 'Security: Authentication & Authorization',
    patterns: [
      {
        slug: 'sessions-vs-jwts',
        title: 'Sessions vs JWTs',
        summary: 'Recognize a user on every request: look it up each time, or give up the power to cancel it.',
      },
      {
        slug: 'oauth-pkce',
        title: 'OAuth 2.0 Authorization Code + PKCE',
        summary: 'Let an app act for you without your password, and keep a stolen code useless.',
      },
      {
        slug: 'oauth-grant-types',
        title: 'OAuth 2.0 Grant Types',
        summary: 'Every way to get an access token, when to use each, and the real HTTP behind it.',
      },
      {
        slug: 'step-up-authentication',
        title: 'Step-Up Authentication',
        summary: 'Ask for more proof at the moment it matters, such as a withdrawal, not just at login.',
      },
      {
        slug: 'rbac-abac-rebac',
        title: 'RBAC vs ABAC vs ReBAC',
        summary: 'Roles, rules over attributes, or relationships: what each answers well, and where each leaks.',
      },
    ],
  },
  {
    slug: 'case-studies',
    title: 'Case Studies',
    patterns: [
      {
        slug: 'pay-later-checkout',
        title: 'Pay-Later Checkout',
        summary: 'Design a pay-later network end to end: the business, the failures, the security and the trade-offs.',
      },
      {
        slug: 'merchant-integration-auth',
        title: 'Pay-Later: Merchant Integration and Auth',
        summary: 'Web checkout, WhatsApp and payment links: who proves what, and who may do what.',
      },
    ],
  },
]
