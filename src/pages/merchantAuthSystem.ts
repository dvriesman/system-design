// How merchants connect to a pay-later lender, and how each side proves who it is. Thresholds and timings are rules of thumb.
import type { DiagramEdge, DiagramNode, Kind, Zone } from './caseStudyLayout'

export type Functional = {
  widget: boolean
  links: boolean
  whatsapp: boolean
  portal: boolean
  webhooks: boolean
}

export type MerchantAuth = 'apiKey' | 'oauth' | 'bound'
export type TokenCheck = 'local' | 'introspect'
export type CustomerAuth = 'sms' | 'whatsapp' | 'passkey'
export type WebhookTrust = 'unsigned' | 'signed' | 'mtls'

export type NonFunctional = {
  merchants: number
  peakFactor: number
  merchantAuth: MerchantAuth
  tokenCheck: TokenCheck
  instantRevocation: boolean
  customerAuth: CustomerAuth
  stepUp: boolean
  singleUseLinks: boolean
  webhookTrust: WebhookTrust
  strongAbuse: boolean
  staffSso: boolean
  availability: 99.9 | 99.99
}

export type Requirements = { f: Functional; n: NonFunctional }
export type System = { nodes: DiagramNode[]; edges: DiagramEdge[]; zones: Zone[] }

export const MERCHANT_STEPS = [100, 1000, 5000, 20000, 50000, 100000]
const CHECKOUTS_PER_MERCHANT_DAY = 40
export const TOKEN_MINUTES = 5

