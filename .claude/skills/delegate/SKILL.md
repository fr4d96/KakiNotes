---
name: delegate
description: Cost-saving orchestration mode for KakiNotes. Opus 5 stays the planner and reviewer, and hands well-scoped subtasks to cheaper subagents (Haiku 4.5 for mechanical work, Sonnet 5 for ordinary coding). Use whenever the user runs /delegate, or says things like "delegate this", "use cheaper models", "save cost", "farm this out", "use haiku/sonnet for the small stuff", "orchestrate", or gives a multi-part task and asks to keep Opus usage down.
argument-hint: "[task to do in delegate mode]"
model: opus
user-invocable: true
---

# Delegate mode

You are the **orchestrator**. Your job is to think, plan, split, review, and report.
Cheaper subagents do the typing. The user invoking this skill *is* their request to spawn
subagents, so the usual "don't spawn agents unless asked" rule is satisfied.

## Step 0 — check you are Opus

Your system prompt says which model powers this session. If it is not Opus 5, say so in one
line and ask the user to pick **Opus 5** in the app's model menu before continuing — a session
cannot change its own model. Then carry on with the task on the current model if they say so.

## Why this saves money (and where it doesn't)

Every subagent starts cold: it has none of your context and must re-read whatever it needs.
So delegation pays off only when the subtask is **cheap to describe and expensive to do**:

- **Big output you don't need to read** — test runs, builds, lint logs, grepping the codebase.
  Keeping that out of Opus's context is the single biggest win.
- **Mechanical edits** where the instructions fit in a paragraph and the result is easy to check.
- **Independent chunks** that can run in parallel.

Delegation *loses* money when the brief needs more words than the change itself, when the task
needs judgement about product/security rules, or when you'd have to read every file anyway to
review it. In those cases just do it yourself. Never delegate to look busy.

## Tiers

| Tier | `model` | Give it | Examples |
|---|---|---|---|
| Cheap | `haiku` | Mechanical, well-specified, low-judgement | run `npm run verify` and report only failures; rename/move; apply a diff you spell out; grep/inventory a folder; add a translation key across files; write a Vitest case from a clear spec |
| Mid | `sonnet` | Ordinary coding inside clear boundaries | implement a small component/route/server action from your spec; fix a failing test whose cause you already found; write tests for an existing function; update docs to match a change |
| Keep | you (Opus) | Anything needing judgement | design decisions; anything touching RLS, auth, storage policies, or publication state (CLAUDE.md rules 1–3, 10–14); reviewing subagent output; talking to the user |

Use the `Explore` agent type (with `model: haiku`) for read-only searches; `general-purpose`
for edits. Start with the cheaper tier; move up only if the brief keeps growing.

## Workflow

1. **Understand first.** Read the task and skim the key files yourself (small reads are cheaper
   than a bad brief). Decide what needs judgement and what is mechanical.
2. **Plan the split.** Partition by *files*, not by feature, so parallel subagents never edit the
   same file. Two agents on one file means a merge mess. Tell the user the plan in a few lines:
   what you'll do yourself, what goes to Haiku, what goes to Sonnet.
3. **Write each brief** using the template below. Spawn independent ones in the same turn,
   `run_in_background: true`. Don't use `isolation: worktree` — changes must land in this tree.
4. **Review, don't trust.** When a subagent reports back, run `git diff` on the files it touched
   and read the change yourself. Subagents oversell. Check specifically against CLAUDE.md rules
   (no service-role key in client code, Zod at trust boundaries, no `dangerouslySetInnerHTML`,
   mobile-first, plain-language copy).
5. **Verify cheaply.** Send `npm run verify` to a `haiku` agent with the instruction to return
   *only* failing output (file, line, message) — not the full log. Fix small failures via a
   subagent; take the tricky ones yourself.
6. **Report** in plain language (the `/bro` style CLAUDE.md asks for): what was done, what each
   subagent did and on which model, anything you rejected or redid, and what's still open.

## Brief template

A subagent knows nothing about this conversation. Every brief must stand alone:

```
Repo: /Users/user/Desktop/KakiNotes (Next.js + Supabase; read CLAUDE.md only if the task
touches auth, RLS, storage, or story publication — otherwise skip it to save tokens).

Task: <one paragraph, concrete>
Files you may edit: <exact paths>          Files you must NOT touch: <paths, if relevant>
Reference: <a path to an existing example that shows the pattern to copy>
Constraints: <the 2–4 CLAUDE.md rules that actually apply, quoted briefly>
Do not: run git commit/push, install dependencies, or change files outside the list.

Return: a ≤10-line summary — files changed, what you did, anything you were unsure about.
Do not paste file contents or full command output.
```

For verification/search agents, replace "Return" with the exact shape you want, e.g.
"Only the failing test names and their assertion messages. If everything passes, reply PASS."

## Things that go wrong

- **Subagent ignores the file list** → your `git diff` catches it; revert stray files.
- **Subagent claims done, tests fail** → that's why step 5 runs *after* every batch.
- **Brief grew to a page** → the task wasn't small; do it yourself.
- **Subagent needs a follow-up** → use `SendMessage` to the same agent (context intact) instead
  of spawning a fresh one.
