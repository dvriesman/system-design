import { useState } from 'react'

type Category = 'Design' | 'Failures' | 'Security' | 'Staff'
type Question = { category: Category; q: string; a: string[]; followUp: string }

const QUESTIONS: Question[] = [
  {
    category: 'Design',
    q: 'Design pay-later checkout for merchants. Where do you start?',
    a: [
      'Start with the money: the merchant is paid in full minus a fee, the lender takes the default risk, and the customer repays over time.',
      'That gives the priorities: never lend twice, never exceed a limit, keep an auditable ledger, and approve good customers without losing the sale.',
      'Only then draw services, starting with the checkout session and the credit limit, because that is where the money risk is.',
    ],
    followUp: 'Which requirement would you give up first if you had to ship in six weeks?',
  },
  {
    category: 'Design',
    q: 'What is the data model for a purchase?',
    a: [
      'Checkout session: merchant, order reference, amount, status and expiry.',
      'Credit account: customer, total limit and available limit. Loan: terms and status, plus its installment schedule.',
      'Ledger entries: append-only and double-entry, with the balance derived from them. Settlement batch: what each merchant is owed and what was paid.',
      'Store money as integers in the smallest unit, with the currency, and never as floats.',
    ],
    followUp: 'Do you store the available limit, or derive it from the ledger?',
  },
  {
    category: 'Design',
    q: 'How do you stop two purchases from overspending one limit?',
    a: [
      'Use one conditional update: UPDATE accounts SET available = available - :amount WHERE id = :id AND available >= :amount, then check that one row changed.',
      "In PostgreSQL's default Read Committed level, a second update waits for the first to commit, then re-checks the WHERE clause against the new row, so it can't overspend.",
      'Keep the transaction short, and never hold it open during a call to a credit bureau or a merchant.',
    ],
    followUp: 'Why not keep the limit in Redis? When would you use SELECT FOR UPDATE instead?',
  },
  {
    category: 'Design',
    q: 'Why is checkout a session, not one API call?',
    a: [
      'The merchant creates a session, then the buyer is redirected to apply, verify and accept. That can take minutes, and the buyer can leave at any point.',
      'So it needs explicit states, such as created, approved, confirmed, expired and voided, with only certain moves allowed between them.',
      'A hold on the limit needs an expiry, or abandoned checkouts slowly lock up customers\' credit.',
    ],
    followUp: 'What should happen if the buyer accepts just as the session expires?',
  },
  {
    category: 'Design',
    q: 'How do you isolate one huge merchant from everyone else?',
    a: [
      'Isolate at the edge: per-merchant rate limits, separate worker pools or queues, and separate connection budgets.',
      "Don't partition credit data by merchant, because a limit belongs to a customer who shops at many merchants. Partition that by customer, if you need to partition at all.",
      'Agree large-event capacity with big merchants in advance, and load test for it.',
    ],
    followUp: 'What do you return to a merchant that goes over its limit in the middle of a sale?',
  },
  {
    category: 'Design',
    q: 'Which parts of the credit decision are synchronous?',
    a: [
      'At request time, use precomputed features plus quick rules and a model. Heavy data work happens beforehand, in the background.',
      'Calls to a credit bureau need strict timeouts, and their results should be cached within what the rules allow.',
      'Publish every decision with its inputs and model version, so it can be explained and audited later.',
    ],
    followUp: 'A model looks better offline. How do you roll it out safely?',
  },
  {
    category: 'Design',
    q: 'How do you design the ledger?',
    a: [
      'Append-only and double-entry: every movement has equal debits and credits, so the total always balances.',
      'Corrections are new entries that reverse old ones, and never edits.',
      'Balances can be cached for speed, as long as they can always be rebuilt from the entries.',
    ],
    followUp: 'What are the accounts and entries for a $1,000 sale with a 5% merchant fee?',
  },
  {
    category: 'Design',
    q: 'How do you handle a refund after the customer has already paid installments?',
    a: [
      'The refund has several parts: return what the customer paid, cancel what is still owed, and take the money back from the merchant.',
      'Define the policy on fees and interest explicitly, then post it all as new ledger entries.',
      "If the merchant's next settlement is smaller than what it owes, track that as a receivable. Don't let the balance silently go wrong.",
    ],
    followUp: 'What if the merchant has closed down and owes you money?',
  },
  {
    category: 'Failures',
    q: 'The merchant times out on creating a checkout, then retries. What happens?',
    a: [
      'Require an idempotency key, and enforce a unique constraint on the merchant and its order reference.',
      'The retry finds the existing session and returns the same result, so a second contract is impossible.',
      'If the same key arrives with a different amount, reject it: that is a client bug, or an attack.',
    ],
    followUp: 'How long do you keep idempotency records, and why?',
  },
  {
    category: 'Failures',
    q: 'The contract is committed, but the process dies before telling the merchant. Now what?',
    a: [
      'Write the contract and an outbox row in one transaction. A relay delivers the event afterwards, at least once.',
      'The merchant must handle duplicates, and can also ask for the status, so the callback is not the only way to find out.',
      'If the merchant never confirms the order, a saga releases the hold or starts a void after a set time.',
    ],
    followUp: 'Why not use two-phase commit across your database and the merchant?',
  },
  {
    category: 'Failures',
    q: 'The credit bureau is down. Do you approve, decline or wait?',
    a: [
      'It depends on the risk: a known customer with good history might continue on internal data, up to a smaller limit.',
      'A brand-new customer usually waits or gets declined, because you know nothing else about them.',
      'This is a business decision about losses versus lost sales. Make it a policy that can be changed quickly, with a circuit breaker and alerts.',
    ],
    followUp: 'How would you measure whether that fallback policy was a good decision?',
  },
  {
    category: 'Failures',
    q: 'A repayment shows as pending, then arrives after the customer paid again another way.',
    a: [
      'Treat pending as a real state, and apply money only when it is confirmed. Handle each provider event idempotently, by its payment ID.',
      'If money arrives for an installment that is already paid, apply it to the next one or hold it as credit, depending on policy. Never lose it.',
      'Be careful about restoring the limit on a pending payment: it might never settle.',
    ],
    followUp: 'When exactly do you restore the customer\'s available limit?',
  },
  {
    category: 'Failures',
    q: 'Reconciliation finds a $3 difference with a bank. What happens next?',
    a: [
      'Compare three sources: your ledger, the provider or bank file, and merchant settlement records. Match by reference, then classify each difference.',
      'Common causes are timing, duplicates, missing events and fees. Timing differences usually clear themselves in the next run.',
      'Anything else goes to a case with an owner. Fix it with new ledger entries, and alert on the size and age of what is unresolved.',
    ],
    followUp: 'Would you run this nightly, or continuously?',
  },
  {
    category: 'Failures',
    q: 'A settlement run crashes halfway through. How do you avoid paying merchants twice?',
    a: [
      'Make the batch a record with one item per merchant, and move each item through its own states.',
      'Send each payout with a stable idempotency key, so a rerun can only complete what is unfinished.',
      'If a payout has an unknown result, ask the bank before retrying, and reconcile against its file.',
    ],
    followUp: 'Do you settle each sale, or net off refunds and fees first?',
  },
  {
    category: 'Security',
    q: 'How do merchants authenticate to your API?',
    a: [
      'OAuth client credentials works for server-to-server calls, with short-lived tokens and narrow scopes. That grant is only for clients that can keep a secret, so never put it in a browser or mobile app.',
      'For high-value calls, consider signing requests as well, using RFC 9421 HTTP Message Signatures, so a stolen token alone is not enough.',
      'Every query must be scoped to the authenticated merchant, whatever IDs arrive in the request.',
    ],
    followUp: 'A merchant leaks its secret. Walk through your response.',
  },
  {
    category: 'Security',
    q: 'How do merchants know a callback really came from you?',
    a: [
      'Sign each callback, including a timestamp and an event ID. The merchant verifies the signature, rejects old timestamps and ignores IDs it has seen.',
      'Support two active signing keys, so keys can rotate without downtime.',
      'A callback should prompt the merchant to check, and shipping high-value goods should rely on a status call as well.',
    ],
    followUp: 'What stops a merchant URL from making your system call internal addresses?',
  },
  {
    category: 'Security',
    q: 'The customer logs in with a code sent to their phone. What are the risks?',
    a: [
      'One-time codes can be phished. NIST SP 800-63B also treats codes sent over the phone network as restricted, and lists SIM change and number porting as risk signals.',
      'So treat a new phone number or device as a risk event: add checks, and lower the limit for a while.',
      'For risky actions, use a stronger method such as a passkey or an approval bound to the device, and show the amount and payee.',
    ],
    followUp: 'Your customers have basic phones and no email. What can you still do?',
  },
  {
    category: 'Security',
    q: 'How do you detect someone opening credit using a fake identity?',
    a: [
      'Combine ID document checks with liveness, bureau records, and signals such as device, phone age and links to other applications.',
      'Graph links matter: many applications sharing a device or address is a strong sign of fraud.',
      'Start new customers on small limits and grow them with good repayment, which limits what any one fake identity can take.',
    ],
    followUp: 'How do you balance this against customers with no credit history, who may be your best market?',
  },
  {
    category: 'Security',
    q: 'A customer repays perfectly for months, then maxes out and disappears. What is this, and what do you do?',
    a: [
      'This is bust-out fraud: building trust in order to cash out. It can look just like a good customer until the end.',
      'Watch for sudden changes in spending, such as a jump to resellable goods, and a new device just before a large purchase.',
      'Slow down limit increases, cap how quickly a limit can be used, and add a step-up on unusual spikes.',
    ],
    followUp: 'How do you avoid punishing a real customer who just bought a fridge?',
  },
  {
    category: 'Security',
    q: 'A merchant and its customers collude to take loans for sales that never happened. How do you catch it?',
    a: [
      "Hold the merchant to its own risk profile: track refund rates, first-payment defaults and how its customers' behavior compares with its peers.",
      'New merchants get lower limits and slower settlement, or a reserve that is held back. Link high-risk goods to delivery evidence.',
      'First-payment default by merchant is a very strong signal, so make it a dashboard and an alert.',
    ],
    followUp: 'A top merchant shows the same signal. Who makes the decision, and how?',
  },
  {
    category: 'Security',
    q: 'How do you protect national ID numbers while still being able to search by them?',
    a: [
      'Encrypt the field, with envelope encryption and keys in a KMS. Add a keyed hash, a blind index, so you can look up an exact match without decrypting.',
      'A plain hash is not enough: ID numbers are short and easy to enumerate, so the hash must use a secret key.',
      'Limit which services can decrypt, log each access, and keep the values out of logs, events and the analytics store, or tokenize them there.',
    ],
    followUp: 'How do you rotate that key, and what happens to the index?',
  },
  {
    category: 'Security',
    q: 'How do you stop an employee from raising a limit or changing a bank account?',
    a: [
      'Use maker-checker: one person proposes the change and a different person approves it, and the system enforces that.',
      "Give each role the least it needs, and show support staff masked data. Temporary access should expire.",
      'Write to an audit log that the people being audited cannot change, and alert on unusual volumes.',
    ],
    followUp: 'What about engineers with production database access?',
  },
  {
    category: 'Staff',
    q: 'Would you build services or a modular monolith first?',
    a: [
      'Split where data ownership and reasons to change differ, not by habit. Ledger and credit limits need strong consistency, so a distributed transaction between them is a warning sign.',
      'A modular monolith with clear boundaries can be the right start. Extract a service when a team, scaling profile or compliance scope justifies it.',
      'Say what signal would change your mind.',
    ],
    followUp: 'You already have 40 services, and teams are slowed down. What would you do?',
  },
  {
    category: 'Staff',
    q: 'How would you migrate a live ledger to a new design without stopping lending?',
    a: [
      'Write to both, compare continuously, then move reads across gradually behind a flag, starting with a small share of traffic.',
      'Define what must match, and let reconciliation prove it. Keep a way to roll back at each step.',
      'Migrate the history separately, and keep old records so that auditors and lenders can still trace them.',
    ],
    followUp: 'Who has to sign off, beyond engineering?',
  },
  {
    category: 'Staff',
    q: 'What changes when the company becomes a regulated lender that takes deposits?',
    a: [
      "Deposits are customers' money, so availability, audit, access control and reporting get much stricter, and change management gets more formal.",
      'Separate the systems that hold deposits from experimental lending features, and clearly define what each one is allowed to do.',
      'Involve risk and compliance early, as part of the design and not as a final review. Check the specific rules with them rather than assuming.',
    ],
    followUp: 'How do you keep shipping quickly under those controls?',
  },
]

