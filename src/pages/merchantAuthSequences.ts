// Step-by-step flows for each way a merchant can offer pay-later. They follow the chosen requirements.
// Closely related services share one lifeline, such as the gateway and the merchant API, so each diagram stays readable.
import type { Message, Participant, Sequence } from './sequenceDiagram'
import type { Requirements } from './merchantAuthSystem'

const P = {
  buyer: { id: 'buyer', label: "Buyer's browser", kind: 'client' },
  waBuyer: { id: 'waBuyer', label: 'Buyer on WhatsApp', kind: 'client' },
  merchant: { id: 'merchant', label: 'Merchant', kind: 'client' },
  site: { id: 'site', label: 'Merchant website', kind: 'client' },
  backend: { id: 'backend', label: 'Merchant backend', kind: 'client' },
  wa: { id: 'wa', label: 'WhatsApp platform', kind: 'external' },
  auth: { id: 'auth', label: 'Authorization server', kind: 'service' },
  api: { id: 'api', label: 'Lender API (gateway)', kind: 'edge' },
  bot: { id: 'bot', label: 'Checkout bot', kind: 'service' },
  link: { id: 'link', label: 'Payment links', kind: 'service' },
  page: { id: 'page', label: 'Lender checkout page', kind: 'service' },
  sms: { id: 'sms', label: 'SMS provider', kind: 'external' },
  lending: { id: 'lending', label: 'Lending core', kind: 'service' },
} satisfies Record<string, Participant>

type Id = keyof typeof P
const ORDER: Id[] = ['buyer', 'waBuyer', 'merchant', 'site', 'backend', 'wa', 'bot', 'link', 'auth', 'api', 'page', 'sms', 'lending']

function sequence(id: string, title: string, summary: string, messages: Message[]): Sequence {
  const used = new Set(messages.flatMap((m) => [m.from, m.to]))
  return { id, title, summary, participants: ORDER.filter((p) => used.has(p)).map((p) => P[p]), messages }
}

const self = (who: Id, label: string): Message => ({ from: who, to: who, label, kind: 'self' })

