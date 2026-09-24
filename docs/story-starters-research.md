# Story starters — research and a proposed prompt library

_Written 2026-09-16. Follows up item 7 of
[editor-competitive-research.md](editor-competitive-research.md) ("Writing prompts / outline
starter — needs a product decision"). This document makes that decision concrete: what to show,
where, and the actual prompt copy. Nothing here is built yet._

## The problem, plainly

A contributor names their story, lands on the **Story** step, and sees:

- the step hint _"The writing itself"_,
- an empty editor with the placeholder _"Tell your story… or type / for headings, lists and quotes"_,
- _"aim for 150+ words"_ and a word count underneath.

That is the whole starting experience. The slash menu helps once you know **what** to write; it
does nothing for someone who doesn't. The only example anywhere is the title field's
_"Six months picking kiwifruit in Te Puke"_. There are no prompts, no outline, no sample headings
(confirmed by reading `start-new-story.tsx`, `story-edit-form.tsx` and `i18n/messages/en.json`).

Our contributors are not writers. They have a year of memories and no idea which one to start with.

## What the research says (short version)

Full source list at the end. The findings that matter for us:

1. **A blank page is the hardest possible start.** Products built for non-writers (StoryWorth,
   Day One, Reflectly) put a _question_ in front of the person before the empty box. A structured
   question-then-answer flow produced drafts needing far fewer edits than free writing in a 2026
   study (StepWrite), because each step is small and obvious.
2. **Concrete beats abstract.** StoryWorth's best questions anchor on one specific noun — _a car, a
   restaurant, your first flat_ — not a theme like "your year". "Tell me about your year" is as
   hard as the blank page; "What did your first bed in New Zealand look like?" is answerable in a
   sentence.
3. **One prompt at a time, opt-in.** Day One shows a single rotating prompt with "next"; it doesn't
   present a menu of forty. Menus move the paralysis from "what do I write" to "which do I pick".
4. **Let people write out of order.** Travel-writing guides (Nomadic Matt, Lonely Planet) tell
   first-timers to draft the scenes they remember vividly first, then arrange. Our Markdown body
   with `##` headings already supports that; the prompts should encourage it.
5. **WHV stories already have a folk template.** Across independent "my working holiday in NZ"
   blog posts the same sections recur: why NZ → visa/paperwork → arrival and first weeks → finding
   work → money and cost of living → highlights → hard parts → what I'd tell the next person. Our
   own seeded stories follow the same shape. Contributors will recognise it.
6. **Keep the tone right.** StoryCorps' reflective, interview-style questions ("How would you like
   to be remembered?") are the wrong register for "here's my year picking fruit". Warm and concrete,
   not therapeutic.

## The constraint that shapes every prompt: experience, not advice

[moderation-guidelines.md](moderation-guidelines.md) draws the line moderators enforce: a story is
published as **personal experience** ("my visa took 11 weeks and it drove me crazy waiting"), not as
**authoritative instruction** ("WHV visas always take 11 weeks, don't apply earlier"). The fix
moderators reach for is to "soften language into first-person framing". Engineering Rule 17 puts a
"personal experience, not advice" label on every public story.

A prompt is the first sentence the contributor reads before writing, so it sets the register of
everything after it. That gives us a **grammar rule** for every prompt:

| Write prompts like this                                            | Never like this                                    |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| Past tense, first/second person: _"What was your first day like?"_ | Imperative how-to: _"Explain how to get the visa"_ |
| One concrete anchor: _the flat, the boss, the first pay slip_      | A theme: _"Talk about accommodation"_              |
| Open ("what was it like", "tell about the time")                   | Yes/no ("Did you like it?")                        |
| Invites a scene or a feeling                                       | Invites a rule, a number, or a recommendation      |
| _"What surprised you about the cost of…"_                          | _"How much should people budget for…"_             |

Prompts must also steer away from what the quality checks flag: exact addresses, naming or accusing
an employer, phone numbers/emails, absolute visa claims. Notice that _"Tell me about the farm you
worked on"_ is fine; _"Name the employer and rate them"_ is not.

## What to build: three layers, all opt-in, all additive

None of this changes the Markdown content model, CodeMirror, `content_json`, or any migration for
v1. It is UI plus a data file.

### Layer 1 — "Not sure where to start?" card (the main win)

A small card sits **above the editor, only while the body is empty** (or under ~50 words). It shows
**one** question at a time:

```
Not sure where to start?
"What did the first place you slept in New Zealand look like?"
[ Write about this ]   [ Show me another ]   [ Hide ]
```

- **Write about this** inserts a `## ` heading (a short label for that prompt, e.g.
  `## My first night`) and puts the cursor on the empty line below it. The question itself is not
  inserted — the heading is the contributor's, the question was only the nudge.
- **Show me another** cycles through the library (shuffled once per session so two contributors
  don't see the same first prompt).
- **Hide** dismisses for this story; remembered in `localStorage`, nothing server-side.
- The card disappears on its own once the body passes ~150 words — the same threshold the
  `missing_trip_context` check uses — because at that point the person is writing.

Why this and not a placeholder: the placeholder vanishes on the first keystroke and can't be
cycled. Why not a sidebar: on mobile (Rule 18) there is no sidebar; a card above the editor stacks.

### Layer 2 — "Start from an outline" (for people who know their story's shape)

One action, offered in the same card (_"or start from an outline"_) and in the slash menu as
`/outline`. It inserts the folk template as headings the contributor can rename or delete:

```markdown
## Why New Zealand

## Before I left

## The first weeks

## Finding work

## Where I lived

## What it cost

## The best of it

## The hard parts

## What I'd tell myself
```

Only inserted into an **empty** body (no clobbering). Nine headings, not twenty — a story that
covers five of them is still a story. Headings are phrased as _my_ story, not as a checklist: "What
it cost", not "Budget breakdown"; "What I'd tell myself", not "Tips for applicants" (that last one
is the advice boundary again).

### Layer 3 — a nudge when someone stalls (later)

If the body has been under 150 words and untouched for ~2 minutes, quietly re-show the Layer 1 card
with a prompt from a section they haven't written yet. Not for v1; listed so the card component is
built to be re-shown, not one-shot.

### Where the copy lives

CLAUDE.md's rule that nationality/destination/work type are **data, not hard-coded strings** applies
here. Two options, pick by phase:

- **v1: a content file per locale**, `i18n/prompts/story-starters.<locale>.json`, next to the
  message bundles. Prompts need Chinese versions anyway (the contributor UI is bilingual), and a
  JSON file is reviewable in a PR by whoever owns the moderation guidelines.
- **Later: a `story_prompts` table** (`id`, `topic`, `text_en`, `text_zh_cn`, `heading_en`,
  `heading_zh_cn`, `work_type_id` nullable, `is_active`) so editors can add and retire prompts
  without a deploy, and so prompts can be filtered by the story's work type once that is known.
  Public-read, staff-write RLS. Not needed to ship v1.

Each prompt record carries: `topic` (one of the nine sections above), `question`, and the short
`heading` that "Write about this" inserts.

## The draft prompt library (v1, English)

Thirty-two prompts, grouped by the nine outline sections. Every one follows the grammar table.
These are a **draft for editorial review** — whoever owns moderation-guidelines.md should read them
against the advice boundary before they ship. Chinese versions to be written by a native speaker,
not machine-translated.

**Why New Zealand** (heading: _Why New Zealand_)

1. What was the moment you decided to actually apply — where were you, who did you tell first?
2. What did people at home say when you told them you were going?
3. What did you imagine New Zealand would be like before you went — and what turned out to be
   nothing like that?

**Before I left** (heading: _Before I left_)

4. What was the waiting like between applying and getting your visa? What did you do to pass the
   time?
5. What was the one thing you packed that you never used — and the one thing you wished you'd
   brought?
6. What was the last meal at home before you flew?

**The first weeks** (heading: _My first weeks_)

7. What did the first place you slept in New Zealand look like?
8. What was the first thing that confused you after landing?
9. Tell the story of your first week — what did a normal day look like before you had a job?
10. What was the first thing you bought, and what did it cost compared to home?

**Finding work** (heading: _Finding work_)

11. How did you find your first job? Who helped, and how long did it take?
12. What was your first day of work like — what did they get you doing, and how did your body feel
    that night?
13. What did you get wrong in the first week on the job?
14. What did the people you worked alongside look like — where were they from, what did you talk
    about?
15. What was payday like — the first time you saw the number?

**Where I lived** (heading: _Where I lived_)

16. Describe the room you stayed in longest. What could you hear at night?
17. Who did you share a kitchen with, and what did they cook?
18. What was the worst place you stayed, and why did you stay anyway?
19. How did you get around — and what was the longest you ever walked because you had no car?

**What it cost** (heading: _What it cost_)

20. What surprised you most about what things cost?
21. What did you spend money on that you'd never spend on at home?
22. When were you closest to running out of money, and what did you do?
23. What did you save on that other people didn't, and was it worth it?

**The best of it** (heading: _The best of it_)

24. What is the one day you'd relive if you could?
25. Which place did you not expect to love?
26. Tell about a time a stranger helped you.
27. What did you eat that you still think about?

**The hard parts** (heading: _The hard parts_)

28. When did you most want to go home — and what kept you there?
29. What was the loneliest stretch, and how did it end?
30. What went wrong that you can laugh about now?

**What I'd tell myself** (heading: _What I'd tell myself_)

