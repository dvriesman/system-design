# System Design — Interactive Learning

## Objective
Build the best web application to teach system design patterns.

## Audience & use case
Senior engineers who want to master system design. They are visual learners: not theory, but hands-on examples
where they can step through execution, inspect state at each point, see diagrams, and evaluate the trade-offs of
their own decisions — the way they'd debug a real system.

## Tech stack
- **React + Vite + TypeScript** — no Next.js, kept deliberately simple (no SSR/server runtime needed; this is a
  static, client-rendered app).
- **React Router** for client-side routing between pattern pages.
- **Tailwind** for the app shell (top bar, sidebar). Pattern pages share one scoped "debugger workbench"
  stylesheet, `src/styles/sim.css` (custom properties for theming, `.sim-*` classes) — reuse it rather than writing
  new per-page CSS.
- **Vercel** for hosting. `vercel.json` has a catch-all rewrite to `index.html` (required for SPA client-side routes
  to work on direct load/refresh).

## Application shell
- Open to everyone. No authentication.
- Responsive — usable on mobile (sidebar collapses to an off-canvas drawer).
- Simple top bar with the application title.
- Left sidebar with groups and submenus, one entry per pattern (`src/data/patterns.ts` is the single source of
  truth driving both the sidebar and the routes).
- Light and dark themes. A top-bar toggle sets `data-theme` on `<html>` and remembers the choice; until then it follows
  the system setting. New styles should use the `dark:` variant or the `.sim` custom properties, not `prefers-color-scheme`.
- No footer. Denny's name lives in the **top bar**, right-aligned, as a link to his LinkedIn profile
  (`linkedin.com/in/dvriesman`) — this app doubles as a self-promotion/portfolio piece, not just a teaching tool, so
  his identity should be visible without scrolling. On narrow screens the link collapses to just the icon so it
  doesn't crowd the title; it expands back to the full name from the `sm` breakpoint up.
- Public app — scenario content must be generic/de-personalized. No real company names, internal codenames, or
  personal interview-prep framing; invented or generic names only (e.g. "the decision service", "the ledger
  service", "the lending platform"). This applies even when a reference example the user shares to copy the style
  from is itself personalized — match its mechanics and depth, strip the branding.

## The bar for a pattern page
**Step-Up Authentication** (`src/pages/StepUpPattern.tsx`, `StepUpLab.tsx`, `stepUpSim.ts`) is the best reference for a
new page, followed by OAuth + PKCE and Sessions vs JWTs. Outbox and Idempotency Keys set the original debugger bar, but
they don't have the newer page shape below yet. Every new pattern page should hit this bar, not a simplified version of it.

### Page shape: teach one concept at a time
Denny found rigorous pages hard to enter when the failure simulation came first or two decisions were mixed together.
So a page goes from simple to hard, and the hardest part comes last:

1. **Header:** a plain question the pattern answers, and links to each part.
2. **Part 1, a simple lab with nothing failing:** explain the mechanism from scratch, as if the reader has never seen it
   (what a hash is, what `% N` does, what a signature is). Use tabs, with each tab fixing what the previous one leaves open,
   and a stepper. Add one hands-on widget using real computation where possible: a real HS256 token to tamper with,
   real SHA-256 for PKCE, or real response headers. End with a one-sentence idea and a comparison table.
3. **Part 2, when is it worth it?** Concrete cases with a real finance example, including cases where the answer is "no" or
   "use something else". Add a table for deciding, and myths worth dropping.
4. **Part 3, the debugger:** one fixed story through every mode, as specified below.
5. **"What you just debugged":** one card per mode, then "each fix moves the responsibility somewhere".
6. **A named real product, where it helps** (e.g. Keycloak), and **"How do you build this for real?"** Denny asks how things
   are really implemented, so always include this: real code shape, production pitfalls, and what the real systems do.
7. **Glossary, "Say it in the interview", and a footer** listing what the simulation simplifies, and the sources.

Don't put two independent decisions in front of the reader at once. On Sharding, placement and live migration were
confusing together, so they became separate parts.

### The debugger
A pattern page's debugger is a **workbench**, not a slideshow:

1. **Competing approaches, not just one — and go all the way to the actual best answer.** Where the pattern exists
   to fix a naive approach, show the naive approach(es) too, as switchable modes (e.g. "publish after commit" /
   "publish before commit" / "transactional outbox"). The failure mode of the naive approach *is* the motivation for
   the pattern — don't skip straight to the fix. There is no fixed number of modes: if the "textbook" fix (e.g.
   atomic reserve via a unique constraint) still has a real remaining gap, add another mode that closes it (e.g.
   propagating the idempotency key to the downstream API too) rather than presenting a known-incomplete fix as the
   final answer. This includes going past a standard when it leaves a gap: PKCE doesn't prove which app is asking, so
   OAuth adds a verified redirect, and RFC 9470 doesn't bind an approval to a payment, so Step-Up adds that.
   Show that a naive "fix" can fail too, such as a secret shipped in a public app, or a prompt only on the screen.
   Don't force a single winner when the answer depends on the system: Sessions vs JWTs has no "best" mode, and the
   shared store gets a good verdict despite a broken check, on purpose.
   **Keep the code shape as parallel as possible across modes.** When mode N+1 builds on mode N's mechanism (rather
   than replacing it), reuse the exact same line/variable/call where the mechanism is unchanged, so the only visible
   diff between tabs is the thing that actually changed. Don't let an unrelated simplification (e.g. removing a
   confusing variable) accidentally also restructure the function, drop a step the next mode still relies on
   conceptually, or rename a call for no reason — a learner should be able to flip between tabs and see one
   meaningful difference at a time, not rediff the whole function.