export function design({ f, n }: Requirements): System {
  const authServer = n.merchantAuth !== 'apiKey'
  const denylist = authServer && n.instantRevocation && n.tokenCheck === 'local'
  const risk = n.strongAbuse || n.stepUp
  const keys = authServer || (f.webhooks && n.webhookTrust !== 'unsigned')
  const multiRegion = n.availability >= 99.99
  const sms = n.customerAuth !== 'whatsapp' || !f.whatsapp

  const nodes: DiagramNode[] = []
  const add = (id: string, kind: Kind, title: string, sub: string, col: number, row: number, why: string, tradeoff: string, extra: Partial<DiagramNode> = {}) =>
    nodes.push({ id, kind, title, sub, col, row, why, tradeoff, ...extra })

  // ---- clients
  add('buyer', 'client', "Buyer's browser", 'pays on the lender\'s page', 0, 0, 'The buyer logs in and approves the purchase on a page the lender controls, never on the merchant\'s.', 'One more hop in the checkout, in exchange for the merchant never seeing the buyer\'s login.')
  add('site', 'client', 'Merchant website', f.widget ? 'embeds the pay-later widget' : 'shows the pay-later button', 0, 1, 'Where the buyer chooses to pay later.', "You don't control its code, so nothing secret can live in the browser.")
  add('backend', 'client', 'Merchant backend', 'holds the API credentials', 0, 2, 'Only the merchant\'s server calls the API, because only a server can keep a secret.', 'Every merchant has to store and rotate a credential safely.')
  if (f.whatsapp) add('waBuyer', 'client', 'Buyer on WhatsApp', 'chats to buy', 0, 3, 'Functional requirement: buy in a WhatsApp conversation, without a website.', 'A phone number is all you start with, which is weak proof of identity.')
  if (f.links) add('social', 'client', 'Social post or chat', 'a shared payment link', 0, 4, 'Functional requirement: merchants with no website sell through links in posts and chats.', 'Anyone can copy or fake a link, so the link itself must not grant anything.')
  if (f.portal) add('staff', 'client', 'Merchant staff', 'uses the portal', 0, 5, 'Functional requirement: merchant staff manage keys, links and refunds.', 'People log in here, so staff accounts become a target.')

  // ---- edge
  add(
    'cdn',
    'edge',
    'CDN + WAF',
    n.strongAbuse ? 'public pages, bot defense' : 'public pages, filtered',
    1,
    0,
    n.strongAbuse ? 'Abuse protection: public pages and links attract bots, so traffic is scored and filtered before it reaches you.' : 'Public pages need TLS, caching and basic attack filtering.',
    'Strict bot rules can block real buyers on unusual networks.',
  )
  add(
    'gateway',
    'edge',
    'API gateway',
    n.merchantAuth === 'apiKey' ? 'checks API keys' : n.merchantAuth === 'oauth' ? 'checks access tokens' : 'checks certificate + token',
    1,
    2,
    n.merchantAuth === 'apiKey' ? 'Every API call carries the merchant\'s API key, and the gateway checks it.' : n.merchantAuth === 'oauth' ? 'Every API call carries a short-lived access token, and the gateway checks its signature and scopes.' : 'Security: a token only works together with the certificate it was issued to, so a stolen token is useless alone.',
    'Every call passes through it, so it must be fast and highly available.',
  )
  if (f.whatsapp) add('wa', 'external', 'WhatsApp platform', 'delivers messages', 1, 3, 'The messaging platform carries messages between the buyer and the lender\'s business number.', 'You depend on its rules, uptime and template approval.')

  // ---- services
  add('hosted', 'service', 'Hosted checkout', f.widget ? 'pages + widget' : 'login and approval pages', 2, 0, 'The buyer logs in and approves on the lender\'s own page, so credentials never pass through the merchant.', f.widget ? 'An iframe keeps the page isolated, but it must refuse to be framed by sites that aren\'t registered.' : 'A redirect leaves the merchant\'s site for a moment.')
  add(
    'login',
    'service',
    'Customer login',
    n.customerAuth === 'passkey' ? 'passkey, code as fallback' : n.customerAuth === 'whatsapp' ? 'one-time code by WhatsApp' : 'one-time code by SMS',
    2,
    1,
    n.customerAuth === 'passkey' ? 'Security: a passkey can\'t be phished or intercepted, unlike a code.' : 'The buyer proves they control the phone number on file.',
    n.customerAuth === 'passkey' ? 'Not every phone supports passkeys yet, so a code remains as a fallback.' : 'Codes can be phished, and a SIM swap moves them to an attacker.',
  )
  add('api', 'service', 'Merchant API', 'checkout sessions', 2, 2, 'Creates checkout sessions for the authenticated merchant, and only that merchant.', 'Every query must be scoped to the merchant in the token, never to an ID in the request.')
  if (f.whatsapp) add('bot', 'service', 'WhatsApp checkout bot', 'conversations, carts', 2, 3, 'Runs the conversation: picks the item, then hands the buyer a one-time link to log in and approve.', 'Approval happens on a secure page, not in the chat, because a chat message proves little about who sent it.')
  if (f.links) add('links', 'service', 'Payment links', 'create, resolve, expire', 2, 4, 'Turns a link into a checkout for a fixed merchant and amount.', n.singleUseLinks ? 'Single-use links are safer, but a buyer who refreshes may need a new one.' : 'A reusable link is convenient, but it can be shared far beyond its intended buyer.')
  if (f.portal) add('portal', 'service', 'Merchant portal', 'keys, links, refunds', 2, 5, 'Staff manage credentials, webhooks and refunds here.', 'The most powerful merchant actions happen here, so they need roles and an audit trail.')
  if (f.webhooks) add('hooks', 'service', 'Webhook sender', 'order events to merchants', 2, 6, 'Functional requirement: merchants hear about approvals and refunds without polling.', 'Delivered at least once, so merchants must handle duplicates.')

  add('lending', 'service', 'Lending core', 'limits, loans, decisions', 3, 0, 'The credit side, kept behind every channel. This case study is about who may reach it.', 'Out of scope here: see the Pay-Later Checkout case study.')
  add('sessions', 'cache', 'Session store', multiRegion ? 'buyer sessions, 2 regions' : 'buyer sessions', 3, 1, 'Remembers a logged-in buyer for a short time, so the next step doesn\'t ask again.', 'Short sessions are safer and ask more often.')
  if (authServer) {
    add(
      'auth',
      'service',
      'Authorization server',
      multiRegion ? 'merchant tokens, 2 regions' : 'issues merchant tokens',
      3,
      2,
      'Issues short-lived tokens, so a leaked token expires on its own.',
      'Every integration depends on it, so it must be highly available.',
    )
  }
  if (f.whatsapp) add('conv', 'cache', 'Conversation state', 'step in each chat', 3, 3, 'Remembers where each chat is: browsing, cart or waiting for approval.', 'Expires quickly, so an old chat starts again.')
  if (f.links) add('linkDb', 'db', 'Links database', 'merchant, amount, expiry, uses', 3, 4, 'Holds what each link may do. The link itself is only a random ID.', 'Lookups on every open, so it must be fast.')
  add('registry', 'db', 'Merchant registry', n.merchantAuth === 'apiKey' ? 'key hashes, URLs, roles' : 'clients, scopes, URLs, roles', 3, 5, 'Holds each merchant\'s credentials (hashed), allowed redirect and webhook URLs, and staff roles.', 'The source of truth for who is allowed what, so changes must be audited.')

  if (risk) add('risk', 'service', 'Risk checks', n.stepUp ? 'device, behavior, step-up' : 'device, behavior', 4, 0, n.stepUp ? 'Security: large or unusual purchases trigger an extra check before approval.' : 'Abuse protection: scores devices and behavior, and spots fake links.', 'Every extra check stops some real buyers.')
  if (denylist) add('denylist', 'cache', 'Revoked tokens', 'checked on each call', 4, 2, 'Revocation: tokens are checked locally, so revoked ones are listed until they expire.', 'A lookup on every call, and the list must reach every gateway.')
  if (keys) add('kms', 'security', 'Key management', 'signing keys, secrets', 4, 5, 'Signing keys for tokens and webhooks live here, and services ask it to sign without seeing the key.', 'Everything that signs depends on it.')

  // ---- external
  if (sms) add('smsp', 'external', 'SMS provider', 'delivers codes', 5, 1, 'Delivers one-time codes to the buyer\'s phone.', 'SMS can be intercepted or redirected by a SIM swap.')
  if (f.portal && n.staffSso) add('idp', 'external', "Merchant's SSO", 'company identity provider', 5, 5, "Staff log in with their company account, so leavers lose access when their employer disables them.", 'Each large merchant\'s login setup becomes part of yours.')
  if (f.webhooks) add('endpoint', 'external', 'Merchant webhook URL', 'receives events', 5, 6, 'The merchant\'s server that receives order events.', n.webhookTrust === 'unsigned' ? 'Unsigned: anyone who finds the URL can send fake "approved" events.' : 'The merchant must verify every signature, or signing protects nothing.')

  // ---- edges
  const has = (id: string) => nodes.some((x) => x.id === id)
  const edges: DiagramEdge[] = []
  const seen = new Set<string>()
  const link = (from: string, to: string, purpose: string, opts: Omit<DiagramEdge, 'from' | 'to' | 'purpose'> = {}) => {
    if (!has(from) || !has(to) || seen.has(`${from}-${to}`)) return
    seen.add(`${from}-${to}`)
    edges.push({ from, to, purpose, ...opts })
  }
  const credential = n.merchantAuth === 'apiKey' ? 'sends its API key with every call' : n.merchantAuth === 'oauth' ? 'sends a short-lived access token' : 'sends a token bound to its own certificate, over mTLS'

  link('site', 'backend', 'the buyer chooses to pay later')
  link('backend', 'gateway', `creates a checkout session, and ${credential}`)
  if (f.widget) link('site', 'cdn', 'loads the widget, which opens the hosted page in an iframe')
  link('buyer', 'cdn', f.widget ? 'uses the hosted page inside the widget' : 'is redirected to the hosted page')
  link('cdn', 'hosted', 'serves the checkout pages, after filtering bad traffic')
  link('hosted', 'login', 'asks the buyer to log in')
  link('login', 'sessions', "keeps the buyer's session for a short time")
  if (sms) link('login', 'smsp', 'sends a one-time code by SMS')
  if (!sms) link('login', 'wa', 'sends the one-time code as a WhatsApp message')
  link('hosted', 'lending', 'approves the purchase, for the merchant and amount in the session')
  link('hosted', 'risk', n.stepUp ? 'asks whether this purchase needs an extra check' : 'checks the device and behavior')
  if (n.merchantAuth === 'apiKey' && !authServer) link('gateway', 'registry', 'looks up the hash of the API key')
  if (authServer) {
    link('backend', 'auth', n.merchantAuth === 'bound' ? 'proves its identity with its certificate or a signed assertion, and gets a token' : n.merchantAuth === 'oauth' ? 'exchanges its client ID and secret for a token' : 'exchanges its credentials for a token')
    link('gateway', 'auth', n.tokenCheck === 'introspect' ? 'asks whether each token is still valid' : 'fetches the public signing keys, and checks tokens itself')
    link('auth', 'registry', "looks up the client, its scopes and keys")
    link('auth', 'kms', 'signs tokens with a key it never sees')
  }
  link('gateway', 'denylist', "checks the token hasn't been revoked")
  link('gateway', 'api', "passes on the request, with the merchant's identity and scopes")
  link('api', 'lending', 'creates a checkout session for this merchant only')

  if (f.whatsapp) {
    link('waBuyer', 'wa', "chats with the lender's verified business number")
    link('wa', 'gateway', 'forwards each message to the lender, signed by the platform')
    link('gateway', 'bot', 'passes on messages whose signature checked out')
    link('bot', 'conv', 'reads and updates where this chat is')
    link('bot', 'wa', 'replies, and sends a one-time approval link')
    link('bot', 'lending', 'starts a purchase for this phone number')
    link('bot', 'hosted', 'creates a one-time link, so the buyer approves on a secure page')
  }

  if (f.links) {
    link('social', 'cdn', 'the buyer taps the link')
    link('cdn', 'links', 'resolves the link ID')
    link('links', 'linkDb', n.singleUseLinks ? 'reads the merchant, amount and expiry, and marks the link used' : 'reads the merchant and amount for this link')
    link('links', 'hosted', 'opens a checkout for exactly that merchant and amount')
    link('links', 'risk', 'checks for abuse, such as one link opened from many devices')
    link('api', 'links', 'creates links for the authenticated merchant')
  }

  if (f.portal) {
    link('staff', 'cdn', 'opens the portal')
    link('cdn', 'portal', 'serves the portal, after login')
    link('portal', 'registry', 'manages API keys, webhook URLs and staff roles')
    link('portal', 'links', 'creates and cancels links')
    if (n.staffSso) link('portal', 'idp', 'staff log in with their company account')
  }

  if (f.webhooks) {
    link('lending', 'hooks', 'order approved, refunded or cancelled', { async: true })
    link(
      'hooks',
      'endpoint',
      n.webhookTrust === 'unsigned' ? 'posts each event, unsigned' : n.webhookTrust === 'signed' ? 'posts each event, signed with a timestamp the merchant checks' : 'posts each event, signed, over mutually authenticated TLS',
      { async: true },
    )
    if (n.webhookTrust !== 'unsigned') link('hooks', 'kms', 'signs each event')
  }

  link('registry', 'kms', 'encrypts the stored credentials and webhook secrets')

  // ---- zones
  const zones: Zone[] = []

  return { nodes, edges, zones }
}

