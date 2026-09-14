import { expect, type Page } from "@playwright/test";
import { STORY_STEPS, type StoryStepId } from "@/lib/story/steps";
import en from "@/messages/en.json";

/**
 * Switch the story editor to one of its in-page steps and wait until that
 * step's pane is actually showing.
 *
 * Why a spec cannot just land on `/editorial/<id>/edit` and start typing:
 * components/story/story-edit-form.tsx renders every step's pane up front
 * and hides all but the active one with Tailwind's `hidden`
 * (`display: none`), and the form always opens on "title" -- nothing passes
 * it an `initialStep`. So the content-import textarea, the CodeMirror body
 * and the photo panel are all attached to the DOM from the first paint but
 * not visible, and Playwright's actionability checks refuse to fill or
 * assert on them ("element is not visible" / "Received: hidden"). Four
 * specs failed exactly that way after 3dc6854 turned the editor into a
 * stepped flow; this is the one place they all go through now.
 *
 * The accessible name is rebuilt from the same two sources
 * components/story/story-steps.tsx renders it from -- STORY_STEPS for the
 * order and count, messages/en.json for the label and the
 * "Step {index} of {total}: {label}" template -- rather than typed out as
 * "Step 2 of 7: Your story", so renaming a step, re-wording the template
 * or adding a step cannot leave this helper clicking the wrong circle. The
 * rendered name may carry a "(current step, done)" style suffix, hence the
 * anchored prefix match. English only: the e2e runs set no locale cookie,
 * so the app renders its default.
 *
 * "review" is excluded on purpose: in the editor it is a locked circle (a
 * plain <span>, not a button) because that step is a different route,
 * reached only by the last editing step's "Review & submit →" button.
 */
export async function goToStoryStep(
  page: Page,
  id: Exclude<StoryStepId, "review">,
): Promise<void> {
  const index = STORY_STEPS.findIndex((s) => s.id === id);
  const rendered = en.editor.progress.stepOfNamed
    .replace("{index}", String(index + 1))
    .replace("{total}", String(STORY_STEPS.length))
    .replace("{label}", en.editor.stepLabels[id]);
  const name = new RegExp(`^${escapeRegExp(rendered)}`);

  const nav = page.getByRole("navigation", {
    name: en.editor.progress.navLabel,
  });
  const control = nav.getByRole("button", { name });
  await control.click();

  // Two independent proofs, because they can disagree: `aria-current` is
  // the nav saying "this is the step", the section check is the pane
  // saying "and I am no longer display:none". Both auto-wait, so this is
  // safe to call the moment the edit page's URL has settled, before React
  // has necessarily painted the form.
  await expect(control).toHaveAttribute("aria-current", "step");
  await expect(page.locator(`#story-step-${id}`)).toBeVisible();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