2. **Real pseudocode, per actor/service, with line numbers.** Each participating process (service, relay, consumer,
   etc.) gets its own code pane showing the actual operations in order.
3. **Breakpoints the learner chooses, not a canned toggle.** Every meaningful line gets a clickable dot in the
   gutter. Clicking it says "the process dies right here" and the simulation rebuilds around that crash point. The
   learner should be able to explore failure points the page author didn't explicitly anticipate.
4. **A timeline scrubber** of every step (color-coded per actor, crash steps visually distinct), plus step/back/
   reset/run(auto-play) controls and a position counter. Clicking any step jumps straight to it.
5. **A variables panel showing this call's local variables**, revealed progressively as each is declared (nothing
   shown until its `val x = ...` line has actually executed), reset fresh on every new attempt/retry. This is what
   makes a line like `val cached = db.findDone(...)` legible — the learner can watch `cached` actually be `null` or
   a real value, not just infer it from prose. Store this on the `Step` itself (e.g. `locals: Record<string,
   string>`, plus an `attempt` counter) rather than deriving it after the fact from the log.
6. **Live state panels that mirror the real systems involved** — DB tables, message queues/logs, caches — updating
   as you step, with visual states for pending/uncommitted, sent, and duplicate rows/messages. A table/row must only
   appear once it actually exists (no row showing "status: none" — if nothing has been inserted yet, show "no rows"
   instead, exactly like an empty Postgres table would).
7. **An invariants panel.** The properties the pattern is supposed to guarantee (no lost events, no duplicates,
   no double-spend, etc.) are shown as live checks (holds / broken / pending-until-run-finishes), not just asserted
   in prose.
8. **A narrative panel** in plain language explaining what the highlighted line does, and why — written for someone
   learning the mechanism, not just logging state deltas. Every step needs text: never an empty narrative.
9. **A console log** of every actor action, for a lower-level trace alongside the narrative. Show readable actor names,
   never internal ids such as `svc`.
10. **Curated "experiments to run"** — preset buttons that jump straight to the 4-6 most instructive failure
    scenarios for this pattern (the ones worth remembering), on top of free-form breakpoint exploration.
11. **Below the simulation:** a short conceptual write-up — the problem it solves, the fix, the price/trade-off you
    pay for the fix — plus, where relevant, a comparison table of implementation choices, a glossary of terms used
    on the page, and a "say it in the interview" callout that models how to talk about the pattern out loud.
12. **Visual bar:** a distinct type system (display font for headings, body font, mono font for code/labels/tags),
    full light + dark theming via CSS custom properties, and consistent color-coding per actor across the code
    panes, state panels, console, and timeline.

If a pattern's mechanics don't naturally support one of the above (e.g. no "competing naive approach" exists), it's
fine to omit that piece — but don't omit pieces just to save effort.

**The highlighted line is about to run, as in a real debugger.** The simulations store each step's state after its line
has run, so pages must not read `step.s` or `step.locals` directly: use `debuggerView()` from `src/pages/debuggerView.ts`,
which shows the state from before the highlighted line. Use `useFollowExecution()`, the `sim-debug` and `sim-debug-head`
classes, and `sim-vars` on the Variables panel, so that stepping never makes the reader scroll. The Step button, the
current line, the variables and what just changed must all stay on screen on desktop. Use `sim-code wrap` so code lines wrap.
Denny raised this after having to scroll up and down on every step, and after seeing values change while their line was
still highlighted.

