---
name: Kakinotes
description: Real Working Holiday stories, photo-first, on calm warm grounds in both themes
colors:
  # "Photo-first" (2026-11-17), the app-wide palette. Keys without a prefix
  # are the light rendition; dark-* keys are the dark rendition. Both live in
  # app/globals.css (:root + [data-theme="light"], and the
  # prefers-color-scheme dark block + [data-theme="dark"]).
  accent: "#0068a3"
  accent-foreground: "#ffffff"
  tag-background: "rgba(0, 104, 163, 0.1)"
  tag-foreground: "#00527f"
  background: "#f2f0ec"
  surface: "#fbfaf8"
  surface-muted: "#e7e4df"
  foreground: "#24201c"
  muted-foreground: "#675f57"
  border-subtle: "rgba(36, 32, 28, 0.13)"
  destructive: "#b42318"
  dark-accent: "#3fb6f2"
  dark-accent-foreground: "#1c1a18"
  dark-tag-background: "rgba(63, 182, 242, 0.15)"
  dark-tag-foreground: "#8fd3f7"
  dark-background: "#1c1a18"
  dark-surface: "#262320"
  dark-surface-muted: "#302d29"
  dark-foreground: "#ece7e0"
  dark-muted-foreground: "#aaa297"
  dark-border-subtle: "rgba(236, 231, 224, 0.13)"
  dark-destructive: "#ff7d6e"
  # Personal accent presets (Settings), the source hex each preset is derived from.
  accent-preset-kingfisher: "#0068a3"
  accent-preset-cobalt: "#2747d8"
  accent-preset-grape: "#7b3fbf"
  accent-preset-rose: "#c2375b"
  accent-preset-pohutukawa: "#c8102e"
  accent-preset-ember: "#d9622b"
  accent-preset-fern: "#2f7d3b"
  # Staff analytics only (/moderation, /readiness). Never on a public route.
  chart-1: "#63bcb2"
  chart-2: "#17968b"
  chart-3: "#00706a"
  chart-4: "#004b46"
  dark-chart-1: "#24685f"
  dark-chart-2: "#2f9086"
  dark-chart-3: "#3cbdb0"
  dark-chart-4: "#7fe9df"
  # The story editor's expense donut only. Fixed order, six max.
  expense-1: "#009489"
  expense-2: "#b4761a"
  expense-3: "#8043a0"
  expense-4: "#4a8020"
  expense-5: "#1f6fd0"
  expense-6: "#a83250"
  dark-expense-1: "#2aa89b"
  dark-expense-2: "#b8842a"
  dark-expense-3: "#a06ec2"
  dark-expense-4: "#689a35"
  dark-expense-5: "#4a90dd"
  dark-expense-6: "#d55f7d"
typography:
  display:
    fontFamily: "Figtree, 'Avenir Next', Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "clamp(2.3rem, 8.5vw, 4.25rem)"
    fontWeight: 800
    lineHeight: 1.02
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Figtree, 'Avenir Next', Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Figtree, 'Avenir Next', Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    letterSpacing: "-0.025em"
  title-small:
    fontFamily: "Figtree, 'Avenir Next', Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.375
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Figtree, 'Avenir Next', Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Figtree, 'Avenir Next', Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
  caption:
    fontFamily: "Figtree, 'Avenir Next', Avenir, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
  mono:
    fontFamily: "'Geist Mono', ui-monospace, monospace"
    fontSize: "0.75rem"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  photo: "16px"
  panel: "20px"
  panel-lg: "24px"
  pill: "9999px"
spacing:
  gutter: "16px"
  gutter-sm: "24px"
  gutter-lg: "32px"
  container: "1440px"
  pin-grid-gap: "12px"
  wall-gap: "10px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "46px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 20px"
    height: "48px"
  search-pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    typography: "{typography.body}"
    rounded: "{rounded.pill}"
    padding: "6px 6px 6px 16px"
  tag:
    backgroundColor: "{colors.tag-background}"
    textColor: "{colors.tag-foreground}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  story-pin-photo:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.photo}"
  segmented-switch:
    backgroundColor: "transparent"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    padding: "2px"
  segmented-switch-thumb:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.pill}"
  place-tile:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.photo}"
    width: "132px"
  photo-wall-tile:
    backgroundColor: "{colors.surface-muted}"
    rounded: "{rounded.photo}"
  icon-button-overlay:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.pill}"
    size: "36px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    height: "44px"
---

# Design System: Kakinotes

## Overview

**Creative North Star: "The Warm Pinboard"**

