// Every OAuth 2.0 grant type, with its flow, the real HTTP at each step, use cases and security notes.
// Sources: RFC 6749, RFC 7636, RFC 8628, RFC 8693, RFC 7523, RFC 9700, and OpenID CIBA Core 1.0.
import type { Message, Participant } from './sequenceDiagram'

export type Status = 'recommended' | 'specific' | 'deprecated'
export type Step = Message & { http?: string; holds?: string; note: string }

export type Grant = {
  id: string
  name: string
  grantType: string
  spec: string
  status: Status
  oneLine: string
  useCases: string[]
  avoidWhen: string
  participants: Participant[]
  steps: Step[]
  security: string[]
  user: string
  clientSecret: string
  browser: string
  refresh: string
}

const p = (id: string, label: string, kind: Participant['kind']): Participant => ({ id, label, kind })
const USER = p('user', 'User', 'client')
const AS = p('as', 'Authorization server', 'service')
const API = p('api', 'Resource API', 'service')

export const GRANTS: Grant[] = [
  {
    id: 'code',
    name: 'Authorization Code + PKCE',
    grantType: 'authorization_code',
    spec: 'RFC 6749 §4.1, RFC 7636',
    status: 'recommended',
    oneLine: 'A user logs in at the authorization server, and the app gets a short-lived code that only it can exchange for tokens.',
    useCases: [
      "A budgeting app reads a customer's transactions at their bank",
      'A mobile banking app logs its own customers in',
      'A web app with a backend signs users in with a central login',
    ],
    avoidWhen: 'No user is present, or the device has no browser.',
    participants: [USER, p('app', 'App', 'client'), AS, API],
    steps: [
      { from: 'user', to: 'app', label: 'taps "Connect my bank"', note: 'The user starts the flow in the app.' },
      { from: 'app', to: 'app', label: 'make code_verifier + code_challenge', kind: 'self', note: 'A random verifier stays in the app. Only its hash travels in the URL.', holds: 'code_verifier (secret, in the app)' },
      {
        from: 'app',
        to: 'as',
        label: 'redirect: GET /authorize',
        note: "The browser goes to the authorization server. Nothing here is secret: the challenge is a hash.",
        http: `GET /authorize?response_type=code
  &client_id=budget-app
  &redirect_uri=https://budget.example/callback
  &scope=transactions.read
  &state=af0ifjsldkj
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256`,
      },
      { from: 'as', to: 'user', label: 'login + consent screen', kind: 'reply', note: 'The user types the password into the authorization server, never into the app, and approves the scope.' },
      {
        from: 'as',
        to: 'app',
        label: 'redirect back with a code',
        kind: 'reply',
        note: 'The code is short-lived and single-use. The app checks that state matches the one it sent.',
        http: `HTTP/1.1 302 Found
Location: https://budget.example/callback
  ?code=SplxlOBeZQQYbYS6WxSbIA
  &state=af0ifjsldkj`,
        holds: 'authorization code',
      },
      {
        from: 'app',
        to: 'as',
        label: 'POST /token: code + verifier',
        note: 'A direct call, not through the browser. The server hashes the verifier and compares it with the challenge.',
        http: `POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https://budget.example/callback
&client_id=budget-app
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`,
      },
      {
        from: 'as',
        to: 'app',
        label: 'access token + refresh token',
        kind: 'reply',
        note: 'The tokens never appeared in a URL.',
        http: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 300,
  "refresh_token": "tGzv3JOkF0XG5Qx2TlKWIA",
  "scope": "transactions.read"
}`,
        holds: 'access token (5 min) + refresh token',
      },
      {
        from: 'app',
        to: 'api',
        label: 'GET /transactions + Bearer token',
        note: 'The API checks the token signature, expiry and scope.',
        http: `GET /transactions
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...`,
      },
      { from: 'api', to: 'app', label: '200: transactions', kind: 'reply', note: 'Read access only, because that was the only scope granted.' },
    ],
    security: [
      'Always use PKCE, even for apps with a client secret.',
      'Compare redirect URIs as exact strings, and check state on return.',
      'Use the system browser on mobile, never an embedded web view.',
    ],
    user: 'yes',
    clientSecret: 'Optional: PKCE works without one',
    browser: 'Yes',
    refresh: 'Yes',
  },
  {
    id: 'client',
    name: 'Client Credentials',
    grantType: 'client_credentials',
    spec: 'RFC 6749 §4.4',
    status: 'recommended',
    oneLine: 'A service authenticates as itself, with no user involved, and gets a token for its own access.',
    useCases: ['A nightly settlement job pays merchants through the bank\'s API', "A merchant's server creates checkouts at a payment provider", 'A reconciliation service downloads statements'],
    avoidWhen: 'A user is involved, or the client is a browser or mobile app, which can\'t keep a secret.',
    participants: [p('svc', 'Settlement job', 'service'), AS, p('api', 'Payouts API', 'service')],
    steps: [
      {
        from: 'svc',
        to: 'as',
        label: 'POST /token: client ID + secret',
        note: 'The service proves its own identity. Only clients that can keep a secret may use this grant.',
        http: `POST /token
Authorization: Basic c2V0dGxlbWVudDpzM2NyM3Q=
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&scope=payouts.write`,
      },
      {
        from: 'as',
        to: 'svc',
        label: 'access token, no refresh token',
        kind: 'reply',
        note: 'No refresh token: the service can simply ask again with its credentials.',
        http: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 300,
  "scope": "payouts.write"
}`,
        holds: 'access token (5 min)',
      },
      {
        from: 'svc',
        to: 'api',
        label: 'POST /payouts + Bearer token',
        note: 'The API sees the client, not a user. Its scopes must be narrow.',
        http: `POST /payouts
Authorization: Bearer eyJhbGciOiJSUzI1NiIs...
Idempotency-Key: payout-2026-11-08-store-1

{ "merchant": "store-1", "amount": 95000 }`,
      },
      { from: 'api', to: 'svc', label: '201 created', kind: 'reply', note: 'The service caches the token until shortly before it expires.' },
    ],
    security: ['Keep the secret in a secrets manager, and rotate it.', 'Prefer a private key (JWT assertion or mTLS) over a shared secret for high-value services.', 'Grant each service only the scopes it needs.'],
    user: 'no',
    clientSecret: 'Required: secret, key or certificate',
    browser: 'No',
    refresh: 'No',
  },
  {
    id: 'refresh',
    name: 'Refresh Token',
    grantType: 'refresh_token',
    spec: 'RFC 6749 §6, RFC 9700',
    status: 'recommended',
    oneLine: 'An app swaps a long-lived refresh token for a new access token, so the user doesn\'t log in again.',
    useCases: ['A mobile app keeps a customer signed in for weeks', 'A web app renews short-lived access tokens silently', 'A budgeting app keeps syncing transactions overnight'],
    avoidWhen: 'The client can simply authenticate again, as with client credentials.',
    participants: [p('app', 'App', 'client'), AS, API],
    steps: [
      { from: 'app', to: 'api', label: 'GET /balance + expired token', note: 'Access tokens are short-lived on purpose.' },
      {
        from: 'api',
        to: 'app',
        label: '401 invalid_token',
        kind: 'reply',
        note: 'The API rejects the expired token.',
        http: `HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer error="invalid_token",
  error_description="The access token expired"`,
      },
      {
        from: 'app',
        to: 'as',
        label: 'POST /token: refresh_token',
        note: 'No user interaction. The refresh token is checked against the server\'s records, so it can be revoked.',
        http: `POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=tGzv3JOkF0XG5Qx2TlKWIA
&client_id=mobile-app`,
      },
      {
        from: 'as',
        to: 'app',
        label: 'new access token + new refresh token',
        kind: 'reply',
        note: 'With rotation, the old refresh token stops working. If it is ever used again, that reveals a theft.',
        http: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 300,
  "refresh_token": "8xLOxBtZp8nZWj0fV7bHxA"
}`,
        holds: 'new access token + rotated refresh token',
      },
      { from: 'app', to: 'api', label: 'retry with the new token', note: 'The user never noticed.' },
      { from: 'api', to: 'app', label: '200: balance', kind: 'reply', note: 'Done.' },
    ],
    security: ['RFC 9700: refresh tokens for public clients must be sender-constrained or rotated.', 'Store them in secure storage, such as the OS keychain.', 'Revoke them when the user logs out or the device is reported stolen.'],
    user: 'Only at first login',
    clientSecret: 'Optional',
    browser: 'No',
    refresh: 'It is one',
  },
  {
    id: 'device',
    name: 'Device Authorization',
    grantType: 'urn:ietf:params:oauth:grant-type:device_code',
    spec: 'RFC 8628',
    status: 'specific',
    oneLine: 'A device with no good keyboard or browser shows a short code, and the user approves on their phone.',
    useCases: ['A smart-TV banking app', 'A command-line tool for developers', 'Pairing a store terminal with a merchant account'],
    avoidWhen: 'The device has a usable browser, so authorization code works.',
    participants: [p('tv', 'TV app', 'client'), USER, p('phone', "User's phone", 'client'), AS],
    steps: [
      {
        from: 'tv',
        to: 'as',
        label: 'POST /device_authorization',
        note: 'The device asks for a pair of codes.',
        http: `POST /device_authorization
Content-Type: application/x-www-form-urlencoded

client_id=tv-banking
&scope=accounts.read`,
      },
      {
        from: 'as',
        to: 'tv',
        label: 'device_code + user_code + URL',
        kind: 'reply',
        note: 'The device_code stays on the device. The user_code is short, for a human to type.',
        http: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "device_code": "GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS",
  "user_code": "WDJB-MJHT",
  "verification_uri": "https://bank.example/device",
  "verification_uri_complete": "https://bank.example/device?user_code=WDJB-MJHT",
  "expires_in": 1800,
  "interval": 5
}`,
        holds: 'device_code',
      },
      { from: 'tv', to: 'user', label: 'shows WDJB-MJHT and a QR code', kind: 'reply', note: 'The TV displays the code and the URL.' },
      { from: 'user', to: 'phone', label: 'opens the URL, enters the code', note: 'The user switches to a device with a real browser.' },
      { from: 'phone', to: 'as', label: 'logs in and approves', note: 'A normal login, with whatever second factor the bank requires.' },
      {
        from: 'tv',
        to: 'as',
        label: 'POST /token every 5 s',
        note: 'The device polls. 5 seconds is the default interval.',
        http: `POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:device_code
&device_code=GmRhmhcxhwAzkoEqiMEg_DnyEysNkuNhszIySk9eS
&client_id=tv-banking`,
      },
      {
        from: 'as',
        to: 'tv',
        label: 'authorization_pending',
        kind: 'reply',
        note: 'Until the user approves. slow_down means wait 5 seconds longer between polls.',
        http: `HTTP/1.1 400 Bad Request
Content-Type: application/json

{ "error": "authorization_pending" }`,
      },
      {
        from: 'as',
        to: 'tv',
        label: 'tokens, once approved',
        kind: 'reply',
        note: 'The next poll after approval returns tokens.',
        http: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 300,
  "refresh_token": "e3Kp9QwzN1hY2vB7cL0sRg"
}`,
        holds: 'access token + refresh token',
      },
    ],
    security: ['Attackers can send a real user_code to a victim, and ask them to approve it. Show clearly what is being approved, and on which device.', 'Codes must expire quickly, and polling must be rate-limited.'],
    user: 'yes',
    clientSecret: 'No: usually a public client',
    browser: 'On a second device',
    refresh: 'Yes',
  },
  {
    id: 'ciba',
    name: 'CIBA (backchannel)',
    grantType: 'urn:openid:params:grant-type:ciba',
    spec: 'OpenID CIBA Core 1.0',
    status: 'specific',
    oneLine: "The action starts on someone else's device, such as a store terminal, and the user approves on their own phone.",
    useCases: ['A customer pays later at a store, and approves on their phone', 'A call center agent starts a change, and the customer approves', 'Approving a payment started on a kiosk'],
    avoidWhen: 'The user is already on the device where the action starts.',
    participants: [p('pos', 'Store terminal', 'client'), AS, p('phone', "Customer's phone", 'client'), USER],
    steps: [
      {
        from: 'pos',
        to: 'as',
        label: 'POST /bc-authorize: who, what',
        note: 'The terminal identifies the customer and shows a short code on its screen.',
        http: `POST /bc-authorize
Content-Type: application/x-www-form-urlencoded

scope=openid payments
&login_hint=+0000000000
&binding_message=W4SCT
&client_id=store-terminal`,
      },
      {
        from: 'as',
        to: 'pos',
        label: 'auth_req_id',
        kind: 'reply',
        note: 'An ID for this request, to collect the result later.',
        http: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "auth_req_id": "1c266114-a1be-4252-8ad1-04986c5b9ac1",
  "expires_in": 120,
  "interval": 2
}`,
        holds: 'auth_req_id',
      },
      { from: 'as', to: 'phone', label: 'push: approve "W4SCT", $300?', kind: 'async', note: 'The same code appears on both screens, so the customer knows it is this purchase.' },
      { from: 'user', to: 'phone', label: 'checks the code, approves', note: 'The customer never types a password at the store.' },
      {
        from: 'pos',
        to: 'as',
        label: 'POST /token: auth_req_id',
        note: 'Poll mode. In ping mode the server notifies first, and in push mode it sends the tokens itself.',
        http: `POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:openid:params:grant-type:ciba
&auth_req_id=1c266114-a1be-4252-8ad1-04986c5b9ac1
&client_id=store-terminal`,
      },
      { from: 'as', to: 'pos', label: 'tokens', kind: 'reply', note: 'The purchase can now go ahead.', holds: 'access token + ID token' },
    ],
    security: ['The binding message must be short and match on both screens.', 'Limit how often a terminal can push requests to the same customer, to prevent prompt fatigue.'],
    user: 'on another device',
    clientSecret: 'Yes: confidential client',
    browser: 'No',
    refresh: 'Optional',
  },
  {
    id: 'exchange',
    name: 'Token Exchange',
    grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
    spec: 'RFC 8693',
    status: 'specific',
    oneLine: "A service swaps the token it received for a new one, narrower and meant for the next service, still on the user's behalf.",
    useCases: ['A checkout service calls the payments service for the buyer, with less access', 'A gateway swaps an outside token for an internal one', 'Support staff act for a customer, with the delegation recorded'],
    avoidWhen: 'The service acts for itself, which is client credentials.',
    participants: [p('app', 'App', 'client'), p('checkout', 'Checkout API', 'service'), AS, p('payments', 'Payments API', 'service')],
    steps: [
      { from: 'app', to: 'checkout', label: 'POST /checkout + user token', note: "The user's token was issued for the checkout API only.", holds: 'user token, audience: checkout' },
      {
        from: 'checkout',
        to: 'as',
        label: 'POST /token: exchange for payments',
        note: "Passing the user's token on would be wrong: it isn't meant for the payments API, and carries more access than needed.",
        http: `POST /token
Authorization: Basic Y2hlY2tvdXQ6czNjcjN0
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&subject_token=eyJhbGciOiJSUzI1NiIs...
&subject_token_type=urn:ietf:params:oauth:token-type:access_token
&audience=payments-api
&scope=payments.create`,
      },
      {
        from: 'as',
        to: 'checkout',
        label: 'narrower token for payments',
        kind: 'reply',
        note: "The new token is for the payments API only, with one scope. Its act claim records that checkout acts for the user.",
        http: `HTTP/1.1 200 OK
Content-Type: application/json

{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "issued_token_type": "urn:ietf:params:oauth:token-type:access_token",
  "token_type": "Bearer",
  "expires_in": 60
}`,
        holds: 'token for payments, acting for the user',
      },
      { from: 'checkout', to: 'payments', label: 'POST /payments + new token', note: 'Payments sees both the user and the acting service.' },
      { from: 'payments', to: 'checkout', label: '201 created', kind: 'reply', note: 'Each hop carries only what it needs.' },
    ],
    security: ['Decide which services may exchange which tokens, and for which audiences.', 'Prefer delegation, which records the actor, over impersonation, which hides it.'],
    user: 'Yes, already logged in',
    clientSecret: 'Yes: the exchanging service authenticates',
    browser: 'No',
    refresh: 'Usually no',
  },
  {
    id: 'jwt',
    name: 'JWT Bearer assertion',
    grantType: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    spec: 'RFC 7523',
    status: 'specific',
    oneLine: 'A service signs a short JWT with its private key, and exchanges it for an access token. No shared secret is sent.',
    useCases: ['A cloud service account calling another provider\'s API', 'A partner server authenticating with a key pair instead of a secret', 'Bridging an existing identity system into OAuth'],
    avoidWhen: 'A simple shared secret is acceptable, or a user needs to consent.',
    participants: [p('svc', 'Partner service', 'service'), AS, API],
    steps: [
      {
        from: 'svc',
        to: 'svc',
        label: 'sign a JWT with its private key',
        kind: 'self',
        note: 'The claims say who it is, which server it is for, and when it expires.',
        http: `{
  "iss": "partner-42",
  "sub": "partner-42",
  "aud": "https://auth.lender.example/token",
  "exp": 1793000300,
  "jti": "a1b2c3"
}`,
        holds: 'signed assertion',
      },
      {
        from: 'svc',
        to: 'as',
        label: 'POST /token: assertion',
        note: 'The server checks the signature with the public key registered for this partner.',
        http: `POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
&assertion=eyJhbGciOiJFUzI1NiIs...`,
      },
      { from: 'as', to: 'svc', label: 'access token', kind: 'reply', note: 'The private key never left the partner.', holds: 'access token' },
      { from: 'svc', to: 'api', label: 'call + Bearer token', note: 'A normal API call from here.' },
      { from: 'api', to: 'svc', label: '200', kind: 'reply', note: 'Done.' },
    ],
    security: ['Keep assertions short-lived, and reject a reused jti.', 'The same idea also authenticates clients in other grants, as private_key_jwt. A SAML version exists too (RFC 7522).'],
    user: 'no',
    clientSecret: 'A private key, never sent',
    browser: 'No',
    refresh: 'No',
  },
  {
    id: 'implicit',
    name: 'Implicit',
    grantType: 'response_type=token (no token endpoint)',
    spec: 'RFC 6749 §4.2, discouraged by RFC 9700',
    status: 'deprecated',
    oneLine: 'The access token comes back directly in the redirect URL. Built for old browsers that couldn\'t call another domain.',
    useCases: ['Only in legacy single-page apps, which should migrate'],
    avoidWhen: 'Always. Use authorization code with PKCE instead.',
    participants: [USER, p('spa', 'Browser app', 'client'), AS, API],
    steps: [
      { from: 'spa', to: 'as', label: 'redirect: GET /authorize, type=token', note: 'No code step.', http: `GET /authorize?response_type=token
  &client_id=old-spa
  &redirect_uri=https://app.example/callback
  &scope=transactions.read
  &state=xyz` },
      { from: 'as', to: 'user', label: 'login + consent', kind: 'reply', note: 'The same login screen.' },
      {
        from: 'as',
        to: 'spa',
        label: 'redirect with the token in the URL',
        kind: 'reply',
        note: 'The token itself is in the URL, so it can leak through history, logs or a malicious extension.',
        http: `HTTP/1.1 302 Found
Location: https://app.example/callback
  #access_token=eyJhbGciOiJSUzI1NiIs...
  &token_type=Bearer
  &expires_in=3600
  &state=xyz`,
        holds: 'access token, exposed in the URL',
      },
      { from: 'spa', to: 'api', label: 'call + Bearer token', note: 'No refresh token, so the user must go through the flow again when it expires.' },
    ],
    security: ['RFC 9700: clients should not use it.', "Tokens in URLs leak, and an attacker can inject a token of their own."],
    user: 'yes',
    clientSecret: 'No',
    browser: 'Yes',
    refresh: 'No',
  },
  {
    id: 'password',
    name: 'Resource Owner Password',
    grantType: 'password',
    spec: 'RFC 6749 §4.3, forbidden by RFC 9700',
    status: 'deprecated',
    oneLine: 'The app collects the user\'s password and sends it to the authorization server for a token.',
    useCases: ['Only while migrating a legacy app that already handles passwords'],
    avoidWhen: 'Always. Use authorization code with PKCE instead.',
    participants: [USER, p('app', 'App', 'client'), AS],
    steps: [
      { from: 'user', to: 'app', label: 'types username + password into the app', note: 'The app now sees the password, which is what OAuth exists to avoid.' },
      {
        from: 'app',
        to: 'as',
        label: 'POST /token: username + password',
        note: 'No consent screen, and no room for a second factor or a passkey.',
        http: `POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=password
&username=alice
&password=hunter2
&client_id=legacy-app`,
      },
      { from: 'as', to: 'app', label: 'tokens', kind: 'reply', note: 'It works, which is why it lingers.', holds: 'tokens, and the password' },
    ],
    security: ['RFC 9700: it must not be used.', 'It trains users to type their password into any app that asks.'],
    user: 'yes',
    clientSecret: 'Optional',
    browser: 'No',
    refresh: 'Yes',
  },
]

