---
name: delegate
description: Cost-saving orchestration mode for KakiNotes. Opus 5 stays the planner and reviewer, and hands well-scoped subtasks to cheaper subagents (Haiku 4.5 for mechanical work, Sonnet 5 for ordinary coding). Use whenever the user runs /delegate, or says things like "delegate this", "use cheaper models", "save cost", "farm this out", "use haiku/sonnet for the small stuff", "orchestrate", or gives a multi-part task and asks to keep Opus usage down.
argument-hint: "[task to do in delegate mode]"
model: opus
user-invocable: true
---

# Delegate mode — KakiNotes specifics

**Read `~/.claude/skills/delegate/SKILL.md` first.** That file holds the method: when
delegating pays off, the Haiku/Sonnet/Opus routing table, how to write a brief a cold subagent
can act on, and how to review what comes back. This file only fills in the KakiNotes facts that
method needs, so the two stay in sync instead of drifting apart.

**Task:** $ARGUMENTS

## Repo facts for the brief template

- **Repo path:** `/Users/user/Desktop/KakiNotes`
- **Stack:** Next.js (App Router, Server Components by default) + Supabase, TypeScript, Tailwind,
  next-intl for i18n. npm, Node 24.
- **Project rules file:** `CLAUDE.md` at the repo root. Tell a subagent to read it *only* when the
  task touches auth, RLS, storage, story publication state, or user-facing copy — otherwise say
  "skip CLAUDE.md" so it doesn't burn tokens on rules that don't apply.
- **Status doc:** `docs/implementation-status.md` — what is actually built vs only planned. Worth
  handing to an agent that needs to know whether a feature exists yet.
- **Docker is unavailable here,** so there is no local Supabase stack. `.env.local` points at the
  hosted development project. Never tell a subagent to run `npm run supabase:start`.

## Verification

The one gate is `npm run verify` (format:check → lint → typecheck → test → build). Give it to a
`haiku` agent with a 600000 ms timeout and ask for only the failing stage plus `file:line — message`,
or the single word `PASS`. Keeping that log out of the orchestrator's context is most of the saving.

`npm run verify:full` adds Playwright and reuses verify's build — use it only when a critical
user flow changed.

## What never gets delegated here

Engineering Rules 1–3 and 10–14 in `CLAUDE.md` are the security spine of this product, and they
need whole-picture judgement that a cold subagent doesn't have. Keep anything touching these
yourself:

- the service-role key, or any code path that could reach the browser (Rule 1)
- trusting client-supplied IDs, roles, ownership, or publication state (Rule 2)
- RLS and storage policies — writing them, reviewing them, or "fixing" a blocker by loosening
  them, which Rule 21 forbids outright (Rules 3, 21)
- which revision a public query selects, and anything that could leak draft, private, rejected,
  or archived content into a public surface (Rules 10–14)
- seed data and anything that looks like real contributor content (Rules 15, 22)

A subagent may *read* these areas and report. It should not write them.

## House style for the final report

`CLAUDE.md` asks for plain, simple language in every reply — short sentences, no jargon, the
`/bro` register. That applies to your wrap-up too: say what you did, what each subagent did and
on which model, and what you rejected or redid.
