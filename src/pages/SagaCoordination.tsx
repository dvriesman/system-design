import { useState } from 'react'

// Part 2 of the Saga page: the same failed sofa purchase, run by an orchestrator or by events.
type Style = 'orch' | 'chor'
type Msg = { from: string; to: string; text: string; kind: 'command' | 'event' | 'reply' }
type LabStep = { title: string; text: string; msgs: Msg[]; knows: string }

const SCRIPTS: Record<Style, { label: string; idea: string; steps: LabStep[] }> = {
  orch: {
    label: 'Orchestration',
    idea: 'One service, the orchestrator, runs the saga. It sends each participant a command, waits for the reply, and decides what comes next, including the undo.',
    steps: [
      { title: 'Alice pays for the sofa', text: 'The checkout service is the orchestrator. It owns the plan: reserve, loan, pay, confirm.', msgs: [{ from: 'App', to: 'Checkout', text: 'buy sofa, $600', kind: 'command' }], knows: 'Checkout: step 0 of 4' },
      { title: 'Command: reserve', text: 'The credit service only knows how to reserve and release. It has no idea a saga exists.', msgs: [{ from: 'Checkout', to: 'Credit', text: 'reserve $600 for buy-2', kind: 'command' }], knows: 'Checkout: waiting on reserve' },
      { title: 'Reply: reserved', text: 'The orchestrator records the step in its saga log, then sends the next command.', msgs: [{ from: 'Credit', to: 'Checkout', text: 'reserved', kind: 'reply' }], knows: 'Checkout: reserve done' },
      { title: 'Command and reply: the loan', text: 'Same shape: command, reply, record.', msgs: [{ from: 'Checkout', to: 'Loans', text: 'create the $600 loan for buy-2', kind: 'command' }, { from: 'Loans', to: 'Checkout', text: 'loan created', kind: 'reply' }], knows: 'Checkout: reserve, loan done' },
      { title: 'Command: pay. Reply: rejected', text: 'The orchestrator sees the failure, and its plan says what to do: undo the loan, then the hold.', msgs: [{ from: 'Checkout', to: 'Payouts', text: 'pay sofa-shop $600 for buy-2', kind: 'command' }, { from: 'Payouts', to: 'Checkout', text: 'rejected: account closed', kind: 'reply' }], knows: 'Checkout: undoing' },
      { title: 'Commands: cancel, then release', text: 'Reading the whole flow means reading one function. Asking "where is buy-2?" means one query against the saga log.', msgs: [{ from: 'Checkout', to: 'Loans', text: 'cancel buy-2', kind: 'command' }, { from: 'Checkout', to: 'Credit', text: 'release buy-2', kind: 'command' }], knows: 'Checkout: undone' },
    ],
  },
  chor: {
    label: 'Choreography',
    idea: 'No one is in charge. Each service listens for events, does its own step, and publishes an event saying what happened. The flow lives in who listens to what.',
    steps: [
      { title: 'Alice pays for the sofa', text: 'The checkout service publishes an event and is done. It does not call anyone.', msgs: [{ from: 'Checkout', to: 'all', text: 'PurchaseStarted buy-2, $600', kind: 'event' }], knows: 'nobody holds the whole picture' },
      { title: 'Credit hears it, reserves, and announces', text: 'The credit service subscribes to PurchaseStarted. To do that, it has to know this event matters to it.', msgs: [{ from: 'Credit', to: 'all', text: 'LimitReserved buy-2', kind: 'event' }], knows: 'Credit: reserved' },
      { title: 'Loans hears LimitReserved, and announces', text: 'The loan service subscribes to LimitReserved.', msgs: [{ from: 'Loans', to: 'all', text: 'LoanCreated buy-2', kind: 'event' }], knows: 'Credit: reserved · Loans: created' },
      { title: 'Payouts hears LoanCreated, and the bank says no', text: 'Now the undo has to happen by events too.', msgs: [{ from: 'Payouts', to: 'all', text: 'PayoutRejected buy-2', kind: 'event' }], knows: 'Credit: reserved · Loans: created · Payouts: rejected' },
      { title: 'Loans hears PayoutRejected, and cancels', text: 'So the loan service must also subscribe to PayoutRejected. Each failure adds subscriptions to other services.', msgs: [{ from: 'Loans', to: 'all', text: 'LoanCancelled buy-2', kind: 'event' }], knows: 'Credit: reserved · Loans: cancelled' },
      { title: 'Credit hears LoanCancelled, and releases', text: 'It works, and no service depends on a central one. But "where is buy-2?" now means asking three services, and the flow is written nowhere in one place.', msgs: [{ from: 'Credit', to: 'all', text: 'LimitReleased buy-2', kind: 'event' }], knows: 'each service knows only its own part' },
    ],
  },
}

export default function SagaCoordination() {
  const [style, setStyle] = useState<Style>('orch')
  const [cur, setCur] = useState(0)
  const script = SCRIPTS[style]
  const safeCur = Math.min(cur, script.steps.length - 1)
  const step = script.steps[safeCur]

  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Coordination">
          {(Object.keys(SCRIPTS) as Style[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={style === id}
              onClick={() => {
                setStyle(id)
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
      <div className="sim-store">
        <h3>
          <span>Messages so far</span>
        </h3>
        <ol className="sg-actions">
          {script.steps.slice(0, safeCur + 1).flatMap((st, i) =>
            st.msgs.map((m, j) => (
              <li key={`${i}-${j}`} className={m.kind === 'event' ? 'retry' : m.kind === 'reply' ? 'undo' : 'do'}>
                <b>{m.kind}</b> {m.from} → {m.to === 'all' ? 'anyone listening' : m.to}: {m.text}
              </li>
            )),
          )}
        </ol>
      </div>
      <div className="sim-store">
        <h3>
          <span>Who knows where buy-2 is?</span>
        </h3>
        <div className="sim-jwt-token">{step.knows}</div>
      </div>
    </div>
  )
}
