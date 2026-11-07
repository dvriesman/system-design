import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'

type Option = { name: string; good: string; bad: string }
type Topic = {
  id: string
  title: string
  question: string
  business: string
  options?: Option[]
  recommend: string
  code?: string
  extra?: ReactNode
  staff: string
}

const TOPICS: Topic[] = [
  {
    id: 'limit',
    title: 'Limit reservation',
    question: 'Two purchases arrive together, and only one fits the limit. How do you make sure only one succeeds?',
    business: 'Overspending a limit turns directly into credit loss, and declining a good purchase loses a sale.',
    options: [
      { name: 'Atomic conditional update', good: 'Short, simple, no retries needed. Under Read Committed, the waiting update re-checks its WHERE clause.', bad: 'The row is a bottleneck if one customer buys many things at once, which is rare here.' },
      { name: 'SELECT FOR UPDATE, then check', good: 'Allows more complicated rules between reading and writing.', bad: 'Holds a lock longer, so a slow step inside the transaction blocks others.' },
      { name: 'Version check, with retries', good: 'Holds no locks while the application thinks.', bad: 'Needs a retry loop. It wastes work when there is real contention.' },
      { name: 'Keep the limit in Redis', good: 'Very fast.', bad: 'A failover can lose a recent update, and the limit no longer commits together with the loan. Avoid this for money.' },
    ],
    recommend: 'Use the atomic update, in the same transaction as the loan and the ledger. Check that one row changed.',
    code: `UPDATE credit_accounts
   SET available = available - :amount
 WHERE customer_id = :customer AND available >= :amount;
-- 1 row changed: reserved. 0 rows changed: declined.`,
    staff: "Say what you'd watch: lock wait time on this table. Also keep the transaction free of network calls, and make that a code review rule.",
  },
  {
    id: 'isolation',
    title: 'Isolating merchants',
    question: 'One merchant runs a huge sale. How do you protect the other merchants, and how do you partition data?',
    business: "Merchants join to sell more, so one retailer's sale event must not stop lending everywhere else.",
    options: [
      { name: 'Limits and pools per merchant, at the edge', good: 'Protects everyone, and credit data stays simple.', bad: 'You can refuse real sales, so limits must be agreed with merchants.' },
      { name: 'Partition credit data by merchant', good: 'Looks natural for merchant reports.', bad: 'A limit belongs to a customer across merchants, so every limit check would cross partitions.' },
      { name: 'Partition credit data by customer', good: 'One customer\'s limit, loans and ledger stay together, so one transaction still works.', bad: 'Merchant reports span all partitions, so they need a separate read store.' },
    ],
    recommend: 'Separate the two questions. Isolate merchants at the edge, with rate limits, worker pools and queues. Partition credit data by customer, only when you truly need to.',
    staff: 'Plan large events with big merchants in advance, load test, and decide who gets capacity first when it runs out. That last part is a business decision.',
  },
  {
    id: 'sync',
    title: 'Sync or async decisions',
    question: 'What has to happen during the request, and what can happen before or after?',
    business: 'A slow checkout loses the sale, while a poor decision loses the money. Both cost real money.',
    options: [
      { name: 'Compute everything in the request', good: 'Data is always fresh, and there is one code path.', bad: "Slow, and it puts load on production databases at the worst time." },
      { name: 'Precompute features, decide in the request', good: 'Fast and predictable, and scales independently.', bad: 'Data can be slightly stale, and there are two data paths to keep consistent.' },
      { name: 'Decide later, review asynchronously', good: 'Allows heavy checks and manual review.', bad: 'Not usable where the buyer is waiting, so only for large or unusual cases.' },
    ],
    recommend: 'Precompute features from events, and decide in the request with quick rules and a model. Reserve slower checks for first purchases and unusual cases.',
    staff: 'Roll out models in shadow mode first, then to a small share of traffic. Store the inputs and model version for each decision, so that you can explain it later.',
  },
  {
    id: 'bureau',
    title: 'When the bureau is down',
    question: 'The credit bureau times out. Do you approve, decline or wait?',
    business: 'This is a direct trade between lost sales and possible losses, so the business has to own the answer.',
    options: [
      { name: 'Decline everything', good: 'Safe for the money, and simple.', bad: 'Loses sales and frustrates merchants through someone else\'s outage.' },
      { name: 'Known customers continue on internal data', good: 'Keeps most sales, using what you already know.', bad: 'Adds some risk, so it needs a lower limit while running in this mode.' },
      { name: 'Ask new customers to wait', good: 'Safe for customers you know nothing about.', bad: 'Many of them will leave and never come back.' },
    ],
    recommend: 'Use timeouts and a circuit breaker, continue known customers with a lower limit, and hold or decline new ones. Make the policy configurable without a release.',
    staff: 'Afterwards, compare the default rate of loans made in fallback mode with normal ones. That turns the policy from an opinion into a measurement.',
  },
  {
    id: 'ledger',
    title: 'The ledger',
    question: 'How do you record money, so that every cent can be explained?',
    business: 'Regulators, auditors and funders all depend on these records, and so does each merchant payout.',
    options: [
      { name: 'Balance columns only', good: 'Simple to build at first.', bad: 'When a number is wrong, there is no history to explain why.' },
      { name: 'Append-only double entry', good: 'Every movement balances, and corrections are visible new entries.', bad: 'More rows and more to learn, and balances have to be derived or cached.' },
    ],
    recommend: 'Use append-only double entry, with cached balances that can always be rebuilt. Store money as integers in the smallest unit.',
    extra: (
      <div className="sim-cmp">
        <table>
          <thead>
            <tr>
              <th>Event: a $1,000 sale with a 5% fee</th>
              <th>Debit</th>
              <th>Credit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>The loan is created</td>
              <td>Loans receivable $1,000</td>
              <td>Merchant payable $950, fee income $50</td>
            </tr>
            <tr>
              <td>The merchant is paid</td>
              <td>Merchant payable $950</td>
              <td>Cash $950</td>
            </tr>
            <tr>
              <td>The customer repays $250</td>
              <td>Cash $250</td>
              <td>Loans receivable $250</td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
    staff: 'Involve finance early when naming accounts and rules, because they will have to live with them. Agree when revenue is recognized, instead of assuming.',
  },
  {
    id: 'installments',
    title: 'Installments and late payments',
    question: 'How do you model installments when payments are partial, late or duplicated?',
    business: 'Repayment is how the lender gets its money back, and mistakes here hurt real customers directly.',
    recommend: 'Model each installment as a state machine, and each payment as a separate record. Applying a payment to installments is its own explicit step, and it can be re-run.',
    code: `installment:  scheduled → due → paid
                           ↓      ↑
                        overdue ──┘

payment:      pending → confirmed → applied
                  ↓
               expired or failed`,
    options: [
      { name: 'Restore the limit when payment starts', good: 'Customers can spend again at once.', bad: 'A pending payment may expire, leaving you exposed.' },
      { name: 'Restore the limit when payment confirms', good: 'Safe.', bad: 'Customers have to wait, and may lose a purchase meanwhile.' },
    ],
    staff: 'Write down how money is allocated: oldest installment first, and what order for fees, interest and principal. Legal and finance should sign off, and it must be versioned, because old loans keep their rules.',
  },
  {
    id: 'refunds',
    title: 'Refunds',
    question: 'A customer returns an item after paying two of the installments. What happens?',
    business: 'Handling returns badly makes customers stop paying, and makes merchants distrust the numbers.',
    recommend: "Treat it as a saga: cancel what's still owed, return what the customer already paid, and recover the money from the merchant, all as new ledger entries and in clear steps.",
    options: [
      { name: 'Deduct from the next merchant payout', good: 'Simple and automatic.', bad: 'The next payout may be smaller than what is owed, so you still need a receivable.' },
      { name: 'Charge the merchant separately', good: 'Clear and traceable.', bad: 'Slower, with a real risk of not collecting.' },
    ],
    staff: 'Ask who keeps the fee on a refund, and whether interest is returned. Those are commercial decisions, and they change the design.',
  },
  {
    id: 'settlement',
    title: 'Merchant settlement',
    question: 'How do you pay merchants, without ever paying twice?',
    business: 'Merchant trust keeps the network growing, and a double payment may be very hard to recover.',
    options: [
      { name: 'Pay gross, with a separate fee invoice', good: 'Easy for merchants to read.', bad: 'You hand over money you then have to collect back.' },
      { name: 'Pay net of fees and refunds', good: 'Less money at risk, and a single transfer.', bad: 'Each payout needs a clear statement, or merchants can\'t reconcile it.' },
      { name: 'Hold back a reserve', good: 'Protects against refunds and fraud.', bad: 'Less attractive, so use it mainly for new or high-risk merchants.' },
    ],
    recommend: 'Pay net, in batches, with one record per merchant and a stable idempotency key for each payout. Rerunning a batch must only finish what is left.',
    staff: 'If a payout has an unknown result, ask the bank before you retry. Also keep the ability to pause one merchant without pausing them all.',
  },
  {
    id: 'reconciliation',
    title: 'Reconciliation',
    question: 'How do you prove that your records match the outside world?',
    business: 'Your systems can all agree with each other and still be wrong. Bank records are the outside check.',
    options: [
      { name: 'Nightly batch', good: 'Simple, and it matches how many bank files arrive.', bad: 'A problem can run for a day before anyone sees it.' },
      { name: 'Continuous checks, plus a batch', good: 'Catches problems within minutes, with files as the final word.', bad: 'More to build, and timing differences create noise.' },
    ],
    recommend: 'Match three sources by reference: your ledger, provider files and merchant settlements. Classify each difference, and let timing differences clear themselves in a later run.',
    staff: 'Reconciliation only helps if someone acts. Track the size and age of unresolved differences, give each one an owner, and fix them with new ledger entries.',
  },
  {
    id: 'kafka',
    title: 'Kafka or a queue',
    question: 'Which messaging system do you pick, and when?',
    business: 'Running more infrastructure costs money and attention, so it has to earn its place.',
    options: [
      { name: 'A queue such as SQS or RabbitMQ', good: 'Simple to run, and a good fit for background jobs with one consumer.', bad: 'Harder to replay, or to let several teams read the same events.' },
      { name: 'Kafka', good: 'Many consumers, replay, and ordering within a partition.', bad: 'More to run and learn, and you have to design partitions and schemas.' },
    ],
    recommend: 'Start with a queue when each job has one consumer. Move to Kafka when several teams and the data pipeline need the same events. In both cases, write events through an outbox, and make consumers idempotent.',
    code: `-- In one transaction with the business change
INSERT INTO outbox (event_id, type, payload) VALUES (...);

-- A relay publishes unsent rows, and may publish one twice
-- So each consumer checks event_id before acting`,
    extra: (
      <p className="sim-small">
        See <Link to="/patterns/finance/outbox">Transactional Outbox</Link> for what happens at each crash point.
      </p>
    ),
    staff: "Use the loan or customer ID as the Kafka key, so that one customer's events stay in order. Have a plan for schema changes before the first event ships.",
  },
  {
    id: 'postgres',
    title: 'PostgreSQL and Spring pitfalls',
    question: 'What goes wrong in practice, with transactions on the JVM?',
    business: 'These bugs are quiet: they pass tests, then lose money under real concurrency.',
    options: [
      { name: 'Read Committed (the PostgreSQL default)', good: 'No serialization errors to handle. An UPDATE re-checks its WHERE after waiting.', bad: 'Reading a value and writing it back later can overwrite a concurrent change.' },
      { name: 'Repeatable Read', good: 'A stable view of the data within a transaction.', bad: 'Fails with a serialization error on a concurrent update, so the whole transaction must be retried.' },
      { name: 'Serializable', good: 'The strongest guarantee, and it catches anomalies you did not think of.', bad: 'The application must retry on failure, and it needs care under contention.' },
    ],
    recommend: 'Read Committed with atomic updates and unique constraints covers most of this, and you can use a stricter level where you can show that it is needed.',
    code: `@Transactional
fun confirm(order: Order) {
  limits.reserve(order)
  bureau.check(order)      // a network call while holding locks: move it out
}

fun outer() {
  confirm(order)           // a call inside the same class skips the proxy:
}                          // no transaction starts in proxy mode`,
    extra: (
      <ul className="t">
        <li>
          <b>Self-invocation:</b> with Spring's default proxies, a call from one method to another within the same object doesn't start a transaction.
        </li>
        <li>
          <b>Checked exceptions:</b> by default, Spring rolls back on unchecked exceptions and errors. Checked exceptions don't roll back unless you configure them to.
        </li>
        <li>
          <b>Network calls in a transaction:</b> they hold locks and a database connection for as long as the other side takes. Under load, that can exhaust the pool.
        </li>
      </ul>
    ),
    staff: 'Turn these into automated checks and shared libraries, so that the safe way is the easy way across every team.',
  },
  {
    id: 'services',
    title: 'Monolith or services',
    question: 'Would you split this into services? Where?',
    business: 'Early on, speed of learning matters most. Later, teams blocking each other becomes the larger cost.',
    options: [
      { name: 'Modular monolith', good: 'One transaction makes money simple, and it is quick to change.', bad: 'One release affects everything, and teams have to coordinate.' },
      { name: 'Services by ownership', good: 'Teams release independently, and each part scales separately.', bad: 'Network failures, tracing, versioned contracts, and no shared transaction.' },
    ],
    recommend: 'Split where ownership and the reasons for change differ. Keep the limit, the loan and the ledger together for as long as you can, because that boundary is where a transaction is most valuable.',
    staff: 'Say what would trigger a split, such as release queues or incidents crossing teams. Then show the migration: extract one service behind an interface, and move traffic gradually.',
  },
  {
    id: 'deposits',
    title: 'Taking deposits',
    question: 'What changes when a lender also holds customer deposits?',
    business: "Now it's customers' own money, not only the lender's money at risk, so regulators and customers expect more.",
    recommend: 'Separate deposit systems from fast-moving lending features, keep the boundary small, and treat money moving across it like an external payment: idempotent and reconciled.',
    options: [
      { name: 'Add deposits to the existing core', good: 'One transaction across lending and deposits.', bad: 'Every lending change now carries the risk and controls of deposits.' },
      { name: 'A separate deposit core', good: 'Stricter controls apply to less code, and lending keeps its pace.', bad: 'No shared transaction, so transfers need a saga and reconciliation.' },
    ],
    staff: 'Bring risk and compliance into the design from the start, and check the actual rules with them. Availability targets, audit and access reviews all become requirements, not preferences.',
  },
]

export default function PayLaterDeepDives() {
  const [active, setActive] = useState(TOPICS[0].id)
  const topic = TOPICS.find((t) => t.id === active) ?? TOPICS[0]
  return (
    <div className="sim-bench">
      <div className="sim-topics" role="group" aria-label="Deep dive topic">
        {TOPICS.map((t) => (
          <button key={t.id} type="button" aria-pressed={active === t.id} onClick={() => setActive(t.id)}>
            {t.title}
          </button>
        ))}
      </div>
      <div className="sim-narr" aria-live="polite">
        <b className="t">{topic.question}</b>
        <span>
          <b>Why the business cares:</b> {topic.business}
        </span>
      </div>
      {topic.options ? (
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>Option</th>
                <th>What you get</th>
                <th>What you pay</th>
              </tr>
            </thead>
            <tbody>
              {topic.options.map((o) => (
                <tr key={o.name}>
                  <td>
                    <b>{o.name}</b>
                  </td>
                  <td>{o.good}</td>
                  <td>{o.bad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="sim-say">
        <b>What I'd choose.</b> {topic.recommend}
      </div>
      {topic.code ? <pre className="sim-block">{topic.code}</pre> : null}
      {topic.extra}
      <div className="sim-card">
        <h3>The Staff angle</h3>
        <p>{topic.staff}</p>
      </div>
    </div>
  )
}
