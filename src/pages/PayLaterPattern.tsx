import CaseStudyPage, { type CaseStudy, type Metric } from './CaseStudyPage'
import { GLOSSARY } from './payLaterGlossary'
import { CUSTOMER_STEPS, design, EXAMPLES, type Functional, type NonFunctional, type System } from './payLaterSystem'

const rate = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US'))

const study: CaseStudy<Functional, NonFunctional, System> = {
  eyebrow: 'Case Studies · Pay-Later Checkout',
  title: 'Pay-Later Checkout',
  problem:
    "design a buy-now-pay-later network. Customers with no credit card buy from partner merchants and pay in installments. Merchants are paid in full, minus a fee, and the lender takes the risk that customers don't pay.",
  fixedFunctional: 'Online checkout for merchants',
  functional: [
    { key: 'onboarding', label: 'New customers sign up with an ID' },
    { key: 'repayments', label: 'Customers repay installments' },
    { key: 'app', label: 'Customer mobile app' },
    { key: 'portal', label: 'Merchant portal and payouts' },
    { key: 'notifications', label: 'Reminders and messages' },
    { key: 'collections', label: 'Collections for late payments' },
    { key: 'inStore', label: 'In-store payments' },
    { key: 'marketplace', label: 'Marketplace of merchant products' },
    { key: 'deposits', label: 'Deposit accounts' },
  ],
  controls: [
    { kind: 'slider', key: 'customersM', label: 'Volume: active customers', steps: CUSTOMER_STEPS, format: (m) => (m < 1 ? `${Math.round(m * 1000)}K` : `${m}M`) },
    { kind: 'slider', key: 'peakFactor', label: 'Throughput: peak compared with average', steps: Array.from({ length: 20 }, (_, i) => (i + 1) * 5), format: (v) => `${v}×` },
    { kind: 'slider', key: 'largestMerchant', label: "Isolation: largest merchant's share of peak", steps: Array.from({ length: 12 }, (_, i) => (i + 1) * 5), format: (v) => `${v}%` },
    { kind: 'slider', key: 'teams', label: 'Maintainability: engineering teams', steps: Array.from({ length: 30 }, (_, i) => i + 1), format: (v) => String(v) },
    { kind: 'choice', key: 'latency', label: 'Latency: decision, p99', options: [{ value: 1000, label: '1 s' }, { value: 300, label: '300 ms' }, { value: 100, label: '100 ms' }] },
    { kind: 'choice', key: 'availability', label: 'Availability', options: [{ value: 99.5, label: '99.5%' }, { value: 99.9, label: '99.9%' }, { value: 99.99, label: '99.99%' }] },
    { kind: 'choice', key: 'noDataLoss', label: 'Durability: lose data in a disaster', options: [{ value: true, label: 'never' }, { value: false, label: 'a few seconds' }] },
    { kind: 'choice', key: 'security', label: 'Security', options: [{ value: 'baseline', label: 'baseline' }, { value: 'hardened', label: 'hardened' }, { value: 'regulated', label: 'regulated' }] },
    { kind: 'choice', key: 'instantApproval', label: 'UX: returning customers', options: [{ value: false, label: 'can wait' }, { value: true, label: 'approved instantly' }] },
    { kind: 'choice', key: 'liveUpdates', label: 'UX: app status', options: [{ value: false, label: 'on refresh' }, { value: true, label: 'live' }], when: (f) => f.app },
    { kind: 'choice', key: 'freshReads', label: 'Freshness: portal data', options: [{ value: true, label: 'up to the second' }, { value: false, label: 'seconds old is fine' }], when: (f) => f.portal },
  ],
  examples: EXAMPLES,
  design,
  metrics: (req, system): Metric[] => {
    const m = system.metrics
    const latency = m.latencyParts.reduce((sum, p) => sum + p.ms, 0)
    return [
      { label: 'Peak checkouts', value: `${rate(m.peakCheckouts)}/s` },
      { label: 'Peak API requests', value: `${rate(m.peakRequests)}/s` },
      { label: 'Ledger rows a year', value: m.ledgerRowsPerYear >= 1e9 ? `${(m.ledgerRowsPerYear / 1e9).toFixed(1)} billion` : `${Math.round(m.ledgerRowsPerYear / 1e6)} million` },
      { label: 'Allowed downtime a year', value: m.downtimeMinutes >= 120 ? `${(m.downtimeMinutes / 60).toFixed(1)} hours` : `${Math.round(m.downtimeMinutes)} minutes` },
      { label: 'Decision latency', value: `${latency} of ${req.n.latency} ms`, status: latency <= req.n.latency ? 'ok' : 'bad', title: m.latencyParts.map((p) => `${p.name}: ${p.ms}ms`).join('\n') },
      { label: 'Estimated availability', value: `${m.availability.toFixed(req.n.availability >= 99.9 ? 3 : 2)}%`, status: m.availability >= req.n.availability ? 'ok' : 'bad' },
    ]
  },
  glossary: GLOSSARY,
  footer: 'A hypothetical design for a generic pay-later lender. Thresholds, timings and availability figures are rules of thumb for teaching, not measurements.',
}

export default function PayLaterPattern() {
  return <CaseStudyPage study={study} />
}
