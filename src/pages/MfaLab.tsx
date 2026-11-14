import { useEffect, useState } from 'react'
import { ascii, base32, hex, totp, totpStep, verifyTotp } from './mfaCrypto'

// Part 1 of the Multi-Factor Authentication page: one kind of factor per tab, then a real authenticator code and a passkey.
type Tone = 'ok' | 'wait' | 'short'
type LabStep = { title: string; text: string; needs: string; stuffing: Tone; simswap: Tone; phishing: Tone }

const SCRIPTS: Record<string, { label: string; idea: string; steps: LabStep[] }> = {
  password: {
    label: '1 · A password',
    idea: 'Something you know. It works anywhere, on any device, and that is the problem: anyone who learns it is you.',
    steps: [
      { title: 'One secret, typed everywhere', text: 'The server stores a slow hash of the password and compares. Nothing ties the password to a person or a device.', needs: 'the password', stuffing: 'short', simswap: 'short', phishing: 'short' },
      { title: 'Passwords leak, and are reused', text: 'When another site is breached, attackers try the same email and password on banks automatically. This is called credential stuffing, and it needs no skill at all.', needs: 'the password, from any breach', stuffing: 'short', simswap: 'short', phishing: 'short' },
    ],
  },
  sms: {
    label: '2 · A code by SMS',
    idea: 'Something you have: the phone that receives the text. A leaked password is no longer enough on its own.',
    steps: [
      { title: 'The bank texts a 6-digit code', text: 'The attacker has the password, but not the code, so credential stuffing stops here. This alone blocks the most common attack.', needs: 'the password + a code sent to her number', stuffing: 'ok', simswap: 'short', phishing: 'short' },
      { title: 'But the code goes to a number, not a phone', text: 'In a SIM swap, an attacker convinces the carrier to move the number to their SIM. NIST SP 800-63B calls SMS a "restricted" authenticator for this kind of reason, and says verifiers should consider risk indicators such as a SIM change.', needs: 'the password + her number', stuffing: 'ok', simswap: 'short', phishing: 'short' },
      { title: 'And she can be asked to read it out', text: 'A phishing page that looks like the bank asks for the code and passes it on. NIST says plainly that out-of-band authentication is not phishing-resistant.', needs: 'the password + a moment of her trust', stuffing: 'ok', simswap: 'short', phishing: 'short' },
    ],
  },
  totp: {
    label: '3 · An authenticator app',
    idea: 'A shared secret, stored in an app when she scans a QR code. Every 30 seconds both sides compute the same 6 digits from the secret and the clock. RFC 6238 defines it, building on RFC 4226.',
    steps: [
      { title: 'No network, no phone number', text: 'The code is computed on the phone. A SIM swap gets nothing, because the secret was never in the phone number.', needs: 'the password + the secret on her phone', stuffing: 'ok', simswap: 'ok', phishing: 'short' },
      { title: 'Still a code she types', text: 'A phishing page asks for it and uses it within the same 30 seconds. NIST: "OTP authentication is not phishing-resistant." Try the calculator below: the code is just a function of the secret and the time.', needs: 'the password + 30 seconds of her trust', stuffing: 'ok', simswap: 'ok', phishing: 'short' },
    ],
  },
  passkey: {
    label: '4 · A passkey',
    idea: 'A key pair made for one site. The private key stays on the device, unlocked by a fingerprint or PIN. Signing in means signing a fresh challenge, and the browser includes the site\'s origin in what is signed. This is WebAuthn.',
    steps: [
      { title: 'Nothing to type, nothing to read out', text: 'There is no code a person could be tricked into passing on. The browser offers the bank\'s passkey only on the bank\'s domain.', needs: 'her device, unlocked by her', stuffing: 'ok', simswap: 'ok', phishing: 'ok' },
      { title: 'The origin is part of the signature', text: 'Even if a phishing page relayed a challenge, the signed data would name the phishing origin, and the bank rejects it. NIST names WebAuthn as an example of phishing resistance through "verifier name binding". Try the demo below.', needs: 'her device, on the real site', stuffing: 'ok', simswap: 'ok', phishing: 'ok' },
    ],
  },
}

