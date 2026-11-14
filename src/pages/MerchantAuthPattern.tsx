import CaseStudyPage, { type CaseStudy } from './CaseStudyPage'
import { GLOSSARY } from './merchantAuthGlossary'
import { sequences } from './merchantAuthSequences'
import { design, EXAMPLES, MERCHANT_STEPS, metrics, type Functional, type NonFunctional, type System } from './merchantAuthSystem'

const rate = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toLocaleString('en-US'))

const study: CaseStudy<Functional, NonFunctional, System> = {
  eyebrow: 'Reference architectures · Merchant Integration and Auth',
  title: 'Pay-Later: Merchant Integration and Auth',
  problem:
    "let merchants offer pay-later on their websites, in WhatsApp chats and through payment links shared on social networks. Each merchant's server, each buyer and each member of merchant staff must prove who they are, and reach only what they're allowed to.",
  fixedFunctional: 'Web checkout: the merchant redirects the buyer to the lender',
  functional: [
    { key: 'widget', label: "Embedded widget on the merchant's page" },
    { key: 'links', label: 'Payment links for social networks and chats' },
    { key: 'whatsapp', label: 'Checkout inside a WhatsApp chat' },
    { key: 'portal', label: 'Merchant portal for staff' },
    { key: 'webhooks', label: 'Webhooks to tell merchants about orders' },
  ],
  controls: [
    { kind: 'slider', key: 'merchants', label: 'Volume: merchants', steps: MERCHANT_STEPS, format: (v) => v.toLocaleString('en-US') },
    { kind: 'slider', key: 'peakFactor', label: 'Throughput: peak compared with average', steps: [5, 10, 20, 30, 50], format: (v) => `${v}×` },
    {
      kind: 'choice',
      key: 'merchantAuth',
      label: 'Security: merchant servers prove identity with',
      options: [
        { value: 'apiKey', label: 'an API key' },
        { value: 'oauth', label: 'OAuth tokens' },
        { value: 'bound', label: 'tokens bound to a certificate' },
      ],
    },
    {
      kind: 'choice',
      key: 'tokenCheck',
      label: 'Latency: tokens are checked',
      options: [
        { value: 'local', label: 'in the gateway' },
        { value: 'introspect', label: 'by asking the auth server' },
      ],
      when: (_f, n) => n.merchantAuth !== 'apiKey',
    },
    {
      kind: 'choice',
      key: 'instantRevocation',
      label: 'Revoking a leaked credential',
      options: [
        { value: false, label: 'within minutes' },
        { value: true, label: 'within seconds' },
      ],
      when: (_f, n) => n.merchantAuth !== 'apiKey',
    },
    {
      kind: 'choice',
      key: 'customerAuth',
      label: 'UX and security: buyers log in with',
      options: [
        { value: 'sms', label: 'an SMS code' },
        { value: 'whatsapp', label: 'a WhatsApp code' },
        { value: 'passkey', label: 'a passkey' },
      ],
    },
    { kind: 'choice', key: 'stepUp', label: 'Large purchases', options: [{ value: false, label: 'same login' }, { value: true, label: 'extra check' }] },
    { kind: 'choice', key: 'singleUseLinks', label: 'Payment links', options: [{ value: false, label: 'reusable' }, { value: true, label: 'single-use, expiring' }], when: (f) => f.links },
    {
      kind: 'choice',
      key: 'webhookTrust',
      label: 'Webhooks',
      options: [
        { value: 'unsigned', label: 'unsigned' },
        { value: 'signed', label: 'signed' },
        { value: 'mtls', label: 'signed + mTLS' },
      ],
      when: (f) => f.webhooks,
    },
    { kind: 'choice', key: 'strongAbuse', label: 'Abuse protection', options: [{ value: false, label: 'basic' }, { value: true, label: 'bots and fake links' }] },
    { kind: 'choice', key: 'staffSso', label: 'Merchant staff log in', options: [{ value: false, label: 'with a password' }, { value: true, label: 'with company SSO' }], when: (f) => f.portal },
    { kind: 'choice', key: 'availability', label: 'Availability', options: [{ value: 99.9, label: '99.9%' }, { value: 99.99, label: '99.99%' }] },
  ],
  examples: EXAMPLES,
  design,
  metrics: (req) => {
    const m = metrics(req)
    return [
      { label: 'Peak API calls', value: `${rate(m.apiPeak)}/s` },
      { label: 'Token requests', value: m.tokensPerSecond ? `${rate(m.tokensPerSecond)}/s` : 'none' },
      { label: 'Auth added per call', value: `about ${m.authLatency} ms` },
      { label: 'A revoked credential stops', value: m.revocation, status: m.revocation.startsWith('up to') ? 'bad' : 'ok' },
      { label: 'Merchant keeps', value: m.secret, status: req.n.merchantAuth === 'apiKey' ? 'bad' : 'ok' },
    ]
  },
  glossary: GLOSSARY,
  sequences,
  footer: 'A hypothetical design for a generic pay-later lender. Volumes, timings and thresholds are rules of thumb for teaching, not measurements.',
}

export default function MerchantAuthPattern() {
  return <CaseStudyPage study={study} />
}