Kakinotes looks like the photo apps its readers already live in: the stories' own photos lead, set
as soft rounded tiles on a calm, warm ground, with the words sitting quietly underneath. It is the
category's standard app language (the owner's pinned reference is Instagram / Pinterest), chosen
deliberately, so nothing about the frame competes with the places and people in the pictures. Real
photos from real accounts are the only imagery; there is no illustration, no texture, no themed
costume.

Comfort for long reading in both themes is the material premise. Light is a soft warm gray, never
stark white; dark is a soft warm charcoal, never pure black, with off-white ink to cut glare. Both
renditions share one warm hue family and one blue accent that only ever marks something the
reader can act on. Density is app-like: section heads at card scale rather than poster scale, story
pins two to four across, controls as pills, and one living element on the home screen (a slowly
drifting wall of story photos) rather than many small announcements.

The previous "Night Field" world (near-black slate ground, cyan accent, the dotted night-sky hero,
always-dark photographic bands) is retired and its hero has been deleted. Do not bring any of it
back, and do not swap in another costume world; film prints and crate labels were turned down for
the same reason.

This is stage 1 of an app-wide redesign. The home screen, the story pins, the place tiles, the
footer and the filter bar have had the dedicated pass. Story pages, My Stories, the editor and the
staff tools inherit the tokens below automatically but have not been redesigned yet; where this
file says nothing specific about them, it is because no rule has been decided, not because the old
one still holds.

**Key Characteristics:**

- Story photos lead; every photo is rounded on its own and nothing boxes it in.
- Warm-gray ground in light, warm charcoal in dark; one warm hue family across both.
- One blue accent, used only for actions, focus, active states and the headline's accent word.
- Figtree throughout; hierarchy by weight and tracking, not by a second face.
- Pills for controls, rounded-2xl for photos (story pins and place tiles alike).
- Shadows carry depth in light; surface fills carry it in dark.
- One slow, pausable drift on the home hero; otherwise motion is feedback, not decoration.

## Colors

One warm neutral family in two renditions plus a single blue accent; everything else is
staff-only data colour.

### Primary

