import { useState } from 'react'

// Part 1 of the Circuit Breaker page: why waiting spreads, why retries alone make it worse, and what a breaker remembers.
type Tone = 'ok' | 'wait' | 'short'
type LabStep = { title: string; text: string; wait: string; calls: string; workers: string; tone: Tone; note: string }

const SCRIPTS: Record<string, { label: string; idea: string; steps: LabStep[] }> = {
  wait: {
    label: '1 · Waiting spreads',
    idea: 'Checkout asks a risk-score provider before approving a pay-later purchase. When the provider gets slow, the slowness becomes yours: every checkout waits as long as the slowest call.',
    steps: [
      { title: 'Normal: the provider answers in 100 ms', text: 'Checkout gets 5 orders a second. Each one holds a worker for about 0.1 s, so on average half a worker is busy.', wait: '0.1 s', calls: '5 / s', workers: '0.5 of 20 busy', tone: 'ok', note: 'healthy' },
      { title: 'The provider slows to 2 seconds', text: 'Nothing failed, so nothing alarms. But each checkout now holds a worker 20 times longer. Busy workers = arrivals per second × seconds each one waits: 5 × 2 = 10.', wait: '2 s', calls: '5 / s', workers: '10 of 20 busy', tone: 'wait', note: 'slow, and using half the workers' },
      { title: 'It stops answering, and calls wait 30 seconds', text: 'With no timeout of its own, a call waits for the HTTP client\'s limit. 5 × 30 = 150 workers would be needed, and there are 20. Every worker is stuck waiting, so even orders that never call the provider can\'t be served.', wait: '30 s', calls: '5 / s', workers: '20 of 20 busy', tone: 'short', note: 'checkout itself is down' },
      { title: 'A failure in one dependency has spread', text: 'The provider is down, and now checkout is down too, and anything that calls checkout next. This is a cascading failure. A timeout limits the damage. The next tabs show what limits it further.', wait: '30 s', calls: '5 / s', workers: '20 of 20 busy', tone: 'short', note: 'cascading failure' },
    ],
  },
  retry: {
    label: '2 · Timeouts and retries',
    idea: 'A timeout caps how long one call can hold a worker. Retrying a failed call helps when failures are rare and brief. During an outage, it multiplies the load on a service that is already failing.',
    steps: [
      { title: 'A 2-second timeout', text: 'Each call gives up after 2 seconds. Workers are freed sooner: 5 × 2 = 10 busy at worst. The customer still waits 2 seconds for nothing.', wait: '2 s', calls: '5 / s', workers: '10 of 20 busy', tone: 'wait', note: 'contained, but slow' },
      { title: 'Add 3 tries, for safety', text: 'Each checkout now tries 3 times: 6 seconds of waiting, and 3 calls to the provider. 5 × 6 = 30 workers needed, which is more than the 20 there are.', wait: '6 s', calls: '15 / s', workers: '20 of 20 busy', tone: 'short', note: 'the retries made it worse' },
      { title: 'The provider was failing because of load', text: 'It now gets three times the traffic, so it takes longer to recover. The AWS Builders\' Library gives an example where every layer retries 3 times: the database gets 243 times the load.', wait: '6 s', calls: '15 / s', workers: '20 of 20 busy', tone: 'short', note: 'retries amplify the outage' },
      { title: 'Retries are still good, for blips', text: 'If one call in a hundred fails, a single retry, with a random delay called jitter, saves it. The problem is retrying blindly when everything is failing. Something has to notice that.', wait: '0.1 s', calls: '5 / s', workers: '0.5 of 20 busy', tone: 'ok', note: 'a blip: retry is right' },
    ],
  },
  breaker: {
    label: '3 · A breaker remembers',
    idea: 'A circuit breaker sits around the call and keeps a short memory of how recent calls went. When too many fail, it opens: calls fail at once, without reaching the provider. After a pause, one trial call checks whether it has recovered.',
    steps: [
      { title: 'Closed: calls go through, and are counted', text: 'Like an electrical breaker, closed means current flows. The breaker records whether each of the last few calls failed.', wait: '0.1 s', calls: '5 / s', workers: '0.5 of 20 busy', tone: 'ok', note: 'closed' },
      { title: 'Too many fail: it opens', text: 'Half of the last 4 calls failed, so the breaker opens. For the next few seconds, every call fails in a millisecond, without being made. Checkout uses a fallback: a cautious decision without the score.', wait: '0.001 s', calls: '0 / s', workers: '0 of 20 busy', tone: 'wait', note: 'open: fast answers, and the provider rests' },
      { title: 'After the pause: half-open', text: 'One call is let through as a trial. If it fails, the breaker opens again for another pause. Only one call risks waiting, not every checkout.', wait: '2 s for the trial', calls: '1 trial', workers: '1 of 20 busy', tone: 'wait', note: 'half-open: testing' },
      { title: 'The trial works: closed again', text: 'The provider is back, so calls flow again, with no deploy and nobody paged at night. Martin Fowler\'s article describes these three states, and credits Michael Nygard\'s book Release It with making the pattern popular.', wait: '0.1 s', calls: '5 / s', workers: '0.5 of 20 busy', tone: 'ok', note: 'closed: recovered' },
    ],
  },
}