export type Metrics = { apiPeak: number; tokensPerSecond: number; revocation: string; authLatency: number; secret: string }

export function metrics({ n }: Requirements): Metrics {
  const apiPeak = ((n.merchants * CHECKOUTS_PER_MERCHANT_DAY) / 86400) * n.peakFactor * 3
  const tokens = n.merchantAuth !== 'apiKey'
  return {
    apiPeak,
    tokensPerSecond: tokens ? n.merchants / (TOKEN_MINUTES * 60) : 0,
    revocation: !tokens ? 'at once: keys are looked up' : n.tokenCheck === 'introspect' || n.instantRevocation ? 'within seconds' : `up to ${TOKEN_MINUTES} minutes`,
    authLatency: (!tokens ? 3 : n.tokenCheck === 'introspect' ? 12 : 1) + (n.instantRevocation && tokens && n.tokenCheck === 'local' ? 1 : 0) + (n.merchantAuth === 'bound' ? 1 : 0),
    secret: n.merchantAuth === 'apiKey' ? 'a long-lived API key' : n.merchantAuth === 'oauth' ? 'a client secret' : 'a private key it never sends',
  }
}

const BASE: NonFunctional = {
  merchants: 1000,
  peakFactor: 10,
  merchantAuth: 'apiKey',
  tokenCheck: 'local',
  instantRevocation: false,
  customerAuth: 'sms',
  stepUp: false,
  singleUseLinks: false,
  webhookTrust: 'signed',
  strongAbuse: false,
  staffSso: false,
  availability: 99.9,
}
const NONE: Functional = { widget: false, links: false, whatsapp: false, portal: false, webhooks: false }