const RFC_SECRET = ascii('12345678901234567890')
const ALICE_SECRET = ascii('alice-totp-secret-01')

function TotpWidget() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [paused, setPaused] = useState(false)
  const [offset, setOffset] = useState(0)
  const [secretId, setSecretId] = useState<'alice' | 'rfc'>('alice')
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (paused) return
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(id)
  }, [paused])
  const key = secretId === 'rfc' ? RFC_SECRET : ALICE_SECRET
  const t = now + offset
  const r = totp(key, t)
  const macHex = hex(r.mac)
  const left = 30 - (t % 30)
  const check = typed.length === 6 ? verifyTotp(key, typed, now) : undefined
  return (
    <div className="sim-store">
      <h3>
        <span>Try it: a real authenticator code, computed in your browser</span>
        <span className="sim-tag">HMAC-SHA1 · 6 digits · 30 s</span>
      </h3>
      <div className="sim-axis">
        <span className="sim-axis-label">Secret</span>
        <div className="sim-seg" role="group" aria-label="Secret">
          <button type="button" aria-pressed={secretId === 'alice'} onClick={() => setSecretId('alice')}>
            Alice's: {base32(ALICE_SECRET).slice(0, 16)}…
          </button>
          <button type="button" aria-pressed={secretId === 'rfc'} onClick={() => setSecretId('rfc')}>
            RFC 4226 test secret
          </button>
        </div>
      </div>
      <div className="sim-axis">
        <span className="sim-axis-label">Phone's clock</span>
        <div className="sim-seg" role="group" aria-label="Clock">
          {[-60, -30, 0, 30, 60].map((o) => (
            <button key={o} type="button" aria-pressed={offset === o} onClick={() => setOffset(o)}>
              {o === 0 ? 'in sync' : `${o > 0 ? '+' : ''}${o} s`}
            </button>
          ))}
          <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
            {paused ? 'paused' : 'pause'}
          </button>
        </div>
      </div>
      <div className="mfa-code">
        <b>{r.code.slice(0, 3)} {r.code.slice(3)}</b>
        <span className="mfa-bar" style={{ ['--left' as string]: `${(left / 30) * 100}%` }} />
        <span className="sim-small sim-muted">{left} s left in this step</span>
      </div>
      <ol className="mfa-trace">
        <li>
          <span>time ÷ 30</span>
          <code>
            {t} ÷ 30 = step {totpStep(t)}
          </code>
        </li>
        <li>
          <span>counter, 8 bytes</span>
          <code>{hex(r.message)}</code>
        </li>
        <li>
          <span>HMAC-SHA1(secret, counter)</span>
          <code>
            {macHex.slice(0, r.offset * 2)}
            <mark>{macHex.slice(r.offset * 2, r.offset * 2 + 8)}</mark>
            {macHex.slice(r.offset * 2 + 8, 38)}
            <u>{macHex.slice(38)}</u>
          </code>
        </li>
        <li>
          <span>offset = last nibble</span>
          <code>
            0x{macHex.slice(39)} = {r.offset}: take the 4 bytes there
          </code>
        </li>
        <li>
          <span>drop the top bit</span>
          <code>{r.binary}</code>
        </li>
        <li>
          <span>last 6 digits</span>
          <code>
            {r.binary} mod 1,000,000 = {r.code}
          </code>
        </li>
      </ol>
      <div className="sim-axis">
        <span className="sim-axis-label">The server checks</span>
        <input className="mfa-input" inputMode="numeric" maxLength={6} placeholder="type 6 digits" value={typed} onChange={(e) => setTyped(e.target.value.replace(/\D/g, ''))} aria-label="Code to check" />
      </div>
      {check !== undefined ? (
        <div className={`sim-tx-reader ${check === null ? 'short' : 'ok'}`}>
          {check === null ? 'Rejected' : 'Accepted'}
          <span>
            {check === null
              ? 'Not the code for the server\'s current step, or one step either side. Set the phone 60 s off to see drift fail.'
              : check === 0
                ? 'Matches the current step.'
                : `Matches the ${check < 0 ? 'previous' : 'next'} step: the server allows one step of clock drift, which is Keycloak's default look-around window.`}
          </span>
        </div>
      ) : (
        <p className="sim-small sim-muted">Type the code above to play the server. The server uses the real clock, not the phone's.</p>
      )}
      <p className="sim-small sim-muted">
        RFC 4226 uses the test secret for its published test values, such as 287082 for counter 1, and this calculation reproduces all of them. Six digits mean a million possibilities, so servers must limit wrong guesses: NIST
        allows at most 100 consecutive failures per authenticator.
      </p>
    </div>
  )
}

