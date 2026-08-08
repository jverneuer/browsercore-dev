# memory-conventions.md — Agent Behavior Rules for @browsercore Memory System

These rules govern how ALL agents in this repository interact with the memory system.
They are binding.

## Pre-Task Protocol (MANDATORY)

Before starting ANY new task:

1. **Check open questions:** Run `npx tsx scripts/memory-query.ts questions`. If any exist,
   surface them to the user FIRST.
   - Format: "There are N open memory questions: [titles]. Answer now or proceed?"

2. **Search relevant facts:** Run `npx tsx scripts/memory-query.ts search "<task keywords>"`.
   - Facts with `confidence >= 0.8` → include directly in reasoning.
   - Facts with `confidence 0.7–0.79` → include with "per [source]" qualifier.
   - Facts with `confidence < 0.7` → do NOT include.

3. **Stability check:** If working in an area tagged `experimental`, warn the user.

## During Session Protocol

### When you encounter a fact with unclear scope, stability, or confidence:

**DO NOT GUESS.** Instead:
1. Write a question file to `memory/questions/YYYY-MM-DD-NNN.md`
2. Continue working using the `default-behavior` you specified
3. At session end, report: "N new questions raised — see memory/questions/"

### When you derive a fact from conversation or code:

1. Check if a fact already exists: `npx tsx scripts/memory-query.ts search "<topic>"`
2. If new: insert into the memory DB
3. If existing but contradicts: write a question file

### When you find a contradiction between source code and stored facts:

1. Write a question file documenting the conflict
2. Cite: (a) the stored fact, (b) the source code location, (c) which is likely correct
3. Source code beats docs for deployed/runtime facts

## Fact Injection Rules

| Confidence | How to use |
|---|---|
| 0.9–1.0 (verbatim) | State as ground truth. "Per platform invariant..." |
| 0.7–0.89 (strong) | State with source. "Per keySchedule.ts:280..." |
| 0.5–0.79 (weak) | Flag as uncertain |
| <0.5 | Do not state — write a question |

## Supersedure Protocol

When a fact is replaced:
1. New fact gets `supersedes: <old-fact-id>` in frontmatter
2. Old fact gets `superseded_by` link and stability → `experimental`
3. Update `memory/index.md`
4. NEVER delete old facts — lineage matters

## Emergency Override

If the user explicitly says "skip memory check" or "just do it":
- Proceed without the pre-task check
- Still write question files for anything unclear
- Log: "Proceeding per override — N questions deferred."