31. If you could send one message back to yourself the night before you flew, what would it say?
32. What do you miss now, and what are you glad to be done with?

Note the last section is framed as advice **to your own past self** — that stays on the experience
side of the line while still letting people write the "lessons" paragraph they want to write.

### Prompts considered and rejected (so nobody re-adds them)

- _"How much should someone budget for the first month?"_ — asks for a recommendation.
- _"Explain the visa process step by step."_ — instruction; and it's what changes most often.
- _"Would you recommend your employer?"_ — invites naming and rating an employer.
- _"What's the best region to find work?"_ — generalises one person's season into a rule.
- _"How would you like this year to be remembered?"_ — right grammar, wrong tone.

## How we'd know it worked

Without adding analytics tooling, the story tables already let us measure:

- share of new stories that reach 150 words in their first editing session (before vs after);
- share of stories still at 0 words 24 hours after creation (abandoned blanks);
- share of submitted stories with ≥3 `##` headings.

If a prompt-usage counter is wanted later, the `story_prompts` table gets a `used_count` column;
no per-contributor tracking.

## Suggested build order

1. `i18n/prompts/story-starters.en.json` + `zh-CN.json`, with a Zod schema in `lib/validation/`
   and a unit test that every prompt has a topic, a heading, and both locales.
2. The starter card component (client) inside the Story step of `story-edit-form.tsx`, shown only
   when the body is under 50 words; "Write about this" and "Show me another"; `localStorage` hide.
