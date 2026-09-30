import Link from "next/link";
import { useTranslations } from "next-intl";
import type { StoryFamilyLink, SubStoryLink } from "@/lib/story/sub-stories";

// Type-only import above: lib/story/sub-stories.ts is "server-only", and
// erased type imports never pull it into a bundle.

/**
 * "Part of: <main story>" -- the small breadcrumb at the top of a sub
 * story's public page. Titles are plain text children, never HTML.
 */
export function PartOfStory({ parent }: { parent: StoryFamilyLink | null }) {
  const t = useTranslations("story.family");
  if (!parent) return null;
  return (
    <nav aria-label={t("partOfLabel")} className="mb-3 text-sm">
      <span className="text-muted-foreground">{t("partOf")} </span>
      <Link
        href={`/stories/${parent.slug}`}
        className="font-medium text-accent underline underline-offset-2"
      >
        {parent.title}
      </Link>
    </nav>
  );
}

/** The stories filed under this main story. Renders nothing when empty. */
export function SubStoryList({ subStories }: { subStories: SubStoryLink[] }) {
  const t = useTranslations("story.family");
  if (subStories.length === 0) return null;
  return (
    <section className="mt-12" aria-labelledby="sub-stories-heading">
      <h2
        id="sub-stories-heading"
        className="text-xl font-semibold tracking-tight"
      >
        {t("subStoriesHeading")}
      </h2>
      <ul className="mt-4 space-y-3">
        {subStories.map((s) => (
          <li
            key={s.slug}
            className="rounded-xl border border-border-subtle bg-surface p-4"
          >
            <Link
              href={`/stories/${s.slug}`}
              className="font-medium text-accent underline underline-offset-2"
            >
              {s.title}
            </Link>
            {s.excerpt ? (
              <p className="mt-1 text-sm text-foreground/70">{s.excerpt}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