export type Question = { id: string; text: string; options: { label: string; next: string }[] }

// The wizard: each answer leads to another question or to a grant.
export const QUESTIONS: Record<string, Question> = {
  start: { id: 'start', text: 'Is a user involved, giving access to their own data?', options: [{ label: 'Yes', next: 'token' }, { label: 'No, a service acts for itself', next: 'secret' }] },
  secret: {
    id: 'secret',
    text: 'How should the service prove who it is?',
    options: [
      { label: 'With a secret it keeps safe', next: 'grant:client' },
      { label: 'With a private key, never sending a secret', next: 'grant:jwt' },
    ],
  },
  token: {
    id: 'token',
    text: "Do you already hold the user's token, and need to call another service with it?",
    options: [
      { label: 'Yes, a service calls another for the user', next: 'grant:exchange' },
      { label: 'No, the user is about to log in', next: 'where' },
    ],
  },
  where: {
    id: 'where',
    text: 'Where does the action start?',
    options: [
      { label: "On the user's own device, with a browser", next: 'grant:code' },
      { label: 'On a TV or a command line, with no good browser', next: 'grant:device' },
      { label: "On someone else's device, such as a store terminal", next: 'grant:ciba' },
    ],
  },
}

export type Scenario = { text: string; answer: string; why: string }