export function sequences({ f, n }: Requirements): Sequence[] {
  const oauth = n.merchantAuth !== 'apiKey'
  const credential = n.merchantAuth === 'apiKey' ? 'API key' : n.merchantAuth === 'oauth' ? 'access token' : 'bound token, mTLS'

  // The merchant's server authenticates, and creates a checkout session. `caller` is the merchant's server.
  const createCheckout = (caller: Id, what: string): Message[] => [
    ...(oauth
      ? [
          { from: caller, to: 'auth', label: n.merchantAuth === 'bound' ? 'token request, signed with private key' : 'token request: client ID + secret' },
          { from: 'auth', to: caller, label: 'access token, valid 5 minutes', kind: 'reply' as const },
        ]
      : []),
    { from: caller, to: 'api', label: `POST ${what} + ${credential}` },
    ...(oauth && n.tokenCheck === 'introspect'
      ? [
          { from: 'api', to: 'auth', label: 'is this token still valid?' },
          { from: 'auth', to: 'api', label: 'active: merchant 42, scope checkouts', kind: 'reply' as const },
        ]
      : [self('api', n.merchantAuth === 'apiKey' ? 'hash the key, find the merchant' : 'check token signature, expiry, scope')]),
    self('api', 'merchant comes from the credential only'),
  ]

  // The buyer logs in on the lender's page and approves. `who` is the buyer's device.
  const loginAndApprove = (who: Id): Message[] => [
    ...(n.customerAuth === 'passkey'
      ? [
          { from: 'page', to: who, label: 'passkey challenge', kind: 'reply' as const },
          { from: who, to: 'page', label: 'challenge signed on the phone' },
        ]
      : n.customerAuth === 'whatsapp' && f.whatsapp
        ? [
            { from: 'page', to: 'wa', label: 'send a one-time code' },
            { from: 'wa', to: who, label: 'code arrives in WhatsApp', kind: 'async' as const },
            { from: who, to: 'page', label: 'enters the code' },
          ]
        : [
            { from: 'page', to: 'sms', label: 'send a one-time code' },
            { from: 'sms', to: who, label: 'code arrives by SMS', kind: 'async' as const },
            { from: who, to: 'page', label: 'enters the code' },
          ]),
    ...(n.stepUp ? [self('page', 'large purchase: ask for an extra check')] : []),
    ...(n.strongAbuse ? [self('page', 'device and behavior look normal')] : []),
    { from: 'page', to: 'lending', label: 'approve: buyer, merchant, amount' },
    { from: 'lending', to: 'page', label: 'approved', kind: 'reply' },
  ]

  const webhook = (to: Id): Message[] =>
    f.webhooks
      ? [
          { from: 'lending', to, label: n.webhookTrust === 'unsigned' ? 'webhook: approved, unsigned' : n.webhookTrust === 'signed' ? 'webhook: approved, signed + timestamp' : 'webhook: approved, signed, mTLS', kind: 'async' },
          self(to, n.webhookTrust === 'unsigned' ? 'has to trust it blindly' : 'check signature and age, skip duplicates'),
        ]
      : []

  const confirm: Message[] = [
    { from: 'backend', to: 'api', label: `GET /checkouts/{id} + ${credential}` },
    { from: 'api', to: 'backend', label: 'status: approved', kind: 'reply' },
    self('backend', 'ship now, not on the redirect alone'),
  ]

  const flows: Sequence[] = [
    sequence('redirect', 'Website: redirect', "The merchant's server creates a checkout. The buyer leaves for the lender's page to log in, then comes back.", [
      { from: 'buyer', to: 'site', label: 'clicks "Pay later"' },
      { from: 'site', to: 'backend', label: 'start checkout: order, amount' },
      ...createCheckout('backend', '/checkouts'),
      { from: 'api', to: 'lending', label: 'new session: merchant, amount' },
      { from: 'api', to: 'backend', label: 'session ID + one-time URL', kind: 'reply' },
      { from: 'backend', to: 'buyer', label: 'redirect to the lender', kind: 'reply' },
      { from: 'buyer', to: 'page', label: 'opens the checkout page' },
      ...loginAndApprove('buyer'),
      { from: 'page', to: 'buyer', label: 'redirect to the registered return URL', kind: 'reply' },
      { from: 'buyer', to: 'backend', label: 'back at the merchant, session ID' },
      ...confirm,
      ...webhook('backend'),
    ]),
  ]

  if (f.widget) {
    flows.push(
      sequence('widget', 'Website: embedded widget', "The same login and approval, shown in a frame on the merchant's page instead of a redirect.", [
        { from: 'buyer', to: 'site', label: 'opens the product page' },
        { from: 'site', to: 'backend', label: 'start checkout: order, amount' },
        ...createCheckout('backend', '/checkouts'),
        { from: 'api', to: 'lending', label: 'new session: merchant, amount' },
        { from: 'api', to: 'backend', label: 'session ID', kind: 'reply' },
        { from: 'backend', to: 'site', label: 'session ID', kind: 'reply' },
        { from: 'site', to: 'page', label: 'widget opens the page in an iframe' },
        self('page', 'allow framing by registered domains only'),
        ...loginAndApprove('buyer'),
        { from: 'page', to: 'site', label: "postMessage, to the merchant's origin only", kind: 'reply' },
        { from: 'site', to: 'backend', label: 'checkout finished, session ID' },
        ...confirm,
        ...webhook('backend'),
      ]),
    )
  }

  if (f.whatsapp) {
    flows.push(
      sequence('whatsapp', 'WhatsApp chat', "The chat picks the product, but approval happens on the lender's page, because a chat only proves a phone number.", [
        { from: 'waBuyer', to: 'wa', label: '"I want the blue sofa"' },
        { from: 'wa', to: 'api', label: "webhook, with the platform's signature" },
        self('api', 'verify the platform signature'),
        { from: 'api', to: 'bot', label: 'verified message, from a phone number' },
        { from: 'bot', to: 'lending', label: 'new session: merchant, amount, phone' },
        { from: 'lending', to: 'bot', label: 'session ID', kind: 'reply' },
        { from: 'bot', to: 'wa', label: 'send a one-time approval link' },
        { from: 'wa', to: 'waBuyer', label: 'link arrives in the chat', kind: 'async' },
        { from: 'waBuyer', to: 'page', label: 'opens the link in a browser' },
        self('page', 'link: valid once, for minutes, this phone'),
        ...loginAndApprove('waBuyer'),
        { from: 'lending', to: 'bot', label: 'approved', kind: 'async' },
        { from: 'bot', to: 'wa', label: 'send "approved, thank you"' },
        { from: 'wa', to: 'waBuyer', label: 'confirmation in the chat', kind: 'async' },
      ]),
    )
  }

  if (f.links) {
    flows.push(
      sequence('link', 'Payment link', 'The merchant creates a link and shares it. The link only says what to pay, so the buyer still logs in.', [
        ...createCheckout('merchant', '/links'),
        { from: 'api', to: 'link', label: `create: amount${n.singleUseLinks ? ', single use, 24 h' : ''}` },
        { from: 'link', to: 'merchant', label: 'pay.lender.example/l/7Hq2…', kind: 'reply' },
        self('merchant', 'posts it on social media or in a chat'),
        { from: 'buyer', to: 'link', label: 'taps the link' },
        ...(n.strongAbuse ? [self('link', 'bot check, then resolve 7Hq2…')] : [self('link', 'resolve 7Hq2…')]),
        self('link', n.singleUseLinks ? 'exists, not expired, not used' : 'exists'),
        { from: 'link', to: 'page', label: 'checkout for this merchant and amount' },
        ...loginAndApprove('buyer'),
        ...(n.singleUseLinks ? [{ from: 'page', to: 'link', label: 'mark the link used' } as Message] : []),
        { from: 'page', to: 'buyer', label: 'approved', kind: 'reply' },
        ...webhook('merchant'),
      ]),
    )
  }
  return flows
}