- **Kingfisher** (#0068a3 light / #3fb6f2 dark): the one accent. Primary buttons (filled, white text
  in light at 5.98:1; dark-ink text in dark at 7.59:1), text links such as "See all" (5.26:1 on the
  light ground, 7.59:1 on the dark one), the hero headline's accented words, the focus ring, the
  tab bar's active pill, and check icons in the trust row. Named for the kōtare, New Zealand's sacred kingfisher: a cyan-leaning blue that keeps its
  colour in both themes (OKLCH chroma 0.123 light / 0.135 dark), where the generic link blue it
  replaced went pastel in dark. (Owner choice 2026-11-17, after raspberry and a standard link blue
  were both turned down.)
  The accent is personalisable per device in Settings: seven presets (kingfisher #0068a3,
  cobalt #2747d8, grape #7b3fbf, rose #c2375b, pohutukawa #c8102e, ember #d9622b, fern #2f7d3b)
  plus any custom colour. `lib/theme/accent.ts` keeps the hue and moves only lightness to fixed
  contrast targets, so every choice stays at or above 4.5:1. Kingfisher remains the default.
- **Kingfisher Wash** (tag-background, 10% / 15% accent) with **Kingfisher Ink** (#00527f / #8fd3f7):
  tag pills on story pins and the soft accent-tinted contribute panel on the home screen.

### Neutral

- **Warm Ground** (#f2f0ec / #1c1a18): the page itself, the solid header and tab bar
  (`--header-solid` is the ground).
- **Card Lift** (#fbfaf8 / #262320): a step lighter than the ground. Surfaces that sit on the page:
  the search pill, the footer, form fields, the quiz row, popovers, overlay icon buttons.
- **Recess** (#e7e4df / #302d29): the colour under a photo before it loads, input recesses, the
  thumb of a segmented switch. A recess, never a grouping panel.
- **Warm Ink** (#24201c / #ece7e0): all body and heading text (14.2:1 light, 14.1:1 dark).
- **Muted Ink** (#675f57 / #aaa297): secondary lines (hero sub, place · year on small pins, footer
  links). 5.5:1 on the light ground, 6.9:1 on the dark one.
- **Hairline** (border-subtle, warm ink at 13%): every border: the footer rule, the segmented
  switch outline, outline pills, inputs, the hairlines between sections.
- **Error Red** (#b42318 / #ff7d6e): `text-destructive` for errors only.

### Staff and editor data colours

- **Chart ramp** (`--chart-1` to `--chart-4`): one sequential teal ramp for staff analytics only,
  stepped per rendition so the most severe step carries the most contrast against its own ground
  (darkest in light, brightest in dark). Unchanged by this redesign; its near-surface end still
  clears 2:1 on the new surfaces (2.2:1 light, 2.4:1 dark). Never on a public route.
- **Expense categories** (`--expense-1` to `--expense-6`): the only categorical palette, for the
  story editor's expense donut. Identities, not magnitudes; assigned in fixed order, six maximum,
  the seventh and beyond fold into "Smaller categories". Every step still clears 3:1 against the
  new surfaces. The donut must keep its direct labels, legend and 2px gaps between slices.

### Named Rules

**The One Blue Rule.** The accent marks actions, focus, active states and the headline's
accent words, and nothing decorative. No second brand colour. Semantic status colours in the staff
moderation tools and the two staff/editor data palettes above are the only exceptions, because they
carry meaning rather than brand.

**The Warm Ground Rule.** Neither rendition ever uses stark white or pure black as a ground. Any new
neutral is a member of the same warm family (hue around 70-85 in OKLCH, very low chroma); a cool
gray or slate next to these reads as a leftover.

**The Two Renditions Rule.** Every colour is decided for both themes at once, as a token with two
values in the four token blocks of `app/globals.css`, never as a one-off `dark:` override.

**The One Switch Rule.** `data-theme="light"|"dark"` on `<html>` is the only theming signal. A
blocking script in `app/layout.tsx` sets it before paint, the theme toggle flips it, and the
`@custom-variant dark` declaration binds Tailwind's `dark:` to the same attribute. Never remove that
declaration or add a second signal.

## Typography

**Display Font:** Figtree (self-hosted via `next/font`, with the Avenir Next / system stack and the
PingFang SC / Microsoft YaHei / Noto Sans SC Chinese faces behind it)
**Body Font:** Figtree (same stack)
**Label/Mono Font:** Geist Mono, for code and the few tabular figures that want it (the photo
counter pill, a story's date line on the home shelf)

**Character:** A warm, rounded, very legible sans for long reading on a phone. One family carries
the whole interface; headings separate themselves by weight (800) and tight negative tracking,
labels by bold weight.

### Hierarchy

- **Display** (800, clamp(2.3rem, 8.5vw, 4.25rem), line-height 1.02, -0.03em): the home hero
  headline only. One phrase inside it takes the accent.
- **Headline** (800, 1.5rem rising to 1.875rem from `sm`, leading-tight, -0.025em): every section
  head on the home screen, one size for all of them.
- **Title** (600, 1.125rem, -0.025em): a big story pin's title.
- **Title Small** (600, 0.875rem, line-height 1.375): a small story pin's title, clamped to two
  lines.
- **Body** (400, 1rem, 1.5): running copy and inputs. 16px is also the touch floor for any field,
  so iOS never zooms. The hero sub-line steps to 1.125rem from `sm` and caps at 40ch.
- **Label** (700, 0.875rem): button text, nav links, "See all", trust points (1rem there).
- **Caption** (600, 0.75rem): wall captions, place · year lines,
  tab-bar labels (700).

### Named Rules

**The One Family Rule.** Figtree everywhere, including headings. There is no serif and no second
display face; hierarchy comes from weight and tracking.

**The Card-Scale Heading Rule.** Section heads stay at Headline size, never display size: this is an
app screen, not a poster. Display is reserved for one headline per screen.

## Layout

A centred container capped at 1440px with 16px gutters on phones, 24px from `sm`, 32px from `lg`.
Mobile first: the home hero stacks words, then the photo wall on a phone, and from `lg` becomes a
5:6 two-column split (words left, wall right, vertically centred). Section rhythm is top padding
only, roughly 32-48px on phones and 48-64px from `sm`, so sections read as one scroll rather than
separate slabs.

Story pins sit in a grid of two on phones, three from `sm`, four from `lg`, with 12px gaps (16px
from `sm`). Big pins on the home screen use the wider shelf row. The photo wall is three columns
on phones, four from `sm`, five from `xl`, with 10px gaps (12px from `sm`), at a fixed height (400,
460, 600px).

The sticky header keeps a fixed 76px bar plus the safe-area inset; anchor jumps land below it. On
phones a bottom tab bar carries navigation; the footer appears on the home pages only.

**The Edge-Bleed Rule.** A sideways row on a phone runs to the screen edges (negative margin, inner
padding) so the cut-off item at the edge is the swipe affordance; it wraps or sits in the container
from `sm` up. The place tiles do this. No "swipe" hint text.

## Elevation & Depth

A hybrid that differs by rendition on purpose. In light, fills alone barely separate a card from
the ground, so depth lives in a warm shadow ramp cast in the page's own ink at low alpha, each step
a 1px edge ring, a tight contact shadow and a wide ambient one. In dark, depth lives in the surface
fills (ground, then a lighter surface, then a lighter recess) and the shadows are near-invisible
neutral black that only keeps an edge from fusing with the ground.

### Shadow Vocabulary

- **Edge** (`--elevation-1`, Tailwind `shadow-xs`): hairline lift.
- **Resting** (`--elevation-2`, `shadow-sm`): a story pin's photo at rest, the quiz row, overlay
  icon buttons, the header.
- **Raised** (`--elevation-3`, `shadow-md`): the hero search pill; a pin's photo on hover.
- **Lifted** (`--elevation-4`, `shadow-lg`/`shadow-xl`): hover lift on legacy pill buttons and the
  home shelf cards.
- **Floating** (`--elevation-5`, `shadow-2xl`): modals and sheets.

### Named Rules

**The One Ramp Rule.** Tailwind's whole `shadow-*` scale is rebound to the themed elevation tokens,
so every shadow is correct in both renditions. Never write an arbitrary `shadow-[...]` value; it can
only be tuned for one ground. The tiny dark halo under photo dots is the one sanctioned exception,
because it sits on a photo, not on the ground.

**The Recess Rule.** The recess colour is for things set into the page (a photo's loading ground, an
input, a switch thumb), never for grouping content into a panel.

## Shapes

Soft and consistent. The base radius is 12px (`--radius` 0.75rem), with an 8 / 10 / 12 / 16px
scale derived from it. Every story photo, wall tile and pin photo is rounded at 16px (rounded-2xl)
and clips its image; a hover zoom happens inside that clip. Controls at button or chip scale are
full pills: buttons, the search field, tag pills, segmented switches, overlay icon buttons, the
wall's caption chips and the photo counter. Places are rounded photo tiles. Larger panels on the home screen
take 20px (the quiz row) or 24px (the contribute panel). Form fields take the smaller 10px step.
Borders, where present, are always the warm hairline.

**The Rounded Photo Rule.** A story photo carries its own rounded corners and is never placed inside
a bordered or filled box to get them.

**The Pill Control Rule.** A new interactive control at button or chip scale is a pill. (The filter
bar's desktop Apply / Reset buttons and form fields still use the 10px step; they predate this pass
and are not a pattern to copy for buttons.)

## Components

### Buttons

Calm and confident: solid blue or a hairline outline, nothing in between.

- **Shape:** full pill, 42-48px tall (44px minimum tap area everywhere).
- **Primary:** accent fill, accent-foreground text, bold label, 20px side padding.
- **Hover / Focus:** a slight opacity drop on hover; the app's one focus ring (3px solid accent,
  3px offset) on keyboard focus.
- **Press:** anything tappable carries the `press` utility: scale 0.97 with a small opacity dip,
  120ms in, 200ms out. Big scroll-through surfaces (story pins) add `press-hover-only` so a scroll
  that starts on them does not dip.
- **Outline:** transparent with a hairline border, foreground text; the secondary action beside a
  primary (filter sheet Reset, the phone "Filters" button).

### Chips / Tags

- **Style:** pill, blue wash background, blue ink, 0.75rem text, 2px by 8px padding. At
  most three on a big story pin.
- **State:** tags are labels, not filters; they do not toggle.

### Story Pin (signature component)

Boxless, the way Pinterest shows a pin: the photo is the card.

- **Photo:** rounded 16px, clipped, recess ground underneath while loading, resting shadow that
  deepens on hover. Big pins are 4:3; small pins are 4:5. With several published photos the frame
  swipes sideways with native scroll snap and white dots along the bottom (a window of five, edge
  dots smaller), plus white round previous / next buttons on hover from `md` up.
- **Words:** sit directly on the page ground, 4px inset. Big: up to three tags, title, a three-line
  excerpt, the attribution line. Small: a two-line title and one muted place · year line.
- **Target:** one stretched title link makes the whole pin a single tap and a single keyboard stop;
  the photos are out of the tab order.
- **Size switch:** a two-segment pill (big | small) with a sliding recess thumb, saved per device.

**The Boxless Pin Rule.** A story card has no border and no background box. The photo carries the
shape; the words share the page.

### Inputs / Fields

- **Search pill (hero):** surface fill, raised shadow, leading search icon, borderless input, an
  embedded primary pill button. Focus shows a soft accent ring on the whole pill.
- **Fields (filter bar, forms):** 44px minimum height, 10px radius, hairline border, surface fill,
  label above in medium weight.
- **Error:** `text-destructive` only, never a raw red.

### Navigation

- **Header:** sticky, always solid on the ground colour with a bottom hairline and resting shadow.
  Desktop nav links get an accent underline that grows from the left on hover and stays under the
  current page.
- **Tab bar (phones):** solid ground, top hairline; a small accent pill slides between tabs, the new
  tab's icon pops once (1 to 1.12 to 1). It slides away on task screens and while a field has focus.
- **Footer:** home pages only, on the surface colour with a top hairline; slim on phones (the
  not-advice disclaimer, one row of legal links, the copyright line), four columns from `md`.

### Photo Wall (home hero, signature component)

- Columns of real published story covers in 16px rounded tiles of varied heights (3:4, 1:1, 4:5,
  2:3), fading out at the top and bottom edges. A tap opens that story.
- **Motion:** each column drifts in alternating directions with one CSS transform (52-70s loops,
  unequal so they never sync, started part-way through). Hovering holds it still; a round pause
  button (surface at 90%, resting shadow) stops it for good, as WCAG 2.2.2 requires for anything
  moving longer than five seconds; under reduced motion it never starts and the button is not
  drawn. On first paint the tiles rise in on one short stagger.
- From `sm` a tile shows its town in a small dark caption pill.
- The wall is aria-hidden and out of the tab order; every story on it is also listed below.

### Place Tiles

- A row of small rounded photos (4:3, 16px corners, 132px wide on a phone) of the regions the
  latest stories come from, the region name underneath at 0.875rem / 600; one tap opens the
  Stories tab filtered to it. The same boxless shape as a story pin, one size down.
- Swipes sideways on a phone, bleeding to the screen edges; a 3-column grid from `sm`, 6 from `lg`.

**The Place-Is-Not-A-Story Rule.** A place is shown as a small rounded photo tile with its name underneath, never as a round, ringed photo in a row: that shape is Instagram's "story" row, and a place is not a story (owner decision 2026-11-17).

### Loading

- Placeholders are shaped skeletons that mirror the component they stand in for, tinted with 7% of
  the ink and crossed by a slow accent-tinted sheen; each route fallback is held invisible for
  140ms so a fast navigation never flashes one. A route never shows a spinner.

### Motion, app-wide

- Route changes slide in from the right going deeper, from the left going back, and crossfade
  between tabs (320ms); the header and tab bar stay put. Under reduced motion every slide becomes a
  120ms fade.

**The Pausable Motion Rule.** Anything that moves on its own for more than five seconds holds still
on hover, ships a visible pause control, and does not start at all under reduced motion. Animate
transform and opacity only.

## Do's and Don'ts

### Do:

- **Do** let real story photos lead every browsing surface; rounded at 16px, clipped, on the ground.
- **Do** keep the blue accent for actions, focus, active states and the headline's accent
  words only (The One Blue Rule).
- **Do** decide every new colour for both renditions as a two-value token (The Two Renditions Rule).
- **Do** make new controls at button or chip scale full pills with at least a 44px tap area.
- **Do** use the `shadow-*` scale (rebound to the elevation tokens) for depth in light and surface
  steps for depth in dark.
- **Do** add the `press` utility to anything tappable, and `press-hover-only` on large
  scroll-through surfaces.
- **Do** give anything that moves for more than five seconds a pause control, a hover hold and a
  reduced-motion off state (The Pausable Motion Rule).
- **Do** keep section heads at Headline size; one Display headline per screen at most.

### Don't:

- **Don't** bring back any part of Night Field: the near-black slate ground, the cyan accent, the
  dotted hero, or always-dark bands that ignore the theme.
- **Don't** use stark white or pure black as a ground, or a cool gray beside the warm neutrals
  (The Warm Ground Rule).
- **Don't** put a border or a filled box around a story card (The Boxless Pin Rule).
- **Don't** show places as round, ringed photos in a row (The Place-Is-Not-A-Story Rule).
- **Don't** add a second accent, a serif, or a second display face.
- **Don't** write an arbitrary `shadow-[...]` value on the page ground (The One Ramp Rule).
- **Don't** use the recess colour as a grouping panel (The Recess Rule).
- **Don't** add star ratings, review scores, "Book Now"/"Explore Now" CTAs, traveller-count badges
  or avatar-stack social proof (PRODUCT.md anti-patterns).
- **Don't** use emoji or Unicode glyphs as icons; icons are drawn SVG from `components/icons.tsx`.
- **Don't** invent new rules for story pages, My Stories or the editor from this file; they have not
  had their redesign pass yet.