**Every line that mutates state must actually mutate it.** When a code line's text implies a state change (an
`insert`, `update`, assignment), its `push()`/step call must carry the effect function that performs it — don't let
the pane highlight a line while the state panel or variables panel silently fails to reflect what that line claims
to do. This is the single most common bug class across these pages so far; double-check it before shipping.

**Both outcomes of a branch need a step.** If a conditional line (`if (x) return ...`) only pushes a step/highlight
on one outcome (e.g. only when the condition is true), stepping through the common path will silently skip that
line entirely while the rare path highlights it — an inconsistency a learner will notice immediately. Always push a
step for the line when it's reached, regardless of which way the branch goes; vary the title/text, not whether a
step happens at all.

**Don't reuse the same word for two different concepts.** A per-attempt local variable (e.g. `claimed` meaning "did
*this* call just win the insert") and a persisted status value (e.g. a row's `status: 'claimed'` meaning "someone,
possibly a different attempt, is holding this") are different things with different lifetimes — give them visibly
different names (`pending` vs. a local `claimed` boolean, say), even though it's tempting to use the same word
because they're related. Seeing `status: claimed` next to narrative about an attempt that *didn't* claim anything
reads as a contradiction, not a subtlety.

**Delegating a responsibility moves it, it doesn't eliminate it.** If a mode's fix works by trusting a downstream
system to do the hard part (e.g. propagating an idempotency key so the payment processor does its own atomic
claim), say so explicitly on the page — name the mechanism the downstream system must implement, and what happens
if it doesn't. Never let a simplification read as "and now this concern just isn't a concern anymore."

**A crash shouldn't change a security or correctness outcome by accident.** After a crash, the run must recover and still
reach a meaningful end. If a crash does change the result, that has to be the lesson, and the verdict has to say so.

**A panel has to teach something.** If a panel shows the same value on every step, replace or remove it. Verdicts and
labels must match what's on screen: no green "works" beside a broken check, unless the page explains why that's right.

### Writing the content
- **Check facts against primary sources before publishing**, because this is a public site: RFCs, official product docs and
  regulations. Say which RFC a page relies on. Never state a product default from memory: if the docs don't confirm it,
  describe it in general terms and tell readers to check their own settings.
- **Don't overclaim.** "The parts of the guide checked for this page don't mention X" is fine; "X isn't supported" needs
  proof. Write the page in the third person: never "I" or "I checked".
- **Denny's experience is a source.** When he describes a real strategy (Keycloak sessions alongside JWTs, a per-user
  forced-logout timestamp in Redis, checks at Istio, OPA or the backend), add it to the page, and add the failure details he
  may not have mentioned, such as ordering, key expiry and clock differences. Never mention his employers or that he
  worked with it. Naming a public product such as Keycloak is fine when he asks for it.
- **Answer a question before changing anything** when he asks one, or says not to write yet. He often asks how something
  really works, and then asks for it on the page.
- **Match the plain, direct style of the newer pages.** Explain terms when they first appear, and add them to the glossary.

## Case study pages
A case study is the whiteboard part of a system design interview: the interviewer states a problem, and you draw a design
that fits the requirements. It is **not** a pattern page, so none of the debugger workbench rules above apply.

- **Only the design and the controls.** A one- or two-sentence problem statement, the requirement controls, and the
  diagram. No advice on running the interview, no debugger, no deep-dive essays and no mock questions.
- **Functional requirements are checkboxes.** Hypothetical features, such as a mobile app, a marketplace or in-store
  payments, that add or remove the components they need.
- **Non-functional requirements are controls.** Volume, throughput, latency, availability, durability, security, UX,
  freshness, isolation and maintainability. Each one changes the diagram in a visible way, by adding, removing or
  relabelling components.
- **Examples go from simple to complex.** Preset buttons, starting from the smallest reasonable design.
- **Build each one on `src/pages/CaseStudyPage.tsx`**: a page passes its problem, requirement controls, examples, a
  `design` function, metrics and a glossary, and the template draws the rest.
- **The diagram uses one shape per kind of component**, from `src/pages/caseStudyDiagram.tsx`: frontends and clients,
  gateways and CDNs, services, databases, caches, queues, event streams, object storage, security components and external
  systems, plus dashed zones such as a private network or a regulated zone. Solid lines are synchronous calls, and dashed
  lines are asynchronous.
- **Every box says what it's used for in this system**, not what it generically is: "merchant callbacks, reminder jobs",
  not "jobs, retries". Every line has a `purpose` saying what flows along it.
