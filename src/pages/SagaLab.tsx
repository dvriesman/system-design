import { useState } from 'react'

// Part 1 of the Saga page: what a saga is, one idea per tab, with nothing crashing yet.
type Tone = 'idle' | 'done' | 'undone' | 'failed' | 'lost'
type Box = { value: string; tone: Tone }
type Health = 'ok' | 'wait' | 'short'
type LabStep = { title: string; text: string; credit: Box; loans: Box; bank: Box; shop: Box; health: Health; healthNote: string }

const idle: Box = { value: '—', tone: 'idle' }
const START = { credit: { value: '$1,000 free', tone: 'idle' as Tone }, loans: idle, bank: idle, shop: idle }

const SCRIPTS: Record<string, { label: string; idea: string; steps: LabStep[] }> = {
  one: {
    label: '1 · One transaction?',
    idea: 'Inside one database, a transaction makes several changes happen together or not at all. A purchase on credit touches four systems, each with its own database, and no single COMMIT reaches all of them.',
    steps: [
      { ...START, title: 'Start: Alice buys a $600 sofa on pay-later', text: 'Four things must happen: hold $600 of her limit, create a loan she repays in installments, send $600 to the shop, and tell the shop to ship.', health: 'ok', healthNote: 'nothing has happened yet' },
      { title: 'In one database, this is easy', text: 'BEGIN; insert the hold; insert the loan; insert the payout; COMMIT. If anything fails before COMMIT, the database throws all of it away. That is the "A" in ACID: atomic.', credit: { value: '$600 held', tone: 'done' }, loans: { value: '$600 owed', tone: 'done' }, bank: { value: '$600 sent', tone: 'done' }, shop: { value: 'ship it', tone: 'done' }, health: 'ok', healthNote: 'all four or none, in one COMMIT' },
      { ...START, credit: { value: '$600 held', tone: 'done' }, title: 'Split into services, each step commits on its own', text: "The credit service commits its hold in its own database. It's final: nothing the loan service does later can roll it back.", health: 'wait', healthNote: 'part done: fine, if the rest follows' },
      { ...START, credit: { value: '$600 held', tone: 'done' }, loans: { value: '$600 owed', tone: 'done' }, title: 'The loan commits too', text: 'Alice now owes $600. Two separate commits, in two databases.', health: 'wait', healthNote: 'part done: fine, if the rest follows' },
      { ...START, credit: { value: '$600 held', tone: 'done' }, loans: { value: '$600 owed', tone: 'done' }, bank: { value: 'rejected: account closed', tone: 'failed' }, title: 'The bank rejects the payout', text: "The shop's bank account was closed. Alice owes $600 for a sofa that will never ship, and her limit is still held. Nothing rolls back, because there was never one transaction to roll back.", health: 'short', healthNote: 'Alice owes for nothing' },
      { ...START, credit: { value: '$600 held', tone: 'done' }, loans: { value: '$600 owed', tone: 'done' }, bank: { value: 'rejected: account closed', tone: 'failed' }, title: 'Why not one transaction across all four?', text: 'Two-phase commit can do that, by locking every participant until all agree. But the bank is outside your company, and it will never join your transaction or hold locks for you. And locks held across a slow network block everyone else meanwhile.', health: 'short', healthNote: 'Alice owes for nothing' },
    ],
  },
  saga: {
    label: '2 · A saga: an undo for each step',
    idea: 'A saga accepts that each step commits on its own. In exchange, every step that might need reversing gets a second action that reverses it, called a compensation. If a later step fails, the saga runs the compensations for the finished steps, newest first.',
    steps: [
      { ...START, title: 'Start: the same purchase, planned as a saga', text: 'Each step is paired with its undo. Reserve the limit, or release it. Create the loan, or cancel it. Pay the shop. Tell the shop to ship.', health: 'ok', healthNote: 'nothing has happened yet' },
      { ...START, credit: { value: '$600 held', tone: 'done' }, title: 'Step 1: reserve the limit, and commit', text: 'Final in the credit service. If this purchase is undone later, the saga will release it.', health: 'wait', healthNote: 'in between: the hold is visible to others' },
      { ...START, credit: { value: '$600 held', tone: 'done' }, loans: { value: '$600 owed', tone: 'done' }, title: 'Step 2: create the loan, and commit', text: 'Notice what anyone can see right now: a loan, for a purchase that may not happen. There is no isolation between steps. Real sagas mark it "pending" so nothing acts on it too early.', health: 'wait', healthNote: 'in between: the hold is visible to others' },
      { ...START, credit: { value: '$600 held', tone: 'done' }, loans: { value: '$600 owed', tone: 'done' }, bank: { value: 'rejected: account closed', tone: 'failed' }, title: 'Step 3 fails: the bank says no', text: 'A clear, final no, and no money moved. The saga now runs the undo for every finished step, newest first.', health: 'wait', healthNote: 'in between: the undo has not run yet' },
      { ...START, credit: { value: '$600 held', tone: 'done' }, loans: { value: 'cancelled', tone: 'undone' }, bank: { value: 'rejected: account closed', tone: 'failed' }, title: 'Undo step 2: cancel the loan', text: "The loan isn't deleted. It's marked cancelled, because money records are kept. Alice owes nothing.", health: 'wait', healthNote: 'in between: the undo has not finished' },
      { ...START, credit: { value: '$1,000 free', tone: 'undone' }, loans: { value: 'cancelled', tone: 'undone' }, bank: { value: 'rejected: account closed', tone: 'failed' }, title: 'Undo step 1: release the limit', text: 'Everything is consistent again: no hold, no debt, no payout. This is "all or nothing" rebuilt by hand, eventually rather than instantly.', health: 'ok', healthNote: 'consistent: nothing of the purchase is left' },
    ],
  },
  order: {
    label: '3 · Order matters',
    idea: "Some steps can't really be undone. Money sent to a shop's bank can only be asked back, and the shop may not return it. So a saga puts every step that might fail before that point, and after it only steps that are certain to succeed if retried.",
    steps: [
      { ...START, title: 'Start: what if the payout went first?', text: 'Same four steps, a different order: pay the shop, then check the limit, then create the loan, then tell the shop to ship.', health: 'ok', healthNote: 'nothing has happened yet' },
      { ...START, bank: { value: '$600 sent', tone: 'done' }, title: 'Payout first: the money leaves', text: 'The shop has $600.', health: 'wait', healthNote: 'in between: money out, nothing owed yet' },
      { ...START, credit: { value: 'refused: $400 free', tone: 'failed' }, bank: { value: '$600 sent', tone: 'done' }, title: "The limit check fails: Alice doesn't have $600 free", text: "Now the undo for the payout is \"ask the shop to send it back\". It might take weeks, or never happen. The lender is exposed for a check it could have done first.", health: 'short', healthNote: 'money out with nobody owing it' },
      { ...START, title: 'The safe order: what can fail goes first', text: 'Reserve the limit and create the loan first: both can be refused, and both are easy to undo. Then pay, the step that is hard to undo. That step is the point of no return. Some writers call it the pivot.', health: 'ok', healthNote: 'nothing has happened yet' },
      { credit: { value: '$600 held', tone: 'done' }, loans: { value: '$600 owed', tone: 'done' }, bank: { value: '$600 sent', tone: 'done' }, shop: idle, title: 'Past the point of no return, only go forward', text: 'Once the shop is paid, the saga will finish, whatever happens. Telling the shop to ship can fail if the shop\'s server is down, so it is retried until it works. It is never answered by undoing the payout.', health: 'wait', healthNote: 'in between: will finish by retrying' },
      { credit: { value: '$600 held', tone: 'done' }, loans: { value: '$600 owed', tone: 'done' }, bank: { value: '$600 sent', tone: 'done' }, shop: { value: 'ship it', tone: 'done' }, title: 'Done', text: 'Three kinds of step: ones you can undo, one you cannot, and ones you can always retry. In that order.', health: 'ok', healthNote: 'consistent: all four happened' },
    ],
  },
}

