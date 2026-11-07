import { useState } from 'react'
import { Link } from 'react-router-dom'
import '../styles/sim.css'
import PayLaterArchitecture from './PayLaterArchitecture'
import PayLaterDebugger from './PayLaterDebugger'
import PayLaterDeepDives from './PayLaterDeepDives'
import PayLaterQuestions from './PayLaterQuestions'

const money = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`
const whole = (n: number) => Math.round(n).toLocaleString('en-US')

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (n: number) => void }) {
  return (
    <label className="sim-slider">
      <span>
        {label} <b>{unit === '$' ? `$${value.toLocaleString('en-US')}` : `${value.toLocaleString('en-US')}${unit}`}</b>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}

const PRESETS = {
  short: { label: '3 installments, no interest', fee: 6, apr: 0, months: 3 },
  long: { label: '12 installments, with interest', fee: 3, apr: 28, months: 12 },
}

function Economics() {
  const [amount, setAmount] = useState(1000)
  const [fee, setFee] = useState(PRESETS.short.fee)
  const [apr, setApr] = useState(PRESETS.short.apr)
  const [months, setMonths] = useState(PRESETS.short.months)
  const [funding, setFunding] = useState(15)
  const [loss, setLoss] = useState(2)
  const [ops, setOps] = useState(10)

  // Equal principal installments: the average balance over the term is amount * (months + 1) / (2 * months).
  const yearsOfFullBalance = (months + 1) / 24
  const merchantFee = (amount * fee) / 100
  const paidToMerchant = amount - merchantFee
  const interest = amount * (apr / 100) * yearsOfFullBalance
  const fundingCost = paidToMerchant * (funding / 100) * yearsOfFullBalance
  const creditLoss = (amount * loss) / 100
  const result = merchantFee + interest - fundingCost - creditLoss - ops
  const breakEven = ((merchantFee + interest - fundingCost - ops) / amount) * 100

  function preset(p: (typeof PRESETS)[keyof typeof PRESETS]) {
    setFee(p.fee)
    setApr(p.apr)
    setMonths(p.months)
  }

  return (
    <div className="sim-store">
      <h3>
        <span>Does one sale make money?</span>
        <span className="sim-tag">example numbers, not real data</span>
      </h3>
      <div className="sim-axes">
        <div className="sim-axis">
          <span className="sim-axis-label">Try</span>
          <div className="sim-seg" role="group" aria-label="Example plan">
            {Object.values(PRESETS).map((p) => (
              <button key={p.label} type="button" aria-pressed={fee === p.fee && apr === p.apr && months === p.months} onClick={() => preset(p)}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="sim-sliders">
        <Slider label="Sale amount" value={amount} min={100} max={5000} step={100} unit="$" onChange={setAmount} />
        <Slider label="Merchant fee" value={fee} min={0} max={10} step={0.5} unit="%" onChange={setFee} />
        <Slider label="Consumer interest, yearly" value={apr} min={0} max={70} step={1} unit="%" onChange={setApr} />
        <Slider label="Installments" value={months} min={1} max={24} step={1} unit=" months" onChange={setMonths} />
        <Slider label="Lender's own cost of money, yearly" value={funding} min={0} max={30} step={1} unit="%" onChange={setFunding} />
        <Slider label="Expected credit loss" value={loss} min={0} max={20} step={0.5} unit="%" onChange={setLoss} />
        <Slider label="Operating cost per sale" value={ops} min={0} max={50} step={1} unit="$" onChange={setOps} />
      </div>
      <div className="sim-tw">
        <table>
          <tbody>
            <tr>
              <td>Merchant receives now</td>
              <td>{money(paidToMerchant)}</td>
            </tr>
            <tr>
              <td>+ Merchant fee</td>
              <td>{money(merchantFee)}</td>
            </tr>
            <tr>
              <td>+ Consumer interest</td>
              <td>{money(interest)}</td>
            </tr>
            <tr>
              <td>− Cost of the money lent</td>
              <td>{money(fundingCost)}</td>
            </tr>
            <tr>
              <td>− Expected credit loss</td>
              <td>{money(creditLoss)}</td>
            </tr>
            <tr>
              <td>− Operating cost</td>
              <td>{money(ops)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className={`sim-tx-reader ${result >= 0 ? 'ok' : 'short'}`}>
        {result >= 0 ? `Makes ${money(result)} on this sale` : `Loses ${money(-result)} on this sale`}
        <span>{breakEven > 0 ? `It breaks even at a credit loss of ${breakEven.toFixed(1)}%. Above that, each sale loses money.` : 'It loses money even with no credit loss at all.'}</span>
      </div>
      <p className="sim-small">
        A simple estimate: installments repay equal parts of the balance, and every example number here is made up. Move the credit loss slider to see why this business depends on the
        quality of its decisions.
      </p>
    </div>
  )
}

function Scale() {
  const [customers, setCustomers] = useState(4)
  const [purchases, setPurchases] = useState(2)
  const [peak, setPeak] = useState(25)
  const [installments, setInstallments] = useState(4)

  const perMonth = customers * 1_000_000 * purchases
  const avg = perMonth / (30 * 86400)
  const peakRate = avg * peak
  // Each purchase posts about 4 entries, and each repayment about 2.
  const ledgerRows = perMonth * (4 + installments * 2)
  const yearlyGb = (ledgerRows * 12 * 300) / 1e9

  return (
    <div className="sim-store">
      <h3>
        <span>How much load is this, really?</span>
        <span className="sim-tag">assumptions you can change</span>
      </h3>
      <div className="sim-sliders">
        <Slider label="Active customers, in millions" value={customers} min={1} max={20} step={1} unit="M" onChange={setCustomers} />
        <Slider label="Purchases per customer, monthly" value={purchases} min={0.5} max={6} step={0.5} unit="" onChange={setPurchases} />
        <Slider label="Peak compared with average" value={peak} min={5} max={100} step={5} unit="×" onChange={setPeak} />
        <Slider label="Installments per purchase" value={installments} min={1} max={24} step={1} unit="" onChange={setInstallments} />
      </div>
      <div className="sim-tx-stage">
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Average checkouts</span>
          <span className="sim-lab-value">{avg.toFixed(1)} per second</span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Peak checkouts</span>
          <span className="sim-lab-value">{whole(peakRate)} per second</span>
        </div>
        <div className="sim-tx-ledger">
          <span className="sim-tx-name">Ledger rows yearly</span>
          <span className="sim-lab-value">
            {((ledgerRows * 12) / 1e9).toFixed(1)} billion, about {whole(yearlyGb)} GB
          </span>
        </div>
      </div>
      <p className="sim-small">
        This assumes about 4 ledger entries per purchase, 2 per repayment and 300 bytes per row, indexes aside. The conclusion for most values: a well-run PostgreSQL can carry the writes, so don't open
        with sharding. The volume that does grow is ledger history, so plan for partitioning and archiving it. Peak also includes every read, status check and retry, so measure those as well.
      </p>
    </div>
  )
}

type Threat = { threat: string; attack: string; control: string; tradeoff: string }
const THREATS: { group: string; items: Threat[] }[] = [
  {
    group: 'Merchants',
    items: [
      {
        threat: 'Stolen merchant credentials',
        attack: 'A leaked secret lets someone create checkouts or read orders as that merchant.',
        control: 'OAuth client credentials with short-lived, narrowly scoped tokens, separate sandbox and production keys, and easy rotation. Optionally, sign requests with RFC 9421.',
        tradeoff: 'Signing adds real integration work, which small merchants may not manage. Offer plugins, and require signing only for the riskiest calls.',
      },
      {
        threat: 'One merchant reaching another\'s data',
        attack: 'Changing an order ID in a request returns another merchant\'s customer or order.',
        control: 'Take the merchant from the token, never from the request, and scope every query by it. Use tests that try this on every endpoint, and consider row-level security as a second layer.',
        tradeoff: 'Row-level security adds operational complexity, but it catches the query someone forgets.',
      },
      {
        threat: 'Replayed or tampered requests',
        attack: 'A captured request is sent again, or an amount is changed in transit.',
        control: 'TLS everywhere, idempotency keys, and rejecting a reused key with a different body. A signature can cover the content, with a timestamp and nonce the server actually checks.',
        tradeoff: 'Checking nonces needs a short-lived store, and clocks that roughly agree.',
      },
      {
        threat: 'Forged callbacks',
        attack: 'An attacker posts "approved" to the merchant\'s callback, and goods ship without a loan.',
        control: 'Sign callbacks with a timestamp and event ID, and give merchants a status call to confirm before shipping high-value goods.',
        tradeoff: 'You can\'t force merchants to verify, so make it easy and make your plugins do it by default.',
      },
      {
        threat: 'Abusing the redirect or callback URL',
        attack: 'An attacker sends the buyer to a fake site, or sets a callback URL that makes your servers call internal systems.',
        control: 'Register exact URLs per merchant, block internal addresses, and send callbacks through an isolated egress path.',
        tradeoff: 'Registration slows onboarding for merchants with many domains or storefronts.',
      },
      {
        threat: 'A malicious merchant',
        attack: 'A merchant and fake buyers create loans for sales that never happened, and the merchant takes the money.',
        control: 'Vet merchants, start with low limits and a held-back reserve, slow down settlement for new ones, and monitor refunds and first-payment defaults per merchant.',
        tradeoff: 'Slower settlement is less attractive to good merchants, so ease it as they build a record.',
      },
    ],
  },
  {
    group: 'Customers',
    items: [
      {
        threat: 'Account takeover',
        attack: 'An attacker logs in as a customer and spends the available limit.',
        control: 'Bind sessions to known devices, score risk at each purchase, and use step-up for new devices, unusual amounts and new delivery addresses.',
        tradeoff: 'Every extra check loses some real sales, so reserve them for risky moments.',
      },
      {
        threat: 'SIM swap, or a code sent to the wrong person',
        attack: 'An attacker gets control of the phone number, and with it the codes and possibly the messaging account.',
        control: 'Treat a new SIM, number or messaging account as a risk signal. NIST SP 800-63B restricts phone-network codes and names SIM change as a risk indicator. Offer passkeys or an app-based approval where possible.',
        tradeoff: 'Many customers have only a basic phone, so stronger methods can\'t be the only option.',
      },
      {
        threat: 'Phished one-time codes',
        attack: 'A fake page or a phone call persuades the customer to hand over a code.',
        control: 'Say exactly what the code approves, including the amount and merchant, and warn never to share it. NIST notes that out-of-band codes aren\'t phishing-resistant, so don\'t rely on them alone for the riskiest actions.',
        tradeoff: 'Better prompts help but don\'t eliminate this. It needs fraud monitoring as well.',
      },
    ],
  },
  {
    group: 'Fraud',
    items: [
      {
        threat: 'Synthetic or stolen identities',
        attack: 'Someone opens credit using a made-up identity or another person\'s ID number.',
        control: 'ID document and liveness checks, bureau data, device and phone signals, and links between applications. Start with small limits.',
        tradeoff: 'Strict checks exclude people with thin credit files, who may be the customers this product exists to serve.',
      },
      {
        threat: 'Bust-out fraud',
        attack: 'A customer builds a good record over months, then maxes out and disappears.',
        control: 'Limit how quickly limits grow and how fast they can be used, and watch for a sudden change in spending or a new device.',
        tradeoff: 'A real customer buying one large item looks similar, so use step-up instead of a block.',
      },
      {
        threat: 'Abusing refunds and repayments',
        attack: 'A customer uses a pending payment to restore their limit, spends it, and the payment never settles.',
        control: 'Restore the limit only when the money is confirmed, and treat refunds through a full state machine.',
        tradeoff: 'Waiting for confirmation frustrates honest customers, so you might restore early only for those with a strong record.',
      },
    ],
  },
  {
    group: 'Data',
    items: [
      {
        threat: 'Leaking national IDs and credit data',
        attack: 'A breach, a verbose log or an analytics export exposes sensitive personal data.',
        control: 'Field-level encryption with keys in a KMS, tokens in events and analytics, redaction in logs, and data retention limits. Follow the local data protection law.',
        tradeoff: 'Encrypted fields are harder to search and analyze, so plan for the analysts\' needs too.',
      },
      {
        threat: 'Finding a person by ID without decrypting',
        attack: 'A plain hash of a short ID number can be reversed by simply hashing every possible number.',
        control: 'Use a blind index: a keyed hash with its key in a KMS, for exact-match lookups.',
        tradeoff: 'It supports exact match only, and rotating the key means rebuilding the index.',
      },
      {
        threat: 'Leaked secrets and old keys',
        attack: 'A key in a repository or config file gives lasting access.',
        control: 'A secrets manager, short-lived credentials, scanning for leaks, and rotation that has been practiced.',
        tradeoff: 'Dynamic credentials add dependencies, so plan for the secrets manager being unavailable.',
      },
    ],
  },
  {
    group: 'Internal',
    items: [
      {
        threat: 'A compromised service',
        attack: 'A breached low-value service calls the ledger directly.',
        control: 'Workload identity with mTLS, and per-service permissions, so only the right services can post to the ledger.',
        tradeoff: 'A service mesh adds operational cost. A smaller, well-tested allowlist can be a good first step.',
      },
      {
        threat: 'An insider changing limits or payouts',
        attack: 'An employee raises a limit, or changes a merchant\'s bank account to their own.',
        control: 'Maker-checker enforced by the system, least privilege, masked data, and extra checks and a delay on bank account changes.',
        tradeoff: 'Slower support for customers, so define an audited emergency path.',
      },
      {
        threat: 'Rewriting history',
        attack: 'Someone edits ledger rows or audit logs to hide a change.',
        control: 'An append-only ledger, audit logs in storage the operators can\'t change, hash chaining if needed, and reconciliation against external bank records.',
        tradeoff: 'More storage and tooling. External reconciliation often catches what internal controls miss.',
      },
    ],
  },
]

function SecurityReview() {
  const [group, setGroup] = useState(THREATS[0].group)
  const active = THREATS.find((g) => g.group === group) ?? THREATS[0]
  return (
    <div className="sim-bench">
      <div className="sim-toolbar">
        <div className="sim-seg" role="group" aria-label="Threat area">
          {THREATS.map((g) => (
            <button key={g.group} type="button" aria-pressed={group === g.group} onClick={() => setGroup(g.group)}>
              {g.group}
            </button>
          ))}
        </div>
      </div>
      <div className="sim-cards">
        {active.items.map((item) => (
          <div className="sim-card" key={item.threat}>
            <h3>{item.threat}</h3>
            <p>
              <b>The attack:</b> {item.attack}
            </p>
            <p>
              <b>The control:</b> {item.control}
            </p>
            <p>
              <b>The trade-off:</b> {item.tradeoff}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function PayLaterPattern() {
  return (
    <div className="sim mx-auto max-w-5xl">
      <div className="sim-header">
        <div className="sim-eyebrow">Case Studies · Pay-Later Checkout</div>
        <h1>Pay-Later Checkout</h1>
        <p className="sim-lede">
          A shopper with no credit card buys from an online store and pays over several months. The store gets its money now, and a lender takes the risk. How would you design that? This case study follows the
          way a strong interview answer does: start from the business, and let it decide what matters.
        </p>
        <ol className="sim-parts">
          <li>
            <a href="#plan">How to run the 45 minutes.</a> A timeline, and what separates a Staff answer.
          </li>
          <li>
            <a href="#business">The business, then the requirements.</a> Who pays whom, and how much load this really is.
          </li>
          <li>
            <a href="#flow">The two checkout paths.</a> Why checkout is a session and not one API call.
          </li>
          <li>
            <a href="#architecture">An architecture that follows the requirements.</a> Six diagrams from simple to complex, or set your own latency, scale and availability.
          </li>
          <li>
            <a href="#debugger">Checkout, step by step.</a> Five designs against retries, races, crashes and forgeries.
          </li>
          <li>
            <a href="#deep-dives">Deep dives.</a> The trade-offs interviewers push on, with a recommendation for each.
          </li>
          <li>
            <a href="#security">Security review.</a> Threats, controls and their trade-offs.
          </li>
          <li>
            <a href="#questions">Mock interview.</a> Think first, then reveal an answer and a likely follow-up.
          </li>
        </ol>
        <p className="sim-small">This is one reasonable design for a generic pay-later lender, not a description of any company's system.</p>
      </div>

      <section id="plan" aria-labelledby="p1" className="sim-section sim-first">
        <h2 id="p1">How to run the 45 minutes</h2>
        <p className="sim-lede">The common mistake is drawing boxes in the first minute. Spend the opening on what the business needs, because every later decision can then point back to it.</p>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>Minutes</th>
                <th>Do this</th>
                <th>Say something like</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>0-5</td>
                <td>Clarify the business and scope</td>
                <td>"Who takes the default risk? Which channels? Is this one country and currency?"</td>
              </tr>
              <tr>
                <td>5-10</td>
                <td>Requirements and an estimate</td>
                <td>"At about 100 checkouts per second, this is mainly a correctness problem, so I'll focus there."</td>
              </tr>
              <tr>
                <td>10-20</td>
                <td>The main flow and data ownership</td>
                <td>"Here's who owns the limit, the loan and the ledger, and which calls are synchronous."</td>
              </tr>
              <tr>
                <td>20-35</td>
                <td>Go deep on two or three hard parts</td>
                <td>"I'd go deep on limit reservation, what happens when the process dies, and reconciliation. Does that suit you?"</td>
              </tr>
              <tr>
                <td>35-40</td>
                <td>Security and fraud</td>
                <td>"Here are the attackers I'd plan for, and what each control costs us in lost sales."</td>
              </tr>
              <tr>
                <td>40-45</td>
                <td>Operations and rollout</td>
                <td>"Here's what I'd measure, how I'd roll it out, and what I'd build first."</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="sim-card">
          <h3>What makes it a Staff answer</h3>
          <ul className="t">
            <li>
              <b>Connect technology to money.</b> "Holding the limit too long loses sales, and releasing it too early risks overspending, so here's the expiry I'd choose, and how I'd measure it."
            </li>
            <li>
              <b>Name what you're giving up.</b> Each choice has a price. Say it before the interviewer asks.
            </li>
            <li>
              <b>Choose what not to build.</b> Say what you'd delay, and which signal would make you change your mind.
            </li>
            <li>
              <b>Think about the path.</b> How do you get there from today's system, who owns each part, and how do you roll it back?
            </li>
            <li>
              <b>Involve other teams.</b> Risk, finance, compliance and support all depend on this system, and some decisions belong to them.
            </li>
          </ul>
        </div>
      </section>

      <section id="business" aria-labelledby="p2" className="sim-section">
        <h2 id="p2">The business, then the requirements</h2>
        <p className="sim-lede">
          This is a closed-loop network: the credit can only be spent at merchants in the network, online, in store or in the lender's own marketplace. That's different from a credit card, which works almost
          anywhere, and it means the lender has a direct relationship with both sides.
        </p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>The customer</h3>
            <p>Wants to buy now and pay over time, often without a credit card. Short plans can be interest-free, while longer ones usually carry interest based on risk. Repays by bank transfer, wallet or cash.</p>
          </div>
          <div className="sim-card">
            <h3>The merchant</h3>
            <p>Wants more sales. Pays a fee on each sale, and in return gets paid on an agreed schedule without carrying the risk of the customer not paying.</p>
          </div>
          <div className="sim-card">
            <h3>The lender</h3>
            <p>Earns fees and interest, and pays for credit losses and the cost of the money it lends. That money often comes from outside funders, who expect accurate reporting on the loans.</p>
          </div>
        </div>
        <Economics />
        <h3>Requirements, and why each one exists</h3>
        <div className="sim-cmp">
          <table>
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Business reason</th>
                <th>What it means for the design</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>One contract per checkout</td>
                <td>A duplicate is a debt the customer never agreed to, and a regulatory problem</td>
                <td>
                  <Link to="/patterns/finance/idempotency-keys">Idempotency keys</Link> and a unique constraint on the merchant and order
                </td>
              </tr>
              <tr>
                <td>Limit is never exceeded</td>
                <td>Overspending turns directly into credit loss</td>
                <td>An atomic conditional update on the customer's limit, held for a limited time</td>
              </tr>
              <tr>
                <td>Good customers aren't lost at checkout</td>
                <td>The merchant's reason for joining is more completed sales</td>
                <td>Fast path for returning customers, and precomputed data for decisions</td>
              </tr>
              <tr>
                <td>Merchant paid exactly once, on schedule</td>
                <td>Merchant trust is what keeps the network growing</td>
                <td>Settlement batches with idempotent payouts, and reconciliation</td>
              </tr>
              <tr>
                <td>Every cent can be explained</td>
                <td>Regulators, auditors and funders all depend on it</td>
                <td>Double-entry, append-only ledger, and reconciliation against bank files</td>
              </tr>
              <tr>
                <td>One big merchant can't harm the rest</td>
                <td>A sale event at one retailer shouldn't stop lending everywhere</td>
                <td>Per-merchant rate limits and worker pools, while credit data stays keyed by customer</td>
              </tr>
              <tr>
                <td>Decisions can be explained later</td>
                <td>Customers, regulators and model teams will all ask why</td>
                <td>Store each decision with its inputs and model version</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Scale />
      </section>

      <section id="flow" aria-labelledby="p3" className="sim-section">
        <h2 id="p3">The two checkout paths</h2>
        <p className="sim-lede">
          From the merchant's side, this is simple: create a checkout, send the buyer to the returned URL, and wait for the result. Behind that URL, there are two very different experiences, and each needs its own
          latency target.
        </p>
        <div className="sim-cards">
          <div className="sim-card">
            <h3>First purchase: an application</h3>
            <ul className="t">
              <li>The buyer gives a national ID and a phone number, and proves they control the phone.</li>
              <li>Identity and fraud checks run, plus a credit bureau call.</li>
              <li>The lender sets a limit and terms, and the buyer accepts the contract.</li>
              <li>This takes seconds to minutes. It's a session that can be abandoned and resumed.</li>
            </ul>
          </div>
          <div className="sim-card">
            <h3>Returning customer: spending a limit</h3>
            <ul className="t">
              <li>The customer is recognized and verified, with extra steps if the device or amount looks unusual.</li>
              <li>A quick risk check runs on precomputed data.</li>
              <li>The limit is reserved, and the customer confirms.</li>
              <li>This should feel almost instant, because this is where repeat sales are won or lost.</li>
            </ul>
          </div>
        </div>
        <div className="sim-card">
          <h3>What happens to the session</h3>
          <pre className="sim-block">{`created ──▶ approved ──▶ confirmed ──▶ settled
   │            │            │
   ▼            ▼            ▼