export type Example = { name: string; story: string; req: Requirements }

export const EXAMPLES: Example[] = [
  { name: '1 · Redirect + API key', story: 'The smallest integration: the merchant\'s server calls the API with a key, and the buyer is redirected to the lender\'s page to log in.', req: { f: NONE, n: BASE } },
  {
    name: '2 · OAuth + webhooks',
    story: 'Short-lived tokens replace long-lived keys, a portal manages credentials, and merchants hear about orders through signed webhooks.',
    req: { f: { ...NONE, portal: true, webhooks: true }, n: { ...BASE, merchants: 5000, merchantAuth: 'oauth' } },
  },
  {
    name: '3 · Payment links',
    story: 'Merchants without a website share links in posts and chats. Links are single-use and expire, and bots are filtered.',
    req: { f: { ...NONE, portal: true, webhooks: true, links: true }, n: { ...BASE, merchants: 20000, merchantAuth: 'oauth', singleUseLinks: true, strongAbuse: true } },
  },
  {
    name: '4 · WhatsApp',
    story: 'Buyers shop in a WhatsApp chat. The chat proves little, so approval happens on a secure page, with an extra check for large amounts.',
    req: { f: { ...NONE, portal: true, webhooks: true, links: true, whatsapp: true }, n: { ...BASE, merchants: 20000, merchantAuth: 'oauth', singleUseLinks: true, strongAbuse: true, customerAuth: 'whatsapp', stepUp: true } },
  },
]