export const SCENARIOS: Scenario[] = [
  { text: 'A nightly job pays every merchant through the bank\'s payouts API.', answer: 'client', why: 'No user is involved, and the job runs on a server that can keep a secret.' },
  { text: "A budgeting web app wants to read a customer's transactions at their bank.", answer: 'code', why: 'A user is present, with a browser, and must consent without giving the app a password.' },
  { text: 'A customer wants to check their balance on a smart-TV app.', answer: 'device', why: 'Typing a password with a TV remote is impractical, so the user approves on their phone.' },
  { text: 'At a store till, the customer approves a pay-later purchase on their own phone.', answer: 'ciba', why: "The action starts on the store's terminal, and the customer approves on a different device." },
  { text: 'The checkout service calls the payments service for the buyer, with only the access payments needs.', answer: 'exchange', why: 'It already has the user\'s token, and swaps it for a narrower one meant for payments.' },
  { text: 'A mobile app should keep the customer logged in for weeks, without asking again.', answer: 'refresh', why: 'After the first login, a refresh token renews short-lived access tokens silently.' },
  { text: 'A partner\'s server must authenticate without any shared secret, using its key pair.', answer: 'jwt', why: 'It signs a short JWT with its private key, and the server checks it with the public key.' },
  { text: 'An old app collects the username and password itself. What should it move to?', answer: 'code', why: 'The password grant must not be used. Move the login to the authorization server, with code and PKCE.' },
]