const TABS = Object.keys(SCRIPTS)
const HEALTH_TEXT: Record<Health, string> = { ok: 'Consistent', wait: 'In between', short: 'Wrong' }

function Service({ name, box }: { name: string; box: Box }) {
  return (
    <div className={`sg-svc ${box.tone}`}>
      <span className="sim-tx-name">{name}</span>
      <b>{box.value}</b>
    </div>
  )
}

// ---- the hands-on part: plan a saga, and see what runs.
type StepId = 'reserve' | 'loan' | 'payout' | 'confirm'
const PLAN: Record<StepId, { name: string; undo: string | null; kind: 'undo' | 'pivot' | 'retry' }> = {
  reserve: { name: 'reserve the limit', undo: 'release the limit', kind: 'undo' },
  loan: { name: 'create the loan', undo: 'cancel the loan', kind: 'undo' },
  payout: { name: 'pay the shop', undo: 'ask the shop to send the money back', kind: 'pivot' },
  confirm: { name: 'tell the shop to ship', undo: null, kind: 'retry' },
}
const FAILURES: { id: StepId | 'none'; label: string; why: string }[] = [
  { id: 'none', label: 'nothing fails', why: '' },
  { id: 'reserve', label: 'limit too low', why: 'only $400 free' },
  { id: 'loan', label: 'loan refused', why: 'a new fraud rule blocks it' },
  { id: 'payout', label: 'bank rejects', why: 'account closed' },
  { id: 'confirm', label: "shop's server down", why: 'connection refused' },
]