declined     expired      refunded or voided`}</pre>
          <ul className="t">
            <li>
              <b>Approved holds the limit.</b> If the buyer walks away, the hold has to expire, or abandoned carts slowly use up a customer's credit. That expiry is a real trade-off between lost sales and overspending risk.
            </li>
            <li>
              <b>Confirmed is the commit point.</b> The contract, the ledger entries and an outbox event are written in one transaction. See <Link to="/patterns/finance/outbox">Transactional Outbox</Link>.
            </li>
            <li>
              <b>Don't use a distributed transaction with the merchant.</b> You don't control its systems, and it can't hold locks for you. See{' '}
              <Link to="/patterns/finance/two-phase-commit">Two-Phase Commit vs Eventual Consistency</Link>.
            </li>
            <li>
              <b>The limit is revolving.</b> Purchases reduce it, and repayments and refunds restore it. Restore it only when the money is confirmed, because bank transfers and cash vouchers can stay pending and then expire.
            </li>
          </ul>
        </div>
      </section>

      <section id="architecture" aria-labelledby="p6" className="sim-section">
        <h2 id="p6">An architecture that follows the requirements</h2>
        <p className="sim-lede">
          There's no single right diagram. The right one depends on the requirements, and a strong answer starts simple and adds a box only when a requirement forces it. Go through the levels in order, then move the
          controls and watch what each requirement costs.
        </p>
        <PayLaterArchitecture />
        <div className="sim-say">
          <b>Say it out loud.</b> "I'd start with one service and one database, because one transaction makes money simple. I'd add a box only when a requirement forces it: a standby for availability, a feature store for latency, per-merchant limits for a
          big merchant, services when teams block each other, and shards last, if ever."
        </div>
        <p className="sim-small">The thresholds, timings and availability figures here are rules of thumb for teaching. In a real design, measure them.</p>
      </section>

      <section id="debugger" aria-labelledby="p7" className="sim-section sim-first">
        <h2 id="p7">Checkout, step by step</h2>
        <p className="sim-lede">
          A diagram shows the boxes. This shows what happens between them when things go wrong. The same day runs through each design: a lost response, two purchases racing for one limit, two crashes, a forged callback and a rerun payout. Each mode
          fixes something real, and leaves something else broken.
        </p>
      </section>
      <PayLaterDebugger />

      <section id="deep-dives" aria-labelledby="p8" className="sim-section">
        <h2 id="p8">Deep dives</h2>
        <p className="sim-lede">An interviewer will pick two or three of these and push. Each one gives the options, what you'd choose and why, and what a Staff answer adds.</p>
        <PayLaterDeepDives />
      </section>

      <section id="security" aria-labelledby="p4" className="sim-section">
        <h2 id="p4">Security review</h2>
        <p className="sim-lede">
          A lender has attackers that a typical app doesn't: customers who don't intend to repay, and merchants who are in on it. Every control also costs some real sales, so the trade-off belongs in your answer.
        </p>
        <SecurityReview />
        <div className="sim-card">
          <h3>Go deeper on these pages</h3>
          <ul className="t">
            <li>
              <Link to="/patterns/security/oauth-pkce">OAuth 2.0 + PKCE</Link> for logging a customer in from a mobile app.
            </li>
            <li>
              <Link to="/patterns/security/step-up-authentication">Step-Up Authentication</Link> for asking for more proof on a risky purchase, and binding the approval to its amount.
            </li>
            <li>
              <Link to="/patterns/security/sessions-vs-jwts">Sessions vs JWTs</Link> for logging someone out quickly when a device is stolen.
            </li>
          </ul>
        </div>
      </section>

      <section id="questions" aria-labelledby="p5" className="sim-section">
        <h2 id="p5">Mock interview</h2>
        <p className="sim-lede">Answer out loud before you reveal each one. The answers are starting points: a good interview answer also says what you'd give up, and what would change your mind.</p>
        <PayLaterQuestions />
      </section>

      <div className="sim-footer">
        This is an educational design for a generic pay-later lender. All numbers and thresholds are made-up examples, and requirements vary by country and regulator. PostgreSQL behavior refers to its current documentation. Other sources: RFC 6749, RFC
        9421 and NIST SP 800-63B.
      </div>
    </div>
  )
}