const CATEGORIES: (Category | 'All')[] = ['All', 'Design', 'Failures', 'Security', 'Staff']

export default function PayLaterQuestions() {
  const [category, setCategory] = useState<Category | 'All'>('All')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const shown = QUESTIONS.filter((item) => category === 'All' || item.category === category)
  const allOpen = shown.every((item) => open.has(item.q))

  function toggle(q: string) {
    const next = new Set(open)
    if (next.has(q)) next.delete(q)
    else next.add(q)
    setOpen(next)
  }

  function toggleAll() {
    const next = new Set(open)
    shown.forEach((item) => (allOpen ? next.delete(item.q) : next.add(item.q)))
    setOpen(next)
  }

  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Question category">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={category === c} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
        <div className="sim-ctl">
          <button className="sim-btn ghost" type="button" onClick={toggleAll}>
            {allOpen ? 'Hide all' : 'Reveal all'}
          </button>
          <span className="sim-pos">{shown.length} questions</span>
        </div>
      </div>
      {shown.map((item, i) => {
        const isOpen = open.has(item.q)
        return (
          <div className="sim-card sim-q" key={item.q}>
            <span className="sim-tag">
              {i + 1} · {item.category}
            </span>
            <h3>{item.q}</h3>
            {isOpen ? (
              <>
                <ul className="t">
                  {item.a.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <p className="sim-small">
                  <b>They may follow up:</b> {item.followUp}
                </p>
              </>
            ) : null}
            <button className="sim-btn ghost" type="button" aria-expanded={isOpen} onClick={() => toggle(item.q)}>
              {isOpen ? 'Hide answer' : 'Think first, then reveal'}
            </button>
          </div>
        )
      })}
    </div>
  )
}