function plan(order: StepId[], failing: StepId | 'none') {
  const actions: { text: string; tone: 'do' | 'fail' | 'undo' | 'bad' | 'retry' }[] = []
  const done: StepId[] = []
  for (const id of order) {
    const step = PLAN[id]
    if (id === failing) {
      if (step.kind === 'retry') {
        actions.push({ text: `${step.name}: fails (${FAILURES.find((f) => f.id === id)!.why})`, tone: 'fail' })
        actions.push({ text: `${step.name}: retried a minute later, and works`, tone: 'retry' })
        done.push(id)
        continue
      }
      actions.push({ text: `${step.name}: fails (${FAILURES.find((f) => f.id === id)!.why})`, tone: 'fail' })
      for (const d of [...done].reverse()) {
        const u = PLAN[d]
        if (u.undo) actions.push({ text: `undo: ${u.undo}`, tone: u.kind === 'pivot' ? 'bad' : 'undo' })
        else actions.push({ text: `can't undo "${u.name}": the shop was already told to ship`, tone: 'bad' })
      }
      const bad = done.some((d) => PLAN[d].kind !== 'undo')
      return {
        actions,
        ok: !bad,
        verdict: bad
          ? done.includes('payout')
            ? 'The money already left. Getting it back depends on the shop, so the lender carries the risk of a check it could have run earlier.'
            : 'The shop was already told to ship. Telling it to stop may come too late.'
          : `Undone cleanly: ${done.length ? `${done.length} step${done.length === 1 ? '' : 's'} reversed, newest first` : 'nothing had happened yet'}.`,
      }
    }
    actions.push({ text: step.name, tone: 'do' })
    done.push(id)
  }
  const confirmBeforePay = order.indexOf('confirm') < order.indexOf('payout')
  return {
    actions,
    ok: !confirmBeforePay,
    verdict: confirmBeforePay ? 'It worked this time, but the shop was told to ship before it was paid. Try failing the payout.' : 'All four steps finished.',
  }
}

function PlanWidget() {
  const [order, setOrder] = useState<StepId[]>(['payout', 'reserve', 'loan', 'confirm'])
  const [failing, setFailing] = useState<StepId | 'none'>('reserve')
  const result = plan(order, failing)
  const move = (i: number, by: number) => {
    const next = [...order]
    ;[next[i], next[i + by]] = [next[i + by], next[i]]
    setOrder(next)
  }
  return (
    <div className="sim-store">
      <h3>
        <span>Try it: put the steps in order, and pick what fails</span>
      </h3>
      <ol className="sg-order">
        {order.map((id, i) => (
          <li key={id}>
            <span className="sg-num">{i + 1}</span>
            <span className="sg-name">
              {PLAN[id].name}
              <span className="sim-muted sim-small"> · {PLAN[id].kind === 'undo' ? `undo: ${PLAN[id].undo}` : PLAN[id].kind === 'pivot' ? 'hard to undo' : 'retry until it works'}</span>
            </span>
            <button type="button" className="sim-btn ghost" aria-label={`Move "${PLAN[id].name}" up`} disabled={i === 0} onClick={() => move(i, -1)}>
              ▲
            </button>
            <button type="button" className="sim-btn ghost" aria-label={`Move "${PLAN[id].name}" down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
              ▼
            </button>
          </li>
        ))}
      </ol>
      <div className="sim-axis">
        <span className="sim-axis-label">What fails</span>
        <div className="sim-seg" role="group" aria-label="What fails">
          {FAILURES.map((f) => (
            <button key={f.id} type="button" aria-pressed={failing === f.id} onClick={() => setFailing(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <ol className="sg-actions">
        {result.actions.map((a, i) => (
          <li key={i} className={a.tone}>
            {a.text}
          </li>
        ))}
      </ol>
      <div className={`sim-tx-reader ${result.ok ? 'ok' : 'short'}`}>
        {result.ok ? 'Safe' : 'Risky'}
        <span>{result.verdict}</span>
      </div>
    </div>
  )
}

export default function SagaLab() {
  const [tab, setTab] = useState('one')
  const [cur, setCur] = useState(0)
  const script = SCRIPTS[tab]
  const safeCur = Math.min(cur, script.steps.length - 1)
  const step = script.steps[safeCur]

  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Idea">
          {TABS.map((id) => (
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
        <b className="t">{step.title}</b>
        <span>{step.text}</span>
      </div>

      <div className="sg-stage">
        <Service name="Credit service" box={step.credit} />
        <Service name="Loan service" box={step.loans} />
        <Service name="Bank (outside)" box={step.bank} />
        <Service name="Shop" box={step.shop} />
      </div>

      <div className="sim-store">
        <h3>
          <span>Is everything consistent right now?</span>
        </h3>
        <div className={`sim-tx-reader ${step.health}`}>
          {HEALTH_TEXT[step.health]}
          <span>{step.healthNote.replace(/^(in between|consistent): /, '')}</span>
        </div>
        <div className="sim-tx-strip" aria-label="Consistency at each step">
          {script.steps.map((st, i) => (
            <button key={st.title} type="button" className={`${st.health}${i === safeCur ? ' cur' : ''}`} aria-label={`Step ${i}`} onClick={() => setCur(i)} />
          ))}
        </div>
        <div className="sim-tx-legend">
          <span className="ok">consistent</span>
          <span className="wait">in between</span>
          <span className="short">wrong</span>
        </div>
      </div>

      {tab === 'order' ? <PlanWidget /> : null}
    </div>
  )
}
