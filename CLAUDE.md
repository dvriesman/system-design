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
- **Tailwind** for the app shell (top bar, sidebar, footer). Pattern pages share one scoped "debugger workbench"
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
- No footer. Denny's name lives in the **top bar**, right-aligned, as a link to his LinkedIn profile
  (`linkedin.com/in/dvriesman`) — this app doubles as a self-promotion/portfolio piece, not just a teaching tool, so
  his identity should be visible without scrolling. On narrow screens the link collapses to just the icon so it
  doesn't crowd the title; it expands back to the full name from the `sm` breakpoint up.
- Public app — scenario content must be generic/de-personalized. No real company names, internal codenames, or
  personal interview-prep framing; invented or generic names only (e.g. "the decision service", "the ledger
  service", "the lending platform"). This applies even when a reference example the user shares to copy the style
  from is itself personalized — match its mechanics and depth, strip the branding.

## The bar for a pattern page
The **Transactional Outbox** page (`src/pages/OutboxPattern.tsx`) and **Idempotency Keys** page
(`src/pages/IdempotencyPattern.tsx`) are the reference implementations. Every new pattern page should hit this bar,
not a simplified version of it. Concretely, a pattern page is a **debugger workbench**, not a slideshow:

1. **Competing approaches, not just one — and go all the way to the actual best answer.** Where the pattern exists
   to fix a naive approach, show the naive approach(es) too, as switchable modes (e.g. "publish after commit" /
   "publish before commit" / "transactional outbox"). The failure mode of the naive approach *is* the motivation for
   the pattern — don't skip straight to the fix. There is no fixed number of modes: if the "textbook" fix (e.g.
   atomic reserve via a unique constraint) still has a real remaining gap, add another mode that closes it (e.g.
   propagating the idempotency key to the downstream API too) rather than presenting a known-incomplete fix as the
   final answer.
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
8. **A narrative panel** in plain language explaining what just happened at the current step, and why — written for
   someone learning the mechanism, not just logging state deltas.
9. **A console log** of every actor action, for a lower-level trace alongside the narrative.
10. **Curated "experiments to run"** — preset buttons that jump straight to the 4-6 most instructive failure
    scenarios for this pattern (the ones worth remembering), on top of free-form breakpoint exploration.
11. **Below the simulation:** a short conceptual write-up — the problem it solves, the fix, the price/trade-off you
    pay for the fix — plus, where relevant, a comparison table of implementation choices, a glossary of terms used
    on the page, and a "say it in the interview" callout that models how to talk about the pattern out loud.
12. **Visual bar:** a distinct type system (display font for headings, body font, mono font for code/labels/tags),
    full light + dark theming via CSS custom properties, and consistent color-coding per actor across the code
    panes, state panels, console, and timeline.

If a pattern's mechanics don't naturally support one of the above (e.g. no "competing naive approach" exists), it's
fine to omit that piece — but don't omit pieces just to save effort. The Outbox/Idempotency pages are the floor, not
the ceiling.

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
1. `npm run build` and `npm run lint` (catches real but narrow classes of error).
2. Trace the simulation logic directly, e.g. `npx tsx -e "import { build, verdictText } from './src/pages/<x>Sim.ts'; ..."`,
   printing the final state for every `DEFAULT_CRASH` and every entry in `EXPERIMENTS` (and ideally the full
   per-step trace for at least the default one) — confirm charge/duplicate counts, `resolved`, and `verdict` text
   are what the page's prose claims they are.
3. Still expect Denny to find something a script can't catch (visual inconsistency, a confusing variable, a
   narrative that doesn't match what's on screen) — that's the actual final QA pass for this project, not a sign
   something was done carelessly. No browser access has been available in this session, so step 2 is the only
   verification possible before his pass.

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