3. "Start from an outline" in the card and as `/outline` in the slash menu, guarded to empty body.
4. A Playwright spec: new story → card visible → "Write about this" inserts a heading → card gone
   after 150 words.
5. Editorial review of the prompt copy against moderation-guidelines.md before merge.

## What was built (2026-09-16)

Layers 1 and 2, additive only — no migration, no change to the content model.

- `i18n/prompts/story-starters.en.json` / `.zh-CN.json` — the nine outline headings and 32 prompts
  above, as data. `lib/story/story-starters.ts` validates them with Zod at first use (a bad file
  fails tests and the build, not the card), and exposes `getStoryStarters`, `outlineMarkdown`,
  `shuffleStarters`, `seededRandom`. The Chinese copy is a first draft and still needs a native-speaker read.
- `components/story/story-starters-card.tsx` — the "Not sure where to start?" card, rendered above
  the body editor on the Story step. One question at a time; _Write about this_ appends
  `## <heading>` at the end of the body and focuses the line under it; _Show me another_ cycles a
  shuffle seeded by the story id (`seededRandom`) — deterministic so the server render and the
  browser's hydration agree, still a different order per story; _Hide_ is remembered per story in `localStorage`. The card hides itself at
  **50 words** (not 150 as first proposed — once someone has 50 words down they're writing, and the
  card's job is the first sentence). Styling is deliberately quiet: recessed surface, bordered
  (not filled) primary button, no motion, no icons.
- "Start from an outline" — offered on the card only while the body is empty, and as `/outline` in
  the slash menu. Both go through `insertOutline` in `components/story/editor/markdown-commands.ts`,
  which refuses a non-blank document, so nothing a contributor typed can be clobbered.
- Tests: `lib/story/story-starters.test.ts`, `components/story/story-starters-card.test.tsx`,
  `components/story/editor/markdown-commands.test.ts`, additions to `slash-commands.test.ts`, and
  `tests/e2e/story-starters.spec.ts` (written to the existing spec conventions; not runnable on
  this machine — see docs/architecture.md on why Playwright needs a seeded live project).

Not built: Layer 3 (the idle nudge), the `story_prompts` table, any usage counter.

## Sources

- StoryWorth question library — https://welcome.storyworth.com/questions
- StoryCorps Great Questions — https://storycorps.org/participate/great-questions/
- Day One daily prompts and prompt packs — https://dayoneapp.com/features/daily-writing-prompts/,
  https://dayoneapp.com/labs/prompt-packs/
- Reflectly guided-entry flow — https://www.reflection.app/journaling-apps/reflectly
- Nomadic Matt, improving travel writing — https://www.nomadicmatt.com/travel-blogs/improve-your-travel-writing/
- Lonely Planet, how to improve your travel writing — https://www.lonelyplanet.com/articles/how-to-improve-your-travel-writing
- Atlas Obscura contributor FAQ — https://www.atlasobscura.com/faq
- WHV-in-NZ blog structure samples — https://www.goabroad.com/articles/jobs-abroad/working-holiday-in-new-zealand,
  https://www.thebrokebackpacker.com/working-holiday-in-new-zealand/,
  https://www.roowanders.com/earning-expenses-working-holiday-nz/
- StepWrite: step-by-step guided writing vs free-form (2026) — https://arxiv.org/pdf/2508.04011
- Scaffolding and writing self-efficacy — https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11581951/
- In-repo: [editor-competitive-research.md](editor-competitive-research.md) §"Story elicitation",
  [moderation-guidelines.md](moderation-guidelines.md) lines 12–28,
  `lib/story/content-quality-checks.ts`.
