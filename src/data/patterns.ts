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
    ],
  },
]
