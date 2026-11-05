---
name: test-as-learner
description: Role-play a junior engineer meeting a pattern page for the first time, to surface gaps between what the page intends to teach and what it actually lands. Outputs OK or a concrete punch list.
disable-model-invocation: true
argument-hint: [pattern-slug]
arguments: [pattern]
---

## Purpose

This project's own QA process (see CLAUDE.md, "Working process") relies on Denny actually clicking
through a page to catch bugs that `tsc`/`oxlint`/the sim trace can't — confusing variables,
narrative that doesn't match on-screen state, a fix that's presented before its motivation. This
skill is a stand-in for that pass when no human walkthrough is available yet: it has a fresh agent
genuinely try to learn the pattern from the page, with no answer key, then grades the resulting
confusion against what the page actually contains.

The target audience of the *page* is senior engineers (per CLAUDE.md). The learner persona below is
deliberately junior — if a junior engineer with no prior exposure to the pattern can follow it
without unexplained leaps, a senior engineer certainly can. Junior is the harder bar, not the real
audience.

## Instructions

1. **Resolve the target.** If `$pattern` is given, match it against the `slug` fields in
   `src/data/patterns.ts` to find the pattern's route segment, then locate its page component
   (`src/pages/<Name>Pattern.tsx`) and its sim module (`src/pages/<name>Sim.ts`). If `$pattern` is
   empty, pick whichever pattern page's files are most recently modified (`ls -lt src/pages`) and
   say which one you picked before continuing.

2. **Gather what the learner would actually see.** Read the full page component and its sim
   module end to end. Note every mode/tab and its order, every narrative/title string shown at
   each step, the glossary, the comparison table, and the "say it in the interview" section, and
   the full `EXPERIMENTS` list. Do not read CLAUDE.md's pattern-page checklist yet — that's for
   your own grading in step 5, not for the learner.

3. **Establish ground truth by actually running the sim**, the same way CLAUDE.md's own
   verification step does: for every mode, and for every entry in `DEFAULT_CRASH` and
   `EXPERIMENTS`, execute the sim's `build()` (e.g.
   `npx tsx -e "import { build, verdictText } from './src/pages/<x>Sim.ts'; ..."`) and capture the
   final state, the invariant results, and the verdict text. You need this before you can tell
   whether the page's prose matches what the simulation actually does.

4. **Spawn a fresh `general-purpose` agent to play the learner.** It must not have read CLAUDE.md
   or this skill. Brief it with only:
   - Persona: a junior engineer, ~1-2 years of professional experience, solid on basic
     backend/database concepts, with *no* prior exposure to this specific pattern.
   - The raw contents of the page component and sim file (paste them in, or point it at the exact
     paths).
   - Task: read through it top to bottom as if encountering the lesson for the first time —
     working through every mode in order, reading every narrative string, stepping through the
     default crash point and at least two entries from `EXPERIMENTS` — and narrate, in its own
     words, in real time:
     a. what it currently believes the pattern does and why, after each mode;
     b. every term it hit before it was defined, or that was never defined;
     c. every logical jump it couldn't follow ("why does this fix follow from that failure?");
     d. any moment the narrative, a state/variables panel, or an invariant verdict seemed to
        contradict each other or contradict what it had just read;
     e. whether, once finished, it could explain the pattern and its trade-off out loud,
        unprompted.
   - Tone: a generous but honest learner. Flag real confusion, not a nitpick it could resolve by
     rereading the same sentence once.

5. **Grade the transcript yourself.** Now bring in what you know: CLAUDE.md's "bar for a pattern
   page" (the 12 required elements, the explicit bug classes it calls out — a code line that
   doesn't actually mutate the state/variables it claims to, a branch that only gets a step on one
   outcome, two different concepts sharing one name), and the ground truth from step 3. For every
   point of confusion the learner-agent raised, decide:
   - **Real gap** — the page is missing an explanation, has a narrative/state mismatch, defines a
     term too late, or skips a step a first-time reader needs to follow the logic.
   - **Not a gap** — the learner missed something that *is* already on the page (quote it), or
     wanted depth the page correctly defers to a linked pattern.
   Discard every "not a gap" item.

6. **Report.**
   - If nothing survived step 5, reply with exactly `OK — no learning gaps found`, plus one
     sentence naming which modes and experiments you actually ran.
   - Otherwise, reply with a punch list ranked most-confusing-first. Each item: *where* (mode /
     step / section), *what a junior engineer would actually get stuck on*, and *the smallest fix*
     (a missing sentence, a reordered explanation, a glossary entry, a narrative correction — not
     a rewrite). Don't restate what already works.