- **Clicking a box** fades everything it doesn't talk to, and shows one sentence on which requirement put it there, one on
  its trade-off, and a list of its connections with their purpose.
- **Sequence diagrams** are added when the case study is about flows between parties, such as integrations and
  authentication: one per channel, built from the chosen requirements with `src/pages/sequenceDiagram.tsx`, so that
  changing a control (API key or OAuth, SMS code or passkey) changes the steps. Keep each step label short.
- **Keep the scope tight.** Leave out options that add boxes without teaching anything for the scope, such as partner
  platforms or a regulated mode on an integration case study.
- **A glossary** sits under the diagram, listing only the terms on screen (WAF, CDN, read replica and so on) plus a few
  general ones such as synchronous and asynchronous. Write each meaning for someone who has never met the term.
- **A small row of computed numbers** is fine, such as peak throughput, storage growth, allowed downtime, and whether the
  latency and availability targets are met.
- **Layout:** nodes sit on a grid of columns and rows, and unused rows collapse. Lines are routed automatically through
  the gaps. Before shipping, test every combination of requirements in a script: every line must route without passing
  behind a box, and no two boxes may overlap. Then read screenshots of the examples.
- **Keep it generic:** never name or describe a real company. Anything about a specific interview goes in a private note
  outside the repo.
- Thresholds and timings are rules of thumb, so the footer says so.

## Content roadmap
First content group: **Finance: High-Throughput & Low-Latency**, because idempotency and double-spend prevention are
first-class concerns there and make for concrete, high-stakes examples.

- [x] Transactional Outbox — done, reference implementation
- [x] Idempotency Keys — done
- [ ] Optimistic Concurrency Control (version/CAS checks)
- [ ] Distributed Locking
- [ ] Saga Pattern (orchestration vs choreography)
- [x] Two-Phase Commit vs Eventual Consistency
- [ ] Event Sourcing + Append-Only Ledger
- [ ] CQRS
- [ ] Exactly-Once Processing via Deduplication
- [ ] Write-Ahead Log (WAL)
- [ ] Change Data Capture (CDC)
- [ ] Rate Limiting (token bucket / sliding window)
- [ ] Circuit Breaker + Bulkhead
- [ ] Backpressure in Queues
- [x] Sharding/Partitioning
- [ ] Consistent Hashing
- [ ] Caching for Low-Latency Reads
- [ ] Reconciliation & Settlement Batch Jobs

Second content group: **Security: Authentication & Authorization**, because the failures are concrete and work well in
the debugger format (a stolen token that keeps working, a revoked permission still cached, one tenant reading another's
data). Authentication first, since authorization depends on knowing who is calling.

Authentication (who are you?):

- [x] Sessions vs JWTs (server-side state vs self-contained tokens, and revocation)
- [ ] Refresh Token Rotation + Reuse Detection
- [x] OAuth 2.0 Authorization Code + PKCE
- [ ] OpenID Connect + Single Sign-On
- [ ] Multi-Factor Authentication (a second factor at login)
- [x] Step-Up Authentication (more proof mid-session, for high-risk actions such as withdrawals)
- [ ] Credential Storage + Credential Stuffing Defense
- [ ] API Keys + Signed Requests (HMAC, replay protection)
- [ ] Service-to-Service Identity (mTLS, workload identity)

Authorization (what are you allowed to do?):

- [ ] RBAC vs ABAC vs ReBAC
- [ ] Policy Enforcement + Decision Points (centralized vs embedded)
- [ ] Permission Caching + Revocation Propagation
- [ ] Multi-Tenant Isolation (row-level security)
- [ ] Delegated Access (scopes, token exchange, acting on behalf of a user)
- [ ] Maker-Checker Approvals (four-eyes principle)

Third content group: **Case Studies**. These follow different rules from pattern pages: see "Case study pages" below.

- [x] Pay-Later Checkout
- [x] Pay-Later: Merchant Integration and Auth (web checkout, WhatsApp and payment links)

Each pattern links to 2-3 related patterns so the sidebar order doubles as a suggested learning path (e.g. Outbox →
Idempotency Keys → Exactly-Once Dedup).

## Working process
Build and ship one pattern at a time. After each one, deploy to Vercel production and wait for feedback before
starting the next — don't batch multiple new patterns into one review cycle.

