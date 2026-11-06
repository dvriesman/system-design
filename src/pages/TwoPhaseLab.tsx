import { useState } from 'react'

type Scheme = 'twowrites' | 'tpc' | 'eventual'
type ReaderSees = 'ok' | 'wait' | 'short'
type LedgerNote = '' | 'locked' | 'promised' | 'locked, promised'

type LabStep = {
  title: string
  text: string
  a: number
  b: number
  aNote: LedgerNote
  bNote: LedgerNote
  middle: string
  reader: ReaderSees
  client: string
}

const START: Omit<LabStep, 'title' | 'text'> = { a: 1000, b: 500, aNote: '', bNote: '', middle: '', reader: 'ok', client: 'waiting' }

const SCRIPTS: Record<Scheme, { label: string; idea: string; steps: LabStep[] }> = {
  twowrites: {
    label: '1 · Two separate writes',
    idea: 'The obvious attempt: run one transaction on each ledger.',
    steps: [
      { ...START, title: 'Start: send $100 from Ledger A to Ledger B', text: 'Inside one database this would be easy: BEGIN, debit, credit, COMMIT, and the database guarantees both or neither. But these accounts live in two separate databases, so no single COMMIT can cover both.' },
      { ...START, a: 900, reader: 'short', title: 'Ledger A debits and commits', text: 'The first commit is final. Right now the $100 is in neither account, and anyone adding up the balances gets $1,400. If this process dies here, nothing remembers that a credit is still owed.' },
      { ...START, a: 900, b: 600, client: 'told OK', title: 'Ledger B credits and commits', text: 'The total is back to $1,500. It looks fine, but only because nothing failed in that gap. Two fixes exist, and they take opposite positions on what to do about the gap. Try the next two tabs.' },
    ],
  },
  tpc: {
    label: '2 · Two-phase commit',
    idea: "Like a wedding: the officiant asks each person first, and nobody is married until both have said \"I do\" and it's been pronounced.",
    steps: [
      { ...START, title: 'Start: a coordinator runs the transfer', text: 'A new role appears: the coordinator. It changes nothing itself. It asks questions and records one decision. There are two phases, and in the first one no money moves.' },
      { ...START, aNote: 'locked, promised', reader: 'wait', middle: 'Ledger A voted YES', title: 'Phase 1: prepare Ledger A', text: 'The coordinator asks: "If I tell you to, can you guarantee this debit?" Ledger A locks the row, writes its promise to disk so it survives a crash, and votes YES. The balance has not changed. A reader that needs a correct total now has to wait for this lock.' },
      { ...START, aNote: 'locked, promised', bNote: 'locked, promised', reader: 'wait', middle: 'Both voted YES', title: 'Phase 1: prepare Ledger B', text: 'The same question goes to Ledger B, and it also votes YES. Either ledger could have said no here, and then nothing would have happened. Once it votes YES, a ledger gives up the right to change its mind.' },
      { ...START, aNote: 'locked, promised', bNote: 'locked, promised', reader: 'wait', middle: 'Decision logged: COMMIT', title: 'The commit point: write the decision', text: 'The coordinator writes COMMIT to its own durable log. This single write is the moment the transfer becomes real, even though neither balance has changed yet. "Two-phase" is really this: promise first, decide once.' },
      { ...START, a: 900, bNote: 'locked, promised', reader: 'wait', middle: 'Delivering COMMIT', title: 'Phase 2: Ledger A commits', text: 'Ledger A applies the debit and releases its lock. Its balance already shows $900, but Ledger B is still locked, so a reader needing both still waits and never sees a total of $1,400.' },
      { ...START, a: 900, b: 600, client: 'told COMMIT', middle: 'Done', title: 'Phase 2: Ledger B commits', text: 'Ledger B applies the credit and releases its lock. The client finally gets its answer. Total cost: readers waited, the client waited, but nobody ever saw a wrong total.' },
    ],
  },
  eventual: {
    label: '3 · Eventual consistency',
    idea: 'Like posting a check: the money leaves your account now, and arrives at theirs later. In between, it is in the mail, and a receipt proves it was sent.',
    steps: [
      { ...START, title: 'Start: no coordinator and no locks across the network', text: "Instead of making the two ledgers agree at the same instant, this accepts that they won't. They are allowed to disagree for a while, as long as they are guaranteed to converge." },
      { ...START, a: 900, reader: 'short', client: 'told ACCEPTED', middle: 'In flight: $100 (receipt saved)', title: 'Debit, plus a durable receipt, in one local transaction', text: "Ledger A debits and, in the same transaction, saves a record saying a $100 credit is owed. This is the difference from two separate writes: if anything crashes now, the record survives. The client hears ACCEPTED right away. A reader sees $1,400, and that's expected." },
      { ...START, a: 900, reader: 'short', client: 'told ACCEPTED', middle: 'In flight: $100 (in the queue)', title: 'A relay delivers the message', text: 'A background process reads the saved record and publishes it to a queue. It retries until it succeeds, so the message can arrive twice, but it can never be lost. Nobody is waiting on this, and nothing is locked.' },
      { ...START, a: 900, b: 600, client: 'told ACCEPTED', middle: 'Done', title: 'Ledger B applies the credit', text: 'Now the total is back to $1,500. That is what "eventual" means: not "maybe wrong forever", but correct after a delay, with no one blocked along the way. The price is that gap, which every reader could see.' },
    ],
  },
}