// ---- the hands-on part: drive a breaker yourself
type Outcome = 'ok' | 'slow' | 'fail'
type Breaker = { state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'; window: boolean[]; openUntil: number; now: number; log: string[] }
const START: Breaker = { state: 'CLOSED', window: [], openUntil: 0, now: 0, log: ['closed, with an empty window'] }

function step(b: Breaker, o: Outcome | 'wait', countSlow: boolean): Breaker {
  if (o === 'wait') return { ...b, now: b.now + 6, log: [`6 seconds pass (t = ${b.now + 6} s)`, ...b.log] }
  let state = b.state
  const log: string[] = []
  if (state === 'OPEN') {
    if (b.now < b.openUntil) return { ...b, log: [`rejected at once: open until t = ${b.openUntil} s. The provider was not called`, ...b.log] }
    state = 'HALF_OPEN'
    log.push('the pause is over: half-open, this call is a trial')
  }
  const failed = o === 'fail' || (countSlow && o === 'slow')
  const what = o === 'ok' ? 'a fast success' : o === 'slow' ? `a slow success${countSlow ? ', counted as failed' : ', counted as a success'}` : 'a failure'
  log.push(`call: ${what}`)
  if (state === 'HALF_OPEN') {
    if (failed) {
      log.push(`trial failed: open until t = ${b.now + 6} s`)
      return { state: 'OPEN', window: [], openUntil: b.now + 6, now: b.now, log: [...log.reverse(), ...b.log] }
    }
    log.push('trial worked: closed')
    return { state: 'CLOSED', window: [], openUntil: 0, now: b.now, log: [...log.reverse(), ...b.log] }
  }
  const window = [...b.window, failed].slice(-4)
  const rate = window.filter(Boolean).length / window.length
  if (window.length >= 4 && rate >= 0.5) {
    log.push(`${Math.round(rate * 100)}% of the last 4 failed: open until t = ${b.now + 6} s`)
    return { state: 'OPEN', window: [], openUntil: b.now + 6, now: b.now, log: [...log.reverse(), ...b.log] }
  }
  log.push(window.length < 4 ? `${window.length} of 4 calls seen: too few to judge` : `${Math.round(rate * 100)}% failed: stays closed`)
  return { state: 'CLOSED', window, openUntil: 0, now: b.now, log: [...log.reverse(), ...b.log] }
}

function DriveWidget() {
  const [b, setB] = useState<Breaker>(START)
  const [countSlow, setCountSlow] = useState(false)
  const act = (o: Outcome | 'wait') => setB(step(b, o, countSlow))
  const rate = b.window.length ? Math.round((b.window.filter(Boolean).length / b.window.length) * 100) : 0
  return (
    <div className="sim-store">
      <h3>
        <span>Try it: drive a breaker</span>
        <span className="sim-tag">window 4 · opens at 50% · pause 6 s</span>
      </h3>
      <div className="cb-drive">
        <button type="button" className="sim-btn ghost" onClick={() => act('ok')}>
          Call: fast
        </button>
        <button type="button" className="sim-btn ghost" onClick={() => act('slow')}>
          Call: slow (1.5 s)
        </button>
        <button type="button" className="sim-btn ghost" onClick={() => act('fail')}>
          Call: fails
        </button>
        <button type="button" className="sim-btn ghost" onClick={() => act('wait')}>
          Wait 6 s
        </button>
        <button type="button" className="sim-btn ghost" onClick={() => setB(START)}>
          Reset
        </button>
      </div>
      <div className="sim-axis">
        <span className="sim-axis-label">Slow calls</span>
        <div className="sim-seg" role="group" aria-label="Slow calls">
          <button type="button" aria-pressed={!countSlow} onClick={() => setCountSlow(false)}>
            count as success
          </button>
          <button type="button" aria-pressed={countSlow} onClick={() => setCountSlow(true)}>
            count as failed
          </button>
        </div>
      </div>
      <div className="cb-states">
        {(['CLOSED', 'OPEN', 'HALF_OPEN'] as const).map((st) => (
          <span key={st} className={`cb-state ${b.state === st ? `on ${st.toLowerCase()}` : ''}`}>
            {st.replace('_', '-').toLowerCase()}
          </span>
        ))}
        <span className="sim-muted sim-small">
          t = {b.now} s · window [{b.window.map((x) => (x ? '✗' : '✓')).join(' ')}] {b.window.length ? `· ${rate}% failed` : ''}
        </span>
      </div>
      <ol className="sg-actions">
        {b.log.slice(0, 8).map((l, i) => (
          <li key={`${b.log.length - i}`} className={i === 0 ? 'retry' : ''}>
            {l}
          </li>
        ))}
      </ol>
      <p className="sim-small sim-muted">
        Try: two fast calls, then two failures. Then call again, wait 6 s, and call again. Then try four slow calls with each setting.
      </p>
    </div>
  )
}

export default function BreakerLab() {
  const [tab, setTab] = useState('wait')
  const [cur, setCur] = useState(0)
  const script = SCRIPTS[tab]
  const safeCur = Math.min(cur, script.steps.length - 1)
  const st = script.steps[safeCur]
  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Idea">
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
          <button className="sim-btn ghost" type="button" aria-label="Previous step" disabled={safeCur === 0} onClick={() => setCur(safeCur - 1)}>
            ◀
          </button>
          <button className="sim-btn" type="button" disabled={safeCur === script.steps.length - 1} onClick={() => setCur(safeCur + 1)}>
            Next step ▶
          </button>
          <span className="sim-pos">
            {safeCur} / {script.steps.length - 1}
          </span>
        </div>
      </div>
      <p className="sim-lede">{script.idea}</p>
      <div className="sim-narr" aria-live="polite">
        <b className="t">{st.title}</b>
        <span>{st.text}</span>
      </div>
      <div className="sim-tx-stage">
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Each checkout waits</span>
          <b>{st.wait}</b>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Calls to the provider</span>
          <b>{st.calls}</b>
        </div>
        <div className={`sim-tx-ledger${st.tone === 'short' ? ' held' : ''}`}>
          <span className="sim-tx-name">Checkout workers</span>
          <b>{st.workers}</b>
        </div>
      </div>
      <div className={`sim-tx-reader ${st.tone}`}>
        {st.tone === 'ok' ? 'Fine' : st.tone === 'wait' ? 'Strained' : 'Failing'}
        <span>{st.note}</span>
      </div>
      {tab === 'breaker' ? <DriveWidget /> : null}
    </div>
  )
}