Expect, and budget time for, several rounds of fix-and-redeploy on a single pattern before it's actually done — "the
sidebar has a link to it" is not the same bar as "it's correct." On Idempotency Keys specifically, Denny found real
bugs in every single pass by actually clicking through the live simulation (premature/contradictory state before
the run starts, a code line highlighted but not wired to any state change, a branch that only got a step on one
outcome, a confusing variable that turned out not to belong in the lesson at all, and a later mode that silently
dropped a mechanism an earlier mode established). None of these were caught by `tsc` or `oxlint` — they're
behavioral bugs, not type errors. Before calling a pattern page done:
1. `npm run build` and `npm run lint` (catches real but narrow classes of error). The `set-state-in-effect` warnings on the
   auto-play effect are known.
2. Brute-force the simulation with a `npx tsx` script: **every mode × every breakable line**. Assert one crash per run,
   no check left pending, no line id missing from the code panes, and outcomes unchanged by crashes unless that's the lesson.
   Print every experiment's checks and verdict, plus a full per-step trace for the main modes, and read them. Also list
   lines that are never highlighted.
3. Drive the page in headless Chrome: `playwright-core` with `channel: 'chrome'`, kept in the session scratchpad, not the
   repo. Click through every experiment and gutter dot, and step through at desktop, laptop and phone sizes. Check for page
   errors, sideways overflow and whether the current line stays visible.
4. **Read the screenshots**, in light, dark and mobile. Most of the remaining bugs were found this way: clipped code,
   wrong labels, a panel that never changes, a misleading verdict. When a test fails oddly, check the test too: one
   "sideways scroll" failure on every step turned out to be a bug in the test.
5. Deploy, then check the live site as well, not only the local build.
6. Still expect Denny to find something a script can't catch (visual inconsistency, a confusing variable, a narrative
   that doesn't match what's on screen). That's the actual final QA pass for this project, not a sign something was done
   carelessly. `test-as-learner` runs only when he invokes it.

When reporting back, say what was and wasn't tested, flag what's worth his attention, and don't claim a check you didn't run.

### Deploying
Deploy with the CLI, and don't wait on it, because a waiting deploy has hung for many minutes on this small project:

```sh
VERCEL_ORG_ID=... VERCEL_PROJECT_ID=... npx --yes vercel@latest deploy --prod --yes --no-wait </dev/null
```

Then poll the production URL until its JS bundle contains a string that's new in this change (usually live in about 20
seconds). The app's address is https://system-design-nine-flax.vercel.app. Deploys so far have been made by hand from the working
tree, so a merge may not deploy anything: deploy after merging, and confirm it. This is a single-page app, so a tab that's
already open keeps the old code until it's reloaded, even when navigating between pages. If Denny sees the old version, first
compare what production serves with what he's looking at, and ask him to do a full reload.

### Git
- Commit, push, open a PR or merge only when Denny asks. He usually asks once a batch of work looks right, so production
  can be ahead of GitHub in between, and that's worth mentioning.
- Never work on `main`: create a branch first. Merge PRs with a regular merge commit, then sync local `main`.
- The repo has no CI, so a green PR means nothing has been run. Run the build yourself before merging.
- Don't delete merged branches unless he asks.

### Technical notes
- A sticky child of a CSS grid is confined to its own row, so the debugger's columns use flex.
- Grid tracks grow to fit `nowrap` content, which can make the whole page overflow sideways on phones. Use
  `minmax(0, 1fr)`, and `min-width: 0` on flex children.
- The theme is set by an inline script in `index.html` before first paint. Don't reintroduce `prefers-color-scheme` in CSS.
- `sessionsCrypto.ts` has real SHA-256, HMAC and base64url for the labs. Check it against Node's crypto and published test
  vectors. It's for teaching only, and the pages tell readers to use vetted libraries.
- Simulations label values with short IDs (`tok-1`, `hash(ver-1)`). Say so in the page footer.

## Future ideas (not scheduled)
Raised by Denny, explicitly deferred — don't start on these unless he brings them up again:

- **Split the site into two top-level sections**: "Software Architecture" (the current pattern catalog) and
  "People Management" (he wants to use this same site to teach/talk about people management topics too). Likely
  shape if/when this happens: a top-bar switcher swapping the sidebar + home page between two separate catalogs,
  under separate route namespaces (e.g. `/architecture/...` vs `/people/...`). Important: the "debugger workbench"
  page format in this file is built for system mechanics (code, crashes, state) and does **not** fit people-
  management topics (1:1s, feedback, conflict resolution) — those would need a different interactive template,
  most likely a scenario/decision-tree format ("choose your response, see the outcome"), designed from scratch
  rather than adapted from `sim.css`.