const SCHEMES = Object.keys(SCRIPTS) as Scheme[]

const READER_TEXT: Record<ReaderSees, string> = {
  ok: 'sees the correct total',
  wait: 'has to wait',
  short: 'sees a total $100 short',
}

function total(step: LabStep) {
  return step.a + step.b
}

export default function TwoPhaseLab() {
  const [scheme, setScheme] = useState<Scheme>('twowrites')
  const [cur, setCur] = useState(0)
  const script = SCRIPTS[scheme]
  const safeCur = Math.min(cur, script.steps.length - 1)
  const step = script.steps[safeCur]

  function switchScheme(next: Scheme) {
    setScheme(next)
    setCur(0)
  }

  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Approach">
          {SCHEMES.map((id) => (
            <button key={id} type="button" aria-pressed={scheme === id} onClick={() => switchScheme(id)}>
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

      <div className="sim-tx-stage">
        <div className={`sim-tx-ledger${step.aNote ? ' held' : ''}`}>
          <span className="sim-tx-name">Ledger A · acct-1</span>
          <b>${step.a.toLocaleString('en-US')}</b>
          <span className="sim-tx-note">{step.aNote || 'not locked'}</span>
        </div>
        <div className="sim-tx-mid">{step.middle ? <b>{step.middle}</b> : <span className="sim-muted">→ $100 →</span>}</div>
        <div className={`sim-tx-ledger${step.bNote ? ' held' : ''}`}>
          <span className="sim-tx-name">Ledger B · acct-2</span>
          <b>${step.b.toLocaleString('en-US')}</b>
          <span className="sim-tx-note">{step.bNote || 'not locked'}</span>
        </div>
      </div>

      <div className="sim-grid">
        <div className="sim-store">
          <h3>
            <span>A reader adding both balances</span>
          </h3>
          <div className={`sim-tx-reader ${step.reader}`}>
            {step.reader === 'wait' ? 'Waits behind a lock' : `$${total(step).toLocaleString('en-US')}`}
            <span>{READER_TEXT[step.reader]}</span>
          </div>
          <div className="sim-tx-strip" aria-label="What a reader sees at every step">
            {script.steps.map((st, i) => (
              <button
                key={st.title}
                type="button"
                className={`${st.reader}${i === safeCur ? ' cur' : ''}`}
                aria-label={`Step ${i}: reader ${READER_TEXT[st.reader]}`}
                onClick={() => setCur(i)}
              />
            ))}
          </div>
          <div className="sim-tx-legend">
            <span className="ok">correct</span>
            <span className="wait">waits</span>
            <span className="short">wrong total</span>
          </div>
        </div>
        <div className="sim-store">
          <h3>
            <span>The client who sent it</span>
          </h3>
          <div className={`sim-tx-reader ${step.client === 'waiting' ? 'wait' : 'ok'}`}>
            {step.client === 'waiting' ? 'Still waiting' : `Was ${step.client}`}
            <span>{step.client === 'waiting' ? 'no answer yet' : 'has an answer'}</span>
          </div>
          <div className="sim-tx-strip" aria-label="Whether the client has an answer at every step">
            {script.steps.map((st, i) => (
              <button
                key={st.title}
                type="button"
                className={`${st.client === 'waiting' ? 'wait' : 'ok'}${i === safeCur ? ' cur' : ''}`}
                aria-label={`Step ${i}: client ${st.client}`}
                onClick={() => setCur(i)}
              />
            ))}
          </div>
          <div className="sim-tx-legend">
            <span className="ok">has an answer</span>
            <span className="wait">waiting</span>
          </div>
        </div>
      </div>
    </div>
  )
}