function PasskeyWidget() {
  const [site, setSite] = useState<'real' | 'phish'>('phish')
  const origin = site === 'real' ? 'https://bank.example' : 'https://bank-secure-login.example'
  const offered = site === 'real'
  return (
    <div className="sim-store">
      <h3>
        <span>Try it: where does the passkey work?</span>
      </h3>
      <div className="sim-axis">
        <span className="sim-axis-label">Alice is on</span>
        <div className="sim-seg" role="group" aria-label="Site">
          <button type="button" aria-pressed={site === 'real'} onClick={() => setSite('real')}>
            bank.example
          </button>
          <button type="button" aria-pressed={site === 'phish'} onClick={() => setSite('phish')}>
            bank-secure-login.example
          </button>
        </div>
      </div>
      <pre className="sim-block">{`passkey: created for rpId "bank.example"
browser origin: ${origin}

${offered ? `browser: rpId matches, so it offers the passkey
signed data: { challenge, origin: "${origin}" }
bank: signature valid, origin is mine  →  signed in` : `browser: rpId "bank.example" does not match this origin,
         so the passkey is not offered at all
relayed signature: none
even a forced signature would say origin: "${origin}"
bank: wrong origin  →  rejected`}`}</pre>
      <div className={`sim-tx-reader ${offered ? 'ok' : 'ok'}`}>
        {offered ? 'Works on the real site' : 'Nothing to steal'}
        <span>{offered ? 'One touch, nothing typed.' : 'The phishing page can copy every pixel of the bank, but not its domain.'}</span>
      </div>
    </div>
  )
}

const TONE: Record<Tone, string> = { ok: 'stopped', wait: 'partly', short: 'gets in' }

export default function MfaLab() {
  const [tab, setTab] = useState('password')
  const [cur, setCur] = useState(0)
  const script = SCRIPTS[tab]
  const safe = Math.min(cur, script.steps.length - 1)
  const st = script.steps[safe]
  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Factor">
          {Object.keys(SCRIPTS).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={tab === id}
              onClick={() => {
                setTab(id)
                setCur(0)
              }}
            >
              {SCRIPTS[id].label}
            </button>
          ))}
        </div>
        <div className="sim-ctl">
          <button className="sim-btn ghost" type="button" aria-label="Previous step" disabled={safe === 0} onClick={() => setCur(safe - 1)}>
            ◀
          </button>
          <button className="sim-btn" type="button" disabled={safe === script.steps.length - 1} onClick={() => setCur(safe + 1)}>
            Next step ▶
          </button>
          <span className="sim-pos">
            {safe} / {script.steps.length - 1}
          </span>
        </div>
      </div>
      <p className="sim-lede">{script.idea}</p>
      <div className="sim-narr" aria-live="polite">
        <b className="t">{st.title}</b>
        <span>{st.text}</span>
      </div>
      <div className="sim-tx-stage">
        {(
          [
            ['A leaked password', st.stuffing],
            ['A SIM swap', st.simswap],
            ['A phishing site', st.phishing],
          ] as [string, Tone][]
        ).map(([name, tone]) => (
          <div key={name} className={`sim-tx-ledger${tone === 'short' ? ' held' : ''}`}>
            <span className="sim-tx-name">{name}</span>
            <b>{TONE[tone]}</b>
          </div>
        ))}
      </div>
      <div className="sim-tx-reader wait">
        An attacker needs
        <span>{st.needs}</span>
      </div>
      {tab === 'totp' ? <TotpWidget /> : null}
      {tab === 'passkey' ? <PasskeyWidget /> : null}
    </div>
  )
}
